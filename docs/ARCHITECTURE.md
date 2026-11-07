# ARCHITECTURE — 技術架構（規劃版，2026-11-03）

這份在 A1 之後會隨實作更新；現在是設計方向。原則：**能沿用淡江牌桌與 LongTalk 的就沿用**，新東西只有三個：`GameModule` 插件介面、雙語 i18n、卡丁車（three.js＋自主模擬同步）。

## 1. 總覽

```
瀏覽器（React 19 + TS + styled-components + Vite）
  ├─ 大廳 /            ─ 靜態遊戲清單 + LobbyDO 的公開房列表
  ├─ 房間 /r/<id>      ─ WebSocket → RoomDO；畫面依 GameModule 動態載入
  ├─ 卡丁車（房間內） ─ three.js 場景（React 之外的遊戲迴圈）+ HUD（React）
  └─ i18n t()         ─ en 來源、zh-TW 翻譯、localStorage 記住
            │ /api/*、/ws
Cloudflare Worker（單一，帶靜態資產）
  ├─ LobbyDO（單例）   ─ 公開房列表、房間心跳、alarm 清理
  ├─ RoomDO（每房一個，SQLite storage）
  │     ├─ 回合制：GameModule.reduce → per-seat view diff
  │     └─ 即時（kart）：RealtimeModule：廣播 state、裁定 pickup/hit/lap/finish
  ├─ D1  ─ prompts（題庫）、results（戰績）、friends、achievements、seasons、polls、unlocks
  ├─ R2  ─ ASSETS（glTF、貼圖、音效，雜湊檔名、長快取）、BACKUPS
  ├─ auth ─ 驗淡江牌桌簽的 token → 本站 session（M1）
  └─ cron ─ D1 備份、成本統計、警示
外部：淡江牌桌（帳號 token）、LongTalk（語音房連結）、Anthropic API（題目草稿，Worker 端）
```

## 2. 資料夾（預定）

```
shared/                 前後端共用、純 TS、可在 Node 測
  protocol.ts           協定 v1（welcome/snapshot/patch/action/error/timer/chat/ping）
  patch.ts              diff 推送（移植 LongTalk）
  room-id.ts            10 碼 base58（移植 LongTalk）
  chat.ts               聊天限制（移植 LongTalk）
  games/
    types.ts            GameModule / RealtimeModule / OptionsSchema / Rng
    index.ts            遊戲登記表（id、meta、lazy 畫面）
    tictactoe/          範本（測試用）
    promotion/          升官圖：board.ts、rules.ts、i18n.ts、rules.en.md、rules.zh-TW.md
    silent-table/         默契牌局：rules.ts、types.ts、i18n.ts
    spectrum/ bluff/      兩款桌遊（暫名）
  poker/hand.ts         牌型引擎
  kart/                 physics.ts、clock.ts、i18n.ts（J1 已有）；track.ts、input.ts、ghost.ts、net.ts、karts.ts、unlocks.ts
worker/
  index.ts              路由、靜態資產、/api、/ws
  lobby.ts              LobbyDO（邏輯在 lobby-board.ts）
  errors.ts             POST /api/errors：大小與速率上限，寫進 Worker 日誌
  backup.ts             每日 cron：D1 匯出到 R2（DEPLOY.md §10）
  room.ts               RoomDO（引擎與 realtime 分檔：room-turn.ts、room-realtime.ts）
  auth.ts               token 驗簽、session
  prompts.ts            題庫 API 與 AI 草稿
  results.ts            戰績、排行
  assets.ts             R2 讀取（通常由 Cache 直出）
src/
  i18n/                 en.ts、zh-TW.ts、t.ts、useT.ts
  styles/tokens.ts      顏色與間距的唯一來源
  lib/                  瀏覽器工具（storage 等）
  components/           基礎元件
  pages/                Lobby、Room、Rules、Me、Admin
  games/screens.ts      遊戲畫面登記表（gameId → lazy 畫面）；沒登記的遊戲只有房間面板
  games/<id>/           每款遊戲的畫面（lazy）；用 components/GameLayout 放進房間（寬螢幕右欄、手機抽屜）
  kart/                 Scene、spikeLoop、keyboard、SpikePage（J1 已有）；Renderer、Hud、Tune（調參面板）
scripts/                check-budget、check-i18n、check-assets、assets/upload、kart/build-track、seed
tests/                  games/harness.ts、每款遊戲的完整一局、worker 測試、browser（Playwright）
docs/                   本資料夾
```

## 3. GameModule（回合制）

- 純函式：`init / reduce / view / legalActions / isOver / result / timers? / chatLocked?`；`rng` seedable；全部不碰 DOM。
- RoomDO 是唯一執行者：收 `action` → 驗座位與合法性 → `reduce` → 存 state → 對每個連線算 `view(seat)` 的 diff → 推送。隱藏資訊只能透過 `view` 裁切（牌桌 `views.ts` 的做法）。
- 重播＝動作序列＋種子，用同一個 `reduce` 重放。
- 新遊戲＝`shared/games/<id>/` ＋ `src/games/<id>/` ＋ 登記表一行 ＋ harness 測試一局 ＋ 規則頁兩份 md ＋ i18n 兩份。

### 怎麼寫一款新遊戲（A3 起已實作）

介面的完整說明在 `shared/games/types.ts` 的註解；照抄 `shared/games/tictactoe/`（`types.ts`、`rules.ts`、`i18n.ts`）開始。

- **型別**：state、action、view 都是可 JSON 化的 `type` 別名（不用 `interface`，否則無法指定給 `JsonValue`）；不放 `undefined`、`Map`、`Date`、class。
- **`reduce` 是裁判**：`action` 來自網路，靜態型別不算數；要在執行時檢查形狀、輪到誰、規則，錯了回 `gameError('i18n key')`，不丟例外、不改舊 state。
- **`view` 是唯一出口**：隱藏資訊在這裡裁切；`legalActions`、`result` 也會送到瀏覽器，同樣不能洩漏。
- **`legalActions`**：能列舉就全列；自由輸入（提示文字、刻度）列幾個樣本即可，`reduce` 要接受每一個。
- **隨機**：只用傳入的 `rng`。Rng 的位置由平台存在 state 旁邊（`Match.rngState`），不進 state，所以不可能經 view 外洩；動作被拒時位置也不會前進。
- **計時**：`timers(state)` 只宣告「id、多久、到時的 action」；時鐘由 RoomDO 管，到時以 `actor: 'system'` 走 `reduce`。id 消失就取消，要重新倒數就換 id（如 `clue-3`）。瀏覽器送的動作永遠不會是 `system`。
- **規則選項**：`options` 宣告欄位（`boolean`／`int`／`select`），房主表單由此產生，房主的值由 `parseOptions` 檢查；`init` 之後還要用的選項自己抄進 state。
- **文字**：模組只送 i18n key（`TextRef`），字串放 `shared/games/<id>/i18n.ts`，key 為 `games.<id>.*`，登記到 `GAME_MESSAGES`。

執行的程式都在 `shared/games/match.ts`：`startMatch`、`applyAction`、`projectGame`（一個 viewer 會收到的全部內容，即協定的 `RoomView.game`）、`replayMatch`。RoomDO、重播與測試共用，所以測到的就是實際跑的。

測試用 `tests/games/harness.ts` 的 `playRandom(module, { seed, secrets })`：隨機玩完一局，每一步檢查 JSON、patch 可重建、不丟例外、不改 state、合法動作都被接受、垃圾動作與別人的動作都被拒、`secrets` 沒出現在該 viewer 收到的內容裡、會在步數上限內結束；最後檢查同種子同一局、種子＋動作重播結果相同。終端機煙霧測試：`npm run play -- <game> [--seed n] [--seats n]`。

### 房間與引擎（A4 起已實作）

- 分層：`worker/rooms.ts`（`POST /api/rooms`、`GET /api/rooms/:id`、`/ws/<id>`）→ `worker/room.ts`（`RoomDO`：只接 Cloudflare 的 storage、alarm、hibernation WebSocket）→ `worker/room-host.ts`（`RoomHost`：成員、座位、房主、狀態機，不依賴 Cloudflare，測試直接跑）→ `worker/room-turn.ts`（包 `match.ts`，接住模組丟出的例外）。
- 儲存：`room`、`members`、`rev`、`game`（整個 `Match`＋種子、座位、選項）各一個 key，動作紀錄每步一個 key（`step:000000000000`），給 e2-t09 重播。同一次變更的寫入之間沒有 `await`，DO 會一起提交，且寫入完成前不送出訊息。
- Diff 不存「每條連線上次送了什麼」：hibernation 會清掉記憶體，而所有已加入的連線都在同一個 `rev`、view 又是儲存內容的純函式，所以每次變更都當場算每個 viewer 的前後 view 再 diff。每個 `rev` 每條連線都收到一個 patch（可能是空的），所以 rev 有缺口就代表真的掉訊息。
- 模組丟例外：動作回 `game_failed`、局面不變；新局面若有任何 viewer 算不出 view，該動作也不接受。已存的局面算不出 view 時送 `game: null`，絕不送原始 state。
- 心跳：`ping` 由 runtime 自動回 `pong`，不喚醒 DO；有連線時 alarm 每 15 秒掃一次，所以 45 秒無心跳實際在 45–60 秒間關閉，10 秒未 `join` 在 10–25 秒間關閉。
- 一個 DO 只有一條 alarm：`RoomHost.nextAlarm()` 取「15 秒掃描、最早的遊戲倒數、清除時間」三者最小值，`RoomDO.syncAlarm` 只在時間有變時才寫；到時間一律進 `sweep()`，它自己看哪些工作到期。
- 清除（e1-t10）：`RoomRecord.emptySince`（沒有任何 socket 開著的起點）與 `idleSince`（`ended` 時最後一次有動靜的時間；聊天、換座、重連都算，`resync` 與心跳不算）。任一個滿 `ROOM_CLEANUP_MS`（10 分鐘）就 `wipe`：留著的 socket 以 `CloseCode.roomNotFound` 關閉，`storage.deleteAll()`。兩個值存進 `room` 是因為休眠後不能重算；它們不進 `RoomView`，所以不走 `change()`、不動 `rev`。`settleCleanup()` 是唯一調整它們的地方，每個入口結束時呼叫。比這個機制還舊的房間沒有 alarm：下次被喚醒時（`GET /api/rooms/:id` 或連線）`restore` 才開始計時並寫入，從沒人再碰的舊房間會一直留在儲存空間。踢人黑名單由 `isBanned` 比對到期時間，`sweep()` 另外把過期的從儲存刪掉。
- 公開房（e1-t09）：`RoomRecord.public` 只在建房時設定（`POST /api/rooms` 的 `public: true`，其他值都算私人；舊房間沒有這欄就是私人），不進 view。`RoomHost.listing()` 由已存狀態推導：公開、`waiting`、有房主、有人在線、還有空座位才上榜。`RoomDO.syncLobby` 每個事件後比對上次回報（存在 `lobby` key，私人房永遠沒有這個 key），有變化或滿 `LOBBY_HEARTBEAT_MS`（4 分鐘）才以 RPC 告訴 `LobbyDO`，不等結果，失敗就下一次事件或掃描重試。`LobbyDO`（`worker/lobby.ts` 接 Cloudflare，`worker/lobby-board.ts` 是邏輯）每房一個 key，`LOBBY_TTL_MS`（10 分鐘）沒回報就移除，房間刪除時的回報掉了也會自己消失；最多追蹤 200 間，`GET /api/lobby` 最多回 50 間、新的在前。首頁每 15 秒輪詢，分頁隱藏時暫停。列表只公開遊戲、房主暱稱與人數。
- 倒數：執行中的倒數存在 `StoredGame.timers`（到期時間存絕對時間，和局面一起存、一起換），alarm 取最早的倒數與 15 秒掃描的較小值，所以休眠、重啟都照原時間觸發。到期先標 `spent` 再以 `actor: 'system'` 走 `reduce`，並進動作紀錄；模組拒絕或丟例外也不會重複觸發，state 還列著同一個 id 時也不會重新開始（要新的倒數就換 id）。瀏覽器只收剩餘毫秒數，再用自己的 `performance.now()` 換算。
- 聊天：每則一個 key（`chat:000000000000`），醒來時用 `list` 讀回；不進 `RoomView`、不動 `rev`，`welcome` 之後一定送一次 `reset`（空的也送），重連的瀏覽器才會丟掉舊清單。速率限制只在記憶體，休眠忘掉只會讓人早點能送。
- 離線：斷線當下 `online: false`；掃描發現超過 `RECONNECT_GRACE_MS` 才標 `absent`，並存起來，因為 view 只能由已存狀態推導。`RoomView.coverable` 由 `absent`、空座位和 `legalActions` 推導。代打的隨機選擇不用遊戲的 Rng，選到的動作照常進動作紀錄，重播因此一致。
- 房主控制：黑名單存在 `RoomRecord.bans`（seat token 與到期時間，不進 view），`join` 時比對；解散呼叫 `storage.deleteAll()`。房主離線 `RECONNECT_GRACE_MS` 後由 alarm 的掃描轉給最早進來、在線的成員，有座位的優先；回來不會還給他。
- 路徑以 `/ws/<id>?v=1`（`shared/protocol.ts`）為準，不是 E1 寫的 `/api/rooms/<id>/ws`。
- 錯誤（e12-t04）：`src/App.tsx` 的 `ErrorBoundary` 包住所有路由（含懶載入），`src/lib/errorReport.ts` 另外接 `window` 的 `error`、`unhandledrejection`，都送 `POST /api/errors`。舊分頁載不到舊 chunk 時（SPA fallback 回 HTML，瀏覽器拒絕當模組）自動重新載入一次，60 秒內不再自動重試，改顯示按鈕。端點沒有登入：Origin 要同站、每個 Worker instance 每分鐘每 IP 10 則、總共 120 則（只在記憶體，不精確，也不寫儲存）、8 kB 上限；`shared/client-error.ts` 去掉引號內文字、房號、token、email、query，IP 不寫進日誌。
- 前端（B2 起）：`src/lib/roomConnection.ts` 管一條 socket（`join`、心跳、rev 與 patch、缺口時 `resync`），`src/lib/useRoom.ts` 把它接進 React 並把 `error` 轉成 toast。畫面只讀 `view`，送出只走 `useRoom()` 的函式。
- 準備狀態（`RoomMember.ready`）只是告知，不擋 `start`：E1 的開始條件只有人數。離座與開局會清掉。這是向後相容的新增，所以 `PROTOCOL_VERSION` 不變。

## 4. 卡丁車（即時）

- **物理在客戶端**：`shared/kart/physics.ts` 固定 60 Hz 步長、純函式；每台車由自己的瀏覽器模擬。
- **伺服器只轉送與裁定**：RoomDO 收 20 Hz 的二進位 `state`（≤ 40 bytes），廣播給其他人，保留最後已知狀態；用檢查點裁定圈數與名次；道具拿取與命中由伺服器用最後已知狀態裁定並廣播；合理性檢查擋離譜值（擋 bug，不是反作弊）。
- **其他車**：100 ms 緩衝插值，缺包外推 ≤ 200 ms。
- **為什麼不做伺服器權威物理**：DO 跑 60 Hz 物理對免費額度與延遲都不划算，朋友圈不需要；若未來要對外開放再評估（記在 E9 未決）。
- **渲染**：three.js 直接用，遊戲迴圈在 React 之外；React 只管 HUD、選單；卡丁車 chunk 獨立 lazy。
- **資產**：glTF 放 R2，內容雜湊檔名、`Cache-Control: immutable`；賽道 JSON 由 Blender 命名慣例＋腳本產生。


### 4.1 J1 spike 的數字（`e8-t01`，PR #15）

`/kart/spike`：three.js 基本幾何的方塊車在平地上開，只回答「這套技術在瀏覽器撐不撐得住、有多大」。**手感好不好不在這裡回答**，AC-8.3、AC-8.8 都沒勾。

| 項目 | 數字 |
| --- | --- |
| three.js | `0.186.1`（MIT，`package.json` 釘死版本；2026-09-24 發布。`0.187.0` 當時才 8 天，沒用）。`@types/three` `0.186.0` 只在開發用 |
| 卡丁車 chunk（含 three.js） | **135.7 kB** gzip（預算 600 kB），未壓縮 542 kB。`npm run budget` 只算主站沒載入的部分；主站已有的 React 等不重算 |
| 主站首屏，加 spike 前 → 後 | 119.9 → **119.7 kB**（預算 150 kB） |
| 升官圖首屏，加 spike 前 → 後 | 149.4 → **149.2 kB**（預算 150 kB） |
| 物理一步 | 約 0.09 µs（Node，5 百萬步平均），固定 60 Hz 下可忽略 |

- 主站沒有變大，但也不是「變小了 0.2 kB」：打包器移動了 chunk 邊界（`_protocol` 併進入口 chunk、Button 拆成自己的 chunk），分開壓縮的總和因此變動。真正新增的是路由一行、`registerMessages`、`kartScene` 幾個色碼，小到被這個變動蓋過。
- **加進主站的東西要小心**：spike 第一版直接用 `VisuallyHidden`、`useMediaQuery`，打包器把它們拆成共用 chunk，升官圖首屏就變成 149.7 kB。所以 spike 頁不用這兩個。**升官圖首屏在 `origin/main` 就已經是 149.4 kB，只剩 0.6 kB**（`NEXT.md` 記的 146 kB 是 G1 以前的）。
- 卡丁車的字串在 `shared/kart/i18n.ts`，由 lazy chunk 註冊進 `t()`（`registerMessages`），`check-i18n` 比對兩語，不佔首屏。以後卡丁車的字串都放這裡。
- three.js 的顏色：WebGL 材質讀不到 CSS 變數，所以用 `tokens.ts` 的 `kartScene`（兩個主題相同的固定值）。刻意用中性的顏色，不代表視覺風格。
- 打包後的 chunk 不含 three.js 的授權聲明（壓縮時拿掉了，其他相依也一樣）。MIT 要求保留聲明，朋友圈站風險低，但要對外前該補（例如輸出一份授權清單）。

**fps**（2026-11-07，PR 預覽站 commit `f1fae11`，Playwright 無頭 Chromium，機器 Intel i5-14500、內顯 UHD Graphics 770，靜止與甩尾各量 5 秒，1280×720 與 375×667 @2x；同一台機器同時有別的工作在跑，軟體繪圖的數字會跟著飄）：

| 繪圖器 | 1280×720 | 750×1334（手機尺寸 @2x） | 這個數字代表什麼 |
| --- | --- | --- | --- |
| SwiftShader（軟體繪圖） | 42–52 fps（最慢一格 33–50 ms） | 42–50 fps（最慢一格 33–50 ms） | **不是任何真實裝置的數字**，只是沒有 GPU 時的參考。這個繪圖器也畫不出斜的格線（截圖上地面幾乎是素色），內顯上正常 |
| Intel UHD 770（D3D11，無頭模式） | 60 fps（最慢一格 17 ms） | 60 fps（最慢一格 17 ms） | 被 vsync 鎖在 60，看不出餘裕；是桌機內顯，也不是筆電或手機 |
| 真實筆電（擁有者填） | | | 開 `/kart/spike?fps=1` 或按 F，開車時看「每秒影格數」與「繪圖器」 |
| 真實手機（擁有者填） | | | 開 `/kart/spike?fps=1`（手機按「顯示數字」也可以），車不會動，但畫面照畫 |

試過關掉 vsync 想看餘裕（`--disable-gpu-vsync --disable-frame-rate-limit`）：800–1000 fps，但中間有 1–2 秒的卡頓，應該是無頭模式沒有真的送到螢幕，**這個數字不能當餘裕**，所以不算數。場景只有兩個方塊、一塊地、一張格線，真實賽道的負擔還沒量。

**對 Q4（視覺風格）的參考，不是決定**：three.js 的 136 kB 不管選哪種風格都要付，剩下約 460 kB 是遊戲程式的空間，模型與貼圖走 R2、不算在內，所以 bundle 不是選風格的限制。方塊與平光材質（無貼圖、無陰影）在內顯跑滿 60 fps，低多邊形那條路在這個規模沒問題，但這沒有比較過像素／2.5D，也沒有量過真賽道，不足以替任何一邊背書。

**給 J2 的事**：
- 物理參數是 spike 的起始值，甩尾穩定時側滑角會一直貼著 32° 的上限，放掉 Shift 後約 0.3 秒回正。要不要這樣由 J2 與 `e8-t03` 調。
- Windows 連按 5 次 Shift 會跳相黏鍵提示，甩尾又常要點按 Shift，這是操作上的風險；`e8-t12` 改鍵時要想。部分筆電鍵盤同時按方向鍵與 Shift 可能漏鍵。兩件都沒實測。
- 鍵盤的轉向是全開或全關（-1、0、1），`stepKart` 接受中間值，手把到 `e8-t12` 才接。
- `window.__kartSpike`（`tick`、`frames`、`running`、`state`）給 e2e 與主控台讀，正式頁不要留。

## 5. i18n

- `t(key, params)`，key 以語意命名（`lobby.newRoom`）；`en.ts` 是來源，`zh-TW.ts` 必須 key 完全一致（`check-i18n` 在 CI 擋）。
- 遊戲模組的字串在 `shared/games/<id>/i18n.ts`（同樣兩語），由登記表合併。卡丁車的字串在 `shared/kart/i18n.ts`，由它的 lazy chunk 用 `registerMessages` 註冊，不進首屏（§4.1）。
- 規則頁是 markdown 兩份（`rules.en.md`、`rules.zh-TW.md`）。
- 預設 `en`；第一次進站依瀏覽器第一順位語言偵測（`zh`、`zh-*` → `zh-TW`），之後以 localStorage 的使用者選擇為準；`<html lang>` 跟著改。

## 6. 帳號（M1）

- 不複製牌桌的帳號系統。流程：本站「用淡江帳號登入」→ 轉到牌桌登入頁（帶 `return_to`）→ 牌桌簽一個 5 分鐘有效的 token（含 user id、暱稱）→ 回本站 `/api/auth/callback` 驗簽（共用 secret 或公鑰）→ 發本站 session cookie。
- 牌桌端要加一個端點（牌桌 repo 的 task `e1-t11`）。
- 訪客永遠可玩；登入只多「暱稱固定、戰績、好友、解鎖進度」。

## 7. 部署與環境

- 一個 Worker、`main` 通過 CI 後自動部署；每個 PR 部署自己的 Worker `tku-arcade-pr-<號>`（`wrangler deploy --name`，PR 關閉即刪；不用 `versions upload`，因為 DO migration 不能走 versions upload，且版本會共用正式站的 DO 與 D1）；預覽共用 staging D1 `tku-arcade-staging`，R2 assets 與正式站共用、沒有備份桶。細節見 `DEPLOY.md`。
- Secrets：`AUTH_SHARED_SECRET`（與牌桌共用）、`ANTHROPIC_API_KEY`（題目草稿）、`LONGTALK_URL`（選用）。
- 成本：Workers、DO、D1、R2 都在免費額度內；卡丁車多人是最大變數（E12 儀表板）。

## 8. 從牌桌與 LongTalk 直接搬的東西

| 東西 | 來源 | 備註 |
| --- | --- | --- |
| `shared/patch.ts`、`room-id.ts`、`chat.ts` | LongTalk | 直接複製 |
| RoomDO hibernation WebSocket、心跳、45 秒逾時 | LongTalk `RoomDO` | 結構相同 |
| per-seat view 裁切思路 | 牌桌 `worker/views.ts` | 概念，不複製程式 |
| D1 遷移、備份 cron、錯誤回報、JS 預算腳本、Playwright 視覺回歸流程 | 牌桌／橋館 | 複製腳本 |
| 設計 token 與 styled-components 慣例（`$` prop） | 全部 | 同一套規則 |
