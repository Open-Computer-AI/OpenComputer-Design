# OpenComputer Design (Inferno-only fork)

Date: 2026-09-12  
Status: approved for spec review (not yet implemented)  
Approach: C — Inferno as the only registered engine

This spec forks current `nexu-io/open-design` into a private Open Computer distribution. The product is **OpenComputer Design**. The only model backend is **Inferno**. Users paste an API key in Settings. The app does not spawn Claude Code, Codex, or any other coding-agent CLI in v1.

## Goal

Ship a local-first design studio that looks and reads as OpenComputer Design, talks only to Inferno at `https://router.tryopencomputer.com/v1`, and does not offer Open Design Cloud, AMR, BYOK presets, remote image/video APIs, or third-party CLI runtimes.

## Non-goals (v1)

- Spawning an Open Computer / Hermes / any other CLI agent
- A daemon-side Read / Write / Edit / Bash tool loop
- Automatic migration of `~/.open-design`
- Nuclear rename of npm packages (`@open-design/*`) or most internal `OD_*` identifiers
- Baking an Inferno API key into the client or git
- Official Linux installer (run from source, same as upstream)
- Shipping the Open Design marketing website
- Public npm publish under a new name

## Source and repo

| Item | Decision |
|---|---|
| Starting tree | Fresh clone of **current** `https://github.com/nexu-io/open-design` (not the June `Open-Computer-AI/open-design` snapshot) |
| Destination | New **private** GitHub repo `Open-Computer-AI/OpenComputer-Design` |
| Workspace | `C:\Users\sanka\Documents\GitHub\OC Open Design` |
| License | Keep Apache-2.0. Keep nexu-io / original copyright notices. README may say this is a fork of nexu-io/open-design. |
| Existing June copy | Leave `Open-Computer-AI/open-design` untouched |

Do not force-push over the June repo. Do not use `SankalpKrish` as the repo owner.

## Product identity

| Surface | Value |
|---|---|
| Product name | OpenComputer Design |
| Window title / about | OpenComputer Design |
| CLI | `ocd` |
| Config / data dir | `~/.opencomputer-design` (or the platform app-data equivalent upstream already uses, with this product name) |
| Data-dir env | `OCD_DATA_DIR` documented. If unset, honor `OD_DATA_DIR`. Default is the new dir, not `~/.open-design`. |
| Website leftovers | `https://tryopencomputer.com` |
| Icon | OC monogram (June-copy idea). Swap later if an official mark is provided. |
| Do not use | `od` (collides with macOS `/usr/bin/od`), `oc` (OpenComputer platform CLI) |

No automatic import of existing Open Design user data.

## Architecture

Keep upstream’s three-process shape: **web UI → local daemon → files + preview**. No new cloud control plane.

Replace the runtime registry with one synthetic engine, `inferno`:

- Not a PATH binary. Always listed. **Ready** only after a saved Inferno key plus a successful model catalog fetch.
- The daemon is the only process that calls Inferno. The browser never sends the key to `router.tryopencomputer.com`.
- Chat uses the **text_artifact** execution profile (upstream’s BYOK/API / plain-stream handoff). The model returns `<artifact>` blocks; the daemon writes project files; Studio preview is unchanged.
- v1 does **not** reimplement filesystem tools. Iteration is another brief, not in-place file patches by a spawned CLI.

```text
UI (OpenComputer Design)
        │  HTTP + SSE
        ▼
Daemon (ocd)
        │  no key → refuse Generate
        │  GET  https://router.tryopencomputer.com/v1/models
        │  POST chat/completions | messages | Gemini  (by model)
        ▼
Inferno
        │  streamed text
        ▼
text_artifact: parse <artifact> → project files → preview
```

### Registry

- `SHIPPED_AGENT_DEFS = [infernoAgentDef]` only.
- Other `runtimes/defs/*.ts` files may remain on disk but **must not be imported** into the registry.
- Disable merge of user-defined local CLI profiles so Claude/Codex cannot be added back through config.
- `GET /api/agents` returns Inferno only.
- `/api/chat` always uses `agentId: "inferno"`.

### Execution profile

Use upstream `text_artifact` (`streamFormat` equivalent to plain / BYOK-API). At end of turn, reuse the existing `<artifact>` extractor (html/css/svg/md, slugged identifiers, collision suffixes).

Do not spawn `opencode` / `byok-opencode` as a wrapper around Inferno.

## Inferno connection

| Field | Value |
|---|---|
| Display name | Inferno |
| Base URL | `https://router.tryopencomputer.com/v1` (hardcoded, not user-editable) |
| Auth | `Authorization: Bearer <key>` |
| Models | `GET /v1/models` after the key is saved |
| TLS | HTTPS only. Do not ship `http://`. |

Pin outbound provider fetches to hostname `router.tryopencomputer.com`. A tampered config must not be able to point the proxy at an arbitrary URL. Keep upstream SSRF guards; the pin is additional.

### Settings

One Inferno card. No OpenAI, Anthropic, Gemini, Azure, Ollama, LM Studio, vLLM, Atlas, SenseAudio, OpenDesign Cloud, AMR, or “custom endpoint” UI.

- Paste key → Save. Password-style field with show/hide.
- Store only in the daemon credential store under the OpenComputer Design data dir. Same encryption/redaction rules as upstream BYOK keys.
- Never write the key to project files, logs, git, or the renderer bundle.
- Clear key → not ready; Generate stays blocked.
- Base URL may appear as read-only helper text.

Do not put a key in `.env.example`, Docker compose, or Helm values.

### Test connection and model picker

Save (or Test) calls `GET /v1/models` with the key.

| Result | Behavior |
|---|---|
| 200 with `data` | Store catalog, mark ready, fill picker |
| 200 empty `data` | Ready flag false for Generate; show “no models” |
| 401 / 403 | “Inferno rejected this key.” |
| Network / TLS | “Cannot reach Inferno at router.tryopencomputer.com.” |

Picker rules:

- Options come only from that catalog (id + optional display name / `owned_by`).
- Remember last-used as `agentModels.inferno`.
- If the remembered id disappears, fall back to the first catalog entry and notify once.
- No free-text custom model id.
- Refresh catalog when Settings opens and when a new key is saved.

### Protocol router (daemon only)

No Settings toggle. For each chat turn:

1. If catalog metadata (`owned_by` or equivalent) maps the model to Anthropic or Google, use that dialect.
2. Else id heuristics:
   - `claude*`, `anthropic*`, `sonnet`, `opus`, `haiku` → Anthropic `POST /v1/messages` on the pinned host
   - `gemini*` → Gemini using the **same path shape as upstream’s existing Google BYOK proxy**, still on `router.tryopencomputer.com` (do not invent a new Gemini URL)
   - everything else → OpenAI `POST /v1/chat/completions`
3. If Inferno returns a protocol-shape error, retry **once** on the next dialect and remember the winner for that model id for the rest of the process.

Map the stream onto the existing chat SSE (text deltas). Then run the text_artifact extractor.

### Chat errors

Typed daemon errors (names are normative for this spec):

- `INFERNO_KEY_REQUIRED` — no key saved
- `INFERNO_NOT_READY` — key present but catalog fetch failed or empty
- `INFERNO_KEY_REJECTED` — 401/403 from Inferno
- `INFERNO_RATE_LIMITED` — 429
- `INFERNO_UNAVAILABLE` — timeout / 5xx / network
- `INFERNO_MODEL_UNREACHABLE` — both dialects failed for this model

UI copy must not suggest installing Claude Code, Codex, or another provider.

## First-run and Generate gate

Skip all upstream onboarding: Cloud/AMR, Fellow, Discord, GitHub star, connect-CLI wizards, product tour, What’s New that advertises AMR/DeepSeek/Cloud.

The app opens on **Home**.

**Ready** if and only if:

1. A non-empty API key is saved
2. Last `GET /v1/models` succeeded this session (or on save)
3. The picker has at least one model id (selected or defaulted)

If not ready: Home / Studio / plugins still browse. **Generate / Send / Try it** that would call the model are disabled. Same banner/modal everywhere: **Add your Inferno API key in Settings to generate.** Button: **Open Settings**. Closing without a key returns to Home; no wizard loop.

`POST /api/chat` rejects with `INFERNO_KEY_REQUIRED` or `INFERNO_NOT_READY` even if the UI is bypassed.

After a successful Save: dismiss the banner, fill models, **do not** auto-start a generation.

Defaults:

- `agentId`: `inferno`
- Home tab: upstream Home / prototype brief composer
- Working directory: default project root under the new data dir
- Design system: upstream default or none (do not invent a new brand system in v1)

Same gate for desktop, `pnpm tools-dev run web`, and Docker. Docker may still need an upstream-style daemon API token for non-loopback access; that token is **not** the Inferno key.

## Rebrand depth

**Rename / rewrite (user-facing):**

- App strings, Settings, empty states, errors, about screen
- Electron `productName` / appId display, installer names
- CLI help (`ocd --help`), MCP server display name **OpenComputer Design**
- Root README, QUICKSTART, operator-visible `deploy/` copy
- English docs; other locales: replace product/provider/marketing strings (no leftover Open Design Cloud CTAs). Do not polish every translation.

**Keep unchanged (mergeability + license):**

- npm package names `@open-design/*`
- Most source identifiers and import paths
- Apache-2.0 LICENSE and copyright
- Internal `OD_*` except documented `OCD_DATA_DIR` alias

MCP: still ship `ocd mcp install <agent>` so **external** tools can read local projects. That does not re-enable those agents **inside** this app.

## Keep vs strip

### Keep

- Skills, design templates that are not remote-media, design systems, plugins
- HyperFrames (local HTML → MP4) and HyperFrames prompt templates
- Studio: prototype, deck, document, mobile, HyperFrame
- Export HTML / PDF / PPTX / ZIP / Markdown for those types
- Preview sandbox, folder import, open-in-editor host apps (Cursor/VS Code as **editors**, not runtimes)
- MCP server for project file access

### Hide / do not register

**CLI runtimes:** claude, codex, cursor-agent, amr, hermes, opencode, byok-opencode, deepseek, deepseek-harness, copilot, grok-build, kimi, pi, qwen, qoder, amp, devin, antigravity, aider, trae-cli, kiro, kilo, vibe, reasonix, codebuddy, mimo, atomcode, plus local profiles.

**BYOK / cloud presets:** OpenAI, Anthropic, Azure, Google, Ollama, LM Studio, vLLM, Atlas, SenseAudio, OpenDesign Cloud, AMR billing/upgrade, custom provider URLs.

**Remote media:** GPT Image, Seedream, Seedance, Veo, Sora, Kling, Suno, Lyria, ImageRouter, xAI image/video routes, custom image API. Hide Home/Studio **Image** and **Video** types that need a remote model. Drop prompt-templates whose target is a remote image/video model.

**Marketing / telemetry:** PostHog, GA, Discord, GitHub star pill, Fellow, open-design.ai CTAs, `install-dsh` and “download Claude Code” / agent-setup wizards.

**Marketing site:** do not ship the Open Design landing app. README points at tryopencomputer.com.

### String sweep (required)

Fail review if user-facing surfaces still contain:

- Open Design / OpenDesign / open-design.ai / OpenDesign Cloud / AMR / Fellow (except license, copyright, and one README “forked from nexu-io/open-design” line)
- Discord invite, GitHub star pill, nexu social
- Provider names as **choices** (OpenAI, Anthropic, Gemini, Azure, Ollama, Claude Code, Codex, …)

Allowed exceptions: Apache notices; protocol names in daemon **debug** logs; “forked from” attribution.

Sweep: `apps/web`, daemon user-facing errors, packaged/Electron, `ocd` help, README/QUICKSTART, `docs/` (en + i18n product strings), operator-visible `deploy/` copy.

## Testing

- CI must **not** call real Inferno. Mock `GET /v1/models` and chat streams. No API key in CI.
- Registry length is 1; id is `inferno`.
- `/api/agents` has no `claude` / `codex` / `amr` / `opencode`.
- Chat without key → `INFERNO_KEY_REQUIRED`.
- Outbound Inferno URL host is `router.tryopencomputer.com` over HTTPS.
- Skip or rewrite e2e that spawn a CLI.
- String sweep can be a grep test over UI copy / README for banned product strings.

## Error handling

No “try another provider” and no “install Codex” recovery. Inferno failures stay Inferno failures (table in Inferno / first-run sections).

## Rollout sequence (implementation, not this spec’s job to execute)

1. Clone current upstream into the workspace; create private `Open-Computer-AI/OpenComputer-Design`.
2. Inferno engine + credential store + protocol router + text_artifact chat path.
3. Empty the runtime registry; disable local profiles; hide remote media types.
4. Generate gate + skip onboarding.
5. Rebrand (`ocd`, data dir, strings, icon) + string sweep.
6. Tests with mocks; no real key in git.

A test key may be provided in chat for manual verification only. It still must not be committed.

## Risks

- **Weaker iteration than CLI mode.** text_artifact cannot patch files with tools. Accepted for v1.
- **Protocol heuristics may mis-route a model.** One retry + per-model memory; if both fail, `INFERNO_MODEL_UNREACHABLE`.
- **Upstream drift.** Unused def files left unimported will conflict on future pulls. Acceptable vs a full delete in v1.
- **Key leakage.** Renderer and git are out of the key path; daemon store only.
