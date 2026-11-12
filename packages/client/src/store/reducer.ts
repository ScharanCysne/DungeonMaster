import type { ServerMessage } from '@dungeon/shared';
import {
  beatHeader,
  commitJournal,
  narrationEntries,
  strikeProvisional,
} from './journal';
import type { ClientState } from './types';
import { reduceDev } from './dev';
import { mapFeedback } from './mapFeedback';
import { applyWorldEvents, snapshotWorld, visibleEvents } from './world';

function startBeat(state: ClientState, number: number): ClientState {
  let entries = beatHeader(state.journal.entries, number);
  if (
    state.composer.pending &&
    !entries.some((entry) => entry.id === `intent:${number}`)
  )
    entries = [
      ...entries,
      {
        kind: 'intent',
        id: `intent:${number}`,
        beat: number,
        text: state.composer.pending.text,
        selection: state.composer.pending.selection,
      },
    ];
  return {
    ...state,
    mapCues: [],
    mapFeedback: mapFeedback([], number),
    journal: { ...state.journal, entries },
    beat: {
      status: 'running',
      number,
      phase: null,
      toolCalls: null,
      startedAt: state.connection.receivedAt,
    },
    connection: { ...state.connection, error: null },
  };
}
export function applyServerMessage(
  state: ClientState,
  message: ServerMessage,
): ClientState {
  switch (message.type) {
    case 'world_snapshot': {
      if (message.beat < state.world.beat) return state;
      const world = snapshotWorld(message, state.world);
      return {
        ...state,
        world,
        mapFeedback:
          message.beat > state.mapFeedback.beat
            ? mapFeedback([], message.beat)
            : state.mapFeedback,
        beat:
          state.beat.status === 'idle'
            ? { status: 'idle', number: message.beat }
            : state.beat,
        selection: {
          ...state.selection,
          ids: state.selection.ids.filter((id) => world.entities[id]),
        },
        journal: state.journal.entries.length
          ? state.journal
          : {
              ...state.journal,
              // Snapshot narrations have no beat IDs; replace this context when replay arrives.
              entries: message.recentNarration.flatMap((narration, index) =>
                narrationEntries(narration, null, `snapshot:${index}`),
              ),
            },
      };
    }
    case 'beat_started':
    case 'resumed':
      if (
        message.beat <= state.connection.lastSeenBeat ||
        state.beat.status === 'ended'
      )
        return state;
      if (state.beat.status === 'running' && state.beat.number === message.beat)
        return state;
      return startBeat(state, message.beat);
    case 'beat_progress': {
      if (
        message.beat <= state.connection.lastSeenBeat ||
        state.beat.status === 'paused' ||
        state.beat.status === 'ended'
      )
        return state;
      const next =
        state.beat.status === 'running' && state.beat.number === message.beat
          ? state
          : startBeat(state, message.beat);
      const progress = message.progress;
      if (progress.kind === 'status' && next.beat.status === 'running')
        return {
          ...next,
          beat: {
            ...next.beat,
            phase: progress.phase,
            toolCalls: progress.toolCalls ?? next.beat.toolCalls,
          },
        };
      if (progress.kind === 'map_cue')
        return { ...next, mapCues: [...next.mapCues, progress] };
      if (progress.kind === 'peer_line')
        return {
          ...next,
          journal: {
            ...next.journal,
            entries: [
              ...next.journal.entries,
              {
                kind: 'dialogue',
                id: `progress:${message.beat}:${next.journal.entries.length}`,
                beat: message.beat,
                speaker: progress.speaker,
                text: progress.text,
                status: 'provisional',
              },
            ],
          },
        };
      return next;
    }
    case 'beat_result': {
      if (message.beat <= state.connection.lastSeenBeat) return state;
      const events = visibleEvents(state.world, message.events);
      const world = applyWorldEvents(state.world, events, message.beat);
      // Names introduced during this beat must be available to stamps and notes.
      const names = {
        ...world,
        entities: { ...state.world.entities, ...world.entities },
      };
      return {
        ...state,
        world,
        mapCues: [],
        mapFeedback:
          message.beat > state.world.beat && message.beat >= state.beat.number
            ? mapFeedback(events, message.beat)
            : state.mapFeedback,
        connection: { ...state.connection, lastSeenBeat: message.beat },
        beat:
          state.beat.status === 'ended' || state.beat.number > message.beat
            ? state.beat
            : { status: 'idle', number: Math.max(world.beat, message.beat) },
        selection: {
          ...state.selection,
          ids: state.selection.ids.filter((id) => world.entities[id]),
        },
        composer: { ...state.composer, pending: null },
        journal: {
          ...state.journal,
          entries: commitJournal(state.journal.entries, message, events, names),
          reveal: {
            beat: message.beat,
            status: message.beat < state.world.beat ? 'complete' : 'revealing',
          },
        },
        dev: reduceDev(state.dev, message),
      };
    }
    case 'paused':
      return {
        ...state,
        mapCues: [],
        beat: {
          status: 'paused',
          number: message.beat,
          reason: message.reason,
          attempt: message.attempt,
          retryInMs: message.retryInMs,
        },
        journal: {
          ...state.journal,
          entries: [
            ...strikeProvisional(state.journal.entries, message.beat),
            {
              kind: 'note',
              id: `pause:${message.beat}:${state.journal.entries.length}`,
              beat: message.beat,
              text: `Paused: ${message.reason.replaceAll('_', ' ')}. Provisional lines are withdrawn.`,
            },
          ],
        },
      };
    case 'episode_ended': {
      const id = `end:${message.beat}`;
      return {
        ...state,
        mapCues: [],
        beat: { status: 'ended', number: message.beat, holder: message.holder },
        composer: { ...state.composer, pending: null },
        journal: {
          ...state.journal,
          entries: state.journal.entries.some((entry) => entry.id === id)
            ? state.journal.entries
            : [
                ...state.journal.entries,
                {
                  kind: 'episode_end',
                  id,
                  beat: message.beat,
                  holder: message.holder,
                  text: message.summary,
                },
              ],
        },
      };
    }
    case 'error':
      if (
        ['DEBUG_DISABLED', 'TRACE_NOT_FOUND', 'BAD_TARGET'].includes(
          message.code,
        )
      )
        return { ...state, dev: reduceDev(state.dev, message) };
      return {
        ...state,
        connection: { ...state.connection, error: message },
        composer: {
          ...state.composer,
          text: state.composer.text || state.composer.pending?.text || '',
          pending: null,
        },
      };
    case 'debug_response':
      return { ...state, dev: reduceDev(state.dev, message) };
  }
}
