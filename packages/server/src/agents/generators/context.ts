import type { Edge, EntityId, Fact, LocationId } from '@dungeon/shared';
import type { GraphNode } from '../../ontology/mutations.js';
import type { BeatContext } from '../tools/BeatContext.js';

export interface GenerationContext {
  nodes: GraphNode[];
  edges: Edge[];
  basedOn: Fact[];
  locationId: LocationId | undefined;
  excerpt: string;
}

export function graphLocation(
  id: EntityId,
  nodes: readonly GraphNode[],
  edges: readonly Edge[],
  visited = new Set<EntityId>(),
): LocationId | undefined {
  if (visited.has(id)) return undefined;
  visited.add(id);
  const node = nodes.find((node) => node.id === id);
  if (node && 'tileBounds' in node) return node.id;
  for (const edge of edges) {
    if (edge.type === 'LOCATED_IN' && edge.from === id) return edge.to;
    if ((edge.type === 'CARRIES' || edge.type === 'CONTAINS') && edge.to === id)
      return graphLocation(edge.from, nodes, edges, visited);
  }
  return undefined;
}

export function normalizedTag(tag: string): string {
  return tag.normalize('NFKC').trim().toLowerCase();
}

export async function generationContext(
  ctx: BeatContext,
  references: readonly EntityId[],
): Promise<GenerationContext> {
  const view = await ctx.softState();
  const [nodes, edges] = await Promise.all([view.nodes(), view.edges()]);
  const locationId = references
    .map((id) => graphLocation(id, nodes, edges))
    .find((id) => id !== undefined);
  const locations = new Set<EntityId>(locationId ? [locationId] : []);
  for (let size = -1; size !== locations.size;) {
    size = locations.size;
    for (const edge of edges)
      if (edge.type === 'PART_OF' && locations.has(edge.to))
        locations.add(edge.from);
  }
  const contents = nodes.filter((node) => {
    const location = graphLocation(node.id, nodes, edges);
    return location && locations.has(location) && node.id !== locationId;
  });
  const subjects = new Set<EntityId>([
    ...references,
    ...locations,
    ...contents.map((node) => node.id),
  ]);
  const factIds = new Set(
    edges
      .filter((edge) => edge.type === 'ABOUT' && subjects.has(edge.to))
      .map((edge) => edge.from),
  );
  const basedOn = nodes.filter(
    (node): node is Fact => 'statement' in node && factIds.has(node.id),
  );
  const frequency = new Map<string, number>();
  for (const node of nodes.filter((node) =>
    node.createdBy.startsWith('generator:'),
  ))
    for (const tag of new Set(node.tags.map(normalizedTag).filter(Boolean)))
      frequency.set(tag, (frequency.get(tag) ?? 0) + 1);
  const motifs = [...frequency]
    .sort(([a, ac], [b, bc]) => bc - ac || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, 12)
    .map(([tag, count]) => ({ tag, count }));
  return {
    nodes,
    edges,
    basedOn,
    locationId,
    excerpt: JSON.stringify({
      location: nodes.find((node) => node.id === locationId) ?? null,
      contents,
      referencedEntities: nodes.filter((node) => references.includes(node.id)),
      aboutFacts: basedOn,
      existingNames: nodes
        .filter((node) => !('seq' in node))
        .map(({ id, name }) => ({ id, name })),
      recentlyUsedMotifs: motifs,
    }),
  };
}
