import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PAYMENT_METHODS, type PaymentMethod } from './payment-method';

export interface ChargeRequest {
  reference: string;
  amount: string;
  currency: 'VND';
  method?: PaymentMethod;
}

export interface ChargeResult extends ChargeRequest {
  transactionId: string;
  status: 'SUCCEEDED' | 'FAILED';
  provider: string;
}

export abstract class PaymentGateway {
  abstract charge(request: ChargeRequest): ChargeResult;
}

@Injectable()
export class ProjectPaymentGateway extends PaymentGateway {
  charge(request: ChargeRequest): ChargeResult {
    if (
      !/^(order|resale):[a-zA-Z0-9_-]{1,40}$/.test(request.reference) ||
      !/^(0|[1-9][0-9]*)$/.test(request.amount) ||
      BigInt(request.amount) > 9223372036854775807n ||
      request.currency !== 'VND' ||
      (request.method !== undefined &&
        !PAYMENT_METHODS.includes(request.method))
    ) {
      throw new BadRequestException('Invalid payment request');
    }
    const digest = createHash('sha256')
      .update(`${request.reference}:${request.amount}:${request.currency}`)
      .digest('hex')
      .slice(0, 32);
    return {
      ...request,
      transactionId: `prj_${digest}`,
      status: 'SUCCEEDED',
      provider: 'PROJECT',
    };
  }
}
