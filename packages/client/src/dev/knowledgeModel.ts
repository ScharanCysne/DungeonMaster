import type {
  BeatTrace,
  Character,
  Graph,
  KnowledgeSlice,
} from '@dungeon/shared';
import type { WorldState } from '../store/types';
import { latestTraces, traceModel } from './traceModel';

export function knownAgents(world: WorldState, groundTruth: Graph | null) {
  const nodes = [
    ...Object.values(world.entities),
    ...(groundTruth?.nodes ?? []),
  ];
  const agents = nodes.filter((node): node is Character => 'role' in node);
  return [...new Map(agents.map((node) => [node.id, node])).values()].sort(
    (a, b) =>
      Number(world.party.includes(b.id)) - Number(world.party.includes(a.id)) ||
      a.id.localeCompare(b.id),
  );
}
export function knowledgeModel(
  knowledge: KnowledgeSlice,
  groundTruth: Graph | null,
  traces: Record<string, BeatTrace>,
) {
  const known = new Set([
    ...knowledge.facts.map(({ fact }) => fact.id),
    ...knowledge.secrets.map((fact) => fact.id),
  ]);
  const facts = groundTruth?.nodes.filter((node) => 'truth' in node) ?? [];
  const latest = latestTraces(traces).find(
    (trace) =>
      trace.critic || trace.calls.some((call) => call.role === 'critic'),
  );
  const check = latest
    ? (latest.critic ?? traceModel(latest).checks.at(-1))
    : undefined;
  const issues =
    check && !check.ok
      ? check.issues.filter((issue) =>
          ['perspective_leak', 'npc_knowledge_leak'].includes(issue.type),
        )
      : [];
  return {
    unknown: facts.filter((fact) => !known.has(fact.id)),
    truth: new Map(facts.map((fact) => [fact.id, fact.truth])),
    latest,
    check,
    issues,
  };
}
