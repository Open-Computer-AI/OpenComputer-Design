# Task 10 Report: Rebrand CLI, data dir, window title, icon

## Status

DONE

## Summary

CLI bin is `ocd` (shim `apps/daemon/bin/ocd.mjs` re-exports `od.mjs`). Unset data-root default is `~/.opencomputer-design`. Env precedence is `OCD_DATA_DIR` then `OD_DATA_DIR`. Packaged window title and `@open-design/release` productName are `OpenComputer Design`. Packaged/app icons are an OC monogram. MCP help advertises `ocd mcp`. `@open-design/*` package names and Apache-2.0 are unchanged. README was not rewritten.

Followed TDD: failing `appConfigDir` test → RED → implement → GREEN → commit.

## Files

| Path | Action |
|------|--------|
| `package.json` | Modified (`bin.ocd` → `od.mjs`) |
| `apps/daemon/package.json` | Modified (`bin.ocd` → `od.mjs`) |
| `apps/daemon/bin/ocd.mjs` | Created (re-exports `od.mjs`) |
| `apps/daemon/src/app-config.ts` | Modified (`appConfigDir` precedence + home default) |
| `apps/daemon/src/daemon-paths.ts` | Modified (`resolveDataDir` default + `configuredDataDirRaw`) |
| `apps/daemon/src/server.ts` | Modified (`OCD_DATA_DIR \|\| OD_DATA_DIR`; spawn env pins both) |
| `apps/daemon/src/runtimes/detection.ts` | Modified (Inferno key uses same data-root rule) |
| `apps/daemon/src/sandbox-mode.ts` | Modified (accepts `OCD_DATA_DIR`) |
| `apps/daemon/src/media/config.ts` | Modified (data root via `appConfigDir`) |
| `apps/daemon/src/db.ts` | Modified (unset fallback is home data dir) |
| `apps/daemon/src/plugins/registry.ts` | Modified (`defaultRegistryRoots` same rule) |
| `apps/daemon/src/runtimes/local-profiles.ts` | Modified (sandbox profile lookup accepts `OCD_DATA_DIR`) |
| `apps/daemon/src/cli.ts` | Modified (user-facing `ocd mcp` help) |
| `apps/daemon/src/mcp.ts` | Modified (`ocd mcp` error text) |
| `apps/daemon/src/mcp-install-info.ts` | Modified (pins `OCD_DATA_DIR` + `OD_DATA_DIR`) |
| `apps/packaged/src/window-title.ts` | Modified (`DEFAULT_WINDOW_TITLE`) |
| `packages/release/src/index.ts` | Modified (`PRODUCT_NAME = "OpenComputer Design"`) |
| `AGENTS.md` | Modified (data-dir contract) |
| `apps/AGENTS.md` | Modified (`ocd` bin mention) |
| `scripts/guard.ts` | Modified (allow `ocd.mjs`) |
| `apps/web/public/app-icon.png` / `.svg` | Modified (OC monogram) |
| `apps/web/public/brand-icon.svg` | Modified |
| `apps/web/public/logo-mark.svg` / `logo.svg` / `logo.png` | Modified |
| `tools/pack/resources/{mac,win,linux}/icon.*` | Modified |
| `apps/daemon/tests/app-config-dir.test.ts` | Created |
| Related daemon/pack/release tests | Modified |

## Implementation notes

- `appConfigDir` uses `path.resolve` on absolute overrides so the brief's `path.resolve('/tmp/ocd')` expectation holds on Windows.
- Daemon subprocess env sets both `OCD_DATA_DIR` and `OD_DATA_DIR` to `RUNTIME_DATA_DIR`.
- `tools/pack` `PRODUCT_NAME` and `sidecar-proto` uninstall registry strings remain `"Open Design"` so installer/exe/registry paths do not change in this task.
- README / i18n `od mcp` copy is left for Task 11.

## Commit

- `cd8de82` feat: rebrand CLI to ocd and default data dir to ~/.opencomputer-design

## TDD Evidence

### RED

Command (PowerShell; `pnpm` not on PATH in this shell, so invoked via corepack):

```powershell
corepack pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/app-config-dir.test.ts
```

Output (still defaulted to `<projectRoot>/.od`, ignored `OCD_DATA_DIR`):

```
 RUN  v4.1.6 C:/Users/sanka/Documents/GitHub/OC Open Design/apps/daemon

 ❯ tests/app-config-dir.test.ts (1 test | 1 failed) 30ms

 FAIL  tests/app-config-dir.test.ts > appConfigDir > prefers OCD_DATA_DIR then OD_DATA_DIR then ~/.opencomputer-design
AssertionError: expected '\proj\.od' to be 'C:\tmp\ocd' // Object.is equality

Expected: "C:\tmp\ocd"
Received: "\proj\.od"
```

Expected FAIL: confirmed.

### GREEN

Command:

```powershell
corepack pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/app-config-dir.test.ts
```

Output:

```
 RUN  v4.1.6 C:/Users/sanka/Documents/GitHub/OC Open Design/apps/daemon

 ✓ tests/app-config-dir.test.ts (1 test) 10ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
```

Related GREEN (same daemon config plus identity packages):

```
corepack pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/app-config-dir.test.ts tests/resolve-data-dir.test.ts tests/inferno-registry.test.ts tests/mcp-install-info.test.ts tests/media/config.test.ts
```

- daemon: app-config-dir, resolve-data-dir, inferno-registry, mcp-install-info, media/config — passed
- `@open-design/release` tests — 6 passed
- packaged `window-title.test.ts` — 4 passed (after `pnpm --filter @open-design/release run build`)
- tools-pack `win-identity` / `mac-identity` — 17 passed

## Concerns

- Installer/exe filenames still use tools/pack `PRODUCT_NAME = "Open Design"`; only releaseInstallIdentity / window title changed.
- Windows uninstall registry key still uses sidecar-proto `OPEN_DESIGN_PRODUCT_NAME`.
- `sandbox-runtime-bootstrap` “sandbox-wrapper” assertion still fails from Task 2 (local CLI profiles disabled); not caused by this rebrand.
- e2e / README / Settings MCP snippets still say `od mcp` (Task 11).
- Full daemon vitest suite was not run; media tests that still `delete process.env.OD_DATA_DIR` without writing to the home default may fail if they expect `projectRoot/.od`.

## Review fixes (post Task 10 review)

Must-fix items from review:

1. Home logo test now asserts the OC monogram (`cx="27" cy="41"`, `M63.2 51.3`) and treats `M41 0.726562` as retired.
2. e2e packaged-win-identity display names match pack `win-identity`: `OpenComputer Design` (and Beta/Preview/Prerelease / ad-hoc `OpenComputer Design ${namespace}`).
3. Daemon vitest `setup.ts` pins `OCD_DATA_DIR` to the same isolated dir as `OD_DATA_DIR`. Suites that delete or assign `OD_DATA_DIR` also delete/assign `OCD_DATA_DIR`. `plugins-apply.test.ts` expected root uses `OCD_DATA_DIR || OD_DATA_DIR || ~/.opencomputer-design`.
4. Settings MCP help (`use-everywhere/sections.ts`, i18n locales) uses `ocd mcp`, `"command": "ocd"`, `OCD_DATA_DIR` / `~/.opencomputer-design`. No `od mcp` or `~/.open-design` in those strings.
5. Pack `PRODUCT_NAME` is `OpenComputer Design` (win/mac/linux). Stable App Paths key `OpenComputer Design.exe` matches `exeName`. Payload copies `${PRODUCT_NAME}.exe`. Uninstall registry prefix remains sidecar-proto `Open Design`.

### Covering tests (GREEN)

```
corepack pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/app-config-dir.test.ts tests/plugins-apply.test.ts
```
2 files, 9 passed (app-config-dir 1, plugins-apply 8).

```
corepack pnpm --filter @open-design/web exec vitest run -c vitest.config.ts tests/components/home-logo-assets.test.ts
```
plus use-everywhere agent-guide and copy-guide: 3 files, 17 passed (home-logo-assets 3).

```
corepack pnpm --filter @open-design/tools-pack exec vitest run tests/win-identity.test.ts
```
13 passed.

```
corepack pnpm --filter @open-design/e2e exec vitest run -c vitest.config.ts tests/packaged-win-identity.test.ts
```
4 passed.

Full daemon vitest suite was not re-run in this fix pass.

### Commit

- `fix: align tests and MCP help with ocd rebrand`
