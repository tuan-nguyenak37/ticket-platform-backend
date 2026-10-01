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
  UPLOAD_DIR: Joi.string().trim().min(1).default('uploads'),
  UPLOAD_MAX_FILE_SIZE_MB: Joi.number().integer().min(1).max(50).default(10),
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
