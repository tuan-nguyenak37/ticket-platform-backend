import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { TokenService } from './token.service';
import { IS_PUBLIC } from './public.decorator';
import { UsersService } from '../../users/users.service';
import { User } from '../../users/entities/user.entity';
import { UserStatus } from '../../users/entities/enums/user-status.enum';

export type AuthenticatedRequest = Request & { user: User };

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer\s+(\S+)$/i.exec(request.headers.authorization ?? '');
    if (!match) throw new UnauthorizedException('Thiếu access token');
    const payload = await this.tokens.verifyAccessToken(match[1]);
    const user = await this.users.findById(payload.user_id);
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.tokenVersion !== payload.tokenVersion
    ) {
      throw new UnauthorizedException('Phiên đăng nhập không còn hợp lệ');
    }
    request.user = user;
    return true;
  }
}
