import { adminRequest, type AdminVenue } from '../../../lib/api';
import { EventForm } from './form';

export const dynamic = 'force-dynamic';

interface ArtistOption {
  id: string;
  name: string;
  homeCity: string | null;
}

/**
 * Manual event creation.
 *
 * This is the single most important screen in the CMS. Aggregator APIs barely
 * touch the South African local scene, so most of a launch city's calendar gets
 * typed in here — and everything created here is locked, so no ingestion run can
 * overwrite it.
 */
export default async function NewEventPage() {
  let venues: AdminVenue[] = [];
  let artists: ArtistOption[] = [];
  let error: string | null = null;

  try {
    [venues, artists] = await Promise.all([
      adminRequest<AdminVenue[]>('/admin/venues?limit=200'),
      // Reuses the public search with an empty-ish query to list known acts.
      adminRequest<{ artist: ArtistOption }[]>('/search/artists?q=a&limit=50').then((results) =>
        results.map((result) => result.artist),
      ),
    ]);
  } catch (caught) {
    error = (caught as Error).message;
  }

  return (
    <>
      <h2>Add an event</h2>
      <p className="subtitle">
        Created with source <code>manual</code> and locked, so ingestion can never overwrite it.
      </p>

      {error ? <div className="error">{error}</div> : null}

      <EventForm venues={venues} artists={artists} />
    </>
  );
}
