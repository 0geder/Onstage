/**
 * Minimal IANA timezone arithmetic.
 *
 * Event times are stored in UTC but every question a fan asks is in local time
 * — "what's on this weekend" means their Friday, not UTC's. `Intl` already
 * knows every zone's rules, so this derives offsets from it rather than
 * pulling in a date library for two functions.
 */

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday, matching Date#getDay. */
  weekday: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let cached = formatterCache.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatterCache.set(timeZone, cached);
  }
  return cached;
}

export function localParts(instant: Date, timeZone: string): LocalParts {
  const parts: Record<string, string> = {};
  for (const part of formatter(timeZone).formatToParts(instant)) {
    parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Intl renders midnight as "24" in some locales; normalise it.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: Math.max(0, WEEKDAYS.indexOf(parts.weekday)),
  };
}

function offsetMs(instant: Date, timeZone: string): number {
  const parts = localParts(instant, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - instant.getTime();
}

/**
 * Converts a wall-clock time in `timeZone` to the matching UTC instant.
 * Applied twice so a DST boundary between the guess and the answer resolves.
 */
export function zonedTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  const firstGuess = new Date(naive - offsetMs(new Date(naive), timeZone));
  return new Date(naive - offsetMs(firstGuess, timeZone));
}

/**
 * The coming weekend in a given zone: Friday 00:00 local through Monday 06:00
 * local. The Monday tail is deliberate — a Sunday-night show that runs past
 * midnight is still part of the weekend to the person going to it.
 *
 * Asked on a Saturday, this returns the weekend already under way, not the next one.
 */
export function weekendWindow(timeZone: string, now = new Date()): { from: Date; to: Date } {
  const today = localParts(now, timeZone);
  // Friday = 5. On Sat (6) or Sun (0) we are already inside the weekend.
  const daysSinceFriday = (today.weekday - 5 + 7) % 7;
  const daysToFriday = daysSinceFriday <= 2 ? -daysSinceFriday : 7 - daysSinceFriday;

  const friday = new Date(
    Date.UTC(today.year, today.month - 1, today.day + daysToFriday, 12, 0, 0),
  );
  const fridayParts = localParts(friday, timeZone);

  const from = zonedTimeToUtc(
    timeZone,
    fridayParts.year,
    fridayParts.month,
    fridayParts.day,
    0,
    0,
  );
  const monday = new Date(from.getTime() + 3 * 86_400_000 + 6 * 3_600_000);

  return { from: from < now ? now : from, to: monday };
}
