import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryColumn,
} from 'typeorm';
import { Ticket } from './ticket.entity';
import { User } from '../../users/entities/user.entity';
import { ReviewMethod } from '../review/check.types';
import type { CheckReport } from '../review/check.types';

@Entity('ticket_reviews')
export class TicketReview {
  @PrimaryColumn({ name: 'ticket_id', type: 'varchar', length: 40 })
  ticketId!: string;

  @OneToOne(() => Ticket, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ticket_id', referencedColumnName: 'ticket_id' })
  ticket!: Ticket;

  @Column({ type: 'varchar', length: 10 })
  decision!: 'approve' | 'reject';

  @Column({ type: 'varchar', length: 10 })
  method!: ReviewMethod;

  @Column({ type: 'varchar', length: 40, nullable: true })
  actorId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actorId', referencedColumnName: 'user_id' })
  actor!: User | null;

  @Column({ type: 'integer', nullable: true })
  checkVersion!: number | null;

  @Column({ type: 'uuid', nullable: true })
  selectedCodeId!: string | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  report!: CheckReport | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
