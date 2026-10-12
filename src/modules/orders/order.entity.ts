import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Ticket } from '../tickets/entities/ticket.entity';
import { User } from '../users/entities/user.entity';

export enum OrderStatus {
  PENDING = 'pending_payment',
  PAID = 'paid',
  DELIVERED = 'delivered',
  DISPUTED = 'disputed',
  COMPLETED = 'completed',
  REFUND_PENDING = 'refund_pending',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}
export enum PaymentStatus {
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUND_PENDING = 'refund_pending',
  REFUNDED = 'refunded',
}

@Entity('orders')
@Index('UQ_orders_buyer_key', ['buyerId', 'idempotencyKey'], { unique: true })
@Index('UQ_orders_ticket_winner', ['ticketId'], {
  unique: true,
  where: '"allocated" = true',
})
@Index(['buyerId', 'createdAt'])
@Index(['sellerId', 'createdAt'])
@Index(['status', 'expiresAt'])
@Check('"buyerId" <> "sellerId"')
@Check('"amount" > 0')
export class Order {
  @PrimaryColumn({ type: 'varchar', length: 40 }) order_id!: string;
  @Column({ type: 'varchar', length: 40 }) ticketId!: string;
  @ManyToOne(() => Ticket, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ticketId', referencedColumnName: 'ticket_id' })
  ticket!: Ticket;
  @Column({ type: 'varchar', length: 40 }) buyerId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyerId', referencedColumnName: 'user_id' })
  buyer!: User;
  @Column({ type: 'varchar', length: 40 }) sellerId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sellerId', referencedColumnName: 'user_id' })
  seller!: User;
  @Column({ type: 'varchar', length: 80 }) idempotencyKey!: string;
  @Column({ type: 'numeric', precision: 12, scale: 2 }) amount!: string;
  @Column({ type: 'varchar', length: 3, default: 'VND' }) currency!: string;
  @Column({ type: 'varchar', length: 24, default: OrderStatus.PENDING })
  status!: OrderStatus;
  // Retain allocation after refund: a disputed digital ticket must not be resold.
  @Column({ type: 'boolean', default: false }) allocated!: boolean;
  @Column({ type: 'jsonb' }) snapshot!: {
    eventName: string;
    ticketTier: string;
    seatInfo: string | null;
    eventEndTime: string;
  };
  @Column({ type: 'timestamptz' }) expiresAt!: Date;
  @Column({ type: 'timestamptz', nullable: true }) paidAt!: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) deliveredAt!: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) disputeUntil!: Date | null;
  @Column({ type: 'varchar', length: 80, nullable: true }) reason!:
    string | null;
  @Column({ type: 'varchar', length: 16, default: 'none' }) payoutStatus!:
    'none' | 'pending' | 'blocked' | 'ready' | 'paid';
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date;
}

@Entity('order_payments')
@Index('UQ_order_payments_order', ['orderId'], { unique: true })
export class OrderPayment {
  @PrimaryColumn({ type: 'varchar', length: 40 }) payment_id!: string;
  @Column({ type: 'varchar', length: 40 }) orderId!: string;
  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId', referencedColumnName: 'order_id' })
  order!: Order;
  @Column({ type: 'varchar', length: 16, default: 'mock' }) provider!: string;
  @Column({ type: 'numeric', precision: 12, scale: 2 }) amount!: string;
  @Column({ type: 'varchar', length: 3, default: 'VND' }) currency!: string;
  @Column({ type: 'varchar', length: 24, default: PaymentStatus.PENDING })
  status!: PaymentStatus;
  @Column({ type: 'varchar', length: 16, nullable: true }) receivedResult!:
    'success' | 'failed' | 'cancelled' | null;
  @Column({ type: 'timestamptz', nullable: true }) settledAt!: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}

@Entity('order_disputes')
@Index('UQ_order_disputes_order', ['orderId'], { unique: true })
export class OrderDispute {
  @PrimaryColumn({ type: 'varchar', length: 40 }) dispute_id!: string;
  @Column({ type: 'varchar', length: 40 }) orderId!: string;
  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId', referencedColumnName: 'order_id' })
  order!: Order;
  @Column({ type: 'text' }) reason!: string;
  @Column({ type: 'text' }) evidence!: string;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  attachments!: DisputeAttachment[];
  @Column({ type: 'text', nullable: true }) sellerResponse!: string | null;
  @Column({ type: 'varchar', length: 16, default: 'open' }) status!:
    'open' | 'accepted' | 'rejected';
  @Column({ type: 'varchar', length: 40, nullable: true }) resolvedBy!:
    string | null;
  @Column({ type: 'text', nullable: true }) resolution!: string | null;
  @Column({ type: 'timestamptz', nullable: true }) resolvedAt!: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}

export interface DisputeAttachment {
  id: string;
  uploadedBy: string;
  side: 'buyer' | 'seller';
  filename: string;
  mimetype: string;
  size: number;
  createdAt: string;
}
