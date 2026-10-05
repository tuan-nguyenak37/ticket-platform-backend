import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsEnum, ValidateIf } from 'class-validator';
import { CreateEventDto } from './create-event.dto';
import { EventStatus } from '../entities/enums/event-status.enum';

export class UpdateEventDto extends PartialType(
  OmitType(CreateEventDto, ['status'] as const),
  { skipNullProperties: false },
) {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(EventStatus)
  status?: EventStatus;
}
