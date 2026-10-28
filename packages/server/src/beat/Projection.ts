import type { GameEvent } from '@dungeon/shared';
import type { OntologyStore } from '../ontology/OntologyStore.js';
import { project } from '../ontology/projector.js';
import { rebuild } from '../ontology/rebuild.js';

export class Projection {
  #tail: Promise<void> = Promise.resolve();
  constructor(private readonly store: OntologyStore) {}
  private enqueue(work: () => Promise<void>): Promise<void> {
    const operation = this.#tail.catch(() => {}).then(work);
    this.#tail = operation;
    return operation;
  }
  apply(records: GameEvent[]): Promise<void> {
    return this.enqueue(() => this.store.apply(records.flatMap(project)));
  }
  catchUp(records: GameEvent[]): Promise<void> {
    // A timed-out transaction may still settle; rebuild only after that write has finished.
    return this.enqueue(async () => {
      await rebuild({ records, droppedRecords: 0 }, this.store);
    });
  }
}
