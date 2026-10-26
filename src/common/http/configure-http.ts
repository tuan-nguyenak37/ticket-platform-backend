import { INestApplication, ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { corsOrigins, defaultFrontendOrigins } from './cors-origins';

export function configureHttp(
  app: INestApplication,
  frontendUrl = process.env.FRONTEND_URL ?? defaultFrontendOrigins,
) {
  app.enableCors({
    origin: corsOrigins(frontendUrl),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'Idempotency-Key',
    ],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
  });
  app.use(
    (
      request: Request & { requestId?: string },
      response: Response,
      next: NextFunction,
    ) => {
      request.requestId = randomUUID();
      response.setHeader('X-Request-Id', request.requestId);
      next();
    },
  );
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
    }),
  );
}
