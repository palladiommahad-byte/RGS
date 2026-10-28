import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ApiError } from '@riad/shared';
import type { Response } from 'express';
import { AppException } from '../app-exception';

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
};

/** Normalises every error to `{ code, message, details }`. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toApiError(exception);
    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }
    res.status(status).json(body);
  }

  private toApiError(exception: unknown): { status: number; body: ApiError } {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        body: { code: exception.code, message: exception.message, details: exception.details },
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const code = STATUS_CODES[status] ?? 'ERROR';
      if (typeof response === 'string') return { status, body: { code, message: response } };
      const r = response as { message?: unknown; code?: unknown; details?: unknown };
      return {
        status,
        body: {
          code: typeof r.code === 'string' ? r.code : code,
          message: typeof r.message === 'string' ? r.message : exception.message,
          details: r.details ?? (Array.isArray(r.message) ? r.message : undefined),
        },
      };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          status: HttpStatus.CONFLICT,
          body: {
            code: 'ALREADY_EXISTS',
            message: 'A record with the same value already exists',
            details: { fields: exception.meta?.target },
          },
        };
      }
      if (exception.code === 'P2025') {
        return { status: HttpStatus.NOT_FOUND, body: { code: 'NOT_FOUND', message: 'Not found' } };
      }
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    };
  }
}
