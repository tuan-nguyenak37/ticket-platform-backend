import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { generateId } from '../../common/utils/generateId';
import type { Principal } from '../auth/authorization/principal';
import { Event } from '../events/entities/event.entity';
import { discountAmount, registrationAnswers } from '../events/registration';
import { EventStatus } from '../events/enums/event-status.enum';
import { Showing } from '../events/showings/entities/showing.entity';
import { TicketInventory } from '../events/ticket-types/entities/ticket-inventory.entity';
import { TicketType } from '../events/ticket-types/entities/ticket-type.entity';
import { TicketTypeStatus } from '../events/ticket-types/enums/ticket-type-status.enum';
import { Organizer } from '../organizers/entities/organizer.entity';
import { OrganizerStatus } from '../organizers/enums/organizer-status.enum';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { PaymentProcessingService } from '../payments/payment-processing.service';
import type { PaymentMethod } from '../payments/payment-method';
import type { VnpayProof } from '../payments/vnpay.client';
import { TicketIssuanceService } from '../tickets/ticket-issuance.service';
import { TicketsService } from '../tickets/tickets.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderListDto } from './dto/order-query.dto';
import { OrderItem } from './entities/order-item.entity';
import { Order } from './entities/order.entity';
import { TicketReservation } from './entities/ticket-reservation.entity';
import { OrderStatus } from './enums/order-status.enum';
import { ReservationStatus } from './enums/reservation-status.enum';
import { recordNotification } from '../notifications/notifications.service';

const MAX_BIGINT = 9223372036854775807n;

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly dataSource: DataSource,
    private readonly issuance: TicketIssuanceService,
    private readonly tickets: TicketsService,
    private readonly paymentProcessing: PaymentProcessingService,
  ) {}

  async create(actor: Principal, key: string | undefined, dto: CreateOrderDto) {
    if (!key || !/^[a-zA-Z0-9_-]{1,128}$/.test(key))
      throw new BadRequestException(
        'Idempotency-Key must be 1-128 alphanumeric, underscore or hyphen characters',
      );
    const existing = await this.orders.findOne({
      where: { userId: actor.user_id, idempotencyKey: key },
      relations: { item: true, reservation: true },
    });
    if (existing) return this.sameRequest(existing, dto);
    try {
      const result = await this.dataSource.transaction(async (manager) => {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`${actor.user_id}:${key}`],
        );
        const priorOrder = await manager.getRepository(Order).findOne({
          where: { userId: actor.user_id, idempotencyKey: key },
          relations: { item: true, reservation: true },
        });
        if (priorOrder) return this.sameRequest(priorOrder, dto);
        const reference = await manager
          .getRepository(TicketType)
          .findOneBy({ ticketTypeId: dto.ticketTypeId });
        if (!reference) throw new NotFoundException('Ticket type not found');
        const showingReference = await manager
          .getRepository(Showing)
          .findOneBy({ showingId: reference.showingId });
        if (!showingReference) throw new NotFoundException('Showing not found');
        const eventReference = await manager
          .getRepository(Event)
          .findOneBy({ eventId: showingReference.eventId });
        if (!eventReference) throw new NotFoundException('Event not found');
        const organizer = await manager.getRepository(Organizer).findOne({
          where: { organizerId: eventReference.organizerId },
          lock: { mode: 'pessimistic_read' },
        });
        const event = await manager.getRepository(Event).findOne({
          where: { eventId: showingReference.eventId },
          lock: { mode: 'pessimistic_read' },
        });
        const showing = await manager.getRepository(Showing).findOne({
          where: { showingId: reference.showingId },
          lock: { mode: 'pessimistic_read' },
        });
        const ticketType = await manager.getRepository(TicketType).findOne({
          where: { ticketTypeId: dto.ticketTypeId },
          lock: { mode: 'pessimistic_read' },
        });
        if (
          !organizer ||
          !event ||
          !showing ||
          !ticketType ||
          event.organizerId !== organizer.organizerId ||
          showing.eventId !== event.eventId ||
          ticketType.showingId !== showing.showingId
        )
          throw new NotFoundException('Ticket type not found');
        const answers = registrationAnswers([], dto.answers);
        let discount:
          | {
              discount_id: string;
              kind: 'PERCENT' | 'FIXED';
              value: number;
              usage_limit: number;
              active: boolean;
              starts_at: Date;
              ends_at: Date;
            }
          | undefined;
        if (dto.discountCode) {
          [discount] = await manager.query(
            'SELECT * FROM event_discounts WHERE event_id = $1 AND code = $2 FOR UPDATE',
            [event.eventId, dto.discountCode],
          );
          if (!discount) throw new BadRequestException('Invalid discount code');
        }
        const inventory = await manager.getRepository(TicketInventory).findOne({
          where: { ticketTypeId: dto.ticketTypeId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!inventory)
          throw new ConflictException('Ticket inventory not found');
        if (dto.quantity > 20)
          throw new BadRequestException(
            'An order can contain at most 20 tickets',
          );
        await this.expireForType(manager, dto.ticketTypeId, showing.startTime);
        const currentTime = await this.dbTime(manager);
        if (
          organizer.status !== OrganizerStatus.ACTIVE ||
          event.status !== EventStatus.PUBLISHED ||
          ticketType.status !== TicketTypeStatus.ACTIVE ||
          !ticketType.saleStartAt ||
          !ticketType.saleEndAt ||
          currentTime < ticketType.saleStartAt ||
          currentTime >= ticketType.saleEndAt ||
          currentTime >= showing.startTime
        )
          throw new ConflictException(
            'Ticket type is not available for purchase',
          );
        if (dto.quantity > ticketType.maxPerOrder)
          throw new BadRequestException('Quantity exceeds maxPerOrder');
        const subtotal = BigInt(ticketType.price) * BigInt(dto.quantity);
        if (subtotal > MAX_BIGINT)
          throw new BadRequestException('Order amount exceeds supported range');
        let reduction = 0n;
        if (discount) {
          if (
            !discount.active ||
            currentTime < discount.starts_at ||
            currentTime >= discount.ends_at
          )
            throw new BadRequestException(
              'Discount code is inactive or outside its validity period',
            );
          const [{ used }] = await manager.query<{ used: number }[]>(
            `SELECT count(*)::int AS used FROM orders o
            LEFT JOIN ticket_reservations r ON r.order_id = o.order_id
            WHERE o.discount_id = $1 AND (o.status = 'PAID' OR (o.status = 'PENDING_PAYMENT' AND r.status = 'ACTIVE' AND r.expires_at > $2))`,
            [discount.discount_id, currentTime],
          );
          if (used >= discount.usage_limit)
            throw new ConflictException('Discount code usage limit reached');
          reduction = discountAmount(subtotal, discount.kind, discount.value);
        }
        const totalAmount = subtotal - reduction;
        const reserved = (await manager.query(
          `UPDATE ticket_inventories SET reserved_quantity = reserved_quantity + $2
           WHERE ticket_type_id = $1 AND total_quantity::bigint - reserved_quantity::bigint - sold_quantity::bigint >= $2::bigint
           RETURNING ticket_type_id`,
          [dto.ticketTypeId, dto.quantity],
        )) as [unknown[], number];
        if (reserved[1] !== 1)
          throw new ConflictException('Not enough tickets available');
        const expiresAt = new Date(
          Math.min(currentTime.getTime() + 600000, showing.startTime.getTime()),
        );
        const order = await manager.save(
          Order,
          manager.create(Order, {
            orderId: generateId('ord'),
            userId: actor.user_id,
            idempotencyKey: key,
            status: OrderStatus.PENDING_PAYMENT,
            totalAmount: totalAmount.toString(),
            discountId: discount?.discount_id ?? null,
            discountCode: dto.discountCode ?? null,
            discountAmount: reduction.toString(),
            registrationAnswers: answers,
            cancelReason: null,
          }),
        );
        const item = await manager.save(
          OrderItem,
          manager.create(OrderItem, {
            orderItemId: generateId('oi'),
            orderId: order.orderId,
            ticketTypeId: ticketType.ticketTypeId,
            ticketTypeName: ticketType.name,
            quantity: dto.quantity,
            unitPrice: ticketType.price,
          }),
        );
        const reservation = await manager.save(
          TicketReservation,
          manager.create(TicketReservation, {
            reservationId: generateId('res'),
            orderId: order.orderId,
            ticketTypeId: ticketType.ticketTypeId,
            quantity: dto.quantity,
            status: ReservationStatus.ACTIVE,
            expiresAt,
            settledAt: null,
          }),
        );
        return this.response(order, item, reservation);
      });
      return result;
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string; constraint?: string }).code ===
          '23505' &&
        (error.driverError as { constraint?: string }).constraint ===
          'UQ_orders_user_idempotency'
      ) {
        return this.dataSource.transaction(async (manager) => {
          const duplicate = await manager.getRepository(Order).findOne({
            where: { userId: actor.user_id, idempotencyKey: key },
            relations: { item: true, reservation: true },
          });
          if (!duplicate) throw error;
          return this.sameRequest(duplicate, dto);
        });
      }
      throw error;
    }
  }

  async checkout(
    actor: Principal,
    key: string | undefined,
    dto: CreateOrderDto,
  ) {
    const order = await this.create(actor, key, dto);
    return this.pay(actor, order.orderId);
  }

  async mine(actor: Principal, query: OrderListDto) {
    const [items, total] = await this.orders.findAndCount({
      where: { userId: actor.user_id },
      relations: { item: true, reservation: true },
      order: { createdAt: 'DESC', orderId: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return {
      items: items.map((order) =>
        this.response(order, order.item, order.reservation),
      ),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async findOne(actor: Principal, orderId: string) {
    const order = await this.orders.findOne({
      where: { orderId, userId: actor.user_id },
      relations: { item: true, reservation: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    const payment = await this.dataSource
      .getRepository(Payment)
      .findOneBy({ orderId });
    return {
      ...this.response(order, order.item, order.reservation),
      payment: payment ? this.paymentResponse(payment) : null,
    };
  }

  async cancel(actor: Principal, orderId: string) {
    const result = await this.withLockedOrder(
      actor,
      orderId,
      false,
      async (manager, order, item, reservation, showing) => {
        if (
          order.status !== OrderStatus.PENDING_PAYMENT ||
          reservation.status !== ReservationStatus.ACTIVE
        )
          return { conflict: 'Only pending orders can be cancelled' };
        const { currentTime, valid } = await this.reservationTime(
          manager,
          reservation.expiresAt,
          showing.startTime,
        );
        if (!valid) {
          await this.settle(
            manager,
            order,
            reservation,
            OrderStatus.EXPIRED,
            ReservationStatus.EXPIRED,
            currentTime,
          );
          return { conflict: 'Order has expired' };
        }
        await this.settle(
          manager,
          order,
          reservation,
          OrderStatus.CANCELLED,
          ReservationStatus.RELEASED,
          currentTime,
          'BUYER_CANCELLED',
        );
        return { data: this.response(order, item, reservation) };
      },
    );
    if ('conflict' in result) throw new ConflictException(result.conflict);
    return result.data;
  }

  async pay(
    actor: Principal,
    orderId: string,
    method?: PaymentMethod,
    proof?: VnpayProof,
  ) {
    const result = await this.withLockedOrder(
      actor,
      orderId,
      true,
      async (manager, order, item, reservation, showing, organizer) => {
        const prior = await manager
          .getRepository(Payment)
          .findOneBy({ orderId });
        if (prior) {
          if (prior.status !== PaymentStatus.SUCCEEDED)
            return { conflict: 'Order cannot be paid' };
          if (
            prior.amount !== order.totalAmount ||
            order.status !== OrderStatus.PAID
          )
            return { conflict: 'Payment history is inconsistent' };
          await this.issuance.inspect(manager, orderId);
          return {
            data: {
              order: this.response(order, item, reservation),
              payment: this.paymentResponse(prior),
            },
          };
        }
        if (
          order.status !== OrderStatus.PENDING_PAYMENT ||
          reservation.status !== ReservationStatus.ACTIVE
        )
          return { conflict: 'Order cannot be paid' };
        const { currentTime, valid } = await this.reservationTime(
          manager,
          reservation.expiresAt,
          showing.startTime,
        );
        if (!valid) {
          await this.settle(
            manager,
            order,
            reservation,
            OrderStatus.EXPIRED,
            ReservationStatus.EXPIRED,
            currentTime,
          );
          return { conflict: 'Order has expired' };
        }
        if (organizer?.status === OrganizerStatus.SUSPENDED) {
          await this.settle(
            manager,
            order,
            reservation,
            OrderStatus.CANCELLED,
            ReservationStatus.RELEASED,
            currentTime,
            'ORGANIZER_SUSPENDED',
          );
          return { conflict: 'Organizer is suspended' };
        }
        if (!organizer) throw new NotFoundException('Organizer not found');
        if (
          BigInt(item.unitPrice) * BigInt(item.quantity) -
            BigInt(order.discountAmount ?? '0') !==
          BigInt(order.totalAmount)
        )
          throw new ConflictException('Order amount does not match its item');
        const charge = this.paymentProcessing.process(
          `order:${orderId}`,
          order.totalAmount,
          method,
          proof,
        );
        await this.consume(manager, order, reservation, currentTime);
        const payment = await manager.save(
          Payment,
          manager.create(Payment, {
            paymentId: charge.transactionId,
            orderId,
            status: PaymentStatus.SUCCEEDED,
            amount: order.totalAmount,
            processedAt: currentTime,
          }),
        );
        await this.issuance.issue(manager, orderId);
        await recordNotification(manager, {
          userId: order.userId,
          kind: 'ORDER_PAID',
          sourceId: orderId,
          title: 'Mua vé thành công',
          body: `Đơn ${orderId} đã thanh toán thành công. Mở đơn hàng để xem vé của bạn.`,
          href: `/checkout/orders/${encodeURIComponent(orderId)}`,
        });
        return {
          notify: true,
          data: {
            order: this.response(order, item, reservation),
            payment: this.paymentResponse(payment),
          },
        };
      },
    );
    if ('conflict' in result) throw new ConflictException(result.conflict);
    if ('notify' in result && result.notify)
      await this.tickets.sendOrderAfterPayment(actor.user_id, orderId);
    return result.data;
  }

  private async withLockedOrder<T>(
    actor: Principal,
    orderId: string,
    checkOrganizer: boolean,
    operation: (
      manager: EntityManager,
      order: Order,
      item: OrderItem,
      reservation: TicketReservation,
      showing: Showing,
      organizer?: Organizer,
    ) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      const reference = await manager
        .getRepository(Order)
        .findOneBy({ orderId, userId: actor.user_id });
      if (!reference) throw new NotFoundException('Order not found');
      const item = await manager
        .getRepository(OrderItem)
        .findOneBy({ orderId });
      if (!item) throw new ConflictException('Order item not found');
      const ticketType = await manager
        .getRepository(TicketType)
        .findOneBy({ ticketTypeId: item.ticketTypeId });
      if (!ticketType) throw new ConflictException('Ticket type not found');
      const showingRef = await manager
        .getRepository(Showing)
        .findOneBy({ showingId: ticketType.showingId });
      if (!showingRef) throw new ConflictException('Showing not found');
      let organizer: Organizer | undefined;
      if (checkOrganizer) {
        const event = await manager
          .getRepository(Event)
          .findOneBy({ eventId: showingRef.eventId });
        if (!event) throw new ConflictException('Event not found');
        organizer =
          (await manager.getRepository(Organizer).findOne({
            where: { organizerId: event.organizerId },
            lock: { mode: 'pessimistic_read' },
          })) ?? undefined;
      }
      if (reference.discountId) {
        await manager.query(
          'SELECT discount_id FROM event_discounts WHERE discount_id = $1 FOR UPDATE',
          [reference.discountId],
        );
      }
      const showing = await manager.getRepository(Showing).findOne({
        where: { showingId: showingRef.showingId },
        lock: { mode: 'pessimistic_read' },
      });
      if (!showing) throw new ConflictException('Showing not found');
      const inventory = await manager.getRepository(TicketInventory).findOne({
        where: { ticketTypeId: item.ticketTypeId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!inventory) throw new ConflictException('Ticket inventory not found');
      const order = await manager
        .getRepository(Order)
        .findOne({ where: { orderId }, lock: { mode: 'pessimistic_write' } });
      const reservation = await manager
        .getRepository(TicketReservation)
        .findOne({ where: { orderId }, lock: { mode: 'pessimistic_write' } });
      if (
        !order ||
        !reservation ||
        order.userId !== actor.user_id ||
        reservation.ticketTypeId !== item.ticketTypeId ||
        reservation.quantity !== item.quantity
      )
        throw new ConflictException('Order reservation inconsistent');
      return operation(manager, order, item, reservation, showing, organizer);
    });
  }

  private async expireForType(
    manager: EntityManager,
    ticketTypeId: string,
    showingStart: Date,
  ) {
    const candidates = await manager
      .getRepository(TicketReservation)
      .createQueryBuilder('reservation')
      .where(
        'reservation.ticketTypeId = :ticketTypeId AND reservation.status = :active',
        {
          ticketTypeId,
          active: ReservationStatus.ACTIVE,
        },
      )
      .andWhere(
        '(reservation.expiresAt <= clock_timestamp() OR :showingStart <= clock_timestamp())',
        { showingStart },
      )
      .orderBy('reservation.orderId', 'ASC')
      .getMany();
    for (const candidate of candidates) {
      const order = await manager.getRepository(Order).findOne({
        where: { orderId: candidate.orderId },
        lock: { mode: 'pessimistic_write' },
      });
      const reservation = await manager
        .getRepository(TicketReservation)
        .findOne({
          where: { orderId: candidate.orderId },
          lock: { mode: 'pessimistic_write' },
        });
      if (
        !order ||
        !reservation ||
        order.status !== OrderStatus.PENDING_PAYMENT ||
        reservation.status !== ReservationStatus.ACTIVE
      )
        continue;
      const { currentTime, valid } = await this.reservationTime(
        manager,
        reservation.expiresAt,
        showingStart,
      );
      if (!valid)
        await this.settle(
          manager,
          order,
          reservation,
          OrderStatus.EXPIRED,
          ReservationStatus.EXPIRED,
          currentTime,
        );
    }
  }

  private async settle(
    manager: EntityManager,
    order: Order,
    reservation: TicketReservation,
    orderStatus: OrderStatus,
    reservationStatus: ReservationStatus,
    currentTime: Date,
    reason: string | null = null,
  ) {
    const updated = (await manager.query(
      `UPDATE ticket_inventories SET reserved_quantity = reserved_quantity - $2
      WHERE ticket_type_id = $1 AND reserved_quantity >= $2 RETURNING ticket_type_id`,
      [reservation.ticketTypeId, reservation.quantity],
    )) as [unknown[], number];
    if (updated[1] !== 1)
      throw new ConflictException('Inventory reservation mismatch');
    order.status = orderStatus;
    order.cancelReason = reason;
    await manager.save(Order, order);
    const changed = (await manager.query(
      `UPDATE ticket_reservations SET status = $2, settled_at = $3
      WHERE reservation_id = $1 AND status = 'ACTIVE' RETURNING reservation_id`,
      [reservation.reservationId, reservationStatus, currentTime],
    )) as [unknown[], number];
    if (changed[1] !== 1)
      throw new ConflictException('Reservation was already processed');
    reservation.status = reservationStatus;
    reservation.settledAt = currentTime;
  }

  private async consume(
    manager: EntityManager,
    order: Order,
    reservation: TicketReservation,
    currentTime: Date,
  ) {
    const updated = (await manager.query(
      `UPDATE ticket_inventories SET reserved_quantity = reserved_quantity - $2, sold_quantity = sold_quantity + $2
      WHERE ticket_type_id = $1 AND reserved_quantity >= $2 RETURNING ticket_type_id`,
      [reservation.ticketTypeId, reservation.quantity],
    )) as [unknown[], number];
    if (updated[1] !== 1)
      throw new ConflictException('Inventory reservation mismatch');
    order.status = OrderStatus.PAID;
    await manager.save(Order, order);
    const changed = (await manager.query(
      `UPDATE ticket_reservations SET status = 'CONSUMED', settled_at = $2
      WHERE reservation_id = $1 AND status = 'ACTIVE' RETURNING reservation_id`,
      [reservation.reservationId, currentTime],
    )) as [unknown[], number];
    if (changed[1] !== 1)
      throw new ConflictException('Reservation was already processed');
    reservation.status = ReservationStatus.CONSUMED;
    reservation.settledAt = currentTime;
  }
  private async reservationTime(
    manager: EntityManager,
    expiresAt: Date,
    showingStart: Date,
  ): Promise<{ currentTime: Date; valid: boolean }> {
    const rows = (await manager.query(
      `SELECT clock.current_time AS "currentTime",
        clock.current_time < $1::timestamptz AND clock.current_time < $2::timestamptz AS valid
       FROM (SELECT clock_timestamp() AS current_time) clock`,
      [expiresAt, showingStart],
    )) as { currentTime: Date; valid: boolean }[];
    return rows[0];
  }

  private async dbTime(manager: EntityManager): Promise<Date> {
    const result = (await manager.query(
      'SELECT clock_timestamp() AS current_time',
    )) as { current_time: Date }[];
    return result[0].current_time;
  }

  private sameRequest(order: Order, dto: CreateOrderDto) {
    const canonical = (answers: Record<string, unknown>) =>
      JSON.stringify(
        Object.entries(answers)
          .map(([key, value]) => [
            key,
            typeof value === 'string' ? value.trim() : value,
          ])
          .filter(([, value]) => value !== '')
          .sort(([first], [second]) =>
            String(first).localeCompare(String(second)),
          ),
      );
    const storedAnswers = Object.fromEntries(
      (order.registrationAnswers ?? []).map((answer) => [
        answer.questionId,
        answer.value,
      ]),
    );
    if (
      order.item.ticketTypeId !== dto.ticketTypeId ||
      order.item.quantity !== dto.quantity ||
      (order.discountCode ?? null) !== (dto.discountCode ?? null) ||
      canonical(storedAnswers) !== canonical(dto.answers ?? {})
    )
      throw new ConflictException(
        'Idempotency-Key was used with a different order',
      );
    return this.response(order, order.item, order.reservation);
  }

  private response(
    order: Order,
    item: OrderItem,
    reservation: TicketReservation,
  ) {
    return {
      orderId: order.orderId,
      status: order.status,
      totalAmount: order.totalAmount,
      subtotalAmount: (
        BigInt(item.unitPrice) * BigInt(item.quantity)
      ).toString(),
      discountAmount: order.discountAmount ?? '0',
      discountCode: order.discountCode ?? null,
      registrationAnswers: order.registrationAnswers ?? [],
      cancelReason: order.cancelReason,
      expiresAt: reservation.expiresAt.toISOString(),
      ticketTypeId: item.ticketTypeId,
      ticketTypeName: item.ticketTypeName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private paymentResponse(payment: Payment) {
    return {
      paymentId: payment.paymentId,
      orderId: payment.orderId,
      status: payment.status,
      amount: payment.amount,
      processedAt: payment.processedAt.toISOString(),
    };
  }
}
