import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrganizerStatus } from '../enums/organizer-status.enum';
import { OrganizerMember } from './organizer-member.entity';

@Entity('organizers')
@Index('UQ_organizers_slug', ['slug'], { unique: true })
export class Organizer {
  @PrimaryColumn({ name: 'organizer_id', type: 'varchar', length: 40 })
  organizerId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255 })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl!: string | null;

  @Column({ name: 'cover_url', type: 'text', nullable: true })
  coverUrl!: string | null;

  @Column({ name: 'contact_email', type: 'varchar', length: 255 })
  contactEmail!: string;

  @Column({
    name: 'contact_phone',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  contactPhone!: string | null;

  @Column({
    type: 'enum',
    enum: OrganizerStatus,
    enumName: 'organizer_status_enum',
    default: OrganizerStatus.ACTIVE,
  })
  status!: OrganizerStatus;

  @OneToMany(() => OrganizerMember, (member) => member.organizer)
  members!: OrganizerMember[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
