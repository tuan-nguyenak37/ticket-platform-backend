import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Ticket } from './ticket.entity';
import { CheckOutcome, CheckStatus } from '../review/check.types';
import type { ScanResult } from '../review/check.types';

@Entity('ticket_checks')
@Index('IDX_ticket_checks_queue', ['status', 'nextAttemptAt'])
export class TicketCheck {
  @PrimaryColumn({ name: 'ticket_id', type: 'varchar', length: 40 })
  ticketId!: string;

  @OneToOne(() => Ticket, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id', referencedColumnName: 'ticket_id' })
  ticket!: Ticket;

  @Column({ type: 'varchar', length: 20, default: CheckStatus.QUEUED })
  status!: CheckStatus;

  @Column({ type: 'varchar', length: 20, nullable: true })
  outcome!: CheckOutcome | null;

  @Column({ type: 'integer', default: 1 })
  version!: number;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({ type: 'uuid', nullable: true })
  leaseToken!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  leaseUntil!: Date | null;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  nextAttemptAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  errorCode!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  scan!: ScanResult | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
