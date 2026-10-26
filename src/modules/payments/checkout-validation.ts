import { BadRequestException } from '@nestjs/common';
import type { Recipient } from './entities/checkout-session.entity';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Dữ liệu thanh toán không hợp lệ.');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new BadRequestException('Vui lòng kiểm tra thông tin thanh toán.');
  return value.trim();
}
export function parseRecipient(value: unknown) {
  const contact = object(value);
  const recipient: Recipient = {
    name: text(contact.name, 150),
    email: text(contact.email, 254).toLowerCase(),
    phone: text(contact.phone, 20),
  };
  if (
    recipient.name.length < 2 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email) ||
    !/^(0\d{9}|\+84\d{9})$/.test(recipient.phone)
  )
    throw new BadRequestException(
      'Họ tên, email hoặc số điện thoại người nhận chưa hợp lệ.',
    );
  return recipient;
}

export function parseCheckout(
  value: unknown,
  now = new Date(),
): {
  recipient: Recipient;
  method: 'CARD' | 'WALLET' | 'BANK_TRANSFER';
  instrument: { label: string; last4: string };
} {
  const body = object(value);
  if (
    Object.keys(body).some(
      (key) => !['recipient', 'method', 'instrument'].includes(key),
    )
  )
    throw new BadRequestException(
      'Không được thay đổi số tiền hoặc kết quả thanh toán.',
    );
  const recipient = parseRecipient(body.recipient);
  const details = object(body.instrument);
  let instrument: { label: string; last4: string };
  const method = body.method;
  if (method === 'CARD') {
    const number = text(details.number, 24).replace(/\s/g, '');
    const holder = text(details.holder, 150);
    const expiry = text(details.expiry, 5);
    const cvv = text(details.cvv, 4);
    const match = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(expiry);
    if (
      !['4242424242424242', '5555555555554444'].includes(number) ||
      holder.length < 2 ||
      !/^\d{3}$/.test(cvv) ||
      !match ||
      Date.UTC(2000 + Number(match[2]), Number(match[1]), 1) <= now.getTime()
    )
      throw new BadRequestException(
        'Thông tin thẻ không hợp lệ hoặc thẻ chưa được hỗ trợ.',
      );
    instrument = {
      label: number.startsWith('4') ? 'Visa' : 'Mastercard',
      last4: number.slice(-4),
    };
  } else if (method === 'WALLET') {
    const phone = text(details.phone, 20);
    if (!/^0\d{9}$/.test(phone))
      throw new BadRequestException('Số điện thoại ví không hợp lệ.');
    instrument = { label: 'Ví TicketVerse', last4: phone.slice(-4) };
  } else if (method === 'BANK_TRANSFER') {
    const account = text(details.account, 30);
    const bank = text(details.bank, 80);
    text(details.holder, 150);
    if (
      !/^\d{6,20}$/.test(account) ||
      !['TicketVerse Bank', 'TV Digital Bank'].includes(bank)
    )
      throw new BadRequestException('Thông tin ngân hàng không hợp lệ.');
    instrument = { label: bank, last4: account.slice(-4) };
  } else
    throw new BadRequestException('Phương thức thanh toán không được hỗ trợ.');
  return { recipient, method, instrument };
}

export function parseOtp(value: unknown) {
  const body = object(value);
  if (
    Object.keys(body).length !== 1 ||
    typeof body.otp !== 'string' ||
    !/^\d{6}$/.test(body.otp)
  )
    throw new BadRequestException('Nhập mã xác thực gồm 6 chữ số.');
  return body.otp;
}
