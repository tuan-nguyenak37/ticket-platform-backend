import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { generateId } from '../../common/utils/generateId';
import { MailService } from '../tickets/mail.service';
import { ResaleListing } from './entities/resale-listing.entity';
import { ResaleOrder } from './entities/resale-order.entity';
import {
  ResaleEmail,
  ResaleEmailDetails,
} from './entities/resale-email.entity';
import { ResalePayout } from './entities/resale-payout.entity';
import { User } from '../users/entities/user.entity';

export function maskAccount(accountNumber: string) {
  return `•••• ${accountNumber.slice(-4)}`;
}

export async function enqueueSellerSettlement(
  manager: EntityManager,
  listing: ResaleListing,
  order: ResaleOrder,
) {
  if (!listing.bankName) return;
  const payout = await manager.save(
    ResalePayout,
    manager.create(ResalePayout, {
      payoutId: generateId('rpayout'),
      resaleOrderId: order.resaleOrderId,
      listingId: listing.listingId,
      grossAmount: order.price,
      feeBasisPoints: listing.feeBasisPoints!,
      feeAmount: listing.feeAmount!,
      netAmount: listing.netAmount!,
      bankName: listing.bankName,
      accountHolder: listing.accountHolder!,
      accountNumber: listing.accountNumber!,
      status: 'PENDING',
      provider: 'MOCK',
    }),
  );
  const seller = await manager.findOneByOrFail(User, {
    user_id: order.sellerUserId,
  });
  const ticket = listing.ticket;
  const details: ResaleEmailDetails = {
    eventTitle: ticket.ticketType.showing.event.title,
    showingName: ticket.ticketType.showing.name,
    ticketTypeName: ticket.ticketType.name,
    ticketNumber: ticket.ticketNumber,
    grossAmount: order.price,
    feeAmount: payout.feeAmount,
    netAmount: payout.netAmount,
    bankName: payout.bankName,
    accountHolder: payout.accountHolder,
    maskedAccountNumber: maskAccount(payout.accountNumber),
    reference: order.resaleOrderId,
  };
  await manager.insert(ResaleEmail, {
    emailId: generateId('rmail'),
    resaleOrderId: order.resaleOrderId,
    kind: 'SOLD',
    recipient: seller.email,
    details,
  });
}

@Injectable()
export class ResaleSettlementService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResaleSettlementService.name);
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private running?: Promise<void>;

  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  onModuleInit() {
    if (this.config.get<boolean>('RESALE_SETTLEMENT_WORKER_ENABLED', true))
      this.schedule();
  }

  async onModuleDestroy() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }

  private schedule() {
    this.timer = setTimeout(() => {
      this.running = this.runOnce()
        .catch(() => {
          this.logger.error('resale_settlement_pass_failed');
        })
        .finally(() => {
          this.running = undefined;
          if (!this.stopped) this.schedule();
        });
    }, 5000);
    this.timer.unref();
  }

  async runOnce() {
    if (!this.config.get<boolean>('RESALE_SETTLEMENT_WORKER_ENABLED', true))
      return;
    if (
      ['development', 'test'].includes(this.config.get<string>('NODE_ENV', ''))
    ) {
      for (let processed = 0; processed < 20; processed++) {
        if (this.stopped || !(await this.processPayout())) break;
      }
    }
    if (!this.mail.enabled()) return;
    for (let processed = 0; processed < 20; processed++) {
      if (this.stopped || !(await this.processEmail())) break;
    }
  }

  private async processPayout(): Promise<boolean> {
    return this.db.transaction(async (manager) => {
      const payout = await manager
        .getRepository(ResalePayout)
        .createQueryBuilder('payout')
        .where("payout.status = 'PENDING' AND payout.provider = 'MOCK'")
        .orderBy('payout.createdAt', 'ASC')
        .addOrderBy('payout.payoutId', 'ASC')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .take(1)
        .getOne();
      if (!payout) return false;
      const [verified] = await manager.query<{ verified: number }[]>(
        `SELECT 1 AS verified FROM resale_orders sale
        JOIN resale_payments payment ON payment.resale_order_id = sale.resale_order_id
        JOIN resale_listings listing ON listing.listing_id = sale.listing_id
        WHERE sale.resale_order_id = $1 AND sale.listing_id = $2 AND sale.status = 'PAID'
          AND listing.status = 'SOLD' AND sale.seller_user_id = listing.seller_user_id
          AND sale.price = $3 AND listing.price = sale.price
          AND listing.fee_amount = $4 AND listing.net_amount = $5
          AND payment.status = 'SUCCEEDED' AND payment.amount = sale.price
          AND EXISTS (SELECT 1 FROM ticket_ownerships ownership WHERE ownership.ticket_id = listing.ticket_id
            AND ownership.from_user_id = sale.seller_user_id AND ownership.to_user_id = sale.buyer_user_id)`,
        [
          payout.resaleOrderId,
          payout.listingId,
          payout.grossAmount,
          payout.feeAmount,
          payout.netAmount,
        ],
      );
      if (!verified) {
        payout.status = 'FAILED';
        payout.errorCode = 'SETTLEMENT_INCONSISTENT';
        await manager.save(payout);
        this.logger.warn(`resale_payout_failed payoutId=${payout.payoutId}`);
        return true;
      }
      payout.status = 'SUCCEEDED';
      payout.providerReference = `mock:${payout.payoutId}`;
      payout.processedAt = new Date();
      await manager.save(payout);
      const notice = await manager.findOneByOrFail(ResaleEmail, {
        resaleOrderId: payout.resaleOrderId,
        kind: 'SOLD',
      });
      await manager.insert(ResaleEmail, {
        emailId: generateId('rmail'),
        resaleOrderId: payout.resaleOrderId,
        kind: 'PAYOUT_PROCESSED',
        recipient: notice.recipient,
        details: { ...notice.details, reference: payout.payoutId },
      });
      return true;
    });
  }

  private async processEmail(): Promise<boolean> {
    const email = await this.db.transaction(async (manager) => {
      await manager.query(`UPDATE resale_emails SET status = 'FAILED', last_error = 'DELIVERY_UNCONFIRMED',
        lease_until = NULL, lease_token = NULL WHERE status = 'SENDING' AND lease_until <= now() AND attempts >= 5`);
      const notice = await manager
        .getRepository(ResaleEmail)
        .createQueryBuilder('notice')
        .where(
          "((notice.status = 'PENDING' AND notice.nextAttemptAt <= now()) OR (notice.status = 'SENDING' AND notice.leaseUntil <= now() AND notice.attempts < 5))",
        )
        .andWhere(
          `(notice.kind = 'SOLD' OR EXISTS (SELECT 1 FROM resale_emails sold
          WHERE sold.resale_order_id = notice.resale_order_id AND sold.kind = 'SOLD' AND sold.status IN ('SENT','FAILED')))`,
        )
        .orderBy('notice.nextAttemptAt', 'ASC')
        .addOrderBy('notice.createdAt', 'ASC')
        .addOrderBy('notice.emailId', 'ASC')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .take(1)
        .getOne();
      if (!notice) return null;
      notice.status = 'SENDING';
      notice.attempts++;
      notice.leaseToken = generateId('lease');
      notice.leaseUntil = new Date(Date.now() + 120000);
      return manager.save(notice);
    });
    if (!email) return false;
    try {
      await this.mail.sendResaleNotice(
        email.recipient,
        email.kind,
        email.details,
      );
    } catch {
      const delays = [60000, 300000, 900000, 3600000];
      await this.db.getRepository(ResaleEmail).update(
        { emailId: email.emailId, leaseToken: email.leaseToken! },
        {
          status: email.attempts >= 5 ? 'FAILED' : 'PENDING',
          lastError: 'SMTP_SEND_FAILED',
          leaseUntil: null,
          leaseToken: null,
          nextAttemptAt: new Date(
            Date.now() + (delays[email.attempts - 1] ?? 0),
          ),
        },
      );
      this.logger.warn(
        `resale_email_send_failed emailId=${email.emailId} attempt=${email.attempts}`,
      );
      return true;
    }
    await this.db.getRepository(ResaleEmail).update(
      { emailId: email.emailId, leaseToken: email.leaseToken! },
      {
        status: 'SENT',
        sentAt: new Date(),
        lastError: null,
        leaseUntil: null,
        leaseToken: null,
      },
    );
    return true;
  }
}
