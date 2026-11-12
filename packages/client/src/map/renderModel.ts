import type {
  Character,
  Container,
  EntityId,
  Item,
  SpriteManifest,
  Tile,
} from '@dungeon/shared';
import type { ClientState, MapCue } from '../store/types';
import type { TavernMap } from './mapData';
import { dmOverlay } from './dmOverlay';
import { ROLE_INK } from './palette';

type MapEntity = Character | Container | Item;
export interface MapSprite {
  id: EntityId;
  frame: number;
  x: number;
  y: number;
  tint: number | null;
  selected: boolean;
  changed: boolean;
  label: string;
  dmNote?: string;
  dmOnly?: boolean;
}
export interface MapTween {
  key: string;
  id: EntityId;
  path: Tile[];
  startMs: number;
  durationMs: number;
}
export interface RenderCue {
  key: string;
  id: EntityId;
  kind: MapCue['cue'];
  flipX: boolean | null;
}
export interface RenderModel {
  tiles: TavernMap['tiles'];
  sprites: MapSprite[];
  tweens: MapTween[];
  cues: RenderCue[];
}

export function resolveFrame(
  entity: MapEntity,
  manifest: SpriteManifest,
): number {
  const tag = entity.tags
    .map((value) => manifest.tags[value])
    .find((value) => value !== undefined);
  const kind =
    'role' in entity ? 'npc' : 'opened' in entity ? 'container' : entity.kind;
  const frame =
    entity.sprite ??
    manifest.overrides[entity.id] ??
    tag ??
    manifest.fallbacks[kind];
  return Number(frame.split(':')[1]);
}

export function renderModel(
  state: ClientState,
  manifest: SpriteManifest,
  map: TavernMap,
  reducedMotion = false,
): RenderModel {
  const sprites: MapSprite[] = Object.values(state.world.entities).flatMap(
    (entity) => {
      if (!('hidden' in entity) || entity.hidden) return [];
      const position = state.world.positions[entity.id];
      if (!position || state.world.inventory.some((id) => id === entity.id))
        return [];
      const { x, y } = position.tile;
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) return [];
      return [
        {
          id: entity.id,
          frame: resolveFrame(entity, manifest),
          x,
          y,
          tint: 'role' in entity ? ROLE_INK[entity.role] : null,
          selected: state.selection.ids.includes(entity.id),
          changed: state.mapFeedback.changed.includes(entity.id),
          label:
            'role' in entity
              ? (entity.name.split(/[\s,]+/)[0] ?? entity.name)
              : entity.name,
        },
      ];
    },
  );
  if (state.dev.devTools && state.dev.dmView && state.dev.groundTruth) {
    for (const overlay of dmOverlay(state.dev.groundTruth, state.world)) {
      const { entity, tile, note, hidden } = overlay;
      if (
        tile.x < 0 ||
        tile.y < 0 ||
        tile.x >= map.width ||
        tile.y >= map.height
      )
        continue;
      const existing = sprites.find((sprite) => sprite.id === entity.id);
      if (existing) existing.dmNote = note;
      else
        sprites.push({
          id: entity.id,
          frame: resolveFrame(entity, manifest),
          x: tile.x,
          y: tile.y,
          tint: null,
          selected: false,
          changed: false,
          label: entity.name,
          dmNote: note,
          dmOnly: hidden,
        });
    }
  }
  const visible = new Map(sprites.map((sprite) => [sprite.id, sprite]));
  let startMs = 0;
  const tweens = state.mapFeedback.moves.flatMap((event) => {
    if (!visible.has(event.payload.entityId)) return [];
    const durationMs = reducedMotion
      ? 0
      : Math.max(0, event.payload.path.length - 1) * 125;
    const tween: MapTween = {
      key: `${event.beat}:${event.seq}`,
      id: event.payload.entityId,
      path: event.payload.path,
      startMs,
      durationMs,
    };
    startMs += durationMs;
    return [tween];
  });
  const cues = reducedMotion
    ? []
    : state.mapCues.flatMap((cue, index) => {
        const source = visible.get(cue.entity);
        const target = cue.target ? visible.get(cue.target) : undefined;
        if (!source || (cue.target && !target)) return [];
        return [
          {
            key: `${state.beat.number}:${index}`,
            id: cue.entity,
            kind: cue.cue,
            flipX: target && target.x !== source.x ? target.x < source.x : null,
          },
        ];
      });
  return { tiles: map.tiles, sprites, tweens, cues };
}
