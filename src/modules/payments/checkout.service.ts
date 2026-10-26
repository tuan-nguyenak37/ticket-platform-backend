import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CheckoutOtpService } from './checkout-otp.service';
import { DataSource, EntityManager } from 'typeorm';
import { generateId } from '../../common/utils/generateId';
import type { Principal } from '../auth/authorization/principal';
import { OrdersService } from '../orders/orders.service';
import { ResaleService } from '../resale/resale.service';
import {
  CheckoutSession,
  type CheckoutKind,
} from './entities/checkout-session.entity';
import { parseCheckout, parseOtp } from './checkout-validation';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly db: DataSource,
    private readonly orders: OrdersService,
    private readonly resale: ResaleService,
    private readonly otp: CheckoutOtpService,
  ) {}

  private async order(actor: Principal, kind: CheckoutKind, id: string) {
    if (kind === 'orders') {
      const order = await this.orders.findOne(actor, id);
      return {
        ...order,
        amount: order.totalAmount,
        item: {
          name: order.ticketTypeName,
          quantity: order.quantity,
          unitPrice: order.unitPrice,
        },
      };
    }
    const order = await this.resale.orderDetail(actor, id);
    return {
      ...order,
      amount: order.price,
      item: {
        name: 'Vé nhận chuyển nhượng',
        quantity: 1,
        unitPrice: order.price,
      },
    };
  }

  private async clock(manager: EntityManager) {
    const rows = (await manager.query('SELECT clock_timestamp() AS now')) as {
      now: Date;
    }[];
    return rows[0].now;
  }
  private async lock(manager: EntityManager, kind: CheckoutKind, id: string) {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`checkout:${kind}:${id}`],
    );
  }
  private response(session: CheckoutSession) {
    return {
      sessionId: session.sessionId,
      orderId: session.orderId,
      kind: session.kind,
      method: session.method,
      status: session.status,
      amount: session.amount,
      currency: 'VND',
      recipient: session.recipient,
      instrument: session.instrument,
      item: session.item,
      attemptsRemaining: Math.max(0, 5 - session.attempts),
      expiresAt: session.expiresAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
      processedAt: session.processedAt?.toISOString() ?? null,
      paymentId: session.paymentId,
      failureCode: session.failureCode,
    };
  }
  private async owned(actor: Principal, id: string) {
    const session = await this.db
      .getRepository(CheckoutSession)
      .findOneBy({ sessionId: id, userId: actor.user_id });
    if (!session)
      throw new NotFoundException('Không tìm thấy phiên thanh toán.');
    return session;
  }

  async start(actor: Principal, kind: CheckoutKind, id: string, body: unknown) {
    const input = parseCheckout(body);
    return this.db.transaction(async (manager) => {
      await this.lock(manager, kind, id);
      const order = await this.order(actor, kind, id);
      const now = await this.clock(manager);
      if (
        order.status !== 'PENDING_PAYMENT' ||
        new Date(order.expiresAt).getTime() <= now.getTime()
      )
        throw new ConflictException(
          'Đơn không còn trong thời gian thanh toán.',
        );
      const repository = manager.getRepository(CheckoutSession);
      const prior = await repository.findOne({
        where: { userId: actor.user_id, kind, orderId: id },
        order: { createdAt: 'DESC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (prior?.status === 'VERIFIED' || prior?.status === 'SUCCEEDED')
        throw new ConflictException(
          'Giao dịch đã được xác thực. Vui lòng kiểm tra trạng thái.',
        );
      if (
        prior?.status === 'AWAITING_AUTH' &&
        prior.expiresAt > now &&
        prior.method === input.method &&
        prior.recipient.name === input.recipient.name &&
        prior.recipient.email === input.recipient.email &&
        prior.recipient.phone === input.recipient.phone &&
        prior.instrument.label === input.instrument.label &&
        prior.instrument.last4 === input.instrument.last4
      )
        return this.response(prior);
      if (
        (await repository.countBy({
          userId: actor.user_id,
          kind,
          orderId: id,
        })) >= 20
      )
        throw new ConflictException(
          'Đã vượt quá số lần thử thanh toán cho đơn này.',
        );
      if (prior?.status === 'AWAITING_AUTH') {
        prior.status = prior.expiresAt <= now ? 'EXPIRED' : 'CANCELLED';
        await repository.save(prior);
      }
      const sessionId = generateId('cs');
      const session = await repository.save(
        repository.create({
          sessionId,
          userId: actor.user_id,
          orderId: id,
          kind,
          ...input,
          amount: order.amount,
          item: order.item,
          status: 'AWAITING_AUTH',
          attempts: 0,
          otpDigest: '',
          expiresAt: new Date(
            Math.min(
              new Date(order.expiresAt).getTime(),
              now.getTime() + 5 * 60_000,
            ),
          ),
          processedAt: null,
          paymentId: null,
          failureCode: null,
          createdAt: now,
        }),
      );
      await this.otp.issue(
        actor.user_id,
        sessionId,
        session.recipient.email,
        session.expiresAt,
      );
      return this.response(session);
    });
  }

  async latest(actor: Principal, kind: CheckoutKind, id: string) {
    const order = await this.order(actor, kind, id);
    const sessions = await this.db
      .getRepository(CheckoutSession)
      .find({
        where: { userId: actor.user_id, kind, orderId: id },
        order: { createdAt: 'DESC' },
        take: 20,
      });
    if (!sessions.length) return { current: null, history: [] };
    const current = sessions[0];
    if (
      current.status === 'VERIFIED' &&
      order.status === 'PAID' &&
      order.payment
    ) {
      await this.db
        .getRepository(CheckoutSession)
        .update(
          { sessionId: current.sessionId, status: 'VERIFIED' },
          {
            status: 'SUCCEEDED',
            paymentId: order.payment.paymentId,
            processedAt: new Date(order.payment.processedAt),
          },
        );
      current.status = 'SUCCEEDED';
      current.paymentId = order.payment.paymentId;
      current.processedAt = new Date(order.payment.processedAt);
    }
    const now = await this.clock(this.db.manager);
    if (
      current.status === 'AWAITING_AUTH' &&
      (current.expiresAt <= now || order.status !== 'PENDING_PAYMENT')
    ) {
      const status = order.status === 'CANCELLED' ? 'CANCELLED' : 'EXPIRED';
      const updated = await this.db
        .getRepository(CheckoutSession)
        .update(
          { sessionId: current.sessionId, status: 'AWAITING_AUTH' },
          { status },
        );
      if (updated.affected) current.status = status;
    }
    return {
      current: this.response(current),
      history: sessions.map((session) => this.response(session)),
    };
  }

  async confirm(actor: Principal, id: string, body: unknown) {
    const otp = parseOtp(body);
    const reference = await this.owned(actor, id);
    const result = await this.db.transaction(async (manager) => {
      await this.lock(manager, reference.kind, reference.orderId);
      const repository = manager.getRepository(CheckoutSession);
      const session = await repository
        .createQueryBuilder('session')
        .addSelect('session.otpDigest')
        .where('session.sessionId = :id AND session.userId = :userId', {
          id,
          userId: actor.user_id,
        })
        .setLock('pessimistic_write')
        .getOneOrFail();
      if (session.status === 'SUCCEEDED' || session.status === 'VERIFIED')
        return { session };
      if (session.status !== 'AWAITING_AUTH')
        return { error: 'Phiên thanh toán đã kết thúc.' };
      const now = await this.clock(manager);
      if (session.expiresAt <= now) {
        session.status = 'EXPIRED';
        await repository.save(session);
        return { error: 'Phiên xác thực đã hết hạn. Vui lòng thử lại.' };
      }
      const verification = await this.otp.verify(id, otp);
      if (verification === 'expired') {
        session.status = 'EXPIRED';
        await repository.save(session);
        return {
          error: 'Mã xác thực đã hết hạn. Vui lòng tạo phiên thanh toán mới.',
        };
      }
      if (verification === 'invalid') {
        session.attempts += 1;
        if (session.attempts >= 5) {
          session.status = 'FAILED';
          session.failureCode = 'OTP_ATTEMPTS_EXCEEDED';
        }
        await repository.save(session);
        return {
          error:
            session.status === 'FAILED'
              ? 'Giao dịch thất bại do nhập sai mã quá nhiều lần.'
              : `Mã xác thực chưa đúng. Còn ${5 - session.attempts} lần thử.`,
        };
      }
      session.status = 'VERIFIED';
      await repository.save(session);
      return { session };
    });
    if ('error' in result) throw new BadRequestException(result.error);
    const session = result.session;
    if (session.status === 'SUCCEEDED') return this.response(session);
    try {
      const order = await this.order(actor, session.kind, session.orderId);
      if (order.amount !== session.amount)
        throw new ConflictException('Giá trị giao dịch không khớp đơn hàng.');
      const paid =
        session.kind === 'orders'
          ? await this.orders.pay(actor, session.orderId, session.method)
          : await this.resale.pay(actor, session.orderId, session.method);
      await this.db
        .getRepository(CheckoutSession)
        .update(
          { sessionId: id, status: 'VERIFIED' },
          {
            status: 'SUCCEEDED',
            paymentId: paid.payment.paymentId,
            processedAt: new Date(paid.payment.processedAt),
          },
        );
      return this.response(await this.owned(actor, id));
    } catch (error) {
      const order = await this.order(actor, session.kind, session.orderId);
      if (order.status === 'PAID' && order.payment) {
        await this.db
          .getRepository(CheckoutSession)
          .update(
            { sessionId: id, status: 'VERIFIED' },
            {
              status: 'SUCCEEDED',
              paymentId: order.payment.paymentId,
              processedAt: new Date(order.payment.processedAt),
            },
          );
        return this.response(await this.owned(actor, id));
      }
      if (
        order.status !== 'PENDING_PAYMENT' ||
        new Date(order.expiresAt).getTime() <= Date.now()
      )
        await this.db
          .getRepository(CheckoutSession)
          .update(
            { sessionId: id, status: 'VERIFIED' },
            {
              status: order.status === 'CANCELLED' ? 'CANCELLED' : 'EXPIRED',
              failureCode: 'ORDER_UNAVAILABLE',
            },
          );
      throw error;
    }
  }

  async cancel(actor: Principal, id: string) {
    const session = await this.owned(actor, id);
    const result = await this.db
      .getRepository(CheckoutSession)
      .update(
        { sessionId: id, userId: actor.user_id, status: 'AWAITING_AUTH' },
        { status: 'CANCELLED' },
      );
    if (!result.affected && session.status !== 'CANCELLED')
      throw new ConflictException('Giao dịch đang xử lý hoặc đã kết thúc.');
    return this.response(await this.owned(actor, id));
  }

  async receipt(actor: Principal, kind: CheckoutKind, id: string) {
    const { current } = await this.latest(actor, kind, id);
    const order = await this.order(actor, kind, id);
    if (
      !current ||
      current.status !== 'SUCCEEDED' ||
      order.status !== 'PAID' ||
      order.payment?.paymentId !== current.paymentId
    )
      throw new NotFoundException('Chưa có biên nhận thanh toán.');
    return {
      ...current,
      receiptNumber: `TV-${current.paymentId}`,
      issuedAt: current.processedAt,
    };
  }
}
