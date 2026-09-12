import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveInfernoApiKey } from '../src/inferno/credentials.js';
import { detectAgent } from '../src/runtimes/detection.js';
import { AGENT_DEFS, SHIPPED_AGENT_DEFS, getAgentDef, readLocalAgentProfileDefs } from '../src/runtimes/registry.js';

describe('inferno-only registry', () => {
  it('ships only inferno', () => {
    expect(SHIPPED_AGENT_DEFS.map((d) => d.id)).toEqual(['inferno']);
    expect(getAgentDef('claude')).toBeNull();
    expect(getAgentDef('codex')).toBeNull();
    expect(getAgentDef('amr')).toBeNull();
    expect(getAgentDef('opencode')).toBeNull();
    expect(getAgentDef('inferno')?.synthetic).toBe(true);
  });

  it('does not merge local CLI profiles', () => {
    expect(readLocalAgentProfileDefs()).toEqual([]);
    expect(AGENT_DEFS.map((d) => d.id)).toEqual(['inferno']);
  });

  it('refuses to spawn a CLI', () => {
    expect(() => getAgentDef('inferno')!.buildArgs('hi', [])).toThrow(
      'Inferno is HTTP-only; do not spawn a CLI',
    );
  });
});

describe('synthetic inferno detection', () => {
  const originalDataDir = process.env.OD_DATA_DIR;

  afterEach(() => {
    process.env.OD_DATA_DIR = originalDataDir;
    vi.restoreAllMocks();
  });

  it('is available without PATH or version probes and does not call buildArgs', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'inferno-detect-missing-'));
    process.env.OD_DATA_DIR = dataDir;
    const def = getAgentDef('inferno');
    expect(def).not.toBeNull();
    const buildArgs = vi.spyOn(def!, 'buildArgs');
    const detected = await detectAgent(def!);
    expect(detected.available).toBe(true);
    expect(detected.authStatus).toBe('missing');
    expect(buildArgs).not.toHaveBeenCalled();
  });

  it('sets authStatus from Inferno credentials', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'inferno-detect-'));
    process.env.OD_DATA_DIR = dataDir;
    const def = getAgentDef('inferno')!;
    expect((await detectAgent(def)).authStatus).toBe('missing');
    await saveInfernoApiKey(dataDir, 'sk-live-abcd');
    expect((await detectAgent(def)).authStatus).toBe('ok');
  });
});
