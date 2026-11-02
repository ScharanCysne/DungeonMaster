import { activateOnEnter } from './keyboard';
import type { EntityId } from '@dungeon/shared';
import type { BeatState, ClientState, WorldState } from '../store/types';
import { BeatStatus } from './BeatStatus';
import { exampleVerbs, shouldRecall } from './composerModel';

export function Composer({
  world,
  selection,
  text,
  disabled,
  status,
  beat,
  onClear,
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
  beat: BeatState;
  onClear: () => void;
  onToggle: (id: EntityId) => void;
  onText: (text: string) => void;
  onRecall: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="composer">
      <div className="selection-chips">
        {selection.ids.map((id) => (
          <button
            type="button"
            onKeyDown={activateOnEnter}
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
          placeholder={exampleVerbs(selection.ids, world.entities)}
          value={text}
          maxLength={500}
          disabled={beat.status === 'ended'}
          onChange={(event) => onText(event.target.value.slice(0, 500))}
          aria-describedby={text.length >= 450 ? 'intent-count' : undefined}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (!event.repeat) event.currentTarget.form?.requestSubmit();
            }
            if (event.key === 'Escape') onClear();
            if (
              event.key === 'ArrowUp' &&
              shouldRecall(text, event.currentTarget.selectionStart)
            ) {
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
      {text.length >= 450 && (
        <p id="intent-count" className="intent-count">
          {text.length}/500
        </p>
      )}
      <BeatStatus beat={beat} fallback={status} />
    </div>
  );
}
