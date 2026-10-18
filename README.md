# 🍗 雞省研究所 — KCouper 整合、每日自動更新與異常提醒版

本專案是一個可放在 GitHub Pages 的靜態網站。網站可按想吃的炸雞、蛋撻、漢堡、飲料等數量計算優惠券組合，也可搜尋、收藏與複製優惠碼。

## 這一版新增的內容

- **KCouper 結構化來源**：每日從 [`Winedays/KCouper` 的 `public/coupon.js`](https://github.com/Winedays/KCouper/blob/master/public/coupon.js) 讀取 `COUPON_DICT`，優先使用優惠碼、價格、日期和餐點明細。不執行第三方 JavaScript，而是從 JS 中提取 JSON。
- **第二來源交叉核對**：當 KCouper 不可用時，從 [好康情報誌](https://info.talk.tw/kfc-coupon/) 抓取已知券的明確價格與期限；兩站資料不同則標註待審。
- **自動辨識部分新券**：只要每個品項都能識別為已支援餐點、數量明確、沒有隱藏加價或跨品類選項、價格日期合理，新券才會自動加入最省搭配。未知商品、非標準尺寸、複雜口味選擇與資訊衝突會寫到 `pending-review.json`，不納入最省組合。由於餐點變動較多，此分類器無法涵蓋所有券。
- **新優惠資訊儀表板**：網站新增「每日優惠情報中心」，呈現最後檢查時間、自動新增數、待審數、資料來源核對狀態。
- **異常提醒**：`alerts.json` 保留警告；GitHub Actions Summary 會顯示新增異常並嘗試開啟／更新 GitHub Issue。若您在 GitHub 訂閱儲存庫通知，是否收到 Email 取決於您的通知設定。
- **保護原資料**：來源格式錯誤或都無法核對時停止寫入；不會將優惠券清空。對大幅變動的價格及餐點構成差異採人工複核，不會擅自套用。

> ⚠️ 本網站非肯德基官方，且 KCouper 亦屬第三方公開資料整理。網站只能提供收錄優惠券中的最低價建議，**不保證所有券都可兌換、可重複使用或適用所有門市**。實際價格和適用範圍請以肯德基官方購物車確認。KCouper 的原始專案權利與資料使用方式應予尊重；若用於公開發布，請先確認其最新授權與資料使用規則。

## 上線（GitHub Pages）

1. 在 [GitHub 新增儲存庫](https://github.com/new)，例如 `kfc-deal-lab`，選 Public（公開）。
2. 將本 ZIP 完整解壓縮，**包含隱藏的 `.github/workflows/`**，把所有檔案上傳到儲存庫根目錄。
3. 在儲存庫 **Settings → Pages → Build and deployment → Source** 選 `GitHub Actions`。
4. **Settings → Actions → General → Workflow permissions** 選擇允許 Actions 寫入內容（如果帳號和組織政策允許），否則自動資料更動無法提交。若要建立異常 Issues，請在 Settings 開啟 Issues 功能。
5. **Actions → 雞省研究所｜每日核對與自動更新 → Run workflow**，先手動觸發一次；等待執行與發布。
6. 回到 **Settings → Pages** 查看公開網站網址。

之後 GitHub Actions 預設每天台灣時間 **09:17**（UTC 01:17）執行。GitHub 排程不保證準點，停用排程或政策限制造成的漏跑須手動檢查。若希望收到異常通知，可以在儲存庫右上角 **Watch → Custom → Issues** 訂閱；GitHub 是否寄信仍依你帳號設定。

## 專案檔案

| 路徑 | 用途 |
| --- | --- |
| `index.html` | 網頁、比價計算機、優惠券卡片與更新狀態中心 |
| `coupons.json` | 提供網站的正式優惠資料（原有 53 張為離線快照起點） |
| `update-status.json` | 最近核對時間、來源狀況、自動新增與待審統計 |
| `pending-review.json` | 尚未能安全上線的新券、價格/餐點差異與變更紀錄 |
| `alerts.json` | 異常警訊及當天新增告警，用於 GitHub Issue |
| `scripts/update_coupons.py` | 取得 KCouper 與文章資料、審核、合併、發布 JSON |
| `scripts/article_source.py` | 文章來源解析器（必要時作後備） |
| `scripts/report_alerts.py` | Actions Summary 和 GitHub Issue 的異常通知 |
| `.github/workflows/daily-coupons.yml` | 每日排程、執行測試、更新及部署 |
| `tests/` | 離線單元測試、文章測試範例 |

## 測試

```bash
python -m unittest discover -s tests -p 'test_*.py' -v
```

手動測試實際更新（**注意：會修改本資料夾裡的 JSON**，建議先備份或在複製資料夾測試）：

```bash
python scripts/update_coupons.py
```

若沒有網路，仍可執行離線測試，但**沒有證明實際來源每天都能取得**。目前提供的 ZIP 是尚未連接你 GitHub 帳號的可部署專案，並非已執行的每日排程。

本機展示網站：

```bash
python -m http.server 8000
```

在瀏覽器開啟 `http://localhost:8000/`；直接雙擊 `index.html` 可能只能看到離線起始快照。

## 常見問題

**有新優惠但沒有自動加入？** 請開 `pending-review.json`，若是尺寸、口味、未知品項或來源內容不一致，需人工核對，並在 `coupons.json` 加上正確 `items` 對應數量。

**來源失敗？** 在 Actions 中讀取本次執行 Logs。若兩來源都失敗，網站會維持上一份已成功儲存的資料，並會顯示舊的檢查日期。若更新流程沒過，來源抓取失敗提醒可能只在 Actions Summary/Issues 裡。

**已經核對過的異常還一直提醒？** 來源穩定但待審沒完成的警告仍會在 `alerts.json` 保留；Issues 僅針對新發現或內容改變的警告更新，避免每天重複通知。

**為什麼不是全部新券都自動發布？** 這是刻意設計。只憑優惠券名稱無法判斷餐點數量與口味可換細節。如果把未確定套餐加進精算，可能會誤報最低價。
