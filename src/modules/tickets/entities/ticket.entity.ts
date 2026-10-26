import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrderItem } from '../../orders/entities/order-item.entity';
import { TicketType } from '../../events/ticket-types/entities/ticket-type.entity';
import { User } from '../../users/entities/user.entity';
import { TicketCredential } from './ticket-credential.entity';
import { TicketOwnership } from './ticket-ownership.entity';

export enum TicketStatus {
  ACTIVE = 'ACTIVE',
  CANCELLED = 'CANCELLED',
}

@Entity('tickets')
@Index('UQ_tickets_item_number', ['orderItemId', 'ticketNumber'], {
  unique: true,
})
@Index('IDX_tickets_owner_issued', ['ownerUserId', 'issuedAt', 'ticketId'])
export class Ticket {
  @PrimaryColumn({ name: 'ticket_id', type: 'varchar', length: 40 })
  ticketId!: string;
  @Column({ name: 'order_item_id', type: 'varchar', length: 40 })
  orderItemId!: string;
  @Column({ name: 'ticket_type_id', type: 'varchar', length: 40 })
  ticketTypeId!: string;
  @Column({ name: 'owner_user_id', type: 'varchar', length: 40 })
  ownerUserId!: string;
  @Column({ name: 'ticket_number', type: 'integer' })
  ticketNumber!: number;
  @Column({
    type: 'enum',
    enum: TicketStatus,
    enumName: 'issued_ticket_status_enum',
    default: TicketStatus.ACTIVE,
  })
  status!: TicketStatus;
  @Column({ name: 'issued_at', type: 'timestamptz' })
  issuedAt!: Date;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
  @ManyToOne(() => OrderItem, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_item_id' })
  orderItem!: OrderItem;
  @ManyToOne(() => TicketType, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ticket_type_id' })
  ticketType!: TicketType;
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'owner_user_id' })
  owner!: User;
  @OneToMany(() => TicketCredential, (credential) => credential.ticket)
  credentials!: TicketCredential[];
  @OneToMany(() => TicketOwnership, (ownership) => ownership.ticket)
  ownerships!: TicketOwnership[];
}
