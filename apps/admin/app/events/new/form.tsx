'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { EVENT_STATUSES } from '@onstage/shared';
import { createEvent, type ActionResult } from '../../actions';
import type { AdminVenue } from '../../../lib/api';

interface ArtistOption {
  id: string;
  name: string;
  homeCity: string | null;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Create event'}
    </button>
  );
}

export function EventForm({
  venues,
  artists,
}: {
  venues: AdminVenue[];
  artists: ArtistOption[];
}) {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(createEvent, null);
  const [supportCount, setSupportCount] = useState(1);

  return (
    <form action={formAction}>
      {state ? (
        <div className={state.ok ? 'notice' : 'error'} role="status">
          {state.message}
        </div>
      ) : null}

      <label>
        Title
        <input name="title" required maxLength={300} placeholder="Nomvula Dlamini — Homecoming" />
      </label>

      <label>
        Headline artist
        <select name="primaryArtistId" required defaultValue="">
          <option value="" disabled>
            Choose an artist
          </option>
          {artists.map((artist) => (
            <option key={artist.id} value={artist.id}>
              {artist.name}
              {artist.homeCity ? ` — ${artist.homeCity}` : ''}
            </option>
          ))}
        </select>
      </label>

      {/* Support acts are first-class rows, not free text: every name on the
          bill becomes a tappable link to that artist, which is where most
          new-artist discovery actually comes from. */}
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        <span className="hint">
          Support acts — each becomes a link to that artist&rsquo;s profile.
        </span>

        {Array.from({ length: supportCount }).map((_, index) => (
          <select key={index} name="supportArtistIds" defaultValue="">
            <option value="">— none —</option>
            {artists.map((artist) => (
              <option key={artist.id} value={artist.id}>
                {artist.name}
              </option>
            ))}
          </select>
        ))}

        <button
          type="button"
          className="secondary"
          onClick={() => setSupportCount((count) => Math.min(count + 1, 8))}
        >
          Add another support act
        </button>
      </fieldset>

      <label>
        Venue
        <select name="venueId" required defaultValue="">
          <option value="" disabled>
            Choose a venue
          </option>
          {venues.map((venue) => (
            <option key={venue.id} value={venue.id}>
              {venue.name} — {venue.city}
            </option>
          ))}
        </select>
      </label>

      <div className="grid-2">
        <label>
          Starts at (local time)
          <input type="datetime-local" name="startsAt" required />
        </label>
        <label>
          Doors open (optional)
          <input type="datetime-local" name="doorsOpenAt" />
        </label>
      </div>

      <div className="grid-2">
        <label>
          Tickets on sale at (optional)
          <input type="datetime-local" name="onSaleAt" />
          <span className="hint">Drives the on-sale reminder notification.</span>
        </label>

        <label>
          Status
          <select name="status" defaultValue="announced">
            {EVENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.replace('_', ' ')}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid-2">
        <label>
          Age restriction
          <input name="ageRestriction" placeholder="18+" maxLength={40} />
        </label>
        <label>
          Poster image URL
          <input name="posterImage" type="url" placeholder="https://…" />
        </label>
      </div>

      <label>
        Description
        <textarea name="description" placeholder="Anything a fan would want to know." />
      </label>

      <SubmitButton />
    </form>
  );
}
