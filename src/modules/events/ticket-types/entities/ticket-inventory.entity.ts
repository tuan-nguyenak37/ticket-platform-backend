import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { TicketType } from './ticket-type.entity';

@Entity('ticket_inventories')
export class TicketInventory {
  @PrimaryColumn({ name: 'ticket_type_id', type: 'varchar', length: 40 })
  ticketTypeId!: string;

  @Column({ name: 'total_quantity', type: 'integer' })
  totalQuantity!: number;

  @Column({ name: 'reserved_quantity', type: 'integer', default: 0 })
  reservedQuantity!: number;

  @Column({ name: 'sold_quantity', type: 'integer', default: 0 })
  soldQuantity!: number;

  @OneToOne(() => TicketType, (ticketType) => ticketType.inventory, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'ticket_type_id' })
  ticketType!: TicketType;
}
