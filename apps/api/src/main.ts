import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { buildOpenApi } from './openapi';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());

  app.enableCors({
    origin: config.get<string[]>('corsOrigins') ?? ['*'],
    credentials: true,
  });

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

  buildOpenApi(app);

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port, '0.0.0.0');

  // eslint-disable-next-line no-console
  console.log(`Onstage API listening on http://localhost:${port}/v1 (docs at /docs)`);
}

void bootstrap();
