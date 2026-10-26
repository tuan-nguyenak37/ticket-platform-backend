import {
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { createUploadOptions } from './upload.config';
import { UploadsService } from './uploads.service';

jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  unlink: jest.fn(),
  readFile: jest.fn(),
}));

describe('Event image upload infrastructure', () => {
  const config = new ConfigService({
    UPLOAD_DIR: 'private-test-uploads',
    UPLOAD_MAX_FILE_SIZE_MB: 1,
  });
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const file = (buffer = png, mimetype = 'image/png') =>
    ({ buffer, mimetype, size: buffer.length }) as Express.Multer.File;
  const service = new UploadsService(config);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(writeFile).mockResolvedValue(undefined);
    jest.mocked(unlink).mockResolvedValue(undefined);
  });

  it('sets multipart limits before accepting a file', () => {
    expect(createUploadOptions(config).limits).toMatchObject({
      fileSize: 1024 * 1024,
      files: 1,
      fields: 20,
      parts: 21,
    });
  });

  it('accepts a matching PNG signature', () => {
    expect(service.validate(file(), true)).toBe('image/png');
  });

  it('rejects missing, empty or mismatched files', () => {
    expect(() => service.validate(undefined, true)).toThrow(
      BadRequestException,
    );
    expect(() => service.validate(file(Buffer.alloc(0)), true)).toThrow(
      BadRequestException,
    );
    expect(() => service.validate(file(png, 'image/jpeg'), true)).toThrow(
      BadRequestException,
    );
    expect(() =>
      service.validate(file(Buffer.from('not an image')), true),
    ).toThrow(BadRequestException);
  });

  it('checks actual buffer size rather than client size metadata', () => {
    const oversized = file(Buffer.alloc(1024 * 1024 + 1));
    oversized.size = 1;
    expect(() => service.validate(oversized, true)).toThrow(
      PayloadTooLargeException,
    );
  });

  it('generates a basename and writes exclusively to the event directory', async () => {
    const stored = await service.save(file(), 'events');
    expect(stored.filename).toMatch(/^[a-f0-9-]{36}\.png$/);
    expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('events'), {
      recursive: true,
    });
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining(stored.filename),
      png,
      { flag: 'wx', mode: 0o600 },
    );
  });

  it('attempts cleanup and preserves the storage failure', async () => {
    const failure = Object.assign(new Error('Disk full'), { code: 'ENOSPC' });
    jest.mocked(writeFile).mockRejectedValue(failure);
    await expect(service.save(file(), 'events')).rejects.toBe(failure);
    expect(unlink).toHaveBeenCalledTimes(1);
  });

  it('does not unlink an existing file after exclusive-create collision', async () => {
    jest
      .mocked(writeFile)
      .mockRejectedValue(
        Object.assign(new Error('Exists'), { code: 'EEXIST' }),
      );
    await expect(service.save(file(), 'events')).rejects.toThrow('Exists');
    expect(unlink).not.toHaveBeenCalled();
  });

  it('rejects traversal before filesystem reads', async () => {
    await expect(
      service.readEventImage('../secret.png'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(readFile).not.toHaveBeenCalled();
  });

  it('maps a missing image to 404', async () => {
    jest
      .mocked(readFile)
      .mockRejectedValue(
        Object.assign(new Error('Missing'), { code: 'ENOENT' }),
      );
    await expect(
      service.readEventImage('00000000-0000-0000-0000-000000000000.png'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
