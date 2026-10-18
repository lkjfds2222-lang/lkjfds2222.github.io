#!/usr/bin/env python3
"""雞省研究所：部署前靜態網站檢查（標準函式庫，不需額外套件）。

檢查重要檔案、JSON 格式、優惠券合理性及網站引用的 JS，防止空白頁被發布。
不需要連網，也不會擅自修改任何 JSON。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date
from pathlib import Path

FILES = (
    'index.html', 'v3.js', 'sw.js', 'manifest.webmanifest', 'app-icon.svg',
    'coupons.json', 'update-status.json', 'pending-review.json', 'alerts.json',
    'price-history.json', 'menu-prices.json', 'official-offers.json',
)
JSON_FILES = tuple(f for f in FILES if f.endswith('.json'))
ITEM_KEYS = {'fried', 'tart', 'burger', 'drink', 'fries', 'nuggets', 'boneless', 'other', 'soup', 'wrap', 'side', 'hash', 'spicy', 'egg', 'chicken'}


def inspect(root: Path) -> dict:
    errors = []
    warnings = []
    data = {}
    for name in FILES:
        p = root / name
        if not p.is_file() or p.stat().st_size == 0:
            errors.append(f'必要檔案遺失或空白：{name}')

    for name in JSON_FILES:
        p = root / name
        if not p.is_file() or p.stat().st_size == 0:
            continue
        try:
            data[name] = json.loads(p.read_text(encoding='utf-8-sig'))
        except (ValueError, UnicodeDecodeError, OSError) as exc:
            errors.append(f'{name} 不是有效的 JSON：{exc}')

    coupons = data.get('coupons.json')
    active = 0
    if coupons is not None:
        if not isinstance(coupons, list) or len(coupons) < 3:
            errors.append('coupons.json 必須是至少 3 張優惠券的陣列，避免空資料覆蓋已上線網站')
        else:
            seen = set()
            for ix, c in enumerate(coupons):
                place = f'第 {ix + 1} 張券'
                if not isinstance(c, dict):
                    errors.append(f'{place} 不是物件')
                    continue
                code = str(c.get('code', ''))
                if not re.fullmatch(r'\d{5}', code):
                    errors.append(f'{place} 的 code 不是 5 位數：{code!r}')
                if code in seen:
                    errors.append(f'重複優惠碼：{code}')
                seen.add(code)
                price = c.get('price')
                if type(price) is not int or not 0 < price < 10000:
                    errors.append(f'{code} 價格不是合理的正整數：{price!r}')
                end = c.get('end')
                try:
                    expiry = date.fromisoformat(end)
                    if expiry >= date.today():
                        active += 1
                except (TypeError, ValueError):
                    errors.append(f'{code} 期限不是 YYYY-MM-DD：{end!r}')
                items = c.get('items')
                if not isinstance(items, dict) or not items:
                    errors.append(f'{code} 缺少有效 items')
                elif any(not isinstance(k, str) or not k or type(v) is not int or v < 0 for k, v in items.items()):
                    errors.append(f'{code} items 格式不正確')
            if not active:
                warnings.append('所有優惠券都已到期；仍可部署，但請確認資料來源是否更新')

    for name in ('update-status.json', 'pending-review.json', 'alerts.json', 'price-history.json', 'menu-prices.json', 'official-offers.json'):
        if name in data and not isinstance(data[name], dict):
            errors.append(f'{name} 必須是 JSON 物件')
    official = data.get('official-offers.json')
    if isinstance(official, dict):
        if not isinstance(official.get('offers'), list):
            errors.append('official-offers.json 的 offers 必須是陣列')
        if not isinstance(official.get('pendingCodes'), list):
            errors.append('official-offers.json 的 pendingCodes 必須是陣列')

    html_path = root / 'index.html'
    if html_path.is_file():
        html = html_path.read_text(encoding='utf-8-sig', errors='replace')
        if not re.search(r'<script[^>]+src=["\']\./v3\.js(?:\?[^"\']*)?["\']', html, re.I):
            errors.append('index.html 未正確引用 ./v3.js')

    return {'errors': errors, 'warnings': warnings,
            'totalCoupons': len(coupons) if isinstance(coupons, list) else 0,
            'notExpired': active}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args(argv)
    result = inspect(args.root)
    print(f"網站檢查：{result['totalCoupons']} 張優惠券，其中 {result['notExpired']} 張尚未到期")
    for warning in result['warnings']:
        print('::warning::' + warning)
    for error in result['errors']:
        print('::error::' + error)
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a', encoding='utf-8') as handle:
            handle.write(f"### 網站檔案檢查\n優惠券：{result['totalCoupons']} 張；尚未到期：{result['notExpired']} 張。\n")
            for item in result['warnings']:
                handle.write('- ⚠️ ' + item + '\n')
            for item in result['errors']:
                handle.write('- ❌ ' + item + '\n')
    if result['errors']:
        print(f"檢查失敗：{len(result['errors'])} 個錯誤。為避免空白網站，停止部署。")
        return 1
    print('檢查通過：可以進行部署。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
