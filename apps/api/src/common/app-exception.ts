import { HttpException, HttpStatus } from '@nestjs/common';

/** Domain error carrying a stable machine-readable `code` for the API error shape. */
export class AppException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}
