import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import { renderEmail } from './email-template';
import type { ResaleEmailDetails, ResaleEmailKind } from './resale-email.types';

@Injectable()
export class MailService {
  private transporter?: Transporter;
  constructor(private readonly config: ConfigService) {}

  enabled() {
    return this.config.get<boolean>('TICKET_EMAIL_ENABLED', false);
  }

  async sendTickets(
    email: string,
    filename: string,
    pdf: Buffer,
    ticketCount: number,
  ) {
    if (!this.enabled())
      throw new ServiceUnavailableException('Ticket email is disabled');
    const transporter = this.getTransporter();
    try {
      const result: { accepted?: unknown[] } = await transporter.sendMail({
        from: {
          name: 'TicketVerse',
          address: this.config.getOrThrow<string>('SMTP_FROM'),
        },
        to: { address: email, name: '' },
        subject: `TicketVerse - ${ticketCount} vé của bạn`,
        ...renderEmail({
          title: 'Vé của bạn đã sẵn sàng',
          preview: `${ticketCount} vé điện tử đã được gửi kèm email này.`,
          description:
            'Cảm ơn bạn đã lựa chọn TicketVerse. Vé điện tử nằm trong tệp PDF đính kèm; bạn cũng có thể xem vé hiện hành trong tài khoản.',
          highlight: { label: 'Số lượng vé', value: `${ticketCount} vé` },
          notice:
            'Giữ mã QR riêng tư và sử dụng mã hiện hành trong tài khoản khi tham dự. Không chia sẻ tệp vé hoặc ảnh QR cho người khác.',
          action: {
            label: 'Xem vé của tôi',
            url: this.accountUrl('/account/tickets'),
          },
        }),
        attachments: [
          { filename, content: pdf, contentType: 'application/pdf' },
        ],
      });
      if (!result.accepted?.length) throw new Error('SMTP rejected recipient');
    } catch {
      throw new ServiceUnavailableException(
        'Ticket email could not be sent; try again later',
      );
    }
  }

  async sendTransferNotice(email: string, resaleOrderId: string) {
    if (!this.enabled())
      throw new ServiceUnavailableException('Ticket email is disabled');
    try {
      const result: { accepted?: unknown[] } =
        await this.getTransporter().sendMail({
          from: {
            name: 'TicketVerse',
            address: this.config.getOrThrow<string>('SMTP_FROM'),
          },
          to: { address: email, name: '' },
          subject: 'TicketVerse - Chuyển nhượng vé thành công',
          ...renderEmail({
            title: 'Chuyển nhượng vé thành công',
            preview: 'Vé của bạn đã được chuyển sang tài khoản người mua.',
            description:
              'Vé đã được chuyển chủ thành công. Mã QR cũ không còn hiệu lực; bạn có thể theo dõi giao dịch trong tài khoản.',
            sections: [
              {
                title: 'Thông tin giao dịch',
                rows: [{ label: 'Mã đơn bán lại', value: resaleOrderId }],
              },
            ],
            notice:
              'Trạng thái chuyển nhượng chỉ xác nhận chuyển chủ vé, không xác nhận ngân hàng đã ghi có. Giao dịch này không có chuyển tiền thật cho người bán.',
            action: {
              label: 'Xem giao dịch bán lại',
              url: this.accountUrl('/account/resale'),
            },
          }),
        });
      if (!result.accepted?.length) throw new Error('SMTP rejected recipient');
    } catch {
      throw new ServiceUnavailableException(
        'Transfer notice could not be sent',
      );
    }
  }

  async sendResaleNotice(
    email: string,
    kind: ResaleEmailKind,
    details: ResaleEmailDetails,
  ) {
    if (!this.enabled())
      throw new ServiceUnavailableException('Ticket email is disabled');
    const title = kind === 'SOLD' ? 'Bán vé thành công' : 'Đã xử lý chi trả';
    const amount = (value: string) =>
      `${BigInt(value).toLocaleString('vi-VN')} ₫`;
    try {
      const result: { accepted?: unknown[] } =
        await this.getTransporter().sendMail({
          from: {
            name: 'TicketVerse',
            address: this.config.getOrThrow<string>('SMTP_FROM'),
          },
          to: { address: email, name: '' },
          subject: `TicketVerse - ${title}`,
          ...renderEmail({
            title,
            preview: `${title} · Thực nhận ${amount(details.netAmount)}.`,
            description:
              kind === 'SOLD'
                ? 'Vé của bạn đã có người mua và được chuyển chủ thành công. Khoản chi trả đang được xử lý tự động.'
                : 'Lệnh chi trả cho giao dịch bán lại vé của bạn đã được xử lý trên hệ thống. Chi tiết khoản tiền và tài khoản nhận được ghi bên dưới.',
            highlight: { label: 'Thực nhận', value: amount(details.netAmount) },
            sections: [
              {
                title: 'Thông tin vé',
                rows: [
                  { label: 'Sự kiện', value: details.eventTitle },
                  { label: 'Suất diễn', value: details.showingName },
                  { label: 'Hạng vé', value: details.ticketTypeName },
                  { label: 'Số vé', value: String(details.ticketNumber) },
                ],
              },
              {
                title: 'Chi tiết giao dịch',
                rows: [
                  { label: 'Giá bán', value: amount(details.grossAmount) },
                  {
                    label: 'Phí nền tảng (5%)',
                    value: amount(details.feeAmount),
                  },
                  { label: 'Mã tham chiếu', value: details.reference },
                ],
              },
              {
                title: 'Tài khoản nhận tiền',
                rows: [
                  { label: 'Ngân hàng', value: details.bankName },
                  { label: 'Số tài khoản', value: details.maskedAccountNumber },
                  { label: 'Chủ tài khoản', value: details.accountHolder },
                ],
              },
            ],
            notice:
              kind === 'SOLD'
                ? 'Bạn không cần tạo yêu cầu rút tiền. TicketVerse sẽ gửi thông báo khi lệnh chi trả được xử lý.'
                : 'Trạng thái này xác nhận lệnh đã được xử lý trên hệ thống, không xác nhận ngân hàng đã ghi có.',
            action: {
              label: 'Xem giao dịch bán lại',
              url: this.accountUrl('/account/resale'),
            },
          }),
        });
      if (!result.accepted?.length) throw new Error('SMTP rejected recipient');
    } catch {
      throw new ServiceUnavailableException('Resale notice could not be sent');
    }
  }

  async sendCheckoutOtp(email: string, code: string, expiresAt: Date) {
    try {
      const result: { accepted?: unknown[] } =
        await this.getTransporter().sendMail({
          from: {
            name: 'TicketVerse',
            address: this.config.getOrThrow<string>('SMTP_FROM'),
          },
          to: { address: email, name: '' },
          subject: 'TicketVerse - Mã xác thực thanh toán',
          ...renderEmail({
            title: 'Xác thực yêu cầu thanh toán',
            preview:
              'Mã xác thực cho yêu cầu thanh toán của bạn trên TicketVerse.',
            description:
              'Nhập mã bên dưới tại TicketVerse để xác thực yêu cầu. Nếu bạn không thực hiện thao tác này, hãy bỏ qua email.',
            highlight: { label: 'Mã xác thực', value: code },
            sections: [
              {
                title: 'Thời hạn sử dụng',
                rows: [
                  {
                    label: 'Hết hạn lúc',
                    value: `${new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium' }).format(expiresAt)} (giờ Việt Nam)`,
                  },
                ],
              },
            ],
            notice:
              'Không chia sẻ mã này với bất kỳ ai. Đây là mã xác thực của TicketVerse, không phải OTP ngân hàng và không trừ tiền thật.',
          }),
        });
      if (!result.accepted?.length) throw new Error('SMTP rejected recipient');
    } catch {
      throw new ServiceUnavailableException(
        'Checkout verification email could not be sent. Please try again.',
      );
    }
  }

  private accountUrl(path: string) {
    const base =
      this.config.get<string>('VNPAY_FRONTEND_URL') ||
      this.config.get<string>('FRONTEND_URL');
    try {
      return new URL(path, base).toString();
    } catch {
      return '';
    }
  }

  private getTransporter(): Transporter {
    this.transporter ??= nodemailer.createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: this.config.get<boolean>('SMTP_SECURE', false),
      auth: this.config.get<string>('SMTP_USER')
        ? {
            user: this.config.get<string>('SMTP_USER'),
            pass: this.config.get<string>('SMTP_PASS'),
          }
        : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    return this.transporter;
  }
}
