# OpenComputer Design Inferno-only Fork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn current `nexu-io/open-design` into private `Open-Computer-AI/OpenComputer-Design`: OpenComputer Design UI, Inferno-only model backend, no CLI spawn, no other providers.

**Architecture:** Keep web → local daemon → preview. Do **not** spawn Claude/Codex/OpenCode. Lock the existing BYOK `mode: 'api'` path to a new daemon route `POST /api/proxy/inferno/stream` that pins `https://router.tryopencomputer.com/v1`, uses a daemon-stored key, auto-picks OpenAI / Anthropic / Gemini dialects, and materializes `<artifact>` blocks. Empty the CLI registry except a synthetic `inferno` agent that is never spawned.

**Tech Stack:** Existing Open Design monorepo (pnpm 10.33.x, Node ~24, Express daemon, Next.js web, Vitest). New code under `apps/daemon/src/inferno/` and `apps/web/src/providers/inferno.ts`.

## Global Constraints

- Product name: **OpenComputer Design**. CLI: **`ocd`**. Data dir: **`~/.opencomputer-design`**. Env: **`OCD_DATA_DIR`**, fallback **`OD_DATA_DIR`**.
- Inferno base URL: **`https://router.tryopencomputer.com/v1`** (HTTPS only, not user-editable). Pin hostname `router.tryopencomputer.com`.
- Key: user pastes in Settings; daemon credential store only; never git, never renderer bundle as a shipped secret; CI mocks Inferno (no real key).
- Chat without a ready Inferno key: **`INFERNO_KEY_REQUIRED`** / **`INFERNO_NOT_READY`**. No “install Claude Code” copy.
- `SHIPPED_AGENT_DEFS` registers only `inferno`. Local CLI profiles disabled.
- Keep HyperFrames. Hide remote image/video providers and Image/Video artifact types that need them.
- Skip upstream onboarding. Default `onboardingCompleted: true`. Default `mode: 'api'`.
- Rebrand user-facing strings + CLI + paths. Keep `@open-design/*` package names, Apache-2.0, nexu-io copyright.
- Do not bake a key. Do not use `http://router.tryopencomputer.com`.
- Do not spawn `byok-opencode` / `opencode` as a wrapper.
- Website leftovers: `https://tryopencomputer.com`. Do not ship the Open Design marketing site.
- Repo: new private `Open-Computer-AI/OpenComputer-Design`. Leave `Open-Computer-AI/open-design` alone.

---

## File map

**Create**

- `apps/daemon/src/inferno/constants.ts` — pinned URL/host
- `apps/daemon/src/inferno/protocol.ts` — dialect from model id / owned_by
- `apps/daemon/src/inferno/models.ts` — `GET /v1/models`
- `apps/daemon/src/inferno/credentials.ts` — key store under data dir
- `apps/daemon/src/inferno/errors.ts` — typed error codes
- `apps/daemon/src/inferno/proxy.ts` — stream dispatcher used by the route
- `apps/daemon/src/runtimes/defs/inferno.ts` — synthetic def (`available` without PATH)
- `apps/daemon/tests/inferno-protocol.test.ts`
- `apps/daemon/tests/inferno-models.test.ts`
- `apps/daemon/tests/inferno-credentials.test.ts`
- `apps/daemon/tests/inferno-registry.test.ts`
- `apps/daemon/tests/inferno-proxy.test.ts`
- `apps/web/src/providers/inferno.ts`
- `apps/web/src/components/InfernoKeyGate.tsx`

**Modify (authoritative)**

- `apps/daemon/src/runtimes/registry.ts` — only inferno; no local profiles
- `apps/daemon/src/runtimes/detection.ts` — skip PATH probe when `synthetic: true`
- `apps/daemon/src/runtimes/types.ts` — optional `synthetic?: true`
- `apps/daemon/src/routes/chat.ts` — add `/api/proxy/inferno/stream`; reject other proxy providers
- `apps/daemon/src/app-config.ts` — `OCD_DATA_DIR` then `OD_DATA_DIR`; default data dir name
- `apps/daemon/src/server.ts` (or wherever `RUNTIME_DATA_DIR` is resolved) — same data-dir rule
- `apps/web/src/state/config.ts` — `KNOWN_PROVIDERS` = Inferno only; `DEFAULT_CONFIG` mode api + onboarding done
- `apps/web/src/utils/byokProvider.ts` — `inferno` agent id
- `apps/web/src/App.tsx` — skip onboarding; lock mode; Inferno gate
- `apps/web/src/components/SettingsDialog.tsx` — single Inferno key card
- `apps/web/src/media/models.ts` — only `hyperframes` visible/integrated
- `apps/packaged/src/window-title.ts` — OpenComputer Design
- root `package.json` and `apps/daemon/package.json` — bin `ocd`
- `apps/daemon/bin/od.mjs` — keep file, add `ocd.mjs` copy or rename export
- `README.md`, `QUICKSTART.md`

**Do not import** remaining `runtimes/defs/*.ts` into the registry.

---

### Task 1: Import upstream and create the private GitHub repo

**Files:**
- Preserve: `docs/superpowers/specs/2026-09-12-opencomputer-design-fork-design.md`
- Preserve: this plan
- Create: private repo `Open-Computer-AI/OpenComputer-Design`

**Interfaces:**
- Consumes: nothing
- Produces: a workspace that is current `nexu-io/open-design` plus `docs/superpowers/**`, git remote `origin` pointing at the new private repo

- [ ] **Step 1: Copy planning docs out of the way**

```powershell
$root = "C:\Users\sanka\Documents\GitHub\OC Open Design"
Copy-Item -Recurse "$root\docs" "$env:TEMP\ocd-docs-backup"
```

- [ ] **Step 2: Clone current upstream next to the workspace (full tree, not the sparse `_upstream` used for planning)**

```powershell
git clone --depth 1 https://github.com/nexu-io/open-design.git "$env:TEMP\open-design-import"
```

Expected: clone succeeds; `package.json` in the import has `"bin": { "od": ... }`.

- [ ] **Step 3: Replace workspace contents with upstream, then restore docs**

Do **not** delete `.git` until the import is copied. From the workspace:

```powershell
$root = "C:\Users\sanka\Documents\GitHub\OC Open Design"
# Keep our git; copy upstream files over (exclude .git)
robocopy "$env:TEMP\open-design-import" $root /E /XD .git _upstream
Copy-Item -Recurse -Force "$env:TEMP\ocd-docs-backup\superpowers" "$root\docs\superpowers"
```

Add `_upstream/` to `.gitignore` if the planning clone is still present.

- [ ] **Step 4: Commit the import on top of the spec commit**

```powershell
cd "C:\Users\sanka\Documents\GitHub\OC Open Design"
git add -A
git status
git commit -m "chore: import nexu-io/open-design as OpenComputer Design base"
```

- [ ] **Step 5: Create the private GitHub repo and push**

```powershell
gh repo create Open-Computer-AI/OpenComputer-Design --private --source=. --remote=origin --push
```

If `origin` already exists, set it explicitly:

```powershell
git remote add origin https://github.com/Open-Computer-AI/OpenComputer-Design.git
git push -u origin HEAD
```

Do **not** touch `Open-Computer-AI/open-design`.

- [ ] **Step 6: Confirm pnpm can install (no feature work yet)**

```powershell
corepack enable
pnpm install
```

Expected: lockfile install completes. If it fails, stop and fix environment (Node ~24, pnpm 10.33.x) before later tasks.

---

### Task 2: Inferno protocol router (pure functions)

**Files:**
- Create: `apps/daemon/src/inferno/constants.ts`
- Create: `apps/daemon/src/inferno/protocol.ts`
- Create: `apps/daemon/src/inferno/errors.ts`
- Test: `apps/daemon/tests/inferno-protocol.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `INFERNO_BASE_URL = 'https://router.tryopencomputer.com/v1'`
  - `INFERNO_HOST = 'router.tryopencomputer.com'`
  - `type InfernoDialect = 'openai' | 'anthropic' | 'google'`
  - `resolveInfernoDialect(modelId: string, ownedBy?: string | null): InfernoDialect`
  - `nextInfernoDialect(failed: InfernoDialect): InfernoDialect` (retry order)
  - error codes: `INFERNO_KEY_REQUIRED`, `INFERNO_NOT_READY`, `INFERNO_KEY_REJECTED`, `INFERNO_RATE_LIMITED`, `INFERNO_UNAVAILABLE`, `INFERNO_MODEL_UNREACHABLE`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { INFERNO_BASE_URL, INFERNO_HOST } from '../src/inferno/constants.js';
import { nextInfernoDialect, resolveInfernoDialect } from '../src/inferno/protocol.js';

describe('inferno protocol', () => {
  it('pins https Inferno URL and host', () => {
    expect(INFERNO_BASE_URL).toBe('https://router.tryopencomputer.com/v1');
    expect(INFERNO_HOST).toBe('router.tryopencomputer.com');
    expect(INFERNO_BASE_URL.startsWith('https://')).toBe(true);
  });

  it('routes claude/anthropic/sonnet/opus/haiku to anthropic', () => {
    expect(resolveInfernoDialect('claude-sonnet-4-6')).toBe('anthropic');
    expect(resolveInfernoDialect('anthropic/claude-3-5')).toBe('anthropic');
    expect(resolveInfernoDialect('foo-sonnet')).toBe('anthropic');
    expect(resolveInfernoDialect('opus-x')).toBe('anthropic');
    expect(resolveInfernoDialect('haiku-1')).toBe('anthropic');
  });

  it('routes gemini* to google', () => {
    expect(resolveInfernoDialect('gemini-2.5-flash')).toBe('google');
  });

  it('prefers owned_by over id heuristics', () => {
    expect(resolveInfernoDialect('custom-slot', 'anthropic')).toBe('anthropic');
    expect(resolveInfernoDialect('custom-slot', 'google')).toBe('google');
    expect(resolveInfernoDialect('claude-sonnet-4-6', 'openai')).toBe('openai');
  });

  it('defaults everything else to openai', () => {
    expect(resolveInfernoDialect('gpt-4o')).toBe('openai');
    expect(resolveInfernoDialect('grok-4.5')).toBe('openai');
    expect(resolveInfernoDialect('deepseek-v4-pro')).toBe('openai');
  });

  it('retries openai -> anthropic -> google -> openai', () => {
    expect(nextInfernoDialect('openai')).toBe('anthropic');
    expect(nextInfernoDialect('anthropic')).toBe('google');
    expect(nextInfernoDialect('google')).toBe('openai');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/inferno-protocol.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

`apps/daemon/src/inferno/constants.ts`:

```ts
export const INFERNO_BASE_URL = 'https://router.tryopencomputer.com/v1';
export const INFERNO_HOST = 'router.tryopencomputer.com';
```

`apps/daemon/src/inferno/errors.ts`:

```ts
export const INFERNO_ERROR_CODES = {
  KEY_REQUIRED: 'INFERNO_KEY_REQUIRED',
  NOT_READY: 'INFERNO_NOT_READY',
  KEY_REJECTED: 'INFERNO_KEY_REJECTED',
  RATE_LIMITED: 'INFERNO_RATE_LIMITED',
  UNAVAILABLE: 'INFERNO_UNAVAILABLE',
  MODEL_UNREACHABLE: 'INFERNO_MODEL_UNREACHABLE',
} as const;

export type InfernoErrorCode =
  (typeof INFERNO_ERROR_CODES)[keyof typeof INFERNO_ERROR_CODES];
```

`apps/daemon/src/inferno/protocol.ts`:

```ts
export type InfernoDialect = 'openai' | 'anthropic' | 'google';

function normalizeOwnedBy(ownedBy?: string | null): InfernoDialect | null {
  if (!ownedBy) return null;
  const v = ownedBy.trim().toLowerCase();
  if (v === 'anthropic' || v === 'claude') return 'anthropic';
  if (v === 'google' || v === 'gemini') return 'google';
  if (v === 'openai' || v === 'openai-compatible' || v === 'xai' || v === 'inferno') {
    return 'openai';
  }
  return null;
}

export function resolveInfernoDialect(
  modelId: string,
  ownedBy?: string | null,
): InfernoDialect {
  const fromOwner = normalizeOwnedBy(ownedBy);
  if (fromOwner) return fromOwner;
  const id = modelId.trim().toLowerCase();
  if (
    id.includes('claude') ||
    id.includes('anthropic') ||
    id.includes('sonnet') ||
    id.includes('opus') ||
    id.includes('haiku')
  ) {
    return 'anthropic';
  }
  if (id.includes('gemini')) return 'google';
  return 'openai';
}

const NEXT: Record<InfernoDialect, InfernoDialect> = {
  openai: 'anthropic',
  anthropic: 'google',
  google: 'openai',
};

export function nextInfernoDialect(failed: InfernoDialect): InfernoDialect {
  return NEXT[failed];
}

export function isInfernoProtocolShapeError(status: number, bodyText: string): boolean {
  if (status !== 400 && status !== 404 && status !== 415 && status !== 422) return false;
  const t = bodyText.toLowerCase();
  return (
    t.includes('unknown field') ||
    t.includes('invalid') ||
    t.includes('not found') ||
    t.includes('unrecognized') ||
    t.includes('messages') ||
    t.includes('chat/completions')
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/inferno-protocol.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/daemon/src/inferno/constants.ts apps/daemon/src/inferno/protocol.ts apps/daemon/src/inferno/errors.ts apps/daemon/tests/inferno-protocol.test.ts
git commit -m "feat: add Inferno dialect router and pinned host constants"
```

---

### Task 3: Inferno models fetch + hostname pin

**Files:**
- Create: `apps/daemon/src/inferno/models.ts`
- Test: `apps/daemon/tests/inferno-models.test.ts`

**Interfaces:**
- Consumes: `INFERNO_BASE_URL`, `INFERNO_HOST`
- Produces:
  - `assertInfernoUrl(url: URL): void` throws if hostname !== `INFERNO_HOST` or protocol !== `https:`
  - `fetchInfernoModels(apiKey: string, fetchImpl?: typeof fetch): Promise<{ id: string; label: string; ownedBy?: string }[]>`
  - maps OpenAI-style `{ data: [{ id, owned_by }] }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { INFERNO_BASE_URL } from '../src/inferno/constants.js';
import { assertInfernoUrl, fetchInfernoModels } from '../src/inferno/models.js';

describe('inferno models', () => {
  it('rejects non-pinned hosts and http', () => {
    expect(() => assertInfernoUrl(new URL('https://api.openai.com/v1'))).toThrow(/pinned/i);
    expect(() => assertInfernoUrl(new URL('http://router.tryopencomputer.com/v1'))).toThrow(/https/i);
    expect(() => assertInfernoUrl(new URL(INFERNO_BASE_URL))).not.toThrow();
  });

  it('parses GET /v1/models with the bearer key', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://router.tryopencomputer.com/v1/models');
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer sk-test' });
      return new Response(JSON.stringify({
        data: [
          { id: 'grok-4.5', owned_by: 'xai' },
          { id: 'claude-sonnet-4-6', owned_by: 'anthropic' },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const models = await fetchInfernoModels('sk-test', fetchImpl as typeof fetch);
    expect(models).toEqual([
      { id: 'grok-4.5', label: 'grok-4.5', ownedBy: 'xai' },
      { id: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6', ownedBy: 'anthropic' },
    ]);
  });

  it('maps 401 to KEY_REJECTED', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 401 }));
    await expect(fetchInfernoModels('bad', fetchImpl as typeof fetch)).rejects.toMatchObject({
      code: 'INFERNO_KEY_REJECTED',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/inferno-models.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
import { INFERNO_BASE_URL, INFERNO_HOST } from './constants.js';
import { INFERNO_ERROR_CODES, type InfernoErrorCode } from './errors.js';

export class InfernoError extends Error {
  constructor(
    public readonly code: InfernoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'InfernoError';
  }
}

export function assertInfernoUrl(url: URL): void {
  if (url.protocol !== 'https:') {
    throw new InfernoError(INFERNO_ERROR_CODES.UNAVAILABLE, 'Inferno URL must use https');
  }
  if (url.hostname.toLowerCase() !== INFERNO_HOST) {
    throw new InfernoError(INFERNO_ERROR_CODES.UNAVAILABLE, 'Inferno URL host is not pinned');
  }
}

export type InfernoModel = { id: string; label: string; ownedBy?: string };

export async function fetchInfernoModels(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<InfernoModel[]> {
  const url = new URL('models', INFERNO_BASE_URL.endsWith('/') ? INFERNO_BASE_URL : `${INFERNO_BASE_URL}/`);
  assertInfernoUrl(url);
  const res = await fetchImpl(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.status === 401 || res.status === 403) {
    throw new InfernoError(INFERNO_ERROR_CODES.KEY_REJECTED, 'Inferno rejected this key.');
  }
  if (res.status === 429) {
    throw new InfernoError(INFERNO_ERROR_CODES.RATE_LIMITED, 'Inferno rate limited.');
  }
  if (!res.ok) {
    throw new InfernoError(INFERNO_ERROR_CODES.UNAVAILABLE, `Cannot reach Inferno (${res.status}).`);
  }
  const json = (await res.json()) as { data?: Array<{ id?: unknown; owned_by?: unknown }> };
  const data = Array.isArray(json.data) ? json.data : [];
  return data
    .map((row) => {
      const id = typeof row.id === 'string' ? row.id.trim() : '';
      if (!id) return null;
      const ownedBy = typeof row.owned_by === 'string' ? row.owned_by : undefined;
      return { id, label: id, ...(ownedBy ? { ownedBy } : {}) };
    })
    .filter((row): row is InfernoModel => row !== null);
}
```

- [ ] **Step 4: Run tests**

```powershell
pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/inferno-models.test.ts tests/inferno-protocol.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/daemon/src/inferno/models.ts apps/daemon/tests/inferno-models.test.ts
git commit -m "feat: fetch Inferno models from the pinned HTTPS host"
```

---

### Task 4: Daemon Inferno credential store

**Files:**
- Create: `apps/daemon/src/inferno/credentials.ts`
- Test: `apps/daemon/tests/inferno-credentials.test.ts`

**Interfaces:**
- Consumes: data dir path
- Produces:
  - `infernoCredentialsPath(dataDir) => <dataDir>/secrets/inferno.json`
  - `saveInfernoApiKey(dataDir, key): Promise<void>`
  - `readInfernoApiKey(dataDir): Promise<string | null>`
  - `clearInfernoApiKey(dataDir): Promise<void>`
  - `infernoKeyTail(key): string` last 4 chars
- File mode: directory `0700` when the platform supports it. File must not log the key. JSON `{ "apiKey": "..." }` is acceptable v1 if it matches how nearby BYOK secrets are stored; if the daemon already has an encrypted secret helper, use that instead of inventing a new crypto.

- [ ] **Step 1: Write the failing test** (use `os.tmpdir()`; never write under the real home)

```ts
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  clearInfernoApiKey,
  infernoCredentialsPath,
  readInfernoApiKey,
  saveInfernoApiKey,
} from '../src/inferno/credentials.js';

describe('inferno credentials', () => {
  it('round-trips a key under the data dir and can clear it', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'inferno-cred-'));
    expect(infernoCredentialsPath(dataDir)).toBe(path.join(dataDir, 'secrets', 'inferno.json'));
    await saveInfernoApiKey(dataDir, ' sk-live-abcd ');
    expect(await readInfernoApiKey(dataDir)).toBe('sk-live-abcd');
    const raw = await readFile(infernoCredentialsPath(dataDir), 'utf8');
    expect(raw).toContain('sk-live-abcd');
    await clearInfernoApiKey(dataDir);
    expect(await readInfernoApiKey(dataDir)).toBeNull();
  });

  it('rejects empty keys', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'inferno-cred-'));
    await expect(saveInfernoApiKey(dataDir, '   ')).rejects.toMatchObject({
      code: 'INFERNO_KEY_REQUIRED',
    });
  });
});
```

- [ ] **Step 2: Run to verify fail**

```powershell
pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/inferno-credentials.test.ts
```

- [ ] **Step 3: Implement `credentials.ts`**

Trim the key. `mkdir` `secrets/` recursive. Write via temp + rename. `readInfernoApiKey` returns null if missing/invalid JSON. `clear` unlinks the file.

- [ ] **Step 4: Tests pass, then commit**

```powershell
git add apps/daemon/src/inferno/credentials.ts apps/daemon/tests/inferno-credentials.test.ts
git commit -m "feat: store Inferno API key in the daemon data dir"
```

---

### Task 5: `POST /api/proxy/inferno/stream` and reject other proxies

**Files:**
- Create: `apps/daemon/src/inferno/proxy.ts`
- Modify: `apps/daemon/src/routes/chat.ts` (the `/api/proxy/*` registrations near the openai/anthropic/google handlers)
- Test: `apps/daemon/tests/inferno-proxy.test.ts`

**Interfaces:**
- Consumes: credentials, protocol router, `googleStreamGenerateContentUrl` from `apps/daemon/src/integrations/google-models.ts`, existing `runAnthropicChatStream` / OpenAI SSE mapping in `chat.ts`
- Produces: `POST /api/proxy/inferno/stream` body `{ model, systemPrompt, messages, maxTokens? }` — **no `baseUrl`**. Key from store. If client sends `baseUrl`, ignore it.
- Other `/api/proxy/:provider/stream` (openai, anthropic, azure, google, ollama, senseaudio, aihubmix) respond `403` `FORBIDDEN` with message `Only Inferno is available.`

Stream behavior:

1. No key → 401 `INFERNO_KEY_REQUIRED`
2. Resolve dialect from model + last remembered winner (in-process `Map<string, InfernoDialect>`)
3. OpenAI: `POST ${INFERNO_BASE_URL}/chat/completions` with `Authorization: Bearer`, `stream: true` (reuse existing openai proxy payload builder)
4. Anthropic: `POST ${INFERNO_BASE_URL}/messages` with `x-api-key` **and** `Authorization: Bearer` if upstream anthropic proxy only sends `x-api-key` — send **Bearer** for Inferno (Sub2API keys are Bearer). Also send `anthropic-version: 2023-06-01`
5. Gemini: `googleStreamGenerateContentUrl(INFERNO_BASE_URL, model)` — this strips `/v1` and uses `/v1beta/models/{id}:streamGenerateContent?alt=sse` (existing helper)
6. On protocol-shape error, retry **once** with `nextInfernoDialect`; remember winner
7. Both fail → `INFERNO_MODEL_UNREACHABLE`
8. Map SSE to the same `start` / delta / `end` events the web `streamProxyEndpoint` already understands (`packages/contracts/src/sse/proxy.ts`)

- [ ] **Step 1: Unit-test `chooseInfernoRequest` in `proxy.ts`** (URL + headers per dialect, host pin, ignore override baseUrl)

```ts
import { describe, expect, it } from 'vitest';
import { buildInfernoUpstreamRequest } from '../src/inferno/proxy.js';

describe('buildInfernoUpstreamRequest', () => {
  it('openai posts chat completions to the pinned host', () => {
    const req = buildInfernoUpstreamRequest({
      dialect: 'openai',
      model: 'grok-4.5',
      apiKey: 'sk-test',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(req.url.hostname).toBe('router.tryopencomputer.com');
    expect(req.url.protocol).toBe('https:');
    expect(req.url.pathname).toBe('/v1/chat/completions');
    expect(req.headers.Authorization).toBe('Bearer sk-test');
    expect(req.body.model).toBe('grok-4.5');
    expect(req.body.stream).toBe(true);
  });

  it('anthropic posts /v1/messages', () => {
    const req = buildInfernoUpstreamRequest({
      dialect: 'anthropic',
      model: 'claude-sonnet-4-6',
      apiKey: 'sk-test',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(req.url.pathname).toBe('/v1/messages');
    expect(req.headers.Authorization).toBe('Bearer sk-test');
  });

  it('google uses v1beta streamGenerateContent on the pinned host', () => {
    const req = buildInfernoUpstreamRequest({
      dialect: 'google',
      model: 'gemini-2.5-flash',
      apiKey: 'sk-test',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(req.url.hostname).toBe('router.tryopencomputer.com');
    expect(req.url.pathname).toContain('/v1beta/models/');
    expect(req.url.pathname).toContain('streamGenerateContent');
  });
});
```

- [ ] **Step 2: Run to fail, implement `buildInfernoUpstreamRequest`, run to pass**

- [ ] **Step 3: Wire the Express route in `chat.ts`**

Register **before** the generic `app.post('/api/proxy/:provider/stream')`:

```ts
app.post('/api/proxy/inferno/stream', async (req, res) => {
  // read key from credentials using RUNTIME_DATA_DIR
  // call inferno proxy helper
});

const INFERNO_ONLY_PROXY_MESSAGE = 'Only Inferno is available.';
for (const provider of ['openai', 'anthropic', 'azure', 'google', 'ollama', 'senseaudio', 'aihubmix']) {
  // Replace those handlers with sendApiError(res, 403, 'FORBIDDEN', INFERNO_ONLY_PROXY_MESSAGE)
}
```

Also add:

- `PUT /api/inferno/key` `{ apiKey }` → save + fetch models
- `DELETE /api/inferno/key`
- `GET /api/inferno/status` `{ ready, models, apiKeyConfigured, apiKeyTail }` — never return the raw key

`ready` is true iff key present AND last models fetch succeeded AND `models.length > 0`.

- [ ] **Step 4: Commit**

```powershell
git add apps/daemon/src/inferno/proxy.ts apps/daemon/src/routes/chat.ts apps/daemon/tests/inferno-proxy.test.ts
git commit -m "feat: proxy chat only through pinned Inferno"
```

---

### Task 6: Synthetic Inferno runtime; empty CLI catalog

**Files:**
- Create: `apps/daemon/src/runtimes/defs/inferno.ts`
- Modify: `apps/daemon/src/runtimes/types.ts` — add `synthetic?: boolean`
- Modify: `apps/daemon/src/runtimes/registry.ts` — `SHIPPED_AGENT_DEFS = [infernoAgentDef]`; `readLocalAgentProfileDefs` returns `[]`
- Modify: `apps/daemon/src/runtimes/detection.ts` — if `def.synthetic`, mark `available: true` without PATH/version probe; set `authStatus` from Inferno credentials (`ok` / `missing`)
- Test: `apps/daemon/tests/inferno-registry.test.ts`

**Interfaces:**
- Consumes: `infernoAgentDef.id === 'inferno'`, `name: 'Inferno'`, `streamFormat: 'plain'`, `supportsCustomModel: false`, `bin: 'inferno-synthetic'` (never spawned)
- Produces: `getAgentDef('claude') === null`; `AGENT_DEFS.length === 1`

```ts
export const infernoAgentDef = {
  id: 'inferno',
  name: 'Inferno',
  bin: 'inferno-synthetic',
  synthetic: true,
  versionArgs: ['--version'],
  fallbackModels: [],
  buildArgs: () => {
    throw new Error('Inferno is HTTP-only; do not spawn a CLI');
  },
  streamFormat: 'plain',
  supportsCustomModel: false,
} satisfies RuntimeAgentDef;
```

Detection must **not** call `buildArgs`. Chat `/api/chat` that tries to spawn inferno must fail closed if anyone hits the CLI path; the web uses `/api/proxy/inferno/stream` instead.

- [ ] **Step 1: Test that `SHIPPED_AGENT_DEFS` is only inferno and local profiles are empty**

```ts
import { describe, expect, it } from 'vitest';
import { AGENT_DEFS, SHIPPED_AGENT_DEFS, getAgentDef, readLocalAgentProfileDefs } from '../src/runtimes/registry.js';

describe('inferno-only registry', () => {
  it('ships only inferno', () => {
    expect(SHIPPED_AGENT_DEFS.map((d) => d.id)).toEqual(['inferno']);
    expect(getAgentDef('claude')).toBeNull();
    expect(getAgentDef('codex')).toBeNull();
    expect(getAgentDef('amr')).toBeNull();
    expect(getAgentDef('opencode')).toBeNull();
    expect(getAgentDef('inferno')?.synthetic).toBe(true);
  });

  it('does not merge local CLI profiles', () => {
    expect(readLocalAgentProfileDefs()).toEqual([]);
    expect(AGENT_DEFS.map((d) => d.id)).toEqual(['inferno']);
  });
});
```

- [ ] **Step 2: Fail, implement, pass, commit**

```powershell
git add apps/daemon/src/runtimes/defs/inferno.ts apps/daemon/src/runtimes/registry.ts apps/daemon/src/runtimes/types.ts apps/daemon/src/runtimes/detection.ts apps/daemon/tests/inferno-registry.test.ts
git commit -m "feat: register Inferno as the only agent runtime"
```

---

### Task 7: Web config — Inferno is the only API provider

**Files:**
- Modify: `apps/web/src/state/config.ts`
- Modify: `apps/web/src/utils/byokProvider.ts`
- Create: `apps/web/src/providers/inferno.ts`
- Modify: `apps/web/src/providers/anthropic.ts` (or the switch that picks `streamMessageOpenAI` vs anthropic) so `mode === 'api'` always calls Inferno
- Test: existing web vitest if present under `apps/web`; otherwise add `apps/web/src/state/config.inferno.test.ts` if the web package already has vitest. If web tests are heavy, put provider-list assertions in a small node test that imports `KNOWN_PROVIDERS`.

**Interfaces:**
- Consumes: `INFERNO_BASE_URL` — duplicate the string in web as `INFERNO_BASE_URL` in `apps/web/src/inferno.ts` (do not import daemon source). Keep the two strings identical.
- Produces: `KNOWN_PROVIDERS` length 1, label `Inferno`, `baseUrl` hardcoded, `requiresApiKey: true`
- `DEFAULT_CONFIG.mode = 'api'`
- `DEFAULT_CONFIG.apiProtocol` can stay `'openai'` as a shadow; the daemon ignores it and routes by model
- `DEFAULT_CONFIG.onboardingCompleted = true`
- `DEFAULT_CONFIG.baseUrl = 'https://router.tryopencomputer.com/v1'`
- `API_PROTOCOL_AGENT_IDS` all map to `'inferno'` **or** replace the table with a single `INFERNO_AGENT_ID = 'inferno'`
- `streamMessageInferno` POSTs to `/api/proxy/inferno/stream` with `{ model, systemPrompt, messages }` and **without** `baseUrl`. Do not send `apiKey` if status says the daemon has it; if the current `streamProxyEndpoint` requires apiKey in the body, send empty and let the daemon use the store.

`KNOWN_PROVIDERS` becomes:

```ts
export const KNOWN_PROVIDERS: KnownProvider[] = [
  {
    label: 'Inferno',
    protocol: 'openai',
    baseUrl: 'https://router.tryopencomputer.com/v1',
    preferredModels: [],
    requiresApiKey: true,
  },
];
```

Lock mode: any code path that sets `mode: 'daemon'` for a CLI agent must set `mode: 'api'` instead (EntryShell / Settings execution switcher). Hide the CLI execution switcher UI.

- [ ] **Step 1: Test `KNOWN_PROVIDERS`**

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, KNOWN_PROVIDERS } from './config';

describe('inferno-only web config', () => {
  it('exposes only Inferno and starts in api mode with onboarding skipped', () => {
    expect(KNOWN_PROVIDERS).toHaveLength(1);
    expect(KNOWN_PROVIDERS[0]?.label).toBe('Inferno');
    expect(KNOWN_PROVIDERS[0]?.baseUrl).toBe('https://router.tryopencomputer.com/v1');
    expect(DEFAULT_CONFIG.mode).toBe('api');
    expect(DEFAULT_CONFIG.onboardingCompleted).toBe(true);
    expect(DEFAULT_CONFIG.agentId).toBe('inferno');
  });
});
```

- [ ] **Step 2: Implement, pass, commit**

```powershell
git add apps/web/src/state/config.ts apps/web/src/utils/byokProvider.ts apps/web/src/providers/inferno.ts apps/web/src/inferno.ts
git commit -m "feat: lock the web client to the Inferno API provider"
```

---

### Task 8: Settings key card, status, Generate gate

**Files:**
- Modify: `apps/web/src/components/SettingsDialog.tsx` — replace the BYOK provider list with one Inferno card: key field, Save, Test (calls `PUT /api/inferno/key` then shows models), Clear
- Create: `apps/web/src/components/InfernoKeyGate.tsx`
- Modify: `apps/web/src/App.tsx` — if `!infernoStatus.ready`, disable Generate/Send/Try it; show gate “Add your Inferno API key in Settings to generate.” / Open Settings
- Modify: chat send path so a 401 `INFERNO_KEY_REQUIRED` opens the same gate, not a CLI wizard

**Interfaces:**
- Consumes: `GET /api/inferno/status`
- Produces: no Generate until `ready === true`

Gate rules from the spec: browsing Home/Studio/plugins allowed; model-calling actions blocked; closing the modal returns to Home; successful Save does not auto-start a generation.

Hide: AMR upgrade, Cloud, Discord, GitHub star, “connect Claude”, media providers nav if empty except HyperFrames (HyperFrames needs no key).

- [ ] **Step 1: Manual/UI test plan (automate what the web test runner already supports)**

If `apps/web` has component tests, assert InfernoKeyGate renders the spec copy. If not, add a pure helper:

```ts
export function canGenerateWithInferno(status: {
  ready: boolean;
  models: unknown[];
}): boolean {
  return status.ready === true && status.models.length > 0;
}
```

Test that helper. Wire it into App.

- [ ] **Step 2: Implement Settings + gate, commit**

```powershell
git commit -m "feat: gate Generate on a saved Inferno API key"
```

---

### Task 9: Skip onboarding; strip remote media; keep HyperFrames

**Files:**
- Modify: `apps/web/src/state/config.ts` — already `onboardingCompleted: true` in Task 7
- Modify: `apps/web/src/App.tsx` — do not render the onboarding route when completed; skip What’s New that mentions AMR/Cloud (short-circuit the whats-new fetch to unused)
- Modify: `apps/web/src/media/models.ts` — set `integrated: false` and `settingsVisible: false` on every provider except `hyperframes`. Keep `hyperframes` integrated, `credentialsRequired: false`
- Hide Home/Studio Image and Video cards that use remote models. Keep HyperFrame / motion-as-code entry.
- Filter `/api/prompt-templates` clientside or daemon-side: drop templates whose target model is a remote image/video id. Keep HyperFrames templates.

- [ ] **Step 1: Test MEDIA_PROVIDERS visibility**

```ts
import { describe, expect, it } from 'vitest';
import { MEDIA_PROVIDERS } from '../media/models';

describe('media providers', () => {
  it('only HyperFrames is visible and integrated', () => {
    const visible = MEDIA_PROVIDERS.filter((p) => p.settingsVisible !== false && p.integrated);
    expect(visible.map((p) => p.id)).toEqual(['hyperframes']);
  });
});
```

HyperFrames may already have `settingsVisible: false` because it needs no credentials — in that case assert:

```ts
const integrated = MEDIA_PROVIDERS.filter((p) => p.integrated);
expect(integrated.map((p) => p.id)).toEqual(['hyperframes']);
```

Set `integrated: false` on openai, vela, volcengine, grok, nanobanana, imagerouter, openrouter, custom-image, comfyui, bfl, fal, replicate, google, midjourney, kling, minimax, suno, udio, elevenlabs, fishaudio, senseaudio, aihubmix, tavily, leonardo, stub.

- [ ] **Step 2: Implement, pass, commit**

```powershell
git commit -m "feat: skip onboarding and strip remote media providers"
```

---

### Task 10: Rebrand CLI, data dir, window title

**Files:**
- Modify: root `package.json` `"bin": { "ocd": "./apps/daemon/bin/od.mjs" }` (keep the mjs filename internally)
- Modify: `apps/daemon/package.json` `"bin": { "ocd": "./bin/od.mjs" }`
- Copy or add `apps/daemon/bin/ocd.mjs` that re-exports `od.mjs` if some packagers look up argv[1] basename
- Modify: `apps/daemon/src/app-config.ts` `appConfigDir`:

```ts
export function appConfigDir(projectRoot: string, env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.OCD_DATA_DIR || env.OD_DATA_DIR;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const expanded = expandHomePrefix(raw.trim());
    return path.isAbsolute(expanded) ? expanded : path.resolve(projectRoot, expanded);
  }
  return path.join(os.homedir(), '.opencomputer-design');
}
```

**Stop** using `path.join(projectRoot, '.od')` as the default when env is unset — spec default is `~/.opencomputer-design`. Check `server.ts` `RUNTIME_DATA_DIR` / `OD_DATA_DIR` resolution and apply the same `OCD_DATA_DIR || OD_DATA_DIR || ~/.opencomputer-design` rule. Read `AGENTS.md` daemon data directory contract and update it to the new default without restating secrets.

- Modify: `apps/packaged/src/window-title.ts` `DEFAULT_WINDOW_TITLE = "OpenComputer Design"`
- Modify: Electron productName in the packaged identity module (`releaseInstallIdentity` / `@open-design/release`) if that string is “Open Design”
- MCP help: replace user-facing `od mcp` with `ocd mcp`
- Icon: replace packaged/app icons that show the Open Design mark with an OC monogram (reuse June `Open-Computer-AI/open-design` assets if still available, or a simple “OC” mark). Do not keep nexu-io product artwork as the app identity.

- [ ] **Step 1: Test `appConfigDir`**

```ts
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appConfigDir } from '../src/app-config.js';

describe('appConfigDir', () => {
  it('prefers OCD_DATA_DIR then OD_DATA_DIR then ~/.opencomputer-design', () => {
    expect(appConfigDir('/proj', { OCD_DATA_DIR: '/tmp/ocd' })).toBe(path.resolve('/tmp/ocd'));
    expect(appConfigDir('/proj', { OD_DATA_DIR: '/tmp/od' })).toBe(path.resolve('/tmp/od'));
    expect(appConfigDir('/proj', {})).toBe(path.join(os.homedir(), '.opencomputer-design'));
  });
});
```

- [ ] **Step 2: Implement, pass, commit**

```powershell
git commit -m "feat: rebrand CLI to ocd and default data dir to ~/.opencomputer-design"
```

---

### Task 11: String sweep, analytics off, README

**Files:**
- `README.md`, `QUICKSTART.md` — rewrite as OpenComputer Design; one line “Fork of nexu-io/open-design (Apache-2.0).” Commands use `ocd`. Inferno key in Settings. Link tryopencomputer.com. No Discord/star/AMR/Cloud.
- Disable PostHog/GA: no-op analytics provider or skip script inject. `telemetry.metrics` default **false**.
- Grep user-facing copy in `apps/web/src`, `apps/daemon/src` error strings, `apps/packaged`, docs i18n product strings.

Banned in user-facing surfaces (fail the sweep): `open-design.ai`, Discord invite, GitHub star pill, Fellow, OpenDesign Cloud, AMR as a product, “Claude Design alternative” as current positioning.

Allowed: LICENSE, copyright, one fork attribution, debug logs, `@open-design` package names.

Add `apps/daemon/tests/inferno-string-sweep.test.ts` **or** a `scripts/inferno-string-sweep.ts` that greps README + `apps/web/src/components` for `open-design.ai` and `discord.gg` and fails if found.

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('string sweep', () => {
  it('README does not advertise Open Design Cloud or Discord', () => {
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toMatch(/OpenComputer Design/);
    expect(readme).not.toMatch(/open-design\.ai/);
    expect(readme).not.toMatch(/discord\.gg/);
  });
});
```

Run from repo root path in the test via `path.join` to workspace root.

Do not ship the marketing landing app: if `apps/web` still has a marketing site package, leave it out of `tools-dev` default and out of README.

- [ ] **Step 1: Implement README + sweep test, fail on old README, rewrite, pass**

- [ ] **Step 2: Commit**

```powershell
git commit -m "docs: rebrand README and strip Open Design marketing"
```

---

### Task 12: Verification (no real Inferno in CI)

- [ ] **Step 1: Run daemon unit tests**

```powershell
pnpm --filter @open-design/daemon test
```

Expected: new inferno tests pass. Pre-existing tests that assume `claude` in `SHIPPED_AGENT_DEFS` or live BYOK presets will fail — **rewrite those assertions** to the Inferno-only registry (do not restore Claude to make them pass).

- [ ] **Step 2: Typecheck**

```powershell
pnpm --filter @open-design/daemon typecheck
```

- [ ] **Step 3: Manual smoke (optional, key from the user in chat, never committed)**

1. `pnpm tools-dev run web`
2. Home loads with no onboarding
3. Generate blocked until Settings → Inferno key
4. Save key → models list from `GET /v1/models`
5. Brief a simple HTML prototype → artifact appears in preview
6. Confirm DevTools has **no** request to `api.openai.com` / `api.anthropic.com` / `open-design.ai`

- [ ] **Step 4: Final commit only if Step 1–2 required test rewrites**

```powershell
git commit -m "test: align agent registry tests with Inferno-only distribution"
```

---

## Execution notes

- Work in this workspace after Task 1. Do not implement inside `_upstream` (sparse clone).
- Never commit API keys. If a test key is pasted in chat, use it only for Task 12 Step 3.
- If `link_pull_request` is available and you open a PR, register the PR URL immediately.
- Prefer stacking commits exactly as each task’s Step 5.
