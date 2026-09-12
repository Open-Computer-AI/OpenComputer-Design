# Task 11 Report: String sweep, analytics off, README

## Status

DONE

## Summary

Root README and QUICKSTART are OpenComputer Design. Commands use `ocd`. Inferno key lives in Settings. Website is tryopencomputer.com. One fork line: `Fork of nexu-io/open-design (Apache-2.0).` No Discord, star pill, OpenDesign Cloud, AMR, or “Claude Design alternative” positioning in those docs.

Sweep test greps README + `apps/web/src/components` for `open-design.ai` and `discord.gg`. `telemetry.metrics` defaults **false**. PostHog/GA have no HTML script inject; `posthog-js` only inits after `/api/analytics/config` reports a key **and** consent (`metrics === true`). Settings CLI tab examples use `ocd media generate` / `ocd --port`. `@open-design/*` package names unchanged.

Followed TDD: failing README sweep test → RED → rewrite + strip → GREEN → commit.

## Files

| Path | Action |
|------|--------|
| `apps/daemon/tests/inferno-string-sweep.test.ts` | Created |
| `README.md` | Rewritten |
| `QUICKSTART.md` | Rewritten |
| `docs/i18n/README.*.md` | Replaced with English-pointer stubs |
| `docs/i18n/QUICKSTART.*.md` | Replaced with English-pointer stubs |
| `CONTRIBUTING.md`, `docs/i18n/CONTRIBUTING.*.md` | Discord invite removed / retargeted |
| `deploy/README.md` | Operator copy: Inferno-only, no AMR URL |
| `apps/daemon/src/app-config.ts` | `telemetry.metrics` default false |
| `apps/web/src/state/config.ts` | DEFAULT_CONFIG + merge default-off |
| `apps/web/app/layout.tsx` | Title OpenComputer Design |
| `apps/web/src/components/*` | Banned URLs stripped |
| `apps/web/src/components/use-everywhere/sections.ts` | CLI examples `ocd` |
| `apps/web/src/i18n/locales/*.ts` | CLI tab `ocd` |
| Related tests | Updated |

## Implementation notes

- Sweep test resolves repo root via `path.join(fileURLToPath(import.meta.url), '../../..')`.
- `mergeDaemonConfig` no longer mints an installationId or flips metrics on for a fresh install. Explicit `metrics: true` still mints an id.
- PostHog disable is cheap: default consent off + existing keyless no-op. There is no gtag/GA script in `apps/web/app/layout.tsx`.
- i18n README/QUICKSTART stubs point at English docs so leftover Cloud/Discord CTAs are gone without polishing every translation.

## Commit

- `f8c63d8` docs: rebrand README and strip Open Design marketing

## TDD Evidence

### RED

Command:

```powershell
corepack pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/inferno-string-sweep.test.ts
```

Output (old marketing README; components still had `open-design.ai` / `discord.gg`):

```
 RUN  v4.1.6 C:/Users/sanka/Documents/GitHub/OC Open Design/apps/daemon

 ❯ tests/inferno-string-sweep.test.ts (2 tests | 2 failed) 323ms

 FAIL  tests/inferno-string-sweep.test.ts > string sweep > README does not advertise Open Design Cloud or Discord
AssertionError: expected '<h1 align="center">OpenDesign: The op…' to match /OpenComputer Design/

 FAIL  tests/inferno-string-sweep.test.ts > string sweep > web components do not advertise open-design.ai or Discord invites
AssertionError: expected [ …(11) ] to deeply equal []
```

Expected FAIL: confirmed.

### GREEN

Command:

```powershell
corepack pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/inferno-string-sweep.test.ts
```

Output:

```
 RUN  v4.1.6 C:/Users/sanka/Documents/GitHub/OC Open Design/apps/daemon

 ✓ tests/inferno-string-sweep.test.ts (2 tests) 136ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
```

Related GREEN:

```
corepack pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/analytics-env.test.ts
```

6 passed.

Telemetry default tests in `apps/web/tests/state/config.test.ts` (`defaults reporting off…`, opt-out, mint-when-metrics-true): passed.

```
corepack pnpm --filter @open-design/web exec vitest run -c vitest.config.ts tests/components/enterprise-url.test.ts tests/components/sketch-model.test.ts tests/components/use-everywhere-agent-guide.test.ts tests/components/use-everywhere-copy-guide.test.tsx tests/i18n/locales.test.ts tests/state/force-light-theme.test.ts
```

Passed (enterprise-url 3, sketch-model 6, agent-guide 11, copy-guide 3, locales 20, force-light-theme 9).

## Concerns

- Broader UI i18n still says “OpenDesign” in many non-CLI strings; this task enforced README + component URL sweep, not a nuclear product-name rewrite.
- Daemon routes/prompts still mention OpenDesign Cloud / AMR in leftover error and system-prompt text (`routes/collab-sync.ts`, `prompts/system.ts`, `media/models.ts`). Not covered by the sweep test.
- If a packaged build bakes `POSTHOG_KEY`, safety/exception tracking can still send events even with `metrics: false` (consent gate is for product analytics, not `captureSafety`).
- Support dialog still has Discord/Feishu channel labels; hrefs now go to tryopencomputer.com.
- `apps/web/tests/state/config.test.ts` still has ~25 pre-existing Inferno-only KNOWN_PROVIDERS failures from earlier tasks; not caused by this change.
- `app-config.test.ts` `projectLocations` path assertion still fails on Windows (`/tmp/...` vs `\tmp\...`); pre-existing.
- TRANSLATIONS.md / MAINTAINERS.md still have Discord / Fellow copy.

## Fix pass — strip remaining Open Design marketing copy

### Status

DONE

### Summary

Removed leftover user-facing Open Design / Discord / open-design.ai / Claude Design alternative / OpenDesign Cloud marketing from hero copy, Cloud settings/entry/chat gates, Ask-mode charter, support channels, Go Plan pricing URL, and media model labels. Widened `inferno-string-sweep.test.ts` to also cover `en.ts` and the Ask-mode prompt file, failing on `open-design.ai`, `discord.gg`, and `Claude Design alternative`.

### Files

| Path | Action |
|------|--------|
| `apps/web/src/i18n/locales/*.ts` | `homeHero.subtitlePrefix` -> Inferno local-first; `OpenDesign Cloud` -> `Inferno`; Discord CTA/support labels neutralized |
| `apps/daemon/src/prompts/system.ts` | Ask-mode charter: OpenComputer Design + Inferno; no Discord / open-design.ai / Claude Design alternative |
| `packages/contracts/src/prompts/system.ts` | Same Ask-mode charter (byte-kept in sync) |
| `packages/contracts/tests/system-prompt.test.ts` | Assert new Ask-mode product links; ban old marketing |
| `apps/web/src/components/chat/support-channels.tsx` | Single Website channel -> tryopencomputer.com; no Discord product channel |
| `apps/web/src/campaigns/go-plan.ts` | Pricing base -> `https://tryopencomputer.com/pricing/` |
| `apps/web/src/media/models.ts` | Vela provider/model hints: Inferno |
| `apps/daemon/src/media/models.ts` | Same |
| `apps/daemon/tests/inferno-string-sweep.test.ts` | Widened coverage |
| `apps/web/tests/campaigns/go-plan.test.ts` | Expect tryopencomputer.com |
| `apps/web/tests/campaigns/deepseek-v4-flash-modal.test.tsx` | Expect tryopencomputer.com |
| `apps/web/tests/campaigns/workbench-campaign-badge.test.tsx` | Expect tryopencomputer.com |

### Tests

GREEN:

```
corepack pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/inferno-string-sweep.test.ts
# 3 passed

corepack pnpm --filter @open-design/web exec vitest run -c vitest.config.ts tests/campaigns/go-plan.test.ts
# 5 passed

corepack pnpm --filter @open-design/contracts test
# 681 passed (includes system-prompt Ask-mode assertions)
```

### Commit

- `fix: strip remaining Open Design marketing copy`

### Notes

- README still has Apache-2.0 and one fork line: `Fork of nexu-io/open-design (Apache-2.0).`
- Daemon prompt still mentions `OpenDesign Cloud` in non-Ask media-default sections; sweep bans only the three marketing patterns above in the Ask file + en locale + README/components.

## Fix pass — drop Design Files Discord and star marketing tips

### Status

DONE

### Summary

Removed live Design Files useful-info tips that advertised Discord, GitHub stars, `@OpenDesignHQ`, and `opendesign.ai` socials. Rewrote tip6–8 / tip16–20 locale strings to Inferno / OpenComputer Design / tryopencomputer.com copy across all locales. Live `USEFUL_TIPS` rotation keeps tip6 → tryopencomputer.com and tip7 (Inferno Settings); dropped tip8 and tip16–20 social URL entries from `DesignFilesPanel.tsx`. Widened `inferno-string-sweep.test.ts` to assert tip strings and panel URLs stay clean.

### Files

| Path | Action |
|------|--------|
| `apps/web/src/components/DesignFilesPanel.tsx` | Dropped social tip URLs from `USEFUL_TIPS` |
| `apps/web/src/i18n/locales/*.ts` | tip6–8 / tip16–20 → OpenComputer / Inferno / tryopencomputer.com |
| `apps/daemon/tests/inferno-string-sweep.test.ts` | Added Design Files tip/social sweep |

### Tests

GREEN:

```
corepack pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/inferno-string-sweep.test.ts
# 4 passed
```

### Commit

- `fix: drop Design Files Discord and star marketing tips`
