import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  clearInfernoApiKey,
  infernoCredentialsPath,
  readInfernoApiKey,
  saveInfernoApiKey,
} from '../src/inferno/credentials.js';

describe('inferno credentials', () => {
  it('round-trips a key under the data dir and can clear it', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'inferno-cred-'));
    expect(infernoCredentialsPath(dataDir)).toBe(path.join(dataDir, 'secrets', 'inferno.json'));
    await saveInfernoApiKey(dataDir, ' sk-live-abcd ');
    expect(await readInfernoApiKey(dataDir)).toBe('sk-live-abcd');
    const raw = await readFile(infernoCredentialsPath(dataDir), 'utf8');
    expect(raw).toContain('sk-live-abcd');
    await clearInfernoApiKey(dataDir);
    expect(await readInfernoApiKey(dataDir)).toBeNull();
  });

  it('rejects empty keys', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'inferno-cred-'));
    await expect(saveInfernoApiKey(dataDir, '   ')).rejects.toMatchObject({
      code: 'INFERNO_KEY_REQUIRED',
    });
  });
});
