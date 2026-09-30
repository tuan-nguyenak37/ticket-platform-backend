import { Injectable, Logger } from '@nestjs/common';

export interface AuditEvent {
  requestId: string;
  actorId?: string;
  action: string;
  targetId?: string;
  result: 'allowed' | 'denied' | 'failed';
  statusCode?: number;
}
@Injectable()
export class AuditService {
  private readonly logger = new Logger('AuthorizationAudit');
  record(event: AuditEvent) {
    // Explicit allowlist: callers cannot accidentally serialize headers/body/user entities.
    this.logger.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        requestId: event.requestId,
        actorId: event.actorId ?? null,
        action: event.action,
        targetId: event.targetId ?? null,
        result: event.result,
        statusCode: event.statusCode,
      }),
    );
  }
}
