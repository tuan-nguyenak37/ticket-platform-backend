import { PDFDocument, PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import { UploadsService } from '../../common/uploads/uploads.service';
import { Ticket } from './entities/ticket.entity';
import { TicketPdfService } from './ticket-pdf.service';
import { TicketQrService } from './ticket-qr.service';

describe('TicketVerse PDF tickets', () => {
  const ticket = {
    ticketId: 'ticket_pdf_test',
    ticketNumber: 1,
    orderItem: { orderId: 'ord_pdf_test' },
    ticketType: {
      name: 'Vé phổ thông · Quyền lợi trọn vẹn',
      showing: {
        name: 'Đêm nhạc mùa thu',
        startTime: new Date('2026-10-28T13:00:00Z'),
        endTime: new Date('2026-10-28T15:30:00Z'),
        venueName: 'Nhà hát Hòa Bình',
        address: '240 Đường 3 Tháng 2',
        city: 'TP. Hồ Chí Minh',
        event: {
          eventId: 'event_pdf',
          title: 'Những thành phố mơ màng · Mùa thu 2026',
          organizer: { name: 'TicketVerse Live' },
          posterUrl: '/api/v1/events/event_pdf/poster/test.png',
        },
      },
    },
  } as Ticket;

  async function fixture() {
    const png = await QRCode.toBuffer('pdf-test-credential', { margin: 4 });
    const qr = { png: jest.fn().mockResolvedValue(png) };
    const uploads = {
      readEventImage: jest
        .fn()
        .mockResolvedValue({ buffer: png, mimetype: 'image/png' }),
    };
    const service = new TicketPdfService(
      qr as unknown as TicketQrService,
      uploads as unknown as UploadsService,
    );
    return { service, qr, uploads };
  }

  afterEach(() => jest.restoreAllMocks());

  it('renders one A4 page per ticket with its own unchanged QR and reuses the event poster', async () => {
    const { service, qr, uploads } = await fixture();
    const images = jest.spyOn(PDFPage.prototype, 'drawImage');
    const text = jest.spyOn(PDFPage.prototype, 'drawText');
    const pdf = await PDFDocument.load(
      await service.render([
        { ticket, credentialId: 'cred_first' },
        {
          ticket: { ...ticket, ticketId: 'ticket_second', ticketNumber: 2 },
          credentialId: 'cred_second',
        },
      ]),
    );
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 595.28, height: 841.89 });
    expect(pdf.getTitle()).toBe('TicketVerse · Vé điện tử');
    expect(uploads.readEventImage).toHaveBeenCalledTimes(1);
    expect(qr.png.mock.calls).toEqual([
      ['ticket_pdf_test', 'cred_first'],
      ['ticket_second', 'cred_second'],
    ]);
    expect(images).toHaveBeenCalledTimes(4);
    const content = text.mock.calls.map(([value]) => value).join('\n');
    for (const value of [
      'TicketVerse',
      'HẠNG VÉ',
      'ĐỊA ĐIỂM',
      '20:00 – 22:30',
      'Thứ Tư, 28 tháng 10, 2026',
      'ord_pdf_test',
      'VÉ SỐ 02',
    ])
      expect(content).toContain(value);
    expect(content).not.toContain('PASS VÉ');
  });

  it.each(['missing', 'corrupt', 'unsupported', 'remote'])(
    'still produces a usable QR ticket when the poster is %s',
    async (mode) => {
      const { service, uploads, qr } = await fixture();
      if (mode === 'missing')
        uploads.readEventImage.mockRejectedValue(new Error('Missing image'));
      if (mode === 'corrupt')
        uploads.readEventImage.mockResolvedValue({
          buffer: Buffer.from('bad image'),
          mimetype: 'image/png',
        });
      if (mode === 'unsupported')
        uploads.readEventImage.mockResolvedValue({
          buffer: Buffer.from('GIF89a'),
          mimetype: 'image/gif',
        });
      const sample = structuredClone(ticket);
      if (mode === 'remote')
        sample.ticketType.showing.event.posterUrl = 'http://127.0.0.1/private';
      const images = jest.spyOn(PDFPage.prototype, 'drawImage');
      const pdf = await PDFDocument.load(
        await service.render([{ ticket: sample, credentialId: 'cred' }]),
      );
      expect(pdf.getPageCount()).toBe(1);
      expect(images).toHaveBeenCalledTimes(1);
      expect(qr.png).toHaveBeenCalledWith(ticket.ticketId, 'cred');
      if (mode === 'remote')
        expect(uploads.readEventImage).not.toHaveBeenCalled();
    },
  );

  it('keeps long Vietnamese text within its allocated regions and includes both dates for overnight shows', async () => {
    const { service } = await fixture();
    const sample = structuredClone(ticket);
    sample.ticketType.showing.event.title =
      'Đêm diễn tiếng Việt rất dài '.repeat(20) + '🎵';
    sample.ticketType.name = 'HẠNGVÉRẤTDÀI'.repeat(30);
    sample.ticketType.showing.address = 'Địa chỉ rất dài '.repeat(30);
    sample.ticketType.showing.endTime = new Date('2026-10-28T18:30:00Z');
    const text = jest.spyOn(PDFPage.prototype, 'drawText');
    await service.render([{ ticket: sample, credentialId: 'cred' }]);
    const content = text.mock.calls.map(([value]) => value).join('\n');
    expect(content).toContain('…');
    expect(content).toContain('29 tháng 10, 2026');
    for (const [value, options] of text.mock.calls) {
      expect(options!.x).toBeGreaterThanOrEqual(32);
      expect(options!.y).toBeGreaterThan(0);
      expect(
        options!.x! + options!.font!.widthOfTextAtSize(value, options!.size!),
      ).toBeLessThanOrEqual(564);
    }
  });
});
