import type { EntityId, Node } from '@dungeon/shared';
import type { JournalEntry } from '../store/types';

export function Journal({
  entries,
  entities,
  onToggle,
}: {
  entries: JournalEntry[];
  entities: Record<string, Node>;
  onToggle: (id: EntityId) => void;
}) {
  const name = (id: string) => entities[id]?.name ?? id;
  return (
    <section className="journal" aria-labelledby="journal-title" tabIndex={0}>
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
      {entries.map((entry) => {
        switch (entry.kind) {
          case 'beat_header':
            return (
              <h3 className="beat-header" key={entry.id}>
                — Beat {entry.beat} —
              </h3>
            );
          case 'intent':
            return (
              <div className="intent-entry" key={entry.id}>
                <p>You: {entry.text}</p>
                <div className="journal-chips">
                  {entry.selection.map((id) => (
                    <button
                      type="button"
                      className="chip"
                      key={id}
                      disabled={!entities[id]}
                      onClick={() => onToggle(id)}
                    >
                      {name(id)}
                    </button>
                  ))}
                </div>
              </div>
            );
          case 'dialogue': {
            const speaker = entities[entry.speaker];
            return (
              <p className={`dialogue ${entry.status}`} key={entry.id}>
                <strong
                  className={
                    speaker && 'role' in speaker
                      ? `speaker role-${speaker.role}`
                      : 'speaker'
                  }
                >
                  {name(entry.speaker)}:
                </strong>{' '}
                {entry.status === 'struck' ? (
                  <>
                    <s>{entry.text}</s> <small>(withdrawn)</small>
                  </>
                ) : (
                  entry.text
                )}
                {entry.status === 'provisional' && (
                  <small> (provisional)</small>
                )}
              </p>
            );
          }
          case 'stamp':
            return (
              <p className={`roll-stamp ${entry.outcome}`} key={entry.id}>
                {entry.text}
              </p>
            );
          case 'narration':
            return (
              <p className="narration" key={entry.id}>
                {entry.text}
              </p>
            );
          case 'note':
            return (
              <p className="event-note" key={entry.id}>
                ◆ {entry.text}
              </p>
            );
          case 'episode_end':
            return (
              <section className="episode-end" key={entry.id}>
                <h3>End of chapter</h3>
                <p>{name(entry.holder)} holds the quill.</p>
                <p>{entry.text}</p>
                <p>{entry.beat} beats</p>
              </section>
            );
        }
      })}
    </section>
  );
}
