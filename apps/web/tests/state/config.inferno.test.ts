import { afterEach, describe, expect, it, vi } from 'vitest';
import { INFERNO_BASE_URL } from '../../src/inferno';
import {
  BYOK_PROVIDER_PRESETS,
  DEFAULT_CONFIG,
  KNOWN_PROVIDERS,
  loadConfig,
  mergeDaemonConfig,
} from '../../src/state/config';
import { API_PROTOCOL_AGENT_IDS, INFERNO_AGENT_ID } from '../../src/utils/byokProvider';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    store.delete(key);
  }),
  clear: vi.fn(() => {
    store.clear();
  }),
});

afterEach(() => {
  store.clear();
});

describe('inferno-only web config', () => {
  it('exposes only Inferno and starts in api mode with onboarding skipped', () => {
    expect(KNOWN_PROVIDERS).toHaveLength(1);
    expect(KNOWN_PROVIDERS[0]?.label).toBe('Inferno');
    expect(KNOWN_PROVIDERS[0]?.baseUrl).toBe('https://router.tryopencomputer.com/v1');
    expect(DEFAULT_CONFIG.mode).toBe('api');
    expect(DEFAULT_CONFIG.onboardingCompleted).toBe(true);
    expect(DEFAULT_CONFIG.agentId).toBe('inferno');
    expect(BYOK_PROVIDER_PRESETS).toHaveLength(1);
    expect(BYOK_PROVIDER_PRESETS[0]?.id).toBe('inferno');
  });

  it('pins the Inferno base URL and maps every API protocol to the inferno agent', () => {
    expect(INFERNO_BASE_URL).toBe('https://router.tryopencomputer.com/v1');
    expect(DEFAULT_CONFIG.baseUrl).toBe(INFERNO_BASE_URL);
    expect(DEFAULT_CONFIG.apiProtocol).toBe('openai');
    expect(KNOWN_PROVIDERS[0]?.requiresApiKey).toBe(true);
    expect(INFERNO_AGENT_ID).toBe('inferno');
    expect(new Set(Object.values(API_PROTOCOL_AGENT_IDS))).toEqual(new Set(['inferno']));
  });

  it('pins baseUrl and apiProtocol on loadConfig and mergeDaemonConfig', () => {
    store.set('open-design:config', JSON.stringify({
      ...DEFAULT_CONFIG,
      mode: 'daemon',
      agentId: 'claude',
      apiProtocol: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
    }));
    const loaded = loadConfig();
    expect(loaded.mode).toBe('api');
    expect(loaded.agentId).toBe('inferno');
    expect(loaded.apiProtocol).toBe('openai');
    expect(loaded.baseUrl).toBe(INFERNO_BASE_URL);
    expect(loaded.apiProviderBaseUrl).toBe(INFERNO_BASE_URL);

    const merged = mergeDaemonConfig(
      {
        ...DEFAULT_CONFIG,
        apiProtocol: 'google',
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiProviderBaseUrl: null,
        agentId: 'codex',
        mode: 'daemon',
      },
      { agentId: 'claude', onboardingCompleted: false },
    );
    expect(merged.mode).toBe('api');
    expect(merged.agentId).toBe('inferno');
    expect(merged.apiProtocol).toBe('openai');
    expect(merged.baseUrl).toBe(INFERNO_BASE_URL);
    expect(merged.apiProviderBaseUrl).toBe(INFERNO_BASE_URL);
    expect(merged.onboardingCompleted).toBe(true);
  });
});
