import type {
  CharacterId,
  GameEvent,
  PlayerIntent,
  Roll,
} from '@dungeon/shared';
import type { PeerResult } from '../agents/peers/agent.js';
import type { EngineState } from '../engine/index.js';
import { witnessCandidates, witnessesFor } from '../engine/rules/perception.js';
import type { LogDraft } from '../ontology/eventLog.js';

export function intentDrafts(
  state: EngineState,
  player: CharacterId,
  intent: PlayerIntent,
  peers: PeerResult[],
): LogDraft[] {
  const drafts: LogDraft[] = [
    {
      type: 'IntentReceived',
      payload: { selection: intent.selection, text: intent.text },
      actor: player,
      private: true,
      witnesses: [player],
    },
  ];
  for (const { actor, turn } of peers) {
    const character = state.characters.get(actor);
    if (turn.kind !== 'intent' || !character) continue;
    const context = {
      actor,
      locationId: character.locationId,
      targets: [],
      private: turn.private,
    };
    drafts.push({
      type: 'IntentReceived',
      actor,
      private: turn.private,
      witnesses: witnessesFor(state, {
        context,
        candidateWitnesses: witnessCandidates(state, context),
      }),
      payload: {
        selection: turn.refs,
        text: turn.text,
        ...(turn.say === undefined ? {} : { say: turn.say }),
      },
    });
  }
  return drafts;
}

export function witnessedRolls(events: readonly GameEvent[]): Roll[] {
  return events.flatMap((event) => {
    if (event.type === 'AttackResolved') return [event.payload.roll];
    if (event.type !== 'CheckRolled') return [];
    return event.payload.kind === 'skill'
      ? [event.payload.roll]
      : [event.payload.actorRoll, event.payload.targetRoll];
  });
}
