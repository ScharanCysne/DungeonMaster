import type { EpisodeEnded, ReplayState } from '@dungeon/shared';
import { createInitialState } from './types';
import type { ClientState } from './types';
import { commitJournal } from './journal';
import { playerId, snapshotWorld, visibleEvents } from './world';
import { inventoryMetadata } from './inventory';

export function resetSession(state: ClientState): ClientState {
  const initial = createInitialState();
  return {
    ...initial,
    connection: { ...state.connection, lastSeenBeat: 0, error: null },
    dev: {
      ...initial.dev,
      devTools: state.dev.devTools,
      dmView: state.dev.dmView,
      inspector: state.dev.inspector,
      revision: state.dev.revision + 1,
    },
  };
}

export function endEpisode(
  state: ClientState,
  message: EpisodeEnded,
): ClientState {
  const id = `end:${message.beat}`;
  return {
    ...state,
    mapCues: [],
    beat: { status: 'ended', number: message.beat, holder: message.holder },
    composer: { ...state.composer, pending: null },
    journal: {
      ...state.journal,
      reveal: null,
      entries: [
        ...state.journal.entries.filter((entry) => entry.id !== id),
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

export function replaceReplay(
  state: ClientState,
  message: ReplayState,
): ClientState {
  let next = resetSession(state);
  next.replay = state.replay;
  next.world = snapshotWorld(
    { ...message.snapshot, recentNarration: [] },
    next.world,
  );
  next.results = message.results;
  for (const result of message.results) {
    const events = visibleEvents(next.world, result.events);
    next.world = {
      ...next.world,
      ...inventoryMetadata(
        next.world,
        events,
        result.beat,
        playerId(next.world),
      ),
    };
    next.journal.entries = commitJournal(
      next.journal.entries,
      result,
      events,
      next.world,
    );
  }
  next.beat = { status: 'idle', number: message.snapshot.beat };
  next.connection.lastSeenBeat = message.snapshot.beat;
  next.mapFeedback = { beat: message.snapshot.beat, changed: [], moves: [] };
  next.dev = {
    ...next.dev,
    appendixTab: state.dev.appendixTab,
    chosenAgent: state.dev.chosenAgent,
    beat: message.snapshot.beat,
    devTools: state.dev.devTools || !!message.groundTruth,
    groundTruth: message.groundTruth ?? null,
  };
  if (message.ended) next = endEpisode(next, message.ended);
  return next;
}
