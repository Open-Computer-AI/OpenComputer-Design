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

export async function fetchInfernoStatus(
  signal?: AbortSignal,
): Promise<InfernoStatusResponse> {
  const response = await fetch('/api/inferno/status', { signal });
  if (!response.ok) {
    throw new Error(`Inferno status ${response.status}`);
  }
  return (await response.json()) as InfernoStatusResponse;
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
