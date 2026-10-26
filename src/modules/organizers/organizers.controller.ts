import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  Authenticated,
  CurrentUser,
} from '../auth/authorization/access-policy';
import { Audit } from '../auth/authorization/audit.interceptor';
import type { Principal } from '../auth/authorization/principal';
import { CreateOrganizerDto } from './dto/create-organizer.dto';
import { OrganizerIdDto, UpdateOrganizerDto } from './dto/update-organizer.dto';
import { OrganizersService } from './organizers.service';
import { PayoutAccountDto } from './dto/payout-account.dto';

@Controller('v1/organizers')
@Authenticated()
export class OrganizersController {
  constructor(private readonly organizers: OrganizersService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  @Audit('organizers.create')
  create(@CurrentUser() actor: Principal, @Body() dto: CreateOrganizerDto) {
    return this.organizers.create(actor.user_id, dto);
  }

  @Get('mine')
  @Header('Cache-Control', 'no-store')
  findMine(@CurrentUser() actor: Principal) {
    return this.organizers.findMine(actor.user_id);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  findOne(@Param() params: OrganizerIdDto) {
    return this.organizers.findOne(params.id);
  }

  @Get(':id/payout-account')
  @Header('Cache-Control', 'no-store')
  payoutAccount(
    @Param() params: OrganizerIdDto,
    @CurrentUser() actor: Principal,
  ) {
    return this.organizers.payoutAccount(params.id, actor.user_id);
  }

  @Put(':id/payout-account')
  @Header('Cache-Control', 'no-store')
  @Audit('organizers.payout-account.update')
  putPayoutAccount(
    @Param() params: OrganizerIdDto,
    @CurrentUser() actor: Principal,
    @Body() dto: PayoutAccountDto,
  ) {
    return this.organizers.putPayoutAccount(params.id, actor.user_id, dto);
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  @Audit('organizers.update')
  update(
    @CurrentUser() actor: Principal,
    @Param() params: OrganizerIdDto,
    @Body() dto: UpdateOrganizerDto,
  ) {
    return this.organizers.update(params.id, actor.user_id, dto);
  }
}
