# 雞省研究所 V3.3 — 安全部署與 Node.js 24 相容版

這是針對已部署的 V3.2 / V3.1 網站的**增量修正**，不是整站重裝。保留所有線上券資料與價格歷史。

## 需要上傳的 3 個檔案

- `.github/workflows/daily-coupons.yml`（取代原檔）
- `scripts/validate_site.py`（新增）
- `tests/test_site_validator.py`（新增）

請不要以這個 ZIP 取代 `coupons.json`、`price-history.json`、`official-offers.json` 或 `index.html`。原本的 `scripts/update_coupons.py`、`scripts/official_monitor.py`、`scripts/report_alerts.py` 等全部保留。

## 改善項目

1. GitHub Actions 升至 Node.js 24 版本：checkout@v5、setup-python@v6、configure-pages@v6、upload-pages-artifact@v5、deploy-pages@v5。
2. Runner 固定為 `ubuntu-24.04`，減少映像版本變更影響。
3. `main` 分支網頁程式或資料檔修改時，自動部署；一般 push 不會重新抓第三方網站。
4. 每日或手動執行時才抓取 KCouper、優惠文章、官方活動頁，所有官方活動繼續只作待審，不直接加入比價。
5. 部署前檢查 12 個必要檔案、JSON、優惠券碼/價格/期限/重複券；防止更新把網站發布成空白。
6. 資料回寫 GitHub 失敗時顯示警告但仍嘗試部署。
7. 部署成功後對 Pages 的主要檔案執行線上檢查（CDN 同步慢只警告、不誤判部署失敗）。

## 部署

1. 先備份原始 `.github/workflows/daily-coupons.yml`。
2. 用 GitHub 網頁或 github.dev 覆蓋 3 個檔案，**路徑必須完全一致**。
3. Commit & Push。新增的 `push` 事件會啟動一次檢查及部署。
4. GitHub Actions 查看 `build`、`deploy` 的結果；如發生錯誤，請展開「更新後資料安全檢查」或「準備 GitHub Pages 網站」。
5. 若工作流程未自動開始，到 Actions 手動執行。

本次未修改網站顯示風格或優惠計算邏輯，避免影響已能正常運作的頁面。未在你的 GitHub 儲存庫實際部署，無法宣稱線上驗收成功。

## 本機測試

```bash
python -m unittest discover -s tests -p 'test_*.py' -v
python scripts/validate_site.py --root .
node --check v3.js
```

必要檔案中的任何一份缺失，都會停止新的部署，但不會刪除原本已發布的網站。
