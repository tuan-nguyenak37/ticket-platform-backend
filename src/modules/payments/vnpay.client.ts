import {
  BadRequestException,
  Injectable,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export type VnpayParams = Record<string, string>;
export type VnpayProof = {
  source?: 'querydr';
  reference: string;
  txnRef: string;
  parameters: VnpayParams;
};
export const VNPAY_SANDBOX =
  'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';

export function vnpayEncode(value: string) {
  return encodeURIComponent(value).replace(/%20/g, '+');
}

export function vnpayCanonical(parameters: VnpayParams) {
  return Object.keys(parameters)
    .filter((key) => key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType')
    .sort()
    .map((key) => `${vnpayEncode(key)}=${vnpayEncode(parameters[key])}`)
    .join('&');
}

export function vnpayDate(date: Date) {
  return new Date(date.getTime() + 7 * 60 * 60_000)
    .toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 14);
}

@Injectable()
export class VnpayClient {
  constructor(private readonly config: ConfigService) {}

  private credentials() {
    const tmnCode = this.config.get<string>('VNPAY_TMN_CODE');
    const secret = this.config.get<string>('VNPAY_HASH_SECRET');
    if (!tmnCode || !/^[a-zA-Z0-9]{8}$/.test(tmnCode) || !secret)
      throw new ServiceUnavailableException('VNPay sandbox is not configured');
    return { tmnCode, secret };
  }

  private settings() {
    const credentials = this.credentials();
    const returnUrl = this.config.get<string>('VNPAY_RETURN_URL');
    if (!returnUrl || returnUrl.length < 10 || returnUrl.length > 255)
      throw new ServiceUnavailableException('Invalid VNPay return URL');
    let parsed: URL;
    try {
      parsed = new URL(returnUrl);
    } catch {
      throw new ServiceUnavailableException('Invalid VNPay return URL');
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      throw new ServiceUnavailableException('Invalid VNPay return URL');
    }
    return { ...credentials, returnUrl };
  }

  sign(parameters: VnpayParams) {
    return createHmac('sha512', this.credentials().secret)
      .update(vnpayCanonical(parameters), 'utf8')
      .digest('hex');
  }

  verify(query: unknown): VnpayParams {
    if (!query || typeof query !== 'object' || Array.isArray(query))
      throw new BadRequestException('Invalid VNPay parameters');
    const parameters: VnpayParams = {};
    for (const [key, value] of Object.entries(query)) {
      if (
        !/^vnp_[A-Za-z0-9]+$/.test(key) ||
        typeof value !== 'string' ||
        value.length > 1024
      )
        throw new BadRequestException('Invalid VNPay parameters');
      parameters[key] = value;
    }
    const signature = parameters.vnp_SecureHash;
    if (
      !signature ||
      !/^[a-fA-F0-9]{128}$/.test(signature) ||
      !timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(this.sign(parameters), 'hex'),
      ) ||
      parameters.vnp_TmnCode !== this.credentials().tmnCode
    )
      throw new BadRequestException('Invalid VNPay signature');
    if (
      !/^[a-zA-Z0-9_-]{1,100}$/.test(parameters.vnp_TxnRef ?? '') ||
      !/^\d{1,12}$/.test(parameters.vnp_Amount ?? '') ||
      !/^\d{1,15}$/.test(parameters.vnp_TransactionNo ?? '') ||
      !/^[a-zA-Z0-9]{3,20}$/.test(parameters.vnp_BankCode ?? '') ||
      !parameters.vnp_OrderInfo ||
      parameters.vnp_OrderInfo.length > 255 ||
      (parameters.vnp_PayDate !== undefined &&
        parameters.vnp_PayDate !== '' &&
        !/^\d{14}$/.test(parameters.vnp_PayDate)) ||
      !/^\d{2}$/.test(parameters.vnp_ResponseCode ?? '') ||
      !/^\d{2}$/.test(parameters.vnp_TransactionStatus ?? '') ||
      (parameters.vnp_CurrCode !== undefined &&
        parameters.vnp_CurrCode !== 'VND')
    )
      throw new BadRequestException('Invalid VNPay result');
    return parameters;
  }

  paymentUrl(
    txnRef: string,
    amount: string,
    createdAt: Date,
    expiresAt: Date,
    address: string,
  ) {
    const { tmnCode, returnUrl } = this.settings();
    if (
      !/^[a-zA-Z0-9]{1,100}$/.test(txnRef) ||
      !Number.isFinite(createdAt.getTime()) ||
      !Number.isFinite(expiresAt.getTime()) ||
      Math.floor(expiresAt.getTime() / 1000) <=
        Math.floor(createdAt.getTime() / 1000)
    ) {
      throw new BadRequestException('Invalid VNPay reference or payment dates');
    }
    if (
      !/^[1-9]\d*$/.test(amount) ||
      (BigInt(amount) * 100n).toString().length > 12
    )
      throw new BadRequestException(
        'Amount is outside the supported VNPay range',
      );
    const ip =
      address === '::1' ? '127.0.0.1' : address.replace(/^::ffff:/, '');
    if (!isIP(ip)) throw new BadRequestException('Invalid client IP address');
    const parameters: VnpayParams = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: tmnCode,
      vnp_Amount: (BigInt(amount) * 100n).toString(),
      vnp_CurrCode: 'VND',
      vnp_TxnRef: txnRef,
      vnp_OrderInfo: `Thanh toan ve ${txnRef}`,
      vnp_OrderType: 'other',
      vnp_Locale: 'vn',
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: ip,
      vnp_CreateDate: vnpayDate(createdAt),
      vnp_ExpireDate: vnpayDate(expiresAt),
    };
    return `${VNPAY_SANDBOX}?${vnpayCanonical(parameters)}&vnp_SecureHash=${this.sign(parameters)}`;
  }

  confirmed(proof: VnpayProof, reference: string, amount: string) {
    const parameters =
      proof.source === 'querydr'
        ? this.verifyQuery(proof.parameters)
        : this.verify(proof.parameters);
    if (
      proof.reference !== reference ||
      proof.txnRef !== parameters.vnp_TxnRef ||
      BigInt(parameters.vnp_Amount) !== BigInt(amount) * 100n ||
      parameters.vnp_ResponseCode !== '00' ||
      parameters.vnp_TransactionStatus !== '00' ||
      BigInt(parameters.vnp_TransactionNo) === 0n
    )
      throw new BadRequestException('VNPay payment was not confirmed');
    return `vnp_${parameters.vnp_TransactionNo}`;
  }

  verifyQuery(value: unknown): VnpayParams {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException('Invalid VNPay query response');
    const parameters: VnpayParams = {};
    for (const [key, entry] of Object.entries(value)) {
      if (
        !/^vnp_[A-Za-z0-9]+$/.test(key) ||
        typeof entry !== 'string' ||
        entry.length > 1024
      )
        throw new BadRequestException('Invalid VNPay query response');
      parameters[key] = entry;
    }
    const fields = [
      'vnp_ResponseId',
      'vnp_Command',
      'vnp_ResponseCode',
      'vnp_Message',
      'vnp_TmnCode',
      'vnp_TxnRef',
      'vnp_Amount',
      'vnp_BankCode',
      'vnp_PayDate',
      'vnp_TransactionNo',
      'vnp_TransactionType',
      'vnp_TransactionStatus',
      'vnp_OrderInfo',
      'vnp_PromotionCode',
      'vnp_PromotionAmount',
    ];
    const signature = parameters.vnp_SecureHash ?? '';
    const expected = createHmac('sha512', this.credentials().secret)
      .update(fields.map((field) => parameters[field] ?? '').join('|'), 'utf8')
      .digest('hex');
    if (
      !/^[a-fA-F0-9]{128}$/.test(signature) ||
      !timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expected, 'hex'),
      ) ||
      parameters.vnp_TmnCode !== this.credentials().tmnCode ||
      (parameters.vnp_Command !== undefined &&
        parameters.vnp_Command !== 'querydr') ||
      !/^[a-zA-Z0-9]{1,32}$/.test(parameters.vnp_ResponseId ?? '') ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(parameters.vnp_TxnRef ?? '') ||
      !/^\d{2}$/.test(parameters.vnp_ResponseCode ?? '')
    )
      throw new BadRequestException(
        'Invalid VNPay query signature or identity',
      );
    if (
      parameters.vnp_ResponseCode === '00' &&
      (!/^\d{1,12}$/.test(parameters.vnp_Amount ?? '') ||
        !/^\d{2}$/.test(parameters.vnp_TransactionStatus ?? '') ||
        parameters.vnp_TransactionType !== '01' ||
        !/^\d{1,15}$/.test(parameters.vnp_TransactionNo ?? '') ||
        (parameters.vnp_PayDate && !/^\d{14}$/.test(parameters.vnp_PayDate)) ||
        (parameters.vnp_TransactionStatus === '00' &&
          BigInt(parameters.vnp_TransactionNo) === 0n))
    )
      throw new BadRequestException('Invalid VNPay payment query result');
    return parameters;
  }

  async query(txnRef: string, createdAt: Date) {
    const { tmnCode, secret } = this.credentials();
    const ip = this.config.get<string>('VNPAY_QUERY_IP', '127.0.0.1');
    if (
      !isIP(ip) ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(txnRef) ||
      !Number.isFinite(createdAt.getTime())
    )
      throw new BadRequestException('Invalid VNPay query configuration');
    const parameters: VnpayParams = {
      vnp_RequestId: randomBytes(16).toString('hex'),
      vnp_Version: '2.1.0',
      vnp_Command: 'querydr',
      vnp_TmnCode: tmnCode,
      vnp_TxnRef: txnRef,
      vnp_TransactionDate: vnpayDate(createdAt),
      vnp_CreateDate: vnpayDate(new Date()),
      vnp_IpAddr: ip,
      vnp_OrderInfo: `Doi soat ve ${txnRef}`,
    };
    parameters.vnp_SecureHash = createHmac('sha512', secret)
      .update(Object.values(parameters).join('|'), 'utf8')
      .digest('hex');
    const response = await fetch(
      'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parameters),
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      },
    );
    if (!response.ok)
      throw new ServiceUnavailableException('VNPay query unavailable');
    const body: unknown = await response.json();
    if (
      body &&
      typeof body === 'object' &&
      !Array.isArray(body) &&
      (body as Record<string, unknown>).vnp_ResponseCode === '94'
    )
      throw new HttpException(
        'VNPay đang giới hạn truy vấn lặp. Vui lòng chờ trước khi kiểm tra lại.',
        429,
      );
    const result = this.verifyQuery(body);
    if (result.vnp_TxnRef !== txnRef)
      throw new BadRequestException('VNPay query reference mismatch');
    return result;
  }
}
