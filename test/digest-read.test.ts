import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const night = '2026-10-28';
const base = { at: '2026-10-28T23:00:00+01:00', job: 'a', status: 'ok', owner: 'rook' };
let runsDir: string;

beforeEach(() => { runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-')); });
afterEach(() => { rmSync(runsDir, { recursive: true, force: true }); });

function writeEvents(events: unknown[]) {
  writeFileSync(join(runsDir, `${night}.jsonl`), events.map((event) => JSON.stringify(event)).join('\n'));
}

describe('readNight', () => {
  it('reads the sample without modifying runs, including recovery and absent owners', () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), readFileSync(new URL('../runs/2026-10-28.jsonl', import.meta.url)));
    const digest = readNight(runsDir, night)!;
    expect(digest.badLines).toBe(1);
    expect(digest.eventCounts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(digest.rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest.rows[0].owner).toBeNull();
    expect(digest.rows[1]).toEqual({
      job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok',
      lastError: 'upstream 503', firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(digest.rows[3].lastStatus).toBe('fail');
    expect(digest.rows.reduce((total, row) => total + row.runs, 0)).toBe(15);
  });

  it('uses actual time across offsets and keeps the latest historical error after recovery', () => {
    writeEvents([
      { ...base, at: '2026-10-29T02:00:00+01:00', owner: null },
      { ...base, at: '2026-10-29T03:00:00+03:00', status: 'fail', error: 'latest failure' },
      { ...base, at: '2026-10-28T23:30:00Z', status: 'retry', error: 'older retry' },
    ]);
    expect(readNight(runsDir, night)?.rows).toEqual([{
      job: 'a', owner: null, runs: 3, retries: 1, lastStatus: 'ok', lastError: 'latest failure',
      firstAt: '2026-10-28T23:30:00Z', lastAt: '2026-10-29T02:00:00+01:00',
    }]);
  });

  it('breaks equal-time ties with the later file position, including errors and source offsets', () => {
    writeEvents([
      { ...base, status: 'fail', error: 'first' },
      { ...base, at: '2026-10-28T22:00:00Z', status: 'retry', error: '' },
      { ...base, at: '2026-10-28T18:00:00-04:00', owner: null },
    ]);
    expect(readNight(runsDir, night)?.rows).toEqual([{
      job: 'a', owner: null, runs: 3, retries: 1, lastStatus: 'ok', lastError: '',
      firstAt: '2026-10-28T18:00:00-04:00', lastAt: '2026-10-28T18:00:00-04:00',
    }]);
  });

  it('sorts jobs by Unicode code point rather than locale or UTF-16 order', () => {
    writeEvents(['😀', '\uE000', 'a', 'A', 'aa'].map((job) => ({ ...base, job })));
    expect(readNight(runsDir, night)?.rows.map((row) => row.job)).toEqual(['A', 'a', 'aa', '\uE000', '😀']);
  });

  it('returns null for a missing file and an empty digest for an empty file', () => {
    expect(readNight(runsDir, night)).toBeNull();
    writeEvents([]);
    expect(readNight(runsDir, night)).toEqual({
      night, rows: [], badLines: 0, eventCounts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it.each(['../2026-10-28', '/2026-10-28', '2026-10-28.jsonl', '2026-1-28', '2026-02-30', '2026-13-01', '2025-02-29', '2026-10-28\n'])('rejects invalid night %j', (invalidNight) => {
    writeEvents([base]);
    expect(readNight(runsDir, invalidNight)).toBeNull();
  });

  it('accepts a leap-day night', () => {
    writeFileSync(join(runsDir, '2024-02-29.jsonl'), '');
    expect(readNight(runsDir, '2024-02-29')?.night).toBe('2024-02-29');
  });

  it('counts invalid JSON and invalid event shapes without losing valid events', () => {
    const invalid = [
      null, [], 'text', 12, {}, { ...base, at: 'bad+01:00' },
      { ...base, at: '2026-10-28T23:00:00' }, { ...base, job: 42 },
      { ...base, status: 'pending' }, { ...base, owner: 42 },
      { ...base, owner: undefined }, { ...base, error: null }, { ...base, error: 42 },
    ];
    writeEvents([base, ...invalid, { ...base, job: 'b' }]);
    writeFileSync(join(runsDir, `${night}.jsonl`), `${readFileSync(join(runsDir, `${night}.jsonl`), 'utf8')}\n{broken\n`);
    const digest = readNight(runsDir, night)!;
    expect(digest.badLines).toBe(invalid.length + 1);
    expect(digest.rows.map((row) => row.job)).toEqual(['a', 'b']);
    expect(digest.eventCounts).toEqual({ ok: 2, retry: 0, fail: 0 });
  });

  it.each(['\n', '\r\n'])('counts interior blank lines but not a terminal %j', (newline) => {
    writeFileSync(join(runsDir, `${night}.jsonl`), [JSON.stringify(base), '', JSON.stringify(base), ''].join(newline));
    expect(readNight(runsDir, night)?.badLines).toBe(1);
    expect(readNight(runsDir, night)?.rows[0].runs).toBe(2);
  });

  it('returns a digest when every line is malformed', () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), 'broken\nnull\n');
    expect(readNight(runsDir, night)).toEqual({
      night, rows: [], badLines: 2, eventCounts: { ok: 0, retry: 0, fail: 0 },
    });
  });
});
