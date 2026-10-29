import { useEffect, useRef } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { ClientStore } from '../store';
import { createMapGame } from './game';

export function MapView({ store }: { store: StoreApi<ClientStore> }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const game = createMapGame(host.current, store);
    return () => game.destroy();
  }, [store]);
  return (
    <div
      className="map-host"
      ref={host}
      role="img"
      aria-label="Tavern floor and visible entities"
    />
  );
}
