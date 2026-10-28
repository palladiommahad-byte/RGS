import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { env } from './config/env';

/** Middleware, prefix, validation and error shape — shared by main.ts and the e2e tests. */
export function configureApp(app: NestExpressApplication): void {
  const config = env();
  app.set('trust proxy', config.TRUST_PROXY);
  // Check-in submissions carry a signature image; uploads use multipart, not JSON.
  app.useBodyParser('json', { limit: '1mb' });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: errors.map((e) => ({
            field: e.property,
            errors: e.constraints,
            children: e.children?.length ? e.children.map((c) => c.property) : undefined,
          })),
        }),
    }),
  );
}
