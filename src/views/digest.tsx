import type { NightDigest, DigestRow } from '../digest/types.js';

function statusCell(row: DigestRow) {
  return row.lastStatus === 'fail'
    ? <span class="warn">{row.lastStatus}</span>
    : row.lastStatus;
}

export function NightDigestPage({ digest }: { digest: NightDigest }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      <p class="mute">bad lines: {digest.badLines}</p>
      {digest.rows.length === 0 ? (
        <p>nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>Current status</th>
              <th>Last recorded error (historical)</th>
              <th>First recorded</th>
              <th>Last recorded</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => (
              <tr>
                <td>{row.job}</td>
                <td>{row.owner ?? '—'}</td>
                <td>{row.runs}</td>
                <td>{row.retries >= 3 ? <span class="warn">{row.retries}</span> : row.retries}</td>
                <td>{statusCell(row)}</td>
                <td>{row.lastError ?? '—'}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
