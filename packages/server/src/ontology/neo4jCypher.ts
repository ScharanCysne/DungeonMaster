import type { Edge } from '@dungeon/shared';
import type { NodePrefix } from './neo4jCodec.js';

const nodeUpsert = `MERGE (n:Entity {id: $id})
WITH n, coalesce(n.createdBy, $props.createdBy) AS creator,
     coalesce(n.createdAtBeat, $props.createdAtBeat) AS beat
SET n = $props, n.createdBy = creator, n.createdAtBeat = beat
`;
export const upsertNodes: Record<NodePrefix, string> = {
  char: nodeUpsert + 'SET n:Character',
  item: nodeUpsert + 'SET n:Item',
  loc: nodeUpsert + 'SET n:Location',
  container: nodeUpsert + 'SET n:Container',
  faction: nodeUpsert + 'SET n:Faction',
  quest: nodeUpsert + 'SET n:Quest',
  fact: nodeUpsert + 'SET n:Fact',
  event: nodeUpsert + 'SET n:Event',
};
const endpoints = 'MATCH (a:Entity {id: $from}), (b:Entity {id: $to})\n';
const edgeProps = `
WITH r, coalesce(r.createdBy, $props.createdBy) AS creator,
     coalesce(r.createdAtBeat, $props.createdAtBeat) AS beat
SET r = $props, r.createdBy = creator, r.createdAtBeat = beat
RETURN count(r) AS matched`;
const knowsProps = `
WITH r, coalesce(r.createdBy, $props.createdBy) AS creator,
     coalesce(r.createdAtBeat, $props.createdAtBeat) AS beat,
     coalesce(r.retractedAtBeat, $props.retractedAtBeat) AS retracted
SET r = $props, r.createdBy = creator, r.createdAtBeat = beat, r.retractedAtBeat = retracted
RETURN count(r) AS matched`;
export const upsertEdges: Record<Edge['type'], string> = {
  PART_OF: endpoints + 'MERGE (a)-[r:PART_OF]->(b)' + edgeProps,
  LOCATED_IN: endpoints + 'MERGE (a)-[r:LOCATED_IN]->(b)' + edgeProps,
  CARRIES: endpoints + 'MERGE (a)-[r:CARRIES]->(b)' + edgeProps,
  EQUIPPED:
    endpoints + 'MERGE (a)-[r:EQUIPPED {slot: $props.slot}]->(b)' + edgeProps,
  CONTAINS: endpoints + 'MERGE (a)-[r:CONTAINS]->(b)' + edgeProps,
  MEMBER_OF: endpoints + 'MERGE (a)-[r:MEMBER_OF]->(b)' + edgeProps,
  ATTITUDE: endpoints + 'MERGE (a)-[r:ATTITUDE]->(b)' + edgeProps,
  WANTS: endpoints + 'MERGE (a)-[r:WANTS]->(b)' + edgeProps,
  PURSUES: endpoints + 'MERGE (a)-[r:PURSUES]->(b)' + edgeProps,
  HAS_SECRET: endpoints + 'MERGE (a)-[r:HAS_SECRET]->(b)' + edgeProps,
  ABOUT: endpoints + 'MERGE (a)-[r:ABOUT]->(b)' + edgeProps,
  ORIGIN_OF: endpoints + 'MERGE (a)-[r:ORIGIN_OF]->(b)' + edgeProps,
  KNOWS: endpoints + 'MERGE (a)-[r:KNOWS]->(b)' + knowsProps,
  SUPERSEDES: endpoints + 'MERGE (a)-[r:SUPERSEDES]->(b)' + edgeProps,
  WITNESSED: endpoints + 'MERGE (a)-[r:WITNESSED]->(b)' + edgeProps,
  INVOLVES:
    endpoints + 'MERGE (a)-[r:INVOLVES {role: $props.role}]->(b)' + edgeProps,
};
const filteredEdges = `MATCH (a:Entity)-[r]->(b:Entity)
WHERE ($types IS NULL OR type(r) IN $types)
  AND ($from IS NULL OR a.id = $from)
  AND ($to IS NULL OR b.id = $to)
  AND ($touching IS NULL OR a.id = $touching OR b.id = $touching)
  AND ($slot IS NULL OR (type(r) = 'EQUIPPED' AND r.slot = $slot))
`;
export const cypher = {
  getNode: 'MATCH (n:Entity {id: $id}) RETURN properties(n) AS props',
  nodes: 'MATCH (n:Entity) RETURN properties(n) AS props',
  edges:
    filteredEdges +
    'RETURN {type: type(r), from: a.id, to: b.id, props: properties(r)} AS edge',
  removeEdges: filteredEdges + 'DELETE r',
  setNodeProps:
    'MATCH (n:Entity {id: $id}) SET n += $props RETURN count(n) AS matched',
  removeNode: 'MATCH (n:Entity {id: $id}) DETACH DELETE n',
  clear: 'MATCH (n) DETACH DELETE n',
  retract: `MATCH (:Entity {id: $fact})-[:SUPERSEDES]->(older:Entity)
MATCH (:Entity {id: $learner})-[r:KNOWS]->(older)
SET r.retractedAtBeat = CASE WHEN r.retractedAtBeat IS NULL OR $beat < r.retractedAtBeat
  THEN $beat ELSE r.retractedAtBeat END`,
};
