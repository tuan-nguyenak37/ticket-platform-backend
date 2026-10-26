import { Reflector } from '@nestjs/core';
import {
  HEADERS_METADATA,
  HTTP_CODE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { Principal } from '../auth/authorization/principal';
import { resolvePolicy } from '../auth/authorization/access-policy';
import { TicketCheckInService } from '../tickets/ticket-check-in.service';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { CheckInDto } from './dto/check-in.dto';
import { EventCheckInController } from './event-check-in.controller';

describe('Check-in API contract', () => {
  const payload = `pv1.example.${'A'.repeat(43)}`;

  it('requires authentication and serves one private no-store POST result', () => {
    const handler = Object.getOwnPropertyDescriptor(
      EventCheckInController.prototype,
      'checkIn',
    )!.value as (...args: never[]) => unknown;
    expect(
      resolvePolicy(new Reflector(), handler, EventCheckInController),
    ).toMatchObject({ kind: 'authenticated' });
    expect(Reflect.getMetadata(PATH_METADATA, EventCheckInController)).toBe(
      'v1/events/:id',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('check-in');
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });

  it('requires a selected showing, signed-QR shape and rejects unknown fields', () => {
    const dto = (value: unknown) => plainToInstance(CheckInDto, value);
    expect(
      validateSync(dto({ showingId: 'showing_selected', payload })),
    ).toHaveLength(0);
    expect(validateSync(dto({ payload }))).not.toHaveLength(0);
    expect(
      validateSync(dto({ showingId: '../other', payload })),
    ).not.toHaveLength(0);
    expect(
      validateSync(
        dto({ showingId: 'showing_selected', payload: 'ticket_id' }),
      ),
    ).not.toHaveLength(0);
    expect(
      validateSync(
        dto({ showingId: 'showing_selected', payload: 'A'.repeat(513) }),
      ),
    ).not.toHaveLength(0);
    expect(
      validateSync(
        dto({ showingId: 'showing_selected', payload, admitted: true }),
        {
          whitelist: true,
          forbidNonWhitelisted: true,
        },
      ),
    ).not.toHaveLength(0);
  });

  it('delegates the selected event and showing, never a client-supplied outcome', async () => {
    const checkIns = {
      checkIn: jest
        .fn()
        .mockResolvedValue({ admitted: false, alreadyCheckedIn: true }),
    };
    const controller = new EventCheckInController(
      checkIns as unknown as TicketCheckInService,
    );
    const actor: Principal = {
      user_id: 'user_owner',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      sessionId: 'session_owner',
    };
    await expect(
      controller.checkIn({ id: 'event_selected' }, actor, {
        showingId: 'showing_selected',
        payload,
      }),
    ).resolves.toMatchObject({ admitted: false });
    expect(checkIns.checkIn).toHaveBeenCalledWith(
      'event_selected',
      'showing_selected',
      actor,
      payload,
    );
  });
});
