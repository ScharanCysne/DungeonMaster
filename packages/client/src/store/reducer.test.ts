import { serverMessageSchema } from '@dungeon/shared';
import { describe, expect, it } from 'vitest';
import { serverMessages } from '../../../shared/src/testing/protocol-fixtures';
import { event, freeze, result, snapshot } from '../testing/fixtures';
import { applyClientAction } from './actions';
import { applyServerMessage } from './reducer';
import { createInitialState } from './types';

const seeded = () => applyServerMessage(createInitialState(), snapshot);
const started = () =>
  applyServerMessage(seeded(), { type: 'beat_started', beat: 1 });
const peer = {
  type: 'beat_progress',
  beat: 1,
  progress: { kind: 'peer_line', speaker: 'char:ilsa', text: 'A clue.' },
} satisfies Parameters<typeof applyServerMessage>[1];

describe('server messages', () => {
  it('loads only the snapshot world, preserving position, party, inventory, and gold', () => {
    const state = applyServerMessage(
      freeze(createInitialState()),
      freeze(snapshot),
    );
    expect(Object.keys(state.world.entities)).toHaveLength(7);
    expect(state.world.positions['char:player']?.tile).toEqual({ x: 1, y: 1 });
    expect(state.world).toMatchObject({
      mapId: 'tavern',
      party: snapshot.party,
      inventory: ['item:rope'],
      gold: 20,
    });
    expect(state.connection.lastSeenBeat).toBe(0);
  });
  it('uses snapshot narration as temporary context without inventing beat numbers', () => {
    const state = applyServerMessage(createInitialState(), {
      ...snapshot,
      recentNarration: [result().narration],
    });
    expect(state.journal.entries.map((entry) => entry.kind)).toEqual([
      'narration',
      'dialogue',
    ]);
    expect(state.journal.entries.every((entry) => entry.beat === null)).toBe(
      true,
    );
    const committed = applyServerMessage(state, result());
    expect(
      committed.journal.entries.filter((entry) => entry.kind === 'narration'),
    ).toHaveLength(1);
  });
  it('starts a beat with an injected timestamp and the submitted player intent', () => {
    let state = applyClientAction(seeded(), { type: 'received_at', at: 1500 });
    state = applyClientAction(state, {
      type: 'intent_sent',
      intent: {
        type: 'player_intent',
        selection: ['container:box'],
        text: 'Open the box.',
      },
    });
    const next = applyServerMessage(freeze(state), {
      type: 'beat_started',
      beat: 1,
    });
    expect(next.beat).toEqual({
      status: 'running',
      number: 1,
      phase: null,
      toolCalls: null,
      startedAt: 1500,
    });
    expect(next.journal.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'beat_header', beat: 1 }),
        expect.objectContaining({
          kind: 'intent',
          text: 'Open the box.',
          selection: ['container:box'],
        }),
      ]),
    );
  });
  it.each(['peers', 'dm', 'npc_voice', 'critic', 'dm_retry', 'committing'])(
    'records status phase %s without world or journal effects',
    (phase) => {
      const state = started();
      const next = applyServerMessage(
        freeze(state),
        serverMessageSchema.parse({
          type: 'beat_progress',
          beat: 1,
          progress: { kind: 'status', phase, toolCalls: 2 },
        }),
      );
      expect(next.beat).toMatchObject({
        status: 'running',
        phase,
        toolCalls: 2,
      });
      expect(next.world).toBe(state.world);
      expect(next.journal).toBe(state.journal);
    },
  );
  it('keeps map cues provisional without applying movement', () => {
    const state = started();
    const cue = {
      kind: 'map_cue',
      entity: 'char:brann',
      cue: 'look_at',
      target: 'container:box',
    } satisfies Extract<
      Parameters<typeof applyServerMessage>[1],
      { type: 'beat_progress' }
    >['progress'];
    const next = applyServerMessage(state, {
      type: 'beat_progress',
      beat: 1,
      progress: cue,
    });
    expect(next.mapCues).toEqual([cue]);
    expect(next.world).toBe(state.world);
    expect(applyServerMessage(next, result()).mapCues).toEqual([]);
  });
  it('shows a peer line provisionally, then finalises it once on commit', () => {
    const state = applyServerMessage(started(), peer);
    expect(state.journal.entries.at(-1)).toMatchObject({
      kind: 'dialogue',
      status: 'provisional',
    });
    const next = applyServerMessage(freeze(state), freeze(result()));
    expect(
      next.journal.entries.filter((entry) => entry.kind === 'dialogue'),
    ).toEqual([
      expect.objectContaining({
        status: 'final',
        speaker: 'char:ilsa',
        text: 'A clue.',
      }),
    ]);
    expect(next.beat.status).toBe('idle');
    expect(next.journal.reveal).toEqual({ beat: 1, status: 'revealing' });
  });
  it('strikes lines and records the pause, then keeps aborted lines struck through a retry', () => {
    const state = applyServerMessage(started(), peer);
    const paused = applyServerMessage(freeze(state), {
      type: 'paused',
      beat: 1,
      reason: 'llm_unavailable',
      attempt: 0,
      retryInMs: 1000,
    });
    expect(paused.beat).toEqual({
      status: 'paused',
      number: 1,
      reason: 'llm_unavailable',
      attempt: 0,
      retryInMs: 1000,
    });
    expect(paused.journal.entries.at(-2)).toMatchObject({ status: 'struck' });
    expect(paused.journal.entries.at(-1)).toMatchObject({
      kind: 'note',
      text: 'Paused: llm unavailable. Provisional lines are withdrawn.',
    });
    const resumed = applyServerMessage(paused, { type: 'resumed', beat: 1 });
    const next = applyServerMessage(
      applyServerMessage(resumed, peer),
      result(),
    );
    expect(
      next.journal.entries
        .filter((entry) => entry.kind === 'dialogue')
        .map((entry) => entry.status),
    ).toEqual(['struck', 'final']);
    expect(
      next.journal.entries.filter((entry) => entry.kind === 'beat_header'),
    ).toHaveLength(1);
  });
  it('deduplicates committed results and ignores late progress', () => {
    const state = applyServerMessage(seeded(), result());
    expect(applyServerMessage(state, result())).toBe(state);
    expect(applyServerMessage(state, peer)).toBe(state);
  });
  it('fills journal gaps after a current snapshot without rewinding HP or advancing the replay cursor early', () => {
    const state = applyServerMessage(seeded(), { ...snapshot, beat: 3 });
    expect(state.connection.lastSeenBeat).toBe(0);
    const next = applyServerMessage(state, result([event('DamageApplied')], 1));
    expect(next.world).toBe(state.world);
    expect(next.connection.lastSeenBeat).toBe(1);
    expect(next.beat.number).toBe(3);
    expect(
      next.journal.entries.some((entry) => entry.kind === 'narration'),
    ).toBe(true);
  });
  it('records chapter end once, including holder and summary', () => {
    const message = {
      type: 'episode_ended',
      beat: 1,
      holder: 'char:ilsa',
      summary: 'Ilsa took the quill.',
    } satisfies Parameters<typeof applyServerMessage>[1];
    const state = applyServerMessage(seeded(), message);
    expect(state.beat).toEqual({
      status: 'ended',
      number: 1,
      holder: 'char:ilsa',
    });
    expect(applyServerMessage(state, message).journal.entries).toHaveLength(1);
  });
  it('records server errors and restores an unaccepted intent for editing', () => {
    const state = applyClientAction(seeded(), {
      type: 'intent_sent',
      intent: { type: 'player_intent', selection: [], text: 'Look around.' },
    });
    const message = {
      type: 'error',
      code: 'NOT_DRIVER',
      message: 'Only the driver may submit.',
    } satisfies Parameters<typeof applyServerMessage>[1];
    const next = applyServerMessage(freeze(state), message);
    expect(next.connection.error).toEqual(message);
    expect(next.composer).toMatchObject({
      text: 'Look around.',
      pending: null,
    });
  });
  it.each(['debug_trace', 'debug_knowledge', 'debug_graph'] as const)(
    'caches %s only in the dev slice',
    (key) => {
      const state = seeded();
      const next = applyServerMessage(
        freeze(state),
        serverMessageSchema.parse(serverMessages[key]),
      );
      expect(next.world).toBe(state.world);
      expect(next.journal).toBe(state.journal);
      if (key === 'debug_trace')
        expect(next.dev.traces['beat-1']?.traceId).toBe('beat-1');
      if (key === 'debug_knowledge')
        expect(next.dev.knowledge['char:player']?.character.id).toBe(
          'char:player',
        );
      if (key === 'debug_graph') expect(next.dev.graph?.nodes).toHaveLength(1);
    },
  );
});
