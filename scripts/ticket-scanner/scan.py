"""Local scanner. One bounded JSON result on stdout; never logs ticket data."""
import argparse
import base64
import csv
import io
import json
import re
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

MAX_PAGES = 5
MAX_PIXELS = 20_000_000


class ScanError(Exception):
    pass


def normalize(text):
    return unicodedata.normalize('NFC', text).strip().casefold()


def images(path):
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    if path.suffix.lower() == '.pdf':
        import pypdfium2 as pdfium
        try:
            document = pdfium.PdfDocument(str(path))
        except Exception as error:
            raise ScanError('pdf_password' if 'password' in str(error).lower() else 'invalid_file')
        try:
            if len(document) > MAX_PAGES:
                raise ScanError('page_limit')
            for index in range(len(document)):
                page = document[index]
                try:
                    width, height = page.get_size()
                    scale = 2.5
                    if width * height * scale * scale > MAX_PIXELS:
                        raise ScanError('pixel_limit')
                    bitmap = page.render(scale=scale)
                    try:
                        yield index + 1, bitmap.to_pil().convert('RGB')
                    finally:
                        bitmap.close()
                finally:
                    page.close()
        finally:
            document.close()
    else:
        with Image.open(path) as image:
            count = getattr(image, 'n_frames', 1)
            if count > MAX_PAGES:
                raise ScanError('page_limit')
            for index in range(count):
                image.seek(index)
                if image.width * image.height > MAX_PIXELS:
                    raise ScanError('pixel_limit')
                yield index + 1, image.convert('RGB')


def ocr(image, page, executable):
    with tempfile.TemporaryDirectory(prefix='ticket-scan-') as directory:
        filename = Path(directory) / 'page.png'
        image.save(filename)
        try:
            result = subprocess.run([executable, str(filename), 'stdout', '-l', 'vie+eng', '--psm', '6', 'tsv'],
                                    capture_output=True, timeout=30, check=True)
        except subprocess.TimeoutExpired:
            raise ScanError('ocr_timeout')
        except (OSError, subprocess.CalledProcessError):
            raise ScanError('ocr_unavailable')
    groups = {}
    for row in csv.DictReader(io.StringIO(result.stdout.decode('utf-8', errors='replace')), delimiter='\t'):
        text = row.get('text', '').strip()
        confidence = float(row.get('conf', '-1'))
        if not text or confidence < 0:
            continue
        key = (row['block_num'], row['par_num'], row['line_num'])
        groups.setdefault(key, []).append((text, confidence, int(row['left']), int(row['top']), int(row['width']), int(row['height'])))
    lines = []
    for words in groups.values():
        left, top = min(w[2] for w in words), min(w[3] for w in words)
        right, bottom = max(w[2] + w[4] for w in words), max(w[3] + w[5] for w in words)
        lines.append({'text': ' '.join(w[0] for w in words), 'confidence': min(w[1] for w in words),
                      'page': page, 'box': [left, top, right, bottom]})
    return lines


def extract(lines):
    aliases = {
        'eventName': r'(?:sự kiện|tên sự kiện|event|event name)',
        'venue': r'(?:địa điểm|venue|location)',
        'ticketTier': r'(?:hạng vé|loại vé|ticket tier|ticket type|tier)',
        'seat': r'(?:ghế|số ghế|seat|seat number)',
        'originalPrice': r'(?:giá vé|giá gốc|mệnh giá|ticket price|face value)',
    }
    fields = {}
    for field in ['eventName', 'date', 'time', 'venue', 'ticketTier', 'seat', 'originalPrice']:
        candidates = []
        for line in lines:
            text = line['text']
            value = None
            if field in aliases:
                match = re.fullmatch(r'\s*' + aliases[field] + r'\s*[:：]\s*(.+?)\s*', text, re.IGNORECASE)
                if match:
                    value = match.group(1)
                    if field == 'originalPrice':
                        price = re.fullmatch(r'\s*(\d+(?:[.,]\d{3})*)(?:\s*(?:VND|VNĐ|đ|₫))?\s*', value, re.IGNORECASE)
                        value = str(int(re.sub(r'[.,]', '', price.group(1)))) if price else None
            elif field == 'date':
                match = re.search(r'(?<!\d)(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?!\d)', text)
                # Require an explicit event date label; order/payment dates are not event dates.
                if match and re.search(r'^\s*(?:ngày diễn ra|ngày tổ chức|event date|date)\s*[:：]', text, re.IGNORECASE):
                    from datetime import date
                    try:
                        parsed = date(int(match[3]), int(match[2]), int(match[1]))
                        value = parsed.strftime('%d/%m/%Y')
                    except ValueError:
                        pass
            elif field == 'time':
                match = re.search(r'(?<!\d)(\d{1,2}):([0-5]\d)(?!\d)', text)
                if match and int(match[1]) < 24 and re.search(r'^\s*(?:giờ bắt đầu|giờ diễn ra|start time|event time)\s*[:：]', text, re.IGNORECASE):
                    value = f'{int(match[1]):02d}:{match[2]}'
            if value:
                candidates.append((value, line))
        unique = {normalize(value) for value, _ in candidates}
        fields[field] = {'value': candidates[0][0] if len(unique) == 1 else None,
                         'confidence': min((line['confidence'] for _, line in candidates), default=0) if len(unique) == 1 else 0,
                         'evidence': [line for _, line in candidates][:5]}
    return fields


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tesseract', default='tesseract')
    parser.add_argument('--file')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    import PIL
    import pypdfium2
    import zxingcpp
    if args.check:
        result = subprocess.run([args.tesseract, '--list-langs'], capture_output=True, timeout=10, check=True)
        languages = [line.strip() for line in result.stdout.decode('utf-8', errors='replace').splitlines()]
        if not all(language in languages for language in ['vie', 'eng']):
            raise ScanError('ocr_unavailable')
        return {'ready': True}
    codes, lines = [], []
    for page, image in images(Path(args.file)):
        try:
            for code in zxingcpp.read_barcodes(image):
                if not code.valid:
                    continue
                position = code.position
                codes.append({'bytes': base64.b64encode(bytes(code.bytes)).decode('ascii'), 'format': str(code.format),
                              'page': page, 'box': [position.top_left.x, position.top_left.y, position.bottom_right.x, position.bottom_right.y]})
                if len(codes) > 32:
                    raise ScanError('code_limit')
            lines.extend(ocr(image, page, args.tesseract))
        finally:
            image.close()
    from importlib.metadata import version
    return {'fields': extract(lines), 'codes': codes,
            'engineVersion': f'local-ticket-v1;Pillow={PIL.__version__};pdfium={version("pypdfium2")};zxing={version("zxing-cpp")}'}


if __name__ == '__main__':
    try:
        print(json.dumps(main(), ensure_ascii=False))
    except ScanError as error:
        print(json.dumps({'error': str(error)}))
        sys.exit(1)
    except (ModuleNotFoundError, FileNotFoundError):
        print(json.dumps({'error': 'scanner_unavailable'}))
        sys.exit(1)
    except Exception:
        print(json.dumps({'error': 'invalid_file'}))
        sys.exit(1)
