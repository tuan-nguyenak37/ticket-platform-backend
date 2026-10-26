import * as Joi from 'joi';
import { redisConnectionOptions } from './redis.config';

export const securityEnvironmentSchema = Joi.object({
  SECURITY_REDIS_URL: Joi.string()
    .custom((value: string, helpers) => {
      try {
        redisConnectionOptions(value);
        return value;
      } catch {
        return helpers.error('any.invalid');
      }
    })
    .default('redis://127.0.0.1:6379/1'),
  SECURITY_REDIS_PREFIX: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]{1,60}$/)
    .default('ticketverse-security'),
  JWT_ACCESS_SECRET: Joi.string()
    .when('NODE_ENV', { is: 'production', then: Joi.string().min(32) })
    .required(),
});
