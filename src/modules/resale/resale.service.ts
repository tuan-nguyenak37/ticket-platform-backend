import { recordNotification } from '../notifications/notifications.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  QueryFailedError,
} from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  enqueueSellerSettlement,
  maskAccount,
} from './resale-settlement.service';
import { generateId } from '../../common/utils/generateId';
import type { Principal } from '../auth/authorization/principal';
import { Event } from '../events/entities/event.entity';
import { EventStatus } from '../events/enums/event-status.enum';
import { Showing } from '../events/showings/entities/showing.entity';
import { TicketType } from '../events/ticket-types/entities/ticket-type.entity';
import { TicketTypeStatus } from '../events/ticket-types/enums/ticket-type-status.enum';
import { Organizer } from '../organizers/entities/organizer.entity';
import { OrganizerStatus } from '../organizers/enums/organizer-status.enum';
import { OrderItem } from '../orders/entities/order-item.entity';
import { PaymentProcessingService } from '../payments/payment-processing.service';
import type { PaymentMethod } from '../payments/payment-method';
import type { VnpayProof } from '../payments/vnpay.client';
import { Ticket, TicketStatus } from '../tickets/entities/ticket.entity';
import { TicketCredential } from '../tickets/entities/ticket-credential.entity';
import { TicketIssuanceService } from '../tickets/ticket-issuance.service';
import { TicketsService } from '../tickets/tickets.service';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/enums/user-status.enum';
import { CreateResaleListingDto } from './dto/create-resale-listing.dto';
import { ResaleDiscoveryDto, ResaleListDto } from './dto/resale-query.dto';
import {
  ResaleListing,
  ResaleListingStatus,
} from './entities/resale-listing.entity';
import { ResaleOrder, ResaleOrderStatus } from './entities/resale-order.entity';
import {
  ResalePayment,
  ResalePaymentStatus,
} from './entities/resale-payment.entity';

interface TicketContext {
  ticket: Ticket;
  item: OrderItem;
  ticketType: TicketType;
  showing: Showing;
  event: Event;
  organizer: Organizer;
}

interface LockedListing {
  listing: ResaleListing;
  order: ResaleOrder | null;
  context: TicketContext;
  credential: TicketCredential | null;
  now: Date;
}

type MutationResult<T extends object = object> =
  | { conflict: string }
  | {
      data: T;
      notify?: {
        buyerId: string;
        sellerId: string;
        ticketId: string;
        orderId: string;
        notifySeller: boolean;
      };
    };

const listingRelations = {
  ticket: {
    orderItem: { order: true },
    ticketType: { showing: { event: { organizer: true } } },
  },
} as const;

@Injectable()
export class ResaleService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly issuance: TicketIssuanceService,
    private readonly tickets: TicketsService,
    private readonly paymentProcessing: PaymentProcessingService,
  ) {}

  async createListing(actor: Principal, dto: CreateResaleListingDto) {
    dto = plainToInstance(CreateResaleListingDto, dto);
    if (validateSync(dto).length)
      throw new BadRequestException(
        'Thông tin đăng bán hoặc tài khoản ngân hàng không hợp lệ',
      );
    if (BigInt(dto.price) > 9223372036854775807n)
      throw new BadRequestException('Price exceeds supported VND range');
    const feeAmount = (BigInt(dto.price) * 500n) / 10000n;
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.activeUser(manager, actor.user_id);
        const context = await this.lockParents(manager, dto.ticketId);
        if (context.ticket.ownerUserId !== actor.user_id)
          throw new NotFoundException('Ticket not found');
        const existing = await manager.findOneBy(ResaleListing, {
          ticketId: dto.ticketId,
          status: In([
            ResaleListingStatus.AVAILABLE,
            ResaleListingStatus.RESERVED,
          ]),
        });
        if (existing) {
          await manager.findOne(ResaleListing, {
            where: { listingId: existing.listingId },
            lock: { mode: 'pessimistic_write' },
          });
        }
        await this.lockTicket(manager, context);
        if (context.ticket.ownerUserId !== actor.user_id)
          throw new NotFoundException('Ticket not found');
        if (
          await manager.existsBy(ResaleListing, {
            ticketId: dto.ticketId,
            status: In([
              ResaleListingStatus.AVAILABLE,
              ResaleListingStatus.RESERVED,
            ]),
          })
        )
          throw new ConflictException('Ticket already has an active listing');
        if (BigInt(dto.price) > this.resaleCeiling(context.item))
          throw new BadRequestException(
            'Resale price exceeds the original unit price',
          );
        const credential = await this.lockCredential(manager, dto.ticketId);
        const reason = this.availabilityReason(
          context,
          actor.user_id,
          dto.price,
          credential,
          await this.dbTime(manager),
        );
        if (reason) throw new ConflictException(reason);
        await this.issuance.inspect(manager, context.item.orderId);
        const listing = await manager.save(
          ResaleListing,
          manager.create(ResaleListing, {
            listingId: generateId('rlist'),
            ticketId: dto.ticketId,
            sellerUserId: actor.user_id,
            price: dto.price,
            bankName: dto.bankName,
            accountHolder: dto.accountHolder,
            accountNumber: dto.accountNumber,
            feeBasisPoints: 500,
            feeAmount: feeAmount.toString(),
            netAmount: (BigInt(dto.price) - feeAmount).toString(),
            status: ResaleListingStatus.AVAILABLE,
          }),
        );
        listing.ticket = context.ticket;
        return this.listingResponse(listing, true);
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string; constraint?: string }).code ===
          '23505' &&
        (error.driverError as { constraint?: string }).constraint ===
          'UQ_resale_listings_active_ticket'
      )
        throw new ConflictException('Ticket already has an active listing');
      throw error;
    }
  }

  async discoveryEvents() {
    return this.publicListings()
      .select('event.eventId', 'eventId')
      .addSelect('event.title', 'title')
      .distinct(true)
      .orderBy('event.title', 'ASC')
      .addOrderBy('event.eventId', 'ASC')
      .getRawMany<{ eventId: string; title: string }>();
  }

  async discover(query: ResaleDiscoveryDto) {
    if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo)
      throw new BadRequestException(
        'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc',
      );
    for (const price of [query.minPrice, query.maxPrice]) {
      if (price !== undefined && BigInt(price) > 9223372036854775807n)
        throw new BadRequestException('Giá vượt giới hạn hỗ trợ');
    }
    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      BigInt(query.minPrice) > BigInt(query.maxPrice)
    )
      throw new BadRequestException(
        'Giá tối thiểu phải nhỏ hơn hoặc bằng giá tối đa',
      );
    const builder = this.publicListings();
    if (query.q)
      builder.andWhere("event.title ILIKE :title ESCAPE '\\'", {
        title: `%${query.q.replace(/[\\%_]/g, '\\$&')}%`,
      });
    if (query.eventId)
      builder.andWhere('event.eventId = :eventId', { eventId: query.eventId });
    if (query.dateFrom)
      builder.andWhere('showing.startTime >= :dateFrom', {
        dateFrom: `${query.dateFrom}T00:00:00+07:00`,
      });
    if (query.dateTo)
      builder.andWhere(
        "showing.startTime < CAST(:dateTo AS timestamptz) + INTERVAL '24 hours'",
        { dateTo: `${query.dateTo}T00:00:00+07:00` },
      );
    if (query.minPrice !== undefined)
      builder.andWhere('listing.price >= :minPrice', {
        minPrice: query.minPrice,
      });
    if (query.maxPrice !== undefined)
      builder.andWhere('listing.price <= :maxPrice', {
        maxPrice: query.maxPrice,
      });
    const [items, total] = await builder
      .orderBy('listing.createdAt', 'DESC')
      .addOrderBy('listing.listingId', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return {
      items: items.map((listing) => ({
        ...this.listingResponse(listing),
        status: ResaleListingStatus.AVAILABLE,
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async myListings(actor: Principal, query: ResaleListDto) {
    const [items, total] = await this.dataSource.manager.findAndCount(
      ResaleListing,
      {
        where: { sellerUserId: actor.user_id },
        relations: { ...listingRelations, payout: true },
        order: { createdAt: 'DESC', listingId: 'DESC' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      },
    );
    return {
      items: items.map((listing) => this.listingResponse(listing, true)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async listingDetail(listingId: string, actor?: Principal) {
    if (actor) {
      const owned = await this.dataSource.manager.findOne(ResaleListing, {
        where: { listingId, sellerUserId: actor.user_id },
        relations: { ...listingRelations, payout: true },
      });
      if (owned) return this.listingResponse(owned, true);
      const purchase = await this.dataSource.manager.findOne(ResaleOrder, {
        where: {
          listingId,
          buyerUserId: actor.user_id,
          status: In([
            ResaleOrderStatus.PENDING_PAYMENT,
            ResaleOrderStatus.PAID,
          ]),
        },
        relations: { listing: listingRelations },
        order: { createdAt: 'DESC' },
      });
      if (
        purchase &&
        (purchase.status === ResaleOrderStatus.PAID ||
          purchase.expiresAt > (await this.dbTime(this.dataSource.manager)))
      ) {
        return {
          ...this.listingResponse(purchase.listing),
          purchase: {
            resaleOrderId: purchase.resaleOrderId,
            status: purchase.status,
            expiresAt: purchase.expiresAt,
          },
        };
      }
    }
    const listing = await this.publicListings(true)
      .andWhere('listing.listingId = :listingId', { listingId })
      .getOne();
    if (!listing) throw new NotFoundException('Listing not found');
    const reservation =
      listing.status === ResaleListingStatus.RESERVED
        ? await this.dataSource.manager.findOne(ResaleOrder, {
            where: { listingId, status: ResaleOrderStatus.PENDING_PAYMENT },
            select: { expiresAt: true },
          })
        : null;
    const reservedUntil =
      reservation &&
      reservation.expiresAt > (await this.dbTime(this.dataSource.manager))
        ? reservation.expiresAt
        : null;
    return {
      ...this.listingResponse(listing),
      status: reservedUntil
        ? ResaleListingStatus.RESERVED
        : ResaleListingStatus.AVAILABLE,
      reservedUntil,
    };
  }

  async checkout(actor: Principal, listingId: string) {
    const completedOrder = () =>
      this.dataSource.getRepository(ResaleOrder).findOneBy({
        listingId,
        buyerUserId: actor.user_id,
        status: ResaleOrderStatus.PAID,
      });
    const prior = await completedOrder();
    if (prior) return this.pay(actor, prior.resaleOrderId);
    let order: { resaleOrderId: string };
    try {
      order = await this.reserve(actor, listingId);
    } catch (error) {
      if (error instanceof ConflictException) {
        const completed = await completedOrder();
        if (completed) return this.pay(actor, completed.resaleOrderId);
      }
      throw error;
    }
    return this.pay(actor, order.resaleOrderId);
  }

  async reserve(
    actor: Principal,
    listingId: string,
    transactionManager?: EntityManager,
  ) {
    const result = await this.mutate<
      ReturnType<ResaleService['orderResponse']>
    >(
      actor,
      listingId,
      undefined,
      async (manager, state) => {
        if (state.order) {
          this.requirePendingLink(state);
          if (this.expired(state)) {
            await this.finishOrder(
              manager,
              state,
              ResaleOrderStatus.EXPIRED,
              'HOLD_EXPIRED',
            );
          } else {
            const reason = this.transferReason(state);
            if (reason) {
              await this.finishOrder(
                manager,
                state,
                ResaleOrderStatus.CANCELLED,
                reason,
                true,
              );
              return { conflict: reason };
            }
            if (state.order.buyerUserId === actor.user_id)
              return { data: this.orderResponse(state.order) };
            return {
              conflict:
                'Vé đang được người khác giữ. Vui lòng chờ hoặc chọn vé khác.',
            };
          }
        }
        if (state.listing.sellerUserId === actor.user_id)
          return { conflict: 'Bạn không thể tự mua vé đang bán.' };
        if (state.listing.status !== ResaleListingStatus.AVAILABLE)
          return { conflict: 'Tin đăng không còn mở bán.' };
        if (!state.listing.bankName)
          return {
            conflict:
              'Tin đăng chưa có tài khoản nhận tiền. Người bán cần hủy và đăng lại.',
          };
        const reason = this.availabilityReason(
          state.context,
          state.listing.sellerUserId,
          state.listing.price,
          state.credential,
          state.now,
        );
        if (reason) return { conflict: reason };
        if (!(await this.issuanceValid(manager, state.context)))
          return { conflict: 'ISSUANCE_INCONSISTENT' };
        const order = await manager.save(
          ResaleOrder,
          manager.create(ResaleOrder, {
            resaleOrderId: generateId('rord'),
            listingId,
            buyerUserId: actor.user_id,
            sellerUserId: state.listing.sellerUserId,
            price: state.listing.price,
            status: ResaleOrderStatus.PENDING_PAYMENT,
            expiresAt: new Date(
              Math.min(
                state.now.getTime() + 5 * 60_000,
                state.context.showing.startTime.getTime(),
              ),
            ),
            cancelReason: null,
          }),
        );
        state.listing.status = ResaleListingStatus.RESERVED;
        await manager.save(ResaleListing, state.listing);
        return { data: this.orderResponse(order) };
      },
      transactionManager,
    );
    return this.resultData(result);
  }

  async cancelListing(actor: Principal, listingId: string) {
    const result = await this.mutate(
      actor,
      listingId,
      undefined,
      async (manager, state) => {
        if (state.listing.sellerUserId !== actor.user_id)
          throw new NotFoundException('Listing not found');
        if (state.order) {
          this.requirePendingLink(state);
          if (!this.expired(state))
            return { conflict: 'Listing has an active reservation' };
          await this.finishOrder(
            manager,
            state,
            ResaleOrderStatus.EXPIRED,
            'HOLD_EXPIRED',
          );
        }
        if (state.listing.status === ResaleListingStatus.SOLD)
          return { conflict: 'A sold listing cannot be cancelled' };
        if (state.listing.status === ResaleListingStatus.RESERVED)
          return { conflict: 'Listing reservation is inconsistent' };
        if (state.listing.status !== ResaleListingStatus.CANCELLED) {
          state.listing.status = ResaleListingStatus.CANCELLED;
          await manager.save(ResaleListing, state.listing);
        }
        return { data: { listingId, status: state.listing.status } };
      },
    );
    return this.resultData(result);
  }

  async myOrders(actor: Principal, query: ResaleListDto) {
    const [items, total] = await this.dataSource.manager.findAndCount(
      ResaleOrder,
      {
        where: { buyerUserId: actor.user_id },
        relations: { listing: listingRelations },
        order: { createdAt: 'DESC', resaleOrderId: 'DESC' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      },
    );
    return {
      items: items.map((order) => this.orderResponse(order)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async orderDetail(actor: Principal, orderId: string) {
    const order = await this.ownedOrder(actor, orderId);
    const payment = await this.dataSource
      .getRepository(ResalePayment)
      .findOneBy({ resaleOrderId: orderId });
    return {
      ...this.orderResponse(order),
      payment: payment ? this.paymentResponse(payment) : null,
    };
  }

  async cancelOrder(actor: Principal, orderId: string) {
    const reference = await this.ownedOrder(actor, orderId);
    const result = await this.mutate(
      actor,
      reference.listingId,
      orderId,
      async (manager, state) => {
        const order = state.order!;
        if (order.status === ResaleOrderStatus.CANCELLED)
          return { data: this.orderResponse(order) };
        if (order.status !== ResaleOrderStatus.PENDING_PAYMENT)
          return { conflict: 'Order cannot be cancelled' };
        this.requirePendingLink(state);
        if (this.expired(state)) {
          await this.finishOrder(
            manager,
            state,
            ResaleOrderStatus.EXPIRED,
            'HOLD_EXPIRED',
          );
          return { conflict: 'Order has expired' };
        }
        await this.finishOrder(
          manager,
          state,
          ResaleOrderStatus.CANCELLED,
          'BUYER_CANCELLED',
        );
        return { data: this.orderResponse(order) };
      },
    );
    return this.resultData(result);
  }

  async pay(
    actor: Principal,
    orderId: string,
    method?: PaymentMethod,
    proof?: VnpayProof,
  ) {
    const reference = await this.ownedOrder(actor, orderId);
    const result = await this.mutate<{
      order: ReturnType<ResaleService['orderResponse']>;
      payment: ReturnType<ResaleService['paymentResponse']>;
    }>(actor, reference.listingId, orderId, async (manager, state) => {
      const order = state.order!;
      const prior = await manager.findOneBy(ResalePayment, {
        resaleOrderId: orderId,
      });
      if (prior) {
        const succeeded = prior.status === ResalePaymentStatus.SUCCEEDED;
        if (!succeeded) return { conflict: 'Order cannot be paid' };
        if (
          prior.amount !== order.price ||
          order.status !==
            (succeeded
              ? ResaleOrderStatus.PAID
              : ResaleOrderStatus.PAYMENT_FAILED)
        )
          return { conflict: 'Payment history is inconsistent' };
        return {
          data: {
            order: this.orderResponse(order),
            payment: this.paymentResponse(prior),
          },
        };
      }
      if (order.status !== ResaleOrderStatus.PENDING_PAYMENT)
        return { conflict: 'Order cannot be paid' };
      this.requirePendingLink(state);
      if (this.expired(state)) {
        await this.finishOrder(
          manager,
          state,
          ResaleOrderStatus.EXPIRED,
          'HOLD_EXPIRED',
        );
        return { conflict: 'Order has expired' };
      }
      const reason = this.transferReason(state);
      if (reason) {
        await this.finishOrder(
          manager,
          state,
          ResaleOrderStatus.CANCELLED,
          reason,
          true,
        );
        return { conflict: reason };
      }
      if (!(await this.issuanceValid(manager, state.context))) {
        await this.finishOrder(
          manager,
          state,
          ResaleOrderStatus.CANCELLED,
          'ISSUANCE_INCONSISTENT',
          true,
        );
        return { conflict: 'ISSUANCE_INCONSISTENT' };
      }

      const charge = this.paymentProcessing.process(
        `resale:${orderId}`,
        order.price,
        method,
        proof,
      );
      await this.tickets.transferOwnership(
        manager,
        state.context.ticket,
        order.sellerUserId,
        order.buyerUserId,
        state.now,
      );
      order.status = ResaleOrderStatus.PAID;
      state.listing.status = ResaleListingStatus.SOLD;
      await manager.save(ResaleOrder, order);
      await manager.save(ResaleListing, state.listing);

      const payment = await manager.save(
        ResalePayment,
        manager.create(ResalePayment, {
          paymentId: charge.transactionId,
          resaleOrderId: orderId,
          amount: order.price,
          status: ResalePaymentStatus.SUCCEEDED,
          processedAt: state.now,
        }),
      );
      state.listing.ticket = state.context.ticket;
      await enqueueSellerSettlement(manager, state.listing, order);
      await recordNotification(manager, {
        userId: order.buyerUserId,
        kind: 'RESALE_BOUGHT',
        sourceId: orderId,
        title: 'Mua lại vé thành công',
        body: `Bạn đã mua vé ${state.context.ticketType.name} của ${state.context.event.title}. Vé đã được chuyển vào tài khoản của bạn.`,
        href: `/checkout/pass/${encodeURIComponent(orderId)}`,
      });
      await recordNotification(manager, {
        userId: order.sellerUserId,
        kind: 'RESALE_SOLD',
        sourceId: orderId,
        title: 'Bán lại vé thành công',
        body: `Vé ${state.context.ticketType.name} của ${state.context.event.title} đã bán thành công. Xem lịch sử bán lại để theo dõi chi trả.`,
        href: '/account/resale',
      });
      return {
        data: {
          order: this.orderResponse(order),
          payment: this.paymentResponse(payment),
        },
        notify: {
          buyerId: order.buyerUserId,
          sellerId: order.sellerUserId,
          ticketId: state.listing.ticketId,
          orderId,
          notifySeller: !state.listing.bankName,
        },
      };
    });
    const data = this.resultData(result);
    if ('notify' in result && result.notify) {
      const { buyerId, sellerId, ticketId } = result.notify;
      await this.tickets.notifyTransferAfterPayment(
        buyerId,
        sellerId,
        ticketId,
        orderId,
        result.notify.notifySeller,
      );
    }
    return data;
  }

  private async mutate<T extends object>(
    actor: Principal,
    listingId: string,
    orderId: string | undefined,
    operation: (
      manager: EntityManager,
      state: LockedListing,
    ) => Promise<MutationResult<T>>,
    transactionManager?: EntityManager,
  ): Promise<MutationResult<T>> {
    const execute = async (manager: EntityManager) => {
      await this.activeUser(manager, actor.user_id);
      const reference = await manager.findOneBy(ResaleListing, { listingId });
      if (!reference) throw new NotFoundException('Listing not found');
      const context = await this.lockParents(manager, reference.ticketId);
      const listing = await manager.findOne(ResaleListing, {
        where: { listingId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!listing || listing.ticketId !== reference.ticketId)
        throw new ConflictException('Listing changed');
      const order = await manager.findOne(ResaleOrder, {
        where: orderId
          ? { resaleOrderId: orderId }
          : { listingId, status: ResaleOrderStatus.PENDING_PAYMENT },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        orderId &&
        (!order ||
          order.buyerUserId !== actor.user_id ||
          order.listingId !== listingId)
      )
        throw new NotFoundException('Resale order not found');
      await this.lockTicket(manager, context);
      const credential = await this.lockCredential(manager, listing.ticketId);
      return operation(manager, {
        listing,
        order,
        context,
        credential,
        now: await this.dbTime(manager),
      });
    };
    return transactionManager
      ? execute(transactionManager)
      : this.dataSource.transaction(execute);
  }

  private async lockParents(
    manager: EntityManager,
    ticketId: string,
  ): Promise<TicketContext> {
    const ticket = await manager.findOne(Ticket, {
      where: { ticketId },
      relations: listingRelations.ticket,
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const referenceType = ticket.ticketType;
    const referenceShowing = referenceType.showing;
    const referenceEvent = referenceShowing.event;
    const organizer = await manager.findOne(Organizer, {
      where: { organizerId: referenceEvent.organizerId },
      lock: { mode: 'pessimistic_read' },
    });
    const event = await manager.findOne(Event, {
      where: { eventId: referenceEvent.eventId },
      lock: { mode: 'pessimistic_read' },
    });
    const showing = await manager.findOne(Showing, {
      where: { showingId: referenceShowing.showingId },
      lock: { mode: 'pessimistic_read' },
    });
    const ticketType = await manager.findOne(TicketType, {
      where: { ticketTypeId: referenceType.ticketTypeId },
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
      throw new ConflictException('Ticket parent data changed');
    return {
      ticket,
      item: ticket.orderItem,
      ticketType,
      showing,
      event,
      organizer,
    };
  }

  private async lockTicket(manager: EntityManager, context: TicketContext) {
    const ticket = await manager.findOne(Ticket, {
      where: { ticketId: context.ticket.ticketId },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      !ticket ||
      ticket.ticketTypeId !== context.ticketType.ticketTypeId ||
      ticket.orderItemId !== context.item.orderItemId
    )
      throw new ConflictException('Ticket data changed');
    context.event.organizer = context.organizer;
    context.showing.event = context.event;
    context.ticketType.showing = context.showing;
    ticket.ticketType = context.ticketType;
    ticket.orderItem = context.item;
    context.ticket = ticket;
  }

  private lockCredential(manager: EntityManager, ticketId: string) {
    return manager.findOne(TicketCredential, {
      where: { ticketId, revokedAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private async activeUser(manager: EntityManager, userId: string) {
    const user = await manager.findOne(User, {
      where: { user_id: userId },
      lock: { mode: 'pessimistic_read' },
    });
    if (!user || user.status !== UserStatus.ACTIVE)
      throw new ForbiddenException('Account is not active');
  }

  private async ownedOrder(actor: Principal, orderId: string) {
    const order = await this.dataSource.manager.findOne(ResaleOrder, {
      where: { resaleOrderId: orderId, buyerUserId: actor.user_id },
      relations: { listing: listingRelations },
    });
    if (!order) throw new NotFoundException('Resale order not found');
    return order;
  }

  private requirePendingLink(state: LockedListing) {
    if (
      !state.order ||
      state.order.status !== ResaleOrderStatus.PENDING_PAYMENT ||
      state.listing.status !== ResaleListingStatus.RESERVED ||
      state.order.listingId !== state.listing.listingId ||
      state.order.sellerUserId !== state.listing.sellerUserId ||
      state.order.price !== state.listing.price
    )
      throw new ConflictException('Listing reservation is inconsistent');
  }

  private transferReason(state: LockedListing): string | null {
    const { context, listing, credential } = state;
    if (context.organizer.status !== OrganizerStatus.ACTIVE)
      return 'ORGANIZER_SUSPENDED';
    if (!context.ticketType.resaleAllowed) return 'RESALE_NOT_ALLOWED';
    if (context.ticket.status !== TicketStatus.ACTIVE)
      return 'TICKET_NOT_ACTIVE';
    if (context.ticket.ownerUserId !== listing.sellerUserId)
      return 'TICKET_OWNER_CHANGED';
    if (!credential) return 'CREDENTIAL_MISSING';
    return null;
  }

  private availabilityReason(
    context: TicketContext,
    sellerId: string,
    price: string,
    credential: TicketCredential | null,
    now: Date,
  ): string | null {
    if (context.organizer.status !== OrganizerStatus.ACTIVE)
      return 'ORGANIZER_SUSPENDED';
    if (context.event.status !== EventStatus.PUBLISHED)
      return 'EVENT_NOT_PUBLIC';
    if (
      context.ticketType.status !== TicketTypeStatus.ACTIVE ||
      !context.ticketType.resaleAllowed
    )
      return 'RESALE_NOT_ALLOWED';
    if (
      context.ticket.status !== TicketStatus.ACTIVE ||
      context.ticket.ownerUserId !== sellerId
    )
      return 'TICKET_NOT_AVAILABLE';
    if (now >= context.showing.startTime) return 'SHOWING_STARTED';
    if (!credential) return 'CREDENTIAL_MISSING';
    if (BigInt(price) <= 0n || BigInt(price) > this.resaleCeiling(context.item))
      return 'INVALID_RESALE_PRICE';
    return null;
  }

  private async issuanceValid(manager: EntityManager, context: TicketContext) {
    try {
      await this.issuance.inspect(manager, context.item.orderId);
      return true;
    } catch (error) {
      if (error instanceof ConflictException) return false;
      throw error;
    }
  }

  private resaleCeiling(item: OrderItem) {
    return (
      (BigInt(item.unitPrice) * BigInt(item.quantity) -
        BigInt(item.order?.discountAmount ?? '0')) /
      BigInt(item.quantity)
    );
  }

  private expired(state: LockedListing) {
    return (
      state.now >= state.order!.expiresAt ||
      state.now >= state.context.showing.startTime
    );
  }

  private async finishOrder(
    manager: EntityManager,
    state: LockedListing,
    status: ResaleOrderStatus,
    reason: string | null,
    forceCancel = false,
  ) {
    this.requirePendingLink(state);
    state.order!.status = status;
    state.order!.cancelReason = reason;
    await manager.save(ResaleOrder, state.order!);
    const available =
      !forceCancel &&
      !this.availabilityReason(
        state.context,
        state.listing.sellerUserId,
        state.listing.price,
        state.credential,
        state.now,
      ) &&
      (await this.issuanceValid(manager, state.context));
    state.listing.status = available
      ? ResaleListingStatus.AVAILABLE
      : ResaleListingStatus.CANCELLED;
    await manager.save(ResaleListing, state.listing);
  }

  private async dbTime(manager: EntityManager): Promise<Date> {
    const [row] = (await manager.query(
      'SELECT clock_timestamp() AS "currentTime"',
    )) as { currentTime: Date }[];
    return row.currentTime;
  }

  private resultData<T extends object>(result: MutationResult<T>) {
    if ('conflict' in result) throw new ConflictException(result.conflict);
    return result.data;
  }

  private publicListings(includeReserved = false) {
    return this.dataSource
      .getRepository(ResaleListing)
      .createQueryBuilder('listing')
      .innerJoinAndSelect('listing.ticket', 'ticket')
      .innerJoinAndSelect('ticket.orderItem', 'item')
      .innerJoinAndSelect('item.order', 'originalOrder')
      .innerJoinAndSelect('ticket.ticketType', 'ticketType')
      .innerJoinAndSelect('ticketType.showing', 'showing')
      .innerJoinAndSelect('showing.event', 'event')
      .innerJoinAndSelect('event.organizer', 'organizer')
      .where(
        `(listing.status = :available OR (listing.status = :reserved AND EXISTS (
        SELECT 1 FROM resale_orders held WHERE held.listing_id = listing.listing_id
        AND held.status = 'PENDING_PAYMENT' AND (held.expires_at <= clock_timestamp() OR :includeReserved)
      )))`,
        {
          available: ResaleListingStatus.AVAILABLE,
          reserved: ResaleListingStatus.RESERVED,
          includeReserved,
        },
      )
      .andWhere(
        'ticket.status = :ticketActive AND ticket.ownerUserId = listing.sellerUserId',
        { ticketActive: TicketStatus.ACTIVE },
      )
      .andWhere(
        'ticketType.status = :typeActive AND ticketType.resaleAllowed = true',
        { typeActive: TicketTypeStatus.ACTIVE },
      )
      .andWhere(
        'event.status = :published AND organizer.status = :organizerActive',
        {
          published: EventStatus.PUBLISHED,
          organizerActive: OrganizerStatus.ACTIVE,
        },
      )
      .andWhere('showing.startTime > clock_timestamp()')
      .andWhere('listing.bankName IS NOT NULL')
      .andWhere(
        'listing.price > 0 AND listing.price <= floor("originalOrder".total_amount::numeric / item.quantity)',
      )
      .andWhere('originalOrder.status = :paid', { paid: 'PAID' })
      .andWhere(
        `EXISTS (SELECT 1 FROM payments payment WHERE payment.order_id = item.order_id AND payment.status = 'SUCCEEDED' AND payment.amount = "originalOrder".total_amount)`,
      )
      .andWhere(
        `EXISTS (SELECT 1 FROM ticket_reservations reservation WHERE reservation.order_id = item.order_id AND reservation.status = 'CONSUMED' AND reservation.ticket_type_id = item.ticket_type_id AND reservation.quantity = item.quantity)`,
      )
      .andWhere(
        'item.unit_price::numeric * item.quantity - "originalOrder".discount_amount = "originalOrder".total_amount',
      )
      .andWhere(
        `(SELECT COUNT(*) FROM tickets issued WHERE issued.order_item_id = item.order_item_id) = item.quantity`,
      )
      .andWhere(`NOT EXISTS (SELECT 1 FROM tickets issued WHERE issued.order_item_id = item.order_item_id AND (
        issued.ticket_number < 1 OR issued.ticket_number > item.quantity OR issued.ticket_type_id <> item.ticket_type_id
        OR (SELECT COUNT(*) FROM ticket_ownerships history WHERE history.ticket_id = issued.ticket_id AND history.from_user_id IS NULL) <> 1
        OR NOT EXISTS (SELECT 1 FROM ticket_ownerships history WHERE history.ticket_id = issued.ticket_id AND history.from_user_id IS NULL AND history.to_user_id = "originalOrder".user_id)
        OR NOT EXISTS (SELECT 1 FROM ticket_credentials credential WHERE credential.ticket_id = issued.ticket_id)
        OR (issued.status = 'ACTIVE' AND (SELECT COUNT(*) FROM ticket_credentials credential WHERE credential.ticket_id = issued.ticket_id AND credential.revoked_at IS NULL) <> 1)
      ))`);
  }

  private listingResponse(listing: ResaleListing, privateView = false) {
    const ticket = listing.ticket;
    const showing = ticket.ticketType.showing;
    const event = showing.event;
    return {
      listingId: listing.listingId,
      status: listing.status,
      price: listing.price,
      originalPrice: this.resaleCeiling(ticket.orderItem).toString(),
      createdAt: listing.createdAt,
      updatedAt: listing.updatedAt,
      ...(privateView ? { ticketId: listing.ticketId } : {}),
      ...(privateView
        ? {
            settlement: listing.bankName
              ? {
                  bankName: listing.bankName,
                  accountHolder: listing.accountHolder,
                  maskedAccountNumber: maskAccount(listing.accountNumber!),
                  feeBasisPoints: listing.feeBasisPoints,
                  feeAmount: listing.feeAmount,
                  netAmount: listing.netAmount,
                  payout: listing.payout
                    ? {
                        payoutId: listing.payout.payoutId,
                        status: listing.payout.status,
                        processedAt: listing.payout.processedAt,
                      }
                    : null,
                }
              : null,
          }
        : {}),
      event: {
        eventId: event.eventId,
        title: event.title,
        posterUrl: event.posterUrl,
      },
      organizer: { organizerId: event.organizerId, name: event.organizer.name },
      showing: {
        showingId: showing.showingId,
        name: showing.name,
        startTime: showing.startTime,
        endTime: showing.endTime,
        venueName: showing.venueName,
        address: showing.address,
        city: showing.city,
      },
      ticketType: {
        ticketTypeId: ticket.ticketTypeId,
        name: ticket.ticketType.name,
        description: ticket.ticketType.description,
      },
    };
  }

  private orderResponse(order: ResaleOrder) {
    const listing = order.listing;
    const metadata = listing ? this.listingResponse(listing) : null;
    return {
      resaleOrderId: order.resaleOrderId,
      listingId: order.listingId,
      price: order.price,
      status: order.status,
      expiresAt: order.expiresAt,
      cancelReason: order.cancelReason,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      ...(metadata
        ? {
            event: metadata.event,
            showing: metadata.showing,
            ticketType: metadata.ticketType,
            ...(order.status === ResaleOrderStatus.PAID &&
            listing.ticket.ownerUserId === order.buyerUserId &&
            listing.ticket.status === TicketStatus.ACTIVE
              ? { ticketId: listing.ticketId }
              : {}),
          }
        : {}),
    };
  }

  private paymentResponse(payment: ResalePayment) {
    return {
      paymentId: payment.paymentId,
      resaleOrderId: payment.resaleOrderId,
      amount: payment.amount,
      status: payment.status,
      processedAt: payment.processedAt,
    };
  }
}
