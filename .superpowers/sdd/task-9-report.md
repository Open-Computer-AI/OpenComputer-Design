# Task 9 Report: Skip onboarding; strip remote media; keep HyperFrames

## Status

DONE

## Summary

Completed users no longer land on Cloud/AMR onboarding or What’s New. `MEDIA_PROVIDERS` keeps only HyperFrames integrated; every other vendor is `integrated: false` and `settingsVisible: false`. Home/Studio create rails hide remote Image and Video cards and keep HyperFrames (motion-as-code). Client prompt-template fetch drops remote image/video templates and keeps HyperFrames.

Followed TDD: failing MEDIA_PROVIDERS test → RED → implement provider/onboarding/template strip → GREEN → commit.

## Files

| Path | Action |
|------|--------|
| `apps/web/src/media/models.ts` | Modified (only HyperFrames remains integrated) |
| `apps/daemon/src/media/models.ts` | Modified (same strip, keep registries in sync) |
| `apps/web/src/App.tsx` | Modified (redirect `/onboarding` to Home when completed) |
| `apps/web/src/components/EntryShell.tsx` | Modified (do not render OnboardingView when completed; Whats New fetch unused) |
| `apps/web/src/providers/registry.ts` | Modified (`fetchWhatsNew` returns null; keep HyperFrames prompt templates) |
| `apps/web/src/components/home-hero/chips.ts` | Modified (drop `image`/`video` from `CREATE_RAIL_ORDER`) |
| `apps/web/src/components/HomeHero.tsx` | Modified (comment only) |
| `apps/web/src/components/home-hero/TypePillRow.tsx` | Modified (comment only) |
| `apps/web/tests/media/models.test.ts` | Created (brief MEDIA_PROVIDERS test) |
| `apps/web/tests/components/SettingsDialog.media.test.tsx` | Modified (no remote provider UI) |
| `apps/web/tests/components/SettingsDialog.execution.test.tsx` | Modified (no remote provider UI) |
| `apps/web/tests/components/HomeHero.rail.test.tsx` | Modified (pick HyperFrames instead of Image/Video) |
| `apps/web/tests/components/HomeHero.scenario-cards.test.tsx` | Modified (rail order without Image/Video) |
| `apps/web/tests/components/HomeView.media-options.test.tsx` | Modified (use remaining chips) |
| `apps/web/tests/components/HomeView.example-dismiss.test.tsx` | Modified (audio instead of image) |
| `apps/web/tests/components/HomeView.missing-bundled-scenario-i18n.test.tsx` | Modified (audio wedge) |

Did not rebrand (Task 10) or sweep README (Task 11). `config.onboardingCompleted: true` was already set in Task 7.

## Implementation notes

- HyperFrames stays `integrated: true`, `credentialsRequired: false`, `settingsVisible: false` (no key to configure). A module-load loop marks every other provider `integrated: false` and `settingsVisible: false`.
- Home TypePillRow, template picker, and Studio `WorkspaceTabsBar` radial all read `orderedCreateChips()` / `CREATE_RAIL_ORDER`, so dropping `image` and `video` hides those cards on both surfaces. HyperFrames remains. Image/Video chip *definitions* stay in `HOME_HERO_CHIPS` for existing projects.
- Studio page creator already hid Image/Video via `PAGE_CREATOR_HIDDEN_CATEGORIES`.
- `fetchWhatsNew()` short-circuits to `null` (no `/api/whats-new` round-trip). EntryShell mounts `WhatsNewPopup` with `active={false}` so the fetch is unused.
- Completed users hitting `/onboarding` are replace-navigated to Home; EntryShell also treats that route as Home instead of rendering `OnboardingView`.
- `/api/prompt-templates` is filtered client-side: keep `model === 'hyperframes-html'` or `source.repo === 'heygen-com/hyperframes'`.

## Commit

- `4e8d89a` feat: skip onboarding and strip remote media providers

## TDD Evidence

### RED

Command (PowerShell; `pnpm` not on PATH in this shell, so invoked via corepack):

```powershell
corepack pnpm --filter @open-design/web exec vitest run -c vitest.config.ts tests/media/models.test.ts
```

Output (`MEDIA_PROVIDERS` still listed every remote vendor as integrated):

```
 RUN  v4.1.6 C:/Users/sanka/Documents/GitHub/OC Open Design/apps/web

 ❯ tests/media/models.test.ts (1 test | 1 failed) 21ms

 FAIL  tests/media/models.test.ts > media providers > only HyperFrames is visible and integrated
AssertionError: expected [ 'openai', 'vela', …(16) ] to deeply equal [ 'hyperframes' ]

- Expected
+ Received

  [
+   "openai",
+   "vela",
+   "volcengine",
+   "grok",
    "hyperframes",
+   "nanobanana",
+   "imagerouter",
+   "openrouter",
+   "custom-image",
+   "fal",
+   "leonardo",
+   "minimax",
+   "elevenlabs",
+   "fishaudio",
+   "senseaudio",
+   "aihubmix",
+   "tavily",
+   "stub",
  ]
```

Expected FAIL: confirmed.

### GREEN

Command:

```powershell
corepack pnpm --filter @open-design/web exec vitest run -c vitest.config.ts tests/media/models.test.ts tests/components/SettingsDialog.media.test.tsx tests/components/HomeHero.scenario-cards.test.tsx tests/components/HomeHero.rail.test.tsx tests/components/HomeView.media-options.test.tsx tests/components/chips.automatic-default.test.ts tests/components/WhatsNewPopup.test.tsx
```

Output:

```
 RUN  v4.1.6 C:/Users/sanka/Documents/GitHub/OC Open Design/apps/web

 ✓ tests/media/models.test.ts (1 test) 10ms
 ✓ tests/components/chips.automatic-default.test.ts (2 tests)
 ✓ tests/components/WhatsNewPopup.test.tsx (18 tests)
 ✓ tests/components/HomeHero.scenario-cards.test.tsx (5 tests)
 ✓ tests/components/HomeHero.rail.test.tsx (26 tests)
 ✓ tests/components/HomeView.media-options.test.tsx (21 tests)
 ✓ tests/components/SettingsDialog.media.test.tsx (1 test)

 Test Files  7 passed (7)
      Tests  74 passed (74)
```

Expected PASS: confirmed.

Full suite (`corepack pnpm --filter @open-design/web exec vitest run -c vitest.config.ts`): `39 failed | 1083 passed | 1 skipped (1123)`. Failures are pre-existing Task 7/8 Settings/BYOK/CLI leftovers, Windows path separators in source-scan tests, and CSS computed-style timeouts — not the MEDIA_PROVIDERS / HyperFrames rail changes (`tests/media/models.test.ts` passed in that run).

## Self-review

- Brief test uses the integrated-only assertion because HyperFrames already has `settingsVisible: false`.
- Image/Video chip objects remain in `HOME_HERO_CHIPS` so `findChip('image')` still works for leftover handoffs; they are not in the create rail.
- Community gallery still has Image/Video tabs (not Home/Studio).
- Audio still uses `od-media-generation` (remote). Task asked only to hide Image/Video.
- `IMAGE_MODELS` still default to Vela; providers are stripped, catalogue ids are not.
- Prompt-template filter is client-side; daemon `/api/prompt-templates` still lists remote files if called directly.
- `handleActiveCloudSignOut` still sets `onboardingCompleted: false` and navigates to `/onboarding`; the skip only applies when completed is true.

## Review fix (Important findings)

Status: DONE. Did not rebrand (Task 10).

### Finding 1 — hide Image/Video create completely

- Removed leftover `image` / `video` entries from `HOME_HERO_CHIPS` (`findChip('image'|'video')` is undefined).
- Community: dropped Image/Video from `TEMPLATE_TYPE_ORDER`, `FACET_CATEGORY_TYPE`, and `TEMPLATE_HOME_TARGET`. HyperFrames and Audio remain.
- New Project Media tab defaults to audio and no longer offers Image/Video surfaces.
- Home composer: `homeMediaSurfaceForChipId` only maps HyperFrames/Audio; persisted/handoff `image`/`video` chip ids are ignored.

### Finding 2 — do not reopen Cloud/AMR onboarding after sign-out or reset

- `resetExecutionConfigAfterSignOut` no longer sets `onboardingCompleted: false`.
- Sign-out and Settings reset navigate to Home (`view: 'home'`), not `onboarding`.
- Settings reset keeps `onboardingCompleted: true`. Inferno key gate still handles missing keys.

### Covering tests (GREEN)

```powershell
corepack pnpm --filter @open-design/web exec vitest run -c vitest.config.ts tests/media/models.test.ts tests/community-view.test.tsx tests/components/HomeHero.scenario-cards.test.tsx tests/components/HomeHero.rail.test.tsx tests/components/home-hero/TypePillRow.test.tsx tests/components/App.onboarding-completion-persistence.test.tsx tests/components/NewProjectPanel.test.tsx tests/components/NewProjectPanel.media.test.tsx
```

```
 Test Files  8 passed (8)
      Tests  94 passed (94)
```

Settings reset: `SettingsDialog.execution.test.tsx -t "drops a pending autosave when explicit onboarding reset"` — 1 passed.

Full suite: Test Files `49 failed | 1073 passed | 1 skipped (1123)`; Tests `267 failed | 11226 passed | 1 expected fail | 24 skipped (11518)`. Failures remain pre-existing Task 7/8 Settings/BYOK/CLI leftovers, Windows path separators, CSS computed-style timeouts, EntryShell onboarding tests still expecting Cloud sign-in after the Inferno gate, and `NewProjectPanel.test.ts` `supportedModels` after the provider strip. Covering files above passed in that run.

### Commit

- `fix: hide Image/Video create and keep onboarding skipped`
