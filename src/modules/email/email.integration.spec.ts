import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { parse } from 'dotenv';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Queue } from 'bullmq';
import { createTransport } from 'nodemailer';
import { SMTPServer } from 'smtp-server';
import type { AddressInfo } from 'net';
import { EmailOutbox } from './email-outbox.entity';
import { EmailRunner } from './email-runner';

const suite =
  process.env.EMAIL_INTEGRATION_TEST === '1' ? describe : describe.skip;
suite('Email outbox with PostgreSQL, Redis and local SMTP', () => {
  jest.setTimeout(60000);
  const schema = `email_test_${randomUUID().replaceAll('-', '')}`;
  let db: DataSource;
  let admin: DataSource;
  let created = false;
  let smtp: SMTPServer;
  let config: ConfigService;
  let runner: EmailRunner;
  let queue: Queue;
  let accepted: string[];
  let failNext = false;
  let smtpCalls = 0;
  let recoveredId: string;
  const port = Number(process.env.EMAIL_TEST_REDIS_PORT || 6380);

  beforeAll(async () => {
    const env = parse(readFileSync('.env'));
    if (
      !['localhost', '127.0.0.1', '::1'].includes(env.DB_HOST) ||
      env.NODE_ENV === 'production'
    )
      throw new Error('Local development DB required');
    const connection = {
      type: 'postgres' as const,
      host: env.DB_HOST,
      port: Number(env.DB_PORT || 5432),
      username: env.DB_USERNAME,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
    };
    admin = await new DataSource(connection).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    db = await new DataSource({
      ...connection,
      schema,
      entities: [EmailOutbox],
    }).initialize();
    const sql = db.createQueryRunner();
    try {
      await sql.connect();
      await sql.query(`SET search_path TO "${schema}", pg_catalog`);
      await sql.query(readFileSync('docs/email-schema.sql', 'utf8'));
      await sql.query(readFileSync('docs/email-schema.sql', 'utf8'));
    } finally {
      await sql.release();
    }
    accepted = [];
    smtp = new SMTPServer({
      authOptional: true,
      disabledCommands: ['AUTH', 'STARTTLS'],
      onData(stream, session, callback) {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => {
          smtpCalls++;
          if (failNext) {
            failNext = false;
            callback(
              Object.assign(new Error('Temporary test failure'), {
                responseCode: 451,
              }),
            );
          } else {
            accepted.push(Buffer.concat(chunks).toString());
            callback();
          }
        });
      },
    });
    await new Promise<void>((resolve) => smtp.listen(0, '127.0.0.1', resolve));
    config = new ConfigService({
      EMAIL_ENABLED: true,
      EMAIL_REDIS_URL: `redis://127.0.0.1:${port}/0`,
      EMAIL_QUEUE_PREFIX: schema,
      EMAIL_RATE_PER_MINUTE: 60,
      EMAIL_GMAIL_USER: 'sender@example.test',
    });
    // No credentials or external SMTP connections in this suite.
    const transport = createTransport({
      host: '127.0.0.1',
      port: (smtp.server.address() as AddressInfo).port,
      secure: false,
      ignoreTLS: true,
    });
    runner = new EmailRunner(db, config, transport);
    queue = new Queue('email', {
      prefix: schema,
      connection: { host: '127.0.0.1', port },
    });
  });

  afterAll(async () => {
    await runner?.close();
    if (queue) {
      if (/^email_test_[a-f0-9]{32}$/.test(schema))
        await queue.obliterate({ force: true });
      await queue.close();
    }
    if (smtp) await new Promise<void>((resolve) => smtp.close(resolve));
    if (db?.isInitialized) await db.destroy();
    if (admin?.isInitialized) {
      if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.destroy();
    }
  });

  async function message() {
    return db.getRepository(EmailOutbox).save({
      id: randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''),
      recipientId: 'buyer',
      recipient: 'buyer@example.test',
      kind: 'order_paid',
      referenceId: randomUUID(),
    });
  }
  async function waitSent(id: string) {
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      const row = await db.getRepository(EmailOutbox).findOneByOrFail({ id });
      if (row.status === 'sent') return row;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Timed out waiting for SMTP delivery');
  }

  it('rolls back queued events with a failed transaction', async () => {
    const id = 'a'.repeat(64);
    await expect(
      db.transaction(async (manager) => {
        await manager.insert(EmailOutbox, {
          id,
          recipientId: 'buyer',
          recipient: 'buyer@example.test',
          kind: 'order_paid',
          referenceId: 'rollback',
        });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await db.getRepository(EmailOutbox).countBy({ id })).toBe(0);
  });

  it('keeps the durable event when Redis is unreachable', async () => {
    const row = await message();
    recoveredId = row.id;
    const unavailable = new EmailRunner(
      db,
      new ConfigService({
        EMAIL_ENABLED: true,
        EMAIL_REDIS_URL: 'redis://127.0.0.1:1/0',
        EMAIL_QUEUE_PREFIX: schema,
      }),
    );
    try {
      await expect(unavailable.start(true)).rejects.toBeDefined();
    } finally {
      await unavailable.close();
    }
    expect(
      (await db.getRepository(EmailOutbox).findOneByOrFail({ id: row.id }))
        .status,
    ).toBe('pending');
  });

  it('recovers persisted events and sends through local SMTP with IDs only in Redis', async () => {
    await runner.start();
    await waitSent(recoveredId);
    const row = await message();
    await runner.dispatch();
    expect((await waitSent(row.id)).attempts).toBe(1);
    const job = await queue.getJob(row.id);
    expect(job?.data).toEqual({ id: row.id });
    expect(accepted.some((mail) => mail.includes('buyer@example.test'))).toBe(
      true,
    );
    const calls = smtpCalls;
    await Promise.all([runner.deliver(row.id), runner.deliver(row.id)]);
    expect(smtpCalls).toBe(calls);
  });

  it('retries a temporary SMTP error using BullMQ backoff', async () => {
    const row = await message();
    failNext = true;
    await runner.dispatch();
    const sent = await waitSent(row.id);
    expect(sent.attempts).toBe(2);
    expect(sent.lastErrorCode).toBeNull();
  });

  it('serializes concurrent delivery and recovers a lost Redis job', async () => {
    const row = await message();
    await db
      .getRepository(EmailOutbox)
      .update(row.id, { nextDispatchAt: new Date(Date.now() + 3600000) });
    const calls = smtpCalls;
    await Promise.all([runner.deliver(row.id), runner.deliver(row.id)]);
    expect(smtpCalls).toBe(calls + 1);
    expect((await waitSent(row.id)).attempts).toBe(1);

    const lost = await message();
    await queue.add(
      'send',
      { id: lost.id },
      { jobId: lost.id, delay: 3600000 },
    );
    await (await queue.getJob(lost.id))!.remove();
    await runner.dispatch();
    expect((await waitSent(lost.id)).status).toBe('sent');
  });

  it('retains terminal failures, limits attempts and allows explicit retry', async () => {
    const row = await message();
    // Keep dispatcher away while directly exercising the five-attempt boundary.
    await db
      .getRepository(EmailOutbox)
      .update(row.id, { nextDispatchAt: new Date(Date.now() + 3600000) });
    const sendMail = jest
      .fn()
      .mockRejectedValue(new Error('Secret SMTP detail must not be persisted'));
    const failing = new EmailRunner(db, config, { sendMail });
    for (let i = 0; i < 5; i++)
      await expect(failing.deliver(row.id)).rejects.toThrow(
        'smtp_delivery_failed',
      );
    await failing.deliver(row.id);
    expect(sendMail).toHaveBeenCalledTimes(5);
    expect(
      await db.getRepository(EmailOutbox).findOneByOrFail({ id: row.id }),
    ).toMatchObject({
      status: 'failed',
      attempts: 5,
      lastErrorCode: 'smtp_delivery_failed',
    });
    await runner.retry(row.id);
    await runner.dispatch();
    expect((await waitSent(row.id)).attempts).toBe(1);
  });
});
