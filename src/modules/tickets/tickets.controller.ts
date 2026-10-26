import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  Authenticated,
  CurrentUser,
} from '../auth/authorization/access-policy';
import type { Principal } from '../auth/authorization/principal';
import { TicketIdDto, TicketListDto } from './dto/ticket-query.dto';
import { TicketsService } from './tickets.service';

@Controller('v1')
@Authenticated()
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get('tickets/mine')
  mine(@CurrentUser() actor: Principal, @Query() query: TicketListDto) {
    return this.tickets.mine(actor.user_id, query);
  }

  @Get('tickets/:id')
  findOne(@CurrentUser() actor: Principal, @Param() params: TicketIdDto) {
    return this.tickets.findOne(actor.user_id, params.id);
  }

  @Get('tickets/:id/qr')
  @Header('Cache-Control', 'private, no-store')
  qr(@CurrentUser() actor: Principal, @Param() params: TicketIdDto) {
    return this.tickets.qrForTicket(actor.user_id, params.id);
  }

  @Get('tickets/:id/pdf')
  @Header('Cache-Control', 'private, no-store')
  async ticketPdf(
    @CurrentUser() actor: Principal,
    @Param() params: TicketIdDto,
  ) {
    return this.file(
      await this.tickets.pdfFor(actor.user_id, params.id, 'ticket'),
      params.id,
    );
  }

  @Get('orders/:id/tickets/pdf')
  @Header('Cache-Control', 'private, no-store')
  async orderPdf(
    @CurrentUser() actor: Principal,
    @Param() params: TicketIdDto,
  ) {
    return this.file(
      await this.tickets.pdfFor(actor.user_id, params.id, 'order'),
      params.id,
    );
  }

  @Post('tickets/:id/resend-email')
  @HttpCode(200)
  resendTicket(
    @CurrentUser() actor: Principal,
    @Param() params: TicketIdDto,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.emptyBody(body);
    return this.tickets.resend(actor.user_id, params.id, 'ticket', (seconds) =>
      response.setHeader('Retry-After', seconds),
    );
  }

  @Post('orders/:id/tickets/resend-email')
  @HttpCode(200)
  resendOrder(
    @CurrentUser() actor: Principal,
    @Param() params: TicketIdDto,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.emptyBody(body);
    return this.tickets.resend(actor.user_id, params.id, 'order', (seconds) =>
      response.setHeader('Retry-After', seconds),
    );
  }

  private emptyBody(body: unknown) {
    if (
      body !== undefined &&
      (body === null ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).length)
    ) {
      throw new BadRequestException(
        'This endpoint accepts only an empty body or {}',
      );
    }
  }

  private file(buffer: Buffer, id: string) {
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${id}.pdf"`,
      length: buffer.length,
    });
  }
}
