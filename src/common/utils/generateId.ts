import { randomBytes } from 'crypto';

export function generateId(prefix: string): string {
  const random = randomBytes(12).toString('base64url');

  return `${prefix}_${random}`;
}
