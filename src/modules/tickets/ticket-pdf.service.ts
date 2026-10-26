import { Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { UploadsService } from '../../common/uploads/uploads.service';
import { Ticket } from './entities/ticket.entity';
import { TicketQrService } from './ticket-qr.service';

export interface PrintableTicket {
  ticket: Ticket;
  credentialId: string;
}

const colors = {
  ink: rgb(0.13, 0.09, 0.19),
  muted: rgb(0.43, 0.39, 0.49),
  purple: rgb(0.46, 0.25, 0.78),
  dark: rgb(0.09, 0.06, 0.14),
  pale: rgb(0.96, 0.94, 0.99),
  line: rgb(0.86, 0.82, 0.91),
  white: rgb(1, 1, 1),
};

@Injectable()
export class TicketPdfService {
  private fontBytes?: Buffer;
  constructor(
    private readonly qr: TicketQrService,
    private readonly uploads: UploadsService,
  ) {}

  async render(tickets: PrintableTicket[]): Promise<Buffer> {
    this.fontBytes ??= await readFile(
      join(__dirname, 'assets', 'NotoSans-Regular.ttf'),
    );
    const document = await PDFDocument.create();
    document.registerFontkit(fontkit);
    const font = await document.embedFont(this.fontBytes, { subset: true });
    const charset = new Set(font.getCharacterSet());
    document.setTitle('TicketVerse · Vé điện tử');
    document.setAuthor('TicketVerse');
    document.setSubject('Vé sự kiện · Mỗi trang là một vé riêng biệt');
    const posters = new Map<string, PDFImage | null>();
    for (const [index, { ticket, credentialId }] of tickets.entries()) {
      const showing = ticket.ticketType.showing;
      const event = showing.event;
      const page = document.addPage([595.28, 841.89]);
      const text = (
        value: string,
        x: number,
        top: number,
        width: number,
        size = 11,
        maxLines = 1,
        color = colors.ink,
      ) =>
        this.text(
          page,
          font,
          charset,
          value,
          x,
          top,
          width,
          size,
          maxLines,
          color,
        );
      const box = (
        x: number,
        top: number,
        width: number,
        height: number,
        color: ReturnType<typeof rgb>,
      ) =>
        page.drawRectangle({
          x,
          y: page.getHeight() - top - height,
          width,
          height,
          color,
        });

      text('TicketVerse', 32, 30, 260, 25);
      box(173, 51, 5, 5, colors.purple);
      text('VÉ ĐIỆN TỬ', 408, 32, 155, 10, 1, colors.purple);
      text(
        `Vé ${index + 1} / ${tickets.length}`,
        408,
        49,
        155,
        9,
        1,
        colors.muted,
      );

      box(32, 80, 531.28, 224, colors.dark);
      if (!posters.has(event.eventId))
        posters.set(
          event.eventId,
          await this.poster(document, event.posterUrl, event.eventId),
        );
      const poster = posters.get(event.eventId);
      if (poster) {
        const scale = Math.min(531.28 / poster.width, 224 / poster.height);
        const width = poster.width * scale;
        const height = poster.height * scale;
        page.drawImage(poster, {
          x: 32 + (531.28 - width) / 2,
          y: page.getHeight() - 304 + (224 - height) / 2,
          width,
          height,
        });
      } else {
        page.drawCircle({
          x: 467,
          y: 640,
          size: 87,
          color: colors.purple,
          opacity: 0.5,
        });
        page.drawCircle({
          x: 510,
          y: 695,
          size: 52,
          color: colors.purple,
          opacity: 0.4,
        });
        text(
          'TRẢI NGHIỆM ĐANG CHỜ BẠN',
          56,
          112,
          400,
          10,
          1,
          rgb(0.81, 0.68, 1),
        );
        text('Một tấm vé.', 56, 149, 400, 31, 1, colors.white);
        text('Một cuộc hẹn đáng nhớ.', 56, 193, 470, 23, 1, colors.white);
        text(
          'KHÁM PHÁ. KẾT NỐI. TRẢI NGHIỆM.',
          56,
          267,
          450,
          9,
          1,
          rgb(0.81, 0.68, 1),
        );
      }

      text(event.title, 32, 322, 531.28, 21, 2);
      text(
        `Ban tổ chức: ${event.organizer.name}`,
        32,
        386,
        531.28,
        10,
        1,
        colors.muted,
      );
      page.drawRectangle({
        x: 32,
        y: page.getHeight() - 773,
        width: 531.28,
        height: 353,
        borderColor: colors.line,
        borderWidth: 0.8,
      });
      box(32, 420, 531.28, 60, colors.purple);
      text('HẠNG VÉ', 48, 430, 499.28, 8, 1, colors.white);
      text(ticket.ticketType.name, 48, 446, 499.28, 14, 2, colors.white);

      const qr = await document.embedPng(
        await this.qr.png(ticket.ticketId, credentialId),
      );
      page.drawImage(qr, {
        x: 44,
        y: page.getHeight() - 676,
        width: 184,
        height: 184,
      });
      text(ticket.ticketId, 48, 679, 180, 7, 1, colors.muted);
      page.drawLine({
        start: { x: 242, y: page.getHeight() - 496 },
        end: { x: 242, y: page.getHeight() - 688 },
        color: colors.line,
        thickness: 0.8,
        dashArray: [3, 3],
      });

      text(
        `VÉ SỐ ${String(ticket.ticketNumber).padStart(2, '0')}`,
        260,
        494,
        287,
        12,
        1,
        colors.purple,
      );
      text('SUẤT DIỄN', 260, 522, 287, 8, 1, colors.muted);
      text(showing.name, 260, 538, 287, 12, 2);
      text('THỜI GIAN · GIỜ VIỆT NAM', 260, 580, 287, 8, 1, colors.muted);
      const clock = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
      const date = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        dateStyle: 'full',
      });
      const sameDate =
        date.format(showing.startTime) === date.format(showing.endTime);
      text(
        sameDate
          ? `${clock.format(showing.startTime)} – ${clock.format(showing.endTime)}`
          : `${clock.format(showing.startTime)} · ${date.format(showing.startTime)}`,
        260,
        597,
        287,
        14,
        2,
      );
      text(
        sameDate
          ? date.format(showing.startTime)
          : `Đến ${clock.format(showing.endTime)} · ${date.format(showing.endTime)}`,
        260,
        637,
        287,
        10,
        2,
      );
      text(
        `Mã đơn: ${ticket.orderItem.orderId}`,
        260,
        677,
        287,
        8,
        1,
        colors.muted,
      );

      box(32.5, 700, 530.28, 72.5, colors.pale);
      text('ĐỊA ĐIỂM', 48, 710, 499.28, 8, 1, colors.purple);
      text(showing.venueName, 48, 726, 499.28, 12);
      text(
        `${showing.address}, ${showing.city}`,
        48,
        746,
        499.28,
        9,
        2,
        colors.muted,
      );
      text(
        'Giữ kín mã QR. Không chia sẻ ảnh vé hoặc gửi mã cho người lạ.',
        32,
        787,
        531.28,
        9,
        1,
        colors.ink,
      );
      text(
        'Vé chuyển nhượng chỉ còn hiệu lực với mã QR mới nhất trong tài khoản chủ vé.',
        32,
        803,
        531.28,
        8,
        1,
        colors.muted,
      );
      text(
        'TICKETVERSE · KHÁM PHÁ. KẾT NỐI. TRẢI NGHIỆM.',
        32,
        825,
        531.28,
        7,
        1,
        colors.purple,
      );
    }
    return Buffer.from(await document.save());
  }

  private async poster(
    document: PDFDocument,
    url: string | null,
    eventId: string,
  ) {
    // ponytail: local JPEG/PNG only; add a trusted image converter for other poster formats.
    const prefix = `/api/v1/events/${eventId}/poster/`;
    if (!url?.startsWith(prefix)) return null;
    try {
      const image = await this.uploads.readEventImage(url.slice(prefix.length));
      if (image.mimetype === 'image/png')
        return await document.embedPng(image.buffer);
      if (image.mimetype === 'image/jpeg')
        return await document.embedJpg(image.buffer);
    } catch {
      return null;
    }
    return null;
  }

  private text(
    page: PDFPage,
    font: PDFFont,
    charset: Set<number>,
    value: string,
    x: number,
    top: number,
    width: number,
    size: number,
    maxLines: number,
    color: ReturnType<typeof rgb>,
  ) {
    const cleaned = Array.from(
      value.normalize('NFC').replace(/\s+/g, ' ').trim(),
    )
      .map((character) =>
        charset.has(character.codePointAt(0)!) ? character : '?',
      )
      .join('');
    const lines: string[] = [];
    let line = '';
    for (const word of cleaned.split(' ')) {
      if (line && font.widthOfTextAtSize(`${line} ${word}`, size) > width) {
        lines.push(line);
        line = '';
      }
      for (const character of (line ? ' ' : '') + word) {
        if (font.widthOfTextAtSize(line + character, size) > width) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      let last = lines[maxLines - 1];
      while (font.widthOfTextAtSize(last + '…', size) > width)
        last = last.slice(0, -1);
      lines[maxLines - 1] = last.trimEnd() + '…';
    }
    lines.slice(0, maxLines).forEach((content, index) =>
      page.drawText(content, {
        x,
        y: page.getHeight() - top - size - index * (size + 4),
        size,
        font,
        color,
      }),
    );
  }
}
