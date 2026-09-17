import { ImageResponse } from 'next/og';
import { formatEventDateTime, EVENT_STATUS_LABELS } from '@onstage/shared';
import { getEvent } from '../../../lib/api';

/**
 * The share card.
 *
 * Generated per event at the edge and sized for Instagram and X. It carries the
 * four things someone needs to decide whether to care — who, when, where, and
 * whether tickets are still available — because a shared link that shows only a
 * URL converts nobody.
 */

export const runtime = 'edge';
export const alt = 'Onstage event';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: { slug: string } }) {
  const event = await getEvent(params.slug);

  if (!event) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0B0B0F',
            color: '#F5F5F7',
            fontSize: 64,
            fontWeight: 700,
          }}
        >
          Onstage
        </div>
      ),
      size,
    );
  }

  const when = formatEventDateTime(event.startsAt, event.localTimezone);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#0B0B0F',
          color: '#F5F5F7',
          padding: 64,
          gap: 48,
          alignItems: 'center',
        }}
      >
        {event.posterImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.posterImage}
            width={340}
            height={460}
            alt=""
            style={{ objectFit: 'cover', borderRadius: 24 }}
          />
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 18 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#FF4D6D',
              fontWeight: 700,
              letterSpacing: 2,
            }}
          >
            {EVENT_STATUS_LABELS[event.status].toUpperCase()}
          </div>

          <div style={{ display: 'flex', fontSize: 58, fontWeight: 700, lineHeight: 1.1 }}>
            {event.title.slice(0, 70)}
          </div>

          <div style={{ display: 'flex', fontSize: 30, color: '#F5F5F7' }}>{when}</div>

          <div style={{ display: 'flex', fontSize: 26, color: '#9A9AA8' }}>
            {event.venue.name}, {event.venue.city}
          </div>

          <div
            style={{
              display: 'flex',
              marginTop: 'auto',
              fontSize: 24,
              color: '#6B6B7B',
              fontWeight: 600,
            }}
          >
            onstage.co.za
          </div>
        </div>
      </div>
    ),
    size,
  );
}
