"""Generate synthetic image-only PDFs for local OCR checks; no real ticket data."""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
import zxingcpp


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='.tmp/postman-files')
    parser.add_argument('--font', default='C:/Windows/Fonts/arial.ttf')
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    font = ImageFont.truetype(args.font, 32)
    for name, codes, price in [
        ('ticket', ['SYNTHETIC-TICKET-001'], '500000 VND'),
        ('duplicate-code', ['SYNTHETIC-TICKET-001'], '600000 VND'),
        ('missing-code', [], '500000 VND'),
        ('multiple-codes', ['SYNTHETIC-TICKET-001', 'SYNTHETIC-TICKET-002'], '500000 VND'),
        ('uncertain-price', ['SYNTHETIC-TICKET-003'], 'USD 100'),
    ]:
        with Image.new('RGB', (1200, 1500), 'white') as image:
            draw = ImageDraw.Draw(image)
            for index, text in enumerate([
                'Event: Demo Concert', 'Date: 20/12/2028', 'Start time: 19:00',
                'Venue: Demo Hall', 'Tier: VIP', 'Seat: A12', 'Face value: ' + price,
            ]):
                draw.text((70, 70 + index * 75), text, fill='black', font=font)
            for index, payload in enumerate(codes):
                barcode = zxingcpp.create_barcode(payload, zxingcpp.BarcodeFormat.QRCode)
                pixels = memoryview(zxingcpp.write_barcode_to_image(barcode, scale=8))
                qr = Image.frombytes('L', (pixels.shape[1], pixels.shape[0]), pixels.tobytes())
                image.paste(qr, (70 + index * 450, 750))
                qr.close()
            image.save(output / (name + '.pdf'), 'PDF', resolution=150)


if __name__ == '__main__':
    main()
