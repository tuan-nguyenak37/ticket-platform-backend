import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { ResaleOrder } from './resale-order.entity';

import type {
  ResaleEmailDetails,
  ResaleEmailKind,
} from '../../tickets/resale-email.types';
export type {
  ResaleEmailDetails,
  ResaleEmailKind,
} from '../../tickets/resale-email.types';

@Entity('resale_emails')
@Index('UQ_resale_email_order_kind', ['resaleOrderId', 'kind'], {
  unique: true,
})
export class ResaleEmail {
  @PrimaryColumn({ name: 'email_id', type: 'varchar', length: 40 })
  emailId!: string;
  @Column({ name: 'resale_order_id', type: 'varchar', length: 40 })
  resaleOrderId!: string;
  @Column({ type: 'varchar', length: 24 })
  kind!: ResaleEmailKind;
  @Column({ type: 'varchar', length: 255 })
  recipient!: string;
  @Column({ type: 'jsonb' })
  details!: ResaleEmailDetails;
  @Column({ type: 'varchar', length: 24, default: 'PENDING' })
  status!: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED';
  @Column({ type: 'integer', default: 0 })
  attempts!: number;
  @Column({
    name: 'next_attempt_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  nextAttemptAt!: Date;
  @Column({ name: 'lease_until', type: 'timestamptz', nullable: true })
  leaseUntil!: Date | null;
  @Column({ name: 'lease_token', type: 'varchar', length: 40, nullable: true })
  leaseToken!: string | null;
  @Column({ name: 'last_error', type: 'varchar', length: 40, nullable: true })
  lastError!: string | null;
  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @ManyToOne(() => ResaleOrder, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'resale_order_id' })
  order!: ResaleOrder;
}
