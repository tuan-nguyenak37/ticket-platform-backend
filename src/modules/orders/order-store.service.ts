import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Order, OrderDispute, OrderPayment } from './order.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { Event } from '../events/entities/event.entity';
import type { Principal } from '../auth/authorization/principal';
import { UserRole } from '../users/entities/enums/user-role.enum';
import { OrderResponse } from './orders.dto';

export interface LockedOrder {
  manager: EntityManager;
  order: Order;
  ticket: Ticket;
  event: Event;
  now: Date;
}

@Injectable()
export class OrderStore {
  constructor(readonly db: DataSource) {}

  manager(actor: Principal, order?: Order) {
    if (![UserRole.ADMIN, UserRole.MODERATOR].includes(actor.role))
      throw new ForbiddenException();
    if (order && [order.buyerId, order.sellerId].includes(actor.user_id)) {
      throw new ForbiddenException('Cannot manage your own transaction');
    }
  }

  async locked<T>(
    id: string,
    work: (context: LockedOrder) => Promise<T>,
    actor?: Principal,
    scope: 'party' | 'buyer' | 'seller' = 'party',
  ) {
    return this.db.transaction('READ COMMITTED', async (manager) => {
      const where = actor
        ? scope === 'party'
          ? [
              { order_id: id, buyerId: actor.user_id },
              { order_id: id, sellerId: actor.user_id },
            ]
          : {
              order_id: id,
              [scope === 'buyer' ? 'buyerId' : 'sellerId']: actor.user_id,
            }
        : { order_id: id };
      const identity = await manager.findOne(Order, { where });
      if (!identity) throw new NotFoundException('Order not found');
      const identityTicket = await manager.findOneByOrFail(Ticket, {
        ticket_id: identity.ticketId,
      });
      // Every order mutation follows Event -> Ticket -> Order -> Payment/Dispute.
      const event = await manager.findOneOrFail(Event, {
        where: { event_id: identityTicket.eventId },
        lock: { mode: 'pessimistic_read' },
      });
      const ticket = await manager.findOneOrFail(Ticket, {
        where: { ticket_id: identity.ticketId },
        lock: { mode: 'pessimistic_write' },
      });
      const order = await manager.findOneOrFail(Order, {
        where: { order_id: id },
        lock: { mode: 'pessimistic_write' },
      });
      const rows: { now: Date }[] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      return work({
        manager,
        order,
        ticket,
        event,
        now: new Date(rows[0].now),
      });
    });
  }

  async response(manager: EntityManager, order: Order) {
    return OrderResponse.from(
      order,
      await manager.findOneBy(OrderPayment, { orderId: order.order_id }),
      await manager.findOneBy(OrderDispute, { orderId: order.order_id }),
    );
  }
}
