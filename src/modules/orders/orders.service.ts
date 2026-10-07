import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { OrderStore, LockedOrder } from './order-store.service';
import {
  Order,
  OrderDispute,
  OrderPayment,
  OrderStatus,
  PaymentStatus,
} from './order.entity';
import {
  CreateOrderDto,
  ListOrdersDto,
  OpenDisputeDto,
  OrderResponse,
  ResolveDisputeDto,
} from './orders.dto';
import { Ticket } from '../tickets/entities/ticket.entity';
import { TicketStatus } from '../tickets/entities/enums/ticket-status.enum';
import { Event } from '../events/entities/event.entity';
import { EventStatus } from '../events/entities/enums/event-status.enum';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/entities/enums/user-status.enum';
import type { Principal } from '../auth/authorization/principal';
import { generateId } from '../../common/utils/generateId';
import { UploadsService } from '../../common/uploads/uploads.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  constructor(
    private readonly store: OrderStore,
    private readonly config: ConfigService,
    private readonly uploads: UploadsService,
  ) {}

  async create(actor: Principal, dto: CreateOrderDto, key: string | undefined) {
    if (!key || !/^[A-Za-z0-9_-]{8,80}$/.test(key))
      throw new BadRequestException(
        'Idempotency-Key must contain 8-80 letters, digits, underscores or hyphens',
      );
    return this.store.db.transaction('READ COMMITTED', async (manager) => {
      const lock = createHash('sha256')
        .update(`orders:${actor.user_id}:${key}`)
        .digest();
      await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [
        lock.readInt32BE(0),
        lock.readInt32BE(4),
      ]);
      const existing = await manager.findOneBy(Order, {
        buyerId: actor.user_id,
        idempotencyKey: key,
      });
      if (existing) {
        if (existing.ticketId !== dto.ticketId)
          throw new ConflictException(
            'Idempotency-Key already used for another ticket',
          );
        return this.store.response(manager, existing);
      }
      const identity = await manager.findOneBy(Ticket, {
        ticket_id: dto.ticketId,
      });
      if (!identity) throw new NotFoundException('Ticket not found');
      const event = await manager.findOneOrFail(Event, {
        where: { event_id: identity.eventId },
        lock: { mode: 'pessimistic_read' },
      });
      const ticket = await manager.findOneOrFail(Ticket, {
        where: { ticket_id: dto.ticketId },
        lock: { mode: 'pessimistic_write' },
      });
      const rows: { now: Date }[] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(rows[0].now);
      if (ticket.sellerId === actor.user_id)
        throw new BadRequestException('Cannot buy your own ticket');
      if (
        ticket.status !== TicketStatus.AVAILABLE ||
        event.status !== EventStatus.PUBLISHED ||
        event.endTime <= now
      )
        throw new ConflictException('Ticket is not available');
      const seller = await manager.findOneBy(User, {
        user_id: ticket.sellerId,
        status: UserStatus.ACTIVE,
      });
      if (!seller) throw new ConflictException('Seller is not active');
      const order = manager.create(Order, {
        order_id: generateId('order'),
        ticketId: ticket.ticket_id,
        buyerId: actor.user_id,
        sellerId: ticket.sellerId,
        idempotencyKey: key,
        amount: String(ticket.price),
        currency: 'VND',
        status: OrderStatus.PENDING,
        allocated: false,
        payoutStatus: 'none',
        expiresAt: new Date(
          Math.min(
            event.endTime.getTime(),
            now.getTime() +
              this.config.get<number>('ORDER_PAYMENT_TIMEOUT_MINUTES', 15) *
                60000,
          ),
        ),
        snapshot: {
          eventName: event.name,
          ticketTier: ticket.ticketTier,
          seatInfo: ticket.seatInfo,
          eventEndTime: event.endTime.toISOString(),
        },
      });
      return this.store.response(manager, await manager.save(order));
    });
  }

  async list(actor: Principal, query: ListOrdersDto, manage = false) {
    if (manage) this.store.manager(actor);
    const builder = this.store.db.getRepository(Order).createQueryBuilder('o');
    if (!manage) {
      if (query.side)
        builder.where(
          `o.${query.side === 'buyer' ? 'buyerId' : 'sellerId'} = :id`,
          { id: actor.user_id },
        );
      else
        builder.where('(o.buyerId = :id OR o.sellerId = :id)', {
          id: actor.user_id,
        });
    }
    if (query.status)
      builder.andWhere('o.status = :status', { status: query.status });
    const [items, total] = await builder
      .orderBy('o.createdAt', 'DESC')
      .addOrderBy('o.order_id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return {
      items: items.map((o) => OrderResponse.from(o)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  detail(actor: Principal, id: string, manage = false) {
    if (manage) this.store.manager(actor);
    return this.store.locked(
      id,
      async (c) => {
        await this.reconcile(c);
        return this.store.response(c.manager, c.order);
      },
      manage ? undefined : actor,
    );
  }

  cancel(actor: Principal, id: string) {
    return this.store.locked(
      id,
      async (c) => {
        await this.reconcile(c);
        if (c.order.status === OrderStatus.CANCELLED)
          return this.store.response(c.manager, c.order);
        if (c.order.status !== OrderStatus.PENDING)
          throw new ConflictException('Only pending orders can be cancelled');
        c.order.status = OrderStatus.CANCELLED;
        c.order.reason = 'buyer_cancelled';
        await c.manager.save(c.order);
        return this.store.response(c.manager, c.order);
      },
      actor,
      'buyer',
    );
  }

  file(actor: Principal, id: string) {
    return this.store.locked(
      id,
      async (c) => {
        await this.reconcile(c);
        if (
          !c.order.allocated ||
          ![
            OrderStatus.PAID,
            OrderStatus.DELIVERED,
            OrderStatus.DISPUTED,
            OrderStatus.COMPLETED,
          ].includes(c.order.status)
        )
          throw new ConflictException('Ticket delivery is not available');
        const filename = new URL(
          c.ticket.ticketFileUrl,
          'http://local',
        ).searchParams.get('file');
        if (!filename) throw new NotFoundException('Ticket file not found');
        const file = await this.uploads.readTicketFile(filename);
        if (c.order.status === OrderStatus.PAID) {
          c.order.status = OrderStatus.DELIVERED;
          c.order.deliveredAt = c.now;
          await c.manager.save(c.order);
        }
        return file;
      },
      actor,
      'buyer',
    );
  }

  dispute(actor: Principal, id: string, dto: OpenDisputeDto) {
    return this.store.locked(
      id,
      async (c) => {
        await this.reconcile(c);
        if (
          ![OrderStatus.PAID, OrderStatus.DELIVERED].includes(c.order.status) ||
          !c.order.disputeUntil ||
          c.now >= c.order.disputeUntil
        )
          throw new ConflictException('Dispute window is closed');
        if (await c.manager.existsBy(OrderDispute, { orderId: id }))
          throw new ConflictException(
            'A dispute already exists for this order',
          );
        await c.manager.save(
          OrderDispute,
          c.manager.create(OrderDispute, {
            dispute_id: generateId('dispute'),
            orderId: id,
            reason: dto.reason,
            evidence: dto.evidence,
            status: 'open',
          }),
        );
        c.order.status = OrderStatus.DISPUTED;
        c.order.payoutStatus = 'blocked';
        await c.manager.save(c.order);
        return this.store.response(c.manager, c.order);
      },
      actor,
      'buyer',
    );
  }

  reply(actor: Principal, id: string, response: string) {
    return this.store.locked(
      id,
      async (c) => {
        const dispute = await c.manager.findOneBy(OrderDispute, {
          orderId: id,
        });
        if (
          !dispute ||
          dispute.status !== 'open' ||
          c.order.status !== OrderStatus.DISPUTED
        )
          throw new ConflictException('No open dispute');
        if (dispute.sellerResponse) {
          if (dispute.sellerResponse !== response)
            throw new ConflictException('Seller response already submitted');
        } else {
          dispute.sellerResponse = response;
          await c.manager.save(dispute);
        }
        return this.store.response(c.manager, c.order);
      },
      actor,
      'seller',
    );
  }

  resolve(actor: Principal, id: string, dto: ResolveDisputeDto) {
    this.store.manager(actor);
    return this.store.locked(id, async (c) => {
      this.store.manager(actor, c.order);
      const dispute = await c.manager.findOneBy(OrderDispute, { orderId: id });
      if (
        !dispute ||
        dispute.status !== 'open' ||
        c.order.status !== OrderStatus.DISPUTED
      )
        throw new ConflictException('No open dispute');
      dispute.status = dto.decision === 'accept' ? 'accepted' : 'rejected';
      dispute.resolvedBy = actor.user_id;
      dispute.resolution = dto.note;
      dispute.resolvedAt = c.now;
      if (dto.decision === 'accept') {
        c.order.status = OrderStatus.REFUND_PENDING;
        c.order.reason = 'dispute_accepted';
        await c.manager.update(
          OrderPayment,
          { orderId: id },
          { status: PaymentStatus.REFUND_PENDING },
        );
      } else {
        c.order.status = c.order.deliveredAt
          ? OrderStatus.DELIVERED
          : OrderStatus.PAID;
        c.order.payoutStatus = 'pending';
      }
      await c.manager.save(dispute);
      await c.manager.save(c.order);
      await this.reconcile(c);
      return this.store.response(c.manager, c.order);
    });
  }

  async reconcile(c: LockedOrder) {
    const { order, event, ticket, manager, now } = c;
    if (order.status === OrderStatus.PENDING) {
      if (order.expiresAt <= now || event.endTime <= now) {
        order.status = OrderStatus.EXPIRED;
        order.reason = 'payment_timeout';
      } else if (
        event.status !== EventStatus.PUBLISHED ||
        ticket.status !== TicketStatus.AVAILABLE
      ) {
        order.status = OrderStatus.CANCELLED;
        order.reason = 'ticket_unavailable';
      } else return;
      await manager.save(order);
    } else if (
      [OrderStatus.PAID, OrderStatus.DELIVERED].includes(order.status)
    ) {
      if (event.status === EventStatus.CANCELLED) {
        order.status = OrderStatus.REFUND_PENDING;
        order.reason = 'event_cancelled';
        order.payoutStatus = 'blocked';
        await manager.update(
          OrderPayment,
          { orderId: order.order_id },
          { status: PaymentStatus.REFUND_PENDING },
        );
      } else {
        const deadline = new Date(
          Math.max(
            order.disputeUntil?.getTime() ?? 0,
            event.endTime.getTime() + 86400000,
          ),
        );
        order.disputeUntil = deadline;
        if (order.status === OrderStatus.DELIVERED && now >= deadline) {
          order.status = OrderStatus.COMPLETED;
          order.payoutStatus = 'ready';
        }
      }
      await manager.save(order);
    }
  }

  async sweep() {
    const orders = await this.store.db
      .getRepository(Order)
      .createQueryBuilder('o')
      .where('o.status IN (:...states)', {
        states: [OrderStatus.PENDING, OrderStatus.PAID, OrderStatus.DELIVERED],
      })
      .orderBy('o.updatedAt', 'ASC')
      .addOrderBy('o.order_id', 'ASC')
      .take(100)
      .getMany();
    for (const order of orders) {
      try {
        await this.store.locked(order.order_id, async (c) => {
          const previous = c.order.status;
          await this.reconcile(c);
          // Rotate the batch even when the order is not yet due.
          await c.manager.update(Order, c.order.order_id, { updatedAt: c.now });
          if (previous !== c.order.status)
            this.logger.log(
              JSON.stringify({
                action: 'orders.reconcile',
                targetId: c.order.order_id,
                status: c.order.status,
              }),
            );
        });
      } catch {
        this.logger.error(
          JSON.stringify({
            action: 'orders.reconcile',
            targetId: order.order_id,
            result: 'failed',
          }),
        );
      }
    }
  }
}
