import Link from 'next/link';
import { adminRequest, type AdminEvent } from '../../lib/api';

export const dynamic = 'force-dynamic';

/** Upcoming events, with the source and lock state visible at a glance. */
export default async function EventsPage() {
  let events: AdminEvent[] = [];
  let error: string | null = null;

  try {
    events = await adminRequest<AdminEvent[]>('/admin/events?limit=100&upcoming=true');
  } catch (caught) {
    error = (caught as Error).message;
  }

  if (error) {
    return (
      <>
        <h2>Events</h2>
        <div className="error">{error}</div>
      </>
    );
  }

  return (
    <>
      <h2>Events</h2>
      <p className="subtitle">
        Upcoming events. <Link href="/events/new">Add one →</Link>
      </p>

      {events.length === 0 ? (
        <div className="card">
          No upcoming events. <Link href="/events/new">Add the first one</Link>.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Event</th>
              <th>Venue</th>
              <th>Status</th>
              <th>Source</th>
              <th>Tickets</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>
                  {new Date(event.startsAt).toLocaleDateString('en-ZA', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </td>
                <td>
                  <strong>{event.title}</strong>
                  <div className="hint">{event.primaryArtist.name}</div>
                </td>
                <td>
                  {event.venue.name}
                  <div className="hint">{event.venue.city}</div>
                </td>
                <td>
                  <span className="pill pill-muted">{event.status.replace('_', ' ')}</span>
                </td>
                <td>
                  <span className={`pill ${event.isLocked ? 'pill-ok' : 'pill-muted'}`}>
                    {event.source}
                  </span>
                  {/* Locked means ingestion will leave it alone. */}
                  {event.isLocked ? <div className="hint">locked</div> : null}
                </td>
                <td className="hint">
                  {event.ticketOptions.length === 0
                    ? '—'
                    : event.ticketOptions
                        .map((option) =>
                          option.priceMinor === null
                            ? option.tierName
                            : `${option.tierName} R${(option.priceMinor / 100).toFixed(0)}`,
                        )
                        .join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
