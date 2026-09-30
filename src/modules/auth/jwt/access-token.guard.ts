import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { TokenService } from './token.service';
import { UsersService } from '../../users/users.service';
import { UserStatus } from '../../users/entities/enums/user-status.enum';
import { resolvePolicy } from '../authorization/access-policy';
import { AuditService } from '../authorization/audit.service';
import type { AuthorizedRequest } from '../authorization/principal';

export type AuthenticatedRequest = AuthorizedRequest;
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthorizedRequest>();
    try {
      const policy = resolvePolicy(
        this.reflector,
        context.getHandler(),
        context.getClass(),
      );
      if (!policy || policy.kind === 'invalid')
        throw new ForbiddenException(
          'Route chưa có chính sách truy cập hợp lệ',
        );
      if (policy.kind === 'public') return true;
      const match = /^Bearer\s+(\S+)$/i.exec(
        request.headers.authorization ?? '',
      );
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
      request.user = {
        user_id: user.user_id,
        role: user.role,
        status: user.status,
        tokenVersion: user.tokenVersion,
      };
      return true;
    } catch (error) {
      if (error instanceof HttpException)
        this.audit.record({
          requestId: request.requestId ?? randomUUID(),
          actorId: request.user?.user_id,
          action: 'authentication.denied',
          result: 'denied',
          statusCode: error.getStatus(),
        });
      throw error;
    }
  }
}
