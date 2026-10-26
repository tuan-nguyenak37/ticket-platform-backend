import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Showing } from '../../showings/entities/showing.entity';
import { TicketTypeStatus } from '../enums/ticket-type-status.enum';
import { TicketInventory } from './ticket-inventory.entity';

@Entity('ticket_types')
export class TicketType {
  @PrimaryColumn({ name: 'ticket_type_id', type: 'varchar', length: 40 })
  ticketTypeId!: string;

  @Column({ name: 'showing_id', type: 'varchar', length: 40 })
  showingId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'bigint' })
  price!: string;

  @Column({ name: 'sale_start_at', type: 'timestamptz', nullable: true })
  saleStartAt!: Date | null;

  @Column({ name: 'sale_end_at', type: 'timestamptz', nullable: true })
  saleEndAt!: Date | null;

  @Column({ name: 'max_per_order', type: 'integer', default: 4 })
  maxPerOrder!: number;

  @Column({ name: 'resale_allowed', type: 'boolean', default: false })
  resaleAllowed!: boolean;

  @Column({
    type: 'enum',
    enum: TicketTypeStatus,
    enumName: 'ticket_type_status_enum',
    default: TicketTypeStatus.DRAFT,
  })
  status!: TicketTypeStatus;

  @ManyToOne(() => Showing, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'showing_id' })
  showing!: Showing;

  @OneToOne(() => TicketInventory, (inventory) => inventory.ticketType)
  inventory!: TicketInventory;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
