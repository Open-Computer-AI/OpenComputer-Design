import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appConfigDir } from '../src/app-config.js';

describe('appConfigDir', () => {
  it('prefers OCD_DATA_DIR then OD_DATA_DIR then ~/.opencomputer-design', () => {
    expect(appConfigDir('/proj', { OCD_DATA_DIR: '/tmp/ocd' })).toBe(path.resolve('/tmp/ocd'));
    expect(appConfigDir('/proj', { OD_DATA_DIR: '/tmp/od' })).toBe(path.resolve('/tmp/od'));
    expect(appConfigDir('/proj', { OCD_DATA_DIR: '/tmp/ocd', OD_DATA_DIR: '/tmp/od' })).toBe(
      path.resolve('/tmp/ocd'),
    );
    expect(appConfigDir('/proj', {})).toBe(path.join(os.homedir(), '.opencomputer-design'));
  });
});
