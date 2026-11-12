import type { Graph, ServerMessage } from '@dungeon/shared';
import type { ClientState } from './types';

export const edgeKey = (edge: Graph['edges'][number]) =>
  `${edge.type}:${edge.from}:${edge.to}`;

export function graphChanges(
  previous: Graph | null,
  graph: Graph,
  beat: number,
) {
  const oldNodes = new Map(previous?.nodes.map((node) => [node.id, node]));
  const oldEdges = new Map(
    previous?.edges.map((edge) => [edgeKey(edge), edge]),
  );
  return {
    nodes: graph.nodes
      .filter(
        (node) =>
          (beat > 0 && node.createdAtBeat === beat) ||
          (oldNodes.has(node.id) &&
            JSON.stringify(oldNodes.get(node.id)) !== JSON.stringify(node)),
      )
      .map((node) => node.id),
    edges: graph.edges
      .filter(
        (edge) =>
          (beat > 0 && edge.createdAtBeat === beat) ||
          (oldEdges.has(edgeKey(edge)) &&
            JSON.stringify(oldEdges.get(edgeKey(edge))) !==
              JSON.stringify(edge)),
      )
      .map(edgeKey),
  };
}

export function reduceDev(
  dev: ClientState['dev'],
  message: ServerMessage,
): ClientState['dev'] {
  if (message.type === 'beat_result') {
    const graph = message.groundTruth;
    return {
      ...dev,
      revision: dev.revision + 1,
      beat: message.beat,
      previousGraph: dev.graph,
      devTools: dev.devTools || graph !== undefined,
      error: graph ? null : dev.error,
      groundTruth: graph ?? null,
      changes: graph
        ? graphChanges(dev.groundTruth, graph, message.beat)
        : { nodes: [], edges: [] },
    };
  }
  if (message.type === 'debug_response') {
    const next = { ...dev, devTools: true, error: null };
    if (message.kind === 'trace')
      next.traces = { ...dev.traces, [message.data.traceId]: message.data };
    if (message.kind === 'knowledge')
      next.knowledge = {
        ...dev.knowledge,
        [message.data.character.id]: message.data,
      };
    if (message.kind === 'graph') {
      next.graph = message.data;
      if (!dev.groundTruth)
        next.changes = graphChanges(dev.previousGraph, message.data, dev.beat);
    }
    return next;
  }
  if (message.type === 'error') {
    if (message.code === 'DEBUG_DISABLED')
      return {
        ...dev,
        devTools: false,
        dmView: false,
        inspector: false,
        groundTruth: null,
        graph: null,
        previousGraph: null,
        traces: {},
        knowledge: {},
        changes: { nodes: [], edges: [] },
        error: message,
      };
    return { ...dev, error: message };
  }
  return dev;
}
