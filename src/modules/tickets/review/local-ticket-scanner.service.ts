import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { createHmac, randomUUID } from 'crypto';
import { resolve } from 'path';
import { StringDecoder } from 'string_decoder';
import { ScanResult, ExtractedField } from './check.types';

export class ScanFailure extends Error {
  constructor(
    readonly code: string,
    readonly retryable = false,
  ) {
    super(code);
  }
}

@Injectable()
export class LocalTicketScanner {
  constructor(private readonly config: ConfigService) {}

  async ready() {
    const result = await this.execute(['--check']);
    if (
      !result ||
      typeof result !== 'object' ||
      !('ready' in result) ||
      result.ready !== true
    ) {
      throw new ScanFailure('scanner_unavailable');
    }
  }

  private execute(args: string[]): Promise<unknown> {
    return new Promise((accept, reject) => {
      const process = spawn(
        this.config.get<string>('TICKET_PYTHON_PATH', 'python'),
        [
          resolve(
            this.config.get<string>(
              'TICKET_SCANNER_SCRIPT',
              'scripts/ticket-scanner/scan.py',
            ),
          ),
          '--tesseract',
          this.config.get<string>('TICKET_TESSERACT_PATH', 'tesseract'),
          ...args,
        ],
        {
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: processPlatformSupportsGroups(),
        },
      );
      let output = '';
      const decoder = new StringDecoder('utf8');
      let failure: ScanFailure | undefined;
      const terminate = () => {
        if (process.pid && processPlatformSupportsGroups()) {
          try {
            globalThis.process.kill(-process.pid, 'SIGKILL');
          } catch {
            process.kill('SIGKILL');
          }
        } else if (process.pid) {
          const killer = spawn(
            'taskkill',
            ['/PID', String(process.pid), '/T', '/F'],
            { shell: false, windowsHide: true, stdio: 'ignore' },
          );
          killer.on('error', () => process.kill());
        }
      };
      const timer = setTimeout(
        () => {
          failure = new ScanFailure('scan_timeout', true);
          terminate();
        },
        this.config.get<number>('TICKET_SCAN_TIMEOUT_SECONDS', 120) * 1000,
      );
      process.stdout!.on('data', (chunk: Buffer) => {
        if (failure) return;
        output += decoder.write(chunk);
        if (Buffer.byteLength(output) > 512 * 1024) {
          failure = new ScanFailure('scan_output_limit');
          terminate();
        }
      });
      // Scanner stderr can contain OCR text or file paths: consume, never log it.
      process.stderr!.on('data', () => undefined);
      process.on('error', () => {
        clearTimeout(timer);
        reject(new ScanFailure('scanner_unavailable', true));
      });
      process.on('close', (exit) => {
        clearTimeout(timer);
        output += decoder.end();
        if (failure) return reject(failure);
        try {
          const result: unknown = JSON.parse(output);
          if (result && typeof result === 'object' && 'error' in result) {
            const allowed = [
              'pdf_password',
              'page_limit',
              'pixel_limit',
              'code_limit',
              'invalid_file',
              'ocr_unavailable',
              'ocr_timeout',
              'scanner_unavailable',
            ];
            const code = allowed.includes(String(result.error))
              ? String(result.error)
              : 'scan_failed';
            return reject(
              new ScanFailure(
                code,
                code === 'ocr_timeout' ||
                  code === 'ocr_unavailable' ||
                  code === 'scanner_unavailable',
              ),
            );
          }
          if (exit !== 0) return reject(new ScanFailure('scan_failed', true));
          accept(result);
        } catch {
          reject(new ScanFailure('invalid_scan_result'));
        }
      });
    });
  }

  async scan(path: string): Promise<ScanResult> {
    const result = await this.execute(['--file', path]);
    if (!result || typeof result !== 'object')
      throw new ScanFailure('invalid_scan_result');
    const raw = result as {
      fields?: unknown;
      codes?: unknown;
      engineVersion?: unknown;
    };
    if (
      !raw.fields ||
      typeof raw.fields !== 'object' ||
      !Array.isArray(raw.codes) ||
      raw.codes.length > 32 ||
      typeof raw.engineVersion !== 'string'
    )
      throw new ScanFailure('invalid_scan_result');
    const secret = this.config.get<string>('TICKET_CODE_HMAC_SECRET');
    if (!secret) throw new ScanFailure('hmac_not_configured');
    const codes: ScanResult['codes'] = [];
    const seen = new Set<string>();
    const payloads: string[] = [];
    for (const entry of raw.codes as Array<{
      bytes?: unknown;
      format?: unknown;
      page?: unknown;
      box?: unknown;
    }>) {
      if (
        typeof entry.bytes !== 'string' ||
        entry.bytes.length > 16384 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(entry.bytes) ||
        typeof entry.format !== 'string' ||
        !Number.isInteger(entry.page) ||
        !Array.isArray(entry.box) ||
        entry.box.length !== 4 ||
        entry.box.some((n) => !Number.isFinite(n))
      )
        throw new ScanFailure('invalid_scan_result');
      const bytes = Buffer.from(entry.bytes, 'base64');
      if (!bytes.length) continue;
      const fingerprint = createHmac('sha256', secret)
        .update(bytes)
        .digest('hex');
      const text = bytes.toString('utf8');
      if (text.length) payloads.push(text);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      codes.push({
        id: randomUUID(),
        fingerprint,
        format: entry.format.slice(0, 64),
        page: entry.page as number,
        box: entry.box as number[],
      });
    }
    const fields: ScanResult['fields'] = {};
    for (const key of [
      'eventName',
      'date',
      'time',
      'venue',
      'ticketTier',
      'seat',
      'originalPrice',
    ]) {
      const field = (raw.fields as Record<string, unknown>)[key] as
        ExtractedField | undefined;
      if (
        !field ||
        !(field.value === null || typeof field.value === 'string') ||
        typeof field.confidence !== 'number' ||
        !Number.isFinite(field.confidence) ||
        field.confidence < 0 ||
        field.confidence > 100 ||
        !Array.isArray(field.evidence)
      )
        throw new ScanFailure('invalid_scan_result');
      const redact = (text: string) =>
        payloads
          .reduce(
            (value, payload) => value.split(payload).join('[redacted-code]'),
            text,
          )
          .slice(0, 1000);
      fields[key] = {
        value: field.value === null ? null : redact(field.value),
        confidence: field.confidence,
        evidence: field.evidence.slice(0, 5).map((line) => {
          if (
            typeof line.text !== 'string' ||
            !Number.isFinite(line.confidence) ||
            !Number.isInteger(line.page) ||
            !Array.isArray(line.box) ||
            line.box.some((n) => !Number.isFinite(n))
          )
            throw new ScanFailure('invalid_scan_result');
          return {
            text: redact(line.text),
            confidence: line.confidence,
            page: line.page,
            box: line.box,
          };
        }),
      };
    }
    return { fields, codes, engineVersion: raw.engineVersion.slice(0, 100) };
  }
}

function processPlatformSupportsGroups() {
  return process.platform !== 'win32';
}
