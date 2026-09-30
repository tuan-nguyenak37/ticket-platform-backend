import { ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Authenticated, Public, Roles, resolvePolicy } from './access-policy';
import { RolesGuard } from './roles.guard';
import { AuditService } from './audit.service';
import { UserRole } from '../../users/entities/enums/user-role.enum';
import { UserStatus } from '../../users/entities/enums/user-status.enum';
import { assertUserAdministrator } from './users.policy';
import { publicUser } from '../../../common/utils/public-user';
import { User } from '../../users/entities/user.entity';

@Roles(UserRole.ADMIN)
class PolicyFixture {
  @Authenticated() self() {}
  @Public() publicRoute() {}
  @Roles(UserRole.USER, UserRole.MODERATOR) members() {}
  @Authenticated() @Public() conflict() {}
  @Roles() emptyRoles() {}
  inherited() {}
}

describe('Authorization policy', () => {
  const reflector = new Reflector();
  const audit = new AuditService();
  const guard = new RolesGuard(reflector, audit);
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());
  const principal = {
    user_id: 'user_a',
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    tokenVersion: 1,
  };

  function context(
    handler: keyof PolicyFixture,
    role = UserRole.USER,
  ): ExecutionContext {
    return {
      getHandler: () => PolicyFixture.prototype[handler],
      getClass: () => PolicyFixture,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { ...principal, role },
          params: {},
          requestId: 'request-1',
        }),
      }),
    } as unknown as ExecutionContext;
  }
  it('method policies override controller policy', () => {
    expect(
      resolvePolicy(reflector, PolicyFixture.prototype.self, PolicyFixture),
    ).toEqual({ kind: 'authenticated' });
    expect(
      resolvePolicy(
        reflector,
        PolicyFixture.prototype.publicRoute,
        PolicyFixture,
      ),
    ).toEqual({ kind: 'public' });
    expect(guard.canActivate(context('self'))).toBe(true);
    expect(() => guard.canActivate(context('inherited'))).toThrow(
      ForbiddenException,
    );
  });
  it('allows any listed role without implicit admin bypass', () => {
    expect(guard.canActivate(context('members', UserRole.MODERATOR))).toBe(
      true,
    );
    expect(guard.canActivate(context('members', UserRole.USER))).toBe(true);
    expect(() => guard.canActivate(context('members', UserRole.ADMIN))).toThrow(
      ForbiddenException,
    );
  });
  it.each(['conflict', 'emptyRoles'] as const)(
    'denies invalid metadata: %s',
    (name) => {
      expect(
        resolvePolicy(reflector, PolicyFixture.prototype[name], PolicyFixture)
          ?.kind,
      ).toBe('invalid');
      expect(() => guard.canActivate(context(name))).toThrow(
        ForbiddenException,
      );
    },
  );
  it('defaults to deny on an unannotated route', () => {
    class NoPolicy {
      route() {}
    }
    expect(
      resolvePolicy(reflector, NoPolicy.prototype.route, NoPolicy),
    ).toBeUndefined();
    const ctx = {
      ...context('self'),
      getHandler: () => NoPolicy.prototype.route,
      getClass: () => NoPolicy,
    } as ExecutionContext;
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
  it('enforces administrator policy at the service boundary', () => {
    expect(() => assertUserAdministrator(principal)).toThrow(
      ForbiddenException,
    );
    expect(() =>
      assertUserAdministrator({ ...principal, role: UserRole.MODERATOR }),
    ).toThrow(ForbiddenException);
  });
  it('audit allowlist excludes credentials even when passed extra fields', () => {
    const event = {
      requestId: 'r',
      actorId: 'a',
      action: 'password.change',
      result: 'allowed' as const,
      password: 'secret-password',
      token: 'secret-jwt',
      cookie: 'secret-cookie',
    };
    audit.record(event);
    const calls = (Logger.prototype.log as jest.Mock).mock.calls as unknown[][];
    const log = String(calls.at(-1)?.[0]);
    expect(log).toContain('"requestId":"r"');
    for (const value of ['secret-password', 'secret-jwt', 'secret-cookie'])
      expect(log).not.toContain(value);
  });
  it('response allowlist omits future private fields', () => {
    const user = Object.assign(new User(), {
      user_id: 'a',
      password: 'hash',
      tokenVersion: 1,
      futureSecret: 'private',
    });
    expect(publicUser(user)).not.toHaveProperty('password');
    expect(publicUser(user)).not.toHaveProperty('tokenVersion');
    expect(publicUser(user)).not.toHaveProperty('futureSecret');
  });
});
