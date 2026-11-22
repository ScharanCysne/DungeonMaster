import type { EntityId, Tile } from '@dungeon/shared';
import type { MapTween, RenderCue } from './renderModel';

export function sampleMoves(
  tweens: MapTween[],
  elapsedMs: number,
): Map<EntityId, Tile> {
  const positions = new Map<EntityId, Tile>();
  for (const tween of tweens) {
    if (elapsedMs < tween.startMs && positions.has(tween.id)) continue;
    const progress =
      tween.durationMs === 0
        ? 1
        : Math.max(
            0,
            Math.min(1, (elapsedMs - tween.startMs) / tween.durationMs),
          );
    const step = progress * (tween.path.length - 1);
    const from = tween.path[Math.floor(step)];
    const to = tween.path[Math.ceil(step)];
    if (!from || !to) continue;
    const fraction = step % 1;
    positions.set(tween.id, {
      x: from.x + (to.x - from.x) * fraction,
      y: from.y + (to.y - from.y) * fraction,
    });
  }
  return positions;
}

export function sampleCue(cue: RenderCue, elapsedMs: number) {
  const active = elapsedMs >= 0 && elapsedMs < 240;
  return {
    flipX:
      active && cue.kind !== 'glance_up' && cue.flipX !== null
        ? cue.flipX
        : false,
    y:
      active &&
      (cue.kind === 'glance_up' || cue.flipX === null) &&
      elapsedMs >= 80 &&
      elapsedMs < 160
        ? -1
        : 0,
  };
}
