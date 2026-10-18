#!/usr/bin/env python3
"""每日比對好康情報誌之現有肯德基券價與有效期限。

不猜測新券的餐點構成；未識別的新券寫入待審清單。
失敗時保留舊 JSON，避免向前台發布空白或無依據的新價格。
"""
from __future__ import annotations
import argparse
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path
from html.parser import HTMLParser

DEFAULT_SOURCE = 'https://info.talk.tw/kfc-coupon/'
DATE_RE = re.compile(r'(20\d{2})[\-/年](\d{1,2})[\-/月](\d{1,2})日?')
# 單張優惠價，排除原價、最高價值、原售價
PRICE_EXPLICIT = re.compile(r'(?:優惠價|特價|優惠內容[^\n=]{0,145}[=＝]|售價|優惠券價)\s*(?:NT\$?|新臺幣|\$)\s*([\d,]{2,4})(?!\d)', re.I)
PRICE_ANY = re.compile(r'(?:NT\s*\$?\s*|\$\s*)([\d,]{2,4})(?!\d)', re.I)
CODE_IN_LINE = re.compile(r'(?:優惠(?:代號|代碼|編號)|優惠券代碼)\s*[：:]?\s*(\d{5})|^\s*(\d{5})\s*(?:[|｜]|[－—–-])', re.M)

class PageText(HTMLParser):
    def __init__(self):
        super().__init__(); self.text=[]; self.skip=0
    def handle_starttag(self, tag, attrs):
        if tag in ('script','style','noscript'): self.skip+=1
        if tag in ('p','tr','td','h1','h2','h3','h4','li','br','div'): self.text.append('\n')
    def handle_endtag(self,tag):
        if tag in ('script','style','noscript') and self.skip:self.skip-=1
        if tag in ('p','tr','td','h1','h2','h3','h4','li','div'): self.text.append('\n')
    def handle_data(self, data):
        if not self.skip:self.text.append(data)
    def result(self):
        return re.sub(r'\n\s*\n+', '\n', ''.join(self.text)).replace('\xa0',' ').replace('＄','$')

def extract(txt: str):
    """回傳 {代碼: {price, end?}}。需要明確優惠價才會認列。"""
    found={}; markers=list(CODE_IN_LINE.finditer(txt))
    for i,match in enumerate(markers):
        code=match.group(1) or match.group(2)
        start=match.start()
        tail=min(len(txt),start+750,markers[i+1].start() if i+1<len(markers) else len(txt))
        segment=txt[start:tail]
        # 明確優惠價格優先；否則只有與券碼同一行且出現一個價格時才使用
        pm=PRICE_EXPLICIT.search(segment[:500])
        confidence=3 if pm else 0
        if not pm:
            first_line=segment.split('\n',1)[0]
            vals=PRICE_ANY.findall(first_line)
            if len(vals)==1:
                pm=PRICE_ANY.search(first_line);confidence=2
            elif len(vals)>=2:
                pm=PRICE_ANY.search(first_line);confidence=1 # 表格第一個為券價，第二個為原價
        if not pm:continue
        price=int(pm.group(1).replace(',',''))
        if not (10<=price<=1500):continue
        block_before=txt[max(0,start-190):start]
        date=None
        # 限使用期限附近帶有標籤的日期；不能套用文章的刊登日期
        for portion in (block_before,):
            for line in reversed(portion.split('\n')):
                if any(x in line for x in ('使用期限','有效期限','使用效期','優惠期限')):
                    dm=DATE_RE.search(line)
                    if dm:
                        try:date=datetime(*map(int,dm.groups())).date().isoformat();break
                        except ValueError:pass
            if date:break
        score=confidence+(2 if date else 0)
        if code not in found or score>found[code]['score']:
            found[code]={'price':price,'end':date,'score':score}
    return found

def update(root:Path,html:str,source:str,now:datetime,min_matched:int=3):
    parser=PageText();parser.feed(html); found=extract(parser.result())
    coupons_file=root/'coupons.json'; data=json.loads(coupons_file.read_text(encoding='utf-8'))
    if not isinstance(data,list) or len(data)<3:raise RuntimeError('現有 coupons.json 格式錯誤')
    known={str(c['code']):c for c in data}
    shared=sorted(set(known)&set(found))
    if len(shared)<min_matched:
        raise RuntimeError(f'只辨識到 {len(shared)} 張既有優惠券（低於 {min_matched} 張），停止更新，保留原資料。')
    changes=[];mismatches=[]
    for code in shared:
        coupon=known[code]; rec=found[code];new_price=rec['price'];old_price=coupon['price']
        # 非常大的價差需人工確認，避免網頁文字串接出錯
        if new_price<old_price*0.55 or new_price>old_price*1.6:
            mismatches.append({'code':code,'oldPrice':old_price,'seenPrice':new_price,'reason':'價差過大待確認'})
            continue
        if new_price != old_price:
            changes.append({'code':code,'field':'price','from':old_price,'to':new_price});coupon['price']=new_price
        new_end=rec.get('end')
        if new_end and new_end!=coupon['end']:
            # 只接受期限延長；若縮短必須人工核對，以免抓錯其他券的期限
            if new_end>coupon['end']:
                changes.append({'code':code,'field':'end','from':coupon['end'],'to':new_end});coupon['end']=new_end
            else:mismatches.append({'code':code,'oldEnd':coupon['end'],'seenEnd':new_end,'reason':'期限縮短待確認'})
    pending=[{'code':code,'seenPrice':value['price'],'seenEnd':value['end'],'reason':'新券：尚未驗證品項數量，不加入拆單計算'}
             for code,value in sorted(found.items()) if code not in known]
    stamp=now.astimezone(timezone(timedelta(hours=8))).isoformat(timespec='seconds')
    meta={'lastChecked':stamp,'source':source,'matchedExisting':len(shared),'totalListed':len(found),
          'updatedFields':len(changes),'pendingNewCoupons':len(pending),'reviewNeeded':len(mismatches),
          'note':'本次核對僅更新已收錄優惠券且能明確辨認之價格與延長期限；新券須人工審查餐點內容。'}
    (root/'coupons.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (root/'update-status.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (root/'pending-review.json').write_text(json.dumps({'generatedAt':stamp,'newCoupons':pending,'uncertainChanges':mismatches,'approvedChanges':changes},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return meta

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--fixture',help='本地 HTML 檔（測試用）');ap.add_argument('--root',default=str(Path(__file__).resolve().parents[1]));ap.add_argument('--min-matched',type=int,default=3)
    opts=ap.parse_args();root=Path(opts.root)
    if opts.fixture:html=Path(opts.fixture).read_text(encoding='utf-8');source='local-fixture'
    else:
        req=urllib.request.Request(DEFAULT_SOURCE,headers={'User-Agent':'KFC-Deal-Lab/1.0 (+https://github.com/; personal coupon index, once daily)','Accept':'text/html','Accept-Language':'zh-TW,zh;q=0.9'})
        with urllib.request.urlopen(req,timeout=25) as resp:
            if resp.status!=200:raise RuntimeError(f'HTTP {resp.status}')
            raw=resp.read(3_000_000)
            html=raw.decode('utf-8',errors='replace')
        source=DEFAULT_SOURCE
    result=update(root,html,source,datetime.now(timezone.utc),opts.min_matched)
    print(json.dumps(result,ensure_ascii=False))
if __name__=='__main__':
    try:main()
    except Exception as e:print('更新失敗（舊資料未覆寫）：',e,file=sys.stderr);sys.exit(1)
