import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import * as ipaddr from 'ipaddr.js';
import { RATE_LIMIT, RatePolicy } from './rate-limit.decorator';
import { RateLimitService } from './rate-limit.service';

export function clientNetwork(ip: string) {
  try {
    const address = ipaddr.process(ip);
    if (address.kind() === 'ipv6')
      return address.toByteArray().slice(0, 8).join('.') + '/64';
    return address.toString();
  } catch {
    return 'unknown';
  }
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly limits: RateLimitService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    // Express trusts only the socket unless an explicit proxy allowlist is configured.
    const network = clientNetwork(
      req.ip || req.socket.remoteAddress || 'unknown',
    );
    const enforce = async (
      scope: string,
      identity: string,
      max: number,
      seconds: number,
    ) => {
      const result = await this.limits.check(scope, identity, max, seconds);
      if (!result.allowed) {
        res.setHeader('Retry-After', result.retryAfter);
        throw new HttpException(
          'Too many requests; please retry later',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    };
    await enforce(
      'api',
      network,
      this.config.get<number>('RATE_LIMIT_MAX', 120),
      60,
    );
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method))
      await enforce('writes', network, 30, 60);
    const policy = this.reflector.getAllAndOverride<RatePolicy>(RATE_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (policy) {
      await enforce(policy.scope, network, policy.limit, policy.seconds);
      const email: unknown = (req.body as Record<string, unknown> | undefined)
        ?.email;
      if (policy.account && typeof email === 'string' && email.length <= 254) {
        await enforce('login-account', email.trim().toLowerCase(), 20, 900);
      }
    }
    return true;
  }
}
