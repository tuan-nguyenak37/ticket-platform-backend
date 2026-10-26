import { BadRequestException, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import { UsersController } from '../../users/users.controller';
import { UserRole } from '../../users/enums/user-role.enum';
import { UserStatus } from '../../users/enums/user-status.enum';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService, type AuditEvent } from './audit.service';
import type { AuthorizedRequest } from './principal';

describe('Administrative audit logging', () => {
  const audit = { record: jest.fn() };
  const interceptor = new AuditInterceptor(
    new Reflector(),
    audit as unknown as AuditService,
  );
  function context(handler: unknown, targetId?: string) {
    const request = {
      requestId: 'request_example',
      params: targetId ? { id: targetId } : {},
      user: {
        user_id: 'admin_example',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        sessionId: 'private-session',
      },
      headers: { authorization: 'Bearer private-access-token' },
      cookies: { ticketverse_refresh: 'private-refresh-token' },
      body: { password: 'private-password', reason: 'private-free-text' },
    } as unknown as AuthorizedRequest;
    return {
      getHandler: () => handler,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => jest.clearAllMocks());

  it('records the created user ID without serializing request or response secrets', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(context(UsersController.prototype.create), {
        handle: () =>
          of({
            success: true,
            data: { user_id: 'created_example', password_hash: 'private-hash' },
          }),
      }),
    );
    expect(result).toHaveProperty('data.user_id', 'created_example');
    expect(audit.record).toHaveBeenCalledWith({
      requestId: 'request_example',
      actorId: 'admin_example',
      action: 'users.create',
      targetId: 'created_example',
      result: 'allowed',
    });
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('private-');
  });

  it('records the target and status code without logging exception text', async () => {
    await expect(
      lastValueFrom(
        interceptor.intercept(
          context(UsersController.prototype.updateStatus, 'user_target'),
          {
            handle: () =>
              throwError(() => new BadRequestException('private-error')),
          },
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(audit.record).toHaveBeenCalledWith({
      requestId: 'request_example',
      actorId: 'admin_example',
      action: 'users.status.update',
      targetId: 'user_target',
      result: 'failed',
      statusCode: 400,
    });
  });

  it('allowlists logger fields even when the caller supplies extra values', () => {
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    try {
      new AuditService().record({
        requestId: 'request_example',
        action: 'users.read',
        result: 'allowed',
        password: 'private-password',
        refreshToken: 'private-refresh-token',
      } as AuditEvent);
      expect(JSON.stringify(log.mock.calls)).not.toContain('private-');
      expect(log).toHaveBeenCalledWith(expect.stringContaining('users.read'));
    } finally {
      log.mockRestore();
    }
  });
});
