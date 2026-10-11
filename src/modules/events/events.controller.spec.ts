import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventImagesInterceptor } from './event-images.interceptor';
import {
  mockAdminPrincipal,
  mockBannerFile,
  mockCreateEventDto,
  mockPublishedEvent,
  mockUpdateEventDto,
} from './test/events.mock-data';
import { EventResponseDto } from './dto/event-response.dto';
import { EventCategoriesController } from './event-categories.controller';
import { EventCategoriesService } from './event-categories.service';

describe('EventsController', () => {
  let controller: EventsController;
  let service: jest.Mocked<Partial<EventsService>>;

  const mockPublicItem = EventResponseDto.from(mockPublishedEvent);

  beforeEach(async () => {
    service = {
      list: jest.fn().mockResolvedValue({ items: [mockPublicItem], total: 1 }),
      listPinned: jest.fn().mockResolvedValue([mockPublicItem]),
      updatePin: jest.fn().mockResolvedValue(mockPublicItem),
      manageList: jest.fn().mockResolvedValue({ items: [mockPublicItem], total: 1 }),
      manageDetail: jest.fn().mockResolvedValue(mockPublicItem),
      manageImage: jest.fn().mockResolvedValue({
        mimetype: 'image/jpeg',
        buffer: Buffer.from('img bytes'),
      }),
      detail: jest.fn().mockResolvedValue(mockPublicItem),
      update: jest.fn().mockResolvedValue(mockPublicItem),
      remove: jest.fn().mockResolvedValue({
        event_id: 'evt_test_001',
        message: 'Event deleted',
      }),
      create: jest.fn().mockResolvedValue(mockPublicItem),
      image: jest.fn().mockResolvedValue({
        mimetype: 'image/jpeg',
        buffer: Buffer.from('img bytes'),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        { provide: EventsService, useValue: service },
        { provide: ConfigService, useValue: new ConfigService() },
        { provide: EventImagesInterceptor, useValue: { intercept: jest.fn() } },
      ],
    }).compile();

    controller = module.get<EventsController>(EventsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('list and pinned', () => {
    it('list calls service.list', async () => {
      const query = { page: 1, limit: 10 } as any;
      const result = await controller.list(query);
      expect(service.list).toHaveBeenCalledWith(query);
      expect(result.items).toHaveLength(1);
    });

    it('pinned calls service.listPinned', async () => {
      const result = await controller.pinned();
      expect(service.listPinned).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('manage endpoints', () => {
    it('updatePin calls service.updatePin', async () => {
      const result = await controller.updatePin(mockAdminPrincipal, 'evt_1', {
        isPinned: true,
      });
      expect(service.updatePin).toHaveBeenCalledWith(mockAdminPrincipal, 'evt_1', {
        isPinned: true,
      });
      expect(result).toBe(mockPublicItem);
    });

    it('manageList calls service.manageList', async () => {
      const query = { page: 1, limit: 10 } as any;
      await controller.manageList(mockAdminPrincipal, query);
      expect(service.manageList).toHaveBeenCalledWith(mockAdminPrincipal, query);
    });

    it('manageDetail calls service.manageDetail', async () => {
      await controller.manageDetail(mockAdminPrincipal, 'evt_1');
      expect(service.manageDetail).toHaveBeenCalledWith(mockAdminPrincipal, 'evt_1');
    });

    it('manageImage streams image with correct headers', async () => {
      const mockRes = { setHeader: jest.fn(), send: jest.fn() } as unknown as Response;
      await controller.manageImage(mockAdminPrincipal, 'evt_1', mockRes);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
      expect(mockRes.send).toHaveBeenCalled();
    });
  });

  describe('public detail and image', () => {
    it('detail calls service.detail', async () => {
      const result = await controller.detail('evt_1');
      expect(service.detail).toHaveBeenCalledWith('evt_1');
      expect(result).toBe(mockPublicItem);
    });

    it('image streams image with headers', async () => {
      const mockRes = { setHeader: jest.fn(), send: jest.fn() } as unknown as Response;
      await controller.image('evt_1', mockRes);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
      expect(mockRes.send).toHaveBeenCalled();
    });
  });

  describe('create, update, remove', () => {
    it('create calls service.create with files', async () => {
      const files = { banner: [mockBannerFile] };
      const result = await controller.create(
        mockAdminPrincipal,
        mockCreateEventDto,
        files,
      );
      expect(service.create).toHaveBeenCalledWith(
        mockAdminPrincipal,
        mockCreateEventDto,
        files,
      );
      expect(result).toBe(mockPublicItem);
    });

    it('update calls service.update with dto and files', async () => {
      const files = { banner: [mockBannerFile] };
      const result = await controller.update(
        mockAdminPrincipal,
        'evt_1',
        mockUpdateEventDto,
        files,
      );
      expect(service.update).toHaveBeenCalledWith(
        mockAdminPrincipal,
        'evt_1',
        mockUpdateEventDto,
        files,
      );
      expect(result).toBe(mockPublicItem);
    });

    it('remove calls service.remove', async () => {
      const result = await controller.remove(mockAdminPrincipal, 'evt_1');
      expect(service.remove).toHaveBeenCalledWith(mockAdminPrincipal, 'evt_1');
      expect(result).toEqual({ event_id: 'evt_test_001', message: 'Event deleted' });
    });
  });
});

describe('EventCategoriesController', () => {
  let categoriesController: EventCategoriesController;
  let categoriesService: jest.Mocked<Partial<EventCategoriesService>>;

  beforeEach(async () => {
    categoriesService = {
      list: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventCategoriesController],
      providers: [{ provide: EventCategoriesService, useValue: categoriesService }],
    }).compile();

    categoriesController = module.get<EventCategoriesController>(
      EventCategoriesController,
    );
  });

  it('lists active categories', async () => {
    await categoriesController.list();
    expect(categoriesService.list).toHaveBeenCalled();
  });
});
