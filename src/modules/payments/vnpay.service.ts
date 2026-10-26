import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Principal } from '../auth/authorization/principal';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { OrdersService } from '../orders/orders.service';
import { ResaleService } from '../resale/resale.service';
import { parseRecipient } from './checkout-validation';
import type { CheckoutKind } from './entities/checkout-session.entity';
import { VnpayTransaction } from './entities/vnpay-transaction.entity';
import { VnpayClient, type VnpayParams } from './vnpay.client';
import { User } from '../users/entities/user.entity';
const reply = (RspCode: string, Message: string) => ({ RspCode, Message });

@Injectable()
export class VnpayService {
  constructor(
    private readonly db: DataSource,
    private readonly client: VnpayClient,
    private readonly orders: OrdersService,
    private readonly resale: ResaleService,
    private readonly config: ConfigService,
  ) {}

  private async order(actor: Principal, kind: CheckoutKind, id: string) {
    if (kind === 'orders') {
      const order = await this.orders.findOne(actor, id);
      return { ...order, amount: order.totalAmount };
    }
    const order = await this.resale.orderDetail(actor, id);
    return { ...order, amount: order.price };
  }

  private async lock(manager: EntityManager, kind: CheckoutKind, id: string) {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`vnpay:${kind}:${id}`],
    );
  }

  private validateStart(body: unknown) {
    if (this.config.get<string>('PAYMENT_PROVIDER', 'VNPAY') !== 'VNPAY')
      throw new ConflictException('VNPay is not enabled');
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => key !== 'recipient')
    )
      throw new BadRequestException('Only recipient details may be supplied');
  }

  async startResale(
    actor: Principal,
    listingId: string,
    body: unknown,
    ip: string,
  ) {
    this.validateStart(body);
    parseRecipient((body as Record<string, unknown>).recipient);
    return this.db.transaction(async (manager) => {
      const order = await this.resale.reserve(actor, listingId, manager);
      await this.lock(manager, 'resale', order.resaleOrderId);
      const payment = await this.createPayment(
        manager,
        actor,
        'resale',
        order.resaleOrderId,
        { ...order, amount: order.price },
        body,
        ip,
      );
      return { ...payment, resaleOrderId: order.resaleOrderId };
    });
  }

  async start(
    actor: Principal,
    kind: CheckoutKind,
    id: string,
    body: unknown,
    ip: string,
  ) {
    this.validateStart(body);
    return this.db.transaction(async (manager) => {
      await this.lock(manager, kind, id);
      const order = await this.order(actor, kind, id);
      return this.createPayment(manager, actor, kind, id, order, body, ip);
    });
  }

  private async createPayment(
    manager: EntityManager,
    actor: Principal,
    kind: CheckoutKind,
    id: string,
    order: { status: string; expiresAt: Date | string; amount: string },
    body: unknown,
    ip: string,
  ) {
    const [{ now }] = await manager.query<{ now: Date }[]>(
      'SELECT clock_timestamp() AS now',
    );
    if (
      String(order.status) !== 'PENDING_PAYMENT' ||
      new Date(order.expiresAt).getTime() <= now.getTime()
    )
      throw new ConflictException('Order is no longer available for payment');
    if (order.amount === '0') {
      parseRecipient((body as Record<string, unknown>).recipient);
      if (kind === 'orders') await this.orders.pay(actor, id);
      else await this.resale.pay(actor, id);
      return { paymentUrl: null, free: true };
    }
    const repository = manager.getRepository(VnpayTransaction);
    const prior = await repository
      .createQueryBuilder('transaction')
      .addSelect('transaction.paymentUrl')
      .where('transaction.kind = :kind AND transaction.orderId = :id', {
        kind,
        id,
      })
      .orderBy('transaction.createdAt', 'DESC')
      .getOne();
    if (prior && prior.status !== 'FAILED') {
      if (prior.status !== 'PENDING' || prior.expiresAt <= now)
        throw new ConflictException(
          'Payment requires reconciliation; do not pay again',
        );
      return { paymentUrl: prior.paymentUrl, txnRef: prior.txnRef };
    }
    if ((await repository.countBy({ kind, orderId: id })) >= 10)
      throw new ConflictException('Too many payment attempts');
    const recipient = parseRecipient(
      (body as Record<string, unknown>).recipient,
    );
    const txnRef = `vnp${randomBytes(16).toString('hex')}`;
    const expiresAt = new Date(
      Math.min(
        new Date(order.expiresAt).getTime(),
        now.getTime() + 15 * 60_000,
      ),
    );
    if (expiresAt.getTime() - now.getTime() < 60_000)
      throw new ConflictException(
        'Not enough reservation time remaining; place a new order',
      );
    const paymentUrl = this.client.paymentUrl(
      txnRef,
      order.amount,
      now,
      expiresAt,
      ip,
    );
    await repository.save(
      repository.create({
        txnRef,
        userId: actor.user_id,
        orderId: id,
        kind,
        amount: order.amount,
        recipient,
        status: 'PENDING',
        paymentUrl,
        createdAt: now,
        expiresAt,
        providerResult: null,
        paymentId: null,
        failureCode: null,
      }),
    );
    return { paymentUrl, txnRef };
  }

  async latest(actor: Principal, kind: CheckoutKind, id: string) {
    await this.order(actor, kind, id);
    const current = await this.db.getRepository(VnpayTransaction).findOne({
      where: { userId: actor.user_id, kind, orderId: id },
      order: { createdAt: 'DESC' },
    });
    return {
      current: current
        ? {
            txnRef: current.txnRef,
            status: current.status,
            amount: current.amount,
            recipient: current.recipient,
            expiresAt: current.expiresAt,
            failureCode: current.failureCode,
            paymentId: current.paymentId,
          }
        : null,
    };
  }

  async sync(actor: Principal, kind: CheckoutKind, id: string) {
    await this.order(actor, kind, id);
    const current = await this.db.getRepository(VnpayTransaction).findOne({
      where: { userId: actor.user_id, kind, orderId: id },
      order: { createdAt: 'DESC' },
    });
    const result =
      current?.status === 'PENDING'
        ? await this.syncTransaction(actor, current.txnRef)
        : undefined;
    return {
      ...(await this.latest(actor, kind, id)),
      outcome: result?.outcome ?? 'UNCHANGED',
    };
  }

  private async syncTransaction(actor: Principal, id: string) {
    return this.db.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({
        where: { user_id: actor.user_id },
        lock: { mode: 'pessimistic_read' },
      });
      if (!user || user.status !== UserStatus.ACTIVE)
        throw new ForbiddenException(
          'Tài khoản hoặc quyền truy cập đã thay đổi',
        );
      const repository = manager.getRepository(VnpayTransaction);
      const transaction = await repository.findOne({
        where: { txnRef: id, userId: actor.user_id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!transaction) throw new NotFoundException('Không tìm thấy giao dịch');
      if (transaction.status !== 'PENDING') return;
      const recent = await manager.query<{ exists: number }[]>(
        `SELECT 1 AS exists FROM vnpay_reconciliations
        WHERE txn_ref=$1 AND created_at > clock_timestamp() - interval '5 minutes' LIMIT 1`,
        [id],
      );
      if (recent.length) return;
      const reconciliationId = randomUUID();
      const previousStatus = transaction.status;
      await manager.query(
        `INSERT INTO vnpay_reconciliations
        (reconciliation_id,txn_ref,actor_id,reason,previous_status,new_status,outcome)
        VALUES($1,$2,$3,$4,$5,$5,'ERROR')`,
        [
          reconciliationId,
          id,
          actor.user_id,
          'Người mua kiểm tra kết quả thanh toán',
          previousStatus,
        ],
      );
      let parameters: VnpayParams | undefined;
      let errorCode: string | null = null;
      try {
        parameters = await this.client.query(
          transaction.txnRef,
          transaction.createdAt,
        );
        if (parameters.vnp_ResponseCode === '00') {
          if (
            BigInt(parameters.vnp_Amount) !==
            BigInt(transaction.amount) * 100n
          )
            throw new BadRequestException('VNPay query amount mismatch');
          if (parameters.vnp_TransactionStatus === '00') {
            await this.fulfill(transaction, parameters, 'querydr');
            transaction.providerResult = parameters;
          } else if (previousStatus === 'PENDING') {
            if (parameters.vnp_TransactionStatus === '02')
              transaction.status = 'FAILED';
            else if (parameters.vnp_TransactionStatus !== '01')
              transaction.status = 'REVIEW';
            transaction.failureCode =
              transaction.status === 'PENDING'
                ? null
                : `PROVIDER_STATUS_${parameters.vnp_TransactionStatus}`;
            transaction.providerResult = parameters;
          }
        } else errorCode = 'PROVIDER_QUERY_REJECTED';
      } catch (error) {
        errorCode =
          error instanceof HttpException && error.getStatus() === 429
            ? 'PROVIDER_QUERY_LIMITED'
            : error instanceof BadRequestException
              ? 'INVALID_PROVIDER_RESULT'
              : 'QUERY_OR_PROCESSING_ERROR';
      }
      if (!errorCode) await repository.save(transaction);
      const newStatus = errorCode ? previousStatus : transaction.status;
      const outcome = errorCode
        ? 'ERROR'
        : newStatus === previousStatus
          ? 'UNCHANGED'
          : 'UPDATED';
      await manager.query(
        `UPDATE vnpay_reconciliations SET new_status=$2,outcome=$3,response_code=$4,provider_status=$5,error_code=$6
        WHERE reconciliation_id=$1`,
        [
          reconciliationId,
          newStatus,
          outcome,
          parameters?.vnp_ResponseCode ?? null,
          parameters?.vnp_TransactionStatus ?? null,
          errorCode,
        ],
      );
      return {
        reconciliationId,
        outcome,
        previousStatus,
        status: newStatus,
        responseCode: parameters?.vnp_ResponseCode ?? null,
        providerStatus: parameters?.vnp_TransactionStatus ?? null,
        errorCode,
      };
    });
  }

  async ipn(query: unknown) {
    let parameters: VnpayParams;
    try {
      parameters = this.client.verify(query);
    } catch (error) {
      return error instanceof BadRequestException
        ? reply('97', 'Invalid signature or parameters')
        : reply('99', 'Verification service unavailable; retry IPN');
    }
    try {
      return await this.db.transaction(async (manager) => {
        const repository = manager.getRepository(VnpayTransaction);
        const transaction = await repository.findOne({
          where: { txnRef: parameters.vnp_TxnRef },
          lock: { mode: 'pessimistic_write' },
        });
        if (!transaction) return reply('01', 'Order not found');
        if (BigInt(parameters.vnp_Amount) !== BigInt(transaction.amount) * 100n)
          return reply('04', 'Invalid amount');
        if (transaction.status !== 'PENDING')
          return reply('02', 'Order already confirmed');
        transaction.providerResult = parameters;
        if (
          parameters.vnp_ResponseCode !== '00' ||
          parameters.vnp_TransactionStatus !== '00'
        ) {
          transaction.status = 'FAILED';
          transaction.failureCode =
            parameters.vnp_ResponseCode === '00'
              ? parameters.vnp_TransactionStatus
              : parameters.vnp_ResponseCode;
          await repository.save(transaction);
          return reply('00', 'Confirm success');
        }
        await this.fulfill(transaction, parameters);
        await repository.save(transaction);
        return reply('00', 'Confirm success');
      });
    } catch {
      return reply('99', 'Temporary processing error; retry IPN');
    }
  }

  private async fulfill(
    transaction: VnpayTransaction,
    parameters: VnpayParams,
    source?: 'querydr',
  ) {
    const reference = `${transaction.kind === 'orders' ? 'order' : 'resale'}:${transaction.orderId}`;
    const proof = { reference, txnRef: transaction.txnRef, parameters, source };
    const expectedPaymentId = this.client.confirmed(
      proof,
      reference,
      transaction.amount,
    );
    if (transaction.paymentId && transaction.paymentId !== expectedPaymentId)
      throw new BadRequestException('VNPay payment identity mismatch');
    const actor: Principal = {
      user_id: transaction.userId,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      sessionId: 'vnpay-ipn',
    };
    try {
      const paid =
        transaction.kind === 'orders'
          ? await this.orders.pay(actor, transaction.orderId, undefined, proof)
          : await this.resale.pay(actor, transaction.orderId, undefined, proof);
      if (paid.payment.paymentId !== expectedPaymentId)
        throw new ConflictException('Another transaction settled this order');
      transaction.status = 'SUCCEEDED';
      transaction.paymentId = expectedPaymentId;
    } catch (error) {
      const order = await this.order(
        actor,
        transaction.kind,
        transaction.orderId,
      ).catch((recoveryError) => {
        if (
          recoveryError instanceof HttpException &&
          [400, 403, 404, 409].includes(recoveryError.getStatus())
        )
          return null;
        throw recoveryError;
      });
      if (
        order &&
        String(order.status) === 'PAID' &&
        order.payment?.paymentId === expectedPaymentId
      ) {
        transaction.status = 'SUCCEEDED';
        transaction.paymentId = expectedPaymentId;
      } else if (
        !order ||
        (error instanceof HttpException &&
          [400, 403, 404, 409].includes(error.getStatus()))
      ) {
        transaction.status = 'REVIEW';
        transaction.paymentId = expectedPaymentId;
        transaction.failureCode = 'PAID_NOT_FULFILLED';
      } else {
        throw error;
      }
    }
    if (transaction.status === 'SUCCEEDED') transaction.failureCode = null;
  }

  async returnUrl(query: unknown) {
    const base = new URL(
      this.config.get<string>('VNPAY_FRONTEND_URL', 'http://localhost:3000'),
    );
    let destination = '/account/orders?vnpay=invalid';
    try {
      const parameters = this.client.verify(query);
      const transaction = await this.db
        .getRepository(VnpayTransaction)
        .findOneBy({ txnRef: parameters.vnp_TxnRef });
      if (
        transaction &&
        BigInt(parameters.vnp_Amount) === BigInt(transaction.amount) * 100n
      ) {
        destination = `/checkout/${transaction.kind === 'orders' ? 'orders' : 'pass'}/${encodeURIComponent(transaction.orderId)}?vnpay=returned`;
      }
    } catch {
      destination = '/account/orders?vnpay=invalid';
    }
    return new URL(destination, base).toString();
  }
}
