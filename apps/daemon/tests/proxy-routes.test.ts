import type http from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import * as platform from '@open-design/platform';
import { startServer } from '../src/server.js';

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

const BLOCKED_PROXY_PROVIDERS = [
  'openai',
  'anthropic',
  'azure',
  'google',
  'ollama',
  'senseaudio',
  'aihubmix',
] as const;

describe('API proxy routes', () => {
  const realFetch = globalThis.fetch;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  let server: http.Server;
  let baseUrl: string;

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

  afterEach(async () => {
    if (originalMediaConfigDir == null) delete process.env.OD_MEDIA_CONFIG_DIR;
    else process.env.OD_MEDIA_CONFIG_DIR = originalMediaConfigDir;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it.each(BLOCKED_PROXY_PROVIDERS)(
    'rejects /api/proxy/%s/stream with 403 Inferno-only',
    async (provider) => {
      const fetchMock = vi.fn((input: FetchInput, init?: FetchInit) => {
        const url = String(input);
        if (url.startsWith(baseUrl)) return realFetch(input, init);
        throw new Error(`unexpected upstream fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const res = await realFetch(`${baseUrl}/api/proxy/${provider}/stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          baseUrl: 'https://api.example.com/v1',
          apiKey: 'sk-test',
          model: 'gpt-test',
          messages: [{ role: 'user', content: 'hello' }],
        }),
      });

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toMatchObject({
        error: { code: 'FORBIDDEN', message: 'Only Inferno is available.' },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('rejects pluginId on blocked proxy routes with 403 Inferno-only', async () => {
    const res = await realFetch(`${baseUrl}/api/proxy/openai/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-test',
        messages: [{ role: 'user', content: 'hello' }],
        pluginId: 'sample-plugin',
      }),
    });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: 'FORBIDDEN', message: 'Only Inferno is available.' },
    });
  });

  it('uses the live proxy dispatcher for ElevenLabs voice discovery', async () => {
    const configDir = await mkdtemp(path.join(tmpdir(), 'od-elevenlabs-proxy-route-'));
    process.env.OD_MEDIA_CONFIG_DIR = configDir;
    await mkdir(configDir, { recursive: true });
    await writeFile(path.join(configDir, 'media-config.json'), JSON.stringify({
      providers: {
        elevenlabs: {
          apiKey: 'eleven-test-key',
          baseUrl: 'https://elevenlabs-gateway.example.test',
        },
      },
    }), 'utf8');

    const proxySpy = vi.spyOn(platform, 'resolveSystemProxyEnv').mockReturnValue({
      HTTPS_PROXY: 'http://system-proxy.internal:8443',
      NODE_USE_ENV_PROXY: '1',
    });
    const fetchMock = vi.fn((input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      expect(url).toBe('https://elevenlabs-gateway.example.test/v2/voices?page_size=100');
      expect(init?.dispatcher).toBeDefined();
      return Promise.resolve(Response.json({
        voices: [{ voice_id: 'voice-1', name: 'Rachel' }],
      }));
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const res = await realFetch(`${baseUrl}/api/media/providers/elevenlabs/voices?limit=100`);
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        voices: [{ voiceId: 'voice-1', name: 'Rachel' }],
      });
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) => input === 'https://elevenlabs-gateway.example.test/v2/voices?page_size=100' && init?.dispatcher,
        ),
      ).toBe(true);
    } finally {
      proxySpy.mockRestore();
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('uses the live proxy dispatcher for Tavily research search', async () => {
    const configDir = await mkdtemp(path.join(tmpdir(), 'od-tavily-proxy-route-'));
    process.env.OD_MEDIA_CONFIG_DIR = configDir;
    await mkdir(configDir, { recursive: true });
    await writeFile(path.join(configDir, 'media-config.json'), JSON.stringify({
      providers: {
        tavily: {
          apiKey: 'tavily-test-key',
          baseUrl: 'https://tavily-gateway.example.test',
        },
      },
    }), 'utf8');

    const proxySpy = vi.spyOn(platform, 'resolveSystemProxyEnv').mockReturnValue({
      HTTPS_PROXY: 'http://system-proxy.internal:8443',
      NODE_USE_ENV_PROXY: '1',
    });
    const fetchMock = vi.fn((input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      expect(url).toBe('https://tavily-gateway.example.test/search');
      expect(init?.dispatcher).toBeDefined();
      return Promise.resolve(Response.json({
        answer: 'Proxy-safe summary',
        results: [
          {
            title: 'Proxy-safe source',
            url: 'https://example.test/source',
            content: 'Snippet',
          },
        ],
      }));
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const res = await realFetch(`${baseUrl}/api/research/search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query: 'proxy-aware research',
          providers: ['tavily'],
        }),
      });
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual(expect.objectContaining({
        query: 'proxy-aware research',
        provider: 'tavily',
        summary: 'Proxy-safe summary',
        sources: [
          expect.objectContaining({
            title: 'Proxy-safe source',
            url: 'https://example.test/source',
          }),
        ],
      }));
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) => input === 'https://tavily-gateway.example.test/search' && init?.dispatcher,
        ),
      ).toBe(true);
    } finally {
      proxySpy.mockRestore();
      await rm(configDir, { recursive: true, force: true });
    }
  });
});
