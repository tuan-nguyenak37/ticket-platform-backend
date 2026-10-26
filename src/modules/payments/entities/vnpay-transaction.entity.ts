import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { CheckoutKind, Recipient } from './checkout-session.entity';
import type { VnpayParams } from '../vnpay.client';

@Entity('vnpay_transactions')
@Index('IDX_vnpay_order', ['userId', 'kind', 'orderId', 'createdAt'])
export class VnpayTransaction {
  @PrimaryColumn({ name: 'txn_ref', type: 'varchar', length: 40 })
  txnRef!: string;
  @Column({ name: 'user_id', type: 'varchar', length: 40 }) userId!: string;
  @Column({ name: 'order_id', type: 'varchar', length: 40 }) orderId!: string;
  @Column({ type: 'varchar', length: 10 }) kind!: CheckoutKind;
  @Column({ type: 'bigint' }) amount!: string;
  @Column({ type: 'jsonb' }) recipient!: Recipient;
  @Column({ type: 'varchar', length: 24 }) status!:
    'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REVIEW';
  @Column({ name: 'payment_url', type: 'text', select: false })
  paymentUrl!: string;
  @Column({
    name: 'provider_result',
    type: 'jsonb',
    nullable: true,
    select: false,
  })
  providerResult!: VnpayParams | null;
  @Column({ name: 'payment_id', type: 'varchar', length: 40, nullable: true })
  paymentId!: string | null;
  @Column({ name: 'failure_code', type: 'varchar', length: 40, nullable: true })
  failureCode!: string | null;
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
}
