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
