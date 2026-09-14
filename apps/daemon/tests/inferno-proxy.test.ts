import http from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveInfernoApiKey } from '../src/inferno/credentials.js';
import { registerChatRoutes } from '../src/routes/chat.js';
import {
  buildInfernoUpstreamRequest,
  openInfernoUpstream,
  resetInfernoProxyState,
} from '../src/inferno/proxy.js';

const realFetch = globalThis.fetch;
let server: http.Server | null = null;

afterEach(async () => {
  resetInfernoProxyState();
  vi.unstubAllGlobals();
  if (!server) return;
  const toClose = server;
  server = null;
  await new Promise<void>((resolve) => toClose.close(() => resolve()));
});

async function startInfernoChatApp(dataDir: string): Promise<string> {
  const app = express();
  app.use(express.json());
  registerChatRoutes(app, {
    db: {},
    design: { runs: { get: () => null } },
    http: {
      createSseResponse: (res: express.Response) => {
        if (!res.headersSent) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.flushHeaders?.();
        }
        return {
          send(event: string, data: unknown) {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
            return true;
          },
          end() {
            res.end();
          },
        };
      },
      sendApiError: (
        res: express.Response,
        status: number,
        code: string,
        message: string,
      ) => res.status(status).json({ error: { code, message } }),
    },
    paths: { RUNTIME_DATA_DIR: dataDir },
    chat: {},
    agents: {},
    critique: {
      critiqueArtifactsRoot: '/tmp/unused',
      critiqueResponseCapBytes: 1024,
      critiqueRunRegistry: {},
      handleCritiqueArtifact: () => (_req: express.Request, res: express.Response) => {
        res.status(200).send('artifact');
      },
      handleCritiqueInterrupt: () => (_req: express.Request, res: express.Response) => {
        res.status(202).json({ accepted: true });
      },
    },
    appConfig: { readAppConfig: async () => ({}) },
    validation: {},
    lifecycle: { isDaemonShuttingDown: () => false },
    telemetry: { reportFeedback: async () => ({ status: 'accepted' as const }) },
    authorizeProjectRequest: async () => true,
  } as any);

  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind');
  return `http://127.0.0.1:${address.port}`;
}

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

  it('ignores override baseUrl and stays on the pinned host', () => {
    const req = buildInfernoUpstreamRequest({
      dialect: 'openai',
      model: 'grok-4.5',
      apiKey: 'sk-test',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      baseUrl: 'https://api.openai.com/v1',
    });
    expect(req.url.hostname).toBe('router.tryopencomputer.com');
    expect(req.url.protocol).toBe('https:');
    expect(req.url.pathname).toBe('/v1/chat/completions');
  });
});

describe('openInfernoUpstream', () => {
  it('retries once on protocol-shape error and remembers the winner', async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes('/chat/completions')) {
        return new Response('unknown field: messages', { status: 400 });
      }
      return new Response('data: [DONE]\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    });

    const first = await openInfernoUpstream({
      model: 'grok-4.5',
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'hi' }],
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.dialect).toBe('anthropic');
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const second = await openInfernoUpstream({
      model: 'grok-4.5',
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'hi' }],
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.dialect).toBe('anthropic');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('returns MODEL_UNREACHABLE when both dialects fail shape checks', async () => {
    const fetchImpl = vi.fn(async () => new Response('invalid messages', { status: 400 }));
    const result = await openInfernoUpstream({
      model: 'grok-4.5',
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'hi' }],
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INFERNO_MODEL_UNREACHABLE');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('inferno chat routes', () => {
  const otherProviders = [
    'openai',
    'anthropic',
    'azure',
    'google',
    'ollama',
    'senseaudio',
    'aihubmix',
  ] as const;

  it.each(otherProviders)('rejects /api/proxy/%s/stream with 403', async (provider) => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'inferno-proxy-'));
    const baseUrl = await startInfernoChatApp(dataDir);
    const res = await realFetch(`${baseUrl}/api/proxy/${provider}/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-client',
        model: 'gpt-test',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: 'FORBIDDEN', message: 'Only Inferno is available.' },
    });
  });

  it('returns 401 INFERNO_KEY_REQUIRED when no daemon key is stored', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'inferno-proxy-'));
    const baseUrl = await startInfernoChatApp(dataDir);
    const res = await realFetch(`${baseUrl}/api/proxy/inferno/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'grok-4.5',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: 'INFERNO_KEY_REQUIRED' },
    });
  });

  it('returns INFERNO_NOT_READY when a key is stored but models are not ready', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'inferno-proxy-'));
    const origin = { current: '' };
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      if (origin.current && url.startsWith(origin.current)) return realFetch(input, init);
      if (url === 'https://router.tryopencomputer.com/v1/models') {
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(`unexpected ${url}`, { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await saveInfernoApiKey(dataDir, 'sk-live-abcd');
    origin.current = await startInfernoChatApp(dataDir);

    const res = await realFetch(`${origin.current}/api/proxy/inferno/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'grok-4.5',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: 'INFERNO_NOT_READY' },
    });
    const upstreamCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes('router.tryopencomputer.com'),
    );
    expect(upstreamCalls).toHaveLength(1);
    expect(String(upstreamCalls[0]?.[0])).toBe('https://router.tryopencomputer.com/v1/models');
  });

  it('PUT/GET/DELETE key never return the raw key and ignore client baseUrl on stream', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'inferno-proxy-'));
    const origin = { current: '' };
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      if (origin.current && url.startsWith(origin.current)) return realFetch(input, init);
      if (url === 'https://router.tryopencomputer.com/v1/models') {
        return new Response(
          JSON.stringify({ data: [{ id: 'grok-4.5', owned_by: 'xai' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === 'https://router.tryopencomputer.com/v1/chat/completions') {
        return new Response(
          ['data: {"choices":[{"delta":{"content":"hi"}}]}', '', 'data: [DONE]', ''].join('\n'),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        );
      }
      return new Response(`unexpected ${url}`, { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    origin.current = await startInfernoChatApp(dataDir);

    const put = await realFetch(`${origin.current}/api/inferno/key`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: 'sk-live-abcd' }),
    });
    const putJson = await put.json();
    expect(put.status).toBe(200);
    expect(putJson).toMatchObject({
      ready: true,
      apiKeyConfigured: true,
      apiKeyTail: 'abcd',
    });
    expect(JSON.stringify(putJson)).not.toContain('sk-live-abcd');

    const status = await realFetch(`${origin.current}/api/inferno/status`);
    const statusJson = await status.json();
    expect(statusJson).toMatchObject({
      ready: true,
      apiKeyConfigured: true,
      apiKeyTail: 'abcd',
    });
    expect(JSON.stringify(statusJson)).not.toContain('sk-live-abcd');

    const stream = await realFetch(`${origin.current}/api/proxy/inferno/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-client',
        model: 'grok-4.5',
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    const streamText = await stream.text();
    expect(stream.status).toBe(200);
    expect(streamText).toContain('event: start');
    expect(streamText).toContain('event: delta');
    expect(streamText).toContain('"delta":"hi"');
    expect(streamText).toContain('event: end');

    const upstreamCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes('router.tryopencomputer.com'),
    );
    expect(upstreamCalls.some(([input]) => String(input).includes('api.openai.com'))).toBe(false);
    const completion = upstreamCalls.find(([input]) =>
      String(input).includes('/v1/chat/completions'),
    );
    expect(completion).toBeTruthy();
    expect(completion?.[1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: 'Bearer sk-live-abcd' }),
    });

    const del = await realFetch(`${origin.current}/api/inferno/key`, { method: 'DELETE' });
    const delJson = await del.json();
    expect(delJson).toMatchObject({
      ready: false,
      apiKeyConfigured: false,
      apiKeyTail: null,
    });
  });

  it('maps Inferno SSE upstream_error to INFERNO_UNAVAILABLE', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'inferno-proxy-'));
    const origin = { current: '' };
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      if (origin.current && url.startsWith(origin.current)) return realFetch(input, init);
      if (url === 'https://router.tryopencomputer.com/v1/models') {
        return new Response(
          JSON.stringify({ data: [{ id: 'gpt-5.6-luna', owned_by: 'openai' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === 'https://router.tryopencomputer.com/v1/chat/completions') {
        return new Response(
          [
            'data: {"error":{"type":"upstream_error","message":"Upstream service temporarily unavailable"}}',
            '',
            'data: [DONE]',
            '',
          ].join('\n'),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        );
      }
      return new Response(`unexpected ${url}`, { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);
    await saveInfernoApiKey(dataDir, 'sk-live-abcd');
    origin.current = await startInfernoChatApp(dataDir);

    const stream = await realFetch(`${origin.current}/api/proxy/inferno/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5.6-luna',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    const streamText = await stream.text();
    expect(stream.status).toBe(200);
    expect(streamText).toContain('event: error');
    expect(streamText).toContain('INFERNO_UNAVAILABLE');
    expect(streamText).not.toContain('"UPSTREAM_UNAVAILABLE"');
  });

  it('treats an Inferno stream that ends with no tokens as a failure', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'inferno-proxy-'));
    const origin = { current: '' };
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      if (origin.current && url.startsWith(origin.current)) return realFetch(input, init);
      if (url === 'https://router.tryopencomputer.com/v1/models') {
        return new Response(
          JSON.stringify({ data: [{ id: 'gpt-5.6-luna', owned_by: 'openai' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === 'https://router.tryopencomputer.com/v1/chat/completions') {
        return new Response(
          ['data: [DONE]', ''].join('\n'),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        );
      }
      return new Response(`unexpected ${url}`, { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);
    await saveInfernoApiKey(dataDir, 'sk-live-abcd');
    origin.current = await startInfernoChatApp(dataDir);

    const stream = await realFetch(`${origin.current}/api/proxy/inferno/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5.6-luna',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    const streamText = await stream.text();
    expect(stream.status).toBe(200);
    expect(streamText).toContain('event: error');
    expect(streamText).toContain('INFERNO_UNAVAILABLE');
    expect(streamText).not.toMatch(/event: end/);
  });
});
