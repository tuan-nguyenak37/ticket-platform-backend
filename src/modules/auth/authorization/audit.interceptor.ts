import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { tap } from 'rxjs';
import { AuditService } from './audit.service';
import type { AuthorizedRequest } from './principal';

const AUDIT_ACTION = 'auth:audit-action';
export const Audit = (action: string) => SetMetadata(AUDIT_ACTION, action);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const action = this.reflector.get<string>(
      AUDIT_ACTION,
      context.getHandler(),
    );
    if (!action) return next.handle();
    const request = context.switchToHttp().getRequest<AuthorizedRequest>();
    const base = {
      requestId: request.requestId ?? randomUUID(),
      actorId: request.user?.user_id,
      action,
      targetId:
        typeof request.params.id === 'string'
          ? request.params.id
          : action === 'events.create'
            ? undefined
            : request.user?.user_id,
    };
    return next.handle().pipe(
      tap({
        next: (value: unknown) => {
          if (
            value &&
            typeof value === 'object' &&
            'success' in value &&
            value.success === true &&
            'data' in value
          ) {
            value = value.data;
          }
          const targetId =
            action === 'events.create' &&
            value &&
            typeof value === 'object' &&
            'event_id' in value &&
            typeof value.event_id === 'string'
              ? value.event_id
              : action === 'users.create' &&
                  value &&
                  typeof value === 'object' &&
                  'user_id' in value &&
                  typeof value.user_id === 'string'
                ? value.user_id
                : base.targetId;
          this.audit.record({ ...base, targetId, result: 'allowed' });
        },
        error: (error: unknown) =>
          this.audit.record({
            ...base,
            result: 'failed',
            statusCode:
              error instanceof HttpException ? error.getStatus() : 500,
          }),
      }),
    );
  }
}
