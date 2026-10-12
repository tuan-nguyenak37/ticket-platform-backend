import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailOutbox } from './email-outbox.entity';

// API only registers the outbox; Redis and SMTP run in the separate worker.
@Module({ imports: [TypeOrmModule.forFeature([EmailOutbox])] })
export class EmailModule {}
