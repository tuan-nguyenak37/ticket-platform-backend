import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/enums/user-status.enum';
import { PayoutAccountDto } from './dto/payout-account.dto';
import { OrganizerMember } from './entities/organizer-member.entity';
import { OrganizerPayoutAccount } from './entities/organizer-payout-account.entity';
import { Organizer } from './entities/organizer.entity';
import { OrganizerStatus } from './enums/organizer-status.enum';
import { OrganizersService } from './organizers.service';

describe('Organizer payout account ownership', () => {
  const organizers = { findOneBy: jest.fn(), findOne: jest.fn() };
  const members = { existsBy: jest.fn() };
  const users = { findOneBy: jest.fn() };
  const accounts = { findOneBy: jest.fn(), create: jest.fn(), save: jest.fn() };
  const manager = { getRepository: jest.fn() };
  const database = {
    transaction: jest.fn(),
    getRepository: jest.fn(),
    manager,
  };
  let service: OrganizersService;

  beforeEach(async () => {
    jest.resetAllMocks();
    organizers.findOneBy.mockResolvedValue({ organizerId: 'org_owned' });
    organizers.findOne.mockResolvedValue({
      organizerId: 'org_owned',
      status: OrganizerStatus.ACTIVE,
    });
    members.existsBy.mockResolvedValue(true);
    users.findOneBy.mockResolvedValue({ status: UserStatus.ACTIVE });
    accounts.findOneBy.mockResolvedValue(null);
    accounts.create.mockImplementation((record: object) => record);
    accounts.save.mockImplementation((record: object) =>
      Promise.resolve(record),
    );
    const repository = (entity: unknown) => {
      if (entity === Organizer) return organizers;
      if (entity === OrganizerMember) return members;
      if (entity === User) return users;
      if (entity === OrganizerPayoutAccount) return accounts;
      throw new Error('Unexpected repository');
    };
    manager.getRepository.mockImplementation(repository);
    database.getRepository.mockImplementation(repository);
    database.transaction.mockImplementation(
      async (operation: (transaction: typeof manager) => Promise<unknown>) =>
        operation(manager),
    );
    const module = await Test.createTestingModule({
      providers: [
        OrganizersService,
        { provide: getRepositoryToken(Organizer), useValue: organizers },
        { provide: getRepositoryToken(OrganizerMember), useValue: members },
        { provide: DataSource, useValue: database },
      ],
    }).compile();
    service = module.get(OrganizersService);
  });

  it('keeps account numbers as text including leading zeroes', async () => {
    const result = await service.putPayoutAccount('org_owned', 'user_owner', {
      bankName: ' Example Bank ',
      accountHolder: ' OWNER NAME ',
      accountNumber: '00123456',
    });
    expect(result).toMatchObject({
      bankName: 'Example Bank',
      accountHolder: 'OWNER NAME',
      accountNumber: '00123456',
    });
  });

  it('denies reads and writes by non-owners before accessing banking data', async () => {
    members.existsBy.mockResolvedValue(false);
    await expect(
      service.payoutAccount('org_owned', 'user_stranger'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.putPayoutAccount('org_owned', 'user_stranger', {
        bankName: 'Bank',
        accountHolder: 'Owner',
        accountNumber: '00123456',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(accounts.findOneBy).not.toHaveBeenCalled();
  });

  it('rejects saving accounts for suspended organizers', async () => {
    organizers.findOne.mockResolvedValue({ status: OrganizerStatus.SUSPENDED });
    await expect(
      service.putPayoutAccount('org_owned', 'user_owner', {
        bankName: 'Bank',
        accountHolder: 'Owner',
        accountNumber: '00123456',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(accounts.save).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only bank names and numeric account values', async () => {
    const dto = plainToInstance(PayoutAccountDto, {
      bankName: '  ',
      accountHolder: 'Owner',
      accountNumber: 123456,
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
