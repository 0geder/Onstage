import type { PriceRange } from './types';

/**
 * Normalise an artist or venue name for matching across sources.
 * "DJ Maphorisa (Live)" and "dj maphorisa" must collapse to the same key.
 */
export function normaliseName(raw: string): string {
  return (
    raw
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // Provider suffixes that describe the booking, not the act.
      .replace(/\((?:live|dj set|acoustic|tour|official)\)/g, ' ')
      // Stylised spellings: A$AP, Ke$ha. Dropping the character instead would
      // merge them into the wrong key.
      .replace(/\$/g, 's')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')
      // Only a leading "the". Stripping articles anywhere turned "A$AP Rocky"
      // into "ap rocky" and would collapse distinct acts onto the same key.
      .replace(/^the /, '')
  );
}

export function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Money is stored in minor units (cents) to keep it off floating point. */
export function formatMoney(priceMinor: number, currency = 'ZAR', locale = 'en-ZA'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: priceMinor % 100 === 0 ? 0 : 2,
  }).format(priceMinor / 100);
}

export function formatPriceRange(range: PriceRange | null, locale = 'en-ZA'): string {
  if (!range) return 'Price not listed';
  if (range.minMinor === range.maxMinor) return formatMoney(range.minMinor, range.currency, locale);
  return `${formatMoney(range.minMinor, range.currency, locale)} – ${formatMoney(
    range.maxMinor,
    range.currency,
    locale,
  )}`;
}

/** Event times are always shown in the venue's local time, never the viewer's. */
export function formatEventDateTime(
  startsAtIso: string,
  timezone: string,
  locale = 'en-ZA',
): string {
  const date = new Date(startsAtIso);
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(date);
}

export function formatRelativeTime(iso: string, now = new Date()): string {
  const diffSeconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  const formatter = new Intl.RelativeTimeFormat('en-ZA', { numeric: 'auto' });
  for (const [unit, seconds] of units) {
    if (Math.abs(diffSeconds) >= seconds) {
      return formatter.format(Math.round(diffSeconds / seconds), unit);
    }
  }
  return formatter.format(diffSeconds, 'second');
}

export function formatRating(avg: number | null, count: number): string {
  if (avg === null || count === 0) return 'Not rated yet';
  return `${avg.toFixed(1)} (${count.toLocaleString('en-ZA')})`;
}

export function formatFollowerCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}k`;
  return `${(count / 1_000_000).toFixed(1)}m`;
}
