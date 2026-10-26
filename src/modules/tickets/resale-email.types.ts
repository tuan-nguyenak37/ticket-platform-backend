export interface ResaleEmailDetails {
  eventTitle: string;
  showingName: string;
  ticketTypeName: string;
  ticketNumber: number;
  grossAmount: string;
  feeAmount: string;
  netAmount: string;
  bankName: string;
  accountHolder: string;
  maskedAccountNumber: string;
  reference: string;
}

export type ResaleEmailKind = 'SOLD' | 'PAYOUT_PROCESSED';
