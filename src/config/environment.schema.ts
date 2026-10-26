import * as Joi from 'joi';
import {
  corsOrigins,
  defaultFrontendOrigins,
} from '../common/http/cors-origins';
import { securityEnvironmentSchema } from './redis/redis.schema';
import { authEnvironmentSchema } from './auth.schema';

export const environmentSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'provision')
    .default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(7000),
  FRONTEND_URL: Joi.string()
    .custom((value: string, helpers) => {
      try {
        corsOrigins(value);
        return value;
      } catch {
        return helpers.error('any.invalid');
      }
    })
    .default(defaultFrontendOrigins),
  PAYMENT_PROVIDER: Joi.string()
    .valid('VNPAY', 'PROJECT')
    .default('VNPAY')
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.valid(Joi.override, 'VNPAY'),
    }),
  VNPAY_TMN_CODE: Joi.string().trim().allow('').optional(),
  VNPAY_HASH_SECRET: Joi.string().allow('').optional(),
  VNPAY_QUERY_IP: Joi.string().ip().default('127.0.0.1'),
  VNPAY_RETURN_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .allow('')
    .optional(),
  VNPAY_FRONTEND_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://localhost:3000'),
  TICKET_QR_SECRET: Joi.string()
    .min(32)
    .invalid(Joi.ref('JWT_ACCESS_SECRET'), Joi.ref('JWT_REFRESH_SECRET'))
    .required(),
  RESALE_SETTLEMENT_WORKER_ENABLED: Joi.boolean().default(true),
  TICKET_EMAIL_ENABLED: Joi.boolean().default(false),
  SMTP_HOST: Joi.when('TICKET_EMAIL_ENABLED', {
    is: true,
    then: Joi.string().required(),
    otherwise: Joi.string().optional(),
  }),
  SMTP_PORT: Joi.number().integer().min(1).max(65535).default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASS: Joi.when('SMTP_USER', {
    is: Joi.string().min(1).required(),
    then: Joi.string().required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  SMTP_FROM: Joi.when('TICKET_EMAIL_ENABLED', {
    is: true,
    then: Joi.string().email().required(),
    otherwise: Joi.string().email().optional(),
  }),
  DB_HOST: Joi.string().trim().required(),
  DB_PORT: Joi.number().integer().min(1).max(65535).default(5432),
  DB_USERNAME: Joi.string().trim().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().trim().required(),
  DB_SYNCHRONIZE: Joi.boolean().valid(false).default(false),
  UPLOAD_DIR: Joi.string().trim().min(1).default('uploads'),
  UPLOAD_MAX_FILE_SIZE_MB: Joi.number().integer().min(1).max(50).default(10),
})
  .concat(securityEnvironmentSchema)
  .concat(authEnvironmentSchema);
