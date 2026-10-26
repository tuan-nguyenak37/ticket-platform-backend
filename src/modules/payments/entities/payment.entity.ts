import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { Order } from '../../orders/entities/order.entity';

export enum PaymentStatus {
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

@Entity('payments')
export class Payment {
  @PrimaryColumn({ name: 'payment_id', type: 'varchar', length: 40 })
  paymentId!: string;
  @Column({ name: 'order_id', type: 'varchar', length: 40, unique: true })
  orderId!: string;
  @Column({
    type: 'enum',
    enum: PaymentStatus,
    enumName: 'payment_status_enum',
  })
  status!: PaymentStatus;
  @Column({ type: 'bigint' })
  amount!: string;
  @Column({ name: 'processed_at', type: 'timestamptz' })
  processedAt!: Date;
  @OneToOne(() => Order, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;
}
