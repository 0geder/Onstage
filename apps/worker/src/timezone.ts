/**
 * Minimal IANA timezone arithmetic, mirroring the API's helper.
 *
 * Some providers publish venue-local wall-clock times with no offset. Parsing
 * those with `new Date()` reads them in the worker's own timezone, which is UTC
 * in production and therefore two hours wrong for every South African show.
 * `Intl` knows every zone's rules, so offsets are derived from it rather than
 * pulling in a date library.
 */

export const DEFAULT_TIMEZONE = 'Africa/Johannesburg';

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
    });
    formatterCache.set(timeZone, cached);
  }
  return cached;
}

/** True when `Intl` recognises the zone name. */
export function isValidTimezone(timeZone: string | undefined | null): timeZone is string {
  if (!timeZone) return false;
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

function offsetMs(instant: Date, timeZone: string): number {
  const parts: Record<string, string> = {};
  for (const part of formatter(timeZone).formatToParts(instant)) {
    parts[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // Intl renders midnight as "24" in some locales; normalise it.
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
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
  second = 0,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstGuess = new Date(naive - offsetMs(new Date(naive), timeZone));
  return new Date(naive - offsetMs(firstGuess, timeZone));
}

const LOCAL_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/;

/**
 * Parses an ISO-8601 date-time. One carrying an offset (or `Z`) is an instant
 * already; one without is wall-clock time in `timeZone`. Returns null when the
 * string is not a date at all.
 */
export function parseLocalDateTime(value: string, timeZone: string): Date | null {
  const trimmed = value.trim();
  const local = LOCAL_ISO.exec(trimmed);
  if (!local) {
    const instant = new Date(trimmed);
    return Number.isNaN(instant.getTime()) ? null : instant;
  }

  const [, year, month, day, hour = '0', minute = '0', second = '0'] = local;
  const result = zonedTimeToUtc(
    timeZone,
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  return Number.isNaN(result.getTime()) ? null : result;
}
