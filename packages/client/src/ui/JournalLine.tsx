import { activateOnEnter } from './keyboard';
import type { EntityId, Node } from '@dungeon/shared';
import type { JournalEntry } from '../store/types';
import { Sprite } from './Sprite';

export function JournalLine({
  entry,
  entities,
  onToggle,
  stamping,
  fallback,
  onTrace,
}: {
  entry: JournalEntry;
  entities: Record<string, Node>;
  onToggle: (id: EntityId) => void;
  stamping: boolean;
  fallback: boolean;
  onTrace: (traceId: string) => void;
}) {
  const name = (id: string) => entities[id]?.name ?? id;
  switch (entry.kind) {
    case 'beat_header':
      return <h3 className="beat-header">— Beat {entry.beat} —</h3>;
    case 'intent':
      return (
        <div className="intent-entry">
          <p>You: {entry.text}</p>
          <div className="journal-chips">
            {entry.selection.map((id) => (
              <button
                type="button"
                onKeyDown={activateOnEnter}
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
        <div className={`dialogue ${entry.status}`}>
          {speaker && (
            <span className="dialogue-portrait">
              <Sprite entity={speaker} size={24} />
            </span>
          )}
          <p>
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
            {entry.status === 'provisional' && <small> (provisional)</small>}
          </p>
        </div>
      );
    }
    case 'stamp':
      return (
        <p
          className={`roll-stamp ${entry.outcome}${stamping ? ' stamping' : ''}`}
        >
          {entry.text}
        </p>
      );
    case 'narration':
      return (
        <div className="narration-entry">
          <p className="narration">{entry.text}</p>
          {fallback && entry.traceId && (
            <button
              type="button"
              onKeyDown={activateOnEnter}
              className="critic-fallback"
              onClick={() => onTrace(entry.traceId ?? '')}
            >
              critic fallback
            </button>
          )}
        </div>
      );
    case 'note':
      return <p className="event-note">◆ {entry.text}</p>;
    case 'episode_end':
      return (
        <section className="episode-end">
          <h3>End of chapter</h3>
          <p>{name(entry.holder)} holds the quill.</p>
          <p>{entry.text}</p>
          <p>{entry.beat} beats</p>
        </section>
      );
  }
}
