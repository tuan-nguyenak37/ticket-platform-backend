import {
  BeforeInsert,
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
import { generateId } from '../../../common/utils/generateId';
import { User } from '../../users/entities/user.entity';
import { EventCategory } from './event-category.entity';
import { EventStatus } from './enums/event-status.enum';

@Entity('events')
@Check('"endTime" > "startTime"')
@Index(['status', 'startTime'])
export class Event {
  @PrimaryColumn({
    type: 'varchar',
    length: 40,
  })
  event_id!: string;

  @Column({
    type: 'varchar',
    length: 255,
  })
  name!: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  shortDescription!: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  description!: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  thumbnailUrl!: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  bannerUrl!: string | null;

  @Column({
    type: 'timestamptz',
  })
  startTime!: Date;

  @Column({
    type: 'timestamptz',
  })
  endTime!: Date;

  @Column({
    type: 'varchar',
    length: 255,
  })
  venueName!: string;

  @Column({
    type: 'varchar',
    length: 500,
  })
  address!: string;

  @Index()
  @Column({
    name: 'category_id',
    type: 'varchar',
    length: 40,
  })
  categoryId!: string;

  @ManyToOne(() => EventCategory, (category) => category.events, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'category_id', referencedColumnName: 'category_id' })
  category!: EventCategory;

  @Column({
    type: 'enum',
    enum: EventStatus,
    default: EventStatus.DRAFT,
  })
  status!: EventStatus;

  @Column({
    type: 'varchar',
    length: 40,
  })
  createdBy!: string;

  @ManyToOne(() => User, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'createdBy', referencedColumnName: 'user_id' })
  creator!: User;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt!: Date;

  @BeforeInsert()
  generateEventId() {
    if (!this.event_id) {
      this.event_id = generateId('event_');
    }
  }
}
