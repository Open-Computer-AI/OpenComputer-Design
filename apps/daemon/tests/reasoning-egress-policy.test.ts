import type http from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startServer } from '../src/server.js';

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

const realFetch = globalThis.fetch;

describe('reasoningExecution egress policy', () => {
  let baseUrl: string;
  let server: http.Server | null = null;

  beforeAll(async () => {
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(() => new Promise<void>((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
  }));

  function stubUnexpectedUpstreamFetch() {
    const fetchMock = vi.fn((input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      throw new Error(`unexpected upstream fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  async function postJson(path: string, body: unknown): Promise<Response> {
    return realFetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function expectReasoningDenied(
    path: string,
    body: Record<string, unknown>,
    expected: { routeKind: string; provider: string; code?: string; status?: number },
  ) {
    const fetchMock = stubUnexpectedUpstreamFetch();
    const res = await postJson(path, body);
    expect(res.status).toBe(expected.status ?? 403);
    const payload = await res.json() as {
      error: {
        code: string;
        data: Record<string, unknown>;
      };
    };
    expect(payload.error.code).toBe(expected.code ?? 'reasoning_execution_disabled');
    expect(payload.error.data).toMatchObject({
      routeKind: expected.routeKind,
      provider: expected.provider,
    });
    if (typeof body.apiKey === 'string') {
      expect(JSON.stringify(payload)).not.toContain(body.apiKey);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  }

  const disabledPolicy = { mode: 'disabled' };

  it.each([
    'openai',
    'anthropic',
    'azure',
    'google',
    'ollama',
    'senseaudio',
    'aihubmix',
  ])('rejects /api/proxy/%s/stream with 403 Inferno-only before reasoning policy', async (provider) => {
    const fetchMock = stubUnexpectedUpstreamFetch();
    const res = await postJson(`/api/proxy/${provider}/stream`, {
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'hello' }],
      reasoningExecution: disabledPolicy,
    });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: 'FORBIDDEN', message: 'Only Inferno is available.' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still applies reasoning policy to unknown proxy providers', async () => {
    await expectReasoningDenied(
      '/api/proxy/newprovider/stream',
      {
        baseUrl: 'https://newprovider.example.com/v1',
        apiKey: 'newprovider-key',
        model: 'new-model',
        messages: [{ role: 'user', content: 'hello' }],
        reasoningExecution: disabledPolicy,
      },
      { routeKind: 'proxy', provider: 'newprovider' },
    );
  });

  it('blocks disabled provider model discovery before upstream fetch', async () => {
    await expectReasoningDenied(
      '/api/provider/models',
      {
        protocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-openai',
        reasoningExecution: disabledPolicy,
      },
      { routeKind: 'provider_models', provider: 'openai' },
    );
  });

  it('blocks disabled provider connection tests before upstream fetch', async () => {
    await expectReasoningDenied(
      '/api/test/connection',
      {
        mode: 'provider',
        protocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-openai',
        model: 'gpt-test',
        reasoningExecution: disabledPolicy,
      },
      { routeKind: 'connection_test', provider: 'openai' },
    );
  });

  it('blocks disabled finalize egress before project lookup or upstream fetch', async () => {
    await expectReasoningDenied(
      '/api/projects/project-1/finalize/openai',
      {
        protocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-openai',
        model: 'gpt-test',
        reasoningExecution: disabledPolicy,
      },
      { routeKind: 'finalize', provider: 'openai' },
    );
  });

  it('rejects allowlisted OpenAI proxy egress with 403 Inferno-only', async () => {
    const fetchMock = stubUnexpectedUpstreamFetch();
    const res = await postJson('/api/proxy/openai/stream', {
      baseUrl: 'http://localhost:1234/v1/',
      apiKey: 'sk-openai',
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'hello' }],
      reasoningExecution: {
        mode: 'allowlist',
        allowedBaseUrls: ['http://localhost:1234/v1'],
        allowedModels: ['gpt-test'],
      },
    });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: 'FORBIDDEN', message: 'Only Inferno is available.' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('honors explicit allowlist denial flags for discovery, tests, and finalize', async () => {
    const policy = {
      mode: 'allowlist',
      allowedBaseUrls: ['http://localhost:1234/v1'],
      allowedModels: ['gpt-test'],
      denyProviderDiscovery: true,
      denyConnectionTests: true,
      denyFinalize: true,
    };

    await expectReasoningDenied(
      '/api/provider/models',
      {
        protocol: 'openai',
        baseUrl: 'http://localhost:1234/v1',
        apiKey: 'sk-openai',
        reasoningExecution: policy,
      },
      {
        routeKind: 'provider_models',
        provider: 'openai',
        code: 'reasoning_execution_not_allowlisted',
      },
    );
    await expectReasoningDenied(
      '/api/test/connection',
      {
        mode: 'provider',
        protocol: 'openai',
        baseUrl: 'http://localhost:1234/v1',
        apiKey: 'sk-openai',
        model: 'gpt-test',
        reasoningExecution: policy,
      },
      {
        routeKind: 'connection_test',
        provider: 'openai',
        code: 'reasoning_execution_not_allowlisted',
      },
    );
    await expectReasoningDenied(
      '/api/projects/project-1/finalize/openai',
      {
        protocol: 'openai',
        baseUrl: 'http://localhost:1234/v1',
        apiKey: 'sk-openai',
        model: 'gpt-test',
        reasoningExecution: policy,
      },
      {
        routeKind: 'finalize',
        provider: 'openai',
        code: 'reasoning_execution_not_allowlisted',
      },
    );
  });
});
