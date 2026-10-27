import { describe, expect, it } from 'vitest';
import { spriteFrameSchema, spriteManifestSchema } from './index.js';

const manifest = {
  tags: { quill: 'kenney-1-bit:568' },
  fallbacks: {
    npc: 'kenney-1-bit:25',
    item: 'kenney-1-bit:571',
    container: 'kenney-1-bit:302',
    weapon: 'kenney-1-bit:375',
    armor: 'kenney-1-bit:375',
    tool: 'kenney-1-bit:571',
    trinket: 'kenney-1-bit:237',
    document: 'kenney-1-bit:290',
    consumable: 'kenney-1-bit:578',
    treasure: 'kenney-1-bit:237',
  },
  overrides: { 'item:quill': 'kenney-1-bit:568' },
};

describe('sprite manifest', () => {
  it('accepts tag mappings, complete kind fallbacks and physical entity overrides', () => {
    expect(spriteManifestSchema.parse(manifest)).toEqual(manifest);
  });
  it.each(['kenney-1-bit:0', 'kenney-1-bit:1077'])(
    'accepts sheet boundary %s',
    (frame) => {
      expect(spriteFrameSchema.parse(frame)).toBe(frame);
    },
  );
  it.each([
    'kenney-1-bit:1078',
    'kenney-1-bit:-1',
    'kenney-1-bit:1.5',
    'kenney-1-bit:01',
    'other:74',
    '74',
  ])('rejects invalid frame %s', (frame) => {
    expect(spriteFrameSchema.safeParse(frame).success).toBe(false);
  });
  it('requires every fallback', () => {
    const { npc: omitted, ...fallbacks } = manifest.fallbacks;
    expect(omitted).toBe('kenney-1-bit:25');
    expect(
      spriteManifestSchema.safeParse({ ...manifest, fallbacks }).success,
    ).toBe(false);
  });
  it('rejects unknown kinds and nonphysical override ids', () => {
    expect(
      spriteManifestSchema.safeParse({
        ...manifest,
        fallbacks: { ...manifest.fallbacks, monster: 'kenney-1-bit:25' },
      }).success,
    ).toBe(false);
    expect(
      spriteManifestSchema.safeParse({
        ...manifest,
        overrides: { 'fact:quill': 'kenney-1-bit:568' },
      }).success,
    ).toBe(false);
  });
  it('rejects empty tags and unknown top-level fields', () => {
    expect(
      spriteManifestSchema.safeParse({
        ...manifest,
        tags: { '': 'kenney-1-bit:0' },
      }).success,
    ).toBe(false);
    expect(
      spriteManifestSchema.safeParse({ ...manifest, extra: true }).success,
    ).toBe(false);
  });
});
