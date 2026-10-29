import type { EntityId } from '@dungeon/shared';
import type { BeatState, ClientState, WorldState } from '../store/types';

export function beatStatus(beat: BeatState): string {
  if (beat.status === 'paused')
    return `Paused: ${beat.reason.replaceAll('_', ' ')}. ${beat.retryInMs === null ? 'Waiting for you.' : `Retry in ${Math.ceil(beat.retryInMs / 1000)}s.`}`;
  if (beat.status === 'ended') return 'The chapter has ended.';
  if (beat.status !== 'running') return '';
  const labels = {
    peers: 'A peer is speaking…',
    dm: 'DM is resolving…',
    npc_voice: 'An NPC is finding their words…',
    critic: 'Checking the narration…',
    dm_retry: 'DM is revising…',
    committing: 'Saving the beat…',
  };
  const label = beat.phase
    ? labels[beat.phase]
    : "The Dungeon Master's quill scratches…";
  return `${label}${beat.toolCalls === null ? '' : ` ${beat.toolCalls} ${beat.toolCalls === 1 ? 'action' : 'actions'}`}`;
}
export function Composer({
  world,
  selection,
  text,
  disabled,
  status,
  onToggle,
  onText,
  onRecall,
  onSubmit,
}: {
  world: WorldState;
  selection: ClientState['selection'];
  text: string;
  disabled: boolean;
  status: string;
  onToggle: (id: EntityId) => void;
  onText: (text: string) => void;
  onRecall: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="composer">
      <p className="beat-status" role="status" aria-live="polite">
        {status}
      </p>
      <div className="selection-chips">
        {selection.ids.map((id) => (
          <button
            type="button"
            className="chip"
            key={id}
            onClick={() => onToggle(id)}
            aria-label={`Remove ${world.entities[id]?.name ?? id} from selection`}
          >
            {world.entities[id]?.name ?? id} <span aria-hidden="true">×</span>
          </button>
        ))}
        {!selection.ids.length && (
          <span className="selection-hint">
            Mark people and things to write about them…
          </span>
        )}
      </div>
      {selection.tooMany && (
        <p className="selection-limit" role="status">
          Too many selections — choose up to 6.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled && text.trim()) onSubmit();
        }}
      >
        <span className="quill" aria-hidden="true">
          ✒
        </span>
        <label className="sr-only" htmlFor="intent">
          Your intent
        </label>
        <input
          id="intent"
          type="text"
          autoComplete="off"
          placeholder="I would like to…"
          value={text}
          maxLength={500}
          disabled={disabled}
          onChange={(event) => onText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              onRecall();
            }
          }}
        />
        <button
          type="submit"
          className="write-button"
          disabled={disabled || !text.trim()}
        >
          Write
        </button>
      </form>
    </div>
  );
}
