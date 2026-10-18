#!/usr/bin/env python3
"""保守解析 Calling Taiwan 肯德基優惠表格；不執行 JavaScript。"""
from __future__ import annotations
from collections import Counter
from datetime import datetime
from html.parser import HTMLParser
import re
import unicodedata
from typing import Callable

SOURCE_URL = 'https://www.callingtaiwan.com.tw/kfc-coupon-code/'
CODE = re.compile(r'(?<!\d)(\d{5})(?!\d)')
DATE = re.compile(r'^20\d{2}[/-]\d{1,2}[/-]\d{1,2}$')
PRICE = re.compile(r'^\s*(?:NT\s*\$\s*)?([\d,]{2,4})\s*元?\s*$')
QUANTITY = re.compile(r'^(.+?)\s*[×xX]\s*(\d{1,2})\s*$')
# 圖文整理頁有多選一、組合拼盤、加購券等，若無法精確對應就不可自動比價。
REVIEW_TERMS = ('選1', '選2', '選 1', '選 2', '任選', '擇一', '加購', '買一送一',
                '分享拼盤', '超蝦點心拼盤', '樂享三拼', '5塊雞', '6塊雞', '桶餐',
                '餐點任選', '折抵', '現折', '優惠券', '兌換', '超蝦塊', '鱈魚圈圈')

class CouponTable(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables=[];self.in_table=0;self.in_row=False;self.cell=None
        self.rows=[];self.row=[];self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style','noscript'):self.skip+=1
        if self.skip:return
        if tag=='table':
            self.in_table+=1
            if self.in_table==1:self.rows=[]
        elif tag=='tr' and self.in_table==1:self.in_row=True;self.row=[]
        elif tag in ('th','td') and self.in_table==1 and self.in_row:self.cell=[]
        elif tag=='br' and self.cell is not None:self.cell.append(' ')
    def handle_endtag(self,tag):
        if tag in ('script','style','noscript'):
            self.skip=max(0,self.skip-1);return
        if self.skip:return
        if tag in ('th','td') and self.cell is not None:
            value=re.sub(r'\s+',' ',''.join(self.cell)).strip()
            self.row.append(value);self.cell=None
        elif tag=='tr' and self.in_row:
            if self.row:self.rows.append(self.row)
            self.in_row=False
        elif tag=='table' and self.in_table:
            if self.in_table==1:self.tables.append(self.rows)
            self.in_table-=1
    def handle_data(self,data):
        if not self.skip and self.cell is not None:self.cell.append(data)


def _clean(value:str)->str:
    return unicodedata.normalize('NFKC',value).replace('\u00a0',' ').strip()


def interpret_items(title:str,recognize:Callable)->tuple[dict|None,str]:
    """所有品項都有固定數量、皆為既有分類時才轉換為可計算券。"""
    text=_clean(title)
    text=re.sub(r'^〖[^〗]{1,80}〗\s*','',text)
    if any(term in text.replace(' ','') for term in REVIEW_TERMS):
        return None,'含選項／複合拼盤／加購等限制，待人工確認'
    # 含括號的拼盤，可能有多層 +，不能簡單拆分。
    if ('+' in text or '＋' in text) and re.search(r'[(（][^()（）]*[+＋]',text):
        return None,'存在巢狀組合，尚無法安全拆分'
    pieces=re.split(r'\s*[+＋]\s*',text)
    if not 1<=len(pieces)<=12:return None,'餐點組合數量異常'
    found=Counter()
    for part in pieces:
        m=QUANTITY.fullmatch(part.strip())
        if not m:return None,'餐點缺少固定數量或包含替換選項'
        name,num=m.group(1).strip(),int(m.group(2))
        if num<1 or num>30:return None,'數量超出可解析範圍'
        # 未分類口味、超大規格等不冒險當成普通品項。
        if any(s in name for s in ('青花椒咔啦脆雞','青花椒香麻脆雞','咔啦爆脆雞',
                                    '爆脆無骨','花生熔岩','(中)','(大)','（中）','（大）')):
            return None,'特殊口味／規格無相對應分類'
        category,count,reason=recognize({'name':name,'count':num,'addition_price':0,'flavors':[]})
        if reason or category in (None,'_ignore'):
            return None,reason or '有未知餐點或非餐點項目'
        found[category]+=count
    if not found or sum(found.values())>80:return None,'總數量不合理'
    return dict(found),''


def parse_calling(html:str,today:str,recognize:Callable)->tuple[dict,list]:
    p=CouponTable();p.feed(html)
    data={};rejected=[];conflicts=set()
    for rows in p.tables:
        # 只讀取具有完整表頭的「優惠碼清單」，避免文章其他表格被當成券。
        has_header=any(len(r)>=4 and '有效期限' in r[0] and ('優惠' in r[1]) and ('金額' in r[2])
                       and ('優惠代碼' in r[3] or '優惠碼' in r[3]) for r in rows[:8])
        if not has_header:continue
        for cells in rows:
            if len(cells)<4:continue
            date_str=_clean(cells[0]);title=_clean(cells[1]);price_text=_clean(cells[2]);code_text=_clean(cells[3])
            if not DATE.fullmatch(date_str):continue
            try:end=datetime.strptime(date_str.replace('/','-'),'%Y-%m-%d').date().isoformat()
            except ValueError:continue
            if end<today:continue
            codes=CODE.findall(code_text)
            pm=PRICE.fullmatch(price_text)
            if len(set(codes))!=1 or pm is None:continue
            code=codes[0];price=int(pm.group(1).replace(',',''))
            if not 10<=price<=1500:continue
            items,reason=interpret_items(title,recognize)
            record={'code':code,'price':price,'end':end,'title':title[:140],
                    'items':items,'reason':reason,'source':'Calling Taiwan'}
            if code in data and (data[code]['price'],data[code]['end'],data[code]['title'])!=(price,end,record['title']):
                conflicts.add(code)
                continue
            data[code]=record
    for code in conflicts:
        data.pop(code,None)
        rejected.append({'code':code,'source':'Calling Taiwan','reason':'同一優惠碼出現不同價格、內容或期限'})
    return data,rejected
