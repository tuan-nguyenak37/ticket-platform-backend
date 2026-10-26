import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryColumn,
} from 'typeorm';
import { TicketType } from '../../events/ticket-types/entities/ticket-type.entity';
import { Order } from './order.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryColumn({ name: 'order_item_id', type: 'varchar', length: 40 })
  orderItemId!: string;
  @Column({ name: 'order_id', type: 'varchar', length: 40, unique: true })
  orderId!: string;
  @Column({ name: 'ticket_type_id', type: 'varchar', length: 40 })
  ticketTypeId!: string;
  @Column({ name: 'ticket_type_name', type: 'varchar', length: 255 })
  ticketTypeName!: string;
  @Column({ type: 'integer' })
  quantity!: number;
  @Column({ name: 'unit_price', type: 'bigint' })
  unitPrice!: string;
  @ManyToOne(() => TicketType, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ticket_type_id' })
  ticketType!: TicketType;
  @OneToOne(() => Order, (order) => order.item, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'order_id' })
  order!: Order;
}
