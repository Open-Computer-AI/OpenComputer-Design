import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveDataDir } from '../src/daemon-paths.js';
import { saveInfernoApiKey } from '../src/inferno/credentials.js';
import { detectAgent } from '../src/runtimes/detection.js';
import { AGENT_DEFS, SHIPPED_AGENT_DEFS, getAgentDef, readLocalAgentProfileDefs } from '../src/runtimes/registry.js';

type InfernoTestGlobal = typeof globalThis & {
  __infernoTestProjectRoot?: string | null;
};

vi.mock('../src/project-root.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/project-root.js')>();
  return {
    ...actual,
    resolveProjectRootFromNestedModule: (moduleDir: string) => {
      const override = (globalThis as InfernoTestGlobal).__infernoTestProjectRoot;
      return override ?? actual.resolveProjectRootFromNestedModule(moduleDir);
    },
  };
});

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
    (globalThis as InfernoTestGlobal).__infernoTestProjectRoot = null;
    if (originalDataDir === undefined) delete process.env.OD_DATA_DIR;
    else process.env.OD_DATA_DIR = originalDataDir;
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

  it('reads Inferno key from default .od when OD_DATA_DIR is unset', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'inferno-default-od-'));
    const dataDir = resolveDataDir(undefined, projectRoot);
    expect(dataDir).toBe(path.join(projectRoot, '.od'));

    delete process.env.OD_DATA_DIR;
    (globalThis as InfernoTestGlobal).__infernoTestProjectRoot = projectRoot;
    await saveInfernoApiKey(dataDir, 'sk-live-default-od');

    const detected = await detectAgent(getAgentDef('inferno')!);
    expect(detected.available).toBe(true);
    expect(detected.authStatus).toBe('ok');
  });
});
