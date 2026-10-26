import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DataSource, EntityManager } from 'typeorm';
import { MailService } from '../tickets/mail.service';
import { CreateResaleListingDto } from './dto/create-resale-listing.dto';
import { ResaleEmailDetails } from './entities/resale-email.entity';
import { ResaleListing } from './entities/resale-listing.entity';
import { ResaleOrder } from './entities/resale-order.entity';
import {
  enqueueSellerSettlement,
  maskAccount,
  ResaleSettlementService,
} from './resale-settlement.service';

describe('resale seller settlement', () => {
  const account = {
    ticketId: 'ticket_test',
    price: '200019',
    bankName: ' Test Bank ',
    accountHolder: ' SELLER ',
    accountNumber: '001234567890',
  };
  const details: ResaleEmailDetails = {
    eventTitle: 'Đêm nhạc',
    showingName: 'Suất tối',
    ticketTypeName: 'VIP',
    ticketNumber: 1,
    grossAmount: '200019',
    feeAmount: '10000',
    netAmount: '190019',
    bankName: 'Test Bank',
    accountHolder: 'SELLER',
    maskedAccountNumber: maskAccount(account.accountNumber),
    reference: 'rord_test',
  };

  it('normalizes bank names, preserves leading zeroes and validates the account at the API boundary', () => {
    const dto = plainToInstance(CreateResaleListingDto, account);
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.bankName).toBe('Test Bank');
    expect(dto.accountHolder).toBe('SELLER');
    expect(dto.accountNumber).toBe('001234567890');
    for (const invalid of [
      { bankName: ' ' },
      { bankName: 'a'.repeat(101) },
      { accountHolder: 'A\nB' },
      { accountNumber: '12345' },
      { accountNumber: '1'.repeat(31) },
      { accountNumber: 123456 },
      { accountNumber: '1234ab' },
      { price: '0' },
      { price: '1e6' },
    ])
      expect(
        validateSync(
          plainToInstance(CreateResaleListingDto, { ...account, ...invalid }),
        ).length,
      ).toBeGreaterThan(0);
  });

  it('never backfills payout or outbox records for a legacy listing', async () => {
    const insert = jest.fn();
    await enqueueSellerSettlement(
      { insert } as unknown as EntityManager,
      { bankName: null } as ResaleListing,
      {} as ResaleOrder,
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it.each(['production', 'provision', undefined])(
    'cannot simulate a payout in %s',
    async (environment) => {
      const transaction = jest.fn();
      const service = new ResaleSettlementService(
        { transaction } as unknown as DataSource,
        new ConfigService({ NODE_ENV: environment ?? '' }),
        { enabled: () => false } as MailService,
      );
      await service.runOnce();
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('allows operations to stop the worker without discarding pending records', async () => {
    const transaction = jest.fn();
    const service = new ResaleSettlementService(
      { transaction } as unknown as DataSource,
      new ConfigService({
        NODE_ENV: 'test',
        RESALE_SETTLEMENT_WORKER_ENABLED: false,
      }),
      { enabled: () => true } as MailService,
    );
    await service.runOnce();
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each(['SOLD', 'PAYOUT_PROCESSED'] as const)(
    'sends a masked %s email without tickets or a bank credit claim',
    async (kind) => {
      const sendMail = jest
        .fn()
        .mockResolvedValue({ accepted: ['seller@example.test'] });
      const service = new MailService(
        new ConfigService({
          TICKET_EMAIL_ENABLED: true,
          SMTP_FROM: 'mail@example.test',
        }),
      );
      Object.assign(service, { transporter: { sendMail } });
      await service.sendResaleNotice('seller@example.test', kind, details);
      const [message] = sendMail.mock.calls[0] as [
        {
          text: string;
          attachments?: unknown;
          subject: string;
        },
      ];
      expect(message.subject).toContain(
        kind === 'SOLD' ? 'Bán vé thành công' : 'Đã xử lý chi trả',
      );
      expect(message.text).toContain('190.019 ₫');
      expect(message.text).toContain('10.000 ₫');
      expect(message.text).toContain('•••• 7890');
      expect(message.text).not.toContain(account.accountNumber);
      expect(message.attachments).toBeUndefined();
    },
  );

  it('SMTP rejection is an error for the durable retry worker', async () => {
    const service = new MailService(
      new ConfigService({
        TICKET_EMAIL_ENABLED: true,
        SMTP_FROM: 'mail@example.test',
      }),
    );
    Object.assign(service, {
      transporter: { sendMail: jest.fn().mockResolvedValue({ accepted: [] }) },
    });
    await expect(
      service.sendResaleNotice('seller@example.test', 'SOLD', details),
    ).rejects.toThrow('Resale notice could not be sent');
  });
});
