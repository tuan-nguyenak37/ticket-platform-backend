import { ConflictException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { generateId } from '../../common/utils/generateId';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { TicketReservation } from '../orders/entities/ticket-reservation.entity';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { ReservationStatus } from '../orders/enums/reservation-status.enum';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { Ticket, TicketStatus } from './entities/ticket.entity';
import { TicketCredential } from './entities/ticket-credential.entity';
import { TicketOwnership } from './entities/ticket-ownership.entity';

@Injectable()
export class TicketIssuanceService {
  async inspect(manager: EntityManager, orderId: string, allowMissing = false) {
    const order = await manager.findOneBy(Order, { orderId });
    const item = await manager.findOneBy(OrderItem, { orderId });
    const payment = await manager.findOneBy(Payment, { orderId });
    const reservation = await manager.findOneBy(TicketReservation, { orderId });
    if (
      !order ||
      !item ||
      order.status !== OrderStatus.PAID ||
      payment?.status !== PaymentStatus.SUCCEEDED ||
      reservation?.status !== ReservationStatus.CONSUMED ||
      reservation.ticketTypeId !== item.ticketTypeId ||
      reservation.quantity !== item.quantity ||
      BigInt(item.unitPrice) * BigInt(item.quantity) -
        BigInt(order.discountAmount ?? '0') !==
        BigInt(order.totalAmount) ||
      payment.amount !== order.totalAmount
    ) {
      throw new ConflictException(
        'Order is not consistently paid; ticket issuance is unavailable',
      );
    }
    const tickets = await manager.find(Ticket, {
      where: { orderItemId: item.orderItemId },
      relations: { credentials: true, ownerships: true },
      order: { ticketNumber: 'ASC' },
    });
    const numbers = new Set<number>();
    for (const ticket of tickets) {
      if (
        !Number.isInteger(ticket.ticketNumber) ||
        ticket.ticketNumber < 1 ||
        ticket.ticketNumber > item.quantity ||
        numbers.has(ticket.ticketNumber) ||
        ticket.ticketTypeId !== item.ticketTypeId
      ) {
        throw new ConflictException(
          'Ticket issuance is inconsistent; manual investigation required',
        );
      }
      numbers.add(ticket.ticketNumber);
      const initial = ticket.ownerships.filter(
        (ownership) => ownership.fromUserId === null,
      );
      if (
        initial.length !== 1 ||
        initial[0].toUserId !== order.userId ||
        !ticket.credentials.length ||
        (ticket.status === TicketStatus.ACTIVE &&
          ticket.credentials.filter(
            (credential) => credential.revokedAt === null,
          ).length !== 1)
      ) {
        throw new ConflictException(
          'Ticket credential or ownership history is inconsistent',
        );
      }
    }
    if (!allowMissing && tickets.length !== item.quantity) {
      throw new ConflictException(
        'Ticket issuance is incomplete; run the controlled backfill before exporting tickets',
      );
    }
    return { order, item, tickets, missing: item.quantity - tickets.length };
  }

  async issue(manager: EntityManager, orderId: string, backfill = false) {
    await manager.findOne(Order, {
      where: { orderId },
      lock: { mode: 'pessimistic_write' },
    });
    const state = await this.inspect(manager, orderId, true);
    if (!backfill && state.tickets.length) {
      throw new ConflictException('Tickets already exist for this new payment');
    }
    const existing = new Set(
      state.tickets.map((ticket) => ticket.ticketNumber),
    );
    const [{ issuedAt }] = (await manager.query(
      'SELECT clock_timestamp() AS "issuedAt"',
    )) as { issuedAt: Date }[];
    let batch: Ticket[] = [];
    const flush = async () => {
      if (!batch.length) return;
      await manager.insert(Ticket, batch);
      await manager.insert(
        TicketCredential,
        batch.map((ticket) => ({
          credentialId: generateId('cred'),
          ticketId: ticket.ticketId,
          revokedAt: null,
        })),
      );
      await manager.insert(
        TicketOwnership,
        batch.map((ticket) => ({
          ownershipId: generateId('own'),
          ticketId: ticket.ticketId,
          fromUserId: null,
          toUserId: state.order.userId,
        })),
      );
      batch = [];
    };
    for (
      let ticketNumber = 1;
      ticketNumber <= state.item.quantity;
      ticketNumber++
    ) {
      if (existing.has(ticketNumber)) continue;
      batch.push(
        manager.create(Ticket, {
          ticketId: generateId('ticket'),
          orderItemId: state.item.orderItemId,
          ticketTypeId: state.item.ticketTypeId,
          ownerUserId: state.order.userId,
          ticketNumber,
          status: TicketStatus.ACTIVE,
          issuedAt,
        }),
      );
      if (batch.length === 100) await flush();
    }
    await flush();
    await this.inspect(manager, orderId);
    return { orderId, quantity: state.item.quantity, created: state.missing };
  }
}
