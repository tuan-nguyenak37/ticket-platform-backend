import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Ticket } from './ticket.entity';

@Entity('ticket_ownerships')
@Index('IDX_ticket_ownerships_history', ['ticketId', 'createdAt'])
export class TicketOwnership {
  @PrimaryColumn({ name: 'ownership_id', type: 'varchar', length: 40 })
  ownershipId!: string;
  @Column({ name: 'ticket_id', type: 'varchar', length: 40 })
  ticketId!: string;
  @Column({ name: 'from_user_id', type: 'varchar', length: 40, nullable: true })
  fromUserId!: string | null;
  @Column({ name: 'to_user_id', type: 'varchar', length: 40 })
  toUserId!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @ManyToOne(() => Ticket, (ticket) => ticket.ownerships, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'ticket_id' })
  ticket!: Ticket;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'from_user_id' })
  fromUser!: User | null;
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'to_user_id' })
  toUser!: User;
}
