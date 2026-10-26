import * as Joi from 'joi';
import { tokenLifetimeSeconds } from './token-lifetime';

const lifetime = Joi.string().custom((value: string, helpers) => {
  try {
    tokenLifetimeSeconds(value);
    return value;
  } catch {
    return helpers.error('any.invalid');
  }
});

export const authEnvironmentSchema = Joi.object({
  JWT_ACCESS_EXPIRES: lifetime.default('15m'),
  JWT_REFRESH_EXPIRES: lifetime.default('7d'),
  JWT_REFRESH_SECRET: Joi.string()
    .when('NODE_ENV', { is: 'production', then: Joi.string().min(32) })
    .invalid(Joi.ref('JWT_ACCESS_SECRET'))
    .required(),
  RATE_LIMIT_MAX: Joi.number().integer().min(1).max(10000).default(120),
  TRUST_PROXY: Joi.string().allow('').optional(),
});
