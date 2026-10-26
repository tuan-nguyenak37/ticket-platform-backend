import { BadRequestException } from '@nestjs/common';
import { TicketTypeStatus } from './enums/ticket-type-status.enum';

export function validateTicketConfiguration(
  config: {
    saleStartAt: Date | null;
    saleEndAt: Date | null;
    showingStart: Date;
    maxPerOrder: number;
    totalQuantity: number;
    status: TicketTypeStatus;
    checkMaximum: boolean;
    checkFuture: boolean;
  },
  now = new Date(),
) {
  const {
    saleStartAt,
    saleEndAt,
    showingStart,
    maxPerOrder,
    totalQuantity,
    status,
  } = config;
  if (config.checkMaximum && maxPerOrder > totalQuantity)
    throw new BadRequestException('maxPerOrder must not exceed totalQuantity');
  if (saleStartAt && saleEndAt && saleStartAt >= saleEndAt)
    throw new BadRequestException('saleEndAt must be after saleStartAt');
  if (saleEndAt && saleEndAt > showingStart)
    throw new BadRequestException(
      'saleEndAt must not be after Showing.startTime',
    );
  if (config.checkFuture && saleEndAt && saleEndAt <= now)
    throw new BadRequestException('saleEndAt must be in the future');
  if (status === TicketTypeStatus.ACTIVE && (!saleStartAt || !saleEndAt))
    throw new BadRequestException(
      'Sale window is required to activate a ticket type',
    );
}
