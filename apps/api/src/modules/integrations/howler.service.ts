import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/** The parts of Howler's Event Webhook body this service relies on. */
interface HowlerEventBody {
  action?: unknown;
  event_id?: unknown;
  event_organiser_id?: unknown;
  event_start_time?: unknown;
  event_last_modified_date?: unknown;
}

export type HowlerStoreResult = 'stored' | 'stale' | 'ignored';

const ACTIONS = new Set(['event_create', 'event_amend']);

function dateOrNull(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Keeps the newest Howler payload per event.
 *
 * Translation into Onstage events happens in the worker's Howler adapter, so
 * this stays a fast, dumb inbox: Howler gets its 200 straight away and a
 * payload the worker can't use yet is still kept for when it can.
 */
@Injectable()
export class HowlerService {
  constructor(private readonly prisma: PrismaService) {}

  async storeEvent(body: unknown, allowedOrganisers: number[]): Promise<HowlerStoreResult> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Expected a Howler event webhook body.');
    }
    const event = body as HowlerEventBody;
    const eventId = event.event_id;
    const organiserId = event.event_organiser_id;
    const modifiedAt = dateOrNull(event.event_last_modified_date);
    if (
      !Number.isInteger(eventId) ||
      !Number.isInteger(organiserId) ||
      !modifiedAt ||
      typeof event.action !== 'string'
    ) {
      throw new BadRequestException(
        'event_id, event_organiser_id, action and event_last_modified_date are required.',
      );
    }

    // Unknown actions and organisers who haven't agreed to be listed are
    // acknowledged, not rejected, so Howler doesn't keep retrying them.
    if (!ACTIONS.has(event.action)) return 'ignored';
    if (allowedOrganisers.length > 0 && !allowedOrganisers.includes(organiserId as number)) {
      return 'ignored';
    }

    const id = eventId as number;
    const data = {
      organiserId: organiserId as number,
      payload: body as Prisma.InputJsonObject,
      startsAt: dateOrNull(event.event_start_time),
      modifiedAt,
      receivedAt: new Date(),
    };

    // Webhooks can arrive out of order; only a newer copy replaces the stored one.
    const updated = await this.prisma.howlerEvent.updateMany({
      where: { howlerEventId: id, modifiedAt: { lte: modifiedAt } },
      data,
    });
    if (updated.count > 0) return 'stored';

    try {
      await this.prisma.howlerEvent.create({ data: { howlerEventId: id, ...data } });
      return 'stored';
    } catch (error) {
      // Already there and newer than this delivery.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return 'stale';
      }
      throw error;
    }
  }
}
