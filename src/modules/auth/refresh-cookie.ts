import type { CookieOptions, Response } from 'express';

export const REFRESH_COOKIE = 'refresh_token';
export function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
  };
}
export function clearRefreshCookie(response: Response) {
  response.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
}
