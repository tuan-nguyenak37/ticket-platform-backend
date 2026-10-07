import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStore } from './order-store.service';
import { OrdersService } from './orders.service';
import { OrderPayment, OrderStatus, PaymentStatus } from './order.entity';
import { TicketStatus } from '../tickets/entities/enums/ticket-status.enum';
import { EventStatus } from '../events/entities/enums/event-status.enum';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/entities/enums/user-status.enum';
import type { Principal } from '../auth/authorization/principal';
import { generateId } from '../../common/utils/generateId';

@Injectable()
export class OrderPaymentsService {
  constructor(
    private readonly store: OrderStore,
    private readonly orders: OrdersService,
    private readonly config: ConfigService,
  ) {}

  requireMock() {
    if (
      !['development', 'test'].includes(
        this.config.get<string>('NODE_ENV', 'production'),
      ) ||
      this.config.get<boolean>('PAYMENT_MOCK_ENABLED', false) !== true
    ) {
      throw new NotFoundException('Mock payments are disabled');
    }
  }

  start(actor: Principal, id: string) {
    this.requireMock();
    return this.store.locked(
      id,
      async (c) => {
        const existing = await c.manager.findOneBy(OrderPayment, {
          orderId: id,
        });
        if (existing) return this.store.response(c.manager, c.order);
        await this.orders.reconcile(c);
        if (c.order.status !== OrderStatus.PENDING)
          throw new ConflictException('Order cannot be paid');
        await c.manager.save(
          OrderPayment,
          c.manager.create(OrderPayment, {
            payment_id: generateId('payment'),
            orderId: id,
            provider: 'mock',
            amount: c.order.amount,
            currency: c.order.currency,
            status: PaymentStatus.PENDING,
          }),
        );
        return this.store.response(c.manager, c.order);
      },
      actor,
      'buyer',
    );
  }

  // Only the development simulator calls this today. A real adapter must verify
  // signature, reference, amount and currency before invoking settlement logic.
  result(
    actor: Principal,
    id: string,
    result: 'success' | 'failed' | 'cancelled',
  ) {
    this.requireMock();
    return this.store.locked(
      id,
      async (c) => {
        const payment = await c.manager.findOneBy(OrderPayment, {
          orderId: id,
        });
        if (!payment || payment.provider !== 'mock')
          throw new NotFoundException('Mock payment not found');
        if (payment.receivedResult) {
          if (payment.receivedResult !== result)
            throw new ConflictException(
              'Payment already has a different result',
            );
          return this.store.response(c.manager, c.order);
        }
        payment.receivedResult = result;
        payment.settledAt = c.now;
        await this.orders.reconcile(c);
        if (result !== 'success') {
          payment.status =
            result === 'failed'
              ? PaymentStatus.FAILED
              : PaymentStatus.CANCELLED;
          if (c.order.status === OrderStatus.PENDING) {
            c.order.status = OrderStatus.CANCELLED;
            c.order.reason = `payment_${result}`;
          }
        } else {
          const activeUsers = await c.manager.countBy(User, [
            { user_id: c.order.buyerId, status: UserStatus.ACTIVE },
            { user_id: c.order.sellerId, status: UserStatus.ACTIVE },
          ]);
          const rows: { now: Date }[] = await c.manager.query(
            'SELECT clock_timestamp() AS now',
          );
          const now = new Date(rows[0].now);
          const eligible =
            c.order.status === OrderStatus.PENDING &&
            c.order.expiresAt > now &&
            c.ticket.status === TicketStatus.AVAILABLE &&
            c.event.status === EventStatus.PUBLISHED &&
            c.event.endTime > now &&
            activeUsers === 2;
          if (eligible) {
            c.ticket.status = TicketStatus.SOLD;
            c.ticket.buyerId = c.order.buyerId;
            c.ticket.soldAt = now;
            await c.manager.save(c.ticket);
            c.order.status = OrderStatus.PAID;
            c.order.allocated = true;
            c.order.paidAt = now;
            c.order.disputeUntil = new Date(
              c.event.endTime.getTime() + 86400000,
            );
            c.order.payoutStatus = 'pending';
            payment.status = PaymentStatus.SUCCEEDED;
          } else {
            c.order.status = OrderStatus.REFUND_PENDING;
            c.order.reason = c.order.reason ?? 'ticket_unavailable';
            payment.status = PaymentStatus.REFUND_PENDING;
          }
        }
        await c.manager.save(payment);
        await c.manager.save(c.order);
        return this.store.response(c.manager, c.order);
      },
      actor,
      'buyer',
    );
  }

  refund(actor: Principal, id: string) {
    this.requireMock();
    this.store.manager(actor);
    return this.store.locked(id, async (c) => {
      this.store.manager(actor, c.order);
      if (c.order.status === OrderStatus.REFUNDED)
        return this.store.response(c.manager, c.order);
      const payment = await c.manager.findOneBy(OrderPayment, { orderId: id });
      if (
        c.order.status !== OrderStatus.REFUND_PENDING ||
        !payment ||
        payment.provider !== 'mock' ||
        payment.status !== PaymentStatus.REFUND_PENDING
      )
        throw new ConflictException('No mock refund is pending');
      payment.status = PaymentStatus.REFUNDED;
      c.order.status = OrderStatus.REFUNDED;
      c.order.payoutStatus = 'none';
      await c.manager.save(payment);
      await c.manager.save(c.order);
      return this.store.response(c.manager, c.order);
    });
  }

  payout(actor: Principal, id: string) {
    this.requireMock();
    this.store.manager(actor);
    return this.store.locked(id, async (c) => {
      this.store.manager(actor, c.order);
      await this.orders.reconcile(c);
      const payment = await c.manager.findOneBy(OrderPayment, { orderId: id });
      if (
        !payment ||
        payment.provider !== 'mock' ||
        payment.status !== PaymentStatus.SUCCEEDED ||
        c.order.status !== OrderStatus.COMPLETED ||
        c.event.status !== EventStatus.PUBLISHED ||
        !c.order.disputeUntil ||
        c.now < c.order.disputeUntil ||
        c.now < new Date(c.event.endTime.getTime() + 86400000)
      )
        throw new ConflictException('Order is not eligible for payout');
      if (!['ready', 'paid'].includes(c.order.payoutStatus))
        throw new ConflictException('Payout is blocked');
      c.order.payoutStatus = 'paid';
      await c.manager.save(c.order);
      return this.store.response(c.manager, c.order);
    });
  }
}
