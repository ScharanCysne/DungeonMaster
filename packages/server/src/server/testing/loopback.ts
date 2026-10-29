import { createServer } from 'node:net';
import { beforeAll, beforeEach } from 'vitest';

export function requireLoopback() {
  let denied = false;
  beforeAll(async () => {
    const probe = createServer();
    try {
      await new Promise<void>((resolve, reject) => {
        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', resolve);
      });
      await new Promise<void>((resolve, reject) =>
        probe.close((error) => (error ? reject(error) : resolve())),
      );
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EPERM') {
        denied = true;
        return;
      }
      throw error;
    }
  });
  beforeEach((context) => {
    if (denied) context.skip('Sandbox denies loopback sockets (listen EPERM).');
  });
}
