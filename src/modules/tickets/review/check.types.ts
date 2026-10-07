export enum CheckStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export enum CheckOutcome {
  PASSED = 'passed',
  NEEDS_REVIEW = 'needs_review',
}

export enum ReviewMethod {
  AUTOMATIC = 'automatic',
  MANUAL = 'manual',
}

export interface OcrLine {
  text: string;
  confidence: number;
  page: number;
  box: number[];
}

export interface ExtractedField {
  value: string | null;
  confidence: number;
  evidence: OcrLine[];
}

export interface DetectedCode {
  id: string;
  format: string;
  fingerprint: string;
  page: number;
  box: number[];
}

export interface ScanResult {
  fields: Record<string, ExtractedField>;
  codes: DetectedCode[];
  engineVersion: string;
}

export interface FieldComparison {
  field: string;
  expected: string | null;
  observed: string | null;
  status: 'match' | 'mismatch' | 'missing' | 'uncertain';
  confidence: number;
  evidence: OcrLine[];
}

export interface CheckReport {
  outcome: CheckOutcome;
  reasons: string[];
  fields: FieldComparison[];
  duplicates: Array<{
    ticketId: string;
    status: string;
    kind: 'file' | 'code';
  }>;
}
