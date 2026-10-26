import {
  Body,
  Controller,
  Header,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import {
  Authenticated,
  CurrentUser,
} from '../auth/authorization/access-policy';
import { Audit } from '../auth/authorization/audit.interceptor';
import type { Principal } from '../auth/authorization/principal';
import { TicketCheckInService } from '../tickets/ticket-check-in.service';
import { CheckInDto } from './dto/check-in.dto';
import { EventIdDto } from './dto/event.dto';

@Controller('v1/events/:id')
@Authenticated()
export class EventCheckInController {
  constructor(private readonly checkIns: TicketCheckInService) {}

  @Post('check-in')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @Audit('events.check-in')
  checkIn(
    @Param() params: EventIdDto,
    @CurrentUser() actor: Principal,
    @Body() dto: CheckInDto,
  ) {
    return this.checkIns.checkIn(params.id, dto.showingId, actor, dto.payload);
  }
}
