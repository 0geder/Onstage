import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

/**
 * OpenAPI description of the whole API.
 *
 * The constraints in this description are not decoration — they are the
 * product's boundaries, and anyone generating a client from this document
 * should be able to see them without reading the spec.
 */
export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Onstage API')
    .setDescription(
      [
        'Discover where artists are playing, get tickets, get to the venue, talk about it and rate it.',
        '',
        '**Boundaries this API deliberately keeps:**',
        '- Announced and confirmed appearances only. Onstage never tracks an artist\u2019s live location.',
        '- No audio is hosted or streamed. Streaming links point out to the platforms.',
        '- No ticket payment is processed. Purchases happen on the provider\u2019s own site.',
        '- No rides are booked. Uber, Bolt and inDrive are deep links.',
        '- No user-to-user ticket transaction is processed, escrowed or brokered. The platform hosts the conversation and nothing more.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'firebase',
    )
    .addTag('search', 'Typo-tolerant artist lookup')
    .addTag('artists', 'Profiles, shows, follows')
    .addTag('events', 'Event detail, attendance, directions and rides')
    .addTag('tickets', 'Outbound ticket links')
    .addTag('threads', 'Event conversation, planning and recap')
    .addTag('ratings', 'Overall and live performance ratings')
    .addTag('feed', 'Discovery')
    .addTag('me', 'Profile, onboarding and connections')
    .addTag('referrals', 'Invite a friend')
    .addTag('badges', 'Attendance streaks')
    .addTag('privacy', 'POPIA consent, export and deletion')
    .addTag('admin', 'Curation and moderation')
    .addServer('http://localhost:3000', 'Local')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
  return document;
}
