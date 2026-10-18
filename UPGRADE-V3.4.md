# 🍗 雞省研究所 V3.4｜升級指南

此為 **V3.2 / V3.3 的增量升級包**。只需將下列 3 個檔案放到現有 GitHub 儲存庫**根目錄**（與 `coupons.json` 同層），覆蓋同名檔案：

- `index.html` — 自訂單點介面、即將到期篩選、價格走勢區間、介面版本標示。
- `v3.js` — 單點與優惠券混合試算、自訂價格安全標示、單點數量修正及價格歷史功能。
- `sw.js` — 將離線 App Shell 快取版本提高為 V3.4，減少使用舊 JS 的情況。

**不要覆蓋或刪除**：

- `.github/workflows/daily-coupons.yml`（目前既有工作流程已可使用）
- `coupons.json`、`update-status.json`、`price-history.json`、`pending-review.json`、`alerts.json`、`official-offers.json`、`menu-prices.json`
- `scripts/`、`tests/`、`manifest.webmanifest`、`app-icon.svg`

## GitHub 網頁版上傳

1. 解壓 ZIP，開啟 https://github.dev/lkjfds2222-lang/lkjfds2222.github.io
2. 在儲存庫根目錄分別替換 `index.html`、`v3.js`、`sw.js`。
3. 點 Source Control，填入 `feat: KFC V3.4 mixed price calculator`，按 Commit & Push。
4. 進入 https://github.com/lkjfds2222-lang/lkjfds2222.github.io/actions 確認**新的一筆**（非 Re-run 舊紀錄）Build 與 Deploy 都成功。
5. 開啟 https://lkjfds2222-lang.github.io/ ；若看到舊版，強制重新整理（Windows `Ctrl + Shift + R`）。

## 新功能

1. 在「組合計算」找到並展開「加入單點價格混合比價」，為需要的餐點輸入每份單價（1–500 元整數），勾選「將自行輸入的價格納入本次比價」，按「比較 3 種低價組合」。未勾選前**不影響既有演算法**。
2. 自訂單點價格標為「待核對」，只保存在當前瀏覽器的 localStorage，不寫進 `coupons.json`，也不會上傳到 GitHub。
3. 在指定外帶／內用／外送通路的情況下，自訂單價**不參與**計算，以免錯誤宣稱特定通路可用。
4. 「價格歷史」現在可查看最近 7／30／90 天的核對紀錄與價格變化；沒有記錄時會直說沒有記錄。
5. 新增 7 天內到期優惠券快速篩選。

## 已驗證的行為

- 22 項既有 Python 單元測試通過，`node --check v3.js` 通過。
- Chromium 測試過 1400px、390px、320px 畫面，確認沒有橫向溢出。
- 原始券組合、手動單價混合計算、開關切換、篩選、價格歷史切換通過。
- 以**刻意不合理的測試價**「蛋撻 1 元」驗證：4 塊炸雞＋2 顆蛋撻＋2 杯飲料，可計算 50551（175 元）＋自訂蛋撻 2 元＝**177 元**。此數值是程式測試，不是實際蛋撻售價。

## 資料限制

- 本版沒有杜撰肯德基官方單點價格，亦沒有繞過官方網站去蒐集未公開的券表。
- 真正的全市場最低價仍取決於收錄券的完整性、門市/通路、能否拆單及官方當下供應。
- 若部署後顯示為空，先測試網站 `/v3.js` 與 `/coupons.json` 是否能載入；這次 ZIP **不會改動你的每日更新 YAML**。
