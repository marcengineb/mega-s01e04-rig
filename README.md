# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
(next) a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

## Morning digest

The status board links each night to `/digest/<YYYY-MM-DD>`. The matching JSON is at
`/api/digest/<YYYY-MM-DD>`. Both use the same reader and job ordering. Missing files return
404; empty files show "nothing ran".

Board counts are labeled **Events**: valid ok / retry / fail log records. A job's current
status is separate from its last recorded error, which remains visible as historical
information after recovery. Displayed timestamps keep their source offsets.

For a review copy, run rig with its local `.env`, then save the page outside this repository:

```sh
curl --fail http://localhost:8787/digest/2026-10-28 --output /tmp/rig-digest-preview.html
```

The HTML is self-contained. Public hosting and review submission require human approval.
Keep the marker until the actual review arrives. After separate cleanup approval, regenerate
with `LANE_MARKER` unset and overwrite the same public URL (ADR 0003). Never commit `.env` or
preview HTML, and never attach a preview to an issue or chat.
