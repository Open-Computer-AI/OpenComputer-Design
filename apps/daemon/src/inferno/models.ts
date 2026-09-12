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
