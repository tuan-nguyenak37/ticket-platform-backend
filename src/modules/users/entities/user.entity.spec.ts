import { getMetadataArgsStorage } from 'typeorm';
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';
import { User } from './user.entity';

describe('User persistence model', () => {
  it('generates a user ID before insertion', () => {
    const user = new User();
    user.generateUserId();
    expect(user.user_id).toMatch(/^user_[A-Za-z0-9_-]{16}$/);
  });

  it('preserves an existing ID', () => {
    const user = new User();
    user.user_id = 'user_existing';
    user.generateUserId();
    expect(user.user_id).toBe('user_existing');
  });

  it('maps users and enforces uniqueness on email', () => {
    const metadata = getMetadataArgsStorage();
    expect(metadata.tables.find((table) => table.target === User)?.name).toBe(
      'users',
    );
    expect(
      metadata.columns.find(
        (column) => column.target === User && column.propertyName === 'email',
      )?.options,
    ).toMatchObject({ type: 'varchar', length: 255, unique: true });
  });

  it('defaults to an active regular user', () => {
    const columns = getMetadataArgsStorage().columns.filter(
      (column) => column.target === User,
    );
    expect(
      columns.find((column) => column.propertyName === 'role')?.options,
    ).toMatchObject({ default: UserRole.USER, enumName: 'user_role_enum' });
    expect(
      columns.find((column) => column.propertyName === 'status')?.options,
    ).toMatchObject({
      default: UserStatus.ACTIVE,
      enumName: 'user_status_enum',
    });
  });

  it('declares a password hash column rather than a plaintext password', () => {
    const columns = getMetadataArgsStorage().columns.filter(
      (column) => column.target === User,
    );
    expect(
      columns.some((column) => column.propertyName === 'password_hash'),
    ).toBe(true);
    expect(columns.some((column) => column.propertyName === 'password')).toBe(
      false,
    );
  });
});
