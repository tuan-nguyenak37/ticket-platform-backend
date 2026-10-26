import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organizer } from './organizer.entity';

@Entity('organizer_payout_accounts')
export class OrganizerPayoutAccount {
  @PrimaryColumn({ name: 'organizer_id', type: 'varchar', length: 40 })
  organizerId!: string;
  @OneToOne(() => Organizer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizer_id' })
  organizer!: Organizer;
  @Column({ name: 'bank_name', type: 'varchar', length: 100 })
  bankName!: string;
  @Column({ name: 'account_holder', type: 'varchar', length: 100 })
  accountHolder!: string;
  @Column({ name: 'account_number', type: 'varchar', length: 30 })
  accountNumber!: string;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
