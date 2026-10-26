import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryColumn,
} from 'typeorm';
import { TicketType } from '../../events/ticket-types/entities/ticket-type.entity';
import { ReservationStatus } from '../enums/reservation-status.enum';
import { Order } from './order.entity';

@Entity('ticket_reservations')
export class TicketReservation {
  @PrimaryColumn({ name: 'reservation_id', type: 'varchar', length: 40 })
  reservationId!: string;
  @Column({ name: 'order_id', type: 'varchar', length: 40, unique: true })
  orderId!: string;
  @Column({ name: 'ticket_type_id', type: 'varchar', length: 40 })
  ticketTypeId!: string;
  @Column({ type: 'integer' })
  quantity!: number;
  @Column({
    type: 'enum',
    enum: ReservationStatus,
    enumName: 'reservation_status_enum',
    default: ReservationStatus.ACTIVE,
  })
  status!: ReservationStatus;
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;
  @Column({ name: 'settled_at', type: 'timestamptz', nullable: true })
  settledAt!: Date | null;
  @OneToOne(() => Order, (order) => order.reservation, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'order_id' })
  order!: Order;
  @ManyToOne(() => TicketType, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ticket_type_id' })
  ticketType!: TicketType;
}
