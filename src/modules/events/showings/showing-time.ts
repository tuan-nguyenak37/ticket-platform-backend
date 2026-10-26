import { BadRequestException } from '@nestjs/common';

export const VIETNAM_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?\+07:00$/;

export function parseVietnamTime(value: string): Date {
  const match = VIETNAM_TIME_PATTERN.exec(value);
  const date = new Date(value);
  if (!match || Number.isNaN(date.getTime())) {
    throw new BadRequestException(
      'Time must be valid ISO 8601 with +07:00 offset',
    );
  }
  const local = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const milliseconds = Number((match[7] ?? '').padEnd(3, '0'));
  if (
    local.toISOString().slice(0, 19) !== value.slice(0, 19) ||
    local.getUTCMilliseconds() !== milliseconds
  ) {
    throw new BadRequestException('Invalid calendar date or time');
  }
  return date;
}
