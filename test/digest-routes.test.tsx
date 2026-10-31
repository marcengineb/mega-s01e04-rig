import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { NightDigest } from '../src/digest/types.js';

const baseConfig = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
};

const normalLog = [
  JSON.stringify({ at: '2026-10-28T23:30:00-04:00', job: 'zeta', status: 'retry', owner: null }),
  JSON.stringify({ at: '2026-10-28T23:40:00-04:00', job: 'alpha', status: 'fail', owner: 'Ada', error: 'temporary outage' }),
  JSON.stringify({ at: '2026-10-28T23:45:00-04:00', job: 'zeta', status: 'retry', owner: null }),
  JSON.stringify({ at: '2026-10-28T23:50:00-04:00', job: 'beta', status: 'fail', owner: 'Lin', error: 'first attempt failed' }),
  JSON.stringify({ at: '2026-10-28T23:55:00-04:00', job: 'alpha', status: 'ok', owner: 'Ada' }),
  JSON.stringify({ at: '2026-10-29T00:00:00-04:00', job: 'zeta', status: 'retry', owner: null }),
  JSON.stringify({ at: '2026-10-29T00:05:00-04:00', job: 'beta', status: 'retry', owner: 'Lin' }),
  JSON.stringify({ at: '2026-10-29T00:10:00-04:00', job: 'beta', status: 'retry', owner: 'Lin' }),
  JSON.stringify({ at: '2026-10-29T00:15:00-04:00', job: 'beta', status: 'retry', owner: 'Lin' }),
  JSON.stringify({ at: '2026-10-29T00:20:00-04:00', job: 'beta', status: 'fail', owner: 'Lin', error: 'current failure' }),
].join('\n');

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function appWithNight(night: string, contents?: string) {
  const runsDir = await mkdtemp(join(tmpdir(), 'rig-digest-routes-'));
  tempDirs.push(runsDir);
  if (contents !== undefined) await writeFile(join(runsDir, `${night}.jsonl`), contents, 'utf8');
  return createApp({ ...baseConfig, runsDir });
}

function htmlRows(html: string): string[] {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((match) => match[1] ?? '');
}

function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('digest routes', () => {
  it('serves matching sorted rows as HTML and JSON, with status, history, timestamps, and warnings', async () => {
    const app = await appWithNight('2026-10-28', normalLog);
    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-10-28'),
      app.request('/api/digest/2026-10-28'),
    ]);
    const html = await htmlResponse.text();
    const digest = (await jsonResponse.json()) as NightDigest;

    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(digest).toEqual({
      night: '2026-10-28',
      rows: [
        { job: 'alpha', owner: 'Ada', runs: 2, retries: 0, lastStatus: 'ok', lastError: 'temporary outage', firstAt: '2026-10-28T23:40:00-04:00', lastAt: '2026-10-28T23:55:00-04:00' },
        { job: 'beta', owner: 'Lin', runs: 5, retries: 3, lastStatus: 'fail', lastError: 'current failure', firstAt: '2026-10-28T23:50:00-04:00', lastAt: '2026-10-29T00:20:00-04:00' },
        { job: 'zeta', owner: null, runs: 3, retries: 3, lastStatus: 'retry', lastError: null, firstAt: '2026-10-28T23:30:00-04:00', lastAt: '2026-10-29T00:00:00-04:00' },
      ],
      badLines: 0,
      eventCounts: { ok: 1, retry: 6, fail: 3 },
    });

    const rows = htmlRows(html);
    const alpha = rows.find((row) => row.includes('alpha')) ?? '';
    const beta = rows.find((row) => row.includes('beta')) ?? '';
    const zeta = rows.find((row) => row.includes('zeta')) ?? '';
    expect(rows).toHaveLength(4); // header plus three job rows
    expect([html.indexOf('alpha'), html.indexOf('beta'), html.indexOf('zeta')]).toEqual(
      [...[html.indexOf('alpha'), html.indexOf('beta'), html.indexOf('zeta')]].sort((a, b) => a - b),
    );
    expect(plainText(alpha)).toContain('alpha Ada 2 0 ok temporary outage 2026-10-28T23:40:00-04:00 2026-10-28T23:55:00-04:00');
    expect(plainText(beta)).toContain('beta Lin 5 3 fail current failure 2026-10-28T23:50:00-04:00 2026-10-29T00:20:00-04:00');
    expect(plainText(zeta)).toContain('zeta — 3 3 retry');
    expect(beta).toMatch(/class="warn"|class='warn'/);
    expect(zeta).toMatch(/class="warn"|class='warn'/);
    expect(alpha).toContain('temporary outage');
    expect(alpha).toContain('ok');
    expect(html).toContain('lane-07');
    expect(html).toContain('<style>');
    expect(html).not.toMatch(/<script\b|<link\b[^>]*stylesheet/i);
  });

  it('returns 404 for a night that has no file on both routes', async () => {
    const app = await appWithNight('unused');
    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-10-28'),
      app.request('/api/digest/2026-10-28'),
    ]);
    expect(htmlResponse.status).toBe(404);
    expect(jsonResponse.status).toBe(404);
  });

  it('renders an empty night and returns empty rows as JSON', async () => {
    const app = await appWithNight('2026-10-28', '');
    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-10-28'),
      app.request('/api/digest/2026-10-28'),
    ]);
    const html = await htmlResponse.text();
    const digest = (await jsonResponse.json()) as NightDigest;
    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(digest).toEqual({ night: '2026-10-28', rows: [], badLines: 0, eventCounts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('counts malformed lines while rendering valid jobs on both routes', async () => {
    const log = [
      '{not json}',
      JSON.stringify({ at: '2026-10-28T21:00:00+02:00', job: 'valid-job', status: 'ok', owner: 'Mina' }),
    ].join('\n');
    const app = await appWithNight('2026-10-28', log);
    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-10-28'),
      app.request('/api/digest/2026-10-28'),
    ]);
    const html = await htmlResponse.text();
    const digest = (await jsonResponse.json()) as NightDigest;
    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(digest.badLines).toBe(1);
    expect(digest.rows).toEqual([
      { job: 'valid-job', owner: 'Mina', runs: 1, retries: 0, lastStatus: 'ok', lastError: null, firstAt: '2026-10-28T21:00:00+02:00', lastAt: '2026-10-28T21:00:00+02:00' },
    ]);
    expect(html).toContain('valid-job');
    expect(html).toContain('Mina');
    expect(html).toContain('1');
  });

  it('escapes untrusted job and error text in HTML while preserving it in JSON', async () => {
    const job = 'evil <script>alert("x")</script> & "quoted"';
    const error = '<img src=x onerror="alert(1)"> & retry';
    const log = JSON.stringify({ at: '2026-10-28T22:00:00-07:00', job, status: 'fail', owner: null, error });
    const app = await appWithNight('2026-10-28', log);
    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-10-28'),
      app.request('/api/digest/2026-10-28'),
    ]);
    const html = await htmlResponse.text();
    const digest = (await jsonResponse.json()) as NightDigest;
    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(digest.rows[0]).toMatchObject({ job, owner: null, lastError: error });
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
    expect(html).not.toMatch(/<script\b|<img\b/i);
  });
});
