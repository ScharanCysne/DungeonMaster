import { peerTurnSchema } from '@dungeon/shared';
import type { CharacterId, FactId, PeerTurn } from '@dungeon/shared';
import { requestText, unknownFactMentions } from '../characterContext.js';
import { LlmUnavailableError } from '../llm/errors.js';
import type { LlmProvider } from '../llm/types.js';
import { buildPeerRequest } from './request.js';
import type { PeerInput } from './request.js';

export interface PeerResult {
  actor: CharacterId;
  turn: PeerTurn;
  trace: {
    failed: boolean;
    reason?: string;
    nudged: boolean;
    promptLeaks: FactId[];
  };
}

export async function runPeer(
  provider: LlmProvider,
  input: PeerInput,
): Promise<PeerResult> {
  const actor = input.knowledge.character.id;
  const nudged = (input.consecutivePasses ?? 0) >= 3;
  const request = await buildPeerRequest(input);
  const promptLeaks = unknownFactMentions(
    requestText(request),
    input.knowledge,
    input.debugFacts ?? [],
  );
  try {
    const response = await provider.complete(request);
    if (response.stopReason !== 'end_turn')
      throw new Error(`Peer stopped with ${response.stopReason}.`);
    return {
      actor,
      turn: peerTurnSchema.parse(response.parsedOutput),
      trace: { failed: false, nudged, promptLeaks },
    };
  } catch (error) {
    if (error instanceof LlmUnavailableError) throw error;
    return {
      actor,
      turn: { kind: 'pass' },
      trace: {
        failed: true,
        nudged,
        promptLeaks,
        reason: error instanceof Error ? error.message : 'Peer output failed.',
      },
    };
  }
}
