import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamMessage } from '../../src/providers/anthropic';
import { streamMessageInferno } from '../../src/providers/inferno';
import { composeInfernoSystemPrompt } from '../../src/providers/inferno-prompt';
import {
  clearInfernoApiKey,
  fetchInfernoProviderModels,
  saveInfernoApiKey,
  testInfernoConnection,
} from '../../src/providers/inferno-status';
import type { AppConfig, ChatMessage } from '../../src/types';

afterEach(() => {
  vi.unstubAllGlobals();
});

function sseResponse(text: string): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    },
  );
}

function createStreamHandlers() {
  return {
    onDelta: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  };
}

const cfg = {
  mode: 'api',
  apiKey: 'should-not-be-sent',
  baseUrl: 'https://api.openai.com/v1',
  model: 'inferno-model',
  agentId: 'inferno',
  skillId: null,
  designSystemId: null,
} as AppConfig;

const history: ChatMessage[] = [{ id: '1', role: 'user', content: 'hello' }];

describe('streamMessageInferno', () => {
  it('POSTs /api/proxy/inferno/stream without baseUrl or apiKey', async () => {
    const handlers = createStreamHandlers();
    const fetchMock = vi.fn(async () =>
      sseResponse(['event: delta', 'data: {"text":"hi"}', '', 'event: end', 'data: {}', ''].join('\n')),
    );
    vi.stubGlobal('fetch', fetchMock);

    await streamMessageInferno(cfg, 'sys', history, new AbortController().signal, handlers);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/proxy/inferno/stream', expect.any(Object));
    const init = (fetchMock.mock.calls[0] as unknown as [unknown, RequestInit | undefined] | undefined)?.[1];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'inferno-model',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hello' }],
    });
    expect(body).not.toHaveProperty('baseUrl');
    expect(body).not.toHaveProperty('apiKey');
    expect(handlers.onDelta).toHaveBeenCalledWith('hi');
    expect(handlers.onDone).toHaveBeenCalledWith('hi');
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('streams without a client apiKey so the daemon store can supply it', async () => {
    const handlers = createStreamHandlers();
    const fetchMock = vi.fn(async () =>
      sseResponse(['event: end', 'data: {}', ''].join('\n')),
    );
    vi.stubGlobal('fetch', fetchMock);

    await streamMessageInferno(
      { ...cfg, apiKey: '' },
      'sys',
      history,
      new AbortController().signal,
      handlers,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(handlers.onDone).toHaveBeenCalled();
  });
});

describe('streamMessage', () => {
  it('routes api mode to the Inferno proxy', async () => {
    const handlers = createStreamHandlers();
    const fetchMock = vi.fn(async () =>
      sseResponse(['event: end', 'data: {}', ''].join('\n')),
    );
    vi.stubGlobal('fetch', fetchMock);

    await streamMessage(cfg, 'sys', history, new AbortController().signal, handlers);

    expect(fetchMock).toHaveBeenCalledWith('/api/proxy/inferno/stream', expect.any(Object));
    const init = (fetchMock.mock.calls[0] as unknown as [unknown, RequestInit | undefined] | undefined)?.[1];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty('baseUrl');
    expect(body).not.toHaveProperty('apiKey');
  });
});

describe('Inferno daemon store helpers', () => {
  it('fetches models and tests connection without sending baseUrl or apiKey', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/inferno/status');
      return Response.json({
        ready: true,
        models: [{ id: 'inferno-1', label: 'Inferno 1' }],
        apiKeyConfigured: true,
        apiKeyTail: 'abcd',
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const models = await fetchInfernoProviderModels();
    const test = await testInfernoConnection('inferno-1');

    expect(models.ok).toBe(true);
    expect(models.models?.map((model) => model.id)).toEqual(['inferno-1']);
    expect(test.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls as unknown as Array<[unknown, RequestInit | undefined]>) {
      expect(String(call[0])).toBe('/api/inferno/status');
      expect(call[1]?.body).toBeUndefined();
    }
  });

  it('PUTs and DELETEs the Inferno key through the daemon store', async () => {
    const status = {
      ready: true,
      models: [{ id: 'inferno-1', label: 'Inferno 1' }],
      apiKeyConfigured: true,
      apiKeyTail: 'abcd',
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/inferno/key' && init?.method === 'PUT') {
        expect(JSON.parse(String(init.body))).toEqual({ apiKey: 'sk-live-abcd' });
        return Response.json(status);
      }
      if (url === '/api/inferno/key' && init?.method === 'DELETE') {
        return Response.json({
          ready: false,
          models: [],
          apiKeyConfigured: false,
          apiKeyTail: null,
        });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveInfernoApiKey('sk-live-abcd')).resolves.toEqual(status);
    await expect(clearInfernoApiKey()).resolves.toMatchObject({
      ready: false,
      apiKeyConfigured: false,
    });
  });

  it('composes a non-empty Inferno system prompt', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/memory/system-prompt') {
        return Response.json({ body: 'Remember the house palette.' });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const prompt = await composeInfernoSystemPrompt({ locale: 'en' });
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('Remember the house palette.');
  });
});
