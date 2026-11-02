import { activateOnEnter } from './keyboard';
import type { Character, EntityId, Node } from '@dungeon/shared';
import type { WorldState } from '../store/types';
import { isCharacter } from '../store/world';
import { Sprite } from './Sprite';
import { characterDetails } from './possessionsModel';

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
      onKeyDown={activateOnEnter}
      className={`party-card ${character.conscious ? '' : 'down'}`}
      aria-pressed={selected}
      onClick={() => onToggle(character.id)}
    >
      <span className={`portrait role-${character.role}`} aria-hidden="true">
        <Sprite entity={character} />
      </span>
      <span className={`party-detail role-${character.role}`}>
        <span className="card-heading">
          <strong className="speaker">{character.name}</strong>
          <span>AC {character.ac}</span>
        </span>
        {characterDetails(character) && (
          <span className="character-details">
            {characterDetails(character)}
          </span>
        )}
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
  equipped,
  isNew,
  selected,
  onToggle,
}: {
  item: Node;
  equipped: boolean;
  isNew: boolean;
  selected: boolean;
  onToggle: (id: EntityId) => void;
}) {
  return (
    <button
      type="button"
      onKeyDown={activateOnEnter}
      className={`item-row ${'rarity' in item ? `rarity-${item.rarity}` : ''}`}
      aria-pressed={selected}
      onClick={() => onToggle(item.id)}
    >
      <Sprite entity={item} size={24} />
      <span>
        <span className="item-name">{item.name}</span>{' '}
        {'rarity' in item && <small>{item.rarity.replaceAll('_', ' ')}</small>}
        {equipped && (
          <>
            {' '}
            <span className="item-badge">equipped</span>
          </>
        )}
        {isNew && (
          <>
            {' '}
            <span className="item-badge new">new</span>
          </>
        )}
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
                equipped={world.equipped.includes(id)}
                isNew={world.acquiredAt[id] === world.beat}
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
