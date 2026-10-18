# 雞省研究所 V3.5｜完整餐點與來源比對升級包

此為 **V3.4.1（已含飯類）以上的增量升級**。不會替你操作 GitHub，不會覆蓋線上的優惠券或歷史資料。

## 這次升級內容

1. **15 類可選餐點**：保留炸雞、漢堡、蛋撻、雞塊、三種飯等原有選項，新增雞米花（份）、玉米濃湯（杯）、QQ 球（顆）。版面依「炸雞與雞肉／漢堡與飯類／配餐點心飲料」分組。
2. **維持最低價混合比價**：原有優惠券＋自行輸入單點參考價格、前三組低價方案、精準份數、排除餐點及預算等功能保留。無價格的新類別仍會出現，但不會猜價格。
3. **來源交叉比對**：每日更新成功後，按優惠碼及價格記錄 KCouper 與好康情報誌的來源證據；同一優惠碼的價格兩邊一致時，顯示「雙來源價格一致（非官方驗證）」。不同價、無資料或餐點不符時，不能標為一致。
4. **顯示資料缺口**：舊券文字含 QQ 球、濃湯或雞米花但 JSON 未記錄數量時，優惠券會標「配餐明細待核對」，結果中也會提醒；不會自行補造數量。精準模式不會將這些未知品項當成已滿足需求。
5. **安全更新**：不執行第三方網站 JavaScript；無法辨識的券保持待審，來源失敗保留上次有效資料。

## 上傳 GitHub（只須 5 個檔案）

請先備份 GitHub 上的舊檔。打開你的專案編輯器：

https://github.dev/lkjfds2222-lang/lkjfds2222.github.io

將 ZIP 內下列檔案上傳至專案的相同相對路徑：

| 檔案 | 操作 |
| --- | --- |
| `index.html` | 覆蓋 |
| `v3.js` | 覆蓋 |
| `sw.js` | 覆蓋 |
| `scripts/update_coupons.py` | 覆蓋 |
| `tests/test_v35_features.py` | 新增 |

**千萬不要上傳此 ZIP 取代原始資料庫，也不要覆蓋以下檔案：** `coupons.json`、`price-history.json`、`menu-prices.json`、`official-offers.json`、`pending-review.json`、`alerts.json`、`update-status.json` 或 `.github/workflows/daily-coupons.yml`。保留已可成功部署的 Actions 工作流程設定。

編輯完成後 `Ctrl+S`，到 Source Control 做 `Commit & Push`。若現有 GitHub Actions 有設定 `push` 觸發，會自動執行新的一次部署；請在 Actions **最新的一次執行**中檢查 `build` 和 `deploy`，不要按以前失敗紀錄的「Re-run jobs」。如目前工作流程只支援手動，請在 Actions 工作流程清單選 `Run workflow` 啟動新的執行。

## 部署後核對

- 網站標題顯示 **V3.5**、想吃的餐點出現「雞米花」「玉米濃湯」「QQ 球」。
- 在「優惠券大全」可選「濃湯／雞米花／QQ 球」與「雙來源同價」兩種篩選。新版資料必須成功抓取並核對後，才可能有「雙來源同價」的券。
- 手動設定餐點，確認可以試算；含新類別但無券或單點參考價格時，顯示「找不到符合條件」屬正常，不是故障。
- 今日更新後 `coupons.json` 中的 `crosscheck` 會隨 KCouper、好康情報誌來源核對狀態更新；**不是肯德基官方可用保證**。
- 若更新後仍看舊版，等待 Pages deploy 完成，按 `Ctrl+Shift+R` 重新整理；手機可先關掉舊分頁重開。

## 本機測試

```bash
python -m unittest discover -s tests -p 'test_*.py' -v
node --check v3.js
python scripts/validate_site.py --root .
```

本次與原有 V3 系列程式整合後，合計 **29 項離線測試通過**；以瀏覽器注入頁面測試了 15 種餐點、搜尋篩選與包含 QQ 球/濃湯的試算案例。仍未替你推送到 GitHub，也未驗證真實線上每日更新。

### 資料來源和限制

- KCouper: https://winedays.github.io/KCouper/
- 好康情報誌: https://info.talk.tw/kfc-coupon/
- 肯德基官方優惠券核對: https://www.kfcclub.com.tw/coupon

肯德基官方查碼頁是互動式查詢，並不是已確認可批次下載的完整官方優惠券表。商品是否有販售、價格、口味、大小、門市與通路適用性，仍以實際官方結帳為準。第三方來源內容重新發布應遵守其授權及使用規則。
