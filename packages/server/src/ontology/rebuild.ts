import type { OntologyStore } from './OntologyStore.js';
import { logPath, readExistingEventLog } from './eventLog.js';
import type { LogReadResult } from './eventLog.js';
import { project } from './projector.js';

export async function readRebuildLog(
  dataDir: string,
  sessionId: string,
): Promise<LogReadResult> {
  try {
    return await readExistingEventLog(dataDir, sessionId);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      throw new Error(
        `Cannot rebuild session ${sessionId}: event log not found at ${logPath(dataDir, sessionId)}.`,
        { cause: error },
      );
    throw error;
  }
}

export async function rebuild(log: LogReadResult, store: OntologyStore) {
  await store.clear();
  for (const record of log.records) await store.apply(project(record));
  return store.read(async (reader) => ({
    records: log.records.length,
    nodes: (await reader.nodes()).length,
    edges: (await reader.edges()).length,
  }));
}
