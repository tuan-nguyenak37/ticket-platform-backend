import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { EventReviewAction } from '../enums/event-review-action.enum';
import { Event } from './event.entity';

@Entity('event_review_logs')
@Index('IDX_event_review_logs_event_created_at', ['eventId', 'createdAt'])
export class EventReviewLog {
  @PrimaryColumn({ name: 'review_id', type: 'varchar', length: 40 })
  reviewId!: string;

  @Column({ name: 'event_id', type: 'varchar', length: 40 })
  eventId!: string;

  @Column({ name: 'moderator_id', type: 'varchar', length: 40 })
  moderatorId!: string;

  @Column({
    type: 'enum',
    enum: EventReviewAction,
    enumName: 'event_review_action_enum',
  })
  action!: EventReviewAction;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @ManyToOne(() => Event, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'event_id' })
  event!: Event;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'moderator_id' })
  moderator!: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
