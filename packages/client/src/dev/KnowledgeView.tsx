import type {
  BeatTrace,
  Character,
  CharacterId,
  FactId,
  Graph,
  KnowledgeSlice,
} from '@dungeon/shared';
import { knowledgeModel } from './knowledgeModel';

export function KnowledgeView({
  agents,
  chosen,
  knowledge,
  groundTruth,
  traces,
  onAgent,
}: {
  agents: Character[];
  chosen: CharacterId | null;
  knowledge: KnowledgeSlice | null;
  groundTruth: Graph | null;
  traces: Record<string, BeatTrace>;
  onAgent: (id: CharacterId) => void;
}) {
  const model = knowledge
    ? knowledgeModel(knowledge, groundTruth, traces)
    : null;
  const truth = (id: FactId) =>
    groundTruth && model?.truth.has(id) ? (
      <small className="truth-flag">truth: {String(model.truth.get(id))}</small>
    ) : null;
  return (
    <section className="knowledge-view" aria-label="Knowledge slice">
      <label>
        Agent{' '}
        <select
          value={chosen ?? ''}
          onChange={(event) => {
            const agent = agents.find(
              (agent) => agent.id === event.target.value,
            );
            if (agent) onAgent(agent.id);
          }}
        >
          <option value="" disabled>
            Choose an agent
          </option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name} · {agent.id}
            </option>
          ))}
        </select>
      </label>
      {!knowledge ? (
        <p>Waiting for knowledge data…</p>
      ) : (
        <>
          <h3>Goal</h3>
          {knowledge.quests.length ? (
            knowledge.quests.map((quest) => (
              <p key={quest.id}>
                {quest.objective} ({quest.status})
              </p>
            ))
          ) : (
            <p>No goal recorded.</p>
          )}
          <h3>Facts known</h3>
          {knowledge.facts.map(({ fact, knowledge: edge }) => (
            <div key={fact.id}>
              <p>
                {fact.statement} {truth(fact.id)}
              </p>
              <small>
                source: {edge.properties.source} · confidence:{' '}
                {edge.properties.confidence} · learned beat{' '}
                {edge.properties.since}
              </small>
            </div>
          ))}
          <h3>Secrets</h3>
          {knowledge.secrets.map((fact) => (
            <p key={fact.id}>
              {fact.statement} {truth(fact.id)}
            </p>
          ))}
          <h3>Attitudes</h3>
          {knowledge.attitudes.map((edge) => (
            <p key={edge.to}>
              {edge.to}: {edge.properties.value} · {edge.properties.reason}
            </p>
          ))}
          <h3>Latest leak check</h3>
          {model?.latest ? (
            <>
              <p>
                Beat {model.latest.beat} ·{' '}
                {model.check?.ok ? 'accepted' : 'rejected or incomplete'}{' '}
                (beat-wide check)
              </p>
              {model.issues.length ? (
                model.issues.map((issue, index) => (
                  <p key={index}>
                    {issue.type}: {issue.explanation}
                  </p>
                ))
              ) : (
                <p>
                  {model.check
                    ? 'No leaks reported.'
                    : 'Check result unavailable.'}
                </p>
              )}
            </>
          ) : (
            <p>No check recorded.</p>
          )}
          {groundTruth && (
            <>
              <h3>Facts NOT known</h3>
              {model?.unknown.map((fact) => (
                <p key={fact.id}>
                  {fact.statement} {truth(fact.id)}
                </p>
              ))}
            </>
          )}
        </>
      )}
    </section>
  );
}
