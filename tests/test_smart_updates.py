import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from update_coupons import merge, parse_kcouper, normalize_coupon, recognize_item

FIXED_NOW=datetime(2026,10,18,9,0,tzinfo=timezone.utc)

def coupon(code,name,price,items,end='2027-02-28'):
    return {'coupon_code':int(code),'name':name,'price':price,
            'items':[{'name':n,'count':v,'addition_price':0,'flavors':[]} for n,v in items],
            'start_date':'2026-10-01','end_date':end,'original_price':None,'order_types':[2]}

def sample_raw():
    records=[coupon('50551','炸雞優惠',175,[('咔啦脆雞(辣)',4),('冰無糖綠茶(小)',2)],'2026-10-19'),
             coupon('16720','雙堡套餐',99,[('原味脆雞堡(小)',2),('冰無糖綠茶(小)',2)],'2026-12-29'),
             coupon('16349','神券',99,[('原味脆雞堡(小)',1),('2入原味蛋撻',1),('冰無糖綠茶(小)',1)],'2026-12-20'),
             coupon('29980','炸雞蛋撻新人券',135,[('2塊咔啦脆雞(辣)',1),('2入原味蛋撻',1)]),
             coupon('29981','無法辨識的新券',99,[('神秘餐點',1)])]
    records.extend(coupon(str(30000+i),'炸雞券'+str(i),89,[('咔啦脆雞',2)]) for i in range(8))
    return 'const COUPON_DICT='+json.dumps({'coupon_list':records,'count':len(records),'last_update':'2026-10-18 12:30:00'},ensure_ascii=False)+';'

class SmartUpdates(unittest.TestCase):
    def setUp(self):
        self.d=tempfile.TemporaryDirectory();self.addCleanup(self.d.cleanup)
        self.root=Path(self.d.name)
        for name in ('coupons.json','pending-review.json','update-status.json'):
            (self.root/name).write_bytes((ROOT/name).read_bytes())
    def test_js_parse_no_eval(self):
        coupons,stamp=parse_kcouper(sample_raw())
        self.assertGreater(len(coupons),10)
        self.assertIn('2026',stamp)
        with self.assertRaises((ValueError,json.JSONDecodeError)):
            parse_kcouper('const COUPON_DICT=alert(document.cookie);')
    def test_new_known_items_auto_accepted_unknown_waits(self):
        meta=merge(self.root,sample_raw(),None,FIXED_NOW,min_source=5)
        new={x['code']:x for x in json.loads((self.root/'coupons.json').read_text())}
        self.assertEqual(new['29980']['items'],{'fried':2,'tart':2})
        self.assertNotIn('29981',new)
        self.assertEqual(meta['autoAdded'],9)
        review=json.loads((self.root/'pending-review.json').read_text())
        self.assertTrue(any(c['code']=='29981' for c in review['newCoupons']))
    def test_price_abnormal_flag_no_wrong_update(self):
        data=json.loads(sample_raw().split('=',1)[1][:-1]);data['coupon_list'][0]['price']=590
        modified='const COUPON_DICT='+json.dumps(data,ensure_ascii=False)
        meta=merge(self.root,modified,None,FIXED_NOW,min_source=5)
        new={x['code']:x for x in json.loads((self.root/'coupons.json').read_text())}
        self.assertEqual(new['50551']['price'],175)
        self.assertGreater(meta['reviewNeeded'],0)
    def test_fallback_article_when_kc_missing(self):
        page=(ROOT/'tests/sample-source.html').read_text(encoding='utf8')
        meta=merge(self.root,None,page,FIXED_NOW,{'KCouper':'timeout'})
        self.assertEqual(meta['sources']['KCouper']['ok'],False)
        self.assertGreaterEqual(meta['sources']['好康情報誌']['listed'],3)
    def test_both_invalid_preserve(self):
        before=(self.root/'coupons.json').read_bytes()
        with self.assertRaisesRegex(RuntimeError,'兩個來源'):
            merge(self.root,None,'<html>沒有券</html>',FIXED_NOW)
        self.assertEqual(before,(self.root/'coupons.json').read_bytes())
    def test_pack_multiplier(self):
        self.assertEqual(recognize_item({'name':'上校雞塊分享盒(20塊)','count':1})[:2],('nuggets',20))
        self.assertEqual(recognize_item({'name':'2入原味蛋撻超極酥','count':1})[:2],('tart',2))
        self.assertEqual(recognize_item({'name':'香酥脆薯(大)','count':1})[0],None)

if __name__=='__main__':unittest.main()
