import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';
import { generateId } from '../../../common/utils/generateId';

@Entity('Users')
export class User {
  @PrimaryColumn({
    type: 'varchar',
    length: 40,
  })
  user_id!: string;

  @Column({
    type: 'varchar',
    length: 255,
    unique: true,
  })
  email!: string;

  @Column({
    type: 'varchar',
    length: 20,
    unique: true,
    nullable: true,
  })
  phone!: string | null;

  @Column({
    type: 'varchar',
    length: 255,
  })
  password!: string;

  @Column({ type: 'int', default: 0 })
  tokenVersion!: number;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  fullName!: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  avatarUrl!: string | null;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role!: UserRole;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status!: UserStatus;

  @Column({
    type: 'boolean',
    default: false,
  })
  emailVerified!: boolean;

  @Column({
    type: 'boolean',
    default: false,
  })
  phoneVerified!: boolean;

  @Column({
    type: 'boolean',
    default: false,
  })
  identityVerified!: boolean;

  @Column({
    type: 'int',
    default: 0,
  })
  reputationScore!: number;

  @Column({
    type: 'int',
    default: 0,
  })
  successfulSales!: number;

  @Column({
    type: 'int',
    default: 0,
  })
  successfulBuys!: number;

  @Column({
    type: 'int',
    default: 0,
  })
  disputeCount!: number;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  lastLoginAt!: Date | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt!: Date;

  @BeforeInsert()
  generateUserId() {
    if (!this.user_id) {
      this.user_id = generateId('user_');
    }
  }
}
