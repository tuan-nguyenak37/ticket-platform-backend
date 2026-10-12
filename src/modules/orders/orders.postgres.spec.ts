import 'reflect-metadata';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { parse } from 'dotenv';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import {
  Order,
  OrderDispute,
  OrderPayment,
  OrderStatus,
  PaymentStatus,
} from './order.entity';
import { OrderStore } from './order-store.service';
import { OrdersService } from './orders.service';
import { OrderPaymentsService } from './order-payments.service';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/entities/enums/user-role.enum';
import { UserStatus } from '../users/entities/enums/user-status.enum';
import { Event } from '../events/entities/event.entity';
import { EventCategory } from '../events/entities/event-category.entity';
import { EventStatus } from '../events/entities/enums/event-status.enum';
import { Ticket } from '../tickets/entities/ticket.entity';
import { TicketStatus } from '../tickets/entities/enums/ticket-status.enum';
import type { Principal } from '../auth/authorization/principal';
import { UploadsService } from '../../common/uploads/uploads.service';
import { Test } from '@nestjs/testing';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { OrdersController } from './orders.controller';
import { AccessTokenGuard } from '../auth/jwt/access-token.guard';
import { RolesGuard } from '../auth/authorization/roles.guard';
import { AuditService } from '../auth/authorization/audit.service';
import { TokenService } from '../auth/jwt/token.service';
import { UsersService } from '../users/users.service';
import { configureApp } from '../../configure-app';
import { join } from 'path';
import { Readable } from 'stream';
import { TicketsService } from '../tickets/tickets.service';
import { TicketCheck } from '../tickets/entities/ticket-check.entity';
import { TicketReview } from '../tickets/entities/ticket-review.entity';
import { LocalTicketScanner } from '../tickets/review/local-ticket-scanner.service';
import { TicketCheckWorker } from '../tickets/review/ticket-check-worker.service';
import { TicketReportService } from '../tickets/review/ticket-report.service';
import { TicketReviewService } from '../tickets/review/ticket-review.service';
import { CheckStatus } from '../tickets/review/check.types';
import { EmailOutbox } from '../email/email-outbox.entity';
import { DisputeEvidenceService } from './dispute-evidence.service';
import { DisputeEvidenceController } from './dispute-evidence.controller';
import { readdir, rm } from 'fs/promises';

// Explicit opt-in. Only a newly-created random schema is written or dropped.
const suite = process.env.ORDERS_PG_TEST === '1' ? describe : describe.skip;
suite('Orders with real PostgreSQL transactions', () => {
  jest.setTimeout(60000);
  let db: DataSource;
  let adminDb: DataSource;
  let app: INestApplication<App>;
  let schemaCreated = false;
  const schema = `orders_test_${randomUUID().replaceAll('-', '')}`;
  let orders: OrdersService;
  let payments: OrderPaymentsService;
  let store: OrderStore;
  let evidence: DisputeEvidenceService;
  const buyer: Principal = {
    user_id: 'buyer',
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    tokenVersion: 0,
  };
  const other: Principal = { ...buyer, user_id: 'other' };
  const seller: Principal = { ...buyer, user_id: 'seller' };
  const admin: Principal = { ...buyer, user_id: 'admin', role: UserRole.ADMIN };
  const upload = {
    readTicketFile: jest.fn().mockResolvedValue({
      buffer: Buffer.from('ticket'),
      mimetype: 'application/pdf',
    }),
  };
  let event: Event;
  let ticket: Ticket;

  beforeAll(async () => {
    const env = parse(readFileSync('.env'));
    const host = process.env.ORDERS_TEST_DB_HOST ?? env.DB_HOST;
    if (
      !['localhost', '127.0.0.1', '::1'].includes(host) ||
      env.NODE_ENV === 'production'
    )
      throw new Error(
        'Integration tests require a local non-production database',
      );
    const connection = {
      type: 'postgres' as const,
      host,
      port: Number(process.env.ORDERS_TEST_DB_PORT ?? env.DB_PORT ?? 5432),
      username: process.env.ORDERS_TEST_DB_USERNAME ?? env.DB_USERNAME,
      password: process.env.ORDERS_TEST_DB_PASSWORD ?? env.DB_PASSWORD,
      database: process.env.ORDERS_TEST_DB_NAME ?? env.DB_NAME,
    };
    adminDb = await new DataSource(connection).initialize();
    await adminDb.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    const baseDb = await new DataSource({
      ...connection,
      schema,
      entities: [User, EventCategory, Event, Ticket],
      synchronize: true,
    }).initialize();
    await baseDb.destroy();
    db = await new DataSource({
      ...connection,
      schema,
      entities: [
        User,
        EventCategory,
        Event,
        Ticket,
        TicketCheck,
        TicketReview,
        Order,
        OrderPayment,
        OrderDispute,
        EmailOutbox,
      ],
      synchronize: false,
    }).initialize();
    const runner = db.createQueryRunner();
    try {
      await runner.connect();
      await runner.query(`SET search_path TO "${schema}", pg_catalog`);
      const sql = readFileSync('docs/orders-schema.sql', 'utf8');
      await runner.query(sql);
      await runner.query(sql);
      await runner.query(
        readFileSync('docs/ticket-review-automation.sql', 'utf8'),
      );
      await runner.query(readFileSync('docs/email-schema.sql', 'utf8'));
      await runner.query(
        readFileSync('docs/account-moderation-dispute-evidence.sql', 'utf8'),
      );
      await runner.query(
        readFileSync('docs/account-moderation-dispute-evidence.sql', 'utf8'),
      );
    } finally {
      await runner.release();
    }
    store = new OrderStore(db);
    const config = new ConfigService({
      NODE_ENV: 'test',
      PAYMENT_MOCK_ENABLED: true,
      EMAIL_ENABLED: true,
    });
    orders = new OrdersService(
      store,
      config,
      upload as unknown as UploadsService,
    );
    payments = new OrderPaymentsService(store, orders, config);
    evidence = new DisputeEvidenceService(
      store,
      new UploadsService(
        new ConfigService({ UPLOAD_DIR: join('.tmp', schema) }),
      ),
    );
    for (const actor of [buyer, other, seller, admin])
      await db.getRepository(User).save({
        user_id: actor.user_id,
        email: `${actor.user_id}@orders.test`,
        password: 'unused-test-hash',
        role: actor.role,
      });
    await db
      .getRepository(EventCategory)
      .save({ category_id: 'category', name: 'Music', slug: 'music' });
    const reflector = new Reflector();
    const audit = new AuditService();
    const tokenService = {
      verifyAccessToken: jest.fn((token: string) => {
        if (![buyer, other, seller, admin].some((a) => a.user_id === token))
          throw new UnauthorizedException();
        return { user_id: token, tokenVersion: 0 };
      }),
    } as unknown as TokenService;
    const usersService = {
      findById: (id: string) =>
        db.getRepository(User).findOneBy({ user_id: id }),
    } as unknown as UsersService;
    const module = await Test.createTestingModule({
      controllers: [OrdersController, DisputeEvidenceController],
      providers: [
        { provide: DisputeEvidenceService, useValue: evidence },
        { provide: OrdersService, useValue: orders },
        { provide: OrderPaymentsService, useValue: payments },
        {
          provide: APP_GUARD,
          useValue: new AccessTokenGuard(
            reflector,
            tokenService,
            usersService,
            audit,
          ),
        },
        { provide: APP_GUARD, useValue: new RolesGuard(reflector, audit) },
      ],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    await rm(join('.tmp', schema), { recursive: true, force: true });
    if (db?.isInitialized) await db.destroy();
    if (adminDb?.isInitialized) {
      if (schemaCreated && /^orders_test_[a-f0-9]{32}$/.test(schema))
        await adminDb.query(`DROP SCHEMA "${schema}" CASCADE`);
      await adminDb.destroy();
    }
  });

  beforeEach(async () => {
    upload.readTicketFile.mockResolvedValue({
      buffer: Buffer.from('ticket'),
      mimetype: 'application/pdf',
    });
    event = await db.getRepository(Event).save({
      event_id: randomUUID(),
      name: 'Concert',
      startTime: new Date(Date.now() + 3600000),
      endTime: new Date(Date.now() + 7200000),
      venueName: 'Hall',
      address: 'City',
      categoryId: 'category',
      createdBy: 'seller',
      status: EventStatus.PUBLISHED,
    });
    ticket = await db.getRepository(Ticket).save({
      ticket_id: randomUUID(),
      eventId: event.event_id,
      sellerId: seller.user_id,
      ticketTier: 'VIP',
      originalPrice: 100000,
      price: 80000,
      status: TicketStatus.AVAILABLE,
      ticketFileUrl: '/private?file=11111111-1111-4111-8111-111111111111.pdf',
    });
  });

  async function pending(actor = buyer) {
    const order = await orders.create(
      actor,
      { ticketId: ticket.ticket_id },
      randomUUID(),
    );
    await payments.start(actor, order.order_id);
    return order.order_id;
  }

  it('uploads private evidence for both parties, enforces HTTP access and preserves it after resolution', async () => {
    const id = await pending();
    await payments.result(buyer, id, 'success');
    await orders.dispute(buyer, id, {
      reason: 'Invalid ticket',
      evidence: 'Gate refused entry',
    });
    const bytes = Buffer.from('%PDF-1.4\nEvidence test\n%%EOF');
    const path = `/api/orders/me/${id}/dispute/evidence`;
    await request(app.getHttpServer())
      .post(path)
      .attach('file', bytes, 'proof.pdf')
      .expect(401);
    await request(app.getHttpServer())
      .post(path)
      .auth('other', { type: 'bearer' })
      .attach('file', bytes, 'proof.pdf')
      .expect(404);
    await request(app.getHttpServer())
      .post(path)
      .auth('buyer', { type: 'bearer' })
      .attach('file', Buffer.from('<script>bad</script>'), {
        filename: 'fake.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(path)
      .auth('buyer', { type: 'bearer' })
      .expect(400);
    await request(app.getHttpServer())
      .post(path)
      .auth('buyer', { type: 'bearer' })
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), 'large.pdf')
      .expect(413);
    for (const actor of [buyer, seller]) {
      await request(app.getHttpServer())
        .post(path)
        .auth(actor.user_id, { type: 'bearer' })
        .attach('file', bytes, 'proof.pdf')
        .expect(201);
    }
    const detail = await orders.detail(buyer, id);
    expect(detail.dispute!.attachments).toHaveLength(2);
    expect(detail.dispute!.attachments[0]).not.toHaveProperty('filename');
    const download = detail.dispute!.attachments[0].downloadUrl;
    await request(app.getHttpServer()).get(download).expect(401);
    await request(app.getHttpServer())
      .get(download)
      .auth('other', { type: 'bearer' })
      .expect(403);
    for (const actor of [buyer, seller, admin]) {
      const res = await request(app.getHttpServer())
        .get(download)
        .auth(actor.user_id, { type: 'bearer' })
        .expect(200);
      expect(res.body).toEqual(bytes);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['content-disposition']).toBe('attachment');
    }
    await orders.resolve(admin, id, {
      decision: 'reject',
      note: 'Reviewed proof',
    });
    await request(app.getHttpServer())
      .post(path)
      .auth('buyer', { type: 'bearer' })
      .attach('file', bytes, 'proof.pdf')
      .expect(409);
    await request(app.getHttpServer())
      .get(download)
      .auth('admin', { type: 'bearer' })
      .expect(200);
  });

  it('serializes simultaneous evidence uploads so each party cannot exceed five files', async () => {
    const id = await pending();
    await payments.result(buyer, id, 'success');
    await orders.dispute(buyer, id, {
      reason: 'Invalid ticket',
      evidence: 'Proof',
    });
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(app.getHttpServer())
          .post(`/api/orders/me/${id}/dispute/evidence`)
          .auth('buyer', { type: 'bearer' })
          .attach('file', Buffer.from('%PDF-1.4\nproof'), 'proof.pdf'),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.status === 409)).toHaveLength(1);
    expect((await orders.detail(buyer, id)).dispute!.attachments).toHaveLength(
      5,
    );
  });

  it('cleans up evidence on database rollback', async () => {
    const id = await pending();
    await payments.result(buyer, id, 'success');
    await orders.dispute(buyer, id, {
      reason: 'Invalid ticket',
      evidence: 'Proof',
    });
    const before = await readdir(join('.tmp', schema, 'disputes')).catch(
      () => [],
    );
    const fail = jest
      .spyOn(store, 'response')
      .mockRejectedValueOnce(new Error('simulated DB failure'));
    try {
      await expect(
        evidence.upload(buyer, id, {
          buffer: Buffer.from('%PDF-1.4\nproof'),
          mimetype: 'application/pdf',
        } as Express.Multer.File),
      ).rejects.toThrow('simulated DB failure');
    } finally {
      fail.mockRestore();
    }
    const after = await readdir(join('.tmp', schema, 'disputes')).catch(
      () => [],
    );
    expect(after.sort()).toEqual(before.sort());
    expect((await orders.detail(buyer, id)).dispute!.attachments).toHaveLength(
      0,
    );
  });

  it('updates account status atomically and rejects stale token rotation', async () => {
    const repo = db.getRepository(User);
    const users = new UsersService(repo);
    const target = await repo.save({
      user_id: randomUUID(),
      email: `${randomUUID()}@test.local`,
      password: 'unused',
      role: UserRole.USER,
    });
    const results = await Promise.allSettled([
      users.updateStatus(admin, target.user_id, {
        status: UserStatus.SUSPENDED,
        reason: 'Review',
      }),
      users.rotateTokenVersion(target),
    ]);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    // A login CAS may win first, in which case an admin retries after reloading.
    await users.updateStatus(admin, target.user_id, {
      status: UserStatus.SUSPENDED,
      reason: 'Review',
    });
    await expect(users.rotateTokenVersion(target)).rejects.toThrow();
    await users.updateStatus(admin, target.user_id, {
      status: UserStatus.ACTIVE,
      reason: 'Review complete',
    });
    const updated = await repo.findOneByOrFail({ user_id: target.user_id });
    expect(updated.tokenVersion).toBeGreaterThan(target.tokenVersion);
    expect(updated.statusChangedBy).toBe(admin.user_id);
    expect(updated.statusReason).toBe('Review complete');
    await expect(users.rotateTokenVersion(target)).rejects.toThrow();
  });

  (process.env.TICKET_OCR_TEST === '1' ? it : it.skip)(
    'uploads a PDF, runs real OCR, approves it and delivers the original file after payment',
    async () => {
      const env = parse(readFileSync('.env'));
      const config = new ConfigService({
        ...env,
        NODE_ENV: 'test',
        PAYMENT_MOCK_ENABLED: true,
        EMAIL_ENABLED: true,
        TICKET_AUTO_APPROVE_ENABLED: false,
        TICKET_CODE_HMAC_SECRET: randomUUID() + randomUUID(),
        UPLOAD_DIR: join('.tmp', schema),
      });
      const previousTessdata = process.env.TESSDATA_PREFIX;
      if (env.TESSDATA_PREFIX)
        process.env.TESSDATA_PREFIX = env.TESSDATA_PREFIX;
      const uploads = new UploadsService(config);
      const reports = new TicketReportService(config);
      const reviews = new TicketReviewService(db, config, reports);
      const worker = new TicketCheckWorker(
        db,
        config,
        new LocalTicketScanner(config),
        uploads,
        reports,
        reviews,
      );
      let filename: string | null = null;
      try {
        await db.getRepository(Event).update(event.event_id, {
          name: 'Demo Concert',
          venueName: 'Demo Hall',
          startTime: new Date('2028-12-20T12:00:00Z'),
          endTime: new Date('2028-12-20T15:00:00Z'),
        });
        const buffer = readFileSync('.tmp/postman-files/ticket.pdf');
        const created = await new TicketsService(db, uploads).create(
          seller,
          {
            eventId: event.event_id,
            ticketTier: 'VIP',
            seatInfo: 'A12',
            originalPrice: 500000,
            price: 400000,
          },
          {
            ticketFile: [
              {
                fieldname: 'ticketFile',
                originalname: 'ticket.pdf',
                mimetype: 'application/pdf',
                encoding: '7bit',
                buffer,
                size: buffer.length,
                stream: Readable.from(buffer),
                destination: '',
                filename: '',
                path: '',
              },
            ],
          },
        );
        const stored = await db
          .getRepository(Ticket)
          .findOneByOrFail({ ticket_id: created.ticket_id });
        filename = new URL(
          stored.ticketFileUrl,
          'http://local',
        ).searchParams.get('file');
        expect(created.status).toBe(TicketStatus.PENDING_REVIEW);
        await worker.start();
        const deadline = Date.now() + 45000;
        let check: TicketCheck;
        do {
          check = await db
            .getRepository(TicketCheck)
            .findOneByOrFail({ ticketId: created.ticket_id });
          if (
            [CheckStatus.COMPLETED, CheckStatus.FAILED].includes(check.status)
          )
            break;
          await new Promise<void>((resolve) => setTimeout(resolve, 250));
        } while (Date.now() < deadline);
        expect({ status: check.status, error: check.errorCode }).toEqual({
          status: CheckStatus.COMPLETED,
          error: null,
        });
        expect(check.scan?.codes).toHaveLength(1);
        expect(check.scan?.fields.originalPrice.value).toBe('500000');
        expect(
          (
            await db
              .getRepository(Ticket)
              .findOneByOrFail({ ticket_id: created.ticket_id })
          ).status,
        ).toBe(TicketStatus.PENDING_REVIEW);
        await reviews.review(admin, created.ticket_id, {
          decision: 'approve',
          checkVersion: check.version,
          selectedCodeId: check.scan!.codes[0].id,
          note: 'Reviewed synthetic PDF and OCR warnings in isolated integration test.',
        });
        expect(
          await db.getRepository(EmailOutbox).findOneByOrFail({
            referenceId: created.ticket_id,
            kind: 'ticket_approved',
          }),
        ).toMatchObject({ recipientId: seller.user_id, status: 'pending' });
        const realOrders = new OrdersService(store, config, uploads);
        const realPayments = new OrderPaymentsService(
          store,
          realOrders,
          config,
        );
        const order = await realOrders.create(
          buyer,
          { ticketId: created.ticket_id },
          randomUUID(),
        );
        await realPayments.start(buyer, order.order_id);
        expect(
          (await realPayments.result(buyer, order.order_id, 'success')).status,
        ).toBe(OrderStatus.PAID);
        const delivered = await realOrders.file(buyer, order.order_id);
        expect(delivered.buffer).toEqual(buffer);
        expect(delivered.mimetype).toBe('application/pdf');
        expect(
          (
            await db
              .getRepository(Order)
              .findOneByOrFail({ order_id: order.order_id })
          ).status,
        ).toBe(OrderStatus.DELIVERED);
      } finally {
        await worker.onApplicationShutdown();
        if (filename) await uploads.removeTicketFile(filename);
        if (previousTessdata === undefined) delete process.env.TESSDATA_PREFIX;
        else process.env.TESSDATA_PREFIX = previousTessdata;
      }
    },
  );

  it('two successful payments allocate exactly one ticket and refund the loser', async () => {
    const a = await pending(buyer);
    const b = await pending(other);
    expect(
      (
        await db
          .getRepository(Ticket)
          .findOneByOrFail({ ticket_id: ticket.ticket_id })
      ).status,
    ).toBe(TicketStatus.AVAILABLE);
    const results = await Promise.all([
      payments.result(buyer, a, 'success'),
      payments.result(other, b, 'success'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(
      [OrderStatus.PAID, OrderStatus.REFUND_PENDING].sort(),
    );
    expect(
      await db
        .getRepository(Order)
        .countBy({ ticketId: ticket.ticket_id, allocated: true }),
    ).toBe(1);
    const sold = await db
      .getRepository(Ticket)
      .findOneByOrFail({ ticket_id: ticket.ticket_id });
    expect(sold.buyerId).toBe(
      results.find((r) => r.status === OrderStatus.PAID)!.buyerId,
    );
    const loser = results.find((r) => r.status === OrderStatus.REFUND_PENDING)!;
    const winner = results.find((r) => r.status === OrderStatus.PAID)!;
    expect(
      (
        await db
          .getRepository(EmailOutbox)
          .findBy({ referenceId: winner.order_id, kind: 'order_paid' })
      )
        .map((m) => m.recipientId)
        .sort(),
    ).toEqual([winner.buyerId, seller.user_id].sort());
    expect(
      await db.getRepository(EmailOutbox).findOneByOrFail({
        referenceId: loser.order_id,
        kind: 'refund_pending',
      }),
    ).toMatchObject({ recipientId: loser.buyerId });
    await payments.result(
      winner.buyerId === buyer.user_id ? buyer : other,
      winner.order_id,
      'success',
    );
    expect(
      await db
        .getRepository(EmailOutbox)
        .countBy({ referenceId: winner.order_id, kind: 'order_paid' }),
    ).toBe(2);
    const refunded = await payments.refund(admin, loser.order_id);
    expect(refunded.status).toBe(OrderStatus.REFUNDED);
    await expect(
      orders.file(
        loser.buyerId === buyer.user_id ? buyer : other,
        loser.order_id,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect((await payments.refund(admin, loser.order_id)).status).toBe(
      OrderStatus.REFUNDED,
    );
  });

  it('concurrent create retries and result retries do not duplicate orders or payments', async () => {
    const key = randomUUID();
    const results = await Promise.all([
      orders.create(buyer, { ticketId: ticket.ticket_id }, key),
      orders.create(buyer, { ticketId: ticket.ticket_id }, key),
    ]);
    expect(results[0].order_id).toBe(results[1].order_id);
    await expect(
      orders.create(buyer, { ticketId: 'different' }, key),
    ).rejects.toMatchObject({ status: 409 });
    const id = results[0].order_id;
    await Promise.all([payments.start(buyer, id), payments.start(buyer, id)]);
    await Promise.all([
      payments.result(buyer, id, 'success'),
      payments.result(buyer, id, 'success'),
    ]);
    expect(await db.getRepository(OrderPayment).countBy({ orderId: id })).toBe(
      1,
    );
    await expect(payments.result(buyer, id, 'failed')).rejects.toMatchObject({
      status: 409,
    });
  });

  it('late success after cancellation or expiry becomes a refund, never a sale', async () => {
    const a = await pending();
    await orders.cancel(buyer, a);
    expect((await payments.result(buyer, a, 'success')).status).toBe(
      OrderStatus.REFUND_PENDING,
    );
    const b = await pending();
    await db
      .getRepository(Order)
      .update(b, { expiresAt: new Date(Date.now() - 1000) });
    expect((await payments.result(buyer, b, 'success')).status).toBe(
      OrderStatus.REFUND_PENDING,
    );
    expect(
      (
        await db
          .getRepository(Ticket)
          .findOneByOrFail({ ticket_id: ticket.ticket_id })
      ).status,
    ).toBe(TicketStatus.AVAILABLE);
  });

  it('cancellation racing payment leaves a coherent sale or refund', async () => {
    const id = await pending();
    await Promise.allSettled([
      orders.cancel(buyer, id),
      payments.result(buyer, id, 'success'),
    ]);
    const order = await db
      .getRepository(Order)
      .findOneByOrFail({ order_id: id });
    const t = await db
      .getRepository(Ticket)
      .findOneByOrFail({ ticket_id: ticket.ticket_id });
    expect([OrderStatus.PAID, OrderStatus.REFUND_PENDING]).toContain(
      order.status,
    );
    expect(t.status).toBe(
      order.status === OrderStatus.PAID
        ? TicketStatus.SOLD
        : TicketStatus.AVAILABLE,
    );
  });

  it('rolls back ticket sale if saving the order fails', async () => {
    const id = await pending();
    await db.query(
      `ALTER TABLE "${schema}".orders ADD CONSTRAINT test_block_paid CHECK (status <> 'paid') NOT VALID`,
    );
    try {
      await expect(payments.result(buyer, id, 'success')).rejects.toBeDefined();
    } finally {
      await db.query(
        `ALTER TABLE "${schema}".orders DROP CONSTRAINT test_block_paid`,
      );
    }
    expect(
      (
        await db
          .getRepository(Ticket)
          .findOneByOrFail({ ticket_id: ticket.ticket_id })
      ).status,
    ).toBe(TicketStatus.AVAILABLE);
    expect(
      (await db.getRepository(OrderPayment).findOneByOrFail({ orderId: id }))
        .receivedResult,
    ).toBeNull();
    expect(
      await db.getRepository(EmailOutbox).countBy({ referenceId: id }),
    ).toBe(0);
    expect((await payments.result(buyer, id, 'success')).status).toBe(
      OrderStatus.PAID,
    );
  });

  it('enforces ownership, self-purchase, private file and dispute management rules', async () => {
    await expect(
      orders.create(seller, { ticketId: ticket.ticket_id }, randomUUID()),
    ).rejects.toMatchObject({ status: 400 });
    const id = await pending();
    await expect(orders.detail(other, id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(payments.start(other, id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(orders.file(buyer, id)).rejects.toMatchObject({ status: 409 });
    await payments.result(buyer, id, 'success');
    await orders.file(buyer, id);
    await expect(orders.file(seller, id)).rejects.toMatchObject({
      status: 404,
    });
    await orders.dispute(buyer, id, {
      reason: 'Wrong tier',
      evidence: 'Ticket image differs from listing',
    });
    await orders.reply(seller, id, 'Seller evidence');
    await expect(
      orders.resolve({ ...buyer, role: UserRole.ADMIN }, id, {
        decision: 'accept',
        note: 'Own order',
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(payments.payout(admin, id)).rejects.toMatchObject({
      status: 409,
    });
    expect(
      (
        await orders.resolve(admin, id, {
          decision: 'accept',
          note: 'Evidence confirmed',
        })
      ).status,
    ).toBe(OrderStatus.REFUND_PENDING);
    await payments.refund(admin, id);
    const notifications = await db
      .getRepository(EmailOutbox)
      .findBy({ referenceId: id });
    expect(
      notifications
        .filter((m) => m.kind === 'dispute_opened')
        .map((m) => m.recipientId),
    ).toEqual([seller.user_id]);
    expect(
      notifications
        .filter((m) => m.kind === 'dispute_replied')
        .map((m) => m.recipientId),
    ).toEqual([buyer.user_id]);
    expect(
      notifications
        .filter((m) => m.kind === 'dispute_accepted')
        .map((m) => m.recipientId)
        .sort(),
    ).toEqual([buyer.user_id, seller.user_id].sort());
    expect(
      notifications
        .filter((m) => m.kind === 'refunded')
        .map((m) => m.recipientId),
    ).toEqual([buyer.user_id]);
    await expect(orders.file(buyer, id)).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await db
          .getRepository(Ticket)
          .findOneByOrFail({ ticket_id: ticket.ticket_id })
      ).status,
    ).toBe(TicketStatus.SOLD);
  });

  it('keeps paid orders recoverable when file I/O fails', async () => {
    const id = await pending();
    await payments.result(buyer, id, 'success');
    upload.readTicketFile.mockRejectedValueOnce(new Error('File unavailable'));
    await expect(orders.file(buyer, id)).rejects.toThrow('File unavailable');
    expect((await orders.detail(buyer, id)).status).toBe(OrderStatus.PAID);
    await orders.file(buyer, id);
    expect((await orders.detail(buyer, id)).status).toBe(OrderStatus.DELIVERED);
  });

  it('expires pending orders and completes delivered orders, but not open disputes', async () => {
    const id = await pending();
    await payments.result(buyer, id, 'success');
    await orders.file(buyer, id);
    await db.getRepository(Event).update(event.event_id, {
      startTime: new Date(Date.now() - 4 * 86400000),
      endTime: new Date(Date.now() - 2 * 86400000),
    });
    await db
      .getRepository(Order)
      .update(id, { disputeUntil: new Date(Date.now() - 1000) });
    await orders.sweep();
    expect((await orders.detail(buyer, id)).status).toBe(OrderStatus.COMPLETED);
    expect((await payments.payout(admin, id)).payoutStatus).toBe('paid');
    expect((await payments.payout(admin, id)).payoutStatus).toBe('paid');
  });

  it('event cancellation triggers refunds and prevents late allocation', async () => {
    const id = await pending();
    await db
      .getRepository(Event)
      .update(event.event_id, { status: EventStatus.CANCELLED });
    expect((await payments.result(buyer, id, 'success')).status).toBe(
      OrderStatus.REFUND_PENDING,
    );
  });

  it('failed payment can never be converted to success by a conflicting retry', async () => {
    const id = await pending();
    expect((await payments.result(buyer, id, 'failed')).status).toBe(
      OrderStatus.CANCELLED,
    );
    await expect(payments.result(buyer, id, 'success')).rejects.toMatchObject({
      status: 409,
    });
    expect(
      (await db.getRepository(OrderPayment).findOneByOrFail({ orderId: id }))
        .status,
    ).toBe(PaymentStatus.FAILED);
  });

  it('blocks mock actions outside explicit development/test configuration', () => {
    for (const config of [
      { NODE_ENV: 'production', PAYMENT_MOCK_ENABLED: true },
      { NODE_ENV: 'test', PAYMENT_MOCK_ENABLED: false },
      { NODE_ENV: 'provision', PAYMENT_MOCK_ENABLED: true },
    ]) {
      const service = new OrderPaymentsService(
        store,
        orders,
        new ConfigService(config),
      );
      expect(() => service.requireMock()).toThrow('Mock payments are disabled');
    }
  });

  it('HTTP guards, ownership and DTOs reject forged financial data', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/api/orders')
      .send({ ticketId: ticket.ticket_id })
      .expect(401);
    await request(server)
      .get('/api/orders/manage')
      .set('Authorization', 'Bearer buyer')
      .expect(403);
    await request(server)
      .post('/api/orders')
      .set('Authorization', 'Bearer buyer')
      .set('Idempotency-Key', randomUUID())
      .send({ ticketId: ticket.ticket_id, amount: 1, buyerId: 'other' })
      .expect(400);
    const created = await request(server)
      .post('/api/orders')
      .set('Authorization', 'Bearer buyer')
      .set('Idempotency-Key', randomUUID())
      .send({ ticketId: ticket.ticket_id })
      .expect(201);
    const id = (created.body as { order_id: string }).order_id;
    await request(server)
      .get(`/api/orders/me/${id}`)
      .set('Authorization', 'Bearer other')
      .expect(404);
    await request(server)
      .post(`/api/orders/me/${id}/payment`)
      .set('Authorization', 'Bearer buyer')
      .expect(200);
    await request(server)
      .post(`/api/orders/me/${id}/payment/mock-result`)
      .set('Authorization', 'Bearer buyer')
      .send({ result: 'success', amount: 1 })
      .expect(400);
    await request(server)
      .post(`/api/orders/me/${id}/payment/mock-result`)
      .set('Authorization', 'Bearer buyer')
      .send({ result: 'success' })
      .expect(200);
    await request(server)
      .get(`/api/orders/me/${id}/file`)
      .set('Authorization', 'Bearer buyer')
      .expect('Cache-Control', 'no-store')
      .expect(200);
    const detail = await request(server)
      .get(`/api/orders/me/${id}`)
      .set('Authorization', 'Bearer buyer')
      .expect(200);
    expect(detail.body).not.toHaveProperty('idempotencyKey');
    expect(detail.body).not.toHaveProperty('allocated');
    expect((detail.body as { ticket: unknown }).ticket).not.toHaveProperty(
      'ticketFileUrl',
    );
  });

  it('worker expires unpaid orders and leaves disputes blocked after the deadline', async () => {
    const unpaid = await pending(other);
    await db
      .getRepository(Order)
      .update(unpaid, { expiresAt: new Date(Date.now() - 1000) });
    await orders.sweep();
    expect((await orders.detail(other, unpaid)).status).toBe(
      OrderStatus.EXPIRED,
    );
    const id = await pending();
    await payments.result(buyer, id, 'success');
    await orders.file(buyer, id);
    await orders.dispute(buyer, id, {
      reason: 'Rejected at entry',
      evidence: 'Entry refusal reference',
    });
    await db.getRepository(Event).update(event.event_id, {
      startTime: new Date(Date.now() - 4 * 86400000),
      endTime: new Date(Date.now() - 2 * 86400000),
    });
    await db
      .getRepository(Order)
      .update(id, { disputeUntil: new Date(Date.now() - 1000) });
    await orders.sweep();
    expect((await orders.detail(buyer, id)).payoutStatus).toBe('blocked');
    expect(
      (
        await orders.resolve(admin, id, {
          decision: 'reject',
          note: 'Evidence does not match this ticket',
        })
      ).status,
    ).toBe(OrderStatus.COMPLETED);
  });

  it('refunds a paid order when its event is cancelled', async () => {
    const id = await pending();
    await payments.result(buyer, id, 'success');
    await db
      .getRepository(Event)
      .update(event.event_id, { status: EventStatus.CANCELLED });
    await orders.sweep();
    const result = await orders.detail(buyer, id);
    expect(result.status).toBe(OrderStatus.REFUND_PENDING);
    expect(result.payment?.status).toBe(PaymentStatus.REFUND_PENDING);
  });
});
