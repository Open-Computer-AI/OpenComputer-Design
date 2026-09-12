import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const BANNED = /open-design\.ai|discord\.gg|Claude Design alternative/i;

function readRepoFile(rel: string): string {
  return readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

describe('string sweep', () => {
  it('README does not advertise Open Design Cloud or Discord', () => {
    const readme = readRepoFile('README.md');
    expect(readme).toMatch(/OpenComputer Design/);
    expect(readme).not.toMatch(BANNED);
  });

  it('web components do not advertise open-design.ai, Discord invites, or Claude Design alternative', () => {
    const root = path.join(REPO_ROOT, 'apps', 'web', 'src', 'components');
    const hits: string[] = [];
    for (const file of walkFiles(root)) {
      if (!/\.(?:ts|tsx|js|jsx|md|css)$/u.test(file)) continue;
      const text = readFileSync(file, 'utf8');
      if (BANNED.test(text)) {
        hits.push(path.relative(REPO_ROOT, file).replaceAll('\\', '/'));
      }
    }
    expect(hits).toEqual([]);
  });

  it('en locale and Ask-mode prompt do not advertise banned marketing', () => {
    for (const rel of [
      'apps/web/src/i18n/locales/en.ts',
      'apps/daemon/src/prompts/system.ts',
    ]) {
      const text = readRepoFile(rel);
      expect(text, rel).not.toMatch(/open-design\.ai/);
      expect(text, rel).not.toMatch(/discord\.gg/);
      expect(text, rel).not.toMatch(/Claude Design alternative/);
    }
  });
});
