"""Calling Taiwan 保守匯入：測試資料為依來源表格結構製作的離線樣本。"""
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from calling_taiwan_source import parse_calling
from update_coupons import recognize_item, merge

NOW=datetime(2026,10,18,12,0,tzinfo=timezone.utc)

def html_rows(*rows):
    head=['有效期限','優惠名稱/內容','金額','優惠代碼']
    def row(cells):return '<tr>'+''.join('<td>'+str(s)+'</td>' for s in cells)+'</tr>'
    return '<html><body><table><tr>'+''.join('<th>'+h+'</th>' for h in head)+'</tr>'+''.join(row(r) for r in rows)+'</table></body></html>'

SAMPLE=html_rows(
 ['2026/10/31','〖澱堂級饗宴〗咔啦脆雞 × 1 + 雞汁風味飯 × 1 + 冰無糖綠茶（小）× 1','85 元','26918 (點擊複製)'],
 ['2026/10/31','〖2026畢業季〗咔啦脆雞 × 1 + 玉米濃湯（小）× 1','77 元','16033'],
 ['2026/10/31','〖星展銀行〗咔啦脆雞 × 2 + 雞汁風味飯 × 1 + 冰無糖綠茶（小）× 1','135 元','26776'],
 ['2026/10/31','〖澱堂級饗宴〗5 塊雞（桶） × 1 + 超蝦點心拼盤 × 1（QQ球 × 10 + 香酥脆薯 × 1）','568 元','26921'],
 ['兌完為止','首次訂購現折50元','250 元','NEW50'],
 ['2026/10/01','〖已過期〗咔啦脆雞 × 1','50 元','26777'],
)

class CallingParserTests(unittest.TestCase):
    def test_rice_and_soup_are_exact(self):
        d,bad=parse_calling(SAMPLE,'2026-10-18',recognize_item)
        self.assertEqual(d['26918']['items'],{'fried':1,'rice':1,'drink':1})
        self.assertEqual(d['16033']['items'],{'fried':1,'soup':1})
        self.assertEqual(d['26776']['price'],135)
        self.assertIsNone(d['26921']['items'])
        self.assertNotIn('26777',d)
        self.assertNotIn('NEW50',d)
        self.assertFalse(bad)

    def test_no_header_prevents_false_positive(self):
        src='<table><tr><td>2026/12/31</td><td>咔啦脆雞 × 1</td><td>50 元</td><td>22222</td></tr></table>'
        self.assertEqual(parse_calling(src,'2026-10-18',recognize_item)[0],{})

    def test_conflicting_duplicate_code_is_dropped(self):
        src=html_rows(['2026/12/31','咔啦脆雞 × 1','80 元','29900'],
                      ['2026/12/31','咔啦脆雞 × 1','99 元','29900'])
        d,bad=parse_calling(src,'2026-10-18',recognize_item)
        self.assertNotIn('29900',d)
        self.assertEqual(bad[0]['code'],'29900')

    def test_unknown_and_options_do_not_auto_import(self):
        src=html_rows(['2026/12/31','飲品 5 選 2（奶茶／可樂）','38 元','29901'],
                      ['2026/12/31','香草紙包雞 × 1 + 雞汁風味飯 × 1','119 元','29902'])
        d,_=parse_calling(src,'2026-10-18',recognize_item)
        self.assertTrue(all(v['items'] is None for v in d.values()))

class CallingMergeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        old=[{'code':str(30000+i),'price':99,'title':'已收錄','desc':'上校雞塊四塊',
              'end':'2027-12-31','items':{'nuggets':4}} for i in range(12)]
        for name,obj in [('coupons.json',old),('pending-review.json',{}),('alerts.json',{}),('price-history.json',{})]:
            (self.root/name).write_text(json.dumps(obj,ensure_ascii=False),encoding='utf8')
        self.raw=[{'coupon_code':30000+i,'name':'上校雞塊優惠','price':99,
                   'start_date':'2026-01-01','end_date':'2027-12-31',
                   'items':[{'name':'上校雞塊','count':4,'addition_price':0,'flavors':[]}]} for i in range(12)]
        self.js='const COUPON_DICT='+json.dumps({'coupon_list':self.raw},ensure_ascii=False)+';'

    def test_source_is_added_with_safe_new_rice(self):
        source=html_rows(['2027/12/31','上校雞塊 × 4','99 元','30000'],
                         ['2027/12/31','上校雞塊 × 4','110 元','30001'],
                         ['2027/12/31','咔啦脆雞 × 1 + 雞汁風味飯 × 1 + 冰無糖綠茶（小）× 1','85 元','26918'],
                         ['2027/12/31','咔啦脆雞 × 1 + 玉米濃湯（小）× 1','77 元','16033'],
                         ['2027/12/31','香草紙包雞 × 1 + 雞汁風味飯 × 1','135 元','26922'])
        meta=merge(self.root,self.js,None,NOW,calling_html=source)
        records={r['code']:r for r in json.loads((self.root/'coupons.json').read_text())}
        self.assertEqual(records['26918']['items'],{'fried':1,'rice':1,'drink':1})
        self.assertEqual(records['26918']['source'],'Calling Taiwan')
        self.assertEqual(records['16033']['items'],{'fried':1,'soup':1})
        self.assertEqual(records['30001']['price'],99)
        self.assertEqual(records['30000']['crosscheck']['sources'],['KCouper','Calling Taiwan'])
        self.assertTrue(records['30000']['crosscheck']['priceAgreement'])
        self.assertEqual(records['26918']['crosscheck']['sources'],['Calling Taiwan'])
        self.assertFalse(records['26918']['crosscheck']['priceAgreement'])
        self.assertNotIn('26922',records)
        self.assertEqual(meta['callingAutoAdded'],2)
        self.assertEqual(meta['sources']['Calling Taiwan']['listed'],5)
        pending=json.loads((self.root/'pending-review.json').read_text())
        self.assertTrue(any(p['code']=='26922' for p in pending['newCoupons']))
        self.assertTrue(any(p['code']=='30001' for p in pending['uncertainChanges']))

    def test_source_failure_keeps_kcouper(self):
        meta=merge(self.root,self.js,None,NOW,calling_html='<html>not a table</html>')
        self.assertFalse(meta['sources']['Calling Taiwan']['ok'])
        self.assertTrue(meta['sources']['KCouper']['ok'])
        self.assertEqual(len(json.loads((self.root/'coupons.json').read_text())),12)

if __name__=='__main__':unittest.main()
