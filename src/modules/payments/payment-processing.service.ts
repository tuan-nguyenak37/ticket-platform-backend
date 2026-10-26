import { BadGatewayException, Injectable } from '@nestjs/common';
import { PaymentGateway, type ChargeRequest } from './payment-gateway';
import type { PaymentMethod } from './payment-method';
import { ConfigService } from '@nestjs/config';
import { VnpayClient, type VnpayProof } from './vnpay.client';

@Injectable()
export class PaymentProcessingService {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly config: ConfigService,
    private readonly vnpay: VnpayClient,
  ) {}

  process(
    reference: string,
    amount: string,
    method?: PaymentMethod,
    proof?: VnpayProof,
  ) {
    const request: ChargeRequest = {
      reference,
      amount,
      currency: 'VND',
      method,
    };
    if (amount === '0')
      return { ...this.gateway.charge(request), provider: 'FREE' };
    if (
      proof ||
      this.config.get<string>('PAYMENT_PROVIDER', 'VNPAY') === 'VNPAY'
    ) {
      if (!proof)
        throw new BadGatewayException('Payment requires a verified VNPay IPN');
      return {
        ...request,
        transactionId: this.vnpay.confirmed(proof, reference, amount),
        status: 'SUCCEEDED' as const,
        provider: 'VNPAY',
      };
    }
    if (this.config.get<string>('NODE_ENV') === 'production')
      throw new BadGatewayException(
        'Project payment processing is unavailable in production',
      );
    const result = this.gateway.charge(request);
    if (
      result.status !== 'SUCCEEDED' ||
      result.reference !== reference ||
      result.amount !== amount ||
      result.currency !== request.currency ||
      result.method !== request.method ||
      !/^[a-zA-Z0-9_-]{1,40}$/.test(result.transactionId)
    ) {
      throw new BadGatewayException('Payment was not confirmed');
    }
    return result;
  }
}
