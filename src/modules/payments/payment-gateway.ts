import type { PaymentMethod } from './payment-method';

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
