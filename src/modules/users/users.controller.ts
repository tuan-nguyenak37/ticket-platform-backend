import { Controller, Get, Header } from '@nestjs/common';
import {
  Authenticated,
  CurrentUser,
} from '../auth/authorization/access-policy';
import type { Principal } from '../auth/authorization/principal';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @Authenticated()
  @Header('Cache-Control', 'no-store')
  getProfile(@CurrentUser() actor: Principal) {
    return this.users.getProfile(actor);
  }
}
