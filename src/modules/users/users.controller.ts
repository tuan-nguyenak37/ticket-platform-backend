import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
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
  Roles,
} from '../auth/authorization/access-policy';
import type { Principal } from '../auth/authorization/principal';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto, UserIdDto } from './dto/update-user-status.dto';
import { UserRole } from './enums/user-role.enum';
import { Audit } from '../auth/authorization/audit.interceptor';

@Controller('users')
@Roles(UserRole.ADMIN)
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
  @Audit('profile.update')
  @Header('Cache-Control', 'no-store')
  updateMe(@CurrentUser() actor: Principal, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(actor, dto);
  }

  @Patch('me/password')
  @Authenticated()
  @Audit('password.change')
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

  @Post()
  @Header('Cache-Control', 'no-store')
  @Audit('users.create')
  create(@CurrentUser() actor: Principal, @Body() dto: CreateUserDto) {
    return this.users.createForAdmin(actor, dto);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  @Audit('users.list')
  findAll(@CurrentUser() actor: Principal) {
    return this.users.findAll(actor);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @Audit('users.read')
  findOne(@CurrentUser() actor: Principal, @Param('id') id: string) {
    return this.users.findOne(actor, id);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Header('Cache-Control', 'no-store')
  @Audit('users.status.update')
  updateStatus(
    @CurrentUser() actor: Principal,
    @Param() params: UserIdDto,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.users.updateStatus(actor, params.id, dto);
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  @Audit('users.update')
  update(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(actor, id, dto);
  }

  @Patch(':id/role')
  @Roles(UserRole.ADMIN)
  @Header('Cache-Control', 'no-store')
  @Audit('users.role.update')
  updateRole(
    @CurrentUser() actor: Principal,
    @Param() params: UserIdDto,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.users.updateRole(actor, params.id, dto);
  }
}
