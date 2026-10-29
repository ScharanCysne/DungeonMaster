import type { ServerSocket } from './socket.js';
import type { Clock } from '../beat/Clock.js';

export function heartbeat(
  socket: ServerSocket,
  clock: Clock,
  missed: () => void,
) {
  let alive = true;
  let cancel = clock.schedule(15_000, tick);
  function tick() {
    if (!alive) {
      missed();
      socket.terminate();
      return;
    }
    if (socket.readyState !== socket.OPEN) return;
    alive = false;
    socket.ping();
    cancel = clock.schedule(15_000, tick);
  }
  socket.on('pong', () => {
    alive = true;
  });
  socket.once('close', () => cancel());
  return () => cancel();
}
