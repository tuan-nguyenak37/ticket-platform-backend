import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateEventDto } from './create-event.dto';
import { UpdateEventPinDto } from './update-event-pin.dto';
import { EventStatus } from '../entities/enums/event-status.enum';

describe('Events DTO Validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  describe('CreateEventDto', () => {
    const validPayload = {
      name: '  Đại Nhạc Hội Mùa Hè 2026  ',
      description: 'Mô tả chi tiết',
      startTime: '2026-08-01T10:00:00.000Z',
      endTime: '2026-08-01T18:00:00.000Z',
      venueName: '  Sân vận động Mỹ Đình  ',
      address: '  Lê Đức Thọ, Hà Nội  ',
      categoryId: 'event_cat_music',
      status: EventStatus.PUBLISHED,
    };

    it('accepts valid payload and trims string fields', async () => {
      const result = (await pipe.transform(validPayload, {
        type: 'body',
        metatype: CreateEventDto,
      })) as CreateEventDto;

      expect(result.name).toBe('Đại Nhạc Hội Mùa Hè 2026');
      expect(result.venueName).toBe('Sân vận động Mỹ Đình');
      expect(result.address).toBe('Lê Đức Thọ, Hà Nội');
      expect(result.status).toBe(EventStatus.PUBLISHED);
    });

    it('rejects invalid or missing ISO8601 date format', async () => {
      await expect(
        pipe.transform(
          { ...validPayload, startTime: '2026-08-01' },
          { type: 'body', metatype: CreateEventDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform(
          { ...validPayload, startTime: 'invalid-date' },
          { type: 'body', metatype: CreateEventDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid status (e.g. CANCELLED or random string)', async () => {
      await expect(
        pipe.transform(
          { ...validPayload, status: 'cancelled' },
          { type: 'body', metatype: CreateEventDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects forbidden non-whitelisted fields (e.g. isPinned, createdBy)', async () => {
      await expect(
        pipe.transform(
          { ...validPayload, isPinned: true },
          { type: 'body', metatype: CreateEventDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('UpdateEventPinDto', () => {
    it('accepts boolean isPinned', async () => {
      const result = (await pipe.transform(
        { isPinned: true },
        { type: 'body', metatype: UpdateEventPinDto },
      )) as UpdateEventPinDto;
      expect(result.isPinned).toBe(true);
    });

    it('rejects non-boolean isPinned', async () => {
      await expect(
        pipe.transform(
          { isPinned: 'true' },
          { type: 'body', metatype: UpdateEventPinDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
