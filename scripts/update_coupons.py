#!/usr/bin/env python3
"""KFC 優惠券：KCouper 結構化資料優先，文章資料次要；以保守規則更新。

源站並非官方；只從公開讀取用的 JS JSON 載入，絕不執行第三方 JavaScript。
未能毫無歧義換算餐點數量的新券不納入計算。來源抓取失敗不清空資料。
"""
from __future__ import annotations
import argparse
import json
import os
import re
import sys
import tempfile
import unicodedata
import urllib.request
from collections import Counter
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any
from article_source import PageText, extract

KCOUPER_URL = 'https://raw.githubusercontent.com/Winedays/KCouper/master/public/coupon.js'
ARTICLE_URL = 'https://info.talk.tw/kfc-coupon/'
TPE = timezone(timedelta(hours=8))
CATEGORIES = {'fried','smallBurger','burger','tart','nuggets','fries','hash','drink','boneless','rice','pepperRice','creamRice'}
DATE_RE = re.compile(r'^20\d\d-\d\d-\d\d$')
CODE_RE = re.compile(r'^\d{5}$')


def fetch(url:str,max_bytes:int=12_000_000)->str:
    req=urllib.request.Request(url,headers={
        'User-Agent':'KFC-Deal-Lab/2.0 (+https://github.com/Winedays/KCouper; daily public-data comparison)',
        'Accept':'text/plain,text/javascript,application/json,text/html;q=0.8',
        'Accept-Language':'zh-TW,zh;q=0.9',
    })
    with urllib.request.urlopen(req,timeout=30) as resp:
        if resp.status!=200:raise RuntimeError(f'HTTP {resp.status}: {url}')
        data=resp.read(max_bytes+1)
        if len(data)>max_bytes:raise ValueError(f'來源超過 {max_bytes} bytes')
        return data.decode('utf-8-sig',errors='strict')


def parse_kcouper(js:str)->tuple[list[dict],str]:
    """解析 const COUPON_DICT={...}; 嚴格 JSON，不執行 JS/eval。"""
    match=re.search(r'(?:^|[;\n])\s*(?:(?:const|let|var)\s+)?(?:window\.)?COUPON_DICT\s*=\s*',js)
    if not match:raise ValueError('KCouper 資料缺少 COUPON_DICT 指派')
    obj,_=json.JSONDecoder().raw_decode(js[match.end():].lstrip())
    if not isinstance(obj,dict):raise ValueError('KCouper 根節點不是 JSON 物件')
    coupons=obj.get('coupon_list')
    if not isinstance(coupons,list) or len(coupons)<10:
        # 某些版本可能只有 coupon_by_code
        bycode=obj.get('coupon_by_code')
        if isinstance(bycode,dict):coupons=list(bycode.values())
    if not isinstance(coupons,list) or len(coupons)<10:
        raise ValueError('KCouper 優惠券筆數不足，保留原資料')
    updated=str(obj.get('last_update') or '')
    if updated:
        try:
            dt=datetime.fromisoformat(updated.replace('/','-').replace(' ','T'))
            if dt.tzinfo is None:dt=dt.replace(tzinfo=TPE)
            if (datetime.now(TPE)-dt.astimezone(TPE)).days>10:
                raise ValueError('KCouper 標記的資料已超過 10 天，不採用')
        except ValueError as exc:
            if '超過 10 天' in str(exc):raise
            # 不熟悉的時間格式：允許處理，但不宣稱資料是當日即時
    return coupons,updated


def clean_name(s:str)->str:
    return unicodedata.normalize('NFKC',s).replace(' ', '').replace('　','').replace('（','(').replace('）',')')


def multiplier(s:str)->int:
    """識別名稱內固定的包裝數量，不能重複乘算外層 count。"""
    m=re.search(r'(?:分享盒\()?\(?((?:20|8|6|4|3|2))\s*(?:塊|入|顆)\)?',s)
    if not m:m=re.search(r'(?:^|\()((?:20|8|6|4|3|2))\s*(?:塊|入|顆)',s)
    return int(m.group(1)) if m else 1


def recognize_item(raw:dict)->tuple[str|None,int,str]:
    """回傳 (類別,有效數量,失敗原因)。未知、口味可跨類別變動時拒絕。"""
    if not isinstance(raw,dict):return None,0,'item 不是物件'
    name=clean_name(str(raw.get('name') or ''))
    qty=raw.get('count')
    if not name or isinstance(qty,bool) or not isinstance(qty,int) or qty<1 or qty>30:
        return None,0,'品項名稱或數量不明'
    try:extra=float(raw.get('addition_price') or 0)
    except (TypeError,ValueError):return None,0,'加價金額不明'
    if extra!=0:return None,0,'需要加價的品項，無法直接比價'
    flavors=raw.get('flavors') or []
    if not isinstance(flavors,list):return None,0,'口味選項格式不明'
    if any(not isinstance(x,dict) or float(x.get('addition_price') or 0)!=0 for x in flavors):
        return None,0,'有額外加價口味選項'
    if any(x in name for x in ('免洗','不需餐具','不需湯匙','響應環保','紙巾','吸管','不需叉子')):
        return '_ignore',0,''
    if any(x in name for x in ('糖醋醬','番茄醬','沾醬','甜辣醬')) and not any(x in name for x in ('雞腿','漢堡','炸雞')):
        return '_ignore',0,''
    # 若同一選項可切換到不同品類，不能以預設餐點當作一定會收到的餐點。
    def category_of(value:str)->str|None:
        # 飯類依口味區分。含整份主餐/雞肉的名稱不可誤認為單純一份飯。
        if ('飯' in value or '米飯' in value) and any(x in value for x in ('脆雞飯','紙包雞','套餐','分享餐','飯餐','米漢堡')):
            return None
        if '青花椒醬飯' in value:return 'pepperRice'
        if '蒜香白醬飯' in value:return 'creamRice'
        if any(x in value for x in ('雞汁風味飯','雞汁飯','雞汁風味米飯')):return 'rice'
        if '薯餅' in value:return 'hash'
        if '無骨雞腿霸' in value:return 'boneless'
        if '上校雞塊' in value or re.search(r'(^|[0-9])雞塊',value):return 'nuggets'
        if ('原味脆雞堡' in value or '花生脆雞堡' in value) and '雞腿' not in value:return 'smallBurger'
        if '雞腿堡' in value:return 'burger'
        if '蛋撻' in value:return 'tart'
        if '香酥脆薯' in value or '薯條' in value:return 'fries'
        if '咔啦脆雞' in value or '卡啦脆雞' in value:return 'fried'
        if any(x in value for x in ('可樂','紅茶','綠茶','檸檬茶','奶茶','果汁','咖啡','雪碧','飲料')):return 'drink'
        return None
    cat=category_of(name)
    if cat is None:return None,0,f'未識別品項：{name[:45]}'
    # 不把中薯大薯當成小薯，也不把不同類型的炸雞誤當咔啦脆雞。
    if cat=='fries' and any(x in name for x in ('(中)','(大)','中薯','大薯')):
        return None,0,'大/中薯不可替代小薯'
    if any((other:=category_of(clean_name(str(v.get('name') or '')))) is not None and other!=cat for v in flavors):
        return None,0,'替換選項會改變餐點類別'
    # 同一來源的選項若可把飯改為非飯品項，不能把飯計為保證供應。
    if cat in ('rice','pepperRice','creamRice') and any(
            ('飯' not in clean_name(str(v.get('name') or '')))
            for v in flavors if v.get('name')):
        return None,0,'飯類可替換非飯品項，無法保證數量'
    pack=1
    if cat in ('nuggets','tart','fried'):
        pack=multiplier(name)
    count=qty*pack
    if count>40:return None,0,'計算數量異常'
    return cat,count,''


def normalize_coupon(raw:dict,today:str)->tuple[dict|None,str]:
    if not isinstance(raw,dict):return None,'無效優惠券物件'
    code=str(raw.get('coupon_code','')).strip()
    if not CODE_RE.fullmatch(code):return None,'優惠碼不是 5 位數'
    price=raw.get('price')
    if isinstance(price,bool) or not isinstance(price,(int,float)) or int(price)!=price or not 10<=price<=1500:
        return None,'價格格式或範圍異常'
    start=str(raw.get('start_date') or '').replace('/','-')[:10]
    end=str(raw.get('end_date') or '').replace('/','-')[:10]
    if not DATE_RE.fullmatch(end):return None,'沒有可驗證的到期日期'
    try:
        datetime.strptime(end,'%Y-%m-%d')
        if start:datetime.strptime(start,'%Y-%m-%d')
    except ValueError:return None,'日期無效'
    if end<today:return None,'已過期'
    if start and start>today:return None,'尚未開始'
    raw_items=raw.get('items')
    if not isinstance(raw_items,list) or not raw_items or len(raw_items)>30:
        return None,'缺少餐點明細'
    result=Counter();descs=[];unknown=[]
    for r in raw_items:
        c,count,reason=recognize_item(r)
        if c=='_ignore':continue
        if reason:unknown.append(reason)
        else:
            result[c]+=count
            descs.append(f"{str(r.get('name'))} × {r.get('count')}")
    if unknown:return None,'；'.join(unknown)[:180]
    if not result:return None,'沒有可比較的主餐點'
    product=str(raw.get('name') or f'優惠碼 {code}').strip()
    product=re.sub(r'^\d{5}\s*[-–—:]\s*','',product)[:90]
    orig=raw.get('original_price')
    orig=int(orig) if isinstance(orig,(int,float)) and not isinstance(orig,bool) and 0<orig<4000 else None
    out={'code':code,'price':int(price),'end':end,'title':product,
         'items':dict(result),'desc':' ＋ '.join(descs)[:350],
         'original':orig,'note':'KCouper 公開資料整理；僅供比價，請以肯德基官方結帳為準',
         'source':'KCouper'}
    if start:out['start']=start
    kinds=raw.get('order_types')
    if isinstance(kinds,list) and all(isinstance(x,int) for x in kinds):out['orderTypes']=kinds
    return out,''


def inspect_kcouper(raw_list:list[dict],today:str)->tuple[dict[str,dict],list[dict]]:
    verified={};rejected=[]
    for c in raw_list:
        if not isinstance(c,dict):continue
        code=str(c.get('coupon_code',''))
        if not CODE_RE.fullmatch(code):continue
        parsed,reason=normalize_coupon(c,today)
        if parsed and code not in verified:verified[code]=parsed
        elif reason and reason not in ('已過期','尚未開始'):
            rejected.append({'code':code,'seenPrice':c.get('price'), 'reason':reason,'source':'KCouper'})
    return verified,rejected


def atomic_json(path:Path,obj:Any):
    contents=json.dumps(obj,ensure_ascii=False,indent=2)+'\n'
    fd,tmp=tempfile.mkstemp(prefix='.'+path.name+'.',dir=path.parent)
    try:
        with os.fdopen(fd,'w',encoding='utf8') as out:out.write(contents)
        os.replace(tmp,path)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)


def inspect_article(html:str)->dict:
    p=PageText();p.feed(html)
    return extract(p.result())


def merge(root:Path,kcouper_js:str|None,article_html:str|None,now:datetime,source_errors:dict|None=None,min_source:int=10)->dict:
    source_errors=dict(source_errors or {})
    coupons_path=root/'coupons.json'
    old=json.loads(coupons_path.read_text(encoding='utf-8'))
    if not isinstance(old,list) or len(old)<3:raise RuntimeError('現有 coupons.json 結構錯誤')
    current={str(c['code']):dict(c) for c in old}
    today=now.astimezone(TPE).date().isoformat()
    new_autos=[];new_pending=[];changes=[];uncertain=[];alerts=[]
    kc={};source_stamp=''; rejected=[]
    if kcouper_js is not None:
        try:
            raw,source_stamp=parse_kcouper(kcouper_js)
            kc,rejected=inspect_kcouper(raw,today)
            if len(kc)<min_source:raise ValueError(f'僅有 {len(kc)} 張可解析的券')
        except Exception as e:
            source_errors['KCouper']=str(e);kc={}
    article={}
    if article_html is not None:
        try:
            article=inspect_article(article_html)
            if len(article)<3:source_errors['好康情報誌']='頁面可讀但辨識不到至少三張優惠券'
        except Exception as e:source_errors['好康情報誌']=str(e)
    if not kc and len(set(current)&set(article))<3:
        raise RuntimeError('兩個來源都無法通過校驗；所有優惠資料保持原樣。'+str(source_errors))
    prev_review={}
    try:prev_review=json.loads((root/'pending-review.json').read_text(encoding='utf8'))
    except (OSError,ValueError):pass
    seen_before={x.get('code') for x in prev_review.get('newCoupons',[]) if isinstance(x,dict)}
    # 第一優先：有結構化品項的 KCouper
    for code,rec in kc.items():
        if code not in current:
            current[code]=rec;new_autos.append(code)
            continue
        item=current[code]
        if item.get('items')!=rec['items']:
            uncertain.append({'code':code,'reason':'來源餐點明細與已收錄內容不同，暫不改寫',
                              'oldItems':item.get('items'),'seenItems':rec['items']})
            continue
        old_price=item['price'];new_price=rec['price']
        if old_price!=new_price:
            ratio=new_price/old_price
            if ratio<0.65 or ratio>1.4:
                uncertain.append({'code':code,'reason':'KCouper 來源價格變動過大，需人工確認',
                                  'oldPrice':old_price,'seenPrice':new_price})
            else:
                item['price']=new_price
                changes.append({'code':code,'field':'price','from':old_price,'to':new_price,'source':'KCouper'})
                if abs(new_price-old_price)/old_price>=0.15:
                    alerts.append({'kind':'price-change','code':code,'from':old_price,'to':new_price})
        if item.get('end')!=rec['end']:
            changes.append({'code':code,'field':'end','from':item.get('end'),'to':rec['end'],'source':'KCouper'})
            if rec['end']<str(item.get('end','')):
                alerts.append({'kind':'expiry-shortened','code':code,'from':item.get('end'),'to':rec['end']})
            item['end']=rec['end']
        item['source']='KCouper'
        if rec.get('orderTypes') is not None:item['orderTypes']=rec['orderTypes']
        if rec.get('start'):item['start']=rec['start']
    # 第二來源：如果未出現在 KCouper，且文章能明確抓到價格才修正既有券；不自動擷取文章新券餐點。
    for code,rec in article.items():
        if code not in current:
            new_pending.append({'code':code,'seenPrice':rec['price'],'seenEnd':rec.get('end'),
                                'reason':'文章發現的新券，尚未有安全的結構化餐點資料','source':'好康情報誌'})
            continue
        if code in kc:
            if rec['price']!=kc[code]['price']:
                uncertain.append({'code':code,'reason':'兩來源價格不同；以 KCouper 為主並要求人工核對',
                                  'kcouperPrice':kc[code]['price'],'articlePrice':rec['price']})
            continue
        item=current[code]
        if item['price']!=rec['price']:
            ratio=rec['price']/item['price']
            if 0.75<=ratio<=1.3:
                changes.append({'code':code,'field':'price','from':item['price'],'to':rec['price'],'source':'好康情報誌'})
                item['price']=rec['price']
            else:
                uncertain.append({'code':code,'reason':'文章價格變動過大',
                                  'oldPrice':item['price'],'seenPrice':rec['price']})
        if rec.get('end') and rec['end']>item['end']:
            changes.append({'code':code,'field':'end','from':item['end'],'to':rec['end'],'source':'好康情報誌'})
            item['end']=rec['end']
    for r in rejected:
        if r['code'] not in current:
            new_pending.append(r)
        elif '加價' in r['reason'] or '跨類' in r['reason']:
            uncertain.append(r)
    # 已存在但未在兩來源辨認到的券不擅自刪除；依既有 end 自動過期。
    seen={};new_pending=[seen.setdefault(x['code'],x) for x in new_pending if x['code'] not in seen]
    pending_codes={x['code'] for x in new_pending}
    if newly:=sorted(pending_codes-seen_before):
        alerts.append({'kind':'new-needs-review','codes':newly[:20],'count':len(newly)})
    if uncertain:
        for finding in uncertain[:80]:
            alerts.append({'kind':'verification-required','code':finding.get('code'),
                           'reason':finding.get('reason'),
                           'fingerprint':json.dumps(finding,ensure_ascii=False,sort_keys=True)[:350]})
    if source_errors:
        alerts.append({'kind':'source-error','sources':source_errors})
    # 相同警告只首次通知；保留在 alerts.json 供儀表板查看，但不每天發重複留言。
    def alert_key(a):
        kind=a.get('kind')
        if kind=='source-error':return (kind,tuple(sorted(a.get('sources',{}))))
        if kind=='verification-required':return (kind,a.get('code'),a.get('fingerprint'))
        if kind=='new-needs-review':return (kind,tuple(a.get('codes',())))
        return (kind,a.get('code'),a.get('from'),a.get('to'))
    try:
        previous=json.loads((root/'alerts.json').read_text(encoding='utf8'))
        previous_keys={alert_key(a) for a in previous.get('alerts',[])}
    except (OSError,ValueError,TypeError):previous_keys=set()
    new_alerts=[a for a in alerts if alert_key(a) not in previous_keys]
    stamp=now.astimezone(TPE).isoformat(timespec='seconds')
    output=sorted(current.values(),key=lambda c:(-int(c['end'].replace('-','')),c['code']))
    meta={'lastChecked':stamp,'kcouperLastUpdate':source_stamp,'sources':{
              'KCouper':{'ok':bool(kc),'verified':len(kc),'url':KCOUPER_URL},
              '好康情報誌':{'ok':bool(article),'listed':len(article),'url':ARTICLE_URL}},
          'totalCoupons':len(output),'activeCoupons':sum(1 for c in output if c['end']>=today),
          'autoAdded':len(new_autos),'autoAddedCodes':new_autos[:40],
          'updatedFields':len(changes),'pendingNewCoupons':len(new_pending),
          'reviewNeeded':len(uncertain),'alertsCount':len(alerts),
          'note':'新券須通過品項與數量辨識才會自動加入；無法確認的不納入最低價計算。'}
    review={'generatedAt':stamp,'newCoupons':new_pending,'uncertainChanges':uncertain,
            'approvedChanges':changes,'autoAddedCoupons':new_autos}
    alert_file={'generatedAt':stamp,'alerts':alerts,'newAlerts':new_alerts,'sourceErrors':source_errors}
    # 只替當次來源明確出現的券記錄價格歷史，一天同券一筆，保留最近 90 天。
    hist_path=root/'price-history.json'
    try:
        history=json.loads(hist_path.read_text(encoding='utf8'))
        if not isinstance(history,dict):history={}
    except (OSError,ValueError):history={}
    cutoff=(now.astimezone(TPE).date()-timedelta(days=90)).isoformat()
    for c in output:
        if c['end']<today or str(c['code']) not in kc and str(c['code']) not in article:continue
        code=str(c['code'])
        old_rows=history.get(code,[])
        if not isinstance(old_rows,list):old_rows=[]
        old_rows=[r for r in old_rows if isinstance(r,dict) and cutoff<=str(r.get('date',''))<today and isinstance(r.get('price'),int)]
        old_rows.append({'date':today,'price':int(c['price']),'end':c['end']})
        history[code]=old_rows[-90:]
    history={code:rows for code,rows in history.items() if rows and rows[-1]['date']>=cutoff}
    meta['priceHistoryPoints']=sum(len(rows) for rows in history.values())
    # 先在記憶體完全驗證，最後才逐份寫入資料。
    atomic_json(coupons_path,output)
    atomic_json(hist_path,history)
    atomic_json(root/'update-status.json',meta)
    atomic_json(root/'pending-review.json',review)
    atomic_json(root/'alerts.json',alert_file)
    return meta


def main()->int:
    ap=argparse.ArgumentParser()
    ap.add_argument('--root',default=str(Path(__file__).resolve().parents[1]))
    ap.add_argument('--kcouper-fixture',help='本地 KCouper JS 測試資料')
    ap.add_argument('--article-fixture',help='本地文章 HTML 測試資料')
    ap.add_argument('--skip-kcouper',action='store_true')
    ap.add_argument('--skip-article',action='store_true')
    opts=ap.parse_args();errors={}
    def read_source(name:str,url:str,fixture:str|None,skip:bool):
        if skip:return None
        try:return Path(fixture).read_text(encoding='utf8') if fixture else fetch(url)
        except Exception as exc:errors[name]=str(exc);return None
    js=read_source('KCouper',KCOUPER_URL,opts.kcouper_fixture,opts.skip_kcouper)
    html=read_source('好康情報誌',ARTICLE_URL,opts.article_fixture,opts.skip_article)
    meta=merge(Path(opts.root),js,html,datetime.now(timezone.utc),errors)
    print(json.dumps(meta,ensure_ascii=False))
    return 0

if __name__=='__main__':
    try:sys.exit(main())
    except Exception as exc:
        print('資料更新失敗（舊資料仍保留）：',exc,file=sys.stderr)
        sys.exit(1)
