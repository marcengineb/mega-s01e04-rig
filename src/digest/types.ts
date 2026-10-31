export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  /** Historical: retained even when the current status has recovered to ok. */
  lastError: string | null;
  /** Original timestamp strings, including their source offsets. */
  firstAt: string;
  lastAt: string;
};

export type EventCounts = Record<RunStatus, number>;

export type NightDigest = {
  night: string;
  /** Sorted by job, using code-point order, for both HTML and JSON. */
  rows: DigestRow[];
  badLines: number;
  eventCounts: EventCounts;
};

/**
 * readNight(runsDir, night): NightDigest | null
 * null means the night file is missing (or its name is invalid).
 * An empty file returns an empty digest. Malformed records increment badLines.
 * First/last use chronological order, with later file position breaking ties.
 * Owner/current status use the last event; lastError uses the last error event.
 */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
