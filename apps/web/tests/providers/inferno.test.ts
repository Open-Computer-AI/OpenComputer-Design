import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamMessage } from '../../src/providers/anthropic';
import { streamMessageInferno } from '../../src/providers/inferno';
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
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
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
  });
});
