import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../users/entities/enums/user-role.enum';
import type { AuthorizedRequest } from './principal';

export const IS_PUBLIC = 'auth:public';
export const AUTHENTICATED = 'auth:authenticated';
export const REQUIRED_ROLES = 'auth:roles';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const Authenticated = () => SetMetadata(AUTHENTICATED, true);
export const Roles = (...roles: UserRole[]) =>
  SetMetadata(REQUIRED_ROLES, roles);
export type AccessPolicy =
  | { kind: 'public' | 'authenticated' | 'invalid' }
  | { kind: 'roles'; roles: UserRole[] };

export type PolicyTarget = Parameters<Reflector['get']>[1];
export function resolvePolicy(
  reflector: Reflector,
  handler: PolicyTarget,
  controller: PolicyTarget,
): AccessPolicy | undefined {
  for (const target of [handler, controller]) {
    const publicValue = reflector.get<unknown>(IS_PUBLIC, target);
    const authenticatedValue = reflector.get<unknown>(AUTHENTICATED, target);
    const roles = reflector.get<unknown>(REQUIRED_ROLES, target);
    const count = [publicValue, authenticatedValue, roles].filter(
      (value) => value !== undefined,
    ).length;
    if (!count) continue;
    if (count !== 1) return { kind: 'invalid' };
    if (publicValue === true) return { kind: 'public' };
    if (authenticatedValue === true) return { kind: 'authenticated' };
    if (
      Array.isArray(roles) &&
      roles.length &&
      roles.every((role) => Object.values(UserRole).includes(role as UserRole))
    ) {
      return { kind: 'roles', roles: roles as UserRole[] };
    }
    return { kind: 'invalid' };
  }
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const user = context.switchToHttp().getRequest<AuthorizedRequest>().user;
    if (!user) throw new UnauthorizedException();
    return user;
  },
);
