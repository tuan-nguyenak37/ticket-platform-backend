import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, MoreThan, QueryFailedError } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { UploadsService } from '../../common/uploads/uploads.service';
import { EventStatus } from './entities/enums/event-status.enum';
import {
  createMockCategory,
  createMockEvent,
  mockActiveCategory,
  mockAdminPrincipal,
  mockBannerFile,
  mockCreateEventDto,
  mockDraftEvent,
  mockEndedEvent,
  mockInactiveCategory,
  mockPublishedEvent,
  mockUserPrincipal,
} from './test/events.mock-data';
import { EventCategoriesService } from './event-categories.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventCategory } from './entities/event-category.entity';
import { EventPhase } from './dto/list-events.dto';

describe('EventsService', () => {
  let service: EventsService;
  let dataSource: jest.Mocked<any>;
  let uploadsService: jest.Mocked<any>;

  const mockQueryBuilder = {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[mockPublishedEvent], 1]),
  };

  const mockRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockQueryBuilder.getManyAndCount.mockResolvedValue([[mockPublishedEvent], 1]);
    mockRepository.find.mockResolvedValue([mockPublishedEvent]);
    mockRepository.findOne.mockResolvedValue(mockPublishedEvent);
    mockRepository.findOneBy.mockResolvedValue(mockPublishedEvent);

    uploadsService = {
      validate: jest.fn(),
      save: jest.fn().mockResolvedValue({ filename: 'saved_banner.jpg' }),
      removeEventImage: jest.fn().mockResolvedValue(undefined),
      readEventImage: jest.fn().mockResolvedValue({
        mimetype: 'image/jpeg',
        buffer: Buffer.from('image bytes'),
      }),
    };

    dataSource = {
      getRepository: jest.fn().mockReturnValue(mockRepository),
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: DataSource, useValue: dataSource },
        { provide: UploadsService, useValue: uploadsService },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('throws ForbiddenException when actor is regular user', async () => {
      await expect(
        service.create(mockUserPrincipal, mockCreateEventDto, {
          banner: [mockBannerFile],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException if endTime <= startTime', async () => {
      const invalidDto = {
        ...mockCreateEventDto,
        startTime: new Date(Date.now() + 86400000 * 2).toISOString(),
        endTime: new Date(Date.now() + 86400000).toISOString(),
      };
      await expect(
        service.create(mockAdminPrincipal, invalidDto, {
          banner: [mockBannerFile],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if published event starts in past', async () => {
      const pastStartDto = {
        ...mockCreateEventDto,
        startTime: new Date(Date.now() - 86400000).toISOString(),
        endTime: new Date(Date.now() + 86400000).toISOString(),
      };
      await expect(
        service.create(mockAdminPrincipal, pastStartDto, {
          banner: [mockBannerFile],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if banner is missing or multiple', async () => {
      await expect(
        service.create(mockAdminPrincipal, mockCreateEventDto, {}),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create(mockAdminPrincipal, mockCreateEventDto, {
          banner: [mockBannerFile, mockBannerFile],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates event successfully with banner in transaction', async () => {
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(mockActiveCategory),
        create: jest.fn().mockImplementation((_entity, data) => data),
        save: jest.fn().mockImplementation((event) => Promise.resolve(event)),
      };
      dataSource.transaction.mockImplementation(
        async (cb: (mgr: any) => Promise<any>) => cb(mockManager),
      );

      const result = await service.create(
        mockAdminPrincipal,
        mockCreateEventDto,
        { banner: [mockBannerFile] },
      );

      expect(uploadsService.validate).toHaveBeenCalledWith(mockBannerFile, true);
      expect(uploadsService.save).toHaveBeenCalledWith(mockBannerFile, 'events');
      expect(mockManager.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('throws BadRequestException if category does not exist or is inactive', async () => {
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(null),
      };
      dataSource.transaction.mockImplementation(
        async (cb: (mgr: any) => Promise<any>) => cb(mockManager),
      );

      await expect(
        service.create(mockAdminPrincipal, mockCreateEventDto, {
          banner: [mockBannerFile],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('cleans up uploaded banner if transaction fails', async () => {
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(mockActiveCategory),
        create: jest.fn().mockImplementation((_entity, data) => data),
        save: jest.fn().mockRejectedValue(new Error('DB failure during save')),
      };
      dataSource.transaction.mockImplementation(
        async (cb: (mgr: any) => Promise<any>) => cb(mockManager),
      );

      await expect(
        service.create(mockAdminPrincipal, mockCreateEventDto, {
          banner: [mockBannerFile],
        }),
      ).rejects.toThrow('DB failure during save');

      expect(uploadsService.removeEventImage).toHaveBeenCalledWith('saved_banner.jpg');
    });
  });

  describe('list and listPinned', () => {
    it('listPinned returns up to 4 active published pinned events', async () => {
      mockRepository.find.mockResolvedValue([createMockEvent({ isPinned: true })]);
      const result = await service.listPinned();
      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isPinned: true,
            status: EventStatus.PUBLISHED,
            endTime: expect.any(Object),
          },
          take: 4,
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('list returns paginated public events with phase filters', async () => {
      const result = await service.list({
        page: 1,
        limit: 10,
        categoryId: 'cat_music',
        q: 'rock',
        phase: EventPhase.UPCOMING,
      });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'event.status = :status',
        { status: EventStatus.PUBLISHED },
      );
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('detail', () => {
    it('returns detail of published event', async () => {
      const result = await service.detail(mockPublishedEvent.event_id);
      expect(result.event_id).toBe(mockPublishedEvent.event_id);
    });

    it('throws NotFoundException if event does not exist or is draft', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.detail('non_existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('manageDetail and manageList', () => {
    it('manageDetail returns event for admin', async () => {
      const result = await service.manageDetail(
        mockAdminPrincipal,
        mockPublishedEvent.event_id,
      );
      expect(result.event_id).toBe(mockPublishedEvent.event_id);
    });

    it('manageDetail throws ForbiddenException for regular user', async () => {
      await expect(
        service.manageDetail(mockUserPrincipal, 'evt_1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('manageDetail throws NotFoundException when event is missing', async () => {
      mockRepository.findOneBy.mockResolvedValue(null);
      await expect(
        service.manageDetail(mockAdminPrincipal, 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updatePin', () => {
    it('pins published event successfully when under limit', async () => {
      const eventToPin = createMockEvent({ isPinned: false });
      const mockManager = {
        query: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(eventToPin),
        count: jest.fn().mockResolvedValue(2),
        save: jest.fn().mockImplementation((ev) => Promise.resolve(ev)),
      };
      dataSource.transaction.mockImplementation(
        async (_isolation: string, cb: (mgr: any) => Promise<any>) =>
          cb(mockManager),
      );

      const result = await service.updatePin(
        mockAdminPrincipal,
        eventToPin.event_id,
        { isPinned: true },
      );
      expect(result.isPinned).toBe(true);
    });

    it('throws ConflictException when pinning ended or draft event', async () => {
      const mockManager = {
        query: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(mockDraftEvent),
      };
      dataSource.transaction.mockImplementation(
        async (_isolation: string, cb: (mgr: any) => Promise<any>) =>
          cb(mockManager),
      );

      await expect(
        service.updatePin(mockAdminPrincipal, mockDraftEvent.event_id, {
          isPinned: true,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when already reached maximum 4 pinned events', async () => {
      const eventToPin = createMockEvent({ isPinned: false });
      const mockManager = {
        query: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(eventToPin),
        count: jest.fn().mockResolvedValue(4),
      };
      dataSource.transaction.mockImplementation(
        async (_isolation: string, cb: (mgr: any) => Promise<any>) =>
          cb(mockManager),
      );

      await expect(
        service.updatePin(mockAdminPrincipal, eventToPin.event_id, {
          isPinned: true,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('deletes event and cleans up banner', async () => {
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(mockPublishedEvent),
        delete: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      dataSource.transaction.mockImplementation(
        async (cb: (mgr: any) => Promise<any>) => cb(mockManager),
      );

      const result = await service.remove(
        mockAdminPrincipal,
        mockPublishedEvent.event_id,
      );
      expect(result).toEqual({
        event_id: mockPublishedEvent.event_id,
        message: 'Event deleted',
      });
      expect(uploadsService.removeEventImage).toHaveBeenCalled();
    });

    it('throws ConflictException if event is referenced by other resources (code 23503)', async () => {
      dataSource.transaction.mockRejectedValue(
        new QueryFailedError(
          'DELETE',
          [],
          Object.assign(new Error('FK violation'), { code: '23503' }),
        ),
      );

      await expect(
        service.remove(mockAdminPrincipal, 'referenced_event'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('image and manageImage', () => {
    it('returns event image file stream', async () => {
      const result = await service.image(mockPublishedEvent.event_id);
      expect(uploadsService.readEventImage).toHaveBeenCalledWith('evt_banner_001.jpg');
      expect(result.mimetype).toBe('image/jpeg');
    });

    it('throws NotFoundException when image is not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.image('no_image')).rejects.toThrow(NotFoundException);
    });
  });
});

describe('EventCategoriesService', () => {
  let categoriesService: EventCategoriesService;
  let categoryRepo: jest.Mocked<any>;

  beforeEach(async () => {
    categoryRepo = {
      find: jest.fn().mockResolvedValue([mockActiveCategory]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventCategoriesService,
        { provide: getRepositoryToken(EventCategory), useValue: categoryRepo },
      ],
    }).compile();

    categoriesService = module.get<EventCategoriesService>(EventCategoriesService);
  });

  it('lists active event categories ordered by name ASC', async () => {
    const result = await categoriesService.list();
    expect(categoryRepo.find).toHaveBeenCalledWith({
      where: { isActive: true },
      select: {
        category_id: true,
        name: true,
        slug: true,
        description: true,
        isActive: true,
      },
      order: { name: 'ASC', category_id: 'ASC' },
    });
    expect(result).toHaveLength(1);
    expect(result[0].category_id).toBe(mockActiveCategory.category_id);
  });
});
