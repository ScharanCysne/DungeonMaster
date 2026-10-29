import type { Character, EntityId, Node } from '@dungeon/shared';
import type { ReactNode } from 'react';
import type { ClientState, WorldState } from '../store/types';
import { isCharacter, playerId } from '../store/world';

export function LocationHeader({
  name,
  beat,
  connection,
}: {
  name: string;
  beat: number;
  connection: ClientState['connection'];
}) {
  return (
    <header className="location-header">
      <h2>{name}</h2>
      <div className="location-meta">
        <span>beat {beat}</span>
        <span
          className={`connection-dot ${connection.status}`}
          role="img"
          aria-label={`Connection ${connection.status}${connection.retries ? `, retry ${connection.retries}` : ''}`}
          title={`Connection ${connection.status}`}
        />
      </div>
    </header>
  );
}
export function MapFrame({
  mapId,
  children,
}: {
  mapId: string | null;
  children: ReactNode;
}) {
  return (
    <figure className="map-frame" aria-label="Tavern map">
      {children}
      <figcaption>
        ✠ {mapId ? 'ground floor · kitchen east' : 'awaiting the world'}
      </figcaption>
    </figure>
  );
}
export function PartyCard({
  character,
  selected,
  onToggle,
}: {
  character: Character;
  selected: boolean;
  onToggle: (id: EntityId) => void;
}) {
  return (
    <button
      type="button"
      className={`party-card ${character.conscious ? '' : 'down'}`}
      aria-pressed={selected}
      onClick={() => onToggle(character.id)}
    >
      <span className={`portrait role-${character.role}`} aria-hidden="true">
        {character.name.slice(0, 1)}
      </span>
      <span className="party-detail">
        <span className="card-heading">
          <strong>{character.name}</strong>
          <span>AC {character.ac}</span>
        </span>
        <span className="health-row">
          <progress
            aria-label={`${character.name} HP`}
            value={character.hp}
            max={character.maxHp}
          />
          <span>
            {character.hp}/{character.maxHp} HP
            {!character.conscious && ' · down'}
          </span>
        </span>
      </span>
    </button>
  );
}
export function CompanionsPanel({
  world,
  selection,
  onToggle,
}: {
  world: WorldState;
  selection: EntityId[];
  onToggle: (id: EntityId) => void;
}) {
  const party = world.party.map((id) => world.entities[id]).filter(isCharacter);
  return (
    <section aria-labelledby="companions-title">
      <h3 id="companions-title" className="section-label">
        Companions
      </h3>
      <div className="party-list">
        {party.map((character) => (
          <PartyCard
            key={character.id}
            character={character}
            selected={selection.includes(character.id)}
            onToggle={onToggle}
          />
        ))}
      </div>
      {!party.length && (
        <p className="empty-panel">Your companions will gather here.</p>
      )}
    </section>
  );
}
export function ItemRow({
  item,
  selected,
  onToggle,
}: {
  item: Node;
  selected: boolean;
  onToggle: (id: EntityId) => void;
}) {
  return (
    <button
      type="button"
      className="item-row"
      aria-pressed={selected}
      onClick={() => onToggle(item.id)}
    >
      <span className="item-symbol" aria-hidden="true">
        ◇
      </span>
      <span>
        {item.name}
        {'rarity' in item && <small>{item.rarity.replaceAll('_', ' ')}</small>}
      </span>
    </button>
  );
}
export function SatchelPanel({
  world,
  selection,
  onToggle,
}: {
  world: WorldState;
  selection: EntityId[];
  onToggle: (id: EntityId) => void;
}) {
  return (
    <section aria-labelledby="satchel-title">
      <h3 id="satchel-title" className="section-label">
        Satchel
      </h3>
      {world.inventory.flatMap((id) => {
        const item = world.entities[id];
        return item
          ? [
              <ItemRow
                key={id}
                item={item}
                selected={selection.includes(id)}
                onToggle={onToggle}
              />,
            ]
          : [];
      })}
      {!world.inventory.length && (
        <p className="empty-panel">Your satchel is empty.</p>
      )}
      <p className="gold">◎ {world.gold} gold</p>
    </section>
  );
}
export function LeftPage({
  map,
  world,
  beat,
  connection,
  selection,
  onToggle,
}: {
  map: ReactNode;
  world: WorldState;
  beat: number;
  connection: ClientState['connection'];
  selection: EntityId[];
  onToggle: (id: EntityId) => void;
}) {
  const player = playerId(world);
  const position = player ? world.positions[player] : undefined;
  const location = position ? world.entities[position.locationId] : undefined;
  const building = Object.values(world.entities).find(
    (node) => 'tileBounds' in node && node.kind === 'building',
  );
  return (
    <section className="page left-page" aria-label="The world">
      <LocationHeader
        name={building?.name ?? location?.name ?? 'The Crooked Lantern'}
        beat={beat}
        connection={connection}
      />
      <MapFrame mapId={world.mapId}>{map}</MapFrame>
      <div className="possessions">
        <CompanionsPanel
          world={world}
          selection={selection}
          onToggle={onToggle}
        />
        <SatchelPanel world={world} selection={selection} onToggle={onToggle} />
      </div>
    </section>
  );
}
