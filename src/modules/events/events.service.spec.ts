import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';
import { DataSource } from 'typeorm';
import { UploadsService } from '../../common/uploads/uploads.service';

describe('EventsService', () => {
  let service: EventsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: DataSource, useValue: {} },
        { provide: UploadsService, useValue: {} },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
