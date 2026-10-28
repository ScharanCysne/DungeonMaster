import type { Fact, PeerRotationState } from '@dungeon/shared';
import { createDmBeat } from '../agents/dm/index.js';
import type { DmBeat } from '../agents/dm/index.js';
import type { CriticCheck } from '../agents/critic/check.js';
import { reviewBeat } from '../agents/critic/index.js';
import {
  recordPeerTurns,
  rotatePeers,
  runPeer,
  peerSayLines,
} from '../agents/peers/index.js';
import type { PeerResult } from '../agents/peers/agent.js';
import type { LlmProvider } from '../agents/llm/types.js';
import { knowledgeSlice } from '../ontology/queries/knowledge.js';
import { roomOf } from '../engine/spatial.js';
import { generateRecap } from './recap.js';
import { intentDrafts } from './drafts.js';
import type { BeatContext } from '../agents/tools/BeatContext.js';
import type { BeatRunnerOptions, RunInput } from './types.js';

export interface PreparationDiagnostics {
  peers: PeerResult[];
  checks: CriticCheck[];
  firstFeedbackAt?: number;
  dm?: DmBeat;
}
export async function prepareBeat(
  options: BeatRunnerOptions,
  input: RunInput,
  provider: LlmProvider,
  ctx: BeatContext,
  diagnostics: PreparationDiagnostics,
  check: () => void,
) {
  const { store, content, player } = options;
  const rotation = rotatePeers(
    content.seed.characters.filter(({ role }) => role === 'peer'),
    input.intent,
    input.rotation,
  );
  const facts = (await store.nodes()).filter(
    (node): node is Fact => 'statement' in node,
  );
  const state = ctx.engine.state;
  const playerCharacter = state.characters.get(player);
  const peers = await Promise.all(
    rotation.selected.map(async (actor) => {
      const result = await runPeer(provider, {
        knowledge: await knowledgeSlice(store, actor),
        player: input.intent,
        ...(input.lastNarration ? { lastNarration: input.lastNarration } : {}),
        consecutivePasses: input.rotation.consecutivePasses[actor] ?? 0,
        timeoutMs: options.config.timeouts.othersMs,
        debugFacts: facts,
      });
      check();
      diagnostics.peers.push(result);
      const character = state.characters.get(actor);
      if (
        result.turn.kind === 'intent' &&
        result.turn.say &&
        character &&
        playerCharacter?.conscious &&
        roomOf(state, character.locationId) ===
          roomOf(state, playerCharacter.locationId)
      ) {
        diagnostics.firstFeedbackAt ??= options.clock.now();
        options.onProgress?.({
          type: 'beat_progress',
          beat: input.beat,
          progress: {
            kind: 'peer_line',
            speaker: actor,
            text: result.turn.say,
          },
        });
      }
      return result;
    }),
  );
  check();
  // Preserve roster order in the committed stream even when calls finish out of order.
  diagnostics.peers = peers;
  ctx.setPeerSayLines(peerSayLines(peers));
  ctx.appendEvents(intentDrafts(state, player, input.intent, peers));
  let recap = input.recap;
  if (input.beat > 1 && (input.beat - 1) % 10 === 0) {
    recap = await generateRecap(
      provider,
      input.records,
      options.config.timeouts.othersMs,
    );
    check();
    ctx.appendEvents([
      {
        type: 'RecapUpdated',
        payload: { text: recap },
        actor: null,
        private: true,
        witnesses: [],
      },
    ]);
  }
  const intents = { player: input.intent, peers };
  const dm = await createDmBeat({
    provider,
    ctx,
    seed: content.seed,
    intents,
    ...(recap ? { recap } : {}),
  });
  diagnostics.dm = dm;
  check();
  const review = await reviewBeat({
    provider,
    ctx,
    dm,
    result: await dm.run(),
    onCheck: (check) => {
      diagnostics.checks.push(check);
    },
    intents,
  });
  check();
  ctx.collectEngineEvents();
  return {
    review,
    recap,
    rotation: resolvedRotation(rotation.state, peers, ctx),
  };
}

function resolvedRotation(
  rotation: PeerRotationState,
  peers: PeerResult[],
  ctx: BeatContext,
) {
  const pending = peers
    .filter(
      ({ actor, turn }) =>
        turn.kind === 'intent' &&
        !ctx.events.some(
          (event) => event.actor === actor && event.type !== 'IntentReceived',
        ),
    )
    .map(({ actor }) => actor);
  return recordPeerTurns(rotation, peers, pending);
}
