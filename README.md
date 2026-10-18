# 雞省研究所 V3.2｜官方資料來源巡查與網站強化

這是 **V3.1 升級補丁**，不是完整資料庫包。保留你現在已經正常更新的 `coupons.json`、`price-history.json`、`alerts.json`、`pending-review.json`、`update-status.json`、`menu-prices.json`。

## 上傳到 GitHub

依照 ZIP 目錄結構新增／覆蓋：

- `index.html`、`v3.js`、`sw.js`
- `official-offers.json`（新檔；如果已有線上資料請勿覆蓋）
- `scripts/official_monitor.py`（新檔）
- `tests/test_official_monitor.py`（新檔）
- `.github/workflows/daily-coupons.yml`（請確認你目前使用的是本包相同流程；已加入官方巡查與完整檔案部署）

**不要刪除原本的 `scripts/update_coupons.py`、`scripts/report_alerts.py` 和整個 `tests/`。** 本 ZIP 只包含需要變動的檔案，不包括上述舊程式。

### 部署方式

1. 先在 GitHub 建一個備份分支，再上傳以上檔案至儲存庫根目錄。
2. 進入 Actions →「雞省研究所｜每日核對與自動更新」→ Run workflow。
3. 確認 `build` / `deploy` 成功，並在網頁看到「肯德基官方活動・交叉核對」區塊。
4. 查看 https://你的網站/official-offers.json 是否存在；首次部署會顯示最新官方巡查結果。
5. 若顯示舊版，強制重新整理 Ctrl+Shift+R 或重開 PWA。

## 本次新增什麼？

- 每日訪問公開肯德基 `/coupon`（查碼入口）與官方首頁，保存來源是否可讀、活動文字候選與巡查時間。
- 顯示官方原始入口與候選活動，**只作官方活動發現，絕不自動添加成可計算優惠券**。
- 官網抓取失敗時保留既有候選活動並顯示過時狀態；不清空第三方券資料。
- 全部新增文案都先安全編碼，避免從外部來源插入 HTML。
- 官網頁面沒有已公開、穩定的完整優惠券 JSON API；未驗證資料不能假稱官方核價。

## 測試

```bash
python -m unittest discover -s tests -p 'test_*.py' -v
node --check v3.js
python scripts/official_monitor.py --offline --coupon-fixture tests/official_coupon_sample.html --home-fixture tests/official_home_sample.html
```

第三條為可選的 fixture 測試。本站原本的比價資料來自 KCouper、好康情報誌。肯德基官方頁主要用來核對使用條件，官方首頁僅供查看活動，不代表即時券庫。
