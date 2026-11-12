---
title: E12 — 平台、安全、成本與維運
date: 2026-11-03
status: planned
epic: E12
owner: GeneCLee6
milestones: [M0, M1, M2, M4]
depends_on: []
---

## 背景

和牌桌、LongTalk 同一套：Cloudflare Workers（帶靜態資產）＋Durable Objects＋D1＋R2，GitHub Actions CI，PR 預覽。這個專案多兩件事：**3D 資產的大小與授權**（R2、Cache、`ASSETS.md`、CI 擋未登記檔案）與**IP 檢查清單**（每款遊戲上線前跑一次）。

## 目標

- M0：repo 骨架、CI、部署、JS 預算、遙測基礎、D1 骨架。
- M1：濫用防護、D1 遷移流程、備份。
- M2：R2 資產管線、資產授權清單與 CI 檢查、IP 檢查清單。
- M4：成本儀表板、功能旗標下架、遙測完整。

## 非目標

- 多區域、付費方案。
- 競技級反作弊。

## 需求

- **repo 骨架**：Vite＋React 19＋TS strict＋styled-components、`worker/`、`shared/`、`wrangler.jsonc`（DO：`LobbyDO`、`RoomDO`；D1；R2 `ASSETS`）、Vitest、oxlint、Playwright、`CLAUDE.md`、`RULES.md`、`DEPLOY.md`。
- **CI**：lint、typecheck、test、build、JS 預算、i18n 檢查、資產登記檢查；PR 預覽（每個 PR 一個 Worker `wrangler deploy --name`，見 `DEPLOY.md`）；`main` 合併自動部署。
- **JS 預算**：大廳與桌遊首屏 gzip ≤ 150 kB；卡丁車 chunk 另計（≤ 600 kB gzip，three.js 含）；`scripts/check-budget.mjs`。
- **遙測**：Workers observability；錯誤回報端點（沿用橋館 `e10-t06` 做法）；每日房間數、每款遊戲場次、卡丁車 fps 分佈（匿名）。
- **濫用防護**：建房速率（每 IP 每分鐘 5 間）、聊天速率、暱稱過濾（控制字元、過長）、WebSocket 連線上限每房 16、未登入不能用 AI 生成與管理頁。
- **D1**：遷移檔與流程（`wrangler d1 migrations`）；每日備份到 R2（cron，沿用牌桌）。
- **R2 資產管線**：`scripts/assets/upload.ts`（內容雜湊檔名、Cache-Control 一年）；`docs/ASSETS.md` 登記每個資產（路徑、來源、授權、作者、備註）；`scripts/check-assets.mjs`：`public/` 與 R2 清單中的每個檔案都要有登記列，否則 CI 失敗。
- **IP 檢查清單**（`docs/IP-CHECKLIST.md`）：每款遊戲上線前逐項：名稱不與原作相同或近似、無原作美術／文字／音樂、題庫自寫、規則頁為自己的話、資產全部登記、公開文字沒有用原作名稱當自己的名稱；由擁有者簽名日期。
- **功能旗標**：每款遊戲一個 `games.<id>.enabled`（Worker vars 或 D1）；關閉時大廳隱藏、既有房間結束後不能再開；用來應對通知或維護。
- **成本儀表板**：每月 Workers 請求、DO 時間與儲存、D1、R2 儲存與流出；估算費用；超過免費額度 80% 時 email（cron）。

## 設計方向

- 一個 Worker，`/api/*` 與 `/ws` 先進 Worker，其餘靜態資產。
- 環境：`staging`（PR 預覽）與正式；D1 各一。
- 遙測與錯誤回報不收個資；暱稱不進遙測。

## 驗收條件

- [x] AC-12.1 — 部署：正式站上線、`DEPLOY.md`、PR 預覽。
- [ ] AC-12.2 — CI：lint／typecheck／test／build／預算／i18n／資產檢查全在 PR 跑。
- [ ] AC-12.3 — 遙測：錯誤回報與每日指標可見。
- [ ] AC-12.4 — 成本：儀表板與 80% 警示。
- [ ] AC-12.5 — 濫用防護：速率、過濾、連線上限，有測試。
- [ ] AC-12.6 — 資產授權清單：`ASSETS.md`、上傳腳本、CI 擋未登記。
- [ ] AC-12.7 — 功能旗標：每款遊戲可關；關閉行為有測試。
- [ ] AC-12.8 — IP 檢查清單：文件存在；每款遊戲上線前有簽名紀錄。

## Task 拆分

### M0

- [x] `e12-t01` repo 骨架：Vite／React／TS、worker、shared、wrangler（DO、D1、R2）、Vitest、oxlint、`CLAUDE.md`、`RULES.md` · AC-12.1 · M · #1
- [x] `e12-t02` CI workflow、PR 預覽、正式部署、`DEPLOY.md`、secrets 清單 · AC-12.1, 12.2 · M · ← e12-t01 · #1
- [x] `e12-t03` JS 預算腳本（兩個預算：主站、卡丁車 chunk） · AC-12.2 · S · ← e12-t02 · #3
- [x] `e12-t04` 錯誤回報端點與前端攔截、Workers observability · AC-12.3 · S · ← e12-t01 · #10
- [x] `e12-t05` D1 骨架、遷移流程、每日備份 cron · AC-12.1 · S · ← e12-t01 · #10
- [x] `e12-t12` 首屏預算騰空間（D4，擁有者 2026-11-12 要求）：每條首屏線至少留 6 kB，使用者看到的不變，預算上限與量法不動 · AC-12.2 · S · ← e12-t03 · #PR
- [ ] `e12-t09` `docs/IP-CHECKLIST.md` 與第一次簽核（陞官圖；M1 三款與卡丁車上線前各補簽一次） · AC-12.8 · S（文件與查核在 #14；**擁有者還沒簽**，簽完才勾）

### M1

- [ ] `e12-t06` 濫用防護：建房與聊天速率、暱稱過濾、連線上限、管理頁權限 · AC-12.5 · M · ← e1-t01, e1-t12
- [ ] `e12-t07` 每日指標（房間數、場次）與簡單儀表頁（擁有者） · AC-12.3 · S · ← e12-t04

### M2

- [ ] `e12-t08` `docs/ASSETS.md` 格式、`scripts/assets/upload.ts`（R2、雜湊、Cache-Control）、`check-assets.mjs` 進 CI · AC-12.6 · M · ← e12-t02
- [ ] `e12-t10` 卡丁車 fps 與載入時間遙測（匿名） · AC-12.3 · S · ← e8-t06

### M4

- [ ] `e12-t11` 功能旗標（每款遊戲）與關閉行為測試 · AC-12.7 · S · ← e1-t09
- [ ] `e12-t12` 成本儀表板與 80% 警示 cron · AC-12.4 · M · ← e12-t07
- [ ] `e12-t13` 安全複查（WebSocket 來源檢查、CSP、依賴更新） · AC-12.5 · S

## 風險與對策

| 風險 | 對策 |
| --- | --- |
| DO 時間計費在卡丁車多人時暴增 | 成本儀表板；20 Hz 可降；房間 10 分鐘無人即關 |
| 資產檔案被塞進 repo 讓 clone 變大 | 模型與貼圖只放 R2；repo 只有來源 `.blend` 的連結或 LFS 之外的指標；`.gitignore` 擋 `*.glb` 超過 1 MB（檢查腳本） |

## 未決問題

- [ ] **Q:** 正式網址？（`*.workers.dev` 還是自訂網域）
      **A:** _(建議先 workers.dev，名稱拍板後再買網域；未拍板)_
