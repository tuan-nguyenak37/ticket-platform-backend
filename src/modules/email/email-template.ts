import { EmailKind, EmailOutbox } from './email-outbox.entity';

const titles: Record<EmailKind, string> = {
  ticket_approved: 'Vé của bạn đã được duyệt',
  ticket_rejected: 'Vé của bạn bị từ chối',
  order_paid: 'Đơn hàng đã thanh toán thành công',
  refund_pending: 'Đơn hàng đang chờ hoàn tiền',
  refunded: 'Đơn hàng đã hoàn tiền',
  dispute_opened: 'Đơn hàng có tranh chấp mới',
  dispute_replied: 'Người bán đã phản hồi tranh chấp',
  dispute_accepted: 'Tranh chấp được chấp nhận',
  dispute_rejected: 'Tranh chấp bị từ chối',
};
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

export function renderEmail(message: EmailOutbox) {
  const demo = message.isMock;
  const subject = `[TicketVerse${demo ? ' DEMO' : ''}] ${titles[message.kind]}`;
  const paragraphs = [
    titles[message.kind],
    `Mã tham chiếu: ${message.referenceId}`,
    ...(message.reason ? [`Lý do: ${message.reason}`] : []),
    ...(demo
      ? ['Đây là thông báo giao dịch giả lập, không có tiền thật.']
      : []),
    'Không chia sẻ file vé hoặc mã QR.',
  ];
  return {
    subject,
    text: paragraphs.join('\n\n'),
    html: paragraphs.map((p) => `<p>${escape(p)}</p>`).join(''),
  };
}
