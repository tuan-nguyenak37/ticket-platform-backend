import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
} from 'typeorm';
import { ResaleListing } from './resale-listing.entity';
import { ResaleOrder } from './resale-order.entity';

export type ResalePayoutStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED';

@Entity('resale_payouts')
@Index('UQ_resale_payout_order', ['resaleOrderId'], { unique: true })
@Index('UQ_resale_payout_listing', ['listingId'], { unique: true })
export class ResalePayout {
  @PrimaryColumn({ name: 'payout_id', type: 'varchar', length: 40 })
  payoutId!: string;
  @Column({ name: 'resale_order_id', type: 'varchar', length: 40 })
  resaleOrderId!: string;
  @Column({ name: 'listing_id', type: 'varchar', length: 40 })
  listingId!: string;
  @Column({ name: 'gross_amount', type: 'bigint' })
  grossAmount!: string;
  @Column({ name: 'fee_basis_points', type: 'integer' })
  feeBasisPoints!: number;
  @Column({ name: 'fee_amount', type: 'bigint' })
  feeAmount!: string;
  @Column({ name: 'net_amount', type: 'bigint' })
  netAmount!: string;
  @Column({ name: 'bank_name', type: 'varchar', length: 100 })
  bankName!: string;
  @Column({ name: 'account_holder', type: 'varchar', length: 100 })
  accountHolder!: string;
  @Column({ name: 'account_number', type: 'varchar', length: 30 })
  accountNumber!: string;
  @Column({ type: 'varchar', length: 24, default: 'PENDING' })
  status!: ResalePayoutStatus;
  @Column({ type: 'varchar', length: 24, default: 'MOCK' })
  provider!: 'MOCK';
  @Column({
    name: 'provider_reference',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  providerReference!: string | null;
  @Column({ name: 'error_code', type: 'varchar', length: 40, nullable: true })
  errorCode!: string | null;
  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @OneToOne(() => ResaleListing, (listing) => listing.payout, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'listing_id' })
  listing!: ResaleListing;
  @OneToOne(() => ResaleOrder, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'resale_order_id' })
  order!: ResaleOrder;
}
