import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { EntityId } from '@dungeon/shared';
import { graphSchema } from '@dungeon/shared';
import { fact } from '../../../shared/src/testing/fixtures';
import { createClientStore } from '../store';
import { debugGraph, debugKnowledge, debugTrace } from '../testing/dev';
import { snapshot } from '../testing/fixtures';
import { GraphView } from './GraphView';
import { KnowledgeView } from './KnowledgeView';
import { TraceView } from './TraceView';
import { knownAgents, knowledgeModel } from './knowledgeModel';
import { traceModel } from './traceModel';
import { mountGraph } from './cytoscapeAdapter';

const graphDestroy = vi.hoisted(() => vi.fn());
vi.mock('./cytoscapeAdapter', () => ({
  mountGraph: vi.fn(() => ({ destroy: graphDestroy })),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function world() {
  const store = createClientStore();
  store.getState().receive(snapshot, 0);
  return store.getState().world;
}

test('graph clicks open provenance and only visible entity nodes toggle selection', () => {
  const onToggle = vi.fn();
  render(
    <GraphView
      graph={debugGraph}
      world={world()}
      dmView={false}
      changes={{ nodes: [], edges: [] }}
      changedEntities={[]}
      focus={['char:player']}
      onToggle={onToggle}
    />,
  );
  const pick = vi.mocked(mountGraph).mock.calls[0]?.[2];
  if (!pick) throw new Error('Adapter was not mounted');
  act(() => pick('char:player'));
  expect(screen.getByRole('region', { name: 'Node char:player' })).toBeTruthy();
  expect(screen.getByText('createdBy')).toBeTruthy();
  expect(screen.getByText('createdAtBeat')).toBeTruthy();
  expect(onToggle).toHaveBeenCalledWith('char:player');
  for (const id of [
    'char:hidden',
    'fact:quill',
    'quest:quill',
  ] satisfies EntityId[])
    act(() => pick(id));
  expect(onToggle).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('char:player', { selector: 'button' }));
  expect(onToggle).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByText('Close node details'));
  expect(screen.queryByRole('region', { name: 'Node char:player' })).toBeNull();
});
test('graph adapter is disposed on unmount', () => {
  const view = render(
    <GraphView
      graph={debugGraph}
      world={world()}
      dmView={false}
      changes={{ nodes: [], edges: [] }}
      changedEntities={[]}
      focus={[]}
      onToggle={() => {}}
    />,
  );
  view.unmount();
  expect(graphDestroy).toHaveBeenCalledOnce();
});
test('trace cards show pass/fail, engine errors, arguments, critic history, retries, metrics and raw JSON', () => {
  render(
    <TraceView traces={{ [debugTrace.traceId]: debugTrace }} focus={null} />,
  );
  expect(screen.getByText('✓ inspect')).toBeTruthy();
  expect(screen.getByText('✗ transfer_item')).toBeTruthy();
  expect(screen.getByLabelText('transfer_item result').textContent).toContain(
    'Container is locked',
  );
  expect(screen.getByLabelText('inspect arguments').textContent).toContain(
    'container:box',
  );
  expect(
    screen.getByText(/Brann has not learned/, { selector: 'p' }),
  ).toBeTruthy();
  expect(screen.getByText('1 critic retries · session attempt 0')).toBeTruthy();
  expect(screen.getByText('100 ms · 2 tool calls')).toBeTruthy();
  expect(
    screen.getByText('680 input tokens · 120 output tokens · 29% cache hit'),
  ).toBeTruthy();
  expect(screen.getByText('Raw trace JSON').parentElement?.tagName).toBe(
    'DETAILS',
  );
});
test('trace is newest first, one card per beat, and focus reaches the linked card', () => {
  const newer = { ...debugTrace, traceId: 'beat-2', beat: 2 };
  const retry = { ...newer, traceId: 'beat-2-1', attempt: 1 };
  render(
    <TraceView
      traces={{ old: debugTrace, newer, retry }}
      focus={debugTrace.traceId}
    />,
  );
  const cards = screen.getAllByRole('article');
  expect(cards).toHaveLength(2);
  expect(cards[0]?.id).toBe('trace-beat-2-1');
  expect(document.activeElement?.id).toBe('trace-beat-1');
});
test('unrecorded results stay unknown and zero usage has zero cache percent', () => {
  const trace = {
    ...debugTrace,
    calls: debugTrace.calls.slice(0, 1).map((call) => ({
      ...call,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    })),
  };
  expect(traceModel(trace).tools[0]).toMatchObject({
    ok: null,
    result: 'Result not recorded in this trace.',
  });
  expect(traceModel(trace).cachePercent).toBe(0);
});
test('knowledge shows goal, evidence, attitudes and latest beat-wide leak check', () => {
  const onAgent = vi.fn();
  render(
    <KnowledgeView
      agents={knownAgents(world(), null)}
      chosen="char:player"
      knowledge={debugKnowledge}
      groundTruth={null}
      traces={{
        trace: {
          ...debugTrace,
          critic: { ok: false, issues: traceModel(debugTrace).issues },
        },
      }}
      onAgent={onAgent}
    />,
  );
  expect(screen.getByText('Find the quill. (active)')).toBeTruthy();
  expect(
    screen.getByText('source: seed · confidence: 0.6 · learned beat 0'),
  ).toBeTruthy();
  expect(screen.getByText('char:brann: -10 · Untrustworthy')).toBeTruthy();
  expect(screen.getByText(/npc_knowledge_leak: Brann/)).toBeTruthy();
  expect(
    knowledgeModel(debugKnowledge, null, { trace: debugTrace }).issues,
  ).toEqual([]);
  expect(screen.queryByText('Facts NOT known')).toBeNull();
  expect(screen.queryByText(/truth:/)).toBeNull();
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: 'char:brann' },
  });
  expect(onAgent).toHaveBeenCalledWith('char:brann');
});
test('DM truth flags and unknown facts require ground truth; agent list adds hidden characters only in DM', () => {
  const groundTruth = graphSchema.parse({
    ...debugGraph,
    nodes: [
      ...debugGraph.nodes,
      { ...fact, id: 'fact:false', statement: 'A false rumour.', truth: false },
    ],
  });
  const agents = knownAgents(world(), groundTruth);
  expect(knownAgents(world(), null).map((agent) => agent.id)).not.toContain(
    'char:hidden',
  );
  expect(agents.map((agent) => agent.id)).toContain('char:hidden');
  const view = render(
    <KnowledgeView
      agents={agents}
      chosen="char:player"
      knowledge={debugKnowledge}
      groundTruth={groundTruth}
      traces={{}}
      onAgent={() => {}}
    />,
  );
  expect(screen.getByText('truth: true')).toBeTruthy();
  expect(screen.getByText('truth: false')).toBeTruthy();
  expect(screen.getByText('Facts NOT known')).toBeTruthy();
  expect(screen.getByText('A false rumour.')).toBeTruthy();
  view.rerender(
    <KnowledgeView
      agents={agents}
      chosen="char:player"
      knowledge={debugKnowledge}
      groundTruth={null}
      traces={{}}
      onAgent={() => {}}
    />,
  );
  expect(screen.queryByText('Facts NOT known')).toBeNull();
  expect(
    within(screen.getByRole('region', { name: 'Knowledge slice' })).queryByText(
      /truth:/,
    ),
  ).toBeNull();
});
