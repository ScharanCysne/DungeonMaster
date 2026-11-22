import type { ServerMessage } from '@dungeon/shared';
import { createStore } from 'zustand/vanilla';
import { applyClientAction } from './actions';
import type { ClientAction } from './actions';
import { applyServerMessage } from './reducer';
import { createInitialState } from './types';
import type { ClientState } from './types';

export interface ClientStore extends ClientState {
  dispatch: (action: ClientAction) => void;
  receive: (message: ServerMessage, receivedAt: number) => void;
}
export function createClientStore(initial = createInitialState()) {
  return createStore<ClientStore>((set) => ({
    ...initial,
    dispatch: (action) => set((state) => applyClientAction(state, action)),
    receive: (message, at) =>
      set((state) =>
        applyServerMessage(
          applyClientAction(state, { type: 'received_at', at }),
          message,
        ),
      ),
  }));
}
export const clientStore = createClientStore();
