import * as Joi from 'joi';
import { tokenLifetimeSeconds } from './token-lifetime';

const tokenLifetime = Joi.string().custom((value: string, helpers) => {
  try {
    tokenLifetimeSeconds(value);
    return value;
  } catch {
    return helpers.error('any.invalid');
  }
});

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'provision')
    .default('development'),
  PORT: Joi.number().default(3000),
  EMAIL_ENABLED: Joi.boolean().default(false),
  EMAIL_REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .default('redis://127.0.0.1:6380/0'),
  EMAIL_QUEUE_PREFIX: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]{1,60}$/)
    .default('ticketverse'),
  EMAIL_RATE_PER_MINUTE: Joi.number().integer().min(1).max(60).default(10),
  EMAIL_GMAIL_USER: Joi.string().email().when('EMAIL_ENABLED', {
    is: true,
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  EMAIL_GMAIL_APP_PASSWORD: Joi.string().min(16).when('EMAIL_ENABLED', {
    is: true,
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  PAYMENT_MOCK_ENABLED: Joi.boolean().default(false),
  ORDERS_WORKER_ENABLED: Joi.boolean().default(false),
  ORDER_PAYMENT_TIMEOUT_MINUTES: Joi.number()
    .integer()
    .min(1)
    .max(60)
    .default(15),
  UPLOAD_DIR: Joi.string().trim().min(1).default('uploads'),
  UPLOAD_MAX_FILE_SIZE_MB: Joi.number().integer().min(1).max(50).default(10),
  TICKET_WORKER_ENABLED: Joi.boolean().default(false),
  TICKET_AUTO_APPROVE_ENABLED: Joi.boolean().default(false),
  TICKET_CODE_HMAC_SECRET: Joi.string().min(32).optional(),
  TICKET_PYTHON_PATH: Joi.string().trim().min(1).default('python'),
  TICKET_TESSERACT_PATH: Joi.string().trim().min(1).default('tesseract'),
  TICKET_SCANNER_SCRIPT: Joi.string()
    .trim()
    .min(1)
    .default('scripts/ticket-scanner/scan.py'),
  TICKET_SCAN_TIMEOUT_SECONDS: Joi.number()
    .integer()
    .min(30)
    .max(150)
    .default(120),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_SYNCHRONIZE: Joi.boolean().optional(),
  JWT_ACCESS_SECRET: Joi.string().required(),
  JWT_ACCESS_EXPIRES: tokenLifetime.default('15m'),
  JWT_REFRESH_SECRET: Joi.string()
    .invalid(Joi.ref('JWT_ACCESS_SECRET'))
    .required(),
  JWT_REFRESH_EXPIRES: tokenLifetime.default('7d'),
});
