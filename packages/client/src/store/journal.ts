import { formatRollStamp } from '@dungeon/shared';
import type { BeatResult, GameEvent, ResolvedNarration } from '@dungeon/shared';
import type { JournalEntry, WorldState } from './types';
import { playerId } from './world';

export function beatHeader(
  entries: JournalEntry[],
  beat: number,
): JournalEntry[] {
  return entries.some(
    (entry) => entry.kind === 'beat_header' && entry.beat === beat,
  )
    ? entries
    : [...entries, { kind: 'beat_header', id: `beat:${beat}`, beat }];
}
export function strikeProvisional(
  entries: JournalEntry[],
  beat: number,
): JournalEntry[] {
  return entries.map((entry) =>
    entry.beat === beat &&
    entry.kind === 'dialogue' &&
    entry.status === 'provisional'
      ? { ...entry, status: 'struck' }
      : entry,
  );
}
export function narrationEntries(
  narration: ResolvedNarration,
  beat: number | null,
  prefix: string,
): JournalEntry[] {
  return [
    {
      kind: 'narration',
      id: `${prefix}:narration`,
      beat,
      text: narration.text,
    },
    ...narration.lines.map((line, index): JournalEntry => ({
      kind: 'dialogue',
      id: `${prefix}:line:${index}`,
      beat,
      speaker: line.speaker,
      text: line.text,
      status: 'final',
    })),
  ];
}
function eventNote(event: GameEvent, world: WorldState): string | undefined {
  const name = (id: string) => world.entities[id]?.name ?? id;
  const player = playerId(world);
  switch (event.type) {
    case 'ItemTransferred':
      return `${name(event.payload.itemId)} → ${event.payload.to.id === player ? 'your inventory' : name(event.payload.to.id)}`;
    case 'FactLearned':
      return event.payload.characterId === player
        ? `You learned: ${name(event.payload.factId)}`
        : undefined;
    case 'ContainerOpened':
      return `${name(event.payload.containerId)} opens.`;
    case 'ContainerUnlocked':
      return `${name(event.payload.containerId)} is unlocked.`;
    case 'EntityRevealed':
      return `${name(event.payload.entityId)} comes into view.`;
    case 'DamageApplied':
      return `${name(event.payload.target)} takes ${event.payload.amount} damage (${event.payload.hp} HP).`;
    case 'Healed':
      return `${name(event.payload.target)} recovers ${event.payload.amount} HP (${event.payload.hp} HP).`;
    case 'ItemEquipped':
      return `${name(event.payload.characterId)} equips ${name(event.payload.itemId)}.`;
    case 'ItemUnequipped':
      return `${name(event.payload.characterId)} puts away ${name(event.payload.itemId)}.`;
    case 'QuestStatusChanged':
      return `${name(event.payload.questId)}: ${event.payload.status}.`;
    default:
      return undefined;
  }
}
export function commitJournal(
  entries: JournalEntry[],
  result: BeatResult,
  events: GameEvent[],
  world: WorldState,
): JournalEntry[] {
  const beat = result.beat;
  const player = playerId(world);
  const lines = [...result.narration.lines];
  for (const event of events) {
    if (
      event.type !== 'IntentReceived' ||
      !event.actor ||
      event.actor === player ||
      !event.payload.say
    )
      continue;
    if (
      !lines.some(
        (line) =>
          line.speaker === event.actor && line.text === event.payload.say,
      )
    )
      lines.push({ speaker: event.actor, text: event.payload.say });
  }
  const remaining = lines.map((line, index) => ({
    line,
    index,
  }));
  // Progress has no line ID; consume exact matches once to preserve repeated dialogue.
  const reconciled = entries
    .filter((entry) => entry.beat !== null)
    .map((entry): JournalEntry => {
      if (
        entry.beat !== beat ||
        entry.kind !== 'dialogue' ||
        entry.status !== 'provisional'
      )
        return entry;
      const index = remaining.findIndex(
        ({ line }) =>
          line.speaker === entry.speaker && line.text === entry.text,
      );
      if (index < 0) return { ...entry, status: 'struck' };
      remaining.splice(index, 1);
      return { ...entry, status: 'final' };
    });
  const next = beatHeader(reconciled, beat);
  for (const event of events) {
    if (event.type === 'IntentReceived' && event.actor === player) {
      const intent: JournalEntry = {
        kind: 'intent',
        id: `intent:${beat}`,
        beat,
        text: event.payload.text,
        selection: event.payload.selection,
      };
      const index = next.findIndex((entry) => entry.id === intent.id);
      if (index < 0) next.push(intent);
      else next[index] = intent;
    }
  }
  for (const event of events) {
    if (event.type === 'CheckRolled' || event.type === 'AttackResolved') {
      const payload = event.payload;
      const outcome =
        'attacker' in payload
          ? payload.hit
            ? 'success'
            : 'failure'
          : payload.kind === 'skill'
            ? payload.roll.outcome
            : payload.winner === null
              ? 'tie'
              : payload.winner === payload.actor
                ? 'success'
                : 'failure';
      next.push({
        kind: 'stamp',
        id: `stamp:${beat}:${event.seq}`,
        beat,
        outcome,
        text: formatRollStamp(payload, (id) => world.entities[id]?.name),
      });
    }
  }
  next.push({
    kind: 'narration',
    id: `narration:${beat}`,
    beat,
    text: result.narration.text,
    traceId: result.traceId,
  });
  next.push(
    ...remaining.map(({ line, index }): JournalEntry => ({
      kind: 'dialogue',
      id: `line:${beat}:${index}`,
      beat,
      ...line,
      status: 'final',
    })),
  );
  for (const event of events) {
    const text = eventNote(event, world);
    if (text)
      next.push({ kind: 'note', id: `note:${beat}:${event.seq}`, beat, text });
  }
  return next;
}
