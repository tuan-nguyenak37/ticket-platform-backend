import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export type CheckoutKind = 'orders' | 'resale';
export type CheckoutState =
  | 'AWAITING_AUTH'
  | 'VERIFIED'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED';
export type Recipient = { name: string; email: string; phone: string };

@Entity('checkout_sessions')
@Index('IDX_checkout_order', ['userId', 'kind', 'orderId', 'createdAt'])
export class CheckoutSession {
  @PrimaryColumn({ name: 'session_id', type: 'varchar', length: 40 })
  sessionId!: string;
  @Column({ name: 'user_id', type: 'varchar', length: 40 }) userId!: string;
  @Column({ name: 'order_id', type: 'varchar', length: 40 }) orderId!: string;
  @Column({ type: 'varchar', length: 10 }) kind!: CheckoutKind;
  @Column({ type: 'varchar', length: 24 }) method!:
    'CARD' | 'WALLET' | 'BANK_TRANSFER';
  @Column({ type: 'varchar', length: 24 }) status!: CheckoutState;
  @Column({ type: 'bigint' }) amount!: string;
  @Column({ type: 'jsonb' }) recipient!: Recipient;
  @Column({ type: 'jsonb' }) instrument!: { label: string; last4: string };
  @Column({ type: 'jsonb' }) item!: {
    name: string;
    quantity: number;
    unitPrice: string;
  };
  @Column({ name: 'otp_digest', type: 'varchar', length: 64, select: false })
  otpDigest!: string;
  @Column({ type: 'integer', default: 0 }) attempts!: number;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;
  @Column({ name: 'payment_id', type: 'varchar', length: 40, nullable: true })
  paymentId!: string | null;
  @Column({ name: 'failure_code', type: 'varchar', length: 40, nullable: true })
  failureCode!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
