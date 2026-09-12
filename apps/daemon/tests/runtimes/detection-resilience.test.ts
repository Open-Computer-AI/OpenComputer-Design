// Regression coverage for issue #2297: when a single agent's launch
// resolution throws (e.g. a transient filesystem error during PATH
// walking on Windows packaged builds), `detectAgents()` used to reject
// the whole `Promise.all` and the `/api/agents` route caught it back to
// an empty array. The UI then showed only the cloud/BYOK fallback even
// though every other CLI was healthy. These tests pin the per-probe
// isolation invariant: one broken adapter must not blank the picker.
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('../../src/runtimes/launch.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/runtimes/launch.js')>();
  return {
    ...actual,
    resolveAgentLaunch: vi.fn(actual.resolveAgentLaunch),
    applyAgentLaunchEnv: vi.fn(actual.applyAgentLaunchEnv),
  };
});

import * as launchModule from '../../src/runtimes/launch.js';
import { detectAgents } from '../../src/runtimes/detection.js';
import { AGENT_DEFS } from '../../src/runtimes/registry.js';

const mockedResolveAgentLaunch = vi.mocked(launchModule.resolveAgentLaunch);
const mockedApplyAgentLaunchEnv = vi.mocked(launchModule.applyAgentLaunchEnv);
const originalResolveImpl = mockedResolveAgentLaunch.getMockImplementation()!;
const originalApplyImpl = mockedApplyAgentLaunchEnv.getMockImplementation()!;

afterEach(() => {
  mockedResolveAgentLaunch.mockImplementation(originalResolveImpl);
  mockedApplyAgentLaunchEnv.mockImplementation(originalApplyImpl);
});

test('detectAgents lists only Inferno and never probes a CLI launch path', async () => {
  mockedResolveAgentLaunch.mockImplementation(() => {
    throw new Error('synthetic FS throw during PATH walk');
  });

  const agents = await detectAgents();

  expect(AGENT_DEFS.map((def) => def.id)).toEqual(['inferno']);
  expect(agents.map((agent) => agent.id)).toEqual(['inferno']);
  expect(agents[0]?.available).toBe(true);
  expect(agents[0]?.id).toBe('inferno');
  expect(mockedResolveAgentLaunch).not.toHaveBeenCalled();
  expect(mockedApplyAgentLaunchEnv).not.toHaveBeenCalled();
});

test('detectAgents still lists Inferno when applyAgentLaunchEnv would throw', async () => {
  mockedApplyAgentLaunchEnv.mockImplementation(() => {
    throw new Error('synthetic env construction error');
  });

  const agents = await detectAgents();

  expect(agents.length).toBe(AGENT_DEFS.length);
  expect(agents.map((agent) => agent.id)).toEqual(['inferno']);
  expect(agents[0]?.available).toBe(true);
  expect(mockedApplyAgentLaunchEnv).not.toHaveBeenCalled();
});
