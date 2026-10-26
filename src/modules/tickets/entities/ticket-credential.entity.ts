import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Ticket } from './ticket.entity';

@Entity('ticket_credentials')
@Index('UQ_ticket_credentials_current', ['ticketId'], {
  unique: true,
  where: '"revoked_at" IS NULL',
})
export class TicketCredential {
  @PrimaryColumn({ name: 'credential_id', type: 'varchar', length: 40 })
  credentialId!: string;
  @Column({ name: 'ticket_id', type: 'varchar', length: 40 })
  ticketId!: string;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @ManyToOne(() => Ticket, (ticket) => ticket.credentials, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'ticket_id' })
  ticket!: Ticket;
}
