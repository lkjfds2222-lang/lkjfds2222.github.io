# 雞省研究所 V3｜更精準的優惠券比價網站

靜態網站，可以部署到 GitHub Pages。**不是肯德基官方**；資料取自公開整理來源，不能保證任何券或價格在門市實際可用。

## V3 新功能

1. **比較最多 3 組低價方案**：各項指定餐點數量透過精確動態規劃 / 狀態最短路求解，並列出實得數量、額外餐點與購買清單。未求出確切結果時會顯示無法計算，不會以粗估稱為最低價。當不同商品有不同口味或規格時仍需核對。
2. **不多買模式**：依九類已辨識餐點限制份數完全吻合；已知另附 QQ 球或濃湯等未列入九類的餐券會排除。未知配餐、口味互換仍可能需人工查證。
3. **通路限制不亂猜**：僅在券有 `channelVerified: true` 和 `channels`（`pickup`/`dinein`/`delivery`）時才視為已核對適用通路。KCouper `order_types` 數字會保留，但不推測其意思，因此選擇限定通路時若沒有人工核對資料可能沒有結果。
4. **購物習慣**：排除不想吃的餐點、選擇人數、預算、收藏、查詢、複製優惠碼，分享包含餐點需求的連結。
5. **有憑據的單點價格**：由網站管理者在 `menu-prices.json` 填入 **來源 URL、核對日、價錢**，30 天內已核對的品項才加入比價；預設空白，絕不自行猜測單點價格。一般單點或原價套餐資料不完整時，網站只宣稱「已收錄選項中的最低價」。
6. **最近 90 天價格紀錄**：自動更新成功後，僅針對本次來源明確出現的券記錄每天一筆價格（含仍需門市最終核對的限制），不追溯或補造過往資料；`price-history.json` 初始為空。
7. **PWA 支援**：`manifest.webmanifest`、`sw.js` 可供部分手機加入主畫面並在斷線時瀏覽上次取得的頁面或資料；斷線時**不**應把快取資料理解為當日優惠。
8. **異常提醒**：有疑慮的新券、內容改動、價格異常會放入待審 JSON，GitHub Actions 摘要及 GitHub Issues 提醒。GitHub 通知能否寄 Email 取決於帳號設定。

## 安裝／上傳到 GitHub

1. **完整解壓縮 ZIP**，並把檔案與資料夾全部上傳到你的 GitHub 儲存庫**根目錄**，包含隱藏資料夾 `.github/workflows/`。不要只上傳 `index.html`，因為新版還需要 `v3.js` 等檔案。
2. 前往儲存庫 `Settings → Pages → Build and deployment`，將 Source 設定為 `GitHub Actions`。
3. 在 `Settings → Actions → General` 確認工作流程有必要的 `Read and write permissions`，並開啟儲存庫 Issues（異常提醒用）。有些環境會依組織政策限制此設定。
4. 在 `Actions → 雞省研究所｜每日核對與自動更新 → Run workflow` 手動執行一次。
5. 等待部署完成後，從 `Settings → Pages` 查看公開網址。

預設排程為台灣每天 **09:17**（GitHub Actions 使用 UTC 01:17，可能有延遲或排程停用）。**此套件尚未在你的 GitHub 帳號實際部署，也尚未進行真實排程連線驗收。**

若你原本已有 V2，請直接把同名檔案及新增檔案上傳到原儲存庫，保留原本 `.github/workflows/daily-coupons.yml` 的路徑。建議先用分支測試，再合併上線。

## 如何加入已確認的單點價格？

預設 `menu-prices.json` 的 `prices` 是空物件。請手動更改：

```json
{
  "prices": {
    "tart": {
      "price": 42,
      "sourceUrl": "https://www.kfcclub.com.tw/",
      "verifiedAt": "2026-10-18",
      "channels": [],
      "channelVerified": false
    }
  }
}
```

> 42 元僅為**格式範例，非經核實的實際售價**。更新時請改成當時查到的官方售價與實際核對日期。`verifiedAt` 必須在近 30 天內，過期資料便自動停用。若要限定特定通路，請先人工核對適用資訊，再將 `channels` 寫為 `pickup`、`dinein` 或 `delivery`，並將 `channelVerified` 設為 `true`。

優惠券亦可人工加上 `channels` 與 `channelVerified`。來源 `orderTypes` 數字**不等於**已核對適用通路。

## 資料及程式檔案

| 檔案 | 用途 |
| --- | --- |
| `index.html` + `v3.js` | 網站、比價、搜尋、分享、價格折線圖 |
| `coupons.json` | 優惠券正式資料 |
| `price-history.json` | 最多 90 天的成功核對價格紀錄 |
| `menu-prices.json` | 可手動維護有來源的單點價格 |
| `update-status.json`、`pending-review.json`、`alerts.json` | 核對狀態、待審及告警 |
| `scripts/` | 每日更新、來源分析及 GitHub Issue 提醒 |
| `.github/workflows/daily-coupons.yml` | 每日更新 + GitHub Pages 部署 |
| `manifest.webmanifest`、`sw.js`、`app-icon.svg` | 手機主畫面與部分離線功能 |

## 測試

```sh
python -m unittest discover -s tests -p 'test_*.py' -v
node --check v3.js
python -m http.server 8000
```

然後瀏覽 `http://localhost:8000`。初始優惠券是 **2026/10/18 整理的離線快照**，首次真實更新之後才有新的來源檢查時間與價格歷史。可直接從檔案打開 HTML 供本機快速預覽，但需確保同一資料夾有 `v3.js`；`file://` 無法取用本地 JSON，仍會使用內嵌快照。

**關於準確性**：第三方來源可能有商品規格或折價券適用限制；比價器只能在當前已收錄且被識別的餐點分類範圍內提供計算。若使用者需要特定辣度、尺寸、外送運費、最低消費或跨餐點替換等，應於官方購物車重新核對。

資料來源：[KCouper](https://winedays.github.io/KCouper/) · [好康情報誌](https://info.talk.tw/kfc-coupon/) · [肯德基官方優惠](https://www.kfcclub.com.tw/coupon)。再次分發第三方資料時，應先確認原始網站的授權與使用規則。
