# Task 6 Report: Synthetic Inferno runtime; empty CLI catalog

## Status

DONE_WITH_CONCERNS

## Summary

`/api/agents` / `SHIPPED_AGENT_DEFS` / `AGENT_DEFS` now expose only the synthetic Inferno runtime. Claude/Codex/AMR/OpenCode and local CLI profiles cannot be selected. Detection marks Inferno `available: true` without PATH/version probes and sets `authStatus` from the daemon Inferno key store (`ok` if a key is present, `missing` otherwise). `buildArgs` throws so a `/api/chat` CLI spawn fails closed; the web path is `/api/proxy/inferno/stream`.

Followed TDD: failing registry test → RED → implement def/types/registry/detection → GREEN → commit.

## Files

| Path | Action |
|------|--------|
| `apps/daemon/src/runtimes/defs/inferno.ts` | Created |
| `apps/daemon/src/runtimes/types.ts` | Modified (`synthetic?: boolean`) |
| `apps/daemon/src/runtimes/registry.ts` | Modified (`SHIPPED_AGENT_DEFS = [infernoAgentDef]`; `readLocalAgentProfileDefs` → `[]`) |
| `apps/daemon/src/runtimes/detection.ts` | Modified (synthetic short-circuit; Inferno credential auth) |
| `apps/daemon/tests/inferno-registry.test.ts` | Created |

## Implementation notes

- `infernoAgentDef` matches the brief verbatim: `id: 'inferno'`, `name: 'Inferno'`, `bin: 'inferno-synthetic'`, `synthetic: true`, `streamFormat: 'plain'`, `supportsCustomModel: false`, `fallbackModels: []`, `buildArgs` throws `Inferno is HTTP-only; do not spawn a CLI`.
- `RuntimeAgentDef.synthetic?: boolean` is optional so existing CLI defs are unchanged.
- `SHIPPED_AGENT_DEFS = [infernoAgentDef]`. `getAgentDef('claude'|'codex'|'amr'|'opencode') === null`. `AGENT_DEFS.length === 1`.
- `readLocalAgentProfileDefs` keeps its call signature and always returns `[]` (local `agents.local.json` is not merged).
- Detection: if `def.synthetic`, skip `resolveAgentLaunch` / `--version` / `--help` / model/auth CLI probes. Do not call `buildArgs`. `authStatus` is `ok` when `readInfernoApiKey(OD_DATA_DIR)` returns a key, else `missing`.
- `ensureDetectedRuntimeVersions` / `ensureDetectedRuntimeCapabilities` return `null` for synthetic defs so the CLI spawn path cannot PATH-probe `inferno-synthetic`.

## Commit

- `ac1bb28` feat: register Inferno as the only agent runtime

## TDD Evidence

### RED

Command (PowerShell; `pnpm` not on PATH in this shell, so invoked via corepack):

```powershell
corepack pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/inferno-registry.test.ts
```

Output (registry still shipped every CLI; `getAgentDef('inferno')` was null):

```
 RUN  v4.1.6 C:/Users/sanka/Documents/GitHub/OC Open Design/apps/daemon

 ❯ tests/inferno-registry.test.ts (4 tests | 4 failed) 36ms
     × ships only inferno 20ms
     × does not merge local CLI profiles 3ms
     × is available without PATH or version probes and does not call buildArgs 2ms
     × sets authStatus from Inferno credentials 7ms

 FAIL  tests/inferno-registry.test.ts > inferno-only registry > ships only inferno
AssertionError: expected [ 'amr', 'claude', 'codex', …(24) ] to deeply equal [ 'inferno' ]
```

Expected FAIL: confirmed.

### GREEN

Command:

```powershell
corepack pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/inferno-registry.test.ts
```

Output after implementation (brief tests + spawn throw + detection auth):

```
 RUN  v4.1.6 C:/Users/sanka/Documents/GitHub/OC Open Design/apps/daemon

 ✓ tests/inferno-registry.test.ts (5 tests) 24ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  18:16:42
   Duration  1.12s (transform 531ms, setup 70ms, import 623ms, tests 24ms, environment 0ms)
```

Expected PASS: confirmed. Did not run the full daemon suite (Task 12 rewrites tests that still assume `claude` in the registry).

## Self-review

- Brief Step 1 tests are present verbatim (`ships only inferno`, `does not merge local CLI profiles`).
- Extra coverage: `buildArgs` throw message; detection `available: true` without calling `buildArgs`; `authStatus` flips `missing` → `ok` after `saveInfernoApiKey` under a temp `OD_DATA_DIR` (`os.tmpdir()`, not `$HOME`).
- Synthetic probe returns before PATH/version; `stripFns` destructures `buildArgs` without invoking it.
- Chat `/api/chat` CLI path still calls `def.buildArgs(...)` and will throw for Inferno (fail closed). Web uses `/api/proxy/inferno/stream`.

## Concerns

1. Existing daemon tests that assume `claude` / `codex` / `amr` in `AGENT_DEFS` will fail until Task 12. `apps/daemon/tests/runtimes/helpers/test-helpers.ts` `requireAgent('amp'|'claude'|...)` throws at import. Out of this task’s file list.
2. `/api/agents` Inferno entry has `models: []` (`fallbackModels: []`). Live Inferno models remain on `GET /api/inferno/status`, not the CLI catalog.
3. `synthetic` is not on `packages/contracts` `AgentInfo`; it still serializes on the daemon `/api/agents` payload as an extra field.
4. Local `~/.open-design/agents.local.json` profiles are ignored by design.
5. Detection auth is key-presence only (not models-fetch `ready`). A stored key with a failed models fetch is `authStatus: 'ok'` here and `ready: false` on `/api/inferno/status`.

## Post-review fix: Inferno key path when OD_DATA_DIR unset

### Finding

`detectSyntheticAgent` only read the Inferno key when `process.env.OD_DATA_DIR` was set. Daemon storage uses `resolveDataDir` / `RUNTIME_DATA_DIR` / `appConfigDir`, which default to `<projectRoot>/.od` when env is unset. A saved key could work for Inferno HTTP while `/api/agents` reported `authStatus: 'missing'`.

### Fix

`detectSyntheticAgent` now resolves the data dir via `resolveDataDir(process.env.OD_DATA_DIR, resolveProjectRootFromNestedModule(...))` — the same helper as `server.ts` `RUNTIME_DATA_DIR`. Registry membership unchanged; no CLI spawns.

### Regression

`tests/inferno-registry.test.ts`: `reads Inferno key from default .od when OD_DATA_DIR is unset` — temp project root (not home), key under `<temp>/.od`, env deleted, project-root override for isolation.

### Test results

Command:

```powershell
corepack pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/inferno-registry.test.ts
```

Output:

```
 RUN  v4.1.6 C:/Users/sanka/Documents/GitHub/OC Open Design/apps/daemon

 ✓ tests/inferno-registry.test.ts (6 tests) 30ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  18:23:29
   Duration  1.09s (transform 527ms, setup 67ms, import 626ms, tests 30ms, environment 0ms)
```

Expected PASS: confirmed.
