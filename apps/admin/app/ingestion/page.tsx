import { adminRequest, type IngestionRun } from '../../lib/api';

export const dynamic = 'force-dynamic';

/**
 * Ingestion history.
 *
 * Coverage is the product, so a silent failure to ingest is a product outage.
 * Every pass is recorded and shown here, including the ones that found nothing.
 */
export default async function IngestionPage() {
  let runs: IngestionRun[] = [];
  let error: string | null = null;

  try {
    runs = await adminRequest<IngestionRun[]>('/admin/ingestion/runs?limit=40');
  } catch (caught) {
    error = (caught as Error).message;
  }

  if (error) {
    return (
      <>
        <h2>Ingestion</h2>
        <div className="error">{error}</div>
      </>
    );
  }

  return (
    <>
      <h2>Ingestion</h2>
      <p className="subtitle">
        Recent provider passes. Hourly for events on sale, daily for the long tail.
      </p>

      {runs.length === 0 ? (
        <div className="card">
          No ingestion runs recorded yet. Either no provider credentials are configured, or the
          worker has not run. Local coverage comes from the CMS regardless.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Started</th>
              <th>Source</th>
              <th>Tier</th>
              <th>Fetched</th>
              <th>Created</th>
              <th>Updated</th>
              <th>Deduped</th>
              <th>Skipped</th>
              <th>Failed</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>
                  {new Date(run.startedAt).toLocaleString('en-ZA')}
                  {run.error ? <div className="pill pill-danger">{run.error}</div> : null}
                </td>
                <td>{run.source}</td>
                <td className="hint">{run.tier}</td>
                <td>{run.fetched}</td>
                <td>{run.created}</td>
                <td>{run.updated}</td>
                <td className="hint">{run.deduped}</td>
                <td className="hint">{run.skipped}</td>
                <td>
                  {run.failed > 0 ? (
                    <span className="pill pill-warn">{run.failed}</span>
                  ) : (
                    <span className="hint">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
