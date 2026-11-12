import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { SessionCommand } from '@dungeon/shared';
import type { BeatState } from '../store/types';

const reasons = {
  llm_unavailable:
    'The storyteller is temporarily unavailable. Your progress is safe.',
  graph_unavailable:
    'The world archive is temporarily unavailable. Your progress is safe.',
  internal_error:
    'Something went wrong while writing this beat. Your progress is safe.',
  budget:
    'This session has reached its spending limit. Raise the cap to continue, or stop here.',
};

export function PauseOverlay({
  pause,
  devTools,
  onCommand,
  onTrace,
  trace,
}: {
  pause: Extract<BeatState, { status: 'paused' }>;
  devTools: boolean;
  trace?: ReactNode;
  onCommand: (command: SessionCommand['command']) => void;
  onTrace: (traceId: string, beat: number) => void;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (pause.retryAt === null || pause.retryAt === undefined) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [pause.retryAt]);
  const seconds =
    pause.retryAt == null
      ? null
      : Math.max(0, Math.ceil((pause.retryAt - now) / 1000));
  const traceBeat = Number(
    pause.traceId?.match(/^beat-(\d+)/)?.[1] ?? pause.number,
  );
  return (
    <div className="pause-veil">
      <section
        className="pause-parchment"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-title"
      >
        <span className="chapter-ornament" aria-hidden="true">
          ❧
        </span>
        <h2 id="pause-title">A pause in the tale</h2>
        <p>{reasons[pause.reason]}</p>
        {pause.reason !== 'budget' && (
          <p role="status">
            {seconds === null
              ? 'Waiting for you. Automatic retries have stopped.'
              : seconds > 0
                ? `Automatic retry in ${seconds}s.`
                : 'Checking whether we can continue…'}
          </p>
        )}
        <div className="chapter-actions">
          {pause.reason === 'budget' ? (
            <>
              {pause.budgetStepUsd !== undefined && (
                <button autoFocus onClick={() => onCommand('raise_budget')}>
                  Raise by ${pause.budgetStepUsd}
                </button>
              )}
              <button onClick={() => onCommand('save_and_quit')}>Stop</button>
            </>
          ) : (
            <>
              <button autoFocus onClick={() => onCommand('retry_now')}>
                Retry now
              </button>
              <button onClick={() => onCommand('save_and_quit')}>
                Save and quit
              </button>
            </>
          )}
        </div>
        {devTools && (
          <p className="pause-diagnostics">
            <code>{pause.errorCode ?? pause.reason}</code>
            {' · '}
            <a
              href={`#trace-${pause.traceId ?? `beat-${pause.number}-${pause.attempt}`}`}
              onClick={(event) => {
                event.preventDefault();
                onTrace(
                  pause.traceId ?? `beat-${pause.number}-${pause.attempt}`,
                  traceBeat,
                );
              }}
            >
              Trace for beat {traceBeat}
            </a>
          </p>
        )}
        {devTools && trace && <div className="pause-trace">{trace}</div>}
      </section>
    </div>
  );
}
