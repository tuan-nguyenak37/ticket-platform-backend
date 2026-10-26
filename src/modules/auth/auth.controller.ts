import {
  Controller,
  Post,
  Body,
  HttpCode,
  Req,
  Res,
  Header,
  Get,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { tokenLifetimeSeconds } from '../../config/token-lifetime';
import { RateLimit } from '../../common/security/rate-limit.decorator';
import type { Response } from 'express';
import { Authenticated, CurrentUser } from './authorization/access-policy';
import type { Principal } from './authorization/principal';
import {
  REFRESH_COOKIE,
  refreshCookieOptions,
  clearRefreshCookie,
} from './refresh-cookie';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/create-auth.dto';
import { LoginDto } from './dto/login-auth.dto';
import {
  assertBrowserOrigin,
  BROWSER_SESSION_COOKIE,
  BROWSER_REFRESH_COOKIE,
  browserCookieOptions,
} from './browser-session';
import { Public } from './jwt/public.decorator';
import type { AuthenticatedRequest } from './jwt/access-token.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('browser/login')
  @RateLimit({ scope: 'login', limit: 10, seconds: 60, account: true })
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  async browserLogin(
    @Body() dto: LoginDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertBrowserOrigin(request);
    const { refreshToken, refreshTokenExpiresAt, ...body } =
      await this.authService.login(dto, this.browserToken(request));
    response.cookie(BROWSER_REFRESH_COOKIE, refreshToken, {
      ...browserCookieOptions(),
      maxAge: Math.max(0, Date.parse(refreshTokenExpiresAt) - Date.now()),
    });
    response.clearCookie(BROWSER_SESSION_COOKIE, browserCookieOptions());
    clearRefreshCookie(response);
    return body;
  }

  @Public()
  @Get('browser/session')
  @Header('Cache-Control', 'no-store')
  browserSession(@Req() request: AuthenticatedRequest) {
    return this.authService.browserProfile(this.browserToken(request));
  }

  @Public()
  @Post('browser/refresh')
  @RateLimit({ scope: 'refresh', limit: 30, seconds: 60 })
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  async browserRefresh(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertBrowserOrigin(request);
    const { refreshToken, refreshTokenExpiresAt, ...body } =
      await this.authService.refresh(this.browserToken(request));
    response.cookie(BROWSER_REFRESH_COOKIE, refreshToken, {
      ...browserCookieOptions(),
      maxAge: Math.max(0, Date.parse(refreshTokenExpiresAt) - Date.now()),
    });
    return body;
  }

  @Public()
  @Post('browser/logout')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  async browserLogout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertBrowserOrigin(request);
    const result = await this.authService.browserLogout(
      this.browserToken(request),
    );
    response.clearCookie(BROWSER_REFRESH_COOKIE, browserCookieOptions());
    response.clearCookie(BROWSER_SESSION_COOKIE, browserCookieOptions());
    return result;
  }

  private browserToken(request: AuthenticatedRequest): string {
    const token: unknown = request.cookies?.[BROWSER_REFRESH_COOKIE];
    return typeof token === 'string' ? token : '';
  }

  @Public()
  @Post('register')
  @RateLimit({ scope: 'register', limit: 5, seconds: 900 })
  @Header('Cache-Control', 'no-store')
  create(@Body() dto: RegisterDto) {
    return this.authService.create(dto);
  }

  @Public()
  @Post('login')
  @RateLimit({ scope: 'login', limit: 10, seconds: 60, account: true })
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Req() request: AuthenticatedRequest,
  ) {
    assertBrowserOrigin(request);
    const { refreshToken, refreshTokenExpiresAt, ...body } =
      await this.authService.login(dto);
    this.setRefreshCookie(res, refreshToken, refreshTokenExpiresAt);
    return body;
  }

  @Public()
  @Post('refresh')
  @RateLimit({ scope: 'refresh', limit: 30, seconds: 60 })
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  async refresh(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    assertBrowserOrigin(req);
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const tokenFromCookie = cookies?.[REFRESH_COOKIE];
    const { refreshToken, refreshTokenExpiresAt, ...body } =
      await this.authService.refresh(
        typeof tokenFromCookie === 'string' ? tokenFromCookie : '',
      );
    this.setRefreshCookie(res, refreshToken, refreshTokenExpiresAt);
    return body;
  }

  @Post('logout')
  @Authenticated()
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  async logout(
    @CurrentUser() actor: Principal,
    @Res({ passthrough: true }) res: Response,
    @Req() request: AuthenticatedRequest,
  ) {
    assertBrowserOrigin(request);
    const result = await this.authService.logout(actor);
    clearRefreshCookie(res);
    return result;
  }

  private setRefreshCookie(res: Response, token: string, expiresAt?: string) {
    res.cookie(REFRESH_COOKIE, token, {
      ...refreshCookieOptions(),
      maxAge: expiresAt
        ? Math.max(0, Date.parse(expiresAt) - Date.now())
        : tokenLifetimeSeconds(
            this.config.get<string>('JWT_REFRESH_EXPIRES', '7d'),
          ) * 1000,
    });
  }
}
