import { BadRequestException } from '@nestjs/common';

/**
 * Keyset pagination cursors.
 *
 * Offset pagination would drift under a thread that is actively being posted
 * to, so lists page on (sortValue, id) instead. The cursor is opaque base64url
 * — clients pass back whatever they were given.
 */
export interface Keyset {
  /** ISO timestamp, numeric score, or distance — whatever the list sorts on. */
  value: string | number;
  id: string;
}

export function encodeCursor(keyset: Keyset): string {
  return Buffer.from(JSON.stringify(keyset), 'utf8').toString('base64url');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Decodes and validates a cursor. `kind` says what the list sorts on, so a
 * tampered value is a 400 here rather than an invalid Date or NaN reaching
 * the database.
 */
export function decodeCursor(cursor?: string, kind: 'date' | 'number' = 'date'): Keyset | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Keyset;
    if (typeof parsed?.id !== 'string' || !UUID.test(parsed.id)) {
      throw new Error('bad id');
    }
    const valid =
      kind === 'number'
        ? typeof parsed.value === 'number' && Number.isFinite(parsed.value)
        : typeof parsed.value === 'string' && !Number.isNaN(new Date(parsed.value).getTime());
    if (!valid) throw new Error('bad value');
    return parsed;
  } catch {
    throw new BadRequestException('Malformed pagination cursor.');
  }
}

/**
 * Trims an over-fetched page (limit + 1 rows) down to size and derives the
 * cursor for the next one.
 */
export function pageOf<T>(
  rows: T[],
  limit: number,
  toKeyset: (row: T) => Keyset,
): { items: T[]; nextCursor: string | null } {
  if (rows.length <= limit) return { items: rows, nextCursor: null };
  const items = rows.slice(0, limit);
  return { items, nextCursor: encodeCursor(toKeyset(items[items.length - 1])) };
}
