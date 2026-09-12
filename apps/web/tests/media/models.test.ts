import { describe, expect, it } from 'vitest';
import { MEDIA_PROVIDERS } from '../../src/media/models';

describe('media providers', () => {
  it('only HyperFrames is visible and integrated', () => {
    // HyperFrames needs no credentials, so it stays `settingsVisible: false`.
    // Visibility for this fork is the integrated flag: remote vendors are off.
    const integrated = MEDIA_PROVIDERS.filter((p) => p.integrated);
    expect(integrated.map((p) => p.id)).toEqual(['hyperframes']);
  });
});
