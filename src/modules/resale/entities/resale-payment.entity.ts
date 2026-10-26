import {
  Check,
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
} from 'typeorm';
import { ResaleOrder } from './resale-order.entity';

export enum ResalePaymentStatus {
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

@Entity('resale_payments')
@Check('CK_resale_payments_amount', '"amount" > 0')
export class ResalePayment {
  @PrimaryColumn({ name: 'payment_id', type: 'varchar', length: 40 })
  paymentId!: string;
  @Column({
    name: 'resale_order_id',
    type: 'varchar',
    length: 40,
    unique: true,
  })
  resaleOrderId!: string;
  @Column({ type: 'bigint' })
  amount!: string;
  @Column({
    type: 'enum',
    enum: ResalePaymentStatus,
    enumName: 'resale_payment_status_enum',
  })
  status!: ResalePaymentStatus;
  @Column({ name: 'processed_at', type: 'timestamptz' })
  processedAt!: Date;
  @OneToOne(() => ResaleOrder, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'resale_order_id' })
  order!: ResaleOrder;
}
