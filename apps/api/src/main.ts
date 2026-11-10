// Must stay the first import: Sentry instruments modules as they load.
import './instrument';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { assertProductionConfig } from './config/production-checks';
import { buildOpenApi } from './openapi';

/** Local dev servers (CMS, web, Expo web) on any port. */
const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * Production needs an explicit origin list. Elsewhere an unset list allows any
 * localhost origin, and an explicit '*' drops credentials — a wildcard origin
 * with credentials is never sent.
 */
function corsOptions(origins: string[], nodeEnv: string): CorsOptions {
  if (nodeEnv === 'production' && (origins.length === 0 || origins.includes('*'))) {
    throw new Error('CORS_ORIGINS must be an explicit comma-separated origin list in production.');
  }
  if (origins.length === 0) return { origin: LOCALHOST_ORIGIN, credentials: true };
  if (origins.includes('*')) return { origin: '*', credentials: false };
  return { origin: origins, credentials: true };
}

async function bootstrap(): Promise<void> {
  // Before anything connects: a production boot with a missing or placeholder
  // secret stops here, naming the variables.
  assertProductionConfig();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);

  // SIGTERM (docker stop) runs onModuleDestroy, which closes Prisma and Redis.
  app.enableShutdownHooks();

  // Every request body is small JSON; refuse anything larger before parsing it.
  app.useBodyParser('json', { limit: '100kb' });
  app.useBodyParser('urlencoded', { limit: '100kb', extended: true });

  // Behind a load balancer req.ip is the proxy unless we trust its hops; the
  // throttler keys on req.ip, so this decides whether rate limits work at all.
  const trustProxy = config.get<number | null>('trustProxy') ?? null;
  if (trustProxy !== null) app.set('trust proxy', trustProxy);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());

  app.enableCors(
    corsOptions(config.get<string[]>('corsOrigins') ?? [], config.get<string>('nodeEnv') ?? 'development'),
  );

  app.setGlobalPrefix('v1');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: undefined });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  // The document maps every admin route; production serves it only on request.
  const docs = config.get<boolean>('enableApiDocs') ?? false;
  if (docs) buildOpenApi(app);

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port, '0.0.0.0');

  // eslint-disable-next-line no-console
  console.log(`Onstage API listening on http://localhost:${port}/v1${docs ? ' (docs at /docs)' : ''}`);
}

void bootstrap();
