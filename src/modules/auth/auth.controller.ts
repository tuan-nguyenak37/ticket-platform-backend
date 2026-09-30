import { Controller, Post, Body, HttpCode, Req, Res } from '@nestjs/common';
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
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  create(@Body() dto: RegisterDto) {
    return this.authService.create(dto);
  }

  @Public()
  @Post('login')
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
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    res.cookie(REFRESH_COOKIE, token, {
      ...refreshCookieOptions(),
      maxAge: sevenDaysMs, // 7 ngày, đồng bộ với JWT_REFRESH_EXPIRES
    });
  }
}
