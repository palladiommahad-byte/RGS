import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { env } from './config/env';

async function bootstrap(): Promise<void> {
  const config = env();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);

  const swagger = new DocumentBuilder()
    .setTitle('Riad Management API')
    .setVersion('1.0')
    .addCookieAuth('access_token')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  app.enableShutdownHooks();
  await app.listen(config.API_PORT);
  Logger.log(`API listening on http://localhost:${config.API_PORT}/api/v1`, 'Bootstrap');
  warnIfStaleTzData();
}

/**
 * "Today", month bounds and badge times use the runtime's tz database. Morocco moved to
 * permanent UTC+0 on 20 Sept 2026 (tzdata 2026c); older data is one hour off.
 */
const MIN_TZDATA = '2026c';
function warnIfStaleTzData(): void {
  const tz = process.versions.tz;
  if (tz && tz < MIN_TZDATA) {
    Logger.warn(`Node time-zone data is ${tz} (need ${MIN_TZDATA}+ for Morocco): local times will be 1 h off. Update Node.`, 'Bootstrap');
  }
}

void bootstrap();
