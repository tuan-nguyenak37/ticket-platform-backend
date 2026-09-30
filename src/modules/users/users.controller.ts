import { Controller, Get, Post, Body, Patch, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UserRole } from './entities/enums/user-role.enum';
import {
  Authenticated,
  CurrentUser,
  Roles,
} from '../auth/authorization/access-policy';
import { Audit } from '../auth/authorization/audit.interceptor';
import type { Principal } from '../auth/authorization/principal';
import { clearRefreshCookie } from '../auth/refresh-cookie';

@Controller('users')
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @Authenticated()
  me(@CurrentUser() actor: Principal) {
    return this.usersService.getProfile(actor);
  }

  @Patch('me')
  @Authenticated()
  @Audit('profile.update')
  updateMe(@CurrentUser() actor: Principal, @Body() dto: UpdateUserDto) {
    return this.usersService.updateProfile(actor, dto);
  }

  @Patch('me/password')
  @Authenticated()
  @Audit('password.change')
  async changePassword(
    @CurrentUser() actor: Principal,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.usersService.changePassword(actor, dto);
    clearRefreshCookie(response);
    return result;
  }

  @Post()
  @Audit('users.create')
  create(@CurrentUser() actor: Principal, @Body() dto: CreateUserDto) {
    return this.usersService.createForAdmin(actor, dto);
  }

  @Get()
  findAll(@CurrentUser() actor: Principal) {
    return this.usersService.findAll(actor);
  }

  @Get(':id')
  findOne(@CurrentUser() actor: Principal, @Param('id') id: string) {
    return this.usersService.findOne(actor, id);
  }

  @Patch(':id')
  @Audit('users.update')
  update(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(actor, id, dto);
  }
}
