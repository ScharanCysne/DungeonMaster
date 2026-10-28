import type {
  CharacterId,
  KnowledgeSlice,
  ResolvedNarration,
} from '@dungeon/shared';
import {
  witnessCandidates,
  witnessesFor,
} from '../../engine/rules/perception.js';
import type { LogDraft } from '../../ontology/eventLog.js';
import type { BeatContext } from '../tools/BeatContext.js';
import type { SelfLeak } from './schema.js';

export function validSelfLeaks(
  leaks: readonly SelfLeak[],
  narration: ResolvedNarration,
  speaking: readonly KnowledgeSlice[],
): SelfLeak[] {
  return leaks.filter((leak, index) => {
    const peer = speaking.find(
      ({ character }) =>
        character.id === leak.speaker && character.role === 'peer',
    );
    return (
      peer?.secrets.some(({ id }) => id === leak.factId) &&
      peer.facts.some(
        ({ fact, knowledge }) =>
          fact.id === leak.factId &&
          knowledge.properties.retractedAtBeat === undefined,
      ) &&
      narration.lines.some(
        (line) =>
          line.speaker === leak.speaker && line.text.includes(leak.quote),
      ) &&
      leaks.findIndex(
        (other) =>
          other.speaker === leak.speaker && other.factId === leak.factId,
      ) === index
    );
  });
}

export interface SelfLeakFlag extends SelfLeak {
  witnesses: CharacterId[];
}

export async function learnSelfLeaks(
  ctx: BeatContext,
  leaks: readonly SelfLeak[],
): Promise<SelfLeakFlag[]> {
  const view = await ctx.softState();
  const state = ctx.engine.state;
  const flags: SelfLeakFlag[] = [];
  const events: LogDraft[] = [];
  const learned = new Set<string>();
  for (const leak of leaks) {
    const character = state.characters.get(leak.speaker);
    if (!character?.conscious) continue;
    const context = {
      actor: leak.speaker,
      locationId: character.locationId,
      targets: [],
      private: false,
    };
    const witnesses = witnessesFor(state, {
      context,
      candidateWitnesses: witnessCandidates(state, context),
    });
    flags.push({ ...leak, witnesses });
    for (const characterId of witnesses) {
      const key = `${characterId}/${leak.factId}`;
      const existing = await view.edges({
        types: ['KNOWS'],
        from: characterId,
        to: leak.factId,
      });
      if (
        learned.has(key) ||
        existing.some(
          (edge) =>
            edge.type === 'KNOWS' &&
            edge.properties.retractedAtBeat === undefined,
        )
      )
        continue;
      learned.add(key);
      events.push({
        type: 'FactLearned',
        actor: leak.speaker,
        private: true,
        witnesses,
        createdBy: 'engine',
        payload: {
          characterId,
          factId: leak.factId,
          since: ctx.beat,
          source: 'told',
          confidence: 1,
        },
      });
    }
  }
  ctx.appendEvents(events);
  return flags;
}
