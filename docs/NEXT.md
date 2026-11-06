# NEXT — 接下來怎麼做（給 AI 協作者與自己的交接手冊）

最後更新 2026-11-06（Phase A、C1 完成）。**完整順序在 [`ROADMAP.md`](ROADMAP.md)**（一批一個 PR）；這份只記「現在的位置」與工作方式。每完成一批就更新「現在的位置」；每個 AI session 開頭只需要讀 `CLAUDE.md` 和這一份。

## 1. 現在的位置

- **2026-11-03 規劃完成，尚未有程式碼。** 名稱拍板 **TKU Arcade**；GitHub `GeneCLee6/TKU-Arcade`（公開）；README 只寫英文。介面語言：預設英文、初次依瀏覽器語言自動切繁中（已拍板）。 總 PRD `docs/PRD/00-prd.md`、版權分析 `docs/PRD/01-legal-ip-analysis.md`、12 個 epic（124 個 task、70 條 AC）、`ROADMAP.md` Phase A–P（跳過 E、M）、`ARCHITECTURE.md`、`DESIGN.md`、`PLANNING-METHOD.md`。
- **A1 完成（PR #1）**：repo 骨架、CI、每 PR 預覽 Worker、`main` CI 綠自動部署、`DEPLOY.md`、`RULES.md`；正式站 https://tku-arcade.genelee-pro.workers.dev 已上線。Cloudflare 已建 D1 `tku-arcade`／`tku-arcade-staging`、R2 `tku-arcade-assets`／`tku-arcade-backups`。
- **A3 完成（PR #2）**：`GameModule`、`match.ts`、Rng、井字棋範本、協定 v1、patch、harness、`npm run play`。
- **A2 完成（PR #3）**：token、深淺色、基礎元件、i18n、語言切換、`npm run budget`。字型暫用堆疊、未打包 web font。
- **A4 完成（PR #4）**：`RoomDO`、房間 API、回合引擎；在 PR 預覽（真的 Cloudflare）用真 socket 跑完一局井字棋。CI 沒有真實 DO 測試（`@cloudflare/vitest-pool-workers` 不支援 Vitest 5），`worker/room.ts` 的迴歸要靠手動跑。
- **C1 完成（PR #5，經擁有者同意 2026-11-06 排在 Phase B 之前）**：升官圖圖版 79 格、規則引擎、規則選項；在 PR 預覽用真的 `RoomDO` 跑完 2、3、4、6 人局。
- **下一批：B1**（大廳、暱稱、i18n 檢查）。
- C2／C3 注意：移動是跳格不是走格，`last` 給 `from`、`to`；`BOARD` 依官階排序、沒有座標，79 格在手機上要想排法；結算的 `score` 是官階 0–24，不是分數。改格子只能新增，id 存在進行中的局裡。
- e3-t07 規則頁注意：四面陀螺的形式與遊戲起源都沒查到定論，官名品級只做過少量查證，別寫成定論；圖版標示「簡化版」。遊戲長度 20–40 分鐘目標：5–6 人達到、4 人勉強、2–3 人未達，實際秒數 C2 後才量得到。
- 後面批次要接手的缺口：斷線的人永遠保留座位與房主（`e2-t05`、`e1-t05`）；離線旁觀者佔成員名額（上限 64）；`POST /api/rooms` 無速率限制（`e12-t06`）；房間不會自動清除（`e1-t10`）；暱稱去重（`e1-t03`）；公開／私人旗標未存（`e1-t09`）。`RoomView` 只能由已存狀態推導，改變一律走 `change()`，否則 diff 會漂移。
- **待擁有者**：`main` 分支保護尚未設（`DEPLOY.md` §3.3）。
- B1 大廳不可列出井字棋（範本，尚無隱藏旗標）。遊戲字串 `GAME_MESSAGES` 尚未併入 `src/i18n` 的字典，`check-i18n` 也要涵蓋。
- 尚無視覺稿、標誌、提案頁（LongTalk 與橋館有）；如需要，以 `docs/design/mockup.html` 補，不是必要條件。

## 2. 待擁有者決定（開工前）

| 問題 | 在哪一批之前 | 建議 |
| --- | --- | --- |
| ~~Q1 產品名稱~~ | — | 已拍板：TKU Arcade |
| ~~E7 瀏覽器語言自動切換~~ | — | 已拍板：初次依瀏覽器語言，之後以使用者為準 |
| Q2 帳號共用方式 | F1 | 牌桌簽 token、本站驗簽 |
| Q3 四款桌遊正式名稱 | G1 | 避開原作名稱與主題 |
| Q4 卡丁車視覺風格 | J1 | 低多邊形卡通 |
| Q5 AI 題目生成的模型與金鑰 | H2 | 沿用牌桌的 Anthropic SDK |
| Q6 真假朗讀站內語音 | I1 | 不做，用 LongTalk |

## 3. 工作方式（每批）

1. **在 worktree 開分支**：`git worktree add ../_wt/<分支> -b feat/<第一個 task 編號>-<slug>`。
2. **只讀需要的段落**：`CLAUDE.md`、這份、`ROADMAP.md` 的該批、該批 task 所在的 epic 段落、相關的 `ARCHITECTURE.md` 章節。不要整本讀。
3. **做完跑** `npm run lint && npm run typecheck && npm test && npm run build`，只看最後 5 行。
4. **一批一個 ready PR**：標題英文、結尾列出全部 task 編號；本文（繁中）寫對應 AC、怎麼驗證、實測結果（卡丁車多人要兩台裝置）。
5. **在同一個 PR 更新文件**：epic 勾選 task（寫 PR 號）、AC 勾選（有驗證才勾）、`PRD/README.md` 進度表、`ROADMAP.md` 該批 `[x]` 與 PR 號、這份「現在的位置」。
6. **CI 綠了直接合併**（`gh pr merge --squash --delete-branch`），需要人決定的事才停下來問。
7. 合併後回報：做了什麼、PR 號、下一批是哪一批、有沒有等人決定的事。

## 4. 不要做的事

- 不要重做規劃、不要改批次順序；覺得順序有問題就在回報裡說，讓擁有者改 ROADMAP。
- 不要在 JSX 寫裸字串；介面文字一律 `t('key')`，en 與 zh-TW 同時加。
- 不要加入任何原作（跑跑卡丁車、紙牌幫、腦洞量表、瞎掰王）的名稱當作自己的名稱、美術、題目文字、音樂、模型；不確定就看 `docs/PRD/01-legal-ip-analysis.md` §4。
- 不要把模型、貼圖、音檔 commit 進 repo（走 R2 與 `docs/ASSETS.md`）；小於 100 kB 的 SVG／PNG 圖示可以。
- 不要直接推 `main`、不要 force-push。
- 卡丁車多人（Phase L）在手感簽核（K3）之前不要開工。
