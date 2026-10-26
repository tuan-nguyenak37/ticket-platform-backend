import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { OrderStatus } from '../enums/order-status.enum';
import { OrderItem } from './order-item.entity';
import { TicketReservation } from './ticket-reservation.entity';

@Entity('orders')
@Index('UQ_orders_user_idempotency', ['userId', 'idempotencyKey'], {
  unique: true,
})
@Index('IDX_orders_user_created', ['userId', 'createdAt'])
export class Order {
  @PrimaryColumn({ name: 'order_id', type: 'varchar', length: 40 })
  orderId!: string;
  @Column({ name: 'user_id', type: 'varchar', length: 40 })
  userId!: string;
  @Column({ name: 'idempotency_key', type: 'varchar', length: 128 })
  idempotencyKey!: string;
  @Column({
    type: 'enum',
    enum: OrderStatus,
    enumName: 'order_status_enum',
    default: OrderStatus.PENDING_PAYMENT,
  })
  status!: OrderStatus;
  @Column({ name: 'total_amount', type: 'bigint' })
  totalAmount!: string;
  @Column({ name: 'discount_id', type: 'varchar', length: 40, nullable: true })
  discountId!: string | null;
  @Column({
    name: 'discount_code',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  discountCode!: string | null;
  @Column({ name: 'discount_amount', type: 'bigint', default: '0' })
  discountAmount!: string;
  @Column({
    name: 'registration_answers',
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  registrationAnswers!: { questionId: string; label: string; value: string }[];
  @Column({
    name: 'cancel_reason',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  cancelReason!: string | null;
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
  @OneToOne(() => OrderItem, (item) => item.order)
  item!: OrderItem;
  @OneToOne(() => TicketReservation, (reservation) => reservation.order)
  reservation!: TicketReservation;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
