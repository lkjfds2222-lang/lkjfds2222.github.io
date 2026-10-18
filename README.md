# 🍗 雞省研究所 — 每日自動更新版

已改造原先的 53 張優惠券比價網站：保留搜尋、餐點數量、拆單比價與收藏。公開部署後，前端會讀取 `coupons.json`，而不是只用寫死的優惠券快照。

## 上線：GitHub Pages（不需購買伺服器）

1. 登入 [GitHub](https://github.com/)，新增 **Public** 儲存庫，例如 `kfc-deal-lab`。
2. 解壓縮整個 ZIP，把**全部檔案及資料夾**（尤其是隱藏的 `.github/workflows/daily-coupons.yml`）上傳到儲存庫根目錄；建議在根目錄看到 `index.html`、`coupons.json`、`scripts/`、`.github/`。
3. 開啟儲存庫 **Settings → Pages → Build and deployment → Source**，選擇 **GitHub Actions**（不要選 Deploy from a branch）。
4. 至 **Settings → Actions → General → Workflow permissions**，設定允許 Actions 寫入儲存庫（若帳戶/組織政策允許）。此步驟是讓每日檢查結果能保存到 `coupons.json`。
5. 開啟儲存庫 **Actions → 每日更新並部署肯德基優惠券 → Run workflow**，先手動執行一次，測試更新及部署。即使來源暫時不可用，仍會把原有資料部署為靜態網站，並標示未核對。
6. Actions 頁面執行成功後，在 **Settings → Pages** 查看網站 URL。之後每天約台灣時間 **09:17**（UTC 01:17）核對並發布；GitHub 排程可能延後或漏跑。

## 實際資料流程

`GitHub Actions 定時執行` → `scripts/update_coupons.py 抓取 https://info.talk.tw/kfc-coupon/` → `匹配已收錄優惠碼的價格與期限` → `合理性檢查` → `寫入 coupons.json / update-status.json / pending-review.json` → `GitHub Pages 重新發布` → `網頁啟動時讀 coupons.json`。

**此版本的自動更新邊界：**

- 更新已收錄券的**明確辨識價格及延長後的有效期限**，並每天自動移除畫面中的過期券。
- 價格異常跳動、期限縮短和**新優惠碼**會進 `pending-review.json` 待人工複核；**不會猜測新券的餐點品項及數量**，避免拆單推薦出錯。
- 若文章頁面無法存取、版型變更或辨識不到至少 3 張已知券，本次更新中止並**保留舊資料**。首頁會顯示最後核對日期；若超過 48 小時會警告資料可能過時。
- 資料來源是第三方文章，不是肯德基官方授權 API。文章可能延遲或有誤，實際結帳和門市限制以肯德基為準。請遵守來源網站的服務條款與存取規則，並避免提高抓取頻率。
- `KCouper` 網站為查詢參考；其舊版 `js/coupon.js` 已不可用，此版本**沒有宣稱直接接入 KCouper API**。

## 新增券怎麼加入最省計算？

至 `pending-review.json` 查看 `newCoupons`，確認券碼、價格、期限與餐點數量後，手動在 `coupons.json` 陣列新增一筆符合以下格式的券：

```json
{
  "code": "29999",
  "price": 99,
  "end": "2027-08-01",
  "title": "範例（請改成真實名稱）",
  "items": { "fried": 2, "drink": 1 },
  "desc": "範例：炸雞 2 塊＋飲料 1 杯（請人工核對）",
  "original": null,
  "note": "請依肯德基結帳與門市規則核對"
}
```

欄位 `items` 支援：`fried`、`smallBurger`、`burger`、`tart`、`nuggets`、`fries`、`hash`、`drink`、`boneless`。保存後，在 Actions 再次手動執行，或由下一次每日排程自動載入。

## 測試與離線版

- **本地瀏覽器：** 直接開 `index.html` 會使用內建 2026/10/18 快照（`file://` 網頁無法可靠地讀取本地 JSON）。
- **本地靜態伺服器：** 在專案根目錄執行 `python -m http.server 8000`，再瀏覽 `http://localhost:8000`，可測試前端讀取 `coupons.json`。
- **資料解析測試：** `python scripts/update_coupons.py --fixture tests/sample-source.html --root /tmp/kfc-fixture-project`。測試時用另一個資料夾，避免改寫專案資料。
- **正式每日核對：** `python scripts/update_coupons.py`，需能上網並遵守來源站規定。

## 限制

本網站是民間整理工具，並非肯德基官方。優惠是否可使用、是否可多張併用、能否換口味或外送等，以官方購物車與門市為準。資料僅供比較，不保證最優組合一定可實際購買。
