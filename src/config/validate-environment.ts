import type { ObjectSchema } from 'joi';

export function validateEnvironment(
  schema: ObjectSchema,
  environment: Record<string, unknown>,
): Record<string, unknown> {
  const result = schema.validate(environment, {
    allowUnknown: true,
    abortEarly: false,
  });
  if (result.error) {
    const fields = result.error.details.map((detail) => detail.path.join('.'));
    throw new Error(`Invalid environment configuration: ${fields.join(', ')}`);
  }
  return result.value as Record<string, unknown>;
}
