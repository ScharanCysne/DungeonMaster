import { MemoryStore } from './MemoryStore.js';
import { runStoreContract } from './testing/storeContract.js';

runStoreContract('MemoryStore', () => new MemoryStore());
