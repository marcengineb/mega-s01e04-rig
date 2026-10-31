import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, ReadNight, RunStatus } from './types.js';

type RunEvent = {
  at: string;
  time: number;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function parseEvent(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (
    typeof event.at !== 'string' || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(event.at) ||
    typeof event.job !== 'string' ||
    (event.status !== 'ok' && event.status !== 'retry' && event.status !== 'fail') ||
    (event.owner !== null && typeof event.owner !== 'string') ||
    ('error' in event && typeof event.error !== 'string')
  ) return null;
  const time = Date.parse(event.at);
  if (!Number.isFinite(time)) return null;
  return {
    at: event.at, time, job: event.job, status: event.status, owner: event.owner,
    ...(typeof event.error === 'string' ? { error: event.error } : {}),
  };
}

function validNight(night: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return false;
  const time = Date.parse(`${night}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === night;
}

// Compare Unicode code points without depending on the machine's locale.
function compareJobs(a: DigestRow, b: DigestRow): number {
  const left = Array.from(a.job, (character) => character.codePointAt(0)!);
  const right = Array.from(b.job, (character) => character.codePointAt(0)!);
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!validNight(night)) return null;
  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' ||
        (error as NodeJS.ErrnoException).code === 'ENOTDIR') return null;
    throw error;
  }

  const digest: NightDigest = {
    night, rows: [], badLines: 0, eventCounts: { ok: 0, retry: 0, fail: 0 },
  };
  const jobs = new Map<string, {
    row: DigestRow; firstTime: number; lastTime: number; errorTime: number;
  }>();
  const lines = contents === '' ? [] : contents.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();

  for (const line of lines) {
    const event = parseEvent(line);
    if (!event) {
      digest.badLines++;
      continue;
    }
    digest.eventCounts[event.status]++;
    let job = jobs.get(event.job);
    if (!job) {
      job = {
        row: {
          job: event.job, owner: event.owner, runs: 0, retries: 0,
          lastStatus: event.status, lastError: null, firstAt: event.at, lastAt: event.at,
        },
        firstTime: event.time, lastTime: event.time, errorTime: -Infinity,
      };
      jobs.set(event.job, job);
    }
    job.row.runs++;
    if (event.status === 'retry') job.row.retries++;
    // Traversal is in file order, so equality gives the later line precedence.
    if (event.time <= job.firstTime) {
      job.firstTime = event.time;
      job.row.firstAt = event.at;
    }
    if (event.time >= job.lastTime) {
      job.lastTime = event.time;
      job.row.lastAt = event.at;
      job.row.lastStatus = event.status;
      job.row.owner = event.owner;
    }
    if (event.error !== undefined && event.time >= job.errorTime) {
      job.errorTime = event.time;
      job.row.lastError = event.error;
    }
  }
  digest.rows = Array.from(jobs.values(), ({ row }) => row).sort(compareJobs);
  return digest;
};
