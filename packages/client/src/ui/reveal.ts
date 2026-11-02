import type { JournalEntry } from '../store/types';

export const STAMP_MS = 150;
export const WORD_MS = 25;
export const LINE_MS = 150;

function phase(entry: JournalEntry): number {
  if (entry.kind === 'stamp') return 0;
  if (entry.kind === 'narration') return 1;
  if (
    entry.kind === 'dialogue' &&
    entry.status === 'final' &&
    !entry.id.startsWith('progress:')
  )
    return 2;
  if (entry.kind === 'note' && !entry.id.startsWith('pause:')) return 3;
  return -1;
}

export function revealSchedule(
  entries: JournalEntry[],
  beat: number | null,
  elapsedMs: number,
  instant = false,
): {
  entries: JournalEntry[];
  stamping: string[];
  complete: boolean;
  durationMs: number;
} {
  const scheduled = entries
    .filter(
      (entry) => entry.beat === beat && beat !== null && phase(entry) >= 0,
    )
    .sort((a, b) => phase(a) - phase(b));
  const amounts = new Map<string, JournalEntry>();
  const stamping: string[] = [];
  let cursor = 0;
  for (const entry of scheduled) {
    const words =
      entry.kind === 'narration' ? [...entry.text.matchAll(/\S+\s*/gu)] : [];
    const duration =
      entry.kind === 'narration'
        ? words.length * WORD_MS
        : entry.kind === 'stamp'
          ? STAMP_MS
          : LINE_MS;
    const elapsed = instant ? Infinity : Math.max(0, elapsedMs) - cursor;
    if (elapsed >= 0) {
      if (entry.kind === 'narration' && elapsed < duration) {
        const count = Math.floor(elapsed / WORD_MS);
        const last = words[count - 1];
        if (last)
          amounts.set(entry.id, {
            ...entry,
            text: entry.text.slice(0, last.index + last[0].length),
          });
      } else amounts.set(entry.id, entry);
      if (entry.kind === 'stamp' && elapsed < duration) stamping.push(entry.id);
    }
    cursor += duration;
  }
  return {
    entries: entries.flatMap((entry) => {
      if (entry.beat !== beat || beat === null || phase(entry) < 0)
        return [entry];
      const visible = amounts.get(entry.id);
      return visible ? [visible] : [];
    }),
    stamping,
    complete: instant || elapsedMs >= cursor,
    durationMs: cursor,
  };
}
