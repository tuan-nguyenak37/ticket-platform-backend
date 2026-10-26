import { Body, Controller, Get, Header, Patch, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RateLimit } from '../../common/security/rate-limit.decorator';
import { clearRefreshCookie } from '../auth/refresh-cookie';
import {
  BROWSER_REFRESH_COOKIE,
  BROWSER_SESSION_COOKIE,
  browserCookieOptions,
} from '../auth/browser-session';
import {
  Authenticated,
  CurrentUser,
} from '../auth/authorization/access-policy';
import type { Principal } from '../auth/authorization/principal';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @Authenticated()
  @Header('Cache-Control', 'no-store')
  getProfile(@CurrentUser() actor: Principal) {
    return this.users.getProfile(actor);
  }

  @Patch('me')
  @Authenticated()
  @Header('Cache-Control', 'no-store')
  updateMe(@CurrentUser() actor: Principal, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(actor, dto);
  }

  @Patch('me/password')
  @Authenticated()
  @RateLimit({ scope: 'password', limit: 5, seconds: 900 })
  @Header('Cache-Control', 'no-store')
  async changePassword(
    @CurrentUser() actor: Principal,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.users.changePassword(actor, dto);
    response.clearCookie(BROWSER_REFRESH_COOKIE, browserCookieOptions());
    response.clearCookie(BROWSER_SESSION_COOKIE, browserCookieOptions());
    clearRefreshCookie(response);
    return result;
  }
}
