---
title: E2 — 遊戲框架與即時引擎
date: 2026-11-03
status: planned
epic: E2
owner: GeneCLee6
milestones: [M0, M1]
depends_on: [E12]
---

## 背景

這個站要一直加遊戲，所以第一件事不是做遊戲，是做「遊戲怎麼接進來」。牌桌的做法（`shared/` 純函式引擎、`worker/views.ts` 依座位裁切可見資訊、DO 執行狀態機、前端只呈現）已經證明可行，這裡把它抽象成一個 `GameModule` 介面，讓每款桌遊只寫規則與畫面。卡丁車（E8–E9）是即時遊戲，不走回合制的 reduce，但房間、座位、結果、重播仍共用這一層。

## 目標

- M0：`GameModule` 介面定稿、`RoomDO` 執行引擎、協定 v1、重連、旁觀視角、結果畫面、模組測試工具。
- M1：戰績寫入、重播（回合制遊戲的動作序列）、即時遊戲的 `RealtimeModule` 延伸介面骨架。

## 非目標

- 卡丁車的同步協定（E9）。
- 反作弊（朋友圈）。
- 跨房間的賽事（M4 之後再議）。

## 需求

- **GameModule 介面**（`shared/games/types.ts`）：

  ```ts
  interface GameModule<S, A, V, O> {
    id: string;                      // 'promotion' | 'heist' | …
    meta: { minPlayers; maxPlayers; minutes; i18nKey };
    options: OptionsSchema<O>;       // 房主可設定的規則選項（產生表單）
    init(seats: Seat[], options: O, rng: Rng): S;
    reduce(state: S, action: A, seat: SeatId, rng: Rng): S | GameError;
    view(state: S, viewer: SeatId | 'spectator'): V;   // 依座位裁切
    legalActions(state: S, seat: SeatId): A[];          // 給前端顯示可按的按鈕、給測試用
    isOver(state: S): boolean;
    result(state: S): GameResult;    // 名次、分數、每人一句話
    timers?(state: S): TimerSpec[];  // 需要倒數的階段（真假朗讀、光譜猜題）
    chatLocked?(state: S): boolean;
  }
  ```

  全部純函式、可在 Node 跑、不依賴 DOM；`rng` 是可種子化的，重播與測試用同一顆種子。
- **RoomDO 執行引擎**：收到 `action` → 驗座位與回合 → `reduce` → 存 state（每次一個 storage key，hibernation 後仍在）→ 對每個連線送 `view(seat)` 的 diff（沿用 LongTalk `shared/patch.ts`）→ `isOver` 時送 `result` 並轉 `ended`。
- **協定 v1**（`shared/protocol.ts`）：`welcome`（座位、房間摘要、語言無關的 state view）、`snapshot`、`patch`、`action`、`error`、`timer`、`chat`、`ping/pong`；版本號在 query string。
- **重連**：客戶端保存 `seatToken`；斷線後指數退避重連；DO 在 45 秒內允許同 token 回到同座位；超過則座位標示「離線」，房主可踢或等；回合制遊戲在離線者的回合可由房主「跳過」或「代打隨機合法動作」（由 GameModule 的 `options` 決定是否允許）。
- **結果畫面**：名次、分數、每人一句話（GameModule 提供 i18n key）、再來一局、回大廳；登入者戰績寫 D1（M1，E11）。
- **重播（M1）**：DO 保存動作序列與種子；`GET /api/rooms/:id/replay` 回傳；前端以同一個 reduce 逐步重放。
- **模組測試工具**：`tests/games/harness.ts`：給 seats、options、種子、動作序列，斷言 state 與 view；每款遊戲至少一個「完整一局」測試；`npm run play -- <game>` 在終端機用 legalActions 隨機玩完一局（煙霧測試）。
- **RealtimeModule（M1 骨架）**：`tick(state, inputs, dt)`、`snapshot`、`authoritativeEvents`；E9 再填。

## 設計方向

- 資料夾：`shared/games/<id>/{rules.ts, types.ts, i18n.ts}`、`src/games/<id>/{Board.tsx, …}`、`shared/games/index.ts` 登記表。前端依 `id` 動態 `import()` 畫面（JS 預算）。
- RoomDO 每房一個（沿用牌桌 H1 拆 DO 的結論），SQLite storage。
- 錯誤：`GameError` 回給動作者，不廣播；協定錯誤關連線。

## 驗收條件

- [ ] AC-2.1 — `GameModule` 介面定稿並有文件；升官圖以此介面實作；加一款假遊戲（井字棋）當範本與測試。
- [ ] AC-2.2 — RoomDO 執行引擎與協定 v1：action→reduce→view diff；hibernation 後狀態仍在；非法動作回 error 不廣播。
- [ ] AC-2.3 — 重連：45 秒內回同座位；離線標示；房主跳過／代打。
- [ ] AC-2.4 — 結果畫面與（M1）戰績寫入。
- [ ] AC-2.5 — 重播：動作序列＋種子重放與原局一致（測試）。
- [x] AC-2.6 — 測試工具：harness 與 `npm run play`。

## Task 拆分

### M0

- [x] `e2-t01` `GameModule` 型別、`OptionsSchema`、`Rng`（seedable）、井字棋範本模組與測試 · AC-2.1 · M · ← e12-t01 · #2
- [x] `e2-t02` 協定 v1 型別與 `shared/patch.ts` 移植 · AC-2.2 · S · ← e2-t01 · #2
- [ ] `e2-t03` RoomDO 執行引擎：action 驗證、reduce、per-seat view diff、storage、`isOver` · AC-2.2 · L→拆：t03a 引擎、t03b storage 與 hibernation 測試 · ← e1-t01, e2-t02
- [ ] `e2-t04` 前端 `useRoom()`：WebSocket、snapshot/patch 套用、action 送出、錯誤 toast · AC-2.2 · M · ← e2-t03
- [ ] `e2-t05` 重連：seatToken、退避、離線標示、房主跳過／代打 · AC-2.3 · M · ← e2-t04
- [ ] `e2-t06` 結果畫面、再來一局、回大廳 · AC-2.4 · S · ← e2-t04
- [x] `e2-t07` `tests/games/harness.ts`、`npm run play` 煙霧測試 · AC-2.6 · S · ← e2-t01 · #2
- [ ] `e2-t08` `timers`：DO alarm 驅動的階段倒數、`timer` 訊息、前端倒數元件 · AC-2.2 · S · ← e2-t03

### M1

- [ ] `e2-t09` 動作序列與種子保存、`/replay` 端點、前端重放器 · AC-2.5 · M · ← e2-t03
- [ ] `e2-t10` 戰績寫入 D1（結果→`results` 表；登入者才寫） · AC-2.4 · S · ← e1-t12, e12-t05
- [ ] `e2-t11` `RealtimeModule` 介面骨架與文件（E9 用） · — · S
- [ ] `e2-t12` 遊戲畫面動態載入與 JS 預算分 chunk · — · S · ← e12-t03

## 風險與對策

| 風險 | 對策 |
| --- | --- |
| 介面設計太早定、第二款遊戲就不合用 | 井字棋＋升官圖兩款先驗證；M1 第一款桌遊開工前允許一次 breaking change（協定 v2） |
| view diff 洩漏隱藏資訊 | view 是唯一出口；測試用 harness 斷言旁觀者 view 不含手牌 |

## 未決問題

- [ ] **Q:** 離線者的回合預設「等」還是「代打」？
      **A:** _(建議預設等 60 秒後房主可跳過；代打只給升官圖這類無決策的遊戲)_
