import { IsBoolean, IsDefined } from 'class-validator';

export class UpdateEventPinDto {
  @IsDefined()
  @IsBoolean()
  isPinned!: boolean;
}
