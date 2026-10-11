import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { TicketReviewService } from './ticket-review.service';
import { TicketReportService } from './ticket-report.service';
import { Ticket } from '../entities/ticket.entity';
import { Event } from '../../events/entities/event.entity';
import { TicketStatus } from '../entities/enums/ticket-status.enum';
import { EventStatus } from '../../events/entities/enums/event-status.enum';
import { UserRole } from '../../users/entities/enums/user-role.enum';
import { UserStatus } from '../../users/entities/enums/user-status.enum';
import type { Principal } from '../../auth/authorization/principal';
import { CheckStatus, CheckOutcome } from './check.types';
import { TicketCheck } from '../entities/ticket-check.entity';

describe('TicketReviewService', () => {
  let service: TicketReviewService;
  let dataSource: Partial<DataSource>;
  let configService: Partial<ConfigService>;
  let reportService: Partial<TicketReportService>;

  const mockAdmin: Principal = {
    user_id: 'usr_admin_001',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    tokenVersion: 0,
  };

  const mockModerator: Principal = {
    user_id: 'usr_mod_001',
    role: UserRole.MODERATOR,
    status: UserStatus.ACTIVE,
    tokenVersion: 0,
  };

  const mockRegularUser: Principal = {
    user_id: 'usr_user_001',
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    tokenVersion: 0,
  };

  beforeEach(async () => {
    configService = {
      get: jest.fn().mockImplementation((key: string, def: unknown) => def),
    };

    reportService = {
      report: jest.fn().mockResolvedValue(null),
    };

    dataSource = {
      transaction: jest.fn(),
      getRepository: jest.fn().mockReturnValue({
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketReviewService,
        { provide: DataSource, useValue: dataSource },
        { provide: ConfigService, useValue: configService },
        { provide: TicketReportService, useValue: reportService },
      ],
    }).compile();

    service = module.get<TicketReviewService>(TicketReviewService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('requireManager', () => {
    it('allows ADMIN and MODERATOR', () => {
      expect(() => service.requireManager(mockAdmin)).not.toThrow();
      expect(() => service.requireManager(mockModerator)).not.toThrow();
    });

    it('throws ForbiddenException for regular USER', () => {
      expect(() => service.requireManager(mockRegularUser)).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('review decision logic', () => {
    it('rejects review if actor is the ticket seller', async () => {
      const mockTicket = new Ticket();
      mockTicket.ticket_id = 'tkt_001';
      mockTicket.eventId = 'evt_001';
      mockTicket.sellerId = mockAdmin.user_id; // Same as actor!
      mockTicket.status = TicketStatus.PENDING_REVIEW;

      const mockEvent = new Event();
      mockEvent.event_id = 'evt_001';

      const mockManager = {
        findOne: jest.fn().mockImplementation((entity) => {
          if (entity === Ticket) return mockTicket;
          if (entity === Event) return mockEvent;
          return null;
        }),
      };

      (dataSource.transaction as jest.Mock).mockImplementation((mode, cb) =>
        cb(mockManager),
      );

      await expect(
        service.review(mockAdmin, 'tkt_001', {
          decision: 'reject',
          reason: 'Invalid image',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects review if ticket is not in pending_review status', async () => {
      const mockTicket = new Ticket();
      mockTicket.ticket_id = 'tkt_001';
      mockTicket.eventId = 'evt_001';
      mockTicket.sellerId = 'usr_seller_other';
      mockTicket.status = TicketStatus.AVAILABLE; // Already approved!

      const mockEvent = new Event();
      mockEvent.event_id = 'evt_001';

      const mockManager = {
        findOne: jest.fn().mockImplementation((entity) => {
          if (entity === Ticket) return mockTicket;
          if (entity === Event) return mockEvent;
          return null;
        }),
      };

      (dataSource.transaction as jest.Mock).mockImplementation((mode, cb) =>
        cb(mockManager),
      );

      await expect(
        service.review(mockAdmin, 'tkt_001', {
          decision: 'reject',
          reason: 'Too late',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('successfully processes rejection and marks ticket as rejected', async () => {
      const mockTicket = new Ticket();
      mockTicket.ticket_id = 'tkt_001';
      mockTicket.eventId = 'evt_001';
      mockTicket.sellerId = 'usr_seller_other';
      mockTicket.status = TicketStatus.PENDING_REVIEW;

      const mockEvent = new Event();
      mockEvent.event_id = 'evt_001';

      let savedEntities: any[] = [];
      const mockManager = {
        findOne: jest.fn().mockImplementation((entity) => {
          if (entity === Ticket) return mockTicket;
          if (entity === Event) return mockEvent;
          return null;
        }),
        create: jest.fn().mockImplementation((entity, data) => data),
        insert: jest.fn().mockResolvedValue({ identifiers: [] }),
        save: jest.fn().mockImplementation((data) => {
          savedEntities.push(data);
          return data;
        }),
      };

      (dataSource.transaction as jest.Mock).mockImplementation((mode, cb) =>
        cb(mockManager),
      );

      const result = await service.review(mockAdmin, 'tkt_001', {
        decision: 'reject',
        reason: 'Ảnh mờ không rõ số ghế',
      });

      expect(mockTicket.status).toBe(TicketStatus.REJECTED);
      expect(mockTicket.rejectionReason).toBe('Ảnh mờ không rõ số ghế');
      expect(mockTicket.verifiedBy).toBe(mockAdmin.user_id);
    });
  });

  describe('autoApprove', () => {
    it('does nothing when TICKET_AUTO_APPROVE_ENABLED is false', async () => {
      (configService.get as jest.Mock).mockReturnValue(false);
      await service.autoApprove('tkt_001', 1);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('updates ticket check to NEEDS_REVIEW when auto review throws', async () => {
      (configService.get as jest.Mock).mockReturnValue(true);
      (dataSource.transaction as jest.Mock).mockRejectedValue(
        new Error('Unexpected scan crash'),
      );

      const updateMock = jest.fn().mockResolvedValue({ affected: 1 });
      (dataSource.getRepository as jest.Mock).mockReturnValue({
        update: updateMock,
      });

      await service.autoApprove('tkt_001', 1);

      expect(updateMock).toHaveBeenCalledWith(
        { ticketId: 'tkt_001', version: 1, status: CheckStatus.COMPLETED },
        {
          outcome: CheckOutcome.NEEDS_REVIEW,
          errorCode: 'auto_review_failed',
        },
      );
    });
  });
});
