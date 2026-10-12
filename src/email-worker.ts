import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './config/database/database.module';
import { EmailModule } from './modules/email/email.module';
import { EmailRunner } from './modules/email/email-runner';

@Module({ imports: [AppConfigModule, DatabaseModule, EmailModule] })
class EmailWorkerModule {}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(EmailWorkerModule);
  const runner = new EmailRunner(app.get(DataSource), app.get(ConfigService));
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    try {
      await runner.close();
    } finally {
      await app.close();
    }
  };
  process.once('SIGINT', () => void close());
  process.once('SIGTERM', () => void close());
  try {
    if (
      process.argv[2] &&
      (process.argv[2] !== 'retry' || process.argv.length !== 4)
    )
      throw new Error('Usage: worker:email [retry <id>]');
    const retry = process.argv[2] === 'retry';
    await runner.start(retry);
    if (retry) {
      await runner.retry(process.argv[3] || '');
      console.log('email_retry_queued');
      await close();
    }
  } catch {
    await close();
    throw new Error(
      'Email worker startup failed; check configuration and Redis',
    );
  }
}
void bootstrap().catch(() => {
  console.error('email_worker_startup_failed');
  process.exitCode = 1;
});
