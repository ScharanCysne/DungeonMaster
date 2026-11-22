import { playerIntentSchema } from '@dungeon/shared';
import type { EntityId, PlayerIntent, SessionCommand } from '@dungeon/shared';

export type CliInput =
  | { kind: 'look' | 'inventory' | 'empty' }
  | { kind: 'intent'; intent: PlayerIntent }
  | { kind: 'command'; message: SessionCommand };
export interface MentionEntity {
  id: EntityId;
  name: string;
}

const normalize = (text: string) =>
  text.normalize('NFKC').toLocaleLowerCase('en').trim();
export function parsePlayInput(
  line: string,
  visible: readonly MentionEntity[],
  budgetStep = 5,
): CliInput {
  const input = line.trim();
  if (!input) return { kind: 'empty' };
  if (input.startsWith('/')) return parseCommand(input, budgetStep);
  if (input.length > 500)
    throw new Error('Intent text must be at most 500 characters.');
  const selection: EntityId[] = [];
  const text = input.replace(
    /@(?:"([^"]+)"|'([^']+)'|([\p{L}\p{N}_:.-]+))/gu,
    (
      _match: string,
      double: string | undefined,
      single: string | undefined,
      token: string | undefined,
    ) => {
      const mention = double ?? single ?? token ?? '';
      const key = normalize(mention);
      const matches = visible.filter(({ id, name }) =>
        [id, id.split(':')[1] ?? '', name].some(
          (alias) => normalize(alias) === key,
        ),
      );
      const ids = [...new Set(matches.map(({ id }) => id))];
      const id = ids[0];
      if (!id)
        throw new Error(
          `Unknown or invisible mention @${mention}. Use /look or /inventory.`,
        );
      if (ids.length > 1)
        throw new Error(
          `Ambiguous mention @${mention}: ${ids.join(', ')}. Use the full id.`,
        );
      if (!selection.includes(id)) selection.push(id);
      return '';
    },
  );
  if (text.includes('@'))
    throw new Error(
      'Invalid @mention. Quote names containing spaces, for example @"Loose floorboard".',
    );
  return {
    kind: 'intent',
    intent: playerIntentSchema.parse({
      type: 'player_intent',
      selection,
      text: text.replace(/\s+/g, ' ').trim(),
    }),
  };
}

function parseCommand(input: string, step: number): CliInput {
  if (input === '/look') return { kind: 'look' };
  if (input === '/inventory') return { kind: 'inventory' };
  const commands = new Map([
    ['/quit', 'save_and_quit'],
    ['/retry', 'retry_now'],
  ] as const);
  for (const [text, command] of commands)
    if (input === text)
      return { kind: 'command', message: { type: 'session_command', command } };
  if (input === '/budget' || /^\/budget\s+\+(\d+(?:\.\d+)?)$/.test(input)) {
    const amount = input === '/budget' ? step : Number(input.split('+')[1]);
    if (amount !== step)
      throw new Error(
        `Budget increases use the configured step: /budget +${step}.`,
      );
    return {
      kind: 'command',
      message: { type: 'session_command', command: 'raise_budget' },
    };
  }
  throw new Error(
    'Unknown command. Use /look, /inventory, /quit, /retry or /budget +5.',
  );
}
