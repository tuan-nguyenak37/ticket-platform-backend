import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { refreshCookieOptions } from './refresh-cookie';
import {
  corsOrigins,
  defaultFrontendOrigins,
} from '../../common/http/cors-origins';

export const BROWSER_SESSION_COOKIE = 'ticketverse_session';
export const BROWSER_REFRESH_COOKIE = 'ticketverse_refresh';

export function browserCookieOptions() {
  return { ...refreshCookieOptions(), path: '/' };
}

export function assertBrowserOrigin(request: Request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const origins = corsOrigins(
    process.env.FRONTEND_URL ?? defaultFrontendOrigins,
  );
  if (!request.headers.origin || !origins.includes(request.headers.origin))
    throw new ForbiddenException('Nguồn yêu cầu không hợp lệ');
}
