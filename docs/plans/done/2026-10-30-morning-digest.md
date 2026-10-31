---
plan: morning-digest
status: done
owner: rook
opened: 2026-10-29
closed: 2026-10-30
---

# Morning digest

The night's run log is a JSONL file nobody reads. By breakfast someone has to know what ran,
what retried, what failed, and whose it was, without opening `runs/`. rig already serves the
status board; the digest is one more page on it.

Out of scope: notifications, history across nights, auth (rig only listens on localhost).

## 1. Run log reader

Read `runs/<night>.jsonl` into one row per job: job, owner, runs, retries, last status, last
error, first and last time. One JSON object per line (`at`, `job`, `status`: `ok | retry | fail`,
`owner`, optional `error`).

- A line that doesn't parse is counted, never thrown. The night still renders.
- `owner` can be `null`. Keep the row; show the owner as `—`.
- Lives in `src/digest/`. Commit `src/digest/types.ts` first (the `DigestRow` type and the
  `readNight(runsDir, night)` signature), so every part of section 2 can start against it.

Done when: reader tests pass on `runs/2026-10-28.jsonl` (5 jobs, 1 bad line).

## 2. Digest page

Four small parts. Each needs only `src/digest/types.ts` from section 1, so once that is in they
can go to four workers at once. Small, well-specified work: a cheaper model is fine here.

### 2a. Page

`GET /digest/:night` renders the rows with the usual layout: one table, sorted by job, retries of
3 or more and any `fail` marked. A night with no file returns 404; an empty file renders
"nothing ran".

Done when: `/digest/2026-10-28` renders locally.

### 2b. JSON

`GET /api/digest/:night` returns the same rows as JSON. Agents read this one; the page and the
JSON must never disagree (ADR 0001).

Done when: the JSON for 2026-10-28 has the same jobs, in the same order, as the page.

### 2c. Board link

The status board links each night on disk to its digest, with its ok / retry / fail counts beside
it.

Done when: both nights on disk link to a digest that renders.

### 2d. Route tests

Route tests for 2a and 2b: 200, 404 for a night with no file, the empty night, a night with a bad
line. Use a temp runs dir; `runs/` is read-only.

Done when: `pnpm test` is green with the new tests.

## 3. Preview for review

The reviewer reads the page from a copy, not from the lane. Run rig and save `/digest/2026-10-28` as
one HTML file, lane banner included (a command, not a browser's "save as"; the page is
self-contained, ADR 0001). Put it on your own public host, one where you can upload over it later (any bucket
or static host, ADR 0003), so it opens from a public HTTPS link. Send the reviewer the link and the
issues for this plan.

Done when: the preview link is sent to the reviewer.

Execution note: the reviewer additionally required #6 to remain open until they confirmed
seeing the page. A premature close was rejected, corrected by reopening, and closed only
after the actual review arrived.

## 4. Clean up

The preview carries this lane's marker on a public link (ADR 0003). Take the marker off: save the
page again with `LANE_MARKER` unset (the banner reads "no marker set") and upload it over the same
link. Move this plan to `docs/plans/done/` with its issue list.

Done when: the preview link no longer shows the lane marker.

Verified after review and explicit replacement approval: the same public URL
https://mega-s01e04-preview-engineb.vercel.app/ returns the regenerated page without the marker
and shows "no marker set" to an anonymous request. The original HTML is retained locally,
outside git. After separate human approval, the historical marked hosting deployment was
deleted; its URL returns 404. The current public URL remains accessible without its marker.

## Approved data rules

- Board totals count valid log events, labeled "Events: ok / retry / fail". They are not counts
  of jobs' current statuses. The 2026-10-28 sample has 10 ok, 4 retry, 1 fail, and one bad line.
- A job's current status comes from its latest event. "Last recorded error (historical)" is
  separate and remains available after a successful retry; it does not imply current failure.
- First/last use chronological timestamps, with file order breaking ties. Keep original
  timestamp strings and offsets. Owner comes from the latest event, including null.
- The shared reader result includes sorted rows, bad-line count and valid event counts.
  Missing files differ from empty files. The shared types are committed before §2 starts.
- Cleanup waits for the actual review, not just submission (ADR 0003). Public HTML publication,
  review submission and later marker-free replacement need separate human approvals.

## Issues

The human approved this split. Start dependencies and completion gates differ: §2 workers may
start at the shared interface commit; their issues close only after integrated checks pass.

| Issue | Source | Start dependency | Completion dependency |
|---|---|---|---|
| [#1 Read and aggregate one night's run log](https://github.com/marcengineb/mega-s01e04-rig/issues/1) | §1 | none | reader tests |
| [#2 Render GET /digest/:night](https://github.com/marcengineb/mega-s01e04-rig/issues/2) | §2a | #1 types | #1 reader |
| [#3 Expose GET /api/digest/:night](https://github.com/marcengineb/mega-s01e04-rig/issues/3) | §2b | #1 types | #1, #2 parity |
| [#4 Link each board night to its digest](https://github.com/marcengineb/mega-s01e04-rig/issues/4) | §2c | #1 types | #1, #2 |
| [#5 Test digest routes and HTML/JSON agreement](https://github.com/marcengineb/mega-s01e04-rig/issues/5) | §2d | #1 types | #1, #2, #3 |
| [#6 Publish and submit the review preview](https://github.com/marcengineb/mega-s01e04-rig/issues/6) | §3 | #1–#5 | publication/submission approval and actual review received |
| [#7 Remove marker after review and archive plan](https://github.com/marcengineb/mega-s01e04-rig/issues/7) | §4 | #6, actual review | replacement approval and verified cleanup |
