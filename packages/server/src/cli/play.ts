import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { configSchema } from '@dungeon/shared';
import { AnthropicProvider } from '../agents/llm/AnthropicProvider.js';
import { loadNeo4jConfig } from '../config/neo4j.js';
import { Neo4jStore } from '../ontology/Neo4jStore.js';
import { MemoryStore } from '../ontology/MemoryStore.js';
import { Session } from '../beat/Session.js';
import { parsePlayInput } from './playParser.js';
import { costMeter, displayLook, displayMessage } from './playDisplay.js';
import { createStatusRenderer } from './playStatus.js';
import { createPlayOutput } from './playOutput.js';

const args = process.argv.slice(2);
const resumeAt = args.indexOf('--resume');
const resumeId = resumeAt < 0 ? undefined : args[resumeAt + 1];
if (resumeAt >= 0 && (!resumeId || resumeId.startsWith('--')))
  throw new Error('--resume requires a session id.');
const config = configSchema.parse({
  budget: {
    ...(process.env.SESSION_BUDGET_USD === undefined
      ? {}
      : { sessionUsd: Number(process.env.SESSION_BUDGET_USD) }),
    ...(process.env.SESSION_BUDGET_STEP_USD === undefined
      ? {}
      : { stepUsd: Number(process.env.SESSION_BUDGET_STEP_USD) }),
  },
});
const provider = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  config,
});
const store = args.includes('--neo4j')
  ? await Neo4jStore.connect(loadNeo4jConfig())
  : new MemoryStore();
const status = createStatusRenderer({
  write: (text) => {
    stdout.write(text);
  },
  now: Date.now,
  isTTY: stdout.isTTY === true,
  setInterval,
  clearInterval,
});
const write = status.write;
const rl = createInterface({
  input: stdin,
  output: stdout,
  terminal: stdin.isTTY,
});
// Created before any await: lines piped in while the session starts are
// buffered by the iterator instead of being emitted to nobody.
const lines = rl[Symbol.asyncIterator]();
let readerClosed = false;
rl.once('close', () => {
  readerClosed = true;
});
// Piped input can end while a beat is still running; never touch a closed reader.
const prompt = (text = '> ') => {
  if (readerClosed) return;
  rl.setPrompt(text);
  rl.prompt(true);
};
// A function call, so the check reads the state after each awaited beat.
const hasEnded = (current: Session) => current.state.status === 'ended';
let session: Session | undefined;
let countdown: ReturnType<typeof setInterval> | undefined;
const output = createPlayOutput({
  status,
  visibleNames: async () => (session ? (await session.look()).selectable : []),
});
const remember = (view: Awaited<ReturnType<Session['look']>>) => {
  output.remember(view.selectable);
  return view;
};

try {
  const options = {
    provider,
    store,
    config,
    onMessage: (message: Parameters<typeof displayMessage>[0]) => {
      output.message(message);
      if (countdown) clearInterval(countdown);
      countdown = undefined;
      if (
        message.type === 'paused' &&
        message.retryInMs !== null &&
        stdin.isTTY
      ) {
        const retryAt = Date.now() + message.retryInMs;
        countdown = setInterval(() => {
          prompt(
            `Paused — retry in ${Math.max(0, Math.ceil((retryAt - Date.now()) / 1000))}s > `,
          );
        }, 1000);
      }
      if (message.type === 'episode_ended' && !readerClosed) rl.close();
    },
  };
  session = resumeId
    ? await Session.resume(resumeId, options)
    : await Session.start(options);
  const active = session;
  await output.flush();
  write(
    `Session ${active.id}. Select with @id, @slug or @"Full Name". /look /inventory /retry /budget +${config.budget.stepUsd} /quit`,
  );
  displayLook(remember(await active.look()), write);
  write(costMeter(active));
  if (active.state.status === 'ended') {
    if (!readerClosed) rl.close();
  } else {
    // Lines are handled one at a time, so input typed or piped during a beat
    // waits its turn instead of being dropped; end of input ends the loop.
    prompt();
    for await (const line of { [Symbol.asyncIterator]: () => lines }) {
      let quit = false;
      try {
        // Pause commands remain usable when the graph is unavailable.
        const visible = line.trim().startsWith('/')
          ? []
          : remember(await active.look()).selectable;
        const input = parsePlayInput(line, visible, config.budget.stepUsd);
        if (input.kind === 'look')
          displayLook(remember(await active.look()), write);
        if (input.kind === 'inventory') {
          const view = remember(await active.look());
          write(
            `Inventory: ${view.inventory.map(({ id, name }) => `${name} (@${id})`).join(', ') || 'empty'}; ${view.gold} gp`,
          );
        }
        if (input.kind === 'intent') await active.submitIntent(input.intent);
        if (input.kind === 'command') {
          await active.command(input.message);
          quit = input.message.command === 'save_and_quit';
        }
        await output.flush();
        write(costMeter(active));
      } catch (error) {
        await output.flush();
        status.stop();
        write(error instanceof Error ? error.message : 'Input failed.');
      }
      if (quit || hasEnded(active)) break;
      prompt();
    }
  }
  if (active.state.status !== 'ended')
    await active.command({ type: 'session_command', command: 'save_and_quit' });
} finally {
  await output.flush();
  status.stop();
  if (countdown) clearInterval(countdown);
  if (!readerClosed) rl.close();
  if (store instanceof Neo4jStore) await store.close();
}
