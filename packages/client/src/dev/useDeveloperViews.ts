import { useEffect, useRef } from 'react';
import type { ClientMessage } from '@dungeon/shared';
import type { ClientState } from '../store/types';
import { graphFocus } from './graphModel';
import { knownAgents } from './knowledgeModel';
import { playerId } from '../store/world';

export function useDeveloperViews(
  state: ClientState,
  send: (message: ClientMessage) => boolean,
) {
  const { dev, connection, journal } = state;
  const focus = graphFocus(state).join(',');
  const agents = knownAgents(state.world, dev.dmView ? dev.groundTruth : null);
  const chosen =
    agents.find((agent) => agent.id === dev.chosenAgent)?.id ??
    playerId(state.world) ??
    agents[0]?.id ??
    null;
  const graphOpen = dev.inspector || dev.appendixTab === 'graph';
  const knowledgeOpen = dev.inspector || dev.appendixTab === 'knowledge';
  const traceOpen = dev.inspector || dev.appendixTab === 'trace';
  useEffect(() => {
    if (graphOpen && connection.status === 'open')
      send({
        type: 'debug_request',
        kind: 'graph',
        ...(focus ? { target: focus } : {}),
      });
  }, [graphOpen, focus, dev.revision, connection.status, send]);
  useEffect(() => {
    if (knowledgeOpen && connection.status === 'open' && chosen)
      send({ type: 'debug_request', kind: 'knowledge', target: chosen });
  }, [knowledgeOpen, chosen, dev.revision, connection.status, send]);
  const requested = useRef(new Set<string>());
  useEffect(() => {
    requested.current.clear();
  }, [state.replay, state.world.beat]);
  useEffect(() => {
    if (connection.status !== 'open') {
      requested.current.clear();
      return;
    }
    if (traceOpen) {
      const target = String(state.connection.lastSeenBeat || state.world.beat);
      if (send({ type: 'debug_request', kind: 'trace', target }))
        requested.current.add(target);
    }
  }, [
    traceOpen,
    dev.revision,
    connection.status,
    send,
    state.connection.lastSeenBeat,
    state.world.beat,
  ]);
  useEffect(() => {
    if (!dev.devTools || connection.status !== 'open') return;
    for (const entry of journal.entries) {
      if (
        entry.kind !== 'narration' ||
        !entry.traceId ||
        entry.beat === null ||
        dev.traces[entry.traceId] ||
        requested.current.has(String(entry.beat))
      )
        continue;
      if (
        send({
          type: 'debug_request',
          kind: 'trace',
          target: String(entry.beat),
        })
      )
        requested.current.add(String(entry.beat));
    }
  }, [journal.entries, dev.devTools, dev.traces, connection.status, send]);
  return { agents, chosen };
}
