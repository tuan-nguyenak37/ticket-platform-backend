import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { OrganizerMemberRole } from '../enums/organizer-member-role.enum';
import { Organizer } from './organizer.entity';

@Entity('organizer_members')
@Unique('UQ_organizer_member', ['organizerId', 'userId'])
@Index('IDX_organizer_members_user_id', ['userId'])
export class OrganizerMember {
  @PrimaryColumn({ name: 'member_id', type: 'varchar', length: 40 })
  memberId!: string;

  @Column({ name: 'organizer_id', type: 'varchar', length: 40 })
  organizerId!: string;

  @Column({ name: 'user_id', type: 'varchar', length: 40 })
  userId!: string;

  @Column({
    type: 'enum',
    enum: OrganizerMemberRole,
    enumName: 'organizer_member_role_enum',
  })
  role!: OrganizerMemberRole;

  @ManyToOne(() => Organizer, (organizer) => organizer.members, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'organizer_id' })
  organizer!: Organizer;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
