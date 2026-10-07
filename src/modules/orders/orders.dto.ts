import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Order, OrderDispute, OrderPayment, OrderStatus } from './order.entity';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class CreateOrderDto {
  @Transform(trim) @IsString() @Length(1, 40) ticketId!: string;
}
export class OrderIdDto {
  @IsString() @Matches(/^[a-zA-Z0-9_-]{1,40}$/) id!: string;
}
export class ListOrdersDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsIn(['buyer', 'seller']) side?: 'buyer' | 'seller';
  @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus;
}
export class MockResultDto {
  @IsIn(['success', 'failed', 'cancelled']) result!:
    'success' | 'failed' | 'cancelled';
}
export class OpenDisputeDto {
  @Transform(trim) @IsString() @Length(1, 2000) reason!: string;
  @Transform(trim) @IsString() @Length(1, 5000) evidence!: string;
}
export class DisputeReplyDto {
  @Transform(trim) @IsString() @Length(1, 5000) response!: string;
}
export class ResolveDisputeDto {
  @IsIn(['accept', 'reject']) decision!: 'accept' | 'reject';
  @Transform(trim) @IsString() @Length(1, 2000) note!: string;
}
export class OrderResponse {
  static from(
    order: Order,
    payment?: OrderPayment | null,
    dispute?: OrderDispute | null,
  ) {
    return {
      order_id: order.order_id,
      ticketId: order.ticketId,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      amount: order.amount,
      currency: order.currency,
      status: order.status,
      ticket: order.snapshot,
      expiresAt: order.expiresAt,
      paidAt: order.paidAt,
      deliveredAt: order.deliveredAt,
      disputeUntil: order.disputeUntil,
      reason: order.reason,
      payoutStatus: order.payoutStatus,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      ...(payment !== undefined
        ? {
            payment: payment
              ? {
                  payment_id: payment.payment_id,
                  provider: payment.provider,
                  amount: payment.amount,
                  currency: payment.currency,
                  status: payment.status,
                  settledAt: payment.settledAt,
                }
              : null,
          }
        : {}),
      ...(dispute !== undefined
        ? {
            dispute: dispute
              ? {
                  dispute_id: dispute.dispute_id,
                  reason: dispute.reason,
                  evidence: dispute.evidence,
                  sellerResponse: dispute.sellerResponse,
                  status: dispute.status,
                  resolution: dispute.resolution,
                  resolvedAt: dispute.resolvedAt,
                  createdAt: dispute.createdAt,
                }
              : null,
          }
        : {}),
    };
  }
}
