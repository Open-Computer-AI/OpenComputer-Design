import { describe, expect, it } from 'vitest';
import { MEDIA_PROVIDERS } from '../../src/media/models';
import {
  CREATE_RAIL_ORDER,
  findChip,
  isHiddenRemoteMediaCreateChip,
  orderedCreateChips,
} from '../../src/components/home-hero/chips';
import { homeMediaSurfaceForChipId } from '../../src/components/home-hero/media-surfaces';

describe('media providers', () => {
  it('only HyperFrames is visible and integrated', () => {
    // HyperFrames needs no credentials, so it stays `settingsVisible: false`.
    // Visibility for this fork is the integrated flag: remote vendors are off.
    const integrated = MEDIA_PROVIDERS.filter((p) => p.integrated);
    expect(integrated.map((p) => p.id)).toEqual(['hyperframes']);
  });
});

describe('Home create rail', () => {
  it('keeps HyperFrames and hides Image/Video create chips', () => {
    const ids = orderedCreateChips().map((chip) => chip.id);
    expect(ids).toContain('hyperframes');
    expect(ids).toContain('prototype');
    expect(ids).toContain('deck');
    expect(ids).toContain('document');
    expect(ids).not.toContain('image');
    expect(ids).not.toContain('video');
    expect(CREATE_RAIL_ORDER).not.toContain('image');
    expect(CREATE_RAIL_ORDER).not.toContain('video');
    expect(findChip('image')).toBeUndefined();
    expect(findChip('video')).toBeUndefined();
    expect(findChip('hyperframes')).toBeTruthy();
    expect(isHiddenRemoteMediaCreateChip('image')).toBe(true);
    expect(isHiddenRemoteMediaCreateChip('video')).toBe(true);
    expect(isHiddenRemoteMediaCreateChip('hyperframes')).toBe(false);
    expect(homeMediaSurfaceForChipId('image')).toBeNull();
    expect(homeMediaSurfaceForChipId('video')).toBeNull();
    expect(homeMediaSurfaceForChipId('hyperframes')).toBe('hyperframes');
  });
});
