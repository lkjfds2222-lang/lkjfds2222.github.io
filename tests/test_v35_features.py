"""V3.5 新品項解析和來源比對保護測試；所有測試均為離線。"""
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from update_coupons import recognize_item, normalize_coupon, merge

NOW=datetime(2026,10,18,10,0,tzinfo=timezone.utc)


def product(name, count=1, flavors=None):
    return {'name':name,'count':count,'flavors':flavors or [],'addition_price':0}


def item(code,price=99,items=None):
    return {'coupon_code':int(code),'name':'測試券 '+str(code),'price':price,
            'start_date':'2026-10-01','end_date':'2027-12-31',
            'items':items or [product('上校雞塊',4)]}

class NewCategoryTests(unittest.TestCase):
    def test_new_items_quantity(self):
        self.assertEqual(recognize_item(product('雙色轉轉QQ球(10顆)'))[:2],('qqBalls',10))
        self.assertEqual(recognize_item(product('玉米濃湯',2))[:2],('soup',2))
        self.assertEqual(recognize_item(product('勁爆雞米花',3))[:2],('popcorn',3))

    def test_unrecognized_items_are_not_guessed(self):
        self.assertIsNone(recognize_item(product('神秘好禮'))[0])
        self.assertIsNone(recognize_item(product('玉米濃湯(大)'))[0])
        self.assertIsNone(recognize_item(product('玉米濃湯',1,[{'name':'無糖綠茶','addition_price':0}]))[0])

    def test_complete_coupon_uses_all_items(self):
        parsed, reason=normalize_coupon(item(29931,148,[product('咔啦脆雞',2),product('雙色轉轉QQ球(10顆)'),product('玉米濃湯')]),'2026-10-18')
        self.assertEqual(reason,'')
        self.assertEqual(parsed['items'],{'fried':2,'qqBalls':10,'soup':1})

    def test_any_unknown_side_holds_coupon_for_review(self):
        parsed,reason=normalize_coupon(item(29932,148,[product('咔啦脆雞',2),product('未辨識點心')]),'2026-10-18')
        self.assertIsNone(parsed)
        self.assertIn('未識別',reason)

class CrossCheckTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        old=[{'code':str(30000+i),'price':99,'title':'測試','desc':'上校雞塊 4 塊',
              'end':'2027-12-31','items':{'nuggets':4}} for i in range(12)]
        for name,value in {'coupons.json':old,'pending-review.json':{},'alerts.json':{},'price-history.json':{}}.items():
            (self.root/name).write_text(json.dumps(value,ensure_ascii=False),encoding='utf8')
        self.raw=[item(str(30000+i),99) for i in range(12)]

    def kc_source(self):
        return 'const COUPON_DICT='+json.dumps({'coupon_list':self.raw},ensure_ascii=False)+';'

    def test_one_source_not_officially_verified(self):
        merge(self.root,self.kc_source(),None,NOW,min_source=10)
        data={x['code']:x for x in json.loads((self.root/'coupons.json').read_text())}
        self.assertEqual(data['30000']['crosscheck']['sources'],['KCouper'])
        self.assertIs(data['30000']['crosscheck']['priceAgreement'],False)

    def test_agreeing_sources_mark_same_price_only(self):
        article=''.join('<p>優惠代碼：'+str(30000+i)+'</p><p>優惠價 $99</p>' for i in range(4))
        merge(self.root,self.kc_source(),article,NOW,min_source=10)
        data={x['code']:x for x in json.loads((self.root/'coupons.json').read_text())}
        self.assertEqual(data['30000']['crosscheck']['sources'],['KCouper','好康情報誌'])
        self.assertIs(data['30000']['crosscheck']['priceAgreement'],True)
        self.assertIs(data['30005']['crosscheck']['priceAgreement'],False)

    def test_conflicting_source_price_does_not_gain_agreement(self):
        article=''.join('<p>優惠代碼：'+str(30000+i)+'</p><p>優惠價 $'+('129' if i==0 else '99')+'</p>' for i in range(4))
        merge(self.root,self.kc_source(),article,NOW,min_source=10)
        data={x['code']:x for x in json.loads((self.root/'coupons.json').read_text())}
        self.assertIs(data['30000']['crosscheck']['priceAgreement'],False)
        review=json.loads((self.root/'pending-review.json').read_text())
        self.assertTrue(any(x['code']=='30000' for x in review['uncertainChanges']))

if __name__=='__main__':unittest.main()
