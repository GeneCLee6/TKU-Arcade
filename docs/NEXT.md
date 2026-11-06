# NEXT — 接下來怎麼做（給 AI 協作者與自己的交接手冊）

最後更新 2026-11-06（Phase A、Phase B、C1、D1、G1 完成，C2 進行中）。**完整順序在 [`ROADMAP.md`](ROADMAP.md)**（一批一個 PR）；這份只記「現在的位置」與工作方式。每完成一批就更新「現在的位置」；每個 AI session 開頭只需要讀 `CLAUDE.md` 和這一份。

## 1. 現在的位置

- **2026-11-03 規劃完成，尚未有程式碼。** 名稱拍板 **TKU Arcade**；GitHub `GeneCLee6/TKU-Arcade`（公開）；README 只寫英文。介面語言：預設英文、初次依瀏覽器語言自動切繁中（已拍板）。 總 PRD `docs/PRD/00-prd.md`、版權分析 `docs/PRD/01-legal-ip-analysis.md`、12 個 epic（124 個 task、70 條 AC）、`ROADMAP.md` Phase A–P（跳過 E、M）、`ARCHITECTURE.md`、`DESIGN.md`、`PLANNING-METHOD.md`。
- **A1 完成（PR #1）**：repo 骨架、CI、每 PR 預覽 Worker、`main` CI 綠自動部署、`DEPLOY.md`、`RULES.md`；正式站 https://tku-arcade.genelee-pro.workers.dev 已上線。Cloudflare 已建 D1 `tku-arcade`／`tku-arcade-staging`、R2 `tku-arcade-assets`／`tku-arcade-backups`。
- **A3 完成（PR #2）**：`GameModule`、`match.ts`、Rng、井字棋範本、協定 v1、patch、harness、`npm run play`。
- **A2 完成（PR #3）**：token、深淺色、基礎元件、i18n、語言切換、`npm run budget`。字型暫用堆疊、未打包 web font。
- **A4 完成（PR #4）**：`RoomDO`、房間 API、回合引擎；在 PR 預覽（真的 Cloudflare）用真 socket 跑完一局井字棋。CI 沒有真實 DO 測試（`@cloudflare/vitest-pool-workers` 不支援 Vitest 5），`worker/room.ts` 的迴歸要靠手動跑。
- **C1 完成（PR #5，經擁有者同意 2026-11-06 排在 Phase B 之前）**：升官圖圖版 79 格、規則引擎、規則選項；在 PR 預覽用真的 `RoomDO` 跑完 2、3、4、6 人局。
- **B1 完成（PR #6）**：大廳首頁、開新房、貼連結加入、暱稱（可修改）、伺服器端同房去重、`npm run check-i18n` 進 CI。井字棋用 `meta.unlisted` 藏起來；`GAME_MESSAGES` 已併入 `t()`，遊戲字串用 `t(`${game.meta.i18nKey}.name`)`。
- **B2 完成（PR #7）**：`useRoom()`（`src/lib/useRoom.ts`、`roomConnection.ts`：patch、rev 缺口 `resync`、錯誤 toast）、等待室（座位、換座、準備、複製連結與 QR、開始條件）。協定新增 `ready`（不升版、不擋開始）。
- **B3 完成（PR #8）**：房主控制（踢人、轉移、解散、再來一局、結束遊戲、離線 45 秒自動轉移）、換遊戲與規則選項表單、階段倒數（`timers`、DO alarm、`Countdown`）。協定新增訊息與關閉碼 4411／4412，不升版。`main` 分支保護已設（2026-11-06）：要 PR、`verify` 要過、禁 force-push 與刪除，對管理員也生效。
- **B4 完成（PR #9）**：聊天（移植 LongTalk、200 則、每 10 秒 10 則、`chatLocked`）、旁觀者（`ended` 可補位）、自動重連（退避 1、2、4、8、15、30 秒，放棄前試 5 分鐘）、`absent` 與房主跳過／代打（`cover`）。升官圖兩者都支援，井字棋都不支援；未決問題「等多久」採建議值：離線滿 45 秒（實際 45–60 秒）。
- **D1 完成（PR #10，經擁有者要求與 C2 平行進行）**：公開房列表（`LobbyDO`、首頁每 15 秒輪詢；建房時勾選才公開，預設私人）、房間清除（沒人 10 分鐘，或 `ended` 閒置 10 分鐘，共用同一條 alarm）、黑名單到期從儲存刪除、`POST /api/errors`（去個資、限大小與速率）、錯誤邊界與舊 chunk 自動重載、未知路徑頁、D1 骨架與第一個遷移、每日備份 cron 與還原文件（`DEPLOY.md` §10）。
- **G1 完成（PR #12，經擁有者同意 2026-11-06 排在 Phase F 之前）**：默契牌局 Silent Table（遊戲 id `silent-table`）的牌型引擎 `shared/poker/hand.ts`、規則引擎、規則選項、view 裁切；在 PR 預覽用真的 `RoomDO` 跑完整局。`meta.unlisted`，大廳與換遊戲選單都看不到，等 G2 的畫面。規則細節（連過歸零、每人每輪 5 次移動、ready 清除、平手、揭牌、缺席）與交給 G2 的事項（`chatLocked`、`timers`、皮膚選項、拿掉 `unlisted`）在 `docs/PRD/e4-coop-poker.md` 的設計方向。
- **下一批：C2 進行中**（升官圖畫面，平行）。
- D1 留下的缺口：比清除機制還舊、之後沒人再碰的房間不會被清（沒有 alarm，只佔一點儲存）。`ended` 閒置清除是這批的決定：結算畫面放著不動 10 分鐘，房間會消失、畫面變「找不到房間」。一個分頁開著不動的 `waiting` 或 `playing` 房不會被清（有人在），會一直有 15 秒的 alarm。公開與否只能在建房時決定，房內不能改，等待室也沒有標示（`e1-t15` 或 D2 再看）。`GET /api/lobby` 與 `POST /api/rooms` 一樣沒有速率限制（`e12-t06`）。真正的 cron 與寫入真 R2 只有合併後才會發生，合併隔天要看一次（`DEPLOY.md` §10）。AC-12.3 還差每日指標（`e12-t07`）。沒有正式遊戲用 `timers`，所以倒數與清除並存只在本機 workerd 用暫時的測試遊戲跑過，第一款用到的遊戲（G2／H2）仍要在預覽站實測。預覽站實測看到兩件沒查出原因、但不影響結果的事：Worker 日誌偶爾有一筆 `canceled` 的 alarm（和同時間 `ok` 的那筆成對，下一次掃描照常）；長時間連線的測試 socket 偶爾 1006 斷線（伺服器自己關的都是 44xx，瀏覽器會自動重連）。AC-1.1 的手機只用 375 px 模擬視窗看過，沒上真機（M0 實測時看）。
- B4 留下的缺口：聊天面板在手機上排在頁面很下面，抽屜在 C2（`e7-t04`）。真實手機休眠喚醒、真正斷網、注音輸入都沒在真機測過，M0 四人實測時順便看。離線旁觀者滿 45 秒會被移除，所以回來是新成員，先前「離線旁觀者佔名額」的問題解決了。重連中按按鈕只會跳提示，不會排隊送出。
- B3 留下的缺口：踢人黑名單只認 seat token，換瀏覽器或清 localStorage 就能回來（朋友圈可接受；同場 NAT 不適合擋 IP）。主動離開沒有專用訊息：房主按回大廳也要等 45–60 秒才轉移。**還沒有任何正式遊戲用 `timers`**，所以 alarm 觸發倒數只有單元測試（fake clock），第一款用到的遊戲（G2／H2）要在預覽站實測一次；同一條 alarm 路徑的自動轉移已在預覽站實測。換遊戲的選單目前只有升官圖（井字棋 unlisted）。
- C2 注意：`Countdown` 已在 `src/components/Countdown.tsx`，`e7-t04` 不用重做；`RoomInPlay` 是遊戲畫面出現前的佔位，成員列、房主動作、跳過／代打、補位要併進遊戲畫面的側欄。
- B2 留下的缺口：開局後還沒有遊戲畫面（C2）。
- `check-i18n` 的裸字串檢查只看 JSX 文字與 `aria-label`、`title`、`placeholder`、`alt`、`label` 的字面值，以及 `src/` 內所有 CJK；抓不到 `{'Hello'}`、`toast('Saved')`、條件式裡的字串，這些靠 AC-7.3 的人工走查。
- C2／C3 注意：移動是跳格不是走格，`last` 給 `from`、`to`；`BOARD` 依官階排序、沒有座標，79 格在手機上要想排法；結算的 `score` 是官階 0–24，不是分數。改格子只能新增，id 存在進行中的局裡。
- e3-t07 規則頁注意：四面陀螺的形式與遊戲起源都沒查到定論，官名品級只做過少量查證，別寫成定論；圖版標示「簡化版」。遊戲長度 20–40 分鐘目標：5–6 人達到、4 人勉強、2–3 人未達，實際秒數 C2 後才量得到。
- 後面批次要接手的缺口：斷線的玩家永遠保留座位，只有房主踢才會空出來；`POST /api/rooms` 無速率限制（`e12-t06`）。`RoomView` 只能由已存狀態推導，改變一律走 `change()`，否則 diff 會漂移。
- 尚無視覺稿、標誌、提案頁（LongTalk 與橋館有）；如需要，以 `docs/design/mockup.html` 補，不是必要條件。

## 2. 待擁有者決定（開工前）

| 問題 | 在哪一批之前 | 建議 |
| --- | --- | --- |
| ~~Q1 產品名稱~~ | — | 已拍板：TKU Arcade |
| ~~E7 瀏覽器語言自動切換~~ | — | 已拍板：初次依瀏覽器語言，之後以使用者為準 |
| Q2 帳號共用方式 | F1 | 牌桌簽 token、本站驗簽 |
| Q3 桌遊正式名稱（部分拍板）：合作撲克已定 **Silent Table／默契牌局**（2026-11-06）；Spectrum、Bluff Reader、Promotion 仍是暫名 | H1、I1 | 避開原作名稱與主題 |
| 默契牌局：「連過」要連續還是累計；每人每輪 5 次移動上限要不要留（`e4` 未決問題） | G2 | 先照 G1 的做法玩過再決定 |
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
