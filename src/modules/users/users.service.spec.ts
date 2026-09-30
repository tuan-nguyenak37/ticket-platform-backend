import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UserStatus } from './entities/enums/user-status.enum';
import { comparePassword } from '../../common/utils/password.util';

describe('UsersService', () => {
  let service: UsersService;
  const repo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
  };
  beforeEach(async () => {
    jest.resetAllMocks();
    repo.create.mockImplementation((data: Partial<User>) =>
      Object.assign(new User(), data),
    );
    repo.save.mockImplementation((user: User) => Promise.resolve(user));
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  it('normalizes email and hashes passwords before saving', async () => {
    repo.findOne.mockResolvedValue(null);
    const user = await service.create({
      email: ' Person@Example.com ',
      password: 'abcdef',
    });
    expect(user.email).toBe('person@example.com');
    expect(user.password).not.toBe('abcdef');
    expect(await comparePassword('abcdef', user.password)).toBe(true);
  });

  it('maps a concurrent unique constraint failure to 409', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.save.mockRejectedValue(
      new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('duplicate'), { code: '23505' }),
      ),
    );
    await expect(
      service.create({ email: 'person@example.com', password: 'abcdef' }),
    ).rejects.toThrow(ConflictException);
  });

  it('uses string user IDs and removes sensitive fields', async () => {
    repo.findOne.mockResolvedValue({
      user_id: 'user_abc',
      status: UserStatus.ACTIVE,
      password: 'hash',
      tokenVersion: 7,
    });
    const user = await service.findOne('user_abc');
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { user_id: 'user_abc' },
    });
    expect(user).not.toHaveProperty('password');
    expect(user).not.toHaveProperty('tokenVersion');
  });

  it('returns 404 for a missing user', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('rejects token rotation when another request has already rotated it', async () => {
    repo.update.mockResolvedValue({ affected: 0 });
    const user = Object.assign(new User(), {
      user_id: 'user_abc',
      tokenVersion: 4,
    });
    await expect(service.rotateTokenVersion(user)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(repo.update).toHaveBeenCalledWith(
      { user_id: 'user_abc', tokenVersion: 4, status: UserStatus.ACTIVE },
      { tokenVersion: 5 },
    );
  });
});
