import { BandsintownAdapter } from './bandsintown';
import { HowlerAdapter } from './howler';
import { QuicketAdapter } from './quicket';
import { TicketmasterAdapter } from './ticketmaster';
import type { EventSourceAdapter } from './types';

/**
 * The adapter registry.
 *
 * Adding a provider is one entry here plus one file — nothing in the pipeline,
 * the schema or the API changes. That is the whole point of the abstraction:
 * any single source can be revoked or priced out without a rewrite.
 */
export const adapters: EventSourceAdapter[] = [
  new TicketmasterAdapter(),
  new BandsintownAdapter(),
  new QuicketAdapter(),
  new HowlerAdapter(),
];

export * from './types';
