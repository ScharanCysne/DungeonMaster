import type { CriticIssue, ResolvedNarration } from '@dungeon/shared';
import { fixture } from '../dm/testing.js';
import type { ScriptedReply } from '../llm/ScriptedProvider.js';
import type { CriticOutput } from './schema.js';

export const issue: CriticIssue = {
  type: 'state_contradiction',
  quote: 'The door is open.',
  explanation: 'The door remains closed.',
};
export function verdict(output: Partial<CriticOutput> = {}): ScriptedReply {
  return {
    type: 'structured',
    output: { claims: [], verdict: { ok: true }, selfLeaks: [], ...output },
  };
}
export const reject = verdict({ verdict: { ok: false, issues: [issue] } });
export const proposal: ResolvedNarration = {
  text: 'You pause beside the table.',
  lines: [],
};
export async function setup(replies: ScriptedReply[] = []) {
  const f = await fixture(replies);
  return {
    ...f,
    options: {
      provider: f.provider,
      ctx: f.ctx,
      dm: f.dm,
      intents: { player: { selection: [], text: 'I wait.' }, peers: [] },
    },
  };
}
