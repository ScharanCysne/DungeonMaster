import type {
  CharacterId,
  CriticIssue,
  EntityId,
  ResolvedNarration,
} from '@dungeon/shared';
import type { CheckReceipt } from '../../engine/receipts.js';
import type { LogDraft } from '../../ontology/eventLog.js';
import type { GraphNode } from '../../ontology/mutations.js';
import type { SpokenLine } from '../tools/BeatContext.js';
import { mentionsName } from './mentions.js';

export interface PrecheckInput {
  narration: ResolvedNarration;
  entities: readonly GraphNode[];
  discovered: ReadonlySet<EntityId>;
  speakers: ReadonlyMap<CharacterId, { present: boolean; conscious: boolean }>;
  voicedLines: ReadonlyMap<string, SpokenLine>;
  events: readonly LogDraft[];
  receipts: readonly Readonly<CheckReceipt>[];
  beat: number;
  disclosures?: readonly {
    speaker: CharacterId;
    quote: string;
    entities: readonly EntityId[];
  }[];
}
export interface PrecheckResult {
  issues: CriticIssue[];
  unspentReceipts: Readonly<CheckReceipt>[];
}

export function precheck(input: PrecheckInput): PrecheckResult {
  const issues: CriticIssue[] = [];
  const texts = [
    input.narration.text,
    ...input.narration.lines.map(({ text }) => text),
  ];
  for (const node of input.entities) {
    if (!('hidden' in node) || !node.hidden || input.discovered.has(node.id))
      continue;
    for (const [index, text] of texts.entries()) {
      const speaker = input.narration.lines[index - 1]?.speaker;
      const unrevealed = (input.disclosures ?? [])
        .filter(
          (leak) => speaker === leak.speaker && leak.entities.includes(node.id),
        )
        .reduce(
          (remaining, leak) => remaining.replaceAll(leak.quote, ''),
          text,
        );
      if (mentionsName(unrevealed, node.name) || unrevealed.includes(node.id))
        issues.push({
          type: 'perspective_leak',
          quote: text,
          explanation: `Hidden entity ${node.id} (${node.name}) has not been discovered by the player.`,
        });
    }
  }
  for (const line of input.narration.lines) {
    const speaker = input.speakers.get(line.speaker);
    if (!speaker?.present || !speaker.conscious)
      issues.push({
        type: 'state_contradiction',
        quote: line.text,
        explanation: `${line.speaker} is absent or unconscious at narration time.`,
      });
    const node = input.entities.find(({ id }) => id === line.speaker);
    if (node && 'role' in node && node.role === 'npc') {
      const voiced = line.lineId
        ? input.voicedLines.get(line.lineId)
        : undefined;
      if (
        !voiced ||
        voiced.speaker !== line.speaker ||
        voiced.text !== line.text
      )
        issues.push({
          type: 'invented_content',
          quote: line.text,
          explanation: `${line.speaker} must use an unchanged voice_npc lineId produced this beat.`,
        });
    }
  }
  if (!input.events.some(({ type }) => type === 'CheckRolled'))
    for (const text of texts)
      if (
        /\b(?:you\s+(?:succeed(?:ed)?|fail(?:ed)?)|(?:check|attempt|roll)\s+(?:succeeds?|succeeded|fails?|failed))\b/iu.test(
          text,
        )
      )
        issues.push({
          type: 'unbacked_outcome',
          quote: text,
          explanation: 'A check outcome is stated, but no check ran this beat.',
        });
  return {
    issues,
    unspentReceipts: input.receipts.filter(
      (receipt) =>
        receipt.beat === input.beat &&
        receipt.outcome === 'success' &&
        !receipt.spent,
    ),
  };
}
