import type { CharacterId, DebugKind, EntityId } from '@dungeon/shared';
import type { ClientState } from '../store/types';
import { graphFocus } from './graphModel';
import { knownAgents } from './knowledgeModel';
import { GraphView } from './GraphView';
import { KnowledgeView } from './KnowledgeView';
import { TraceView } from './TraceView';

export function DeveloperView({
  kind,
  state,
  chosen,
  onAgent,
  onToggle,
}: {
  kind: DebugKind;
  state: ClientState;
  chosen: CharacterId | null;
  onAgent: (id: CharacterId) => void;
  onToggle: (id: EntityId) => void;
}) {
  const { dev } = state;
  if (dev.error?.code === 'DEBUG_DISABLED')
    return (
      <p role="status">
        Developer views are disabled on this server (DUNGEON_DEV)
      </p>
    );
  return (
    <>
      {dev.error && <p role="status">{dev.error.message}</p>}
      {kind === 'graph' && (
        <GraphView
          graph={dev.graph}
          world={state.world}
          dmView={dev.dmView}
          changes={dev.changes}
          changedEntities={state.mapFeedback.changed}
          focus={graphFocus(state)}
          onToggle={onToggle}
        />
      )}
      {kind === 'trace' && (
        <TraceView traces={dev.traces} focus={dev.traceFocus} />
      )}
      {kind === 'knowledge' && (
        <KnowledgeView
          agents={knownAgents(state.world, dev.dmView ? dev.groundTruth : null)}
          chosen={chosen}
          knowledge={chosen ? (dev.knowledge[chosen] ?? null) : null}
          groundTruth={dev.dmView ? dev.groundTruth : null}
          traces={dev.traces}
          onAgent={onAgent}
        />
      )}
    </>
  );
}
