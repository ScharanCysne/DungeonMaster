import { character, narration, roll } from './fixtures.js';
import { movedEvent } from './event-fixtures.js';

export const graph = { nodes: [character], edges: [] };
export const knowledge = {
  character,
  facts: [],
  events: [],
  visible: [character],
  attitudes: [],
  quests: [],
  secrets: [],
  inventory: [],
};
export const usage = { input: 100, output: 30, cacheWrite: 20, cacheRead: 50 };
export const traceCall = {
  role: 'dm',
  model: 'test-model',
  promptVersion: 'dm-v1',
  request: { messages: ['Look at the box.'] },
  response: { text: 'A box.' },
  usage,
  latencyMs: 100,
  costUsd: 0.01,
};
export const trace = {
  traceId: 'beat-1',
  beat: 1,
  attempt: 0,
  intents: [],
  peerTurns: [],
  calls: [traceCall],
  events: [movedEvent],
  critic: { ok: true },
  latencyMs: 100,
  costUsd: 0.01,
  outcome: 'committed',
};
export const clientMessages = {
  hello: { type: 'hello', episodeId: 'fixture' },
  player_intent: {
    type: 'player_intent',
    selection: ['container:box'],
    text: 'Look inside.',
  },
  debug_request: { type: 'debug_request', kind: 'trace', target: 'beat-1' },
  session_command: { type: 'session_command', command: 'retry_now' },
};
export const serverMessages = {
  world_snapshot: {
    type: 'world_snapshot',
    beat: 0,
    mapId: 'fixture-map',
    entities: [character],
    positions: [
      { entityId: 'char:player', locationId: 'loc:room', tile: { x: 1, y: 1 } },
    ],
    party: ['char:player'],
    inventory: [],
    gold: 20,
    recentNarration: [narration],
  },
  beat_started: { type: 'beat_started', beat: 1 },
  beat_result: {
    type: 'beat_result',
    beat: 1,
    events: [movedEvent],
    narration,
    rolls: [roll],
    traceId: 'beat-1',
  },
  episode_ended: {
    type: 'episode_ended',
    beat: 1,
    holder: 'char:player',
    summary: 'You found it.',
  },
  debug_trace: { type: 'debug_response', kind: 'trace', data: trace },
  debug_knowledge: {
    type: 'debug_response',
    kind: 'knowledge',
    data: knowledge,
  },
  debug_graph: { type: 'debug_response', kind: 'graph', data: graph },
  error: {
    type: 'error',
    code: 'INVALID_SELECTION',
    message: 'Unknown id item:missing',
  },
  paused: {
    type: 'paused',
    reason: 'llm_unavailable',
    beat: 1,
    attempt: 0,
    retryInMs: 5_000,
  },
  resumed: { type: 'resumed', beat: 1 },
};
