import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    if (response.headersSent) return;

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const details =
      exception instanceof HttpException && status < 500
        ? exception.getResponse()
        : null;
    let message: string | string[] = 'Internal server error';
    let code: string | undefined;
    let issues: unknown;

    if (typeof details === 'string') message = details;
    if (details && typeof details === 'object') {
      if ('message' in details) {
        const candidate: unknown = details.message;
        if (
          typeof candidate === 'string' ||
          (Array.isArray(candidate) &&
            candidate.every((entry: unknown) => typeof entry === 'string'))
        ) {
          message = candidate as string | string[];
        }
      }
      if ('code' in details && typeof details.code === 'string') {
        code = details.code;
      }
      if ('issues' in details) issues = details.issues;
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      ...(code ? { code } : {}),
      ...(issues ? { issues } : {}),
      path: (request.originalUrl || request.url).split('?')[0],
      timestamp: new Date().toISOString(),
    });
  }
}
