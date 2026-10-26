import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegistrationDto, DiscountDto } from './event-tools.dto';
import { discountAmount, registrationAnswers } from './registration';

describe('event registration and discounts', () => {
  const questions = [
    {
      id: 'name',
      label: 'Name',
      type: 'TEXT' as const,
      required: true,
      options: [],
    },
    {
      id: 'meal',
      label: 'Meal',
      type: 'SELECT' as const,
      required: false,
      options: ['Veg', 'Normal'],
    },
  ];
  it('validates required answers, rejects unknown fields and snapshots labels', () => {
    expect(() => registrationAnswers(questions)).toThrow(BadRequestException);
    expect(() =>
      registrationAnswers(questions, { name: 'Buyer', meal: 'Other' }),
    ).toThrow(BadRequestException);
    expect(() =>
      registrationAnswers(questions, { name: 'Buyer', admin: 'true' }),
    ).toThrow(BadRequestException);
    expect(() =>
      registrationAnswers(questions, { name: 'a'.repeat(2001) }),
    ).toThrow(BadRequestException);
    expect(
      registrationAnswers(questions, { name: ' Buyer ', meal: 'Veg' })[0],
    ).toEqual({ questionId: 'name', label: 'Name', value: 'Buyer' });
    expect(
      registrationAnswers(
        [{ ...questions[0], id: 'constructor', required: false }],
        {},
      )[0].value,
    ).toBe('');
  });
  it('uses integer money, rounds percentages down and caps at the subtotal', () => {
    expect(discountAmount(100001n, 'PERCENT', 15)).toBe(15000n);
    expect(discountAmount(9007199254740991n, 'PERCENT', 10)).toBe(
      900719925474099n,
    );
    expect(discountAmount(99n, 'FIXED', 1000)).toBe(99n);
    expect(discountAmount(0n, 'PERCENT', 100)).toBe(0n);
  });
  it('accepts orders without questions and rejects unsolicited answers', () => {
    expect(registrationAnswers([])).toEqual([]);
    expect(registrationAnswers([], {})).toEqual([]);
    expect(() => registrationAnswers([], { legacy: 'answer' })).toThrow(
      BadRequestException,
    );
  });
  it('rejects malformed nested questions and unexpected discount fields at the DTO boundary', async () => {
    expect(
      await validate(
        plainToInstance(RegistrationDto, {
          questions: [questions[0], questions[0]],
        }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(RegistrationDto, {
          questions: [{ ...questions[0], required: 'true' }],
        }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(DiscountDto, {
          code: 'SAVE',
          kind: 'FIXED',
          value: -1,
          usageLimit: 1,
          startsAt: 'bad',
          endsAt: 'bad',
        }),
      ),
    ).not.toHaveLength(0);
  });
});
