import { BadRequestException } from '@nestjs/common';
import type { RegistrationQuestionDto } from './event-tools.dto';

export function registrationAnswers(
  questions: RegistrationQuestionDto[],
  input: Record<string, unknown> = {},
) {
  if (
    !input ||
    Array.isArray(input) ||
    typeof input !== 'object' ||
    Object.keys(input).length > 20
  )
    throw new BadRequestException('Invalid registration answers');
  if (
    Object.keys(input).some(
      (key) => !questions.some((question) => question.id === key),
    )
  )
    throw new BadRequestException('Unknown registration question');
  return questions.map((question) => {
    const raw = Object.prototype.hasOwnProperty.call(input, question.id)
      ? input[question.id]
      : undefined;
    if (raw !== undefined && (typeof raw !== 'string' || raw.length > 2000))
      throw new BadRequestException(
        'Registration answers must be text up to 2000 characters',
      );
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (question.required && !value)
      throw new BadRequestException(`Required: ${question.label}`);
    if (
      value &&
      question.type === 'SELECT' &&
      !question.options.includes(value)
    )
      throw new BadRequestException(`Invalid selection: ${question.label}`);
    return { questionId: question.id, label: question.label, value };
  });
}

export function discountAmount(
  subtotal: bigint,
  kind: 'PERCENT' | 'FIXED',
  value: number,
) {
  const amount =
    kind === 'PERCENT' ? (subtotal * BigInt(value)) / 100n : BigInt(value);
  return amount > subtotal ? subtotal : amount;
}
