import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { TicketsService } from './tickets.service';
import { UploadsService } from '../../common/uploads/uploads.service';
import { Readable } from 'stream';
import { UserRole } from '../users/entities/enums/user-role.enum';
import { UserStatus } from '../users/entities/enums/user-status.enum';

describe('New ticket PDF requirement', () => {
  const transaction = jest.fn();
  const service = new TicketsService(
    { transaction } as unknown as DataSource,
    new UploadsService(new ConfigService()),
  );

  it.each([
    ['image/png', 'Ticket files must be PDF'],
    ['application/pdf', 'File content does not match an allowed type'],
  ])(
    'rejects PNG bytes declared as %s before writing data',
    async (mimetype, message) => {
      await expect(
        service.create(
          {
            user_id: 'seller',
            role: UserRole.USER,
            status: UserStatus.ACTIVE,
            tokenVersion: 0,
          },
          {
            eventId: 'event',
            ticketTier: 'VIP',
            originalPrice: 500000,
            price: 400000,
          },
          {
            ticketFile: [
              {
                fieldname: 'ticketFile',
                encoding: '7bit',
                size: 8,
                stream: Readable.from([]),
                destination: '',
                filename: '',
                path: '',
                originalname: 'fake.pdf',
                mimetype,
                buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
              },
            ],
          },
        ),
      ).rejects.toThrow(message);
      expect(transaction).not.toHaveBeenCalled();
    },
  );
});
