import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organizer } from '../../organizers/entities/organizer.entity';
import { User } from '../../users/entities/user.entity';
import { EventCategory } from './event-category.entity';
import { EventStatus } from '../enums/event-status.enum';

@Entity('events')
@Index('UQ_events_slug', ['slug'], { unique: true })
@Index('IDX_events_status_created_at', ['status', 'createdAt'])
@Index('IDX_events_organizer_created_at', ['organizerId', 'createdAt'])
export class Event {
  @PrimaryColumn({ name: 'event_id', type: 'varchar', length: 40 })
  eventId!: string;

  @Column({ name: 'organizer_id', type: 'varchar', length: 40 })
  organizerId!: string;

  @Column({ name: 'category_id', type: 'varchar', length: 40 })
  categoryId!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 255 })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'poster_url', type: 'text', nullable: true })
  posterUrl!: string | null;

  @Column({
    type: 'enum',
    enum: EventStatus,
    enumName: 'event_status_enum',
    default: EventStatus.DRAFT,
  })
  status!: EventStatus;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ name: 'reviewed_by', type: 'varchar', length: 40, nullable: true })
  reviewedBy!: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @ManyToOne(() => Organizer, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organizer_id' })
  organizer!: Organizer;

  @ManyToOne(() => EventCategory, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category!: EventCategory;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reviewed_by' })
  reviewer!: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
