import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT = 'security:rate-limit';
export interface RatePolicy {
  scope: string;
  limit: number;
  seconds: number;
  account?: boolean;
}
export const RateLimit = (policy: RatePolicy) =>
  SetMetadata(RATE_LIMIT, policy);
