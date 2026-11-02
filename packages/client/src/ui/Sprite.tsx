import type { Node } from '@dungeon/shared';
import { useSyncExternalStore } from 'react';
import { manifest } from '../map/assets';
import { SHEET_COLUMNS, SHEET_ROWS, TILE_SIZE } from '../map/mapData';
import { resolveFrame } from '../map/renderModel';
import { sheetSnapshot, subscribeSheet } from '../map/texture';

export function Sprite({ entity, size = 32 }: { entity: Node; size?: number }) {
  const sheet = useSyncExternalStore(subscribeSheet, sheetSnapshot);
  const frame = 'hidden' in entity ? resolveFrame(entity, manifest) : 0;
  return (
    <span
      aria-hidden="true"
      className="sprite"
      style={{
        width: size,
        height: size,
        backgroundImage: sheet ? `url(${sheet})` : undefined,
        backgroundSize: `${SHEET_COLUMNS * size}px ${SHEET_ROWS * size}px`,
        backgroundPosition: `${-(frame % SHEET_COLUMNS) * size}px ${-Math.floor(frame / SHEET_COLUMNS) * size}px`,
        imageRendering: 'pixelated',
      }}
      data-frame={frame}
      data-tile-size={TILE_SIZE}
    />
  );
}
