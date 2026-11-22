import { describe, expect, it } from 'vitest';
import { entry, fixture, rejects, value } from './testing/fixtures.js';

describe('open_container', () => {
  it('opens a visible unlocked container and reveals all contents', () => {
    const engine = fixture();
    const output = value(
      engine.open_container({
        actor: 'char:player',
        container: 'container:box',
      }),
    );
    expect({
      output,
      opened: engine.state.containers.get('container:box')?.opened,
      hidden: engine.state.items.get('item:quest')?.hidden,
    }).toEqual({
      output: { containerId: 'container:box', revealed: ['item:quest'] },
      opened: true,
      hidden: false,
    });
  });
  it('emits ContainerOpened with a plain-language fact', () => {
    expect(
      fixture().open_container({
        actor: 'char:player',
        container: 'container:box',
      }),
    ).toMatchObject({
      ok: true,
      events: [
        { type: 'ContainerOpened', payload: { revealed: ['item:quest'] } },
      ],
      facts: [expect.stringContaining('Player opened')],
    });
  });
  it('reports no newly revealed items when opening an already opened container', () => {
    const engine = fixture();
    value(
      engine.open_container({
        actor: 'char:player',
        container: 'container:box',
      }),
    );
    expect(
      value(
        engine.open_container({
          actor: 'char:player',
          container: 'container:box',
        }),
      ).revealed,
    ).toEqual([]);
  });
  it.each([
    ['container:missing', 'NO_SUCH_ENTITY'],
    ['container:lockbox', 'CONTAINER_LOCKED'],
    ['container:secret', 'CONTAINER_HIDDEN'],
  ] as const)('rejects %s without changes', (container, code) => {
    const engine = fixture();
    rejects(
      engine,
      () => engine.open_container({ actor: 'char:player', container }),
      code,
      container,
    );
  });
  it('rejects opening a container in another room without changes', () => {
    const engine = fixture((seed) => {
      entry(seed.containers, 'container:box').location = 'loc:other';
    });
    rejects(
      engine,
      () =>
        engine.open_container({
          actor: 'char:player',
          container: 'container:box',
        }),
      'NOT_IN_SAME_ROOM',
      'loc:other',
    );
  });
});
