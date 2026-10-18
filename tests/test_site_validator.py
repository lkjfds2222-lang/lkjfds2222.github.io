import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from validate_site import inspect, FILES


class SiteValidatorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        for name in FILES:
            p = self.root / name
            p.write_text('{"ok":true}' if name.endswith('.json') else 'content', encoding='utf8')
        (self.root / 'index.html').write_text('<script src="./v3.js?v=3.2.0" defer></script>', encoding='utf8')
        (self.root / 'coupons.json').write_text(json.dumps([
            {'code': f'{i:05}', 'price': 100+(i-10000), 'end': '2099-12-31', 'items': {'fried': 2}}
            for i in range(10001,10004)
        ]), encoding='utf8')
        for name in ('pending-review.json', 'alerts.json', 'update-status.json', 'price-history.json', 'menu-prices.json'):
            (self.root / name).write_text('{}', encoding='utf8')
        (self.root / 'official-offers.json').write_text('{"offers":[],"pendingCodes":[]}', encoding='utf8')

    def tearDown(self):
        self.tmp.cleanup()

    def test_valid(self):
        self.assertEqual(inspect(self.root)['errors'], [])

    def test_empty_coupon_file_rejected(self):
        (self.root / 'coupons.json').write_text('[]', encoding='utf8')
        self.assertTrue(inspect(self.root)['errors'])

    def test_missing_js_rejected(self):
        (self.root / 'v3.js').unlink()
        self.assertTrue(any('v3.js' in x for x in inspect(self.root)['errors']))

    def test_duplicate_coupon_rejected(self):
        coupons=json.loads((self.root / 'coupons.json').read_text())
        coupons[1]['code']=coupons[0]['code']
        (self.root / 'coupons.json').write_text(json.dumps(coupons), encoding='utf8')
        self.assertTrue(any('重複' in x for x in inspect(self.root)['errors']))

    def test_broken_official_file_rejected(self):
        (self.root / 'official-offers.json').write_text('{broken', encoding='utf8')
        self.assertTrue(any('official-offers.json' in x for x in inspect(self.root)['errors']))


if __name__ == '__main__':
    unittest.main()
