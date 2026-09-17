import Link from 'next/link';
import { adminRequest, type CoverageRow } from '../lib/api';

export const dynamic = 'force-dynamic';

/**
 * Coverage dashboard.
 *
 * The first thing a curator should see, because coverage is the product. A city
 * with events but almost none entered by hand has not really been launched —
 * aggregator APIs barely touch the South African local scene, so a feed-only
 * city is a city where the listings are thin and the app looks empty.
 */
export default async function CoveragePage() {
  let coverage: CoverageRow[] = [];
  let error: string | null = null;

  try {
    coverage = await adminRequest<CoverageRow[]>('/admin/coverage');
  } catch (caught) {
    error = (caught as Error).message;
  }

  if (error) {
    return (
      <>
        <h2>Coverage</h2>
        <div className="error">{error}</div>
      </>
    );
  }

  const totalUpcoming = coverage.reduce((sum, row) => sum + row.upcoming, 0);
  const totalManual = coverage.reduce((sum, row) => sum + row.manual, 0);

  return (
    <>
      <h2>Coverage</h2>
      <p className="subtitle">
        Upcoming events by city, and how many were entered by a person rather than pulled from a
        feed.
      </p>

      <div className="card">
        <strong>
          {totalUpcoming} upcoming events · {totalManual} curated by hand
        </strong>
        <p className="hint" style={{ margin: '6px 0 0' }}>
          Aggregators barely cover the local scene. A city sitting near zero curated events is a
          city that has not actually been launched.
        </p>
      </div>

      {coverage.length === 0 ? (
        <div className="card">
          <p>No upcoming events yet.</p>
          <Link href="/events/new">Add the first one →</Link>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>City</th>
              <th>Upcoming</th>
              <th>Curated</th>
              <th>Curated share</th>
              <th>Sources</th>
            </tr>
          </thead>
          <tbody>
            {coverage.map((row) => {
              const share = row.upcoming === 0 ? 0 : Math.round((row.manual / row.upcoming) * 100);
              return (
                <tr key={`${row.city}-${row.country}`}>
                  <td>
                    <strong>{row.city}</strong>
                    <div className="hint">{row.country}</div>
                  </td>
                  <td>{row.upcoming}</td>
                  <td>{row.manual}</td>
                  <td>
                    <span
                      className={`pill ${share >= 50 ? 'pill-ok' : share > 0 ? 'pill-warn' : 'pill-danger'}`}
                    >
                      {share}%
                    </span>
                  </td>
                  <td className="hint">{row.sources.join(', ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
