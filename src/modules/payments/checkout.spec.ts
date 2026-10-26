import { ConflictException } from '@nestjs/common';
import type { Principal } from '../auth/authorization/principal';
import { OrdersService } from '../orders/orders.service';
import { ResaleService } from '../resale/resale.service';

describe('one-step checkout', () => {
  const actor = { user_id: 'buyer' } as Principal;
  const dto = { ticketTypeId: 'type_1', quantity: 2 };

  it('passes the idempotency key through and settles the created order', async () => {
    const create = jest.fn().mockResolvedValue({ orderId: 'ord_1' });
    const pay = jest.fn().mockResolvedValue({
      order: { status: 'PAID' },
      payment: { paymentId: 'pay_1' },
    });
    const service = Object.assign(
      Object.create(OrdersService.prototype) as OrdersService,
      { create, pay },
    );
    await expect(
      service.checkout(actor, 'request_1', dto),
    ).resolves.toMatchObject({ order: { status: 'PAID' } });
    expect(create).toHaveBeenCalledWith(actor, 'request_1', dto);
    expect(pay).toHaveBeenCalledWith(actor, 'ord_1');
  });

  it('does not pay when order creation is rejected', async () => {
    const create = jest
      .fn()
      .mockRejectedValue(new ConflictException('Not enough tickets'));
    const pay = jest.fn();
    const service = Object.assign(
      Object.create(OrdersService.prototype) as OrdersService,
      { create, pay },
    );
    await expect(service.checkout(actor, 'request_1', dto)).rejects.toThrow(
      ConflictException,
    );
    expect(pay).not.toHaveBeenCalled();
  });

  function resale() {
    const findOneBy = jest.fn().mockResolvedValue(null);
    const reserve = jest.fn().mockResolvedValue({ resaleOrderId: 'rord_1' });
    const pay = jest.fn().mockResolvedValue({ order: { status: 'PAID' } });
    const service: ResaleService = Object.assign(
      Object.create(ResaleService.prototype),
      {
        dataSource: { getRepository: () => ({ findOneBy }) },
        reserve,
        pay,
      },
    );
    return { service, findOneBy, reserve, pay };
  }

  it('reserves then settles resale in one request', async () => {
    const fixture = resale();
    await fixture.service.checkout(actor, 'listing_1');
    expect(fixture.reserve).toHaveBeenCalledWith(actor, 'listing_1');
    expect(fixture.pay).toHaveBeenCalledWith(actor, 'rord_1');
  });

  it('replays an already completed purchase for the same buyer without reserving again', async () => {
    const fixture = resale();
    fixture.findOneBy.mockResolvedValue({ resaleOrderId: 'rord_done' });
    await fixture.service.checkout(actor, 'listing_1');
    expect(fixture.findOneBy).toHaveBeenCalledWith({
      listingId: 'listing_1',
      buyerUserId: 'buyer',
      status: 'PAID',
    });
    expect(fixture.reserve).not.toHaveBeenCalled();
    expect(fixture.pay).toHaveBeenCalledWith(actor, 'rord_done');
  });

  it('recovers when a concurrent checkout completes before reservation', async () => {
    const fixture = resale();
    fixture.findOneBy
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ resaleOrderId: 'rord_done' });
    fixture.reserve.mockRejectedValue(
      new ConflictException('Listing is not available'),
    );
    await expect(
      fixture.service.checkout(actor, 'listing_1'),
    ).resolves.toMatchObject({ order: { status: 'PAID' } });
    expect(fixture.pay).toHaveBeenCalledWith(actor, 'rord_done');
  });

  it('does not settle another buyer purchase when the listing is unavailable', async () => {
    const fixture = resale();
    fixture.reserve.mockRejectedValue(
      new ConflictException('Listing is not available'),
    );
    await expect(fixture.service.checkout(actor, 'listing_1')).rejects.toThrow(
      ConflictException,
    );
    expect(fixture.pay).not.toHaveBeenCalled();
  });
});
