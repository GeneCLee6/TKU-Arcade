---
title: E1 — 大廳、身分與房間
date: 2026-11-03
status: planned
epic: E1
owner: GeneCLee6
milestones: [M0, M1]
depends_on: [E2, E7]
---

## 背景

大廳是整個站的門面：朋友拿到連結，要在 10 秒內知道「這裡有哪些遊戲、怎麼開一間、怎麼加入」。房間是所有遊戲共用的容器（誰在裡面、誰是房主、現在玩哪款、聊天），遊戲本身是 E2 的 `GameModule` 插件。做法沿用 LongTalk 的「連結就是入口」與牌桌的房主控制。

## 目標

- M0：大廳首頁、暱稱進場、建房／加入、等待室、房主控制、聊天、旁觀。
- M1：選用帳號（淡江牌桌 session）、語音連結（LongTalk）、公開房列表的篩選。

## 非目標

- 自己的帳號系統（共用牌桌的，§設計方向）。
- 好友、戰績、排行（E11）。
- 配對（matchmaking）與陌生人配對：只有朋友圈，房間用連結分享。

## 需求

- **大廳首頁**：每款遊戲一張卡片（圖示、名稱、人數、一局時間、一句話規則、「開新房」）；「有連結就加入」輸入框；「正在等人的公開房」列表（遊戲、房主暱稱、人數、加入）；右上角語言切換與（M1）登入。
- **暱稱**：第一次進站或建房時輸入（1–16 字，去掉控制字元與空白頭尾）；存 localStorage；同房重複自動加「(2)」；登入者用帳號暱稱且不可改。
- **房間**：`/r/<room-id>`（10 碼 base58，沿用 LongTalk `shared/room-id.ts` 的做法）；屬性：遊戲 id、人數上限、公開／私密、規則選項（由 GameModule 宣告）、房主、座位、旁觀者；狀態 `waiting → playing → ended → waiting`；最後一人離開 10 分鐘後 DO 清除。
- **等待室**：列出已進來的人、座位、準備狀態；房主「開始」按鈕在人數達到 GameModule 的 `minPlayers` 才可按；可複製連結與 QR code（沿用牌桌的 `qrcode-generator`）。
- **房主控制**：開始、踢人（被踢者 5 分鐘不能回來）、換遊戲（回到 waiting，清掉局面）、再來一局（保留座位）、轉移房主、解散；房主離開時自動把房主交給最早進來的玩家。
- **聊天**：文字 ≤ 500 字、連結可點、保留 200 則、每人每 10 秒 10 則（沿用 LongTalk `shared/chat.ts`）；局內 GameModule 可宣告 `chatLocked`（默契牌局在暗示回合禁聊）。
- **旁觀**：房間滿或遊戲進行中時以旁觀者進入；看得到 `view('spectator')`；可聊天；遊戲結束後可補位。
- **選用帳號（M1）**：「用淡江帳號登入」→ 轉到牌桌的登入 → 回來帶一個牌桌簽的短效 token → 本站 Worker 驗簽（公鑰或共用 secret）→ 發本站 session；登入者暱稱固定、戰績入 D1（E11）。
- **語音連結（M1）**：等待室「開語音」→ 呼叫 LongTalk 的 `POST /api/rooms` 建一間並把連結貼進聊天；LongTalk 不可用時隱藏按鈕。

## 設計方向

- 大廳不需要 DO：遊戲清單是靜態的（`shared/games/catalog.ts`），公開房列表由 `LobbyDO`（單一實例）維護，各 `RoomDO` 在狀態變化時通知它（alarm 保活，10 分鐘沒心跳就移除）。
- 路由：`/`（大廳）、`/r/<id>`（房間）、`/games/<id>/rules`（規則頁，E7）、`/me`（M1 戰績，E11）。
- 進房流程：`GET /api/rooms/<id>` 先拿房間摘要（遊戲、人數、是否可加入）→ 輸入暱稱 → WebSocket `/ws/<id>?v=1`。
- 帳號：**不複製牌桌的帳號程式**；只做 token 驗證（`worker/auth.ts`）。牌桌那邊要加一個「對外簽 token」的端點（牌桌 repo 的 task，記在 §未決問題）。
- **F1 定案的細節**（#20，2026-11-09；全文在 `ARCHITECTURE.md` §6）：
  - 帳號在介面上叫「**Overtrick 帳號**」（牌桌的平台名，只有英文）；牌桌只讓**淡江的社員**用（牌桌 PR #331 的決定，等擁有者確認）。
  - token 走網址的 `#`，頁面讀到就拿掉、POST 給 Worker；state 放在本站的 HttpOnly cookie、牌桌簽回，擋登入 CSRF；`jti` 存 D1 `auth_token_uses`（`migrations/0002`），同一個 token 只能用一次。
  - session 是簽過的 cookie（`__Host-arcade_session`，30 天），鑰匙從共用 secret 衍生；沒有伺服器端撤銷，換金鑰會讓所有人登出。
  - 暱稱固定在伺服器：WebSocket 升級時 Worker 讀 session、帶 `X-Arcade-Account` 給房間，`RoomHost.join` 用帳號的名字、不看 `join.name`；同房「(2)」照舊。訪客帶 seat token 回來時已登入：座位不變、名字換成帳號的。
  - 登入的人在大廳看到「你的暱稱：X（Overtrick 帳號）」與「登出」、沒有「修改」；進房不問暱稱。沒登入時「用 Overtrick 登入」在大廳最下面與房間的暱稱步驟（不放頂欄、不放遊戲上面，手機版面的規則）。
  - **沒設 `AUTH_SHARED_SECRET` 就什麼都沒有**（`/api/me` 回 `configured: false`），所以可以先合併。打開與換金鑰的步驟在 `DEPLOY.md` §11。

## 驗收條件

- [x] AC-1.1 — 大廳首頁：遊戲卡片、開新房、加入連結、公開房列表（有 LobbyDO 更新）；雙語；手機可用。
- [x] AC-1.2 — 暱稱：長度與字元限制、本機記住、同房去重。
- [x] AC-1.3 — 房間生命週期：建房、進房、狀態轉換、10 分鐘後清除（DO alarm 測試）。
- [x] AC-1.4 — 房主控制：開始、踢人、換遊戲、再來一局、轉移、解散、房主離開自動轉移。
- [x] AC-1.5 — 聊天：200 則、速率限制、連結、`chatLocked`。
- [x] AC-1.6 — 旁觀：旁觀者視角、補位。
- [ ] AC-1.7 — 選用帳號：牌桌 token 驗簽、本站 session、暱稱固定。
- [ ] AC-1.8 — 語音連結：一鍵建 LongTalk 房並貼連結。

## Task 拆分

### M0

- [x] `e1-t01` `shared/room-id.ts`、`RoomDO` 骨架（成員、座位、房主、狀態機）、`POST /api/rooms`、`GET /api/rooms/:id` · AC-1.3 · M · ← e12-t01 · #4
- [x] `e1-t02` 大廳首頁：遊戲卡片（讀 `shared/games/catalog.ts`）、開新房流程、加入連結輸入 · AC-1.1 · M · ← e1-t01, e7-t01 · #6
- [x] `e1-t03` 暱稱輸入、localStorage、去重、`join` 訊息 · AC-1.2 · S · ← e1-t01 · #6
- [x] `e1-t04` 等待室：成員列、座位、準備、複製連結與 QR、開始按鈕條件 · AC-1.3 · M · ← e1-t03 · #7
- [x] `e1-t05` 房主控制：開始、踢人（5 分鐘黑名單）、再來一局、轉移、解散、自動轉移 · AC-1.4 · M · ← e1-t04 · #8
- [x] `e1-t06` 換遊戲：回 waiting、清局面、規則選項表單由 GameModule 的 `options` schema 產生 · AC-1.4 · S · ← e1-t05, e2-t01 · #8
- [x] `e1-t07` 聊天：移植 LongTalk `shared/chat.ts`、面板、`chatLocked` · AC-1.5 · S · ← e1-t04 · #9
- [x] `e1-t08` 旁觀者：進房分流、`view('spectator')`、補位 · AC-1.6 · S · ← e2-t03 · #9
- [x] `e1-t09` `LobbyDO`：公開房列表、RoomDO 回報、alarm 清理、首頁輪詢或 WebSocket · AC-1.1 · M · ← e1-t01 · #10
- [x] `e1-t10` 房間 10 分鐘清除 alarm 與測試；被踢黑名單過期 · AC-1.3 · S · ← e1-t05 · #10

### M1

- [ ] `e1-t11` 牌桌 repo：對外簽發短效 token 的端點（記在牌桌 ROADMAP） · AC-1.7 · S（牌桌 PR GeneCLee6/TKU-BridgeTable#331，牌桌的 `e1-t37`、ROADMAP O7；等擁有者審核合併、設 secret，正式站整條流程通了才勾）
- [x] `e1-t12` 本站 `worker/auth.ts` 驗簽、session cookie、`/api/me` · AC-1.7 · M · ← e1-t11 · #20
- [x] `e1-t13` 前端登入按鈕、回跳、登入者暱稱固定 · AC-1.7 · S · ← e1-t12 · #20
- [x] `e1-t14` 語音連結：呼叫 LongTalk 建房、貼聊天、不可用時隱藏 · AC-1.8 · S · ← e1-t07 · I3（#46）：service binding
- [x] `e1-t15` 公開房列表篩選（遊戲、人數）與「隨機加入一間」 · AC-1.1 · S · ← e1-t09 · I3（#46）：人數是「至少幾個空位」
- [x] `e1-t16` 房間密碼（私密房可選） · AC-1.3 · S · ← e1-t04 · I3（#46）

## 風險與對策

| 風險 | 對策 |
| --- | --- |
| 牌桌的帳號端點要改牌桌 repo | M0 不做帳號；M1 開工前在牌桌開一個 S task |
| 公開房列表被陌生人看到 | 列表預設只顯示「公開」房；私密房只能用連結；M4 之後若對外再加登入門檻 |

## 未決問題

- [x] **Q:** 帳號共用方式（總 PRD Q2）。
      **A:** 2026-11-09 擁有者拍板：牌桌簽 token、本站驗簽。
