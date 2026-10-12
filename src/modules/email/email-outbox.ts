import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { EntityManager, In } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { EmailKind, EmailOutbox } from './email-outbox.entity';

// Call with the business transaction's manager; never send SMTP from here.
export async function enqueueEmail(
  manager: EntityManager,
  config: ConfigService,
  kind: EmailKind,
  referenceId: string,
  recipientIds: string[],
  reason?: string | null,
) {
  if (config.get<boolean>('EMAIL_ENABLED', false) !== true) return;
  const recipients = await manager.find(User, {
    where: { user_id: In([...new Set(recipientIds)]) },
    select: { user_id: true, email: true },
  });
  for (const user of recipients) {
    const id = createHash('sha256')
      .update(`${kind}:${referenceId}:${user.user_id}`)
      .digest('hex');
    await manager
      .createQueryBuilder()
      .insert()
      .into(EmailOutbox)
      .values({
        id,
        kind,
        referenceId,
        recipientId: user.user_id,
        recipient: user.email,
        reason: reason?.trim().slice(0, 2000) || null,
        isMock:
          !kind.startsWith('ticket_') &&
          config.get<boolean>('PAYMENT_MOCK_ENABLED', false) === true,
      })
      .orIgnore()
      .execute();
  }
}
