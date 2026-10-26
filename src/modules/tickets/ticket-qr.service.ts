import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import QRCode from 'qrcode';
import { TicketCredential } from './entities/ticket-credential.entity';
import { TicketStatus } from './entities/ticket.entity';
import { TicketIssuanceService } from './ticket-issuance.service';

@Injectable()
export class TicketQrService {
  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly issuance: TicketIssuanceService,
  ) {}

  payload(ticketId: string, credentialId: string) {
    const body = Buffer.from(
      JSON.stringify({ ticketId, credentialId }),
    ).toString('base64url');
    const signed = `pv1.${body}`;
    return `${signed}.${this.signature(signed).toString('base64url')}`;
  }

  dataUrl(ticketId: string, credentialId: string) {
    return QRCode.toDataURL(this.payload(ticketId, credentialId), {
      errorCorrectionLevel: 'M',
      margin: 4,
      width: 400,
    });
  }

  png(ticketId: string, credentialId: string) {
    return QRCode.toBuffer(this.payload(ticketId, credentialId), {
      errorCorrectionLevel: 'M',
      margin: 4,
      width: 600,
      type: 'png',
    });
  }

  async verify(
    payload: string,
    manager: EntityManager = this.dataSource.manager,
  ) {
    if (
      typeof payload !== 'string' ||
      payload.length > 512 ||
      !/^pv1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(payload)
    ) {
      throw new UnauthorizedException('Invalid ticket credential');
    }
    const [version, body, signature] = payload.split('.');
    const actual = Buffer.from(signature, 'base64url');
    const expected = this.signature(`${version}.${body}`);
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw new UnauthorizedException('Invalid ticket credential');
    }
    let data: { ticketId?: unknown; credentialId?: unknown };
    try {
      data = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      ) as typeof data;
    } catch {
      throw new UnauthorizedException('Invalid ticket credential');
    }
    if (
      !data ||
      typeof data.ticketId !== 'string' ||
      typeof data.credentialId !== 'string'
    ) {
      throw new UnauthorizedException('Invalid ticket credential');
    }
    const credential = await manager.findOne(TicketCredential, {
      where: {
        credentialId: data.credentialId,
        ticketId: data.ticketId,
        revokedAt: IsNull(),
      },
      relations: { ticket: { orderItem: true } },
    });
    if (!credential || credential.ticket.status !== TicketStatus.ACTIVE) {
      throw new UnauthorizedException('Ticket credential is no longer active');
    }
    await this.issuance.inspect(manager, credential.ticket.orderItem.orderId);
    return { ticketId: credential.ticketId };
  }

  private signature(value: string) {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('TICKET_QR_SECRET'),
    )
      .update(value)
      .digest();
  }
}
