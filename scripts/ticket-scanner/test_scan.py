import unittest
import unicodedata

from scan import extract, parse_price


def lines(*texts):
    return [dict(text=text, confidence=99, page=1, box=[0, 0, 100, 20]) for text in texts]


class ExtractionTests(unittest.TestCase):
    def test_unsupported_price_preserves_evidence(self):
        source = lines('Face value: USD 100')
        field = extract(source)['originalPrice']
        self.assertIsNone(field['value'])
        self.assertEqual(field['evidence'], source)

    def test_invalid_candidate_cannot_hide_behind_valid_candidate(self):
        field = extract(lines('Face value: 100000', 'Face value: USD 100'))['originalPrice']
        self.assertIsNone(field['value'])
        self.assertEqual(field['confidence'], 0)

    def test_conflict_beyond_evidence_limit(self):
        field = extract(lines(*(['Tier: VIP'] * 5 + ['Tier: STANDARD'])))['ticketTier']
        self.assertIsNone(field['value'])
        self.assertEqual(len(field['evidence']), 5)

    def test_integer_prices(self):
        for value in ['1000000', '1.000.000 VND', '1,000,000', '1 000 000']:
            with self.subTest(value=value):
                self.assertEqual(parse_price(value), '1000000')
        for value in ['100.50', '1.000,000', 'USD 100', '-100']:
            with self.subTest(value=value):
                self.assertIsNone(parse_price(value))

    def test_calendar_validation(self):
        self.assertEqual(extract(lines('Date: 29.2.2028'))['date']['value'], '29/02/2028')
        for value in ['29/2/2027', '31/4/2028', '1/2-2028', '']:
            field = extract(lines('Date: ' + value))['date']
            self.assertIsNone(field['value'])
            self.assertTrue(field['evidence'])

    def test_time_validation(self):
        self.assertEqual(extract(lines('Start time: 9h05'))['time']['value'], '09:05')
        for value in ['24:00', '12:60', '']:
            field = extract(lines('Start time: ' + value))['time']
            self.assertIsNone(field['value'])
            self.assertTrue(field['evidence'])

    def test_unicode_and_whitespace(self):
        source = lines(unicodedata.normalize('NFD', 'S\u1ef1 ki\u1ec7n:  Live   Concert'))
        field = extract(source)['eventName']
        self.assertEqual(field['value'], 'Live Concert')
        self.assertEqual(field['evidence'], source)

    def test_unrelated_date_not_used(self):
        self.assertEqual(extract(lines('Payment date: 1/2/2028'))['date']['evidence'], [])


if __name__ == '__main__':
    unittest.main()
