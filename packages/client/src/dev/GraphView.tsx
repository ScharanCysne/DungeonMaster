import { useEffect, useMemo, useRef, useState } from 'react';
import type { EntityId, Graph } from '@dungeon/shared';
import type { ClientState, WorldState } from '../store/types';
import { graphModel, neo4jLink, TYPE_COLORS } from './graphModel';
import { mountGraph } from './cytoscapeAdapter';

export function GraphView({
  graph,
  world,
  dmView,
  changes,
  changedEntities,
  focus,
  onToggle,
}: {
  graph: Graph | null;
  world: WorldState;
  dmView: boolean;
  changes: ClientState['dev']['changes'];
  changedEntities: EntityId[];
  focus: EntityId[];
  onToggle: (id: EntityId) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState<EntityId | null>(null);
  const model = useMemo(
    () =>
      graphModel(
        graph ?? { nodes: [], edges: [] },
        world,
        dmView,
        changes,
        changedEntities,
      ),
    [graph, world, dmView, changes, changedEntities],
  );
  const pick = (id: EntityId) => {
    setDetail(id);
    if (model.nodes.find((node) => node.id === id)?.selectable) onToggle(id);
  };
  const pickRef = useRef(pick);
  useEffect(() => {
    pickRef.current = pick;
  });
  useEffect(() => {
    if (!host.current || !graph) return;
    const view = mountGraph(host.current, model, (id) => pickRef.current(id));
    return () => view.destroy();
  }, [model, graph]);
  const node = model.nodes.find((item) => item.id === detail)?.node;
  return (
    <section className="graph-view" aria-label="Ontology graph">
      <div ref={host} className="graph-canvas" aria-label="Graph diagram" />
      {!graph && <p>Waiting for graph data…</p>}
      <div className="graph-legend" aria-label="Graph legend">
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <span key={type}>
            <i style={{ backgroundColor: color }} />
            {type === 'loc' ? 'location' : type}
          </span>
        ))}
        <span className="changed-key">┄ changed this beat</span>
        {dmView && <span>┄ DM-only relationship</span>}
      </div>
      <details>
        <summary>Browse nodes with keyboard</summary>
        <div className="graph-nodes">
          {model.nodes.map((item) => (
            <button key={item.id} onClick={() => pick(item.id)}>
              {item.id}
            </button>
          ))}
        </div>
      </details>
      {node && (
        <section className="node-popover" aria-label={`Node ${node.id}`}>
          <header>
            <h3>{node.name}</h3>
            <button onClick={() => setDetail(null)}>Close node details</button>
          </header>
          <dl>
            <dt>createdBy</dt>
            <dd>{node.createdBy}</dd>
            <dt>createdAtBeat</dt>
            <dd>{node.createdAtBeat}</dd>
          </dl>
          <pre>{JSON.stringify(node, null, 2)}</pre>
        </section>
      )}
      <a href={neo4jLink(focus)} target="_blank" rel="noreferrer">
        Open in Neo4j Browser
      </a>
    </section>
  );
}
