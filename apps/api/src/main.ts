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
}

void bootstrap();
