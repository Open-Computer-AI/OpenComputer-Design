import { googleStreamGenerateContentUrl } from '../integrations/google-models.js';
import { buildOpenAIChatTokenParam } from '../integrations/openai-chat-token-params.js';
import { INFERNO_BASE_URL } from './constants.js';
import { INFERNO_ERROR_CODES, type InfernoErrorCode } from './errors.js';
import { assertInfernoUrl, InfernoError } from './models.js';
import {
  isInfernoProtocolShapeError,
  nextInfernoDialect,
  resolveInfernoDialect,
  type InfernoDialect,
} from './protocol.js';

export type InfernoUpstreamRequest = {
  url: URL;
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

export type BuildInfernoUpstreamRequestInput = {
  dialect: InfernoDialect;
  model: string;
  apiKey: string;
  systemPrompt?: unknown;
  messages?: unknown;
  maxTokens?: unknown;
  /** Ignored. Upstream always uses the pinned Inferno host. */
  baseUrl?: unknown;
};

const dialectWinners = new Map<string, InfernoDialect>();

export function resetInfernoProxyState(): void {
  dialectWinners.clear();
}

export function rememberInfernoDialect(model: string, dialect: InfernoDialect): void {
  dialectWinners.set(model, dialect);
}

export function resolveInfernoDialectWithMemory(
  model: string,
  ownedBy?: string | null,
): InfernoDialect {
  return dialectWinners.get(model) ?? resolveInfernoDialect(model, ownedBy);
}

function infernoV1Url(path: string): URL {
  const base = INFERNO_BASE_URL.endsWith('/') ? INFERNO_BASE_URL : `${INFERNO_BASE_URL}/`;
  const url = new URL(path, base);
  assertInfernoUrl(url);
  return url;
}

function effectiveMaxTokens(maxTokens: unknown): number {
  return typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : 8192;
}

function openaiBody(
  model: string,
  systemPrompt: unknown,
  messages: unknown,
  maxTokens: unknown,
): Record<string, unknown> {
  const payloadMessages = Array.isArray(messages) ? [...messages] : [];
  if (typeof systemPrompt === 'string' && systemPrompt) {
    payloadMessages.unshift({ role: 'system', content: systemPrompt });
  }
  return {
    model,
    messages: payloadMessages,
    ...buildOpenAIChatTokenParam(model, effectiveMaxTokens(maxTokens)),
    stream: true,
  };
}

function anthropicBody(
  model: string,
  systemPrompt: unknown,
  messages: unknown,
  maxTokens: unknown,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model,
    max_tokens: effectiveMaxTokens(maxTokens),
    messages: Array.isArray(messages) ? messages : [],
    stream: true,
  };
  if (typeof systemPrompt === 'string' && systemPrompt) {
    payload.system = systemPrompt;
  }
  return payload;
}

function googleBody(
  systemPrompt: unknown,
  messages: unknown,
  maxTokens: unknown,
): Record<string, unknown> {
  const contents = (Array.isArray(messages) ? messages : []).map((message: any) => ({
    role: message?.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message?.content }],
  }));
  const payload: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: effectiveMaxTokens(maxTokens),
    },
  };
  if (typeof systemPrompt === 'string' && systemPrompt) {
    payload.systemInstruction = { parts: [{ text: systemPrompt }] };
  }
  return payload;
}

export function buildInfernoUpstreamRequest(
  input: BuildInfernoUpstreamRequestInput,
): InfernoUpstreamRequest {
  const { dialect, model, apiKey, systemPrompt, messages, maxTokens } = input;
  const authorization = `Bearer ${apiKey}`;
  if (dialect === 'openai') {
    return {
      url: infernoV1Url('chat/completions'),
      headers: { Authorization: authorization },
      body: openaiBody(model, systemPrompt, messages, maxTokens),
    };
  }
  if (dialect === 'anthropic') {
    return {
      url: infernoV1Url('messages'),
      headers: {
        Authorization: authorization,
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: anthropicBody(model, systemPrompt, messages, maxTokens),
    };
  }
  const url = new URL(googleStreamGenerateContentUrl(INFERNO_BASE_URL, model));
  assertInfernoUrl(url);
  return {
    url,
    headers: {
      Authorization: authorization,
      'x-goog-api-key': apiKey,
    },
    body: googleBody(systemPrompt, messages, maxTokens),
  };
}

export function infernoErrorHttpStatus(code: InfernoErrorCode): number {
  if (code === INFERNO_ERROR_CODES.KEY_REQUIRED || code === INFERNO_ERROR_CODES.KEY_REJECTED) {
    return 401;
  }
  if (code === INFERNO_ERROR_CODES.RATE_LIMITED) return 429;
  if (code === INFERNO_ERROR_CODES.MODEL_UNREACHABLE) return 502;
  return 503;
}

function mapInfernoUpstreamError(status: number, bodyText: string): InfernoError {
  if (status === 401 || status === 403) {
    return new InfernoError(INFERNO_ERROR_CODES.KEY_REJECTED, 'Inferno rejected this key.');
  }
  if (status === 429) {
    return new InfernoError(INFERNO_ERROR_CODES.RATE_LIMITED, 'Inferno rate limited.');
  }
  if (isInfernoProtocolShapeError(status, bodyText)) {
    return new InfernoError(INFERNO_ERROR_CODES.MODEL_UNREACHABLE, 'Inferno model unreachable.');
  }
  return new InfernoError(
    INFERNO_ERROR_CODES.UNAVAILABLE,
    `Cannot reach Inferno (${status}).`,
  );
}

export type OpenInfernoUpstreamResult =
  | { ok: true; dialect: InfernoDialect; response: Response }
  | { ok: false; error: InfernoError };

export async function openInfernoUpstream(opts: {
  model: string;
  apiKey: string;
  systemPrompt?: unknown;
  messages?: unknown;
  maxTokens?: unknown;
  ownedBy?: string | null;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  requestInit?: RequestInit;
}): Promise<OpenInfernoUpstreamResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let dialect = resolveInfernoDialectWithMemory(opts.model, opts.ownedBy);
  let lastError: InfernoError | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const req = buildInfernoUpstreamRequest({
      dialect,
      model: opts.model,
      apiKey: opts.apiKey,
      systemPrompt: opts.systemPrompt,
      messages: opts.messages,
      maxTokens: opts.maxTokens,
    });
    let response: Response;
    try {
      const init: RequestInit = {
        ...opts.requestInit,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...req.headers,
        },
        body: JSON.stringify(req.body),
        redirect: 'error',
      };
      if (opts.signal) init.signal = opts.signal;
      response = await fetchImpl(req.url, init);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Cannot reach Inferno';
      lastError = new InfernoError(INFERNO_ERROR_CODES.UNAVAILABLE, message);
      break;
    }
    if (response.ok) {
      rememberInfernoDialect(opts.model, dialect);
      return { ok: true, dialect, response };
    }
    const bodyText = await response.text();
    lastError = mapInfernoUpstreamError(response.status, bodyText);
    if (attempt === 0 && isInfernoProtocolShapeError(response.status, bodyText)) {
      dialect = nextInfernoDialect(dialect);
      continue;
    }
    break;
  }

  return {
    ok: false,
    error:
      lastError ??
      new InfernoError(INFERNO_ERROR_CODES.MODEL_UNREACHABLE, 'Inferno model unreachable.'),
  };
}
