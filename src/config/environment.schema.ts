import * as Joi from 'joi';
import {
  corsOrigins,
  defaultFrontendOrigins,
} from '../common/http/cors-origins';

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
  DB_HOST: Joi.string().trim().required(),
  DB_PORT: Joi.number().integer().min(1).max(65535).default(5432),
  DB_USERNAME: Joi.string().trim().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().trim().required(),
  DB_SYNCHRONIZE: Joi.boolean().valid(false).default(false),
});
