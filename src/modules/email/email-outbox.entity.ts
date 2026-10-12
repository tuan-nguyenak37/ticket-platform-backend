import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export type EmailKind =
  | 'ticket_approved'
  | 'ticket_rejected'
  | 'order_paid'
  | 'refund_pending'
  | 'refunded'
  | 'dispute_opened'
  | 'dispute_replied'
  | 'dispute_accepted'
  | 'dispute_rejected';

@Entity('email_outbox')
@Index('IDX_email_outbox_dispatch', ['status', 'nextDispatchAt'])
export class EmailOutbox {
  @PrimaryColumn({ type: 'varchar', length: 64 }) id!: string;
  @Column({ type: 'varchar', length: 40 }) recipientId!: string;
  @Column({ type: 'varchar', length: 254 }) recipient!: string;
  @Column({ type: 'varchar', length: 40 }) kind!: EmailKind;
  @Column({ type: 'varchar', length: 40 }) referenceId!: string;
  @Column({ type: 'text', nullable: true }) reason!: string | null;
  @Column({ type: 'boolean', default: false }) isMock!: boolean;
  @Column({ type: 'varchar', length: 16, default: 'pending' }) status!:
    'pending' | 'sent' | 'failed';
  @Column({ type: 'integer', default: 0 }) attempts!: number;
  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  nextDispatchAt!: Date;
  @Column({ type: 'timestamptz', nullable: true }) sentAt!: Date | null;
  @Column({ type: 'varchar', length: 40, nullable: true }) lastErrorCode!:
    string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
