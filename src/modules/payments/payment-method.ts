import { BadRequestException } from '@nestjs/common';

export const PAYMENT_METHODS = ['BANK_TRANSFER', 'CARD', 'WALLET'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function parsePaymentMethod(body: unknown): PaymentMethod | undefined {
  if (body === undefined) return undefined;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Invalid payment request');
  }
  if (Object.keys(body).some((key) => key !== 'method')) {
    throw new BadRequestException('Only payment method may be supplied');
  }
  const method = (body as { method?: unknown }).method;
  if (!('method' in body)) return undefined;
  if (!PAYMENT_METHODS.includes(method as PaymentMethod)) {
    throw new BadRequestException('Unsupported payment method');
  }
  return method as PaymentMethod;
}
