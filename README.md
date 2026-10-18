# 雞省研究所 V3.1：畫面修復與易用性升級

此為「更新補丁」，只包含三個必須覆蓋的檔案，不含舊版 coupons.json，也不修改每日更新工作流程。

## 更新的內容
- 修正購買清單因父層深色主題繼承白色文字，導致淺色卡片幾乎看不到字。
- 購買清單更易讀：深色標題、餐點數量、優惠券代碼、複製按鈕、小計及整筆總額。
- 新增「只複製優惠碼」按鈕；重複券會標註使用張數。
- 加強手機及小螢幕排版、鍵盤可用性與顏色對比。
- 更換 Service Worker 快取版本，避免更新後依然顯示舊介面；JSON 不存入 App Shell 快取，降低陳舊價格誤導風險。

## 上傳到原本的 GitHub Pages
1. 打開 https://github.dev/lkjfds2222-lang/lkjfds2222.github.io 。
2. 將本資料夾的 **index.html、v3.js、sw.js** 覆蓋儲存庫根目錄的同名檔案（不是放到 .github/workflows 裡）。
3. Ctrl+S，點左側 Source Control，輸入修正說明後 Commit & Push。
4. 回到 GitHub 的 Actions，等待每日更新部署流程的 build、deploy 皆完成；必要時手動 Run workflow。
5. 重新開啟 https://lkjfds2222-lang.github.io/；若畫面還是舊版，可按 Ctrl+Shift+R 或關閉分頁重開。

### 不要動的檔案
- **coupons.json**：保留線上已更新的優惠券，不要用舊快照覆蓋。
- `.github/workflows/daily-coupons.yml`：只要目前部署流程正常，就不需變更。
- `scripts/`、`price-history.json` 等：保留現有資料與排程。

注意：目前的比價結果仍以已收錄的券和可驗證單點資料為準，並非肯德基官方即時報價。
