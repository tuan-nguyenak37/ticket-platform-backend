import { Event } from './entities/event.entity';
import { Showing } from './showings/entities/showing.entity';

export type ReadinessIssue = {
  code: string;
  step: number;
  field: string;
  resourceId: string;
  message: string;
};
export function evaluateReadiness(
  event: Event,
  showings: Showing[],
  now: Date,
) {
  const issues: ReadinessIssue[] = [];
  const add = (
    code: string,
    step: number,
    field: string,
    resourceId: string,
    message: string,
  ) => issues.push({ code, step, field, resourceId, message });
  if (!event.description?.trim())
    add(
      'DESCRIPTION_REQUIRED',
      1,
      'description',
      event.eventId,
      'Vui lòng bổ sung mô tả sự kiện.',
    );
  if (!showings.length)
    add(
      'SHOWING_REQUIRED',
      2,
      'showings',
      event.eventId,
      'Cần ít nhất một suất diễn.',
    );
  for (const showing of showings) {
    if (showing.startTime <= now || showing.endTime <= showing.startTime)
      add(
        'SHOWING_TIME_INVALID',
        2,
        'startTime',
        showing.showingId,
        'Suất diễn phải ở tương lai và kết thúc sau giờ bắt đầu.',
      );
    if (
      ![showing.venueName, showing.address, showing.city].every((value) =>
        value?.trim(),
      )
    )
      add(
        'VENUE_REQUIRED',
        2,
        'venueName',
        showing.showingId,
        'Bổ sung đầy đủ địa điểm, địa chỉ và thành phố.',
      );
    const active = (showing.ticketTypes ?? []).filter(
      (ticket) => ticket.status === 'ACTIVE',
    );
    if (!active.length)
      add(
        'ACTIVE_TICKET_REQUIRED',
        3,
        'ticketTypes',
        showing.showingId,
        'Mỗi suất cần ít nhất một hạng vé được kích hoạt.',
      );
    for (const ticket of active) {
      if (
        !ticket.saleStartAt ||
        !ticket.saleEndAt ||
        ticket.saleStartAt >= ticket.saleEndAt ||
        ticket.saleEndAt <= now ||
        ticket.saleEndAt > showing.startTime
      )
        add(
          'SALE_WINDOW_INVALID',
          3,
          'saleEndAt',
          ticket.ticketTypeId,
          'Lịch bán phải hợp lệ, chưa kết thúc và không vượt giờ diễn.',
        );
      if (
        !ticket.inventory ||
        ticket.inventory.totalQuantity < 1 ||
        ticket.maxPerOrder < 1 ||
        ticket.maxPerOrder > ticket.inventory.totalQuantity
      )
        add(
          'QUANTITY_INVALID',
          3,
          'totalQuantity',
          ticket.ticketTypeId,
          'Số lượng và giới hạn mỗi đơn không hợp lệ.',
        );
    }
  }
  return { ready: issues.length === 0, issues };
}
