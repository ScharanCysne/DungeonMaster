import { describe, expect, it } from 'vitest';
import { parsePlayInput } from './playParser.js';
import type { MentionEntity } from './playParser.js';

const visible: MentionEntity[] = [
  { id: 'char:brann', name: 'Brann, the barkeep' },
  { id: 'container:floorboard', name: 'Loose floorboard' },
  { id: 'item:rope', name: 'Rope' },
];

describe('CLI intent parser', () => {
  it('resolves visible id slugs and preserves the free text', () => {
    expect(parsePlayInput('@brann @floorboard pry it up', visible)).toEqual({
      kind: 'intent',
      intent: {
        type: 'player_intent',
        selection: ['char:brann', 'container:floorboard'],
        text: 'pry it up',
      },
    });
  });
  it('accepts full ids, quoted display names, case and duplicate mentions', () => {
    expect(
      parsePlayInput(
        '@CHAR:BRANN @"loose floorboard" @brann pry it up',
        visible,
      ),
    ).toMatchObject({
      intent: {
        selection: ['char:brann', 'container:floorboard'],
        text: 'pry it up',
      },
    });
  });
  it('supports names in single quotes and ordinary free text', () => {
    expect(parsePlayInput("use @'Rope' to climb", visible)).toMatchObject({
      intent: { selection: ['item:rope'], text: 'use to climb' },
    });
    expect(parsePlayInput('I ask for ale.', visible)).toMatchObject({
      intent: { selection: [], text: 'I ask for ale.' },
    });
  });
  it.each(['@quill', '@item:quill', '@unknown'])(
    'rejects unknown or hidden %s',
    (text) => {
      expect(() => parsePlayInput(text, visible)).toThrow(
        `Unknown or invisible mention ${text}`,
      );
    },
  );
  it('rejects ambiguous slugs and asks for a full id', () => {
    const entities: MentionEntity[] = [
      ...visible,
      { id: 'item:brann', name: 'Brann statuette' },
    ];
    expect(() => parsePlayInput('@brann', entities)).toThrow(
      'Ambiguous mention @brann: char:brann, item:brann',
    );
    expect(parsePlayInput('@char:brann', entities)).toMatchObject({
      intent: { selection: ['char:brann'] },
    });
  });
  it.each(['@', '@"unfinished', '@missing'])(
    'rejects malformed mentions %s',
    (input) => {
      expect(() => parsePlayInput(input, visible)).toThrow();
    },
  );
  it('enforces text and selection limits', () => {
    expect(() => parsePlayInput('x'.repeat(501), visible)).toThrow('500');
    const entities: MentionEntity[] = Array.from({ length: 7 }, (_, index) => ({
      id: `item:object-${index}`,
      name: `Object ${index}`,
    }));
    expect(() =>
      parsePlayInput(entities.map(({ id }) => `@${id}`).join(' '), entities),
    ).toThrow();
  });
});

describe('CLI commands', () => {
  it.each([
    ['/look', 'look'],
    ['/inventory', 'inventory'],
    ['', 'empty'],
    ['  ', 'empty'],
  ])('parses %s', (input, kind) => {
    expect(parsePlayInput(input ?? '', visible)).toEqual({ kind });
  });
  it.each([
    ['/quit', 'save_and_quit'],
    ['/retry', 'retry_now'],
    ['/budget +5', 'raise_budget'],
    ['/budget', 'raise_budget'],
  ])('maps %s to the shared protocol', (input, command) => {
    expect(parsePlayInput(input ?? '', visible)).toEqual({
      kind: 'command',
      message: { type: 'session_command', command },
    });
  });
  it('uses the configured budget step', () => {
    expect(parsePlayInput('/budget +2.5', visible, 2.5)).toMatchObject({
      message: { command: 'raise_budget' },
    });
    expect(() => parsePlayInput('/budget +5', visible, 2.5)).toThrow(
      '/budget +2.5',
    );
  });
  it.each([
    '/look extra',
    '/unknown',
    '/budget -5',
    '/budget +0',
    '/budget +10',
  ])('rejects %s', (input) => {
    expect(() => parsePlayInput(input, visible)).toThrow();
  });
});
