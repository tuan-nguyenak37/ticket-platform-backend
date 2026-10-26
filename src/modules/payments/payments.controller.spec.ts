import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Principal } from '../auth/authorization/principal';
import { OrdersService } from '../orders/orders.service';
import { PaymentsController } from './payments.controller';
import { ResaleController } from '../resale/resale.controller';
import { ResaleService } from '../resale/resale.service';

describe.each(['primary', 'resale'])('%s payment confirmation', (kind) => {
  const actor = { user_id: 'buyer' } as Principal;
  const pay = jest.fn();
  const controller =
    kind === 'primary'
      ? new PaymentsController({ pay } as unknown as OrdersService)
      : new ResaleController({ pay } as unknown as ResaleService);

  beforeEach(() => pay.mockReset());

  it.each([undefined, {}])(
    'rejects direct settlement with an empty confirmation body',
    (body) => {
      expect(() => controller.pay(actor, { id: 'order' }, body)).toThrow(
        ConflictException,
      );
      expect(pay).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    [],
    'SUCCESS',
    { outcome: 'SUCCESS' },
    { outcome: 'FAILURE' },
    { amount: 1 },
    { method: 'UNKNOWN' },
    { method: null },
    { method: 'CARD', amount: 1 },
  ])('rejects client-controlled payment data', (body) => {
    expect(() => controller.pay(actor, { id: 'order' }, body)).toThrow(
      BadRequestException,
    );
    expect(pay).not.toHaveBeenCalled();
  });

  it.each(['BANK_TRANSFER', 'CARD', 'WALLET'])(
    'does not settle an order from a client-selected method %s',
    (method) => {
      expect(() => controller.pay(actor, { id: 'order' }, { method })).toThrow(
        ConflictException,
      );
      expect(pay).not.toHaveBeenCalled();
    },
  );
});
