import { ConfigService } from '@nestjs/config';
import type { SendMailOptions } from 'nodemailer';
import { MailService } from './mail.service';
import { renderEmail } from './email-template';
import type { ResaleEmailDetails } from './resale-email.types';

describe('TicketVerse email templates', () => {
  function fixture(overrides: Record<string, unknown> = {}) {
    const messages: (Omit<SendMailOptions, 'html' | 'text'> & {
      html: string;
      text: string;
    })[] = [];
    const sendMail = jest.fn((message: SendMailOptions) => {
      if (typeof message.html !== 'string' || typeof message.text !== 'string')
        throw new Error('Both email alternatives must be strings');
      messages.push({ ...message, html: message.html, text: message.text });
      return Promise.resolve({ accepted: ['seller@example.test'] });
    });
    const service = new MailService(
      new ConfigService({
        TICKET_EMAIL_ENABLED: true,
        SMTP_FROM: 'mail@example.test',
        VNPAY_FRONTEND_URL: 'https://ticketverse.example',
        ...overrides,
      }),
    );
    Object.assign(service, { transporter: { sendMail } });
    return { service, messages, sendMail };
  }

  const details: ResaleEmailDetails = {
    eventTitle: 'Đêm nhạc <Mùa thu> & Bạn',
    showingName: 'Suất tối',
    ticketTypeName: 'VIP',
    ticketNumber: 2,
    grossAmount: '200019',
    feeAmount: '10000',
    netAmount: '190019',
    bankName: 'Vietcombank',
    accountHolder: 'NGUYEN VAN A',
    maskedAccountNumber: '•••• 7890',
    reference: 'rord_one',
  };

  it.each(['SOLD', 'PAYOUT_PROCESSED'] as const)(
    'formats %s in HTML and plain text without changing financial claims',
    async (kind) => {
      const { service, messages } = fixture();
      await service.sendResaleNotice('seller@example.test', kind, details);
      const message = messages[0];
      expect(message.from).toEqual({
        name: 'TicketVerse',
        address: 'mail@example.test',
      });
      const html = String(message.html),
        text = String(message.text);
      expect(message.subject).toBe(
        `TicketVerse - ${kind === 'SOLD' ? 'Bán vé thành công' : 'Đã xử lý chi trả'}`,
      );
      for (const value of [
        '190.019 ₫',
        '200.019 ₫',
        '10.000 ₫',
        '•••• 7890',
        'NGUYEN VAN A',
        'Suất tối',
        'Phí nền tảng (5%)',
      ]) {
        expect(html).toContain(value);
        expect(text).toContain(value);
      }
      expect(html).toContain('Đêm nhạc &lt;Mùa thu&gt; &amp; Bạn');
      expect(text).toContain(details.eventTitle);
      expect(html).toContain('https://ticketverse.example/account/resale');
      expect(message.attachments).toBeUndefined();
      if (kind === 'PAYOUT_PROCESSED')
        expect(text).toContain('không xác nhận ngân hàng đã ghi có');
    },
  );

  it('retains the ticket PDF and links to the ticket account', async () => {
    const { service, messages } = fixture();
    const pdf = Buffer.from('test-pdf');
    await service.sendTickets('buyer@example.test', 'tickets.pdf', pdf, 2);
    expect(messages[0].attachments).toEqual([
      { filename: 'tickets.pdf', content: pdf, contentType: 'application/pdf' },
    ]);
    expect(messages[0].subject).toBe('TicketVerse - 2 vé của bạn');
    expect(String(messages[0].html)).toContain(
      'https://ticketverse.example/account/tickets',
    );
    expect(String(messages[0].html)).toContain('2 vé');
    expect(String(messages[0].text)).toContain('Không chia sẻ');
  });

  it('brands the legacy transfer notice without treating ownership transfer as a bank payment', async () => {
    const { service, messages } = fixture();
    await service.sendTransferNotice('seller@example.test', 'rord_<old>');
    expect(messages[0].subject).toBe(
      'TicketVerse - Chuyển nhượng vé thành công',
    );
    expect(String(messages[0].html)).toContain('rord_&lt;old&gt;');
    expect(String(messages[0].text)).toContain('không có chuyển tiền thật');
    expect(messages[0].attachments).toBeUndefined();
  });

  it('formats code expiry in Vietnam time and keeps the bank OTP warning', async () => {
    const { service, messages } = fixture();
    await service.sendCheckoutOtp(
      'buyer@example.test',
      '012345',
      new Date('2026-10-21T03:04:05Z'),
    );
    const html = String(messages[0].html),
      text = String(messages[0].text);
    for (const value of [
      '012345',
      '10:04:05',
      '(giờ Việt Nam)',
      'không phải OTP ngân hàng',
    ]) {
      expect(html).toContain(value);
      expect(text).toContain(value);
    }
    expect(messages[0].subject).toBe('TicketVerse - Mã xác thực thanh toán');
    expect(messages[0].attachments).toBeUndefined();
  });

  it('escapes every content field and action URL; no user markup becomes executable HTML', () => {
    const payload = `<img src=x onerror="alert('x')"> & <script>alert(1)</script>`;
    const { html, text } = renderEmail({
      title: payload,
      preview: payload,
      description: payload,
      notice: payload,
      highlight: { label: payload, value: payload },
      sections: [
        { title: payload, rows: [{ label: payload, value: payload }] },
      ],
      action: {
        label: payload,
        url: 'https://ticketverse.example/account?view=resale&value="test"',
      },
    });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
    expect(html).toContain(
      '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;',
    );
    expect(html).toContain('view=resale&amp;value=&quot;test&quot;');
    expect(text).toContain(payload);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,test',
    'https://user:password@ticketverse.example',
    'not a URL',
  ])('omits unsafe action %s', (url) => {
    const { html, text } = renderEmail({
      title: 'Title',
      preview: 'Preview',
      description: 'Content',
      notice: 'Note',
      action: { label: 'Open', url },
    });
    expect(html).not.toContain('<a ');
    expect(text).not.toContain(url);
  });

  it('keeps the email usable if the frontend URL is missing or invalid', async () => {
    const { service, messages } = fixture({
      VNPAY_FRONTEND_URL: 'not a URL',
      FRONTEND_URL: undefined,
    });
    await service.sendResaleNotice('seller@example.test', 'SOLD', details);
    expect(String(messages[0].html)).not.toContain('<a ');
    expect(String(messages[0].text)).toContain('190.019 ₫');
  });

  it('uses inline brand styling and fluid tables without external assets or scripts', () => {
    const { html } = renderEmail({
      title: 'Thông báo',
      preview: 'Nội dung',
      description: 'Mô tả',
      notice: 'Lưu ý',
    });
    expect(html).toContain('lang="vi"');
    expect(html).toContain('name="viewport"');
    expect(html).toContain('max-width:600px');
    expect(html).toContain('role="presentation"');
    expect(html).toContain('#9b6df5');
    expect(html).toContain('#171222');
    expect(html).not.toMatch(
      /<script|<img|<link|@import|display:flex|display:grid/i,
    );
  });

  it('preserves delivery failures and the email-disabled guard', async () => {
    const { service, sendMail } = fixture();
    sendMail.mockRejectedValueOnce(new Error('SMTP unavailable'));
    await expect(
      service.sendResaleNotice('seller@example.test', 'SOLD', details),
    ).rejects.toThrow('Resale notice could not be sent');
    const disabled = fixture({ TICKET_EMAIL_ENABLED: false });
    await expect(
      disabled.service.sendResaleNotice('seller@example.test', 'SOLD', details),
    ).rejects.toThrow('Ticket email is disabled');
    expect(disabled.sendMail).not.toHaveBeenCalled();
  });
});
