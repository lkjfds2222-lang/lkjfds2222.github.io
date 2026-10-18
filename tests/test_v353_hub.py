import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
class HubFixTests(unittest.TestCase):
 def test_contrast_css_and_labels(self):
  html=(ROOT/'index.html').read_text(encoding='utf8')
  self.assertIn('#updates .update-panel{background:#fff!important',html)
  self.assertIn('color:#3d3027!important',html)
  self.assertIn('需要人工核對的新券',html)
  self.assertIn('upd-excluded',html)
 def test_pending_split(self):
  js=(ROOT/'v3.js').read_text(encoding='utf8')
  self.assertIn('renderPendingReview(data)',js)
  self.assertIn("x?.source==='KCouper'",js)
  self.assertIn('actionable.length',js)
 def test_python_updater_has_summary(self):
  code=(ROOT/'scripts/update_coupons.py').read_text(encoding='utf8')
  self.assertIn('unsupportedCount',code)
  self.assertIn('unsupportedSamples',code)
  self.assertNotIn('new_pending.append(r)\n        elif',code)

 def test_rejected_optional_flavors_are_not_new_coupons(self):
  import json,tempfile,sys
  from datetime import datetime,timezone
  sys.path.insert(0,str(ROOT/'scripts'))
  from update_coupons import merge
  with tempfile.TemporaryDirectory() as work:
   root=Path(work)
   def item(name,flavors=None):
    return {'name':name,'count':1,'addition_price':0,'flavors':flavors or []}
   good=[{'coupon_code':43000+i,'name':'簡單炸雞券','price':99,'start_date':'2026-01-01',
          'end_date':'2027-12-31','items':[item('咔啦脆雞')]} for i in range(12)]
   excluded=[{'coupon_code':44000+i,'name':'需加價口味','price':99,'start_date':'2026-01-01',
          'end_date':'2027-12-31','items':[item('咔啦脆雞',[{'name':'加價炸雞','addition_price':10}])]} for i in range(20)]
   pending=[{'coupon_code':45000,'name':'新品項','price':99,'start_date':'2026-01-01',
          'end_date':'2027-12-31','items':[item('神秘新品')]}]
   existing=[{'code':str(43000+i),'price':99,'end':'2027-12-31','title':'已收錄',
              'items':{'fried':1}} for i in range(12)]
   (root/'coupons.json').write_text(json.dumps(existing,ensure_ascii=False),encoding='utf8')
   raw='const COUPON_DICT='+json.dumps({'coupon_list':good+excluded+pending},ensure_ascii=False)
   meta=merge(root,raw,None,datetime(2026,10,18,12,tzinfo=timezone.utc))
   data=json.loads((root/'pending-review.json').read_text())
   self.assertEqual(meta['unsupportedCount'],20)
   self.assertEqual(meta['pendingNewCoupons'],1)
   self.assertEqual(len(data['unsupportedSamples']),12)
   self.assertEqual(data['newCoupons'][0]['code'],'45000')
