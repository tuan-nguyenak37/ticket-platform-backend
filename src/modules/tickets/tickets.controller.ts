import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import {
  Authenticated,
  CurrentUser,
  Public,
  Roles,
} from '../auth/authorization/access-policy';
import { Audit } from '../auth/authorization/audit.interceptor';
import type { Principal } from '../auth/authorization/principal';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { TicketFileInterceptor } from './ticket-file.interceptor';
import { TicketsService } from './tickets.service';
import type { TicketUploadFiles } from './tickets.service';
import { ListTicketsDto } from './dto/list-tickets.dto';
import { ManageTicketsDto } from './dto/manage-tickets.dto';
import { ReviewTicketDto } from './dto/review-ticket.dto';
import { UserRole } from '../users/entities/enums/user-role.enum';
import { TicketManagementService } from './review/ticket-management.service';
import { TicketReviewService } from './review/ticket-review.service';
import type { Response } from 'express';
import { MyTicketsDto } from './dto/my-tickets.dto';

@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly management: TicketManagementService,
    private readonly reviews: TicketReviewService,
  ) {}

  @Get('me')
  @Authenticated()
  mine(@CurrentUser() actor: Principal, @Query() query: MyTicketsDto) {
    return this.ticketsService.mine(actor, query);
  }

  @Get('me/:id')
  @Authenticated()
  myDetail(@CurrentUser() actor: Principal, @Param('id') id: string) {
    return this.ticketsService.myDetail(actor, id);
  }

  @Get('manage')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  manageList(
    @CurrentUser() actor: Principal,
    @Query() query: ManageTicketsDto,
  ) {
    return this.management.list(actor, query);
  }

  @Get('manage/:id')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  manageDetail(@CurrentUser() actor: Principal, @Param('id') id: string) {
    return this.management.detail(actor, id);
  }

  @Get('manage/:id/file')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Audit('tickets.file.read')
  async manageFile(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const file = await this.management.file(actor, id);
    response.setHeader('Content-Type', file.mimetype);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Disposition', 'inline');
    response.send(file.buffer);
  }

  @Post('manage/:id/check')
  @HttpCode(202)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Audit('tickets.check.request')
  check(@CurrentUser() actor: Principal, @Param('id') id: string) {
    return this.management.enqueue(actor, id);
  }

  @Patch(':id/review')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Audit('tickets.review.manual')
  review(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @Body() dto: ReviewTicketDto,
  ) {
    return this.reviews.review(actor, id, dto);
  }

  @Get()
  @Public()
  list(@Query() query: ListTicketsDto) {
    return this.ticketsService.list(query);
  }

  @Delete(':id')
  @Authenticated()
  @Audit('tickets.cancel')
  cancel(@CurrentUser() actor: Principal, @Param('id') id: string) {
    return this.ticketsService.cancel(actor, id);
  }

  @Post()
  @Authenticated()
  @Audit('tickets.create')
  @UseInterceptors(TicketFileInterceptor)
  create(
    @CurrentUser() actor: Principal,
    @Body() dto: CreateTicketDto,
    @UploadedFiles() files: TicketUploadFiles,
  ) {
    return this.ticketsService.create(actor, dto, files);
  }
}
