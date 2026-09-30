import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { resolvePolicy } from './access-policy';
import { AuditService } from './audit.service';
import type { AuthorizedRequest } from './principal';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}
  canActivate(context: ExecutionContext): boolean {
    const policy = resolvePolicy(
      this.reflector,
      context.getHandler(),
      context.getClass(),
    );
    const request = context.switchToHttp().getRequest<AuthorizedRequest>();
    if (policy?.kind === 'public') return true;
    if (
      request.user &&
      (policy?.kind === 'authenticated' ||
        (policy?.kind === 'roles' && policy.roles.includes(request.user.role)))
    )
      return true;
    this.audit.record({
      requestId: request.requestId ?? randomUUID(),
      actorId: request.user?.user_id,
      action: 'authorization.denied',
      result: 'denied',
      statusCode: 403,
      targetId:
        typeof request.params.id === 'string' ? request.params.id : undefined,
    });
    throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
  }
}
