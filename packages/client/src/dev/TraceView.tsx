import { useEffect, useRef } from 'react';
import type { BeatTrace } from '@dungeon/shared';
import { latestTraces, traceModel } from './traceModel';

export function TraceView({
  traces,
  focus,
}: {
  traces: Record<string, BeatTrace>;
  focus: string | null;
}) {
  const host = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focus) return;
    const card = Array.from(
      host.current?.querySelectorAll('article') ?? [],
    ).find((item) => item.id === `trace-${focus}`);
    if (card instanceof HTMLElement) {
      card.scrollIntoView?.({ block: 'nearest' });
      card.focus({ preventScroll: true });
    }
  }, [focus, traces]);
  return (
    <section className="trace-view" aria-label="Beat traces" ref={host}>
      {!Object.keys(traces).length && <p>No beat traces loaded yet.</p>}
      {latestTraces(traces).map((trace) => {
        const model = traceModel(trace);
        return (
          <article
            className="trace-card"
            id={`trace-${trace.traceId}`}
            key={trace.traceId}
            tabIndex={-1}
          >
            <h3>
              Beat {trace.beat} · {trace.outcome}
            </h3>
            <p>
              {trace.latencyMs} ms · {model.tools.length} tool calls
            </p>
            <p>
              {model.totalInput} input tokens · {model.usage.output} output
              tokens · {model.cachePercent}% cache hit
            </p>
            <p>
              Uncached {model.usage.input} · cache read {model.usage.cacheRead}{' '}
              · cache write {model.usage.cacheWrite}
            </p>
            <h4>Intents</h4>
            {trace.intents.map((intent, index) => (
              <p key={index}>
                {intent.actor}: {intent.text} {intent.selection.join(', ')}
                {intent.private ? ' (private)' : ''}
              </p>
            ))}
            {model.tools.map((tool) => (
              <div key={tool.key} className="trace-tool">
                <h4
                  className={tool.ok === false ? 'bad' : tool.ok ? 'good' : ''}
                >
                  {tool.ok === null ? '?' : tool.ok ? '✓' : '✗'} {tool.name}
                </h4>
                <pre aria-label={`${tool.name} arguments`}>
                  {JSON.stringify(tool.input, null, 2)}
                </pre>
                <pre aria-label={`${tool.name} result`}>{tool.result}</pre>
              </div>
            ))}
            <h4>
              Critic:{' '}
              {trace.critic
                ? trace.critic.ok
                  ? 'accepted'
                  : 'rejected'
                : 'not recorded'}
            </h4>
            <p>
              {model.retries} critic retries · session attempt {trace.attempt}
            </p>
            {model.issues.map((issue, index) => (
              <p className="bad" key={index}>
                {issue.type}: “{issue.quote}” — {issue.explanation}
              </p>
            ))}
            <details>
              <summary>Raw trace JSON</summary>
              <pre>{JSON.stringify(trace, null, 2)}</pre>
            </details>
          </article>
        );
      })}
    </section>
  );
}
