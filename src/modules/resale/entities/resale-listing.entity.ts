import {
  Check,
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
import { Ticket } from '../../tickets/entities/ticket.entity';
import { User } from '../../users/entities/user.entity';
import { ResalePayout } from './resale-payout.entity';

export enum ResaleListingStatus {
  AVAILABLE = 'AVAILABLE',
  RESERVED = 'RESERVED',
  SOLD = 'SOLD',
  CANCELLED = 'CANCELLED',
}

@Entity('resale_listings')
@Check('CK_resale_listings_price', '"price" > 0')
@Index('UQ_resale_listings_active_ticket', ['ticketId'], {
  unique: true,
  where: "\"status\" IN ('AVAILABLE', 'RESERVED')",
})
@Index('IDX_resale_listings_status_created', [
  'status',
  'createdAt',
  'listingId',
])
@Index('IDX_resale_listings_seller', ['sellerUserId', 'createdAt', 'listingId'])
export class ResaleListing {
  @PrimaryColumn({ name: 'listing_id', type: 'varchar', length: 40 })
  listingId!: string;
  @Column({ name: 'ticket_id', type: 'varchar', length: 40 })
  ticketId!: string;
  @Column({ name: 'seller_user_id', type: 'varchar', length: 40 })
  sellerUserId!: string;
  @Column({ type: 'bigint' })
  price!: string;
  @Column({ name: 'bank_name', type: 'varchar', length: 100, nullable: true })
  bankName!: string | null;
  @Column({
    name: 'account_holder',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  accountHolder!: string | null;
  @Column({
    name: 'account_number',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  accountNumber!: string | null;
  @Column({ name: 'fee_basis_points', type: 'integer', nullable: true })
  feeBasisPoints!: number | null;
  @Column({ name: 'fee_amount', type: 'bigint', nullable: true })
  feeAmount!: string | null;
  @Column({ name: 'net_amount', type: 'bigint', nullable: true })
  netAmount!: string | null;
  @OneToOne(() => ResalePayout, (payout) => payout.listing)
  payout!: ResalePayout | null;
  @Column({
    type: 'enum',
    enum: ResaleListingStatus,
    enumName: 'resale_listing_status_enum',
    default: ResaleListingStatus.AVAILABLE,
  })
  status!: ResaleListingStatus;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
  @ManyToOne(() => Ticket, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ticket_id' })
  ticket!: Ticket;
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'seller_user_id' })
  seller!: User;
}
