import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateTicketDto } from './create-ticket.dto';

describe('Tickets DTO Validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  describe('CreateTicketDto', () => {
    it('accepts valid ticket creation payload and transforms string numbers', async () => {
      const result = (await pipe.transform(
        {
          eventId: '  evt_12345  ',
          ticketTier: '  VIP Gold  ',
          seatInfo: '  Row 1, Seat 5  ',
          originalPrice: '1500000',
          price: '1200000',
          description: 'Vé đẹp',
        },
        { type: 'body', metatype: CreateTicketDto },
      )) as CreateTicketDto;

      expect(result.eventId).toBe('evt_12345');
      expect(result.ticketTier).toBe('VIP Gold');
      expect(result.seatInfo).toBe('Row 1, Seat 5');
      expect(result.originalPrice).toBe(1500000);
      expect(result.price).toBe(1200000);
    });

    it('rejects empty eventId or ticketTier', async () => {
      await expect(
        pipe.transform(
          {
            eventId: '',
            ticketTier: 'VIP',
            originalPrice: 1000,
            price: 800,
          },
          { type: 'body', metatype: CreateTicketDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform(
          {
            eventId: 'evt_1',
            ticketTier: '',
            originalPrice: 1000,
            price: 800,
          },
          { type: 'body', metatype: CreateTicketDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects negative or 0 price', async () => {
      await expect(
        pipe.transform(
          {
            eventId: 'evt_1',
            ticketTier: 'VIP',
            originalPrice: 1000,
            price: 0,
          },
          { type: 'body', metatype: CreateTicketDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform(
          {
            eventId: 'evt_1',
            ticketTier: 'VIP',
            originalPrice: 1000,
            price: -50,
          },
          { type: 'body', metatype: CreateTicketDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects price exceeding 1,000,000,000', async () => {
      await expect(
        pipe.transform(
          {
            eventId: 'evt_1',
            ticketTier: 'VIP',
            originalPrice: 1000,
            price: 1_000_000_001,
          },
          { type: 'body', metatype: CreateTicketDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-whitelisted properties (e.g. status, sellerId)', async () => {
      await expect(
        pipe.transform(
          {
            eventId: 'evt_1',
            ticketTier: 'VIP',
            originalPrice: 1000,
            price: 800,
            status: 'available',
          },
          { type: 'body', metatype: CreateTicketDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
