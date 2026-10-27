import type { CharacterId, EntityId } from '@dungeon/shared';
import type { OntologyReader } from '../../ontology/OntologyStore.js';
import { roomOf } from '../../engine/spatial.js';
import type { BeatContext } from './BeatContext.js';

export class ToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function requireTool(
  condition: unknown,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new ToolError(code, message);
}
export async function requireNode(reader: OntologyReader, id: EntityId) {
  const node = await reader.getNode(id);
  requireTool(node, 'NO_SUCH_ENTITY', `${id}: expected an existing entity.`);
  return node;
}
export async function requireCharacter(
  reader: OntologyReader,
  id: CharacterId,
) {
  const node = await requireNode(reader, id);
  requireTool(
    'role' in node,
    'NOT_A_CHARACTER',
    `${id}: expected a character.`,
  );
  return node;
}
export function playerId(ctx: BeatContext): CharacterId {
  const player = [...ctx.engine.state.characters.values()].find(
    (character) => character.role === 'player',
  );
  requireTool(
    player,
    'NO_PLAYER',
    'Expected a player to anchor room presence.',
  );
  return player.id;
}
export function requirePresent(
  ctx: BeatContext,
  id: CharacterId,
  anchor: CharacterId,
): void {
  const state = ctx.engine.state;
  const character = state.characters.get(id);
  const teller = state.characters.get(anchor);
  requireTool(
    character && teller,
    'NO_SUCH_ENTITY',
    `${id}/${anchor}: expected positioned characters.`,
  );
  requireTool(
    roomOf(state, character.locationId) === roomOf(state, teller.locationId),
    'NOT_IN_SAME_ROOM',
    `${id}: expected the same room as ${anchor}.`,
  );
}
