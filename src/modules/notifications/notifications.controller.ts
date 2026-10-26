import { Controller, Get, Header, Param, Patch, Query } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import {
  Authenticated,
  CurrentUser,
} from '../auth/authorization/access-policy';
import type { Principal } from '../auth/authorization/principal';
import { OrderIdDto } from '../orders/dto/order-query.dto';
import { NotificationsService } from './notifications.service';

export class NotificationListDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;
}

@Controller('v1/notifications')
@Authenticated()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() actor: Principal, @Query() query: NotificationListDto) {
    return this.notifications.list(actor.user_id, query.page);
  }

  @Patch('read-all')
  readAll(@CurrentUser() actor: Principal) {
    return this.notifications.readAll(actor.user_id);
  }

  @Patch(':id/read')
  read(@CurrentUser() actor: Principal, @Param() params: OrderIdDto) {
    return this.notifications.read(actor.user_id, params.id);
  }
}
