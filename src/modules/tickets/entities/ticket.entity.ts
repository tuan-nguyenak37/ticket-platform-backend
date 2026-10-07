import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { generateId } from '../../../common/utils/generateId';
import { Event } from '../../events/entities/event.entity';
import { User } from '../../users/entities/user.entity';
import { TicketStatus } from './enums/ticket-status.enum';
import { ReviewMethod } from '../review/check.types';

@Entity('tickets')
@Index(['eventId', 'status'])
@Index(['sellerId', 'status'])
@Index(['status'])
@Index('IDX_tickets_file_hash', ['fileHash'])
@Index('UQ_tickets_active_code', ['eventId', 'approvedCodeFingerprint'], {
  unique: true,
  where: `"approvedCodeFingerprint" IS NOT NULL AND "status" IN ('available', 'holding', 'sold')`,
})
export class Ticket {
  @PrimaryColumn({
    type: 'varchar',
    length: 40,
  })
  ticket_id!: string;

  @Column({
    name: 'event_id',
    type: 'varchar',
    length: 40,
  })
  eventId!: string;

  @ManyToOne(() => Event, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'event_id', referencedColumnName: 'event_id' })
  event!: Event;

  @Column({
    name: 'seller_id',
    type: 'varchar',
    length: 40,
  })
  sellerId!: string;

  @ManyToOne(() => User, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'seller_id', referencedColumnName: 'user_id' })
  seller!: User;

  @Column({
    type: 'varchar',
    length: 100,
  })
  ticketTier!: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  seatInfo!: string | null;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
  })
  originalPrice!: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
  })
  price!: number;

  @Column({
    type: 'text',
  })
  ticketFileUrl!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  fileHash!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  approvedCodeFingerprint!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  reviewMethod!: ReviewMethod | null;

  @Column({
    type: 'enum',
    enum: TicketStatus,
    default: TicketStatus.PENDING_REVIEW,
  })
  status!: TicketStatus;

  @Column({
    name: 'verified_by',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  verifiedBy!: string | null;

  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'verified_by', referencedColumnName: 'user_id' })
  verifier!: User | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  verifiedAt!: Date | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  rejectionReason!: string | null;

  @Column({
    name: 'buyer_id',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  buyerId!: string | null;

  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'buyer_id', referencedColumnName: 'user_id' })
  buyer!: User | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  soldAt!: Date | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  description!: string | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt!: Date;

  @BeforeInsert()
  generateTicketId() {
    if (!this.ticket_id) {
      this.ticket_id = generateId('ticket');
    }
  }
}
