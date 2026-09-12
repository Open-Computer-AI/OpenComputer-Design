import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { INFERNO_ERROR_CODES } from './errors.js';
import { InfernoError } from './models.js';

export function infernoCredentialsPath(dataDir: string): string {
  return path.join(dataDir, 'secrets', 'inferno.json');
}

export function infernoKeyTail(key: string): string {
  return key.slice(-4);
}

export async function saveInfernoApiKey(dataDir: string, key: string): Promise<void> {
  const apiKey = key.trim();
  if (!apiKey) {
    throw new InfernoError(INFERNO_ERROR_CODES.KEY_REQUIRED, 'Inferno API key is required');
  }

  const filePath = infernoCredentialsPath(dataDir);
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });

  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = `${JSON.stringify({ apiKey }, null, 2)}\n`;
  await writeFile(tempPath, payload, { encoding: 'utf8', mode: 0o600 });
  await rename(tempPath, filePath);
  try {
    await chmod(filePath, 0o600);
  } catch {
    // Best-effort on platforms that ignore file modes.
  }
}

export async function readInfernoApiKey(dataDir: string): Promise<string | null> {
  const filePath = infernoCredentialsPath(dataDir);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  try {
    const parsed = JSON.parse(raw) as { apiKey?: unknown };
    if (typeof parsed.apiKey !== 'string') return null;
    const apiKey = parsed.apiKey.trim();
    return apiKey || null;
  } catch {
    return null;
  }
}

export async function clearInfernoApiKey(dataDir: string): Promise<void> {
  const filePath = infernoCredentialsPath(dataDir);
  try {
    await unlink(filePath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}
