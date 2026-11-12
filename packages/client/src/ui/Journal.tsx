import type { BeatTrace, EntityId, Node } from '@dungeon/shared';
import { useEffect } from 'react';
import type { BeatState, ClientState, JournalEntry } from '../store/types';
import { JournalLine } from './JournalLine';
import { revealSchedule } from './reveal';
import { useJournalReveal } from './useJournalReveal';
import { useJournalScroll } from './useJournalScroll';

export function Journal({
  entries,
  entities,
  onToggle,
  reveal = null,
  beat,
  devTools = false,
  traces = {},
  onTrace = () => {},
  onRevealComplete,
  scrollPosition,
  onScrollPosition,
  rawIds = false,
}: {
  entries: JournalEntry[];
  entities: Record<string, Node>;
  onToggle: (id: EntityId) => void;
  reveal?: ClientState['journal']['reveal'];
  beat?: BeatState;
  devTools?: boolean;
  traces?: Record<string, BeatTrace>;
  onTrace?: (traceId: string) => void;
  onRevealComplete?: (beat: number) => void;
  scrollPosition?: ClientState['journal']['scroll'];
  rawIds?: boolean;
  onScrollPosition?: (scroll: ClientState['journal']['scroll']) => void;
}) {
  const duration = revealSchedule(entries, reveal?.beat ?? null, 0).durationMs;
  const { elapsed, instant, skip } = useJournalReveal(reveal, duration);
  const visible = revealSchedule(
    entries,
    reveal?.beat ?? null,
    elapsed,
    instant,
  );
  const waiting =
    beat?.status === 'running' &&
    !entries.some(
      (entry) =>
        entry.beat === beat.number &&
        entry.kind === 'dialogue' &&
        entry.status === 'provisional',
    );
  const contentKey = JSON.stringify([visible.entries, waiting]);
  const scroll = useJournalScroll(contentKey, scrollPosition, onScrollPosition);
  useEffect(() => {
    if (visible.complete && reveal?.status === 'revealing')
      onRevealComplete?.(reveal.beat);
  }, [visible.complete, reveal, onRevealComplete]);
  return (
    <div className="journal-panel">
      <section
        ref={scroll.viewport}
        className="journal"
        aria-labelledby="journal-title"
        tabIndex={0}
        onScroll={scroll.onScroll}
        onClick={skip}
      >
        <div ref={scroll.content} className="journal-content">
          <h2 id="journal-title" className="section-label">
            Journal
          </h2>
          {!entries.length && (
            <div className="journal-empty">
              <span className="chapter-ornament" aria-hidden="true">
                ❧
              </span>
              <p>Every adventure begins with a word.</p>
              <p className="text-ink-soft">The pages await your story.</p>
            </div>
          )}
          {visible.entries.map((entry) => (
            <JournalLine
              key={entry.id}
              entry={entry}
              entities={entities}
              onToggle={onToggle}
              stamping={visible.stamping.includes(entry.id)}
              fallback={
                devTools &&
                entry.kind === 'narration' &&
                !!entry.traceId &&
                traces[entry.traceId]?.outcome === 'fallback'
              }
              onTrace={onTrace}
              rawIds={rawIds}
            />
          ))}
          {waiting && (
            <p className="quill-wait" role="status">
              The Dungeon Master's quill scratches…
            </p>
          )}
        </div>
      </section>
      {scroll.hasNew && (
        <button type="button" className="new-entries" onClick={scroll.jump}>
          ↓ new entries
        </button>
      )}
    </div>
  );
}
