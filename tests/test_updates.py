import copy
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'scripts'))
from article_source import extract, PageText, update

ROOT=Path(__file__).resolve().parents[1]

class UpdateTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        (self.root/'coupons.json').write_text((ROOT/'coupons.json').read_text(),encoding='utf-8')

    def test_known_three_no_wrong_updates(self):
        original=json.loads((self.root/'coupons.json').read_text())
        fixture=(ROOT/'tests/sample-source.html').read_text()
        meta=update(self.root,fixture,'local-fixture',datetime.now(timezone.utc),3)
        new=json.loads((self.root/'coupons.json').read_text())
        self.assertEqual(original,new)
        self.assertEqual(meta['matchedExisting'],3)
        pending=json.loads((self.root/'pending-review.json').read_text())
        self.assertEqual(pending['newCoupons'][0]['code'],'29999')
        self.assertEqual(pending['newCoupons'][0]['seenEnd'],'2027-08-01')

    def test_price_change_and_expiry_extension(self):
        fixture=(ROOT/'tests/sample-source.html').read_text()
        fixture=fixture.replace('16839</p>', '16839</p>').replace('2027年2月28日','2027年3月31日').replace('=NT$139元','=NT$135元')
        meta=update(self.root,fixture,'local-fixture',datetime.now(timezone.utc),3)
        data={c['code']:c for c in json.loads((self.root/'coupons.json').read_text())}
        self.assertEqual(data['16839']['price'],135)
        self.assertEqual(data['16839']['end'],'2027-03-31')
        self.assertEqual(meta['updatedFields'],2)

    def test_wrong_content_keeps_database(self):
        before=(self.root/'coupons.json').read_bytes()
        with self.assertRaisesRegex(RuntimeError,'辨識'):
            update(self.root,'<html>無優惠券資料</html>','local-fixture',datetime.now(timezone.utc),3)
        self.assertEqual(before,(self.root/'coupons.json').read_bytes())

    def test_no_absurd_price_change(self):
        fixture=(ROOT/'tests/sample-source.html').read_text().replace('優惠價$175','優惠價$950')
        meta=update(self.root,fixture,'local-fixture',datetime.now(timezone.utc),3)
        data={c['code']:c for c in json.loads((self.root/'coupons.json').read_text())}
        self.assertEqual(data['50551']['price'],175)
        self.assertGreaterEqual(meta['reviewNeeded'],1)

if __name__ == '__main__':unittest.main()
