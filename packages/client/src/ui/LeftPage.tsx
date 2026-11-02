import type { EntityId } from '@dungeon/shared';
import type { ReactNode } from 'react';
import type { ClientState, WorldState } from '../store/types';
import { playerId } from '../store/world';
import { CompanionsPanel, SatchelPanel } from './Possessions';

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
