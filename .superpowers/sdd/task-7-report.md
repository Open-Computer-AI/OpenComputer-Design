# Task 7 Report: Web config — Inferno is the only API provider

## Status

DONE

## Summary

The web client now ships a single KnownProvider (Inferno), defaults to `mode: 'api'` with onboarding skipped and `agentId: 'inferno'`, and streams API turns through `POST /api/proxy/inferno/stream` without sending `baseUrl` or `apiKey`. CLI execution switchers are hidden; code paths that used to set `mode: 'daemon'` stay on `api`.

Followed TDD: failing KNOWN_PROVIDERS test → RED → implement config/stream/mode lock → GREEN → commit.

## Files

| Path | Action |
|------|--------|
| `apps/web/src/inferno.ts` | Created (`INFERNO_BASE_URL` duplicate; not imported from daemon) |
| `apps/web/src/providers/inferno.ts` | Created (`streamMessageInferno`) |
| `apps/web/src/state/config.ts` | Modified (`KNOWN_PROVIDERS` length 1; `DEFAULT_CONFIG`; load/merge lock) |
| `apps/web/src/utils/byokProvider.ts` | Modified (`INFERNO_AGENT_ID`; all protocols map to `'inferno'`) |
| `apps/web/src/providers/anthropic.ts` | Modified (`streamMessage` always Inferno) |
| `apps/web/src/providers/api-proxy.ts` | Modified (`omitBaseUrl` / `omitApiKey` body options) |
| `apps/web/src/App.tsx` | Modified (`handleModeChange` stays `api`) |
| `apps/web/src/components/SettingsDialog.tsx` | Modified (hide CLI/API execution switcher) |
| `apps/web/src/components/InlineModelSwitcher.tsx` | Modified (hide CLI execution switcher) |
| `apps/web/src/components/EntryShell.tsx` | Modified (CLI onboarding paths set `mode: 'api'`) |
| `apps/web/src/components/ProjectView.tsx` | Modified (API send uses `streamMessage`; no `mode: 'daemon'`) |
| `apps/web/tests/state/config.inferno.test.ts` | Created (brief KNOWN_PROVIDERS test + extra pins) |
| `apps/web/tests/providers/inferno.test.ts` | Created (proxy body / dispatcher routing) |

Did not implement Settings Inferno-key UI / Generate gate (Task 8) or media strip (Task 9).

## Implementation notes

- `INFERNO_BASE_URL = 'https://router.tryopencomputer.com/v1'` in `apps/web/src/inferno.ts`, identical to `apps/daemon/src/inferno/constants.ts`.
- `KNOWN_PROVIDERS` is the brief Inferno-only entry (`protocol: 'openai'`, `preferredModels: []`, `requiresApiKey: true`). `BYOK_PROVIDER_PRESET_SPECS` is a single Inferno preset so module load does not throw.
- `DEFAULT_CONFIG.mode = 'api'`, `onboardingCompleted = true`, `agentId = 'inferno'`, `baseUrl` / `apiProviderBaseUrl` = Inferno URL, `apiProtocol = 'openai'` (shadow).
- `API_PROTOCOL_AGENT_IDS` all map to `INFERNO_AGENT_ID = 'inferno'`.
- `streamMessageInferno` POSTs `/api/proxy/inferno/stream` with `{ model, systemPrompt, messages, ... }` and **without** `baseUrl` or `apiKey`. Missing client key does not error; the daemon store supplies the key.
- `streamMessage` always calls Inferno (no Anthropic/OpenAI/Azure/… switch).
- Mode lock: `handleModeChange` ignores the requested mode; `loadConfig` / `mergeDaemonConfig` coerce `mode: 'api'`, `agentId: 'inferno'`, `onboardingCompleted: true`. EntryShell / Settings / ProjectView no longer write `mode: 'daemon'`.
- ProjectView API branch calls `streamMessage` instead of `streamViaDaemon({ agentId: 'byok-opencode' })`.

## Commit

- `4820aa6` feat: lock the web client to the Inferno API provider

## TDD Evidence

### RED

Command (PowerShell; `pnpm` not on PATH in this shell, so invoked via corepack):

```powershell
corepack pnpm --filter @open-design/web exec vitest run -c vitest.config.ts tests/state/config.inferno.test.ts
```

Output (KNOWN_PROVIDERS still listed every BYOK vendor; default mode was `daemon`):

```
 RUN  v4.1.6 C:/Users/sanka/Documents/GitHub/OC Open Design/apps/web

 ❯ tests/state/config.inferno.test.ts (1 test | 1 failed) 19ms

 FAIL  tests/state/config.inferno.test.ts > inferno-only web config > exposes only Inferno and starts in api mode with onboarding skipped
AssertionError: expected [ { …(4) }, { …(5) }, { …(4) }, …(29) ] to have a length of 1 but got 32

- Expected
+ Received

- 1
+ 32
```

Expected FAIL: confirmed.

### GREEN

Command:

```powershell
corepack pnpm --filter @open-design/web exec vitest run -c vitest.config.ts tests/state/config.inferno.test.ts tests/providers/inferno.test.ts
```

Output after implementation:

```
 RUN  v4.1.6 C:/Users/sanka/Documents/GitHub/OC Open Design/apps/web

 ✓ tests/state/config.inferno.test.ts (2 tests) 10ms
 ✓ tests/providers/inferno.test.ts (3 tests) 53ms

 Test Files  2 passed (2)
      Tests  5 passed (5)
   Start at  18:42:02
   Duration  2.36s
```

Expected PASS: confirmed. Also ran `tests/providers/api-proxy.test.ts` (7 passed) as a regression check on `streamProxyEndpoint`. Did not run the full web suite (Task 12 rewrites tests that still assume SiliconFlow / Anthropic defaults / CLI mode).

## Self-review

- Brief Step 1 test is present (`exposes only Inferno and starts in api mode with onboarding skipped`). Import path is `../../src/state/config` because `apps/web/vitest.config.ts` only includes `tests/**/*.test.{ts,tsx}` (and `apps/AGENTS.md` forbids tests under `src/`).
- Extra coverage: `INFERNO_BASE_URL` pin; `requiresApiKey: true`; every `API_PROTOCOL_AGENT_IDS` value is `'inferno'`; Inferno POST omits `baseUrl`/`apiKey` even when a client key is present; empty client key still streams; `streamMessage` hits `/api/proxy/inferno/stream`.
- Web does not import daemon source.
- CLI execution switcher UI is gone from Settings (local CLI / API tabs) and InlineModelSwitcher (CLI vs BYOK chips). Settings execution section still shows the existing BYOK provider chips (now Inferno + custom) — Task 8 owns that UI.

## Concerns

1. Existing web tests that assume a multi-vendor `KNOWN_PROVIDERS`, `DEFAULT_CONFIG.mode === 'daemon'`, `apiProtocol === 'anthropic'`, or `agentId: null` will fail until Task 12. Out of this task’s file list except the new Inferno tests.
2. API turns now call `streamMessage` with an empty system prompt. The previous BYOK path used `streamViaDaemon` so the daemon composed skills/tools. Inferno proxy only forwards the client `systemPrompt`. Prompt composition for Inferno is not in this task.
3. Inferno HTTP stream does not create `/api/runs` IDs, so reconnect, cancel-origin, and strategy-task successor wiring on the daemon run path do not apply to API turns.
4. `handleAgentChange` can still persist a non-`inferno` `agentId` in memory; the next `loadConfig` / `mergeDaemonConfig` coerces it back.
5. `ratchetOnboardingCompleted` in `config.ts` is now unused after merge always sets `onboardingCompleted: true`. Left in place to avoid an unrelated delete.
6. Settings still lists a Custom provider chip beside Inferno (`byokProviderPresets` appends custom). Task 8 should decide whether that stays.

## Review fix

Fixed Important findings: Inferno-only provider UI (no protocol-tab chips / custom BYOK), pinned Inferno `baseUrl` + `apiProtocol` on load/merge/save, models/connection-test/memory extract no longer send client `baseUrl`/`apiKey`, Inferno chat passes `composeInfernoSystemPrompt` instead of `''`, DesignSystemFlow and useConversationChat stream via `/api/proxy/inferno/stream`.

### Commit

- `fix: Inferno-only provider UI and pin base URL`

### Tests

Command:

```powershell
corepack pnpm --filter @open-design/web exec vitest run -c vitest.config.ts tests/state/config.inferno.test.ts tests/providers/inferno.test.ts
```

Output:

```
 RUN  v4.1.6 C:/Users/sanka/Documents/GitHub/OC Open Design/apps/web

 ✓ tests/state/config.inferno.test.ts (3 tests) 14ms
 ✓ tests/providers/inferno.test.ts (5 tests) 63ms

 Test Files  2 passed (2)
      Tests  8 passed (8)
   Start at  19:13:02
   Duration  2.49s
```

Expected PASS: confirmed. Assertions cover `KNOWN_PROVIDERS` length 1 and Inferno stream omitting `baseUrl`. Did not implement Task 8 Generate gate UI or Task 9 media strip. Did not re-enable other providers.
