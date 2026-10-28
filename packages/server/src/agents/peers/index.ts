export { runPeer } from './agent.js';
export type { PeerResult } from './agent.js';
export { buildPeerRequest } from './request.js';
export type { PeerInput } from './request.js';
export * from './rotation.js';

import type { PeerResult } from './agent.js';
export function peerSayLines(turns: readonly PeerResult[]) {
  return turns.flatMap(({ actor, turn }) =>
    turn.kind === 'intent' && turn.say
      ? [{ speaker: actor, text: turn.say }]
      : [],
  );
}
