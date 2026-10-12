import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { enqueueEmail } from './email-outbox';
import { EmailOutbox } from './email-outbox.entity';
import { renderEmail } from './email-template';
import { envValidationSchema } from '../../config/env.validation';

describe('Email safety and templates', () => {
  const message = {
    kind: 'ticket_rejected',
    referenceId: 'ticket_123',
    reason: '<script>alert("x")</script> & reason',
  } as EmailOutbox;
  it('escapes user text and never embeds ticket contents', () => {
    const rendered = renderEmail(message);
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;');
    expect(rendered.text).toContain(message.reason);
    expect(rendered.text).toContain(message.referenceId);
  });
  it('labels mock financial notifications as demo', () => {
    expect(
      renderEmail({ ...message, kind: 'order_paid', isMock: true }).subject,
    ).toContain('DEMO');
  });
  it('renders notifications without website links or configuration', () => {
    const rendered = renderEmail(message);
    expect(rendered.html).not.toContain('<a');
    expect(rendered.text).not.toMatch(/https?:\/\//);
  });
  it('does not access the database while disabled', async () => {
    const manager = { find: jest.fn() };
    await enqueueEmail(
      manager as unknown as EntityManager,
      new ConfigService(),
      'order_paid',
      'order_1',
      ['buyer'],
    );
    expect(manager.find).not.toHaveBeenCalled();
  });
  it('requires email configuration only when enabled', () => {
    const env = {
      DB_HOST: 'localhost',
      DB_USERNAME: 'test',
      DB_PASSWORD: 'test',
      DB_NAME: 'test',
      JWT_ACCESS_SECRET: 'access',
      JWT_REFRESH_SECRET: 'refresh',
    };
    expect(envValidationSchema.validate(env).error).toBeUndefined();
    expect(
      envValidationSchema.validate({ ...env, EMAIL_ENABLED: true }).error,
    ).toBeDefined();
    expect(
      envValidationSchema.validate({
        ...env,
        EMAIL_ENABLED: true,
        EMAIL_GMAIL_USER: 'sender@gmail.com',
        EMAIL_GMAIL_APP_PASSWORD: 'testapppassword16',
      }).error,
    ).toBeUndefined();
  });
});
