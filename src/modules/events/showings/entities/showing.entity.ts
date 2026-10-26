import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Event } from '../../entities/event.entity';
import { TicketType } from '../../ticket-types/entities/ticket-type.entity';

@Entity('showings')
@Index('IDX_showings_event_start_id', ['eventId', 'startTime', 'showingId'])
export class Showing {
  @PrimaryColumn({ name: 'showing_id', type: 'varchar', length: 40 })
  showingId!: string;

  @Column({ name: 'event_id', type: 'varchar', length: 40 })
  eventId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'start_time', type: 'timestamptz' })
  startTime!: Date;

  @Column({ name: 'end_time', type: 'timestamptz' })
  endTime!: Date;

  @Column({ name: 'venue_name', type: 'varchar', length: 255 })
  venueName!: string;

  @Column({ type: 'text' })
  address!: string;

  @Column({ type: 'varchar', length: 150 })
  city!: string;

  @ManyToOne(() => Event, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'event_id' })
  event!: Event;

  @OneToMany(() => TicketType, (ticketType) => ticketType.showing)
  ticketTypes!: TicketType[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
