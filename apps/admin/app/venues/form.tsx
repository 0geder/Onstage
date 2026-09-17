'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createVenue, type ActionResult } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Create venue'}
    </button>
  );
}

export function VenueForm() {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(createVenue, null);

  return (
    <form action={formAction}>
      {state ? (
        <div className={state.ok ? 'notice' : 'error'} role="status">
          {state.message}
        </div>
      ) : null}

      <div className="grid-2">
        <label>
          Name
          <input name="name" required maxLength={200} placeholder="The Assembly" />
        </label>
        <label>
          City
          <input name="city" required maxLength={120} placeholder="Cape Town" />
        </label>
      </div>

      <label>
        Address
        <input name="addressLine" placeholder="61 Harrington Street" />
      </label>

      <div className="grid-2">
        <label>
          Latitude
          <input name="lat" required type="number" step="any" placeholder="-33.9296" />
        </label>
        <label>
          Longitude
          <input name="lng" required type="number" step="any" placeholder="18.4213" />
        </label>
      </div>

      <div className="grid-2">
        <label>
          Capacity
          <input name="capacity" type="number" min="0" placeholder="900" />
        </label>
        <label>
          Country
          <input name="country" defaultValue="ZA" maxLength={2} />
        </label>
      </div>

      {/* Tri-state: unknown is the default and is stored as null, because
          guessing "no" on an accessibility field misleads the people who most
          depend on it being right. */}
      <div className="grid-2">
        <label>
          Wheelchair access
          <select name="wheelchairAccess" defaultValue="unknown">
            <option value="unknown">Unknown — do not state</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>

        <label>
          Cloakroom
          <select name="cloakroom" defaultValue="unknown">
            <option value="unknown">Unknown — do not state</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
      </div>

      <div className="grid-2">
        <label>
          Age restriction
          <input name="ageRestriction" placeholder="18+" maxLength={40} />
        </label>
        <label>
          Timezone
          <input name="timezone" defaultValue="Africa/Johannesburg" />
        </label>
      </div>

      <label>
        Re-entry policy
        <textarea name="reentryPolicy" placeholder="Re-entry allowed with a stamp until 01:00." />
      </label>

      <SubmitButton />
    </form>
  );
}
