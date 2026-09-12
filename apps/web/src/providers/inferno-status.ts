/**
 * Inferno status / model catalogue / connection test.
 * Uses the daemon store and pinned host — never a client-typed URL or key.
 */
import type { ConnectionTestResponse, ProviderModelsResponse } from '../types';

export interface InfernoStatusResponse {
  ready: boolean;
  models: Array<{ id: string; label: string; ownedBy?: string }>;
  apiKeyConfigured: boolean;
  apiKeyTail: string | null;
}

export const INFERNO_MODELS_CACHE_KEY = 'inferno';
export const INFERNO_KEY_REQUIRED_EVENT = 'od:inferno-key-required';
export const INFERNO_STATUS_CHANGED_EVENT = 'od:inferno-status-changed';

export function notifyInfernoKeyRequired(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(INFERNO_KEY_REQUIRED_EVENT));
}

export function notifyInfernoStatusChanged(detail?: InfernoStatusResponse): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(INFERNO_STATUS_CHANGED_EVENT, { detail }));
}

function infernoErrorFromBody(status: number, body: unknown, fallback: string): Error {
  const nested = body && typeof body === 'object' && 'error' in body
    ? (body as { error?: { code?: unknown; message?: unknown } }).error
    : null;
  const code = typeof nested?.code === 'string' ? nested.code : undefined;
  const message = typeof nested?.message === 'string' && nested.message.trim()
    ? nested.message
    : fallback;
  const error = new Error(message) as Error & { code?: string; status?: number };
  if (code) error.code = code;
  error.status = status;
  return error;
}

async function readInfernoJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function fetchInfernoStatus(
  signal?: AbortSignal,
): Promise<InfernoStatusResponse> {
  const response = await fetch('/api/inferno/status', { signal });
  if (!response.ok) {
    throw infernoErrorFromBody(
      response.status,
      await readInfernoJson(response),
      `Inferno status ${response.status}`,
    );
  }
  return (await response.json()) as InfernoStatusResponse;
}

export async function saveInfernoApiKey(
  apiKey: string,
  signal?: AbortSignal,
): Promise<InfernoStatusResponse> {
  const response = await fetch('/api/inferno/key', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
    signal,
  });
  const body = await readInfernoJson(response);
  if (!response.ok) {
    throw infernoErrorFromBody(response.status, body, 'Inferno key save failed');
  }
  return body as InfernoStatusResponse;
}

export async function clearInfernoApiKey(
  signal?: AbortSignal,
): Promise<InfernoStatusResponse> {
  const response = await fetch('/api/inferno/key', {
    method: 'DELETE',
    signal,
  });
  const body = await readInfernoJson(response);
  if (!response.ok) {
    throw infernoErrorFromBody(response.status, body, 'Inferno key clear failed');
  }
  return body as InfernoStatusResponse;
}

export async function fetchInfernoProviderModels(
  signal?: AbortSignal,
): Promise<ProviderModelsResponse> {
  const start = Date.now();
  try {
    const status = await fetchInfernoStatus(signal);
    return {
      ok: true,
      kind: 'success',
      latencyMs: Date.now() - start,
      models: (status.models ?? []).map((model) => ({
        id: model.id,
        label: model.label?.trim() || model.id,
      })),
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    return {
      ok: false,
      kind: 'unknown',
      latencyMs: Date.now() - start,
      detail: err instanceof Error ? err.message : 'Inferno model discovery failed',
    };
  }
}

export async function testInfernoConnection(
  model: string,
  signal?: AbortSignal,
): Promise<ConnectionTestResponse> {
  const start = Date.now();
  try {
    const status = await fetchInfernoStatus(signal);
    if (status.ready) {
      return {
        ok: true,
        kind: 'success',
        latencyMs: Date.now() - start,
        model,
      };
    }
    if (!status.apiKeyConfigured) {
      return {
        ok: false,
        kind: 'auth_failed',
        latencyMs: Date.now() - start,
        model,
        detail: 'Inferno API key is required',
      };
    }
    return {
      ok: false,
      kind: 'unknown',
      latencyMs: Date.now() - start,
      model,
      detail: 'Inferno is not ready.',
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    return {
      ok: false,
      kind: 'unknown',
      latencyMs: Date.now() - start,
      model,
      detail: err instanceof Error ? err.message : 'Inferno connection test failed',
    };
  }
}
