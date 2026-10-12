import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { createTransport } from 'nodemailer';
import type { SendMailOptions } from 'nodemailer';
import { DataSource } from 'typeorm';
import { emailRedisConfig } from '../../config/redis/redis.config';
import { checkRedisConnection } from '../../config/redis/redis-connection';
import { EmailOutbox } from './email-outbox.entity';
import { renderEmail } from './email-template';

export interface EmailSender {
  sendMail(message: SendMailOptions): Promise<unknown>;
}
export class EmailRunner {
  private readonly logger = new Logger(EmailRunner.name);
  private queue?: Queue<{ id: string }>;
  private redis?: Redis;
  private worker?: Worker;
  private timer?: NodeJS.Timeout;
  private dispatching?: Promise<void>;
  private sender?: EmailSender;

  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    sender?: EmailSender,
  ) {
    this.sender = sender;
  }

  async start(dispatchOnly = false) {
    if (this.config.get<boolean>('EMAIL_ENABLED', false) !== true)
      throw new Error('EMAIL_ENABLED must be true for the email worker');
    const redisConfig = emailRedisConfig(this.config);
    const { prefix } = redisConfig;
    this.redis = new Redis(redisConfig.producer);
    this.redis.on('error', () => this.logger.warn('email_redis_unavailable'));
    this.queue = new Queue('email', { prefix, connection: this.redis });
    this.queue.on('error', () => this.logger.warn('email_redis_unavailable'));
    try {
      await checkRedisConnection(
        this.redis,
        this.queue.waitUntilReady(),
        redisConfig.startupTimeoutMs,
      );
      this.logger.log('Redis connection successful (PING -> PONG)');
    } catch (error) {
      this.logger.error(
        'Redis connection check failed; email worker not started',
      );
      this.redis.disconnect();
      await this.queue.close().catch(() => undefined);
      this.queue = undefined;
      throw error;
    }
    if (dispatchOnly) return;
    this.sender ??= createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: this.config.getOrThrow<string>('EMAIL_GMAIL_USER'),
        pass: this.config.getOrThrow<string>('EMAIL_GMAIL_APP_PASSWORD'),
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    this.worker = new Worker<{ id: string }>(
      'email',
      async (job) => {
        if (
          job.name !== 'send' ||
          typeof job.data?.id !== 'string' ||
          !/^[a-f0-9]{64}$/.test(job.data.id)
        )
          throw new Error('invalid_email_job');
        await this.deliver(job.data.id);
      },
      {
        prefix,
        connection: redisConfig.worker,
        concurrency: 2,
        limiter: {
          max: this.config.get<number>('EMAIL_RATE_PER_MINUTE', 10),
          duration: 60000,
        },
      },
    );
    this.worker.on('error', () => this.logger.warn('email_worker_unavailable'));
    this.worker.on('failed', () => this.logger.warn('email_delivery_failed'));
    this.timer = setInterval(() => {
      if (!this.dispatching) {
        this.dispatching = this.dispatch()
          .catch(() => {
            this.logger.warn('email_dispatch_failed');
          })
          .finally(() => {
            this.dispatching = undefined;
          });
      }
    }, 5000);
    await this.dispatch().catch(() => {
      this.logger.warn('email_dispatch_failed');
    });
  }

  async dispatch() {
    if (!this.queue) throw new Error('Email queue is not started');
    await this.db.transaction(async (manager) => {
      const messages = await manager
        .getRepository(EmailOutbox)
        .createQueryBuilder('email')
        .where('email.status = :status AND email.nextDispatchAt <= :now', {
          status: 'pending',
          now: new Date(),
        })
        .orderBy('email.createdAt', 'ASC')
        .limit(25)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();
      for (const message of messages) {
        if (message.attempts >= 5) {
          message.status = 'failed';
          await manager.save(message);
          continue;
        }
        const existing = await this.queue!.getJob(message.id);
        if (existing) {
          const state = await existing.getState();
          if (state === 'failed' || state === 'completed')
            await existing.retry(state);
        } else {
          await this.queue!.add(
            'send',
            { id: message.id },
            {
              jobId: message.id,
              attempts: 5,
              backoff: { type: 'exponential', delay: 10000 },
              removeOnComplete: { count: 1000 },
              removeOnFail: false,
            },
          );
        }
        // Periodic reconciliation also recovers pending messages after Redis loss.
        message.nextDispatchAt = new Date(Date.now() + 120000);
        await manager.save(message);
      }
    });
  }

  async deliver(id: string) {
    if (!this.sender) throw new Error('Email sender is not started');
    const failed = await this.db.transaction(async (manager) => {
      // Serialize duplicate/stalled jobs across workers. Only the outbox row is locked.
      const message = await manager.findOne(EmailOutbox, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!message || message.status !== 'pending') return false;
      if (message.attempts >= 5) {
        message.status = 'failed';
        await manager.save(message);
        return false;
      }
      message.attempts += 1;
      try {
        await this.sender!.sendMail({
          from: {
            name: 'TicketVerse',
            address: this.config.getOrThrow<string>('EMAIL_GMAIL_USER'),
          },
          to: { address: message.recipient, name: '' },
          messageId: `<${message.id}@ticketverse.invalid>`,
          ...renderEmail(message),
          disableFileAccess: true,
          disableUrlAccess: true,
        });
        message.status = 'sent';
        message.sentAt = new Date();
        message.lastErrorCode = null;
      } catch {
        message.lastErrorCode = 'smtp_delivery_failed';
        if (message.attempts >= 5) message.status = 'failed';
      }
      await manager.save(message);
      return message.status !== 'sent';
    });
    // Throw only after persisting failure; BullMQ handles backoff outside the transaction.
    if (failed) throw new Error('smtp_delivery_failed');
  }

  async retry(id: string) {
    if (!/^[a-f0-9]{64}$/.test(id) || !this.queue)
      throw new Error('Invalid retry ID or queue not started');
    await this.db.transaction(async (manager) => {
      const message = await manager.findOne(EmailOutbox, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!message || message.status !== 'failed')
        throw new Error('Only failed emails can be retried');
      const job = await this.queue!.getJob(id);
      if (job) {
        const state = await job.getState();
        if (!['failed', 'completed'].includes(state))
          throw new Error('Job is still running; retry later');
        await job.remove();
      }
      message.status = 'pending';
      message.attempts = 0;
      message.lastErrorCode = null;
      message.nextDispatchAt = new Date();
      await manager.save(message);
    });
  }

  async close() {
    if (this.timer) clearInterval(this.timer);
    await this.dispatching;
    try {
      await this.worker?.close();
    } finally {
      try {
        await this.queue?.close();
      } finally {
        this.redis?.disconnect();
      }
    }
  }
}
