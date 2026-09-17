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

export function decodeCursor(cursor?: string): Keyset | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Keyset;
    if (typeof parsed?.id !== 'string' || parsed.value === undefined) {
      throw new Error('missing fields');
    }
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
