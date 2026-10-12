import {
  Controller,
  Post,
  Body,
  HttpCode,
  Req,
  Res,
  Header,
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
import { Public } from './jwt/public.decorator';
import type { AuthenticatedRequest } from './jwt/access-token.guard';

// Tên cookie chứa refresh token

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @RateLimit({ scope: 'register', limit: 5, seconds: 900 })
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
  ) {
    const { refreshToken, ...body } = await this.authService.login(dto);
    this.setRefreshCookie(res, refreshToken);
    return body; // Chỉ trả accessToken + user trong body
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
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const tokenFromCookie = cookies?.[REFRESH_COOKIE];
    const { refreshToken, ...body } = await this.authService.refresh(
      typeof tokenFromCookie === 'string' ? tokenFromCookie : '',
    );
    this.setRefreshCookie(res, refreshToken);
    return body;
  }

  @Post('logout')
  @Authenticated()
  @HttpCode(200)
  async logout(
    @CurrentUser() actor: Principal,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.logout(actor);
    clearRefreshCookie(res);
    return result;
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE, token, {
      ...refreshCookieOptions(),
      maxAge:
        tokenLifetimeSeconds(
          this.config.get<string>('JWT_REFRESH_EXPIRES', '7d'),
        ) * 1000,
    });
  }
}
