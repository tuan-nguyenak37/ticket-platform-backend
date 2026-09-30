import { Controller, Post, Body, HttpCode, Req, Res } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/create-auth.dto';
import { LoginDto } from './dto/login-auth.dto';
import { Public } from './jwt/public.decorator';
import type { AuthenticatedRequest } from './jwt/access-token.guard';

// Tên cookie chứa refresh token
const REFRESH_COOKIE = 'refresh_token';

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
  @HttpCode(200)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.logout(request.user);
    res.clearCookie(REFRESH_COOKIE, this.refreshCookieOptions());
    return result;
  }

  private refreshCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth',
    };
  }

  private setRefreshCookie(res: Response, token: string) {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    res.cookie(REFRESH_COOKIE, token, {
      ...this.refreshCookieOptions(),
      maxAge: sevenDaysMs, // 7 ngày, đồng bộ với JWT_REFRESH_EXPIRES
    });
  }
}
