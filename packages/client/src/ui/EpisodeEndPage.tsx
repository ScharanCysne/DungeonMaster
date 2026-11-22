import type { BeatResult, EntityId, Node } from '@dungeon/shared';

export function acquisition(
  holder: EntityId,
  beat: number,
  results: BeatResult[],
  entities: Record<string, Node>,
) {
  const transfer = results
    .find((result) => result.beat === beat)
    ?.events.findLast((event) => {
      if (event.type !== 'ItemTransferred' || event.payload.to.id !== holder)
        return false;
      const item = entities[event.payload.itemId];
      return (
        event.payload.itemId === 'item:quill' ||
        !!(item && 'questCritical' in item && item.questCritical)
      );
    });
  if (transfer?.type !== 'ItemTransferred') return 'Out of sight.';
  const verbs = {
    pick_up: 'Picked it up',
    give: 'Received it',
    buy: 'Bought it',
    steal: 'Stole it',
    loot: 'Looted it',
    drop: 'Received it',
  };
  return `${verbs[transfer.payload.reason]} from ${entities[transfer.payload.from.id]?.name ?? transfer.payload.from.id}.`;
}

export function EpisodeEndPage({
  holder,
  beat,
  recap,
  results,
  entities,
  devTools,
  onReplay,
  onNewRun,
}: {
  holder: EntityId;
  beat: number;
  recap: string;
  results: BeatResult[];
  entities: Record<string, Node>;
  devTools: boolean;
  onReplay: () => void;
  onNewRun: () => void;
}) {
  const character = entities[holder];
  const name = character?.name ?? holder;
  const peer = character && 'role' in character && character.role === 'peer';
  return (
    <section className="episode-end-page" aria-label="End of chapter">
      <span className="chapter-ornament" aria-hidden="true">
        ❧
      </span>
      <h2>End of chapter</h2>
      <p className="chapter-holder">{name} holds the quill.</p>
      <p>{acquisition(holder, beat, results, entities)}</p>
      <p>
        {beat} {beat === 1 ? 'beat' : 'beats'} played
      </p>
      <p className="chapter-recap">{recap}</p>
      {peer && (
        <aside className="chapter-hook" aria-label="Next episode hook">
          <h3>The next chapter…</h3>
          <p>
            {name} has taken the quill for their own agenda. Where will your
            companion's ambitions lead?
          </p>
        </aside>
      )}
      {devTools && (
        <div className="chapter-actions">
          <button onClick={onReplay}>Replay this session</button>
          <button onClick={onNewRun}>Start a new run</button>
        </div>
      )}
    </section>
  );
}
