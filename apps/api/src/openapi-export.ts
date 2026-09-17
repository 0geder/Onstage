import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import { buildOpenApi } from './openapi';

/** Writes openapi.json without starting a listener, for CI and client generation. */
async function exportSpec(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.init();

  const document = buildOpenApi(app);
  const target = resolve(process.cwd(), 'openapi.json');
  writeFileSync(target, JSON.stringify(document, null, 2), 'utf8');

  // eslint-disable-next-line no-console
  console.log(`Wrote ${target}`);
  await app.close();
}

void exportSpec();
