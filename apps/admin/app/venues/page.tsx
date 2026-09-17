import { adminRequest, type AdminVenue } from '../../lib/api';
import { VenueForm } from './form';

export const dynamic = 'force-dynamic';

export default async function VenuesPage() {
  let venues: AdminVenue[] = [];
  let error: string | null = null;

  try {
    venues = await adminRequest<AdminVenue[]>('/admin/venues?limit=200');
  } catch (caught) {
    error = (caught as Error).message;
  }

  return (
    <>
      <h2>Venues</h2>
      <p className="subtitle">
        Coordinates are required: they drive &ldquo;near me&rdquo; search and the venue-proximity
        half of the deduplication rule.
      </p>

      {error ? <div className="error">{error}</div> : null}

      <VenueForm />

      <h2 style={{ marginTop: 32 }}>Existing venues</h2>
      {venues.length === 0 ? (
        <div className="card">No venues yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Venue</th>
              <th>City</th>
              <th>Capacity</th>
              <th>Access</th>
              <th>Cloakroom</th>
              <th>Age</th>
            </tr>
          </thead>
          <tbody>
            {venues.map((venue) => (
              <tr key={venue.id}>
                <td>
                  <strong>{venue.name}</strong>
                  <div className="hint">
                    {venue.lat.toFixed(4)}, {venue.lng.toFixed(4)}
                  </div>
                </td>
                <td>
                  {venue.city}
                  <div className="hint">{venue.country}</div>
                </td>
                <td>{venue.capacity ?? '—'}</td>
                {/* Unknown is shown as a dash, never as "No" — a wheelchair user
                    told "no access" when nobody checked is worse than told nothing. */}
                <td>{triLabel(venue.wheelchairAccess)}</td>
                <td>{triLabel(venue.cloakroom)}</td>
                <td className="hint">{venue.ageRestriction ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function triLabel(value: boolean | null) {
  if (value === null) return <span className="hint">not stated</span>;
  return value ? <span className="pill pill-ok">yes</span> : <span className="pill pill-muted">no</span>;
}
