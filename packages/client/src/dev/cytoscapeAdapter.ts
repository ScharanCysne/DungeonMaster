import cytoscape from 'cytoscape';
import type { EntityId } from '@dungeon/shared';
import type { GraphModel } from './graphModel';

export function mountGraph(
  host: HTMLElement,
  model: GraphModel,
  onNode: (id: EntityId) => void,
) {
  const graph = cytoscape({
    container: host,
    elements: [
      ...model.nodes.map((node) => ({
        data: {
          id: node.id,
          label: node.label,
          color: node.color,
          order: node.order,
        },
        classes: node.changed ? 'changed' : '',
      })),
      ...model.edges.map(({ edge, id, color, dashed }) => ({
        data: {
          id,
          source: edge.from,
          target: edge.to,
          label: edge.type,
          color,
        },
        classes: dashed ? 'dashed' : '',
      })),
    ],
    style: [
      {
        selector: 'node',
        style: {
          'background-color': 'data(color)',
          label: 'data(label)',
          color: '#2b1d12',
          'font-size': 10,
          'text-valign': 'bottom',
          'text-margin-y': 5,
          'border-color': '#5a3e2b',
          'border-width': 1,
        },
      },
      {
        selector: 'node.changed',
        style: {
          'border-color': '#9b1c1c',
          'border-width': 3,
          'border-style': 'dashed',
        },
      },
      {
        selector: 'edge',
        style: {
          label: 'data(label)',
          'font-size': 7,
          color: '#7a6248',
          'line-color': 'data(color)',
          'target-arrow-color': 'data(color)',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          width: 1.5,
        },
      },
      { selector: 'edge.dashed', style: { 'line-style': 'dashed' } },
    ],
    layout: {
      name: 'concentric',
      animate: false,
      fit: true,
      padding: 28,
      concentric: (node) =>
        model.nodes.length -
        model.nodes.findIndex((item) => item.id === node.id()),
      levelWidth: () => 6,
      startAngle: -Math.PI / 2,
      clockwise: true,
    },
  });
  for (const node of model.nodes)
    graph.getElementById(node.id).on('tap', () => onNode(node.id));
  const observer =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => graph.resize());
  observer?.observe(host);
  return {
    destroy() {
      observer?.disconnect();
      graph.destroy();
    },
  };
}
