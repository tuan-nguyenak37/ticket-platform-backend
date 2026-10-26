import {
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
import { User } from '../../users/entities/user.entity';
import { ResaleListing } from './resale-listing.entity';

export enum ResaleOrderStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
}

@Entity('resale_orders')
@Check('CK_resale_orders_price', '"price" > 0')
@Check('CK_resale_orders_distinct_users', '"buyer_user_id" <> "seller_user_id"')
@Index('UQ_resale_orders_pending_listing', ['listingId'], {
  unique: true,
  where: '"status" = \'PENDING_PAYMENT\'',
})
@Index('IDX_resale_orders_buyer', ['buyerUserId', 'createdAt', 'resaleOrderId'])
export class ResaleOrder {
  @PrimaryColumn({ name: 'resale_order_id', type: 'varchar', length: 40 })
  resaleOrderId!: string;
  @Column({ name: 'listing_id', type: 'varchar', length: 40 })
  listingId!: string;
  @Column({ name: 'buyer_user_id', type: 'varchar', length: 40 })
  buyerUserId!: string;
  @Column({ name: 'seller_user_id', type: 'varchar', length: 40 })
  sellerUserId!: string;
  @Column({ type: 'bigint' })
  price!: string;
  @Column({
    type: 'enum',
    enum: ResaleOrderStatus,
    enumName: 'resale_order_status_enum',
    default: ResaleOrderStatus.PENDING_PAYMENT,
  })
  status!: ResaleOrderStatus;
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;
  @Column({
    name: 'cancel_reason',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  cancelReason!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
  @ManyToOne(() => ResaleListing, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'listing_id' })
  listing!: ResaleListing;
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyer_user_id' })
  buyer!: User;
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'seller_user_id' })
  seller!: User;
}
