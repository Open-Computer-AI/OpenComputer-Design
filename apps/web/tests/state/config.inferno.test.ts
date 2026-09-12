import { describe, expect, it } from 'vitest';
import { INFERNO_BASE_URL } from '../../src/inferno';
import { DEFAULT_CONFIG, KNOWN_PROVIDERS } from '../../src/state/config';
import { API_PROTOCOL_AGENT_IDS, INFERNO_AGENT_ID } from '../../src/utils/byokProvider';

describe('inferno-only web config', () => {
  it('exposes only Inferno and starts in api mode with onboarding skipped', () => {
    expect(KNOWN_PROVIDERS).toHaveLength(1);
    expect(KNOWN_PROVIDERS[0]?.label).toBe('Inferno');
    expect(KNOWN_PROVIDERS[0]?.baseUrl).toBe('https://router.tryopencomputer.com/v1');
    expect(DEFAULT_CONFIG.mode).toBe('api');
    expect(DEFAULT_CONFIG.onboardingCompleted).toBe(true);
    expect(DEFAULT_CONFIG.agentId).toBe('inferno');
  });

  it('pins the Inferno base URL and maps every API protocol to the inferno agent', () => {
    expect(INFERNO_BASE_URL).toBe('https://router.tryopencomputer.com/v1');
    expect(DEFAULT_CONFIG.baseUrl).toBe(INFERNO_BASE_URL);
    expect(KNOWN_PROVIDERS[0]?.requiresApiKey).toBe(true);
    expect(INFERNO_AGENT_ID).toBe('inferno');
    expect(new Set(Object.values(API_PROTOCOL_AGENT_IDS))).toEqual(new Set(['inferno']));
  });
});
