import { characterIdSchema, entityIdSchema } from '@dungeon/shared';
import type { CharacterId, DebugRequest, DebugResponse } from '@dungeon/shared';
import type { Session } from '../beat/Session.js';
import type { OntologyStore } from '../ontology/OntologyStore.js';
import { knowledgeSlice, selectionContext } from '../ontology/queries/index.js';
import { RequestError } from './wire.js';

export async function debugResponse(
  request: DebugRequest,
  session: Pick<Session, 'beat' | 'trace'>,
  store: OntologyStore,
  player: CharacterId,
): Promise<DebugResponse> {
  if (request.kind === 'trace') {
    const match = /^(?:beat-)?(\d+)(?:[-:](\d+))?$/.exec(
      request.target ?? String(session.beat),
    );
    if (!match)
      throw new RequestError(
        'BAD_TARGET',
        'Trace target must be a beat or beat-attempt.',
      );
    try {
      return {
        type: 'debug_response',
        kind: 'trace',
        data: await session.trace(
          Number(match[1]),
          match[2] === undefined ? undefined : Number(match[2]),
        ),
      };
    } catch {
      throw new RequestError(
        'TRACE_NOT_FOUND',
        'No readable trace for that beat and attempt.',
      );
    }
  }
  if (request.kind === 'knowledge') {
    const id = characterIdSchema.safeParse(request.target ?? player);
    if (!id.success || !(await store.getNode(id.data)))
      throw new RequestError(
        'BAD_TARGET',
        'Expected an existing character id.',
      );
    return {
      type: 'debug_response',
      kind: 'knowledge',
      data: await knowledgeSlice(store, id.data),
    };
  }
  const ids = entityIdSchema
    .array()
    .safeParse((request.target ?? player).split(',').map((id) => id.trim()));
  if (!ids.success)
    throw new RequestError(
      'BAD_TARGET',
      'Expected comma-separated entity ids.',
    );
  const selected = await selectionContext(store, ids.data);
  if (selected.length !== new Set(ids.data).size)
    throw new RequestError('BAD_TARGET', 'Graph target does not exist.');
  return {
    type: 'debug_response',
    kind: 'graph',
    data: {
      nodes: [
        ...new Map(
          selected
            .flatMap(({ node, neighbourhood }) => [
              node,
              ...neighbourhood.nodes,
            ])
            .map((node) => [node.id, node]),
        ).values(),
      ],
      edges: [
        ...new Map(
          selected
            .flatMap(({ neighbourhood }) => neighbourhood.edges)
            .map((edge) => [JSON.stringify(edge), edge]),
        ).values(),
      ],
    },
  };
}
