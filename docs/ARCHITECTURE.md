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
  protocol.ts           協定 v2（2026-11-17 起 patch 也送陣列的差異，§4.22；welcome/snapshot/patch/action/error/timer/chat/ping）
  patch.ts              diff 推送（移植 LongTalk）
  room-id.ts            10 碼 base58（移植 LongTalk）
  chat.ts               聊天限制（移植 LongTalk）
  games/
    types.ts            GameModule / RealtimeModule / OptionsSchema / Rng
    lobby.ts            大廳的遊戲清單（id 與 meta：人數、分鐘、字串前綴），瀏覽器首屏只有這個（2026-11-15）
    lobby.en.ts         每款遊戲的名稱與簡介（英文，來源）；lobby.zh-TW.ts 是繁中，各自跟著該語言的 chunk
    catalog.ts          全部遊戲的 info（選項）與字串（兩語），給 Worker、腳本、check-i18n 與測試；瀏覽器不得 import
    index.ts            Worker 與腳本用的登記表（含規則），瀏覽器不得 import
    tictactoe/          範本（測試用）
    promotion/          陞官圖：board.ts、rules.ts、i18n.ts（大廳、等待室、錯誤與結算的字串）、i18n.screen.ts 與 i18n.detail.ts（隨畫面載入，含格名與官階名）、rules.en.md、rules.zh-TW.md
    silent-table/         默契牌局：rules.ts、types.ts、i18n.ts（等待室要的字串）、i18n.screen.ts（隨畫面載入）
    screenMessages.ts     隨畫面載入的字串總表：只給 check-i18n 與 npm run play，網站不能 import
    spectrum/             光譜猜題（暫名）：rules.ts、types.ts、info.ts、i18n.ts、i18n.screen.ts；topics.ts 是題庫（由 scripts/spectrum-topics.mjs 從 CSV 產生，只在 Worker，F3 搬到 D1）
    bluff/                真假朗讀（暫名）
    lantern/              宮燈點點（暫名）：rules.ts、types.ts、info.ts、i18n.ts、i18n.screen.ts；即時合作，同時的動作照 RoomDO 收件順序
    word-bridge/          搭橋（暫名）：rules.ts、types.ts、info.ts、i18n.ts、i18n.screen.ts、clue.ts（提示檢查，前後端共用）；bank.ts 是詞庫（由 scripts/word-bridge-bank.mjs 從 CSV 產生，只在 Worker）
    clue-clash/           撞詞（暫名）：同上，clue.ts 是提示、猜題與撞詞的比較；bank.ts 由 scripts/clue-clash-bank.mjs 產生，只在 Worker
    wordFold.ts           文字遊戲共用的比較（NFKC、小寫、去標點、互相包含）
    kite/                 放風箏（暫名）：rules.ts、types.ts、info.ts、i18n.ts、i18n.screen.ts；沒有題庫
    odd-word/             誰的詞不一樣（暫名）：rules.ts、types.ts、info.ts、i18n.ts、i18n.screen.ts；bank.ts 是詞組（由 scripts/odd-word-bank.mjs 從 CSV 產生，只在 Worker）
    tiles/                社辦牌陣（暫名）：rules.ts、types.ts、info.ts、i18n.ts、i18n.screen.ts；tiles.ts 是牌組與桌面的判斷（前後端共用）
    traders/              滬尾商行（暫名）：rules.ts、types.ts、info.ts、i18n.ts、i18n.screen.ts；bank.ts 是牌與貴客（由 scripts/traders-cards.mjs 從 CSV 產生，只在 Worker）；貨的顏色在 src/styles/tradersTokens.ts
    secret-scroll/        奪祕笈（暫名）：rules.ts、types.ts、info.ts、i18n.ts、i18n.screen.ts；deck.ts 是牌堆組成（規則與畫面的參考表共用，不在首屏）
    wasabi/               芥末餃子（暫名）：rules.ts、types.ts、info.ts、i18n.ts、i18n.screen.ts
    palace/               朝堂暗鬥（暫名）：rules.ts、types.ts、info.ts、i18n.ts、i18n.screen.ts；沒有題庫
    holdem/               德州撲克：rules.ts、types.ts、info.ts、i18n.ts、i18n.screen.ts；牌型用 poker/hand.ts，沒有題庫
    misery/               慘度排排站（暫名）：rules.ts、types.ts、info.ts、i18n.ts、i18n.screen.ts；bank.ts 是卡庫（由 scripts/misery-bank.mjs 從 CSV 產生，只在 Worker）
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
  lib/                  瀏覽器工具（storage 等）；router.tsx＋useRouter.ts 是站內的小路由（D4 取代 react-router-dom）
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
- 新遊戲＝`shared/games/<id>/` ＋ `src/games/<id>/` ＋ 登記表一行 ＋ `lobby.ts` 一行 meta 與 `lobby.en.ts`／`lobby.zh-TW.ts` 各兩行（名稱、簡介）＋ harness 測試一局 ＋ 規則頁兩份 md ＋ i18n 兩份。首屏只多 `lobby.ts` 那一行與一種語言的名稱，選項（`info.ts`）與房間要的字串（`i18n.ts`）由房間載入（§5）。

### 怎麼寫一款新遊戲（A3 起已實作）

介面的完整說明在 `shared/games/types.ts` 的註解；照抄 `shared/games/tictactoe/`（`types.ts`、`rules.ts`、`i18n.ts`）開始。

- **型別**：state、action、view 都是可 JSON 化的 `type` 別名（不用 `interface`，否則無法指定給 `JsonValue`）；不放 `undefined`、`Map`、`Date`、class。
- **`reduce` 是裁判**：`action` 來自網路，靜態型別不算數；要在執行時檢查形狀、輪到誰、規則，錯了回 `gameError('i18n key')`，不丟例外、不改舊 state。
- **`view` 是唯一出口**：隱藏資訊在這裡裁切；`legalActions`、`result` 也會送到瀏覽器，同樣不能洩漏。
- **`legalActions`**：能列舉就全列；自由輸入（光譜猜題的回答文字）列幾個樣本即可，`reduce` 要接受每一個。
- **隨機**：只用傳入的 `rng`。Rng 的位置由平台存在 state 旁邊（`Match.rngState`），不進 state，所以不可能經 view 外洩；動作被拒時位置也不會前進。
- **計時**：`timers(state)` 只宣告「id、多久、到時的 action」；時鐘由 RoomDO 管，到時以 `actor: 'system'` 走 `reduce`。id 消失就取消，要重新倒數就換 id（如 `answer-3`）。瀏覽器送的動作永遠不會是 `system`。
- **代打的範圍**（C8）：`meta.proxyTurns` 的遊戲，房主「代打」從 `legalActions` 隨機挑一個；模組可以另給 `proxyActions(state, seat)` 縮小範圍（`worker/room-turn.ts` 的 `coverOptions`）。陞官圖完整版擲骰照舊可以代打，但等回答時只給預設答案，不替人亂選。
- **畫面自己畫倒數**（C8）：`GameLayout` 的 `ownCountdown` 讓手機版不再把房間的倒數放在遊戲上方（倒數出現會把圖版往下推）；陞官圖完整版把倒數畫在蓋在圖版上的抉擇卡片裡。
- **規則選項**：`options` 宣告欄位（`boolean`／`int`／`select`），房主表單由此產生，房主的值由 `parseOptions` 檢查；`init` 之後還要用的選項自己抄進 state。
- **隱藏選項**（C6 起）：欄位加 `hidden: true`、只放在模組的 schema（`rules.ts`），不放 `info.ts`，等待室的表單就看不到。建房時 `POST /api/rooms` 的 `options` 可以設它；房主之後改其他選項時，`RoomHost.setOptions` 用 `keepHidden` 保留房間原本的值（表單送來的同名欄位不算數）。`catalog.test.ts` 要求模組與 info 的欄位除了隱藏的以外完全相同。陞官圖的 `edition` 在 C7 打開，現在沒有遊戲用 `hidden`。欄位另外可以有 `showIf`（另一個欄位是某個值才顯示）與 select 選項的 `hintKey`（C7）。
- **一個模組兩個版本**（陞官圖，C6 起）：註冊的 `promotion` 在 `init` 依 `edition` 選版本，之後用 state 有沒有 `edition: 'full'` 分辨（簡化版的 state 沒有這個欄位，所以舊局照舊）；簡化版是 `promotionSimple`、完整版是 `rulesFull.ts`。完整版的圖版 `boardFull.ts`、規則 `rulesFull.ts` 只在 Worker：`catalog.test.ts` 擋瀏覽器靜態 import 它們。C7：`screens.ts` 的 `gameScreen(gameId, view)` 依 `view.edition` 給完整版自己的 lazy 畫面 `src/games/promotion/full/FullScreen.tsx`，它直接 import `boardFull.ts`（只有資料）；`catalog.test.ts` 只准 `src/games/promotion/full/` import 它。C8：**規則分版**，完整版的 state 有 `rulesVersion: 2` 才照第二套規則與圖版（`fullBoard(2)`，236 格），沒有的（C6／C7 開的局）照第一套下完，所以部署不會改到進行中的局；兩套都在 `boardFull.ts` 與 `rulesFull.ts`，第一套有指紋測試。新的動作 `accept`／`decline`／`skip`／`buy` 與 `state.pending`、`timers`（`decide-<n>`）、`skipAction` 與 `proxyActions` 的預設答案。瀏覽器不再靜態 import `boardFull.ts`：完整版畫面先畫 dock 與座位，`full/fullData.ts` 用動態 import 在首屏之後拿圖版資料（`catalog.test.ts` 擋靜態 import、只准這一處動態 import；`npm run budget` 另列「首屏之後」的大小）。
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

### 房號（四位數，擁有者 2026-11-13）

房間的正式識別仍是 10 碼的 room id（不可列舉）。另外每個新房間拿一個 **1000–9999 的房號**，給朋友用嘴巴講或在手機數字鍵盤打（`shared/room-code.ts`）。

- 房號簿在**唯一的 `LobbyDO`**（`code:<房號>` → room id），一個物件一次處理一個呼叫，所以兩個房間不會拿到同一個號碼。不用 D1：沒有 migration，也不用另外清資料。
- `POST /api/rooms`：先產生 room id，隨機抽房號請 `LobbyDO.claimCode` 給它；號碼被占用時問那個房間還在不在（`summary()`），已經被清掉就接手，還在就再抽，最多 12 次。都抽不到或大廳連不上，房間照樣建立，只是沒有房號（連結照常可用）。房號存在房間自己的資料（`RoomRecord.code`），房間 view 的 `room.code` 帶出去，等待室顯示。
- `GET /api/codes/<房號>`：查到 room id 後確認房間還在才回 `{ id }`；房間已經不在就把號碼還回去，回 404。
- 號碼不設到期：房間沒人 10 分鐘就會被清掉（`ROOM_CLEANUP_MS`），之後誰抽到那個號碼就接手。房號好猜沒關係：它只是好打的入口，房間本來就靠連結分享。

### 房間密碼（I3，`e1-t16`）

- **房主在等待室的邀請區設定或拿掉**（`set_password`，任何狀態都可以；去頭尾空白後 1–32 字）。一開始放在大廳的「新房間」上方，但 375 px 手機會把「新房間」擠出第一屏（D2 的規則），所以改到等待室：房間建好、分享連結之前設定。`POST /api/rooms` 也可以直接帶 `password`（太長或只有空白回 400 `bad_password`）。有密碼的房間**不會公開列出**（`listing()` 擋）。
- 密碼原樣存在 `RoomRecord.password`：它是給朋友的門號，不是任何人自己的密碼。**房裡的成員**在 view 的 `room.password` 看得到（他們都是帶密碼進來或本來就在，方便轉告）；summary 只有 `locked: true`，listing 沒有這種房間，日誌不記。
- `join` 可帶 `password`。**新的人**沒帶回 `password_required`、帶錯回 `wrong_password`，同一條 socket 錯 `PASSWORD_TRIES`（5）次就關掉；**拿著 seat token 回來的成員不用密碼**。前端（`src/lib/roomPassword.ts`）把密碼放 sessionStorage，重連時一起送；收到這兩個錯誤就停止連線、顯示密碼表單（`PasswordForm.tsx`，lazy），送出後重連。
- 首屏預算：密碼表單、房主的設定（`RoomPasswordSetting.tsx`）、語音按鈕、公開房篩選、重播頁都是各自的 lazy chunk，字串放 `shared/games/roomExtras.ts`（`room.extra.*`，check-i18n 照樣檢查）；重播頁經由房間的 chunk 載入，否則 Vite 會把房間 chunk 拆成兩個、多出約 1.8 kB。

### 重播（I3，`e2-t09`）

- `GET /api/rooms/<id>/replay`：**只有最後一局已經結束**才回（進行中回 404，免得看到還藏著的東西；重新開局後上一局的步驟就刪了）。RoomDO 讀 `step:` 鍵，用 `shared/games/replay.ts` 的 `buildReplay` 以同一個 `reduce` 從種子重放，回 `{ gameId, options, names, start, frames }`：`start` 是旁觀者一開始看到的 projection，每步一個 patch（`shared/patch.ts` 的 diff），大小只跟變化有關。重放不出原局（模組改過）就回 404 並記日誌。RPC 回 JSON 字串，因為 projection 的型別對 RPC 的型別推導太深。
- 前端 `/r/<id>/replay`（`src/pages/ReplayPage.tsx`）：套 patch 算出每一步，用**遊戲自己的畫面**以旁觀者身分顯示（`act` 什麼都不做），上一步、下一步、播放、拉桿；最後一步才顯示結果。結果面板有「看重播」連結。
- 測試：`tests/games/replay.test.ts` 對每一款遊戲隨機玩完一局，patch 逐步套回去必須等於最後的旁觀者 projection（AC-2.5）。

### 語音連結（I3，`e1-t14`）

- `GET /api/voice` 回 `{ available }`（有 `LONGTALK_URL` 才是 true）；`POST /api/voice` 請 LongTalk 的 `POST /api/rooms` 開一間，回 `{ url: <LONGTALK_URL>/r/<id> }`，LongTalk 拒絕、回奇怪的 id 或連不上都回 503。
- **同一個 workers.dev 子網域的 Worker 不能直接 fetch 另一個 Worker**，所以走 service binding `LONGTALK`（`wrangler.jsonc`，正式與預覽都綁正式的 `longtalk`；預覽開的是會自己清掉的空房）。沒有 binding 時退回一般 fetch。
- 前端：聊天面板標題旁的「開語音房」按鈕（`src/components/ChatPanel.tsx`），網站說可以才出現，聊天鎖住時不能按；開好後把連結當一般聊天訊息送出（聊天本來就把網址變成連結）。拿掉 `LONGTALK_URL` 就把按鈕藏起來。

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
| 陞官圖首屏，加 spike 前 → 後 | 149.4 → **149.2 kB**（預算 150 kB） |
| 物理一步 | 約 0.09 µs（Node，5 百萬步平均），固定 60 Hz 下可忽略 |

- 主站沒有變大，但也不是「變小了 0.2 kB」：打包器移動了 chunk 邊界（`_protocol` 併進入口 chunk、Button 拆成自己的 chunk），分開壓縮的總和因此變動。真正新增的是路由一行、`registerMessages`、`kartScene` 幾個色碼，小到被這個變動蓋過。
- **加進主站的東西要小心**：spike 第一版直接用 `VisuallyHidden`、`useMediaQuery`，打包器把它們拆成共用 chunk，陞官圖首屏就變成 149.7 kB。所以 spike 頁不用這兩個。**陞官圖首屏在 `origin/main` 就已經是 149.4 kB，只剩 0.6 kB**（`NEXT.md` 記的 146 kB 是 G1 以前的）。
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

**J2 怎麼處理上面幾件**（#19，細節與參數表在 `docs/PRD/e8-kart-single-player-core.md` 的「J2 定案的細節」）：側滑角改成由轉速與 `driftAlign` 平衡出來（打滿 32°、置中 22°、反打 12.5°），40° 上限碰不到；預設甩尾鍵改成 Z／空白鍵、噴射 X／E，不用 Shift 與 Ctrl；手把的搖桿是類比轉向。`stepKart` 多了 `tuning` 與 `rules` 兩個參數（預設 `KART_TUNING`、`DEFAULT_RULES`），J3 的調參面板改傳自己的物件即可。`window.__kartSpike` 多了 `input`（最後一步用的輸入）與 `gamepad`。鍵盤輸入的模組從 `src/kart/keyboard.ts` 移到 `shared/kart/input.ts`（純邏輯）與 `src/kart/devices.ts`（手把、儲存、按鍵名稱）。

### 4.2 J3：碰牆、復位、調參、攝影機與 HUD（`e8-t02b` `e8-t03` `e8-t08`，PR #28）

細節與所有數字在 `docs/PRD/e8-kart-single-player-core.md` 的「J3 定案的細節」。這裡只記結構：

```
shared/kart/
  physics.ts   stepKart：一台車一步（J1、J2），KART_TUNING 多了 3 個牆的參數
  walls.ts     collideWalls：stepKart 之後把車推出牆（線段＋圓，切小段防穿牆）
  course.ts    Run＝車＋安全點＋復位；stepRun 是迴圈每步呼叫的那一個
  arena.ts     TEST_ARENA：spike 用的圍牆空地（J4 換成賽道 JSON）
  tuning.ts    TUNING_SPECS（範圍）、PRESETS（標準／抓地／滑胎）、JSON 讀寫與檢查、steadySlips
src/kart/
  camera.ts    追行進方向的鏡頭與噴射視角（純函式）
  callouts.ts  兩步之間的 DRIFT／BOOST／CHAIN
  Hud.tsx      電競風 HUD 與大字提示
  TuningPanel.tsx  調參面板
  layout.ts    窄螢幕時面板從哪裡開始
```

- **一步的順序**：`stepRun` → 復位鍵剛按下就直接復位、這一步不跑物理；否則 `stepKart` → `collideWalls` → 更新安全點。全部是純函式、固定 60 Hz，所以 30、144 fps 與不規則畫面在撞牆、復位後結果仍然**完全相同**（`tests/shared/kart-walls.test.ts`）。E9 的伺服器要裁定時可以直接跑 `stepRun`。
- **牆是線段**：`Wall = {ax, az, bx, bz}`。J4 的賽道 JSON 不管怎麼描述牆（中線、網格邊界），最後轉成線段就能用；只有 `walls.ts` 認得這個格式。牆多了（> 幾百段）要加空間索引，現在每步每段都檢查。
- **安全點**是 `Run` 自己算的（離牆、往前、連續 1 秒），J4 有檢查點與復位點後，`stepRun` 改成用最近通過的檢查點；`resetRun` 不用動。
- **調參**：迴圈每格讀頁面給的 `tuning`（`SpikeControls.tuning`），所以滑桿改了下一步就用新的數字，不用重開迴圈。匯入的 JSON 是不可信的文字，`parseTuning` 每個數字都檢查範圍，一個不對就整份不收。
- **鍵盤與表單**：開車的鍵在 `window` 上 `preventDefault`；焦點在 `input`、`select`、`textarea` 時迴圈不吃鍵，所以面板可以開著開車。
- **HUD 更新**：迴圈每格算一份 `SpikeHud`（速度取整數 km/h），和上一份不同才 `setState`，所以停著時 React 不重繪；開車時速度幾乎每格變，HUD 每格重繪一次（只有 HUD 這個 memo 元件）。
- **卡丁車 chunk**：143.0 → **151.0 kB** gzip（預算 600 kB）。主站 121.1、陞官圖 148.5、默契牌局 144.5、光譜 147.8 kB 都沒變：新的東西全在 lazy chunk 裡，`tokens.ts` 只多一個 `kartScene.wall` 色碼。
- **已知**：Playwright 的軟體繪圖截圖裡，面板打開時頂部按鈕後面會出現一塊深色長方形（J2 的操作設定面板也有），在 DOM 裡找不到對應的元素，推測是 SwiftShader 合成層的問題，實機沒看過。

### 4.3 J4：賽道格式、檢查點、復位點、匯出腳本與小地圖（`e8-t04` `e8-t09`，PR #49）

- **格式**（`shared/kart/track.ts`，`TRACK_FORMAT` 1）：`id`、雙語 `name`、`laps`；`road` 是**封閉的中線**（照行駛順序，每點 `x`、`z`、`width`）；`gates` 依序（gate 0 是起終點線，`a` 在駕駛者左邊的路緣、`b` 在右邊）；`respawns` 每個 gate 一個；`grid` 起跑格（第一個是桿位）；`walls` 是路緣以外的牆；`boostPads`、`itemBoxes`、`decor` 先留位置（E9、K1）。**`parseTrack` 一次列出所有問題**，路緣牆由中線往兩側各半個路寬自己算（`kerbs`），所以牆、檢查點、復位點、小地圖都來自同一份資料（AC-8.2）。
- **判圈**（`gateCrossing`、`course.ts` 的 `passGates`）：只認**下一個** gate 往前穿過；剛穿過的那個往回穿就退回一個（來回壓線不會多算一圈）；抄捷徑跳過 gate，後面的都不算。停在線上算穿過、從線上離開不算，所以剛好壓在 gate 上的那一步只算一次。`Run.crossings` 是往前穿過起終點線的次數（起跑在線後，第一次穿過是「第 1 圈開始」），J5 的時間賽由它算圈數與完賽。
- **復位**：在有 gate 的賽道上，R 回到**最後一個穿過的 gate 的復位點**（還沒穿過起點線就回桿位），取代 J3 的「離牆 4 m 連續 1 秒」；測試場（沒有 gate）照舊。
- **測試橢圓**（`shared/kart/tracks/testOval.ts`）：兩段 160 m 直線接半徑 50 m 的半圓、寬 14 m，原創、刻意樸素；`/kart/spike?track=oval`（或「開測試橢圓賽道」）。三維畫面是一條灰色路面與白色起終點線（`Scene.ts` 的 `roadGeometry`），模型等 `e8-t05b`。測試裡有一個簡單的自動駕駛真的開完 3 次起點線。
- **匯出腳本**（`scripts/kart/build-track.ts`，純邏輯在 `gltfTrack.ts`）：讀 Blender 匯出的 **.gltf（JSON）**，只看**空物件的名字與位置**，不讀網格：`road.000…`（中線，自訂屬性 `width`）、可選的 `gate.00…`（不放就每 `gateEvery` 個路點一個，場景的自訂屬性，預設 6）、`grid.0…`、`wall.<名>.000…`（`.000` 上 `closed: true` 就封閉）、`boost.N`（`length`、`width`）、`item.N`、`decor.<模型>.N`（縮放取空物件的）。空物件放在場景最上層、不要有父物件；朝向是 Blender 的 +Y（匯出後 glTF 的 -Z）。輸出前用同一個 `parseTrack` 檢查，有問題就列出來、exit 1。
- **小地圖**（`src/kart/Minimap.tsx`）：SVG，北（-z）朝上，不跟車轉；路照寬度畫、中線虛線、起終點線、下一個 gate（黃）、車是箭頭。車的位置每幀由迴圈直接改 SVG 屬性（`onPose`），不經過 React。

### 4.4 J5：第一張灰盒賽道與時間賽（`e8-t05a` `e8-t10`，PR #50）

- **河畔（灰盒）**（`shared/kart/tracks/riverside.ts`）：PRD 定的原創主題「淡水河畔」的佈局，只有路與路緣，美術是 `e8-t05b`。一圈約 1.27 km：長直線過起終點、快速右彎、S 彎、窄髮夾（甩尾的地方）、長左彎回直線。用 18 個控制點經封閉 Catmull-Rom 樣條、每 6 m 取一點寫成程式，產生和 `build-track.ts` 一樣的 JSON；之後在 Blender 做美術時，照同一條線放 `road.NNN` 空物件就能匯出同一份。測試擋：路的任兩段（沿路相距 40 m 以上）不會靠得比兩邊半路寬加 4 m 還近；簡單的自動駕駛 3 圈都不會被判逆向。
- **時間賽**（`shared/kart/timeTrial.ts`，純函式）：倒數 3 秒，倒數中車固定在桿位、按什麼都沒用；GO 之後開始計時，**第 1 圈從 GO 起算**（含從起跑格到線的那段），所以各圈加起來剛好是總時間；穿過起終點線第 laps + 1 次完賽（圈數由 `course.ts` 依序判，抄捷徑、倒著開都不算）。完賽後車自己煞停，什麼都不再算。**逆向**：速度至少 3 m/s、行進方向和最近路點的路向夾角超過約 110°、持續 1 秒，就顯示「逆向了！」；只警告，不罰（gate 本來就不算）。R 復位時鐘照跑。時間以步數（1/60 秒）累加，顯示到毫秒。
- **畫面**（`/kart/spike` 的「場地」選單：測試場、測試橢圓、河畔；`?track=`）：右上角小地圖上方是圈數、總時間、本圈、上一圈、最快圈（時間每幀直接寫進 DOM，不經過 React）；中間是 3-2-1-出發、逆向警告；完賽是結果框（總時間、各圈、最快圈標出、「再跑一次」回起跑格重新倒數）。
- 最佳紀錄存 localStorage 與幽靈車是 `e8-t11`（K3）。

### 4.5 K1：賽道美術、畫質選項、資產管線（`e8-t05b` `e8-t06` `e12-t08`，PR #51）

- **擁有者 2026-11-13 把卡丁車美術全部交給 AI 協作者**（沒有美術、不用 Blender），目標是商業卡丁車遊戲那樣的完成度與「小車、寬路」的比例感，但**一切原創**（CLAUDE.md 規則 1）。所以**美術全由程式產生**：`src/kart/art/textures.ts` 用 canvas 畫貼圖（柏油含輪跡與白線、修剪過的草地、紅白路緣、藍白黃護欄、水面、棋盤格、紅磚、沙），`src/kart/art/trackArt.ts` 從賽道 JSON 建出路面、路緣（路邊往內 0.9 m）、護欄（就站在物理牆上）、起終點棋盤格與門架、天空穹頂、霧，以及**依賽道留下的空地**擺放的景物（`shared/kart/scenery.ts` 的 `scatter`：離路至少幾公尺、彼此至少幾公尺、固定種子，所以每次一樣）：低多邊形闊葉樹與松樹、遠山、直線段的路燈、急彎外側的輪胎堆、起點旁的看台；**河畔**另有河、沙岸、拱橋、對岸的紅磚老街。沒有任何模型或圖檔，不用登記、不用 R2。
- **比例**：車寬 1.5 m，河畔路寬改成 9–13 m（約 6–9 個車寬，原本 12–16 m）。數字是依「小車、寬路」的感覺訂的，沒有量過任何遊戲；擁有者試開覺得不對就調 `riverside.ts` 的寬度。
- **深度**：草地用 polygonOffset 往後推、路面抬高 5 cm，否則某些 GPU（SwiftShader 實測）遠一點的路會被草蓋掉。
- **畫質**（`src/kart/quality.ts`，`e8-t06`）：低／中／高：像素比上限 1／1.5／2、反鋸齒、陰影（無／1024／2048，陰影相機跟著車，只照車附近 ±45 m）、景物密度 35／70／100%、各向異性、霧的距離；存在瀏覽器，手機預設中、其他預設高；切換會重建場景。`/kart/spike` 右上角「畫質」。
- **AC-8.1 的「glTF 從 R2 載入、進度條」**：目前沒有任何下載的模型，所以沒有進度條要顯示（場景在第一幀前就建好）；之後若有模型，`scripts/assets/upload.ts` 已能上傳到 R2。
- **資產管線**（`e12-t08`）：`npm run check-assets`（CI）擋沒登記在 `ASSETS.md` 的圖、字型，擋任何模型、貼圖、音檔進 repo，擋超過 100 kB 的圖（測試基準圖除外）；第一次跑就抓到一個沒寫全路徑的標誌檔。`scripts/assets/upload.ts` 用內容雜湊命名、`immutable` 快取上傳到 R2 `tku-arcade-assets`（預設只印指令，`--apply` 才上傳）。

### 4.6 K2：車輛模型、甩尾煙與胎痕、音效、卡丁車頁（`e8-t07` `e8-t13` `e8-t14`，PR #52）

- **第一台車**（`src/kart/art/kartModel.ts`）：原創卡通小車：底盤、兩側邊箱、前鼻、前保險桿、引擎、尾翼、座椅、方向盤；車手是深藍賽車服、白色圓安全帽與深色面罩。尺寸照物理（1.5 × 2.6 m）。會動：輪子依速度轉、前輪依方向鍵轉、甩尾時車身往外傾、煞車點頭、起步抬頭、高速微微彈；車手往彎內傾、頭看轉的方向。
- **效果**（`src/kart/art/effects.ts`）：甩尾時兩個後輪冒煙（70 團的池子重複用）、地上留深色胎痕（900 段的環狀緩衝，最舊的被覆蓋；R 復位時斷開，不會連到下一段）、噴射時排氣管有火焰（加色混合、閃爍）。
- **音效**（`src/kart/kartAudio.ts`，`e8-t13`）：全部 WebAudio 合成、沒有音檔：引擎（鋸齒波＋方波、低通，音高 52 Hz 起每 m/s 加 4.4 Hz，踩油門更亮）、甩尾的輪胎聲（帶通雜訊）、噴射的衝刺聲、撞牆的悶響。跟網站同一個聲音開關（`src/lib/sound.ts`），第一次按鍵才啟動（瀏覽器規定）。
- **卡丁車頁** `/kart`（`e8-t14`）：同一個 chunk，`SpikePage` 的 `play` 模式：只有測試橢圓與河畔、沒有調參面板與數字，預設河畔；`/kart/spike` 留著調參。**大廳還沒放**：等 K3 手感簽核。
- **首屏**：卡丁車的色值原本在 `tokens.ts`，因為大廳也載 `tokens.ts`，那 40 個色值進了每個人的首屏；搬到 `src/styles/kartTokens.ts`（CLAUDE.md 規則 5 一起改了說法），主站 106.6 → 106.1 kB、陞官圖完整版 149.9 → 149.4 kB。

### 4.7 K3：最佳紀錄、幽靈車、遙測（`e8-t11` `e12-t10`，PR #53）

- **幽靈車**（`shared/kart/ghost.ts`）：從 GO 起每 3 步（每秒 20 次）記一次 x、z、朝向（公分、千分之一弧度），3 分鐘約 3,600 個數字。播放時在兩個取樣之間內插（朝向走短的那邊），完賽後停在終點。存 localStorage 的東西誰都能改，所以讀回來一律檢查（`parseGhost`）。
- **紀錄**（`src/kart/records.ts`）：每條賽道的最佳總時間（連幽靈）與最快單圈分開存；完賽時比較，破紀錄在結果框說「新紀錄」，計時框多一行「紀錄」。下一場就有半透明的幽靈車（`kartModel` 的 ghost 模式）一起跑。帳號存 D1 是 E11 的事。
- **遙測**（`worker/telemetry.ts`）：開了 30 秒後送一次（每次造訪一次）：平均幀數與載入時間（從開始建場景到第一幀），**只存成區間計數**（幀數 <30／30–45／45–55／55+，載入 <1／1–3／3–6／6+ 秒），依畫質分，存進 `daily_metrics`；不送 GPU 名稱、不存任何個人資料。`/stats` 有一張表。

### 4.8 N1 提前：第二張賽道（單機）（`e10-t02` `e10-t03`，PR #55）

擁有者 2026-11-14 要求手感簽核等待中也繼續做，所以先做 N1 裡不靠多人與命名的部分；`e10-t01`（`KART-WORLD.md`）還沒做，賽道名稱是**暫名**。

- **佈局**（`shared/kart/tracks/harbour.ts`，id `harbour`，暫名「漁港髮夾彎」／"Harbour Hairpins"）：原創，一圈約 1.43 km（河畔 1.27 km），路寬 10–13 m（髮夾彎 11 m，比河畔的 9 m 寬一點，甩得進去）。PRD 說賽道 2 是技術型（連續髮夾彎、練連噴），所以和河畔反過來：沿海的長直線過起終點（往東）、一個快速右彎、短而急的右轉接**兩個連續的折返髮夾彎**（左、右）、上排的 S 彎（chicane）、西側一段長的快速右彎、進直線前一個小折角。平面（物理是平面的，沒有高低差；「上坡」只是背景的山坡）。
- **畫法共用**：控制點經封閉 Catmull-Rom 樣條的程式從 `riverside.ts` 抽到 `shared/kart/tracks/spline.ts`（`splineRoad`），河畔改用它，**產生的 JSON 逐位元組相同**（改前改後的 SHA-256 一樣）。gate、復位點、小地圖、判圈、最佳紀錄、幽靈車都是既有的系統，紀錄依 track id 分開存。
- **選賽道**：`/kart` 與 `/kart/spike` 的「場地」選單多一個（`?track=harbour`）；`spikeLoop.ts` 的 `TRACKS` 表。
- **主題**（`kartTokens.ts` 的 `kartThemes`、`harbourScene`）：每條賽道有自己的天空與光（`KartTheme`：天空三色、霧、半球光、太陽顏色與方向、太陽盤）。河畔與測試賽道用 `day`，數值和 K1 一樣，畫面不變；漁港用 `sunset`：低的西北夕陽（長影子）、粉紫到橘的天空、太陽盤與光暈。`Scene.ts` 依 `themeOf(track)` 設光與霧。
- **美術**（`src/kart/art/harbourArt.ts`，全部程式產生，沒有模型或圖檔）：北邊與西邊是海（比岸低 1.6 m），混凝土碼頭、岸壁、黃線、繫船柱；兩道防波堤與消波塊，紅白燈塔（燈籠亮、兩道光束旋轉、往外漸淡）與對面的綠燈；停泊的漁船（四色船身、白色船艙、桅杆與旗，隨浪起伏）；貨櫃起重機、貨輪與貨櫃堆；內場的倉庫（斜屋頂）；碼頭與西側沙灘的椰子樹；折返彎兩旁點亮的紅燈籠；南邊的山坡（高度場，往西降到沙灘）上一層層平頂房子、水塔、亮著的窗（emissive 貼圖）、松樹；海上的夕陽光帶（加色混合）。共用的樹、燈柱、輪胎堆、看台照舊；在海裡的遠山變成低矮的島，讓海平線是開的。
- **畫質**：景物數量照 `density`（低 35%／中 70%／高 100%）縮放：漁船 5–14 艘、房子、貨櫃、松樹、椰子樹、消波塊間距；陰影與霧照既有設定。
- **卡丁車 chunk**：172.2 → **178.2 kB** gzip（預算 600 kB），其他首屏不變。
- **測試**：`tests/kart/timeTrial.test.ts`（合法、路不會自己靠太近、起跑格在線後、長度 1.2–1.6 km、髮夾彎數 ≥ 2 且比河畔多、簡單自動駕駛三圈不被判逆向），`tests/kart/harbourArt.test.ts`（路面與周圍是平地、不在海裡，山坡在南邊升起、樹不長在碼頭與海裡），e2e 從 `/kart` 的選單開漁港。
- **留下的**：跑線只用自動駕駛與 Playwright 實測（自動駕駛小心開一圈約 51 秒），沒有人甩尾實測過，AC-10.1 的「實測跑線」等擁有者；名稱等 `e10-t01`；只在 Playwright（Chromium，Intel 內顯 D3D11）看過，沒上實體手機。

### 4.9 路線圖外：寬路、懸浮車、淡江校園（2026-11-14，`feat/kart-hover-tamkang`）

擁有者 2026-11-14 要賽道寬、車沒有輪胎貼地、試做淡江大學地圖、人物縮小建築放大。仍是單機；多人等手感簽核（規則 10）。原作的車名只是擁有者拿來描述，**沒有用、沒有參考**（`IP-CHECKLIST.md` 卡丁車一節的補記）。

- **路寬**：河畔（`riverside.ts`）控制點整體放大 1.25 倍、路寬 18–22 m，回直線前的兩個彎拉順（最小內緣半徑約 13 m）；起終點改在 z = 50 那一點（放大前 z = 40）。漁港（`harbour.ts`）佈局不動、路寬 15–18 m；碼頭的混凝土改到 z = −121.4（路緣外），樹的界線跟著挪。兩張圖的 JSON 都多了 **`revision: 2`**。
- **紀錄分版本**：`TrackJson.revision`（選填，1–999，省略是 1；`parseTrack` 檢查）。`recordKey(track)` 回傳 `id`（revision 1）或 `id@revision`，`spikeLoop.ts` 用它讀寫最佳紀錄、最快單圈與幽靈車（`records.ts` 的 key 與 `Ghost.track`）。改路寬、改佈局就把 revision 加一，舊紀錄留在瀏覽器裡、不再拿來比。
- **懸浮車**（`src/kart/art/kartModel.ts`）：沒有輪子；車身浮在 0.34 m（`HOVER`），慢慢上下起伏（速度越快幅度越小、多一點細震）、甩尾與高速轉彎時往彎內傾（原本的開輪車是往外傾）、煞車點頭、起步與噴射抬頭；車手大頭 Q 版（安全帽半徑 0.34 m、平滑著色），手握把手，把手跟方向鍵轉。車底一片加色混合的光（車身的 `glow` 色，隨起伏放大變淡、噴射時變亮），噴口是發光的圓盤，隨速度變大。三款車身 `KartBody`（`src/kart/bodies.ts`）：`tide` 雙浮筒＋甲板＋兩個噴口、`comet` 圓艙（扁球）＋裙邊＋一個大噴口、`ray` 扁平三角翼（`ExtrudeGeometry`）＋雙尾翼＋兩個噴口；顏色在 `kartTokens.ts` 的 `kartBodies`、共用的在 `kartHover`。尺寸照物理（約 1.5 × 2.6 m）。**只是外觀**：物理一樣。幽靈車用同一個車身、半透明、沒有地上的光。選擇存在 `tku-arcade.kart.body`；換車款會重建場景（和換畫質一樣，時間賽重來）。
- **效果**（`effects.ts`）：甩尾時從後方兩角往外、往後噴火花（加色混合的小點，有重力，每秒 70 個，池子 90 個）、淡淡的灰（每秒 12 團）、地上發光的軌跡（車身顏色、加色混合，1.6 秒淡掉；260 段環狀緩衝，用頂點顏色變暗來淡出，只在有軌跡還亮著時每幀更新）；噴射時每個噴口一道火（一個大噴口的火比兩個小的大）。`KartModel` 改給 `rearContacts`（取代 `rearWheels`）與 `thrusters`（取代 `exhaust`）。
- **淡江校園**（`shared/kart/tracks/tamkang.ts`，id `tamkang`，**暫名**）：原創佈局 1.73 km、路寬 18–22 m：宮燈道（x = 0）往北過起終點（z = 40）、頂端左彎往西、書卷廣場旁的折角、校園西緣的 S 彎往南、海事博物館旁右髮夾彎、往北穿過草坪、頂端左髮夾彎、往南經過商管大樓、最後一個左髮夾彎回宮燈道。主題 `kartThemes.campus`（晴朗的上午，太陽在西南高處）。
- **淡江校園的美術**（`src/kart/art/tamkangArt.ts`，全部程式產生）：
  - **地形**：`tamkangGround(x, z)`：校園是平的山頂（x > −300、z < 280），往西、往南 170 m 內降 24 m 到淡水鎮與河岸（夠淺，車上的視線越過校園邊緣看得到河）；河是一條斜的帶（北岸一點與跨河方向，寬 640 m），河床在水面（−26.5 m）下；北邊遠處有丘陵升起。這張圖不用共用的平地，自己建一張 2.6 × 2.5 km、每 20 m 一格的高度網格（頂點色：校園草地、坡地與鎮上偏沙色）。共用的遠山在河那一側的縮成看不見，其他的放在地形高度上。
  - **觀音山**：河對岸一道 2 km 長、八個峰的山脊（高度場、平面著色），最高約 285 m；它在霧的範圍外，所以 `fog: false`，霧色自己混進頂點色，低畫質也看得到。
  - **地標**（位置是風格化的，不是真的地圖；`TAMKANG_LANDMARKS` 給樹與其他建築避開，測試擋離路太近）：宮燈道兩側每 15 m 一盞宮燈（石座、深綠燈柱、亮的燈籠、上下兩個四角小屋頂；避開起終點門架）；兩側各四棟宮燈教室（白牆兩層窗、紅柱迴廊面向宮燈道、綠色琉璃瓦廡殿頂、深綠簷）與迴廊前的地磚；驚聲意象的塔（18 m 見方、74 m 高、每 15 m 一道棕色腰帶、頂上一層小塔樓與四角錐尖頂）與圓形廣場；覺生意象的圖書館（100 × 40 m、高 30 m、石基座、高窗、頂層退縮、面向路的柱廊與台階）；書卷廣場（六片白色捲曲的開口圓筒、高 11–17 m，圍成一圈）；牧羊草坪（條紋草皮、八棵大樹）；商管意象的玻璃塔（22 m 見方、88 m 高、裙樓、白色角柱、塔頂）；船形的海事博物館（船身、藍色腰線、三層甲板、紅煙囪、桅杆，坐在石台上）；克難坡（從校園西緣往下 190 m 的階梯、扶手與欄杆柱、頂上一座綠瓦門）；路邊一塊石碑寫「淡江大學／TAMKANG UNIVERSITY」（純文字、一般字型，`// i18n-ignore`：是景物不是介面）。校園裡其他的大樓與坡下的淡水鎮用 `scatter` 擺（畫質決定數量）。
  - 共用的路燈與看台在這張圖不放（宮燈與教室取代），輪胎堆照舊。
- **測試**：`tests/kart/tamkang.test.ts`（三張圖的路寬下限、`recordKey`、淡江合法、不自交、起跑格在線後、長度 1.5–1.9 km、自動駕駛三圈 300 秒內不被判逆向、路面與路外 10 m 平坦且在校園內、坡與河、地標離路與不長樹），`tests/kart/track.test.ts`（`revision` 的檢查與 `recordKey`），e2e 從 `/kart` 換車款與選淡江、重新整理後車款還在。
- **數字**：卡丁車 chunk 178.2 → **193.9 kB** gzip（合併 #59 之後 194.1 kB；預算 600 kB；`ExtrudeGeometry` 與淡江的景物）；主站與各遊戲首屏不變。Playwright（Chromium、Intel UHD 770、1280 × 720）淡江校園：高 58 fps、低 60 fps。

### 4.10 路線圖外：手感、技巧、更寬的路與急彎（2026-11-14，`feat/kart-feel-boosts`）

擁有者玩過單機計時賽之後的九點要求。仍是單機；多人等手感簽核（規則 10）。技巧的玩法參考那一類經典卡丁車的手感（玩法可學），**名稱、文字都是自己的**：程式與介面不用原作的說法（`IP-CHECKLIST.md` 卡丁車一節的補記）。

- **速度**（`KART_TUNING`）：極速 30 → **40 m/s**（108 → 144 km/h，噴射 187 km/h），加速 14 → 20（0 到極速 2 秒）；煞車、甩尾最高速（26.5 → 35）、甩尾轉速（1.6 → 1.8）、轉向（2.2 → 2.4）一起調，甩尾角度幾乎不變（33°／23°／13°）。調參面板的三個預設跟著換算。
- **噴射**：一次 1.2 → **2 秒**。**加速條**：每秒 40 → 65 點，另外每放開一次夠長（≥ `chainMinDrift`）的甩尾加 `gaugeDriftBonus` 12 點：約 0.65 秒的甩尾兩到三次就滿（測試釘住）。
- **起跑加速**（`timeTrial.ts`）：倒數時記下油門按下那一刻剩幾秒（`Trial.startPress`，放開就清掉）；到 GO 時按著，而且是在最後 **`startWindow` 0.35 秒**內按下的 → 給 `startBoostDuration` 1.2 秒的全力噴射（`Trial.start = 'boost'`）；更早就按住不放 → **偷跑熄火** `startStallSeconds` 0.8 秒，油門只剩 15% 力（`KartState.stallSeconds`，`'stall'`）；沒按就是普通起跑。早按但放開、再在窗內按，照樣算。
- **收尾加速與連噴**（`physics.ts`，規則 `chainBoosts` 預設開，取代原本「噴射中放開甩尾自動連噴」）：放開一段 ≥ 0.2 秒的甩尾（放鍵，不是減速結束）就開一個 **`releaseWindow` 0.3 秒**的窗；窗內**重新按下**油門（`throttleHeld` 由放到按）就噴一次小噴射 `miniSeconds` = `chainDuration` 0.6 秒，最高速 ×`miniTopSpeedFactor` 1.15、推力 `miniAcceleration` 26（比全力噴射小）。一直按著油門不放不算（要「放開再按」）。**連噴計數** `chain`：收尾加速時連噴窗 `chainWindow` 還開著就 +1、否則從 1 開始；窗在收尾加速或全力噴射時打開（長度 + `chainGrace` 0.5 秒），**甩尾中不倒數**（長彎不斷連），關了 `chain` 歸零。HUD 從第 2 次起顯示「CHAIN ×n」。
- **推滑（boost slide）**：在噴射（全力或收尾）**中開始**的甩尾就是推滑：速度上限用噴射後的直線極速 ×`slideSpeedKeep` 0.97（一般甩尾掉到 `driftTopSpeed`），噴射時間以 `slideBoostDrain` 0.5 倍的速度消耗（彎裡噴射撐兩倍久）；噴射用完就變回一般甩尾。加速條照常累積，放開照樣開收尾加速的窗，所以「收尾加速 → 推滑過彎 → 收尾加速」可以一路接下去。甩尾中才點噴射不算推滑。
- **大字提示**（`callouts.ts`）：起跑加速（綠）、偷跑熄火（紅）、收尾加速（青，小字）、推滑（藍，小字）、連噴 ×n（洋紅）；`calloutAtStart(trial.start)` 在 GO 那一步出。調參面板多一組「技巧」（11 個數字，含新單位「點」）。
- **路寬與急彎**：八台車的碰撞圓（`KART_RADIUS` 1.2 m）並排要 19.2 m，三張圖最窄都 **28 m**（直線 32–34 m）。河畔**重畫**（`revision` 3）：2.1 km，起終點直線、急右彎、連續兩個髮夾彎（右、左）、長直線接遠側、第三個髮夾彎、兩個快速左彎、最後右彎回直線。漁港（`revision` 3）與淡江（`revision` 2）**整張放大**（`HARBOUR_SCALE` 1.6、`TAMKANG_SCALE` 1.5；控制點寫在「圖上單位」，乘上比例才是公尺），再加急彎：漁港碼頭底的快速右彎改成急右彎、西側的折角改成急左右；淡江頂端的左彎收緊繞過高塔、西緣 S 彎改成三個急折。2.35 km、2.68 km。景物照同一個比例擺（`harbourArt.ts` 的 `at()`、`tamkangArt.ts` 的 `metres()`）：位置放大、東西本身的大小不變，所以每個地標還在原本那條路的旁邊；宮燈改在路中心 21 m（路緣外 4 m），迴廊地磚跟著教室；草坪縮窄讓出 S 彎。舊紀錄 key（`riverside@2`、`harbour@2`、`tamkang`）不再拿來比。
- **胎痕**（`effects.ts`）：甩尾時兩個後角另外留一條**深色、半透明的胎痕**（`kartScene.skid`，寬 0.42 m，頂點色第四個值是透明度，6 秒淡掉，840 段環狀緩衝，約 7 秒的甩尾），在發光軌跡下面（`renderOrder`），發光軌跡改細（0.18 m）、亮度 0.6。**修好一個舊 bug**：軌跡的三角形原本面朝地面（被背面剔除），#61 之後的發光軌跡其實從來沒畫出來；現在兩條帶都朝上。一幀最長鋪 8 m（原 3 m），慢的幀在噴射速度下也接得起來。
- **測試**：`tests/shared/kart-boost.test.ts`（加速條兩到三次滿、放開加點、收尾加速的窗與「重新按」、太晚不算、輕點不算、連噴計數與長甩尾不斷、從全力噴射接、推滑保速與噴射撐兩倍、噴射完變一般甩尾、收尾加速後也能推滑）、`tests/kart/timeTrial.test.ts`（起跑加速、偷跑熄火、早按放開再按）、`tests/kart/hud.test.tsx`（新的大字提示兩語）、`tests/kart/tamkang.test.ts`（三張圖 ≥ 28 m、每張至少五個「60 m 內轉超過 75°」的急彎、`recordKey`）、`tests/kart/trackShape.ts`（共用的量路工具；不自交的檢查改成「沿路 90 m 以上的兩點」，髮夾彎的兩條腿不算）。e2e 的連噴改成「放開甩尾與油門 → 等窗開 → 再按油門」。
- **數字**：卡丁車 chunk 193.9 → **196.1 kB** gzip；主站與各遊戲首屏不變。

### 4.11 路線圖外：再快、噴射再長、技巧上限、場景（2026-11-14，`feat/kart-speed-skill`）

擁有者開過 #64：「還是太慢，那款遊戲快的車速度表 300–400；太快玩家自己會慢下來；噴射還是太短；技巧上限太低；場景也要。」仍是單機（規則 10）。玩法參考那類經典卡丁車（玩法可學），**名稱、美術、版面全是自己的**。

- **速度與速度表**：真實極速 40 → **50 m/s**（加速 24、0 到極速 2.08 秒），噴射 ×1.4（70 m/s），疊噴 ×1.55（77.5 m/s）。速度表多乘 **`SPEEDOMETER_SCALE` 1.45**（`spikeLoop.ts`，`KMH_PER_MPS = 3.6 × 1.45`）：極速顯示 **261 km/h**、噴射 **365**、疊噴 **405**。世界仍是真的公尺，賽道不必放大到荒謬；只有錶面放大，跟街機賽車一樣。轉向：抓地在極速時最小迴轉半徑約 40 m（`turnLossAtTopSpeed` 0.5），髮夾彎與急彎一定要甩。
- **速度感**（`camera.ts`、`speedLines.ts`、`Scene.ts`）：視角隨速度變寬（`SPEED_FOV_KICK` 10°，從 30% 極速到極速線性），噴射再加 8°；攝影機在高速時往後拉最多 1.8 m；接近極速起畫**速度線**（56 條加色混合的線，在攝影機空間的一圈，路中間留空，噴射時更亮；一個 draw call）。減少動態時全部關掉。
- **噴射**：一次 2 → **3.25 秒**；收尾加速 0.6 → **0.9 秒**（×1.2）；起跑加速 1.2 → **1.8 秒**。
- **疊噴（Stacked boost）**：存量仍是 2 格；噴射中再發一格，剩下的時間加上一格（上限 `boostMaxSeconds` 6 秒），而且 `boostStackSeconds` 1.2 秒內極速 ×1.55。
- **加速條經濟**：每秒 65 → 45 點、放開甩尾 12 → 8 點；**深淺取捨**：往甩尾方向打（深）加速條 ×1.5、甩尾極速 −10%，往外打（淺）×0.5、不掉；**長甩疲勞**：甩過 1.2 秒後甩尾極速每秒再降 3 m/s；**全力噴射中加速條只累積 25%**（`boostGaugeShare`），所以光靠噴射接噴射撐不久，空檔要靠收尾加速補。**修了 #64 的 bug**：存量滿時加速條停在 100%，發掉一格的那一步就立刻又補一格（等於無限噴射）；現在要「這一步有累積」才轉成存量。
- **甩頭（Flick）**：甩尾鍵點按不到 0.18 秒（至少兩步）就放開，車頭與行進方向一起轉 0.2 弧度（約 11°），保留 98.5% 速度，加速條 +4；兩次甩頭至少隔 0.5 秒（不然連點甩尾鍵可以刷加速條）。
- **反打回正（Counter catch）**：放開甩尾時往反方向打（steer × 甩尾方向 < −0.3），0.35 秒內抓地 ×3，車身馬上回正。
- **撞牆**：碰撞掉速加重（`wallImpactLoss` 0.6、擦牆每秒 10）；撞牆速度 ≥ `wallBreakSpeed` 4 m/s 就**中斷連噴**（連噴計數、連噴窗、收尾加速窗歸零，推滑結束、疊噴結束），提示「連噴中斷」。
- **加速帶（Boost pad）**：`TrackJson.boostPads` 第一次用上：`padsAlong(road, [[index, 往右公尺]])` 擺在直線上、**偏離中線 8 m**（吃不吃是路線選擇）；`course.ts` 的 `onPad` 檢查，壓到就給 1.2 秒全力噴射（不疊）。河畔 4 個、漁港 4 個、淡江 5 個。跳台沒做（物理是平面）。
- **賽道**：佈局不動（不放大），直線再寬 4 m（河畔、淡江 38 m、漁港 36 m），加速帶；三張圖 `revision` 再加一（`riverside@4`、`harbour@4`、`tamkang@3`），物理也變了，舊紀錄不比。實測（三圈，`tests/kart/expert.test.ts`）：新手 2:13–2:50。
- **技巧上限的證明**（`tests/kart/drivers.ts`、`expert.test.ts`）：三個腳本駕駛各跑三圈。**新手**：不甩尾、彎前放油煞車、倒數一開始就按油門（偷跑熄火）。**一般**：純追蹤（pure pursuit），彎需要的轉向超過抓地就甩、甩尾裡用方向調深淺、直線發噴射，但沒有起跑加速與收尾加速。**高手**：同上，再加起跑加速、每次甩尾後放油門一步再按（收尾加速，接著的甩尾就是推滑）。結果：河畔 132.5／116.8／**112.8** 秒、漁港 147.4／135.7／**130.8**、淡江 170.4／150.1／**144.6**（新手／一般／高手）；高手比新手快 11–15%，比一般快 3–4%。測試擋：高手至少比新手快 10%、比一般快、零逆向。
- **場景**（`festival.ts`，三張圖共用，全部程式產生）：起終點後面一座彩色條紋的**拱門**；路兩側每 22 m（低畫質 44 m）一支**旗桿與長條旗**（7 色）；最急的彎外側 2–4 座**看台**，坐滿小觀眾（圓柱身體＋球頭，8 色，每座 5 排 × 8–16 人）；護欄外的**花圃**（最多 260 叢）；遠處一座會轉的**摩天輪**（16 個車廂保持水平）、3–7 個會飄的**熱氣球**、一圈遠方的**天際線**（最多 70 棟，避開海與河）。顏色在 `kartTokens.ts` 的 `kartFestival`。淡江另外把坡下的淡水鎮從 200 加到 320 棟，校園外不再空。數量跟畫質（density）走；每一種是一個 instanced draw call。
- **數字**：卡丁車 chunk 196.1 → **200.5 kB** gzip；主站與各遊戲首屏不變。只在 Playwright 的軟體繪圖（SwiftShader）看過畫面，沒有實機 fps。

### 4.12 路線圖外：甩尾變成真的滑、收尾加速當主角、技巧差距（2026-11-14，`feat/kart-drift-feel`）

擁有者開過 #65：「還是不夠快；甩尾的時候抓地力不該這麼好，要再按一次前進才會有一小段加速，這樣才有接兩次、一路接下去的技巧；手感要像那款經典卡丁車，高手跟新手的圈速要差很多。」仍是單機（規則 10）。只學玩法與物理手感，**名稱、文字、美術、賽道都是自己的**（`IP-CHECKLIST.md` 卡丁車一節補記）。

- **甩尾是真的側滑**（`physics.ts`，取代 #65 的「速度上限型」甩尾）：
  - 新狀態 `KartState.traction`（0–1）。甩尾一開始就歸 0（後輪放掉）；放開甩尾鍵後用 `driftRecovery` 0.4 秒線性回到 1，這段時間車還在滑（`kartSkidding()`：甩尾中或 `traction < 1`，胎痕、火花、甩尾聲、攝影機都看它）。
  - 車頭照舊用 `driftTurnRate` 1.9 ± `driftSteerRate` 0.9 rad/s 轉（往彎內打更深、往外打收淺）；**行進方向**只用 `driftAlign` 2.2／秒慢慢跟上車頭（抓地時是 `grip` 10／秒，中間依 `traction` 線性混合）。所以進甩尾的頭 0.25 秒：車頭已經轉了約 40°，行進方向才轉 11°，車身照原來的方向衝出去，之後才被帶進彎。穩定側滑角（實測）：往內 50°、置中 38°、往外 21°（#65 是 33°／23°／13°）；上限 `driftMaxSlip` 58°，超過時限制的是**車頭**（不再把速度方向硬拉回來）。
  - **側滑磨速** `driftScrub` 64 m/s²：每秒掉 `driftScrub × sin(側滑角) × 速度/極速 ×（1 − traction）`，引擎推力照常沿車頭推。結果：往外打的淺甩與點甩幾乎不掉速（60 → 59 以上）；置中一秒 60 → 53 m/s；往內深甩一秒 60 → 44、兩秒 → 29。拿掉的參數：`driftTopSpeed`、`driftDrag`、`driftDepthFill`、`driftDepthCost`、`driftFatigueAfter`、`driftFatigue`（深淺與長短的代價現在由側滑本身決定）。
  - **加速條**照側滑角累積：`gaugeFillRate` 60 點／秒 ×（側滑角 ÷ `driftGaugeSlip` 35°，最多 1.5 倍），放開一次夠長的甩尾另加 10 點；噴射中仍只有 25%。
  - **反打回正**：放開的那一步或回復途中往側滑的反方向打，`catchSeconds` 0.35 秒內抓地回復快 `catchGrip` 3 倍。
- **收尾加速**（玩法不變：放開 ≥ `chainMinDrift` 0.25 秒的甩尾後，0.3 秒內**重新按下**油門）：改成短而猛的一下：0.7 秒、推力 `miniAcceleration` 64 m/s²、極速 ×1.2（72 m/s）。甩尾掉的速度靠它補回來，補不補差很多：0.8 秒深甩後的兩秒內多跑約 16 m。
- **連噴每一環更快**：連噴第 2 環起每環極速再 +`chainSpeedStep` 3%，最多 `chainSpeedLinks` 4 環（×1.32，79 m/s）。直線上也能連：短甩（一開始往一邊點、馬上往外打收淺，撐過 0.25 秒）→ 放開 → 重按油門，幾乎不掉速，所以高手直線也在甩。
- **雙收尾（Double release）**：收尾加速發出後 `doubleWindow` 0.5 秒內再開始一次甩尾，不管多短（至少兩步），放開就再開一次收尾加速的窗；這第二發把時間**加在**第一發剩下的上面（0.7 + 0.7），連噴 +1，提示「雙收尾！」。一次正式甩尾只能換一次雙收尾（第二發不再開 `doubleWindow`）；點按若拖到 0.25 秒以上就是一次普通的甩尾。`KartState` 多 `doubleWindow`、`doubleDrift`、`doubleArmed`、`doubles`。**甩頭（Flick）拿掉了**：點甩不再瞬間轉車頭（那是假的），點甩現在的用途是雙收尾、微調路線、集一點氣。
- **推滑**：噴射中開始的甩尾只付 `slideScrub` 30% 的磨速（原本是另一個速度上限 `slideSpeedKeep`），噴射推力把速度帶過彎；噴射仍以 0.5 倍消耗。
- **速度**：真實極速 50 → **60 m/s**（加速 28，0 到極速 2.14 秒；煞車 56），錶面倍率不變 ×1.45：極速 **313 km/h**、收尾加速 376（連噴最高 413）、噴射 ×1.45 = 87 m/s **454**、疊噴 ×1.6 = 96 m/s **501**。抓地在極速時最小迴轉半徑約 48 m。碰牆仍是每 0.6 m 檢查一次（`walls.ts`），96 m/s 一步 1.6 m、檢查 3 次，不會穿牆。賽道佈局不動；物理變了，三張圖 `revision` 再加一（`riverside@5`、`harbour@5`、`tamkang@4`），舊紀錄不比。調參存檔的 key 改成 `tku-arcade.kart.tuning.2`（舊數字對不上新物理）。
- **畫面**（`effects.ts`、`camera.ts`、`spikeLoop.ts`，顏色在 `kartTokens.ts` 的 `kartHover.sparkEarned`／`sparkReady`）：甩尾撐過 0.25 秒（已經賺到收尾加速）火花變**金色**且更密；放開後收尾加速的窗開著時，兩個後角噴**淺藍**火花（現在按油門）；任何噴射發出的那一刻，車尾炸出一扇火花、尾焰拉長加粗 0.35 秒；放開後車還在滑時胎痕、火花、煙照出。攝影機在側滑時往車頭方向擺 30%（`SLIDE_SWING`）、跟隨變慢（`SLIDE_FOLLOW` 3.2，平常 5），看得出車被甩出去再拉回來；噴射視角 +8° → +10°。
- **調參面板**：甩尾組多 `driftScrub`、`driftRecovery`、`driftGaugeSlip`；技巧組多 `slideScrub`、`chainSpeedStep`、`chainSpeedLinks`、`doubleWindow`；少了上面拿掉的與甩頭的 5 個。`planted`（甩尾留較多抓地、角度小、磨速少）與 `loose`（更滑、更久、磨更多）跟著重訂。
- **技巧差距**（`tests/kart/drivers.ts`、`expert.test.ts`，三圈秒數，測試釘住 ±2.5 秒）：

  | 賽道 | 新手 | 一般 | 高手 | 高手比新手 | 高手比一般 |
  | --- | --- | --- | --- | --- | --- |
  | 河畔 | 115.7 | 94.8 | **80.0** | 少 31% | 少 16% |
  | 漁港 | 127.4 | 110.8 | **88.0** | 少 31% | 少 21% |
  | 淡江 | 148.3 | 124.4 | **98.7** | 少 33% | 少 21% |

  **新手**：不甩尾、彎前放油煞車、偷跑熄火。**一般**：純追蹤，彎需要的轉向超過抓地就甩，把側滑角維持在「彎要的轉速 ÷ `driftAlign`」，車頭指向出彎方向就放，直線發噴射；沒有起跑加速、沒有收尾加速。**高手**：同上，再加起跑加速、每次甩尾後放油門一步再按（收尾加速）、緊接一個 3 步的點甩再按一次（雙收尾）、直線沒噴射時連續短甩收尾（連噴，最長 40–116 環）、噴射中再發一格（疊噴）。高手三圈 95–104 次收尾加速、53–60 次雙收尾、零撞牆。#65 的差距是高手比新手少 11–15%、比一般少 3–4%。測試擋：高手至少比新手少 25%、比一般少 12%，一般比新手少 8%，秒數不能偏離上表超過 2.5 秒，高手不能撞牆。
- **數字**：卡丁車 chunk 200.5 → **201.1 kB** gzip；主站與各遊戲首屏不變。只在 Playwright 的軟體繪圖看過畫面，沒有實機 fps；**手感沒有人開過**，腳本駕駛只能證明「技巧值多少」，不能證明「像不像」。

### 4.13 路線圖外：放開後滑出去、反打拉回、再按前進才噴；技術型賽道（2026-11-14，`feat/kart-countersteer-tracks`）

擁有者開過 #66 之後：「卡丁車地圖還是太簡單了，要像那款經典卡丁車一樣，甩尾後有剎車痕然後就會滑出去，方向鍵要反方向拉回來然後再按前進才會噴一下，甩得越多集氣越多。」只學玩法與物理手感，**名稱、文字、美術、賽道佈局都是自己的**（`IP-CHECKLIST.md` 卡丁車一節補記）。多人（另一個分支）同時在做；這裡只動物理、賽道、效果，`stepKart` 仍是固定 60 Hz 的純函式，`KartState` 只**多**兩個欄位。

- **四拍的順序**（`physics.ts`，改寫 §4.12 的「放開 → 0.3 秒內重按油門」）：
  1. **按住甩尾＋方向**：和 §4.12 一樣，後輪放掉（`traction` 0）、車頭先轉、車身照原方向滑，留胎痕。
  2. **放開甩尾鍵**：車**繼續往外滑**（滑出，slide-out）。抓地用 `driftRecovery` **0.9 秒**（原 0.4）線性回來，而且行進方向跟上車頭的速率改用 `traction²` 混合（前半段幾乎還是甩尾的 2.2／秒，後半段才咬住），所以不會彈回來；車頭還被甩尾的轉速帶著繼續轉（`slideCarry` 0.45 × `driftTurnRate` ×（1 − `traction`）；往甩尾方向打會照甩尾中的幅度繼續轉），引擎的推力只剩 20% ＋ 80% × `traction²`（輪子空轉，`SLIDE_PULL`），側滑磨速照舊。新狀態 `KartState.slideDirection`（滑出時是剛才甩尾的方向，抓地回來就歸 0）。
  3. **反打**：滑出途中（放開的那一步也算）往甩尾的**反方向**打超過 0.3（`COUNTER_STEER`）就是「拉回來」：`catchSeconds` **0.25 秒**內抓地回復快 `catchGrip` **4.5 倍**（約 0.2 秒咬住），方向盤恢復正常的抓地轉向（把車頭拉回來），車頭不再被帶著轉。
  4. **再按前進**：如果這次甩尾夠長（≥ `chainMinDrift` 0.25 秒，或是雙收尾的點甩），反打的那一刻才打開 **`releaseWindow` 0.4 秒**的窗（`KartState.burstReady`：滑出中、還沒反打、有一發等著）；窗內**重新按下**油門（同一步也算）才噴收尾加速（0.7 秒、推力 64、極速 ×1.2，數字沒變）。**沒有反打就沒有噴**：先按油門再反打不算（要放開再按）；滑出結束（0.9 秒）還沒反打，這一發就沒了；還沒拉回來就開始下一次甩尾，也沒了。
- **實測**（極速 60 m/s，往內深甩 0.6 秒後放開；放開時 54 m/s、側滑角 47°）：
  - 不反打：側滑角 0.9 秒才收完，車頭多轉 23°，速度最低掉到 47 m/s，放開後 1.4 秒才回到 60。
  - 放開後 0.15 秒反打、0.25 秒重按油門：0.4 秒內回正（車頭拉回 15°），放開後 0.6 秒就是 72 m/s；兩秒內比不反打多跑約 30 m。
- **雙收尾、連噴、推滑**：規則不變，但每一發都要反打。雙收尾 = 噴完 `doubleWindow` 0.5 秒內點一下甩尾 → 反打 → 再按前進。直線上的連噴 = 往一邊點甩、馬上反打收淺、放開（方向鍵已經在反打，窗立刻開）、重按前進。
- **集氣**（「甩得越多集氣越多」）：加速條每秒 `gaugeFillRate` 60 點 ×（側滑角 ÷ 35°，最多 1.5）×（**速度 ÷ 極速**，最多 1.25）×（甩尾中 1，滑出中 1 − `traction`）。也就是甩得越久、越深、越快（側著滑過的路越長）集得越多，**滑出的那一段也算**。往內深甩 0.6 秒：甩尾中 30 點＋放開 10 點＋滑出 8–18 點（馬上拉回來少、放著滑多，但放著滑掉的速度更多）；兩到三次好的甩尾集滿一格。噴射中仍只有 25%。
- **畫面**（`effects.ts`、`callouts.ts`、`spikeLoop.ts`、`Hud.tsx`）：胎痕在甩尾與滑出時都留（`kartSkidding()`），留在路上 **14 秒**（原 6 秒）、不透明度 0.7（原 0.55）、環狀緩衝 840 → 2400 段（約 20 秒的側滑）。金色火花從「甩尾夠長」一路噴到反打為止（意思是：現在反打），反打後變淺藍（現在按前進）。大字提示多兩個：放開夠長的甩尾時「反打拉回來！／Counter-steer!」（`counter`，琥珀色小字），拉回來時「拉回來了！按前進／Caught! Throttle!」（`catch`，改成只在有一發等著時出）。說明文字兩語都改了。加速條一直在 HUD 上（沒動）。
- **調參面板**：甩尾組多 `slideCarry`（滑出時車頭繼續轉的比例）；`driftRecovery` 改名「不反打時滑出去多久」（上限 1.5 → 2 秒）；`releaseWindow` 改名「反打後按油門的時機寬度」；`catchGrip` 上限 6 → 8。`planted`（滑出 0.6 秒、`slideCarry` 0.25、窗 0.5 秒）與 `loose`（1.2 秒、0.6、0.3 秒）跟著重訂。調參存檔的 key 沒換（多的數字用預設補上）。
- **賽道**（三張都重畫或加彎，`revision` 各加一，舊紀錄不比：`riverside@6`、`harbour@6`、`tamkang@5`；路寬仍 ≥ 28 m，八台車並排）：
  - **河畔**：整張重畫成技術型，2.10 → **2.49 km**。主直線（300 m）→ 急右 → 第一組 S 彎（左、右）→ 右髮夾 → 左髮夾（連續兩個折返）→ 短直線、右彎上遠側 → 左右左三連折 → 第三個髮夾 → 往北、左彎 → 中段再兩個折返髮夾（左、右）→ 左彎往南 → 最後一個長右彎回直線。「60 m 內轉超過 75°」的急彎 8 → **15** 個，最長的直線只剩主直線。
  - **漁港**：2.35 → **2.74 km**。西側原本那條長長的快速弧線拿掉，頂上那一段繼續往西，接**兩個新的折返髮夾**（右、左）一路往海邊下去，岸邊的急折與回主直線的右彎留著；全圖六個髮夾。景物是用「離路多遠」擺的，自己讓開。
  - **淡江**：2.68 → **2.74 km**。草坪旁往北那一段加一個右左急折（避開商管大樓），商管大樓旁往南那一段改成**四連 S 彎**；地標都沒動（測試擋地標離路 3 m 以上）。急彎 8 → **12** 個。
  - 加速帶改放在新的直線上（河畔 4、漁港 5、淡江 4）。
  - **高低差沒做**：物理是平面（`stepKart` 只有 x、z），路面、牆、檢查點、景物、攝影機都假設 y = 0；要做得先把高度加進賽道格式與繪圖，不是便宜的改動，留給之後（見 NEXT）。
- **技巧差距**（`tests/kart/drivers.ts`、`expert.test.ts`，三圈秒數，測試釘住 ±2.5 秒）：

  | 賽道 | 新手 | 一般 | 高手 | 高手比新手 | 高手比一般 |
  | --- | --- | --- | --- | --- | --- |
  | 河畔 | 138.9 | 114.1 | **98.0** | 少 29% | 少 14% |
  | 漁港 | 148.4 | 120.9 | **100.7** | 少 32% | 少 17% |
  | 淡江 | 158.5 | 119.3 | **96.2** | 少 39% | 少 19% |

  **高手**的腳本多了一步：每次放開甩尾後，放掉油門、往反方向打兩步（反打），再重按油門；雙收尾的點甩與直線上的短甩也一樣。**一般**駕駛不反打、不重按，放開後照樣滑出去再靠抓地修回來。高手三圈 102–117 次收尾加速、73–78 次雙收尾。腳本是固定的配方、只走路中間，在比較窄的新彎偶爾會擦到牆（漁港、淡江各 1 次，河畔 0 次），測試放寬成「重撞最多 2 次」（原本是 0）。測試仍擋：高手至少比新手少 25%、比一般少 12%。
- **測試**：`tests/shared/kart-boost.test.ts`（放開後等反打、不反打不噴、先按油門不算、同一步算、整段滑出都能反打、過了就沒、新甩尾放棄舊的一發；加速條照深度 × 速度、越久越多、滑出也算）、`kart-physics.test.ts`（放開後 0.3 秒還側著 25° 以上、車頭繼續轉、掉速；反打 0.3 秒內回正、車頭拉回、之後快 4 m/s 以上；30 與 144 fps 結果一樣）、`tests/kart/tamkang.test.ts`（三張圖都不自交、「40 m 內轉 60°」的彎至少 9 個、新的 `recordKey`）、e2e 的收尾加速改成「放開 → 按反方向 → 等窗開 → 按前進」（鍵盤與手把）。
- **數字**：卡丁車 chunk 201.1 → **201.6 kB** gzip；主站與各遊戲首屏不變。畫面在 Playwright 的軟體繪圖看過（滑出時的胎痕與金色火花、「反打」提示、收尾加速、胎痕 10 秒後還在、三張圖的小地圖）；漁港與淡江新加的那幾段沒有逐彎開過看景物；**手感沒有人開過**，時機窗（滑出 0.9 秒、反打後 0.4 秒）是起始值。

### 4.14 L1–L3：多人競速房（`e2-t11` `e9-t01` `e9-t02` `e9-t03` `e9-t04` `e9-t07` `e9-t08` `e9-t09`，2026-11-14）

擁有者 2026-11-14：「能不能趕快放開多人同時玩開房了嗎」——**不等手感簽核（規則 10 由擁有者豁免），多人與手感並行**。線上格式、門檻與實測在 [`KART-NETCODE.md`](KART-NETCODE.md)。

- **`RealtimeModule`**（`shared/games/types.ts`，`GameModule.realtime?`）：回合制的 GameModule 多一半即時的部分。`frame(state, memory, seat, bytes, now)` 收一個座位的二進位 frame，回「要轉給其他人的 bytes（或 null 丟掉）」與「以 `system` 身分套用的動作」；`clock(state, now)` 在每次變更後回需要伺服器時間的動作（kart 的 `goAt`）；`memory()` 是這一局只在記憶體的暫存（被趕出記憶體就重來，模組要能從下一批 frame 與 state 接回）。動作照樣進動作紀錄，所以重播仍然是「種子＋動作」。
- **RoomHost**（`worker/room-host.ts`）：`binary(conn, data)` 取代 realtime 遊戲的 `badFrame`（回合制遊戲收到二進位照舊關閉連線）：只收已入座、在這局裡的座位，丟給模組，`relay` 前面加座位 byte 用 `sockets.sendBinary` 送給其他已 join 的連線，動作走 `systemAction`→`accept`。`accept` 與開局之後跑 `runClock`（同一個 `now`，最多 4 輪，有防重入旗標）。對時是二進位（`CLOCK_FRAME` 255 開頭，9 bytes 進、17 bytes 出），任何已 join 的連線都回伺服器時間，不進 view、不動 `rev`；用二進位是為了不讓 JSON 解析進首屏。`worker/room.ts` 把 `ArrayBuffer` 交給 `binary`。
- **`kart` GameModule**（`shared/games/kart/`，Worker 才有 `rules.ts`）：state 是 `track`、`laps`、`phase`（loading → countdown → racing → finished）、`goAt`、每人 `loaded`／`lapMs`／`finishMs`／`out`。座位只能送 `loaded`；`start`（載入等 25 秒）、`schedule`、`go`（4 秒倒數計時器）、`lap`、`retire`、`close` 都是 `system`。沒有隱藏資訊，view 是 state 加 `you`。結果依完賽時間，未完賽依圈數，note 是時間字串。房間選項：賽道（`select`，選項由 `shared/kart/tracks/list.ts` 的 id 產生，`registry.ts` 對應賽道，型別保證兩邊一致）、圈數 1–9。1–8 人。
- **裁定**（`shared/kart/race.ts`）：`judgeFrame` 做合理性檢查（速度、tick、跳躍、重置落點、舊 frame、1 秒後重新同步）與 gate 計數（`passGates` 沿兩個 frame 間的線段，最多 3 個；車自己的計數只在多一個 gate 且人在那個 gate 後面 60 m 內才採信）。`gridSpot` 把賽道的起跑格（目前每張 6 格）照同樣的間隔往後延伸到 8 格。`raceProgress` 給名次用。`bumpKart` 是車對車推開。
- **瀏覽器**：`useRoom` 多一個 `realtime` 頻道（`send`、`pingClock`、`listen`；不經 React），`roomConnection` 的 `sendQuiet` 送 frame 與對時（不算「等回覆」的點按）、`binaryType = 'arraybuffer'`。**首屏**：大廳只多卡丁車的名稱、簡介與「單人試跑」；選項與賽道名稱（`i18n.options.ts`）由等待室的 lazy chunk 註冊（`src/i18n/waitingExtras.ts`），「即將推出」卡片拿掉了（沒有遊戲在裡面）。陞官圖完整版首屏 149.9 kB（上限 150）。`src/games/kart/KartScreen.tsx`（遊戲畫面 chunk，127.4 kB 首屏）：有車的人全螢幕 `src/kart/race/RaceView.tsx`（卡丁車 chunk，lazy），比賽結束後是房間的結果面板與房主的「再來一局」；沒車的人看伺服器的名次表（觀戰是 L5）。
- **賽道迴圈的掛勾**（`spikeLoop.ts` 的 `SpikeNet`，只加不改）：起跑格、房間圈數、倒數改用房間的 `goAt`（沒有 `goAt` 前停在格子上）、每步之後送 frame、其他車的推開、每幀畫其他車與名牌；多人賽不存紀錄與幽靈車。`Scene.ts` 多 `others()`（其他車的模型，依座位建立與移除）與 `project()`（名牌的螢幕座標）。
- **其他車**（`src/kart/race/remotes.ts`）：100 ms 插值、每台車自己學時鐘差、最多外推 200 ms、重置直接跳。`netRace.ts` 管對時、送出、名次（完賽的依伺服器時間，其他依 gate 進度）與「連線不穩」。
- **大廳**：卡丁車從「即將推出」變成正式卡片（建立房間＋「單人試跑」連到 `/kart`，`GameMeta.tryAlone`）；房主在等待室選賽道與圈數。單人計時賽 `/kart` 不變。
- **測試**：`tests/kart/net.test.ts`、`tests/kart/race.test.ts`（裁定、格子、碰撞）、`tests/games/kart.test.ts`（harness 隨機局、流程、從 frame 裁定到完賽、退賽）、`tests/worker/room-realtime.test.ts`（轉送、對時、`goAt`、整場到結果）、`e2e/kart-race.spec.ts`（兩個瀏覽器 context、`?autopilot`、河畔一圈到結果）。
- **後來補上的**：道具（L4，§4.15）、投射型道具與觀戰重播（L5）、選車與角色（N3）。**壓測**（`e9-t11` 的數據部分）：`npm run kart:loadtest`（`scripts/kart-loadtest.ts`、`scripts/kart/loadtest-bot.ts`、純邏輯的統計與報表 `scripts/kart/loadtest-report.ts`）在一個 Node 程序裡開 N 個機器人，用真的 WebSocket 協定開房、入座、選車、對時、跑物理＋`autopilot` 送 frame、拿箱用道具，跑完由房主 `dissolve`；數字在 `KART-NETCODE.md` §8。**還沒做**：兩台不同裝置／兩種網路（`e9-t04`）、真人 6 人實測（`e9-t11` 的手感部分）。

### 4.15 L4：道具賽與直接型道具（`e9-t05` `e9-t06a`，2026-11-16）

線上格式與數字在 [`KART-NETCODE.md`](KART-NETCODE.md) §10。

- **`shared/kart/items.ts`**（瀏覽器與 Worker 共用）：道具 id（`boost` `shield` `tow` `headwind` `swap`）、`ITEM_TUNING`（所有秒數與距離）、`itemBoxes(track)`（每圈 3 排 × 5 個，放在 gate 上、不放終點線，從 gate 算所以每張圖都有、改圖會跟著動）、8 bytes 的道具 frame（`pickup`／`use`）、`ITEM_TABLE`（依名次前段／中段／後段的權重）與 `drawItem`、`rollFor(seed, n)`（決定性的抽籤）。
- **房間**（`shared/games/kart/rules.ts`）：選項多 `mode`（`items` 預設／`race`）。state 多 `mode`、`seed`、`boxes`（每個箱子回來的伺服器時間）、`draws`、`events`（最近 16 個用掉的道具）、`used`；每位車手多 `item` 與 `shieldUntil`。`realtime.frame` 收到道具 frame 就走 `judgeItem`：拿取看箱子在不在、手上空不空、伺服器最後看到的位置往前 0.25 秒的線段離箱子 12 m 內，依名次抽一個，回 `got`；使用看手上是不是那個道具、有沒有人可打，回 `use`（`targets`、被泡泡罩擋下的 `blocked`、調包的 `warps`）。兩個都是 `system` 動作，進動作紀錄、可重播；道具 frame 不轉送。
- **調包**：伺服器在記憶體的 `Tracked.warp` 記下每台車要跳去的位置與 gate 數；那台車下一個帶重置旗標、落在那裡 30 m 內的 frame 就照收，gate 數換成對方的（`judgeFrame`）。只准同一圈，房間記的圈數才不會錯。
- **瀏覽器**（`src/kart/race/netRace.ts` 的 `adjust`、`props`）：每一步讀房間 view 的新 `events`，套到自己的車（`shared/kart/itemEffects.ts`：`boostKart`、`headwindStep`、`towStep`、`warpRun`；調包算一次重置，攝影機跟著跳）；開過箱子送 `pickup`（送出後那個箱子在本機先藏 0.7 秒）、按道具鍵送 `use`。效果的時間用對好的伺服器錶算。`spikeLoop.ts` 的 `SpikeNet` 多 `adjust`（每步）與 `props`（每幀，畫道具箱與泡泡），只加不改；單機計時賽不受影響。
- **畫面**：`src/kart/art/itemArt.ts`（原創造型：立在角上的琥珀色半透明立方體、淡色核心，上下浮動旋轉；泡泡罩是藍色半透明球），色值在 `kartTokens.ts`；`src/kart/race/ItemHud.tsx`（道具欄、自己畫的線條圖示、提示）。輸入多一個 `item` 動作（`shared/kart/input.ts`，C／Q、十字鍵上），「操作設定」自動多一列。
- **測試**：`tests/kart/items.test.ts`（箱子位置、frame、抽籤權重、四種效果）、`tests/games/kart-items.test.ts`（先到先得、回來時間、離太遠、第一名只拿順風或泡泡罩、5 種道具的對象、泡泡罩擋一次、調包同一圈與跳躍被收）、`e2e/kart-race.spec.ts`（兩個瀏覽器道具賽一圈，有拿有用）。
- **L5 投射型（`e9-t06b`，2026-11-17）**：`shared/kart/shots.ts`（冰雹 `hail`、雷雲 `cloud`、泥水坑 `puddle`，暫名）。state 多 `shots`（投射物：起點、時間、速度、結束時間，位置由這些算出來，不逐格推進）；`use` 多帶 `shot`；新的 `system` 動作 `hit`。命中在 `realtime.frame` 裁定：frame 被 `judgeFrame` 收下後，用那台車上一個 frame 到這個 frame 的直線掃過每顆投射物（`shotHits`），打到就回 `hit`，`reduce` 判泡泡罩、拿掉投射物、加一個 `hit: true` 的事件。瀏覽器讀到打中自己就套 `stunStep`（`itemEffects.ts`）；`itemArt.ts` 畫冰球、三團烏雲加黃色閃電、扁平泥坑（色值在 `kartTokens.ts`）；道具欄多 3 個線條圖示。`ITEM_TABLE`：第一名多泥水坑，中段多冰雹與少量雷雲，後段雷雲最多；第一名永遠拿不到冰雹與雷雲。測試：`tests/kart/shots.test.ts`（生成、飛行、撞牆、掃掠命中、閃開、泥水坑對主人的延遲、雷雲到時、保留上限、暈）、`tests/games/kart-shots.test.ts`（房間裡丟、打中、泡泡罩擋、完賽不打、動作檢查）。線上格式在 `KART-NETCODE.md` §10.1。
- **沒做（下一步）**：道具音效、別人被打到時的外觀（現在只有被打的人自己看得到減速與提示；被打的車沒有打轉動畫）、正式名稱與外觀（`e10-t01`）。

### 4.16 L5：觀戰與整場重播（`e9-t10`，2026-11-17）

資料從哪來、大小與流量的取捨在 [`KART-NETCODE.md`](KART-NETCODE.md) §11。**伺服器與協定都沒改**：旁觀者本來就收得到所有 frame，重播由每個瀏覽器自己錄。

- **`shared/kart/replay.ts`**（純函式）：`createKartTape`（每台車降到 10 Hz、差分編碼，15 bytes 一個樣本）、`decodeTape`、`sampleAt`（內插、朝向走短邊、重置不內插）、`createReplayRecorder`（frame、道具 `events`、手上道具的變化、結果）、`encodeReplay`／`decodeReplay`（一包，留給 R2）、`openReplay`（時間軸起訖）、`advancePlayhead`／`seekPlayhead`／`togglePlayhead`／`stepSpeed`、`lapsAt`／`heldAt`／`shieldsAt`／`shotsAt`（投射物：錄房間 view 的 `shots`，時間換成從 GO 起算的 ms，提早從 `shots` 消失的就當在那一刻打中，播放時用 `shotPosition` 算位置）。觀戰畫面也照 view 的 `shots` 畫投射物。
- **`shared/kart/watch.ts`**（純函式）：`watchOrder`（完賽依時間、比賽中依進度、退賽最後）、`cycleSeat`、`keyCommand`、`padCommands`（標準手把：LB RB／十字鍵左右換車、Y 視角、A 播放、扳機 ±5 秒、十字鍵上下速度）。
- **錄製**：`src/games/kart/useRaceRecorder.ts` 在 `KartScreen`（遊戲畫面 chunk，不含 three.js）裡，每個 seed 一份；聽 `realtime` 的轉送 frame，並包一層 `send` 把自己送出的 frame 也錄下來（`RaceView` 拿到的是包過的 `realtime`，`netRace.ts` 不用改）。
- **畫面**：`src/kart/watch/`（卡丁車 chunk，lazy）：`watchLoop.ts`（沒有自己的車的場景迴圈：所有車都當「其他車」畫，攝影機跟一台，每幀讀手把）、`SpectateView.tsx`（即時，`remotes.ts` 插值）、`ReplayView.tsx`（重播，`sampleAt`）、`WatchParts.tsx`（HUD 與按鈕）、`watchDom.ts`（按鍵、名牌）、`serverClock.ts`（旁觀者的對時）。`Scene.ts` 只多一個 `watch(pose, chased, seconds, overhead)`：藏起自己的車、車後或俯瞰的攝影機。
- **接到房間**：`KartScreen` 決定畫什麼：沒座位或退賽 → 觀戰（可關掉看名次表）；車手 → `RaceView`，完賽面板多一個「看其他人跑」（`onWatch`）；結束後結果面板（`resultExtra`）多「看重播」。字串在 `shared/games/kart/i18n.watch.ts`（獨立一檔，跟著比賽畫面的字串註冊）。
- **沒做（下一步）**：重播存 R2／分享連結、晚來的人拿到整場（要房間錄，見 KART-NETCODE §11 的表）、重播裡的道具箱、自由視角（PRD 寫的「自由視角」先用俯瞰代替）。

### 4.17 N2：道具型賽道「燈籠老街」（`e10-t04a` `e10-t04b`，2026-11-17，`feat/kart-track-3`）

N2 提前做（前提 L5 還沒完成；擁有者 2026-11-17 要求繼續開發卡丁車；投射型道具在 #82，已先合併）。設計理由與給擁有者試的在 e10 epic 的「N2」一節。

- **佈局**（`shared/kart/tracks/oldstreet.ts`，id `oldstreet`，暫名「燈籠老街」／"Lantern Old Street"）：和其他三張一樣用控制點＋封閉 Catmull-Rom 樣條（`spline.ts`）畫，每 6 m 一點、每 7 點一個 gate（58 個 gate），一圈 **2.42 km**，最窄 28 m（後巷與髮夾彎），直線 40–44 m，起終點在河邊步道 z ≈ 86（往北）。`revision` 省略（第一版是 1，`recordKey` 就是 `oldstreet`）；改佈局時照慣例加 `revision`。
- **分岔**：格式裡的路還是**一條封閉中線**（沒有加「分支」到賽道格式），分岔是「很寬的路＋路中間一圈牆」：廟口那段路寬 84 m（`FORK_WIDTH`），寬度 ≥ 82 m 的路點上，中線右邊 7–13 m（`ISLAND_INNER`、`ISLAND_OUTER`）是一座攤販島，邊緣與兩端的尖頭用 `walls`（110 段，封閉）圍起來。中線在外道裡、離島 7 m，所以 gate、復位點、逆向判定、小地圖、自動駕駛都不用改；內道（島到內側路緣）最窄 28 m（測試用牆到路緣的實際距離擋）。`parseTrack` 的路寬上限 60 → **90 m**（只為了這段，其他檢查不變）。
- **道具箱照賽道資料**（`shared/kart/items.ts`）：`itemBoxes(track)` 在賽道有 `itemBoxes` 時直接用（最多 255 個，pickup frame 用一個 byte 指箱子），否則照舊從 gate 算每圈 3 排 × 5 個。房間（`rules.ts`）與瀏覽器（`netRace.ts`）本來就都呼叫 `itemBoxes(track)`，所以不用改；另外三張圖的箱子位置不變。
- **選得到的地方**：`shared/kart/tracks/list.ts` 的 `RACE_TRACK_IDS` 與 `registry.ts`（多人房間的賽道選項）、`spikeLoop.ts` 的 `SPIKE_COURSES` 與 `TRACKS`（`/kart` 的「場地」選單，`?track=oldstreet`）、兩個 i18n 檔的名稱。最佳紀錄、最快單圈、幽靈車照 `recordKey`，和漁港一樣不用改。
- **小地圖**（`Minimap.tsx`）：多一個選填的 `walls`，把路緣以外的牆（這張的攤販島）畫在路上，看得出分岔；另外三張沒有 `walls`，畫面不變。
- **美術**（`src/kart/art/oldStreetArt.ts`，全部程式產生）：主題 `kartThemes.night`（深藍到紫的夜空、月亮用既有的太陽盤畫在西北、半球光調亮到看得清路）；河（步道西邊，水面暗藍、加色混合的燈影、石砌岸與欄杆）；地面鋪石板（canvas 畫的錯縫磚）；攤位（櫃台、亮的櫃台燈條、條紋雨棚、發光招牌、櫃台上的貨，全部 instanced、每攤隨機配色）沿夜市街、燈籠巷、老街、店屋街與攤販島；夜市街與老街每 18 m 一條橫過路面的燈籠串（9.4 m 高、往下垂）、步道河側的燈籠柱；紅磚店屋（亭仔腳拱廊與亮窗用 emissive 貼圖）；廟埕上的廟（石台、紅牆紅柱、兩層橘色歇山意象的屋頂、香爐、燈籠）；攤販島兩端各一塊發光的黃色箭頭板。共用的樹、燈柱、輪胎堆、看台、比賽日佈置照舊（樹不長在河岸與廟埕）。招牌只有顏色、**沒有文字**。`trackArt.ts` 的路外牆改共用一個材質（這張圖的島有 110 段）。
- **畫質**：攤位、燈籠、店屋照 `density`（低一半、中三分之二、高全部）。
- **測試**：`tests/kart/oldstreet.test.ts`（合法、在房間選單、`recordKey`、長度、最窄 28 m 與兩條道各 28 m 以上、不自交與路緣不折疊、島是封閉的牆且不擋復位點與起跑格、內道比外道最貼的線短 70 m 以上、道具箱照檔案擺且都在路上、不在內道、不在終點線、自動駕駛三圈不逆向；河與廟離路、廟上不長樹）；`tests/kart/items.test.ts` 改成「沒有自己箱子的賽道」每圈 15 個。
- **數字**：卡丁車 chunk 230.4 → **234.3 kB** gzip（預算 600 kB）；主站與各遊戲首屏不變（房間選項只多一個 id 與兩個名稱字串）。
- **沒做**：跳台與高低差（物理是平面）；人甩尾實測與多人道具賽實測；攤位與燈籠的動畫（只有招牌亮度微微閃、河水流動）；夜景在實體手機上的亮度。

### 4.18 N3：車款 6、角色 4、選車畫面（`e10-t05a` `e10-t05b`，2026-11-17）

名稱與數值表在 [`KART-WORLD.md`](KART-WORLD.md)（草稿，名稱待拍板）。

- **`shared/kart/karts.ts`**（瀏覽器與 Worker 共用）：`KART_IDS`（6）、`DRIVER_IDS`（4）、每台車的級別與五項點數（−2～+2）。`applyKart(tuning, id)` 把點數換成物理參數的倍率（極速 `topSpeed`、加速 `acceleration`、操控 `turnRate`／`driftTurnRate`／`driftSteerRate`、集氣 `gaugeFillRate`），疊在標準調校或調參面板的數字上；`kartMass` 給車撞車用。`tide` 全 0＝原本的手感。
- **套用**：`/kart` 與比賽畫面把 `applyKart` 後的 tuning 交給 `spikeLoop`（物理本身沒改）；`bumpKart` 多一個自己的質量與對方的 `mass`，輕的分到比較多的推力（相等時和原本一樣各一半）。
- **線上**：frame 第 2 個 byte＝車 index（低 4 bit）＋角色 index（高 4 bit）（`loadoutByte`／`loadoutOfByte`；舊的 0–2 讀成同一台車、第一個角色）。別人的車照這個 byte 畫。伺服器 `judgeFrame` 多一個 `speedCap`，房間用 frame 那台車的 `speedCapFor`（該車極速 × 疊噴倍率 × 1.5）；`SPEED_CAP` 改成最快那台車的上限。
- **等待室同步**：協定的 `set_look`（`RoomMember.look`，格式 `^[a-z0-9-]{1,16}(\.[a-z0-9-]{1,16})?$`，房間不懂內容；卡丁車放 `kart.driver`），存在成員紀錄裡，任何狀態都能改。等待室在卡丁車房 lazy 載 `src/kart/roster/RoomGarage.tsx`：進來就把瀏覽器存的選擇送出去，列出每個座位的選擇。比賽本身不讀 `look`，讀瀏覽器存的選擇（兩者同一份）。
- **模型**：`src/kart/art/kartModel.ts` 的車身（`tide` `comet` `ray`）＋ `rosterBodies.ts`（`crab` `heron` `flyfish`）；車手抽到 `driverModel.ts`，裝在車身的 `seat`（掛點）上。顏色在 `kartTokens.ts` 的 `kartBodies`（車）與 `kartDrivers`（角色）。
- **畫面**：`src/kart/roster/RosterPicker.tsx`（純 DOM，選車、數值條、選角色），`/kart` 用 `GaragePanel.tsx` 包成面板，等待室用 `RoomGarage.tsx`。字串在 `shared/kart/i18n.roster.ts`（併進 `KART_MESSAGES`，等待室只註冊這一份；原本三台車的名稱也搬來這裡，內容沒改）。
- **測試**：`tests/kart/karts.test.ts`（點數加總 0、PRD 範圍、極速差 ≤ 3%、物理實測、調參範圍、byte 與 look 來回、每台車的速度上限、房間照 frame 的車裁定、重量）、`tests/kart/roster.test.tsx`（車庫與等待室）、`tests/worker/room-host.test.ts`（`set_look`）。

### 4.19 路線圖外：被打中的回饋、道具音效、換車再來（2026-11-17，`feat/kart-hit-feedback`）

- **`src/kart/hitFx.ts`（純函式，沒有 three.js、沒有 WebAudio）**：`effectsOf(event)` 把房間的一個道具事件變成效果：投射物命中（`hit: true`、沒被擋）＝那台車 `spin`，長度就是暈的時間（`SHOT_TUNING.stunMs`）；被泡泡擋下（命中或逆風、調包的 `blocked`）＝`pop`。`cuesOf(event, seat)` 決定這個車手聽到什麼（自己用的道具、被打、打中別人、泡泡破；觀戰 `seat = null` 沒有聲音）。`spinPose(經過, 長度)`：偏航角先快後慢、結束剛好整數圈（`SPIN_TURNS` 2），三下越跳越低的彈跳（`HOP_HEIGHT` 0.9 m），一點左右晃；`shakeOffset` 鏡頭晃動隨時間衰減。`spinsAt`／`shakeAt`／`crossed`／`hitFrameOf` 把一串效果在某個時刻變成「每台車的轉角、要噴的粒子、鏡頭晃動」。`createHitFeed(seat, 起始事件號)` 給即時畫面：每個事件只讀一次，舊效果丟掉。
- **畫**：`Scene.ts` 多一個 `hits(frame)`（在 `others`／`draw` 之前呼叫）：轉角、高度、側傾**只加在畫出來的模型群組上**（`rotation` 順序 YXZ），車的位置、朝向、物理都不動；自己的車用 `OWN_KART`（−1）。晃動加在車後攝影機的位置上，`prefers-reduced-motion` 時不加。粒子在 `src/kart/art/hitArt.ts`：池化 96 個四角星精靈＋6 個閃光，第一次有命中才建立；顏色 `kartScene.hitStar`、`hitFlash`、`popShard`。
- **誰算**：車手由 `netRace.ts` 的 `fx(pose)`（`SpikeNet` 新的選用欄位）讀房間的 `events`，時間用對好的伺服器錶；觀戰（`SpectateView`）用同一個 `createHitFeed`；重播（`ReplayView`）從錄到的事件一次算出所有效果，播放時看時間點，只有「正常往前播」經過命中那一刻才噴粒子（拖時間軸不噴）。重播事件多記 `hit`（`shared/kart/replay.ts`，選用欄位，格式版本不變）。
- **HUD**：`src/kart/race/HitHud.tsx`：自己被打時畫面邊緣紅光＋「被打得團團轉！」，持續暈的時間（`RaceView` 從事件判斷）。原本的道具提示照舊。
- **音效**：`src/kart/itemSounds.ts` 是配方（音高滑動的振盪器或掃濾波器的噪音，各幾毫秒到 0.7 秒），`kartAudio.ts` 的 `cue()` 照配方合成，接在卡丁車的總音量上，網站靜音時不出聲。拿到道具由 `netRace` 看自己手上從空變有。造型都是自己的簡單音形（叮、掃頻、呼嘯、悶響），不模仿任何遊戲。
- **換車再來**：`RoomParts` 多一個選用的 `onSetLook`（`RoomPage` 傳 `room.setLook`）；`KartScreen` 結束後結果面板多「換車或換角色」，在下面 lazy 載入等待室同一份 `RoomGarage`（存瀏覽器、`set_look` 同步；伺服器本來就允許任何狀態改 `look`）。再來一局時 `RaceView` 掛載才讀瀏覽器的選擇，所以用的是新車。單機 `RaceCenter` 多一個選用的 `onGarage`，`SpikePage` 打開車庫面板；選了車場景照舊重建並重新起跑。
- **測試**：`tests/kart/hitFx.test.ts`（轉角單調、結束整圈、彈跳範圍與衰減、晃動、事件→效果、事件→音效、每個音效都有且短、時刻的效果、即時事件流）、`tests/kart/replay.test.ts`（錄 `hit`）、`tests/kart/race.test.tsx`（完賽畫面的換車按鈕）。

### 4.20 路線圖外：對戰電腦（2026-11-17，`feat/kart-bots`）

擁有者要求「繼續開發卡丁車、不停做」：一個人也能跑道具賽。`/kart` 頂欄多一顆「對戰電腦」，面板選賽道、對手數（1–7）、難度（簡單／普通／困難）、道具賽或純競速、圈數（設定存在瀏覽器 `tku-arcade.kart.bots`）。

- **房間在本機跑，規則一行都沒抄**：`src/kart/bots/localRoom.ts` 照 `worker/room-host.ts` 的做法執行競速房自己的 `GameModule`（`shared/games/kart/rules.ts` 的 `init`／`reduce`／`timers`／`realtime.frame`／`realtime.clock`）：timer 到時以 `system` 套 action、`clock` 最多問 4 輪、frame 先給模組裁定再轉給其他座位、clock ping 照伺服器格式回答。所以圈數、道具箱、道具抽選（照名次）、直接型道具與投射型道具的命中、護盾，全都是線上同一套純函式；`rules.ts` 不用改也不用抽函式。「瀏覽器不載規則」的守門測試（`tests/games/catalog.test.ts`）開一個例外：只有 `src/kart/bots/`（lazy chunk）可以 import `shared/games/kart/rules.ts`，其他規則照樣擋。時間由外面給（頁面給 `Date.now()`，測試給計數器）。
- **玩家的畫面就是房間的比賽畫面**：`BotRaceView.tsx`（自己的 lazy chunk）把本機房間的 `view`、`RoomRealtime`、`act` 交給 `RaceView`，`RaceView`／`netRace.ts` 完全沒改，分不出是真房間。玩家排在發車格最後，電腦車在前。完賽後可「直接看成績」（套房間的 `close`），成績用房間的 `result` 排序、照 `Standings` 顯示，「再跑一場」換新種子與新對手，「改設定」回選單。
- **電腦車**：`botRace.ts` 每台電腦車和玩家的瀏覽器一樣模擬：`stepTrial`（自己車款的 `applyKart` 調校）、倒數到房間的 GO、`bumpKart` 推開其他車（電腦車彼此用目前位置，玩家用他最新的 frame）、每 3 步送 frame 給本機房間。道具：碰到道具箱送 pickup frame、拿到的道具交給 `itemSense.ts` 決定何時送 use frame，房間裁定後的事件由 `effects.ts` 套到自己的車（和 `netRace.ts` 的 `adjust` 同樣的 `itemEffects.ts` 純函式；為了不動線上流程另寫一份，約 40 行）。名字（暫名：胡椒、麻糬、颱風、珍奶、小綿羊、夕陽、渡輪、風箏）在 `shared/kart/i18n.bots.ts`，車款與車手每場從車庫的 6 台 4 人隨機抽（`roster.ts`）。
- **駕駛**（`brain.ts`）：把 `autopilot.ts` 的「看前方的路」長成賽車手：pure pursuit 跟中線，加上每台車自己的跑線偏移（慢慢左右擺）；急彎甩尾、照技巧反打＋重踩收尾加速、雙收尾、直線點甩、起跑加速、疊噴（`tests/kart/drivers.ts` 高手的招式）；直線才噴集氣；卡住（< 3 m/s 1.5 秒）或逆向 0.75 秒就按復位。
- **難度**（`skill.ts` 的 `BOT_SKILLS`，全是手腳上的限制，不作弊）：

  | | 跑線晃動（半路寬的比例） | 反應延遲 | 油門極速比例 | 甩尾時機 | 收尾加速機率 | 雙收尾／點甩／疊噴 | 起跑加速機率 | 道具 |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | 簡單 | 0.3 | 8 步（133 ms） | 0.86 | 抓地 1.1 倍才甩 | 0 | 無 | 0 | 拿到 1.5–5 秒隨便用 |
  | 普通 | 0.2 | 5 步 | 0.95 | 1.0 倍 | 0.5 | 無 | 0.5 | 0.7–2.5 秒後看時機 |
  | 困難 | 0.1 | 2 步 | 1.0 | 0.9 倍（高手） | 1 | 有 | 0.9 | 0.3–1.2 秒後看時機 |

  極速比例只限油門（超過就放油門），噴射照常超過，和玩家一樣；永遠不超過該車款自己的極速。單獨三圈實測（3 個種子平均，秒）：河畔 簡單 134／普通 112／困難 104；漁港 142／128／100；淡江 148／125／105；老街 145／116／94。
- **Rubber band**（`RUBBER_BAND`，只動上面的極速比例）：和玩家差 0.05 圈以內不變；領先越多越收，領先 0.3 圈以上少 0.06；落後越多越放，落後 0.3 圈以上多 0.05，但上限 1（不超過車款極速）。差距用 `raceProgress` 除以每圈閘門數。
- **道具時機**（`itemSense.ts` 的 `wantsToUse`，看時機的難度）：噴射等直線；護盾在有雷雲追自己或冰雹飛過來時立刻開，否則再拿 8 秒才用；拖曳在前車 0.9 × 拖曳距離內（且不是已經貼著）；逆風前面有人就用；交換要同一圈、在範圍內；雷雲前車在範圍內；冰雹要前車在 120 m 內、偏離車頭 0.12 rad 內；水坑後面 40 m 內有人才丟，否則 8 秒後丟。房間拒絕（沒人可打）就 0.7 秒後再問。
- **測試**：`tests/kart/bots.test.ts`：每張賽道（含 `oldstreet`）每種難度 3 個種子單獨跑完三圈、從不逆向；平均圈速 困難 < 普通 < 簡單；本機房間裡 4 台電腦車在每張圖跑完道具賽（有拿箱子、有用道具、房間有裁定）、7 台困難在老街有人被投射型道具打中、純競速沒有道具；rubber band 的範圍；`wantsToUse` 每種道具的決策。`e2e/kart-bots.spec.ts`：`/kart?autopilot` 開選單、1 台簡單、1 圈道具賽，倒數、看到電腦車、拿到箱子、成績兩人且有 (CPU)。
- **多人房加電腦車（不在這批）**：客戶端自主模擬架構下，電腦車要有一個瀏覽器代跑。可行的路：房主的瀏覽器跑 `botRace.ts`，用房間的 realtime 送「替某座位」的 frame（協定要加一種 frame 或讓房主可以佔多個座位），伺服器照常裁定；房主斷線時電腦車要交給下一位或退賽。另評估（`NEXT.md`）。後來做了，見 §4.21。

### 4.21 路線圖外：多人房加電腦車（2026-11-17，`feat/kart-room-bots`）

擁有者要求繼續開發卡丁車，照 §4.20 最後一點的評估做：房主在競速房的等待室把電腦車加到空座位，電腦車由**房主的瀏覽器代跑**，伺服器照常裁定。線上格式在 [`KART-NETCODE.md`](KART-NETCODE.md) §14。

- **電腦車是房間的成員**（`worker/room-host.ts`）：`MemberRecord.bot = { level, name }`，沒有 socket、`offlineAt` 永遠是 null（hibernation 的 `restore` 也不補，所以不會被判 `absent`），view 裡 `online`、`ready` 永遠是 true，多一個 `RoomMember.bot`。所以座位、開賽時座位重編號、rematch、結果、觀戰、重播的名字全都照原本的路走，不用另外存一份電腦車名單。房主送 `add_bot { level, look? }`（等待中或結束後；放最低的空座位，名字照 `GameModule.bots.names` 的順序取第一個沒被用的），`kick` 電腦車就是移除（不記 ban；比賽中拒絕）。總人數照原本的 `maxSeats`（卡丁車 8）；換成沒有 `bots` 的遊戲時電腦車一起拿掉。真人的暱稱不會因為和電腦車的名字 id 撞到而加 (2)。
- **遊戲怎麼說它有電腦車**：`GameModule.bots = { levels, names }`（`shared/games/types.ts`），卡丁車是 `shared/games/kart/bots.ts` 的 `BOT_LEVELS`（easy／normal／hard，和單機的難度同一份）與 `BOT_NAMES`（單機的八個暫名搬過來共用）。`RealtimeModule.abandon(state, seats)`：沒有人會再替這些座位送 frame 了，模組回要套的 `system` action；卡丁車回每台還沒結束的 `retire`。為此 `retire` 在起跑前（loading、countdown）也收，`loaded` 的「大家都到了」不等已退賽的車。
- **代送的權限**（全部在 `RoomHost.isBotSeatFor`）：送的人必須是**現在的房主**、而且那個座位上坐的是電腦車（不能替真人、不能替空座位、電腦車自己不算房主）。JSON 的 `action` 多一個 `botSeat`（只用在電腦車的 `loaded`），二進位 frame 用 `PROXY_FRAME`（254）＋座位包起來。其他一律照原本：`judgeFrame` 的合理性檢查、圈數、`judgeItem` 的拿取與使用、投射物命中，對電腦車的座位一樣做。
- **房主斷線：電腦車立刻退賽**（不交接）。房主的 socket 一關（`markOffline`）、`transfer` 給別人、或離線太久被換掉（`replaceAbsentHost`），只要房間在比賽中，就呼叫 `abandon`，還沒跑完的電腦車當場 `retire`，比賽照常進行（只剩房主自己和電腦車的房間，房主仍保有座位、可以回來）。選退賽而不選交接：交接要把物理狀態（位置、速度、甩尾、道具效果、集氣）從最後一個 frame 接回來，在別人的瀏覽器重建一台車，兩邊銜接的那一刻容易跳或被合理性檢查丟掉；朋友之間「房主掉線，電腦車就不跑了」好懂又不會壞掉。重新整理頁面也算斷線（新的 socket 先到、舊的還沒關也算）；房主的頁面只在比賽還在 loading 時才開始代跑，中途才載入的頁面不接手。
- **房主的瀏覽器怎麼跑**（`src/games/kart/useRoomBots.ts` → `src/kart/bots/roomBots.ts`，只有房主、房裡有電腦車時才載）：掛在 `KartScreen` 底下（房主在比賽、觀戰或看名次表都會跑），每場（seed）一次。`botRace.ts` 改成吃一個 `BotRoom` 介面（`state`、`act`、`frame`、`tick`、`listen`），單機的 `localRoom.ts` 和線上的 adapter 都實作它：線上的 `state` 是房主看到的 view、`act` 送 `{ t: 'action', botSeat }`、`frame` 包成 `PROXY_FRAME` 送出、`tick` 不做事（timer 在伺服器）。時間用房間的錶（`serverClock.ts` 多一個 `synced()`，對到時才開始）。房間把代送的 frame 也轉回房主，所以房主的 `RaceView` 畫電腦車和畫別人一樣（從 frame、100 ms 緩衝），錄影也錄得到。被房間判退賽的電腦車不再送 frame。
- **和單機的差別**：rubber band 改成和**所有真人的平均進度**比（單機就是那一位玩家）；推開時把每位真人最新的 frame 都當成障礙；隱藏分頁的計時器會變慢，線上允許一次追 2 秒（單機 0.25 秒），免得電腦車在背景分頁裡越跑越慢。
- **畫面**：等待室的房主多一塊「電腦車」（`src/kart/bots/RoomBots.tsx`，lazy chunk）：選難度、加一台（車款與車手隨機，當作 `look` 送出），座位滿了按鈕就停用。座位列表的電腦車顯示「名字（電腦）」與難度，房主有「移除」（不用確認、比賽中不顯示），沒有「移交房主」。名字怎麼顯示統一走 `src/lib/memberName.ts`：`games.<id>.bot.name.<name>` 與 `games.<id>.bot.tag`（卡丁車的字串在 `shared/games/kart/i18n.ts`，隨房間載入），等待室、成員列表、結果、反應、車庫的選車列表、比賽中的名牌與名次、觀戰、重播都用它。
- **測試**：`tests/worker/room-bots.test.ts`（新訊息的解析；加到最低空座位、名字不重複、永遠 ready／online；非房主不能加、難度不對、座位滿；沒有電腦車的遊戲與換遊戲；移除不記 ban、比賽中不能移除；hibernation 之後不會變 absent；開賽重編號；只有房主能替電腦車座位送 action 與 frame、不能替真人或空座位；代送的 frame 照常判圈、轉給所有人包括房主；交出房主後電腦車退賽、舊房主的代送被丟；房主斷線電腦車立刻退賽、loading 時不卡開賽、只剩房主與電腦車時比賽照常）；`tests/kart/roomBots.test.ts`（`botRace.ts` 透過真的 `RoomHost` 代送，兩台電腦車跑完一圈道具賽並由房間判完賽；房間判退賽後不再送）；`tests/components/WaitingRoom.test.tsx`（電腦車的名字、難度、房主的移除）；`e2e/kart-race.spec.ts`（兩人房加一台普通電腦車跑一圈：兩邊都看到 2 台別人的車、結果三人都有時間、電腦車的名字在結果裡）。
- **已知限制**：房主的上傳每台電腦車多 20 frame／秒（每台約 0.7 kB/s，7 台約 5 kB/s），房主的瀏覽器多跑每台的物理與駕駛；房主的分頁在背景太久（瀏覽器把計時器壓到一分鐘一次）電腦車還是會落後；房主斷線電腦車就退賽，不交接。

### 4.22 路線圖外：patch 送陣列的差異、被打從頭轉與本機預測、觀戰與重播的音效（2026-11-17，`feat/kart-net-deltas`）

補 #86、#87 留下的三個限制。線上格式與實測在 [`KART-NETCODE.md`](KART-NETCODE.md) §15。

- **patch 對陣列也做差異（協定 v2）**：`shared/patch.ts` 的 `diff` 原本遇到陣列整個替換；現在同長度時逐個位置比（物件元素再往下逐 key 比，路徑用字串索引，例 `['racers','2','item']`），長度變了用新的 op `splice { path, at, del, items }`（共同開頭與結尾之間那一段），「最舊的掉、最新的加在後面」的清單（`events` 最多 16 筆）用兩個 `splice`。每次都把候選（整個替換、逐位置、一段 splice、滑動窗）用 `JSON.stringify` 長度比，取最短，所以 **patch 永遠不會比 v1 長**（隨機測試擋）。`applyPatch` 對陣列也複製路徑上的節點、其他共用（React 照舊只看到變的地方）；索引必須是範圍內的整數、`splice` 必須落在陣列內，否則丟例外；陣列元素不能 `del`。所有遊戲都走這條路，`tests/games/harness.ts` 對每款遊戲每一步檢查 patch 能重建 projection。
- **相容性**：舊頁面（v1）的 `applyPatch` 會把「陣列加索引」當成物件改，陣列會變成物件，所以 `PROTOCOL_VERSION` 1 → 2：部署後舊分頁重連時在 upgrade 被 `versionMismatch`（4400）擋下、畫面請他重新載入（原本的流程）。**回合制遊戲的重播**（`GET /api/rooms/<id>/replay`，`shared/games/replay.ts`）不走 WebSocket、沒有版本檢查，舊頁面也可能拿到，所以它用 `diff(…, { wholeArrays: true })` 照 v1 的樣子送。
- **被打中的打轉從收到時算**（`src/kart/hitFx.ts`）：房間的 `hit` 事件 `at` 是房間收到被打那台車的 frame 的時間，patch 再過半個來回才到，原本從 `at` 算會從轉了一點的地方開始。`liveStart(at, 收到, seat, own)`：自己的車從收到那一刻從頭轉；別人的車（畫在最新 frame 之前 100 ms，`remotes.ts` 的 `INTERP_DELAY`）在收到後 `DRAWN_BEHIND_MS`（100 ms）才轉，大約就是畫出來的車開到被打的地方；不會早於 `at`。`createHitFeed` 多一個「還沒開始」的清單，星光粒子在效果真的開始那一幀才噴。暈（物理）也改成從收到時起算整段（`netRace.ts`）。重播照錄到的時間，不變。
- **自己被打時本機預測**（客戶端預測，伺服器仍是唯一裁定）：`netRace.ts` 的 `adjust` 每一步（60 Hz）拿自己「上一步 → 這一步」的路線（用對好的伺服器錶）和 view 的 `shots` 跑 `shared/kart/shots.ts` 的 `foreseeHit`：同一個 `shotHits`，但冰雹與泥水坑要比邊緣再近 `FORESEE_SLACK`（冰雹 0.5 m、泥水坑 0.3 m）才算（房間用 20 Hz 的 frame 與到達時間判，擦邊的可能判不同）；雷雲時間到就一定打到追的那台，不用留餘裕。泡泡罩開著不預測、同一顆不重複、跳過重置與調包的跳躍（同 `resets` 且兩步差 20 m 內、1 秒內）。預測到就馬上暈、轉、出聲、HUD 提示（`onForeseenHit`）；房間的 `hit` 在 −300～+1500 ms 內、同一種道具就當作確認（`confirmsForeseen`），不再轉一次、不再響、不再延長暈。**預測錯了**（房間沒判中）：已經暈過的不能退回，只是不會再發生；`window.__kartRace.foreseen`／`confirmed` 數得到。
- **觀戰與重播的音效**（`src/kart/watchSounds.ts`，純函式）：`watchCuesOf(event, 被跟的車, where)`：被跟的車自己的使用、被打、泡泡破、打中別人的「叮」全音量；別人的照距離衰減（`hearing`：20 m 內全音量、150 m 外沒聲音，中間平方衰減），小於 0.05 不播、沒畫出來的車不播。觀戰用 `createWatchEars`：每個事件只聽一次，延後 `DRAWN_BEHIND_MS` 播，和打轉同時。重播用 `replayCues(events, from, to, 倍速, …)`：只播這一幀「正常往前播」經過的事件；拖時間軸、±5 秒、暫停、倒退都不播（`ReplayView` 比對「上一幀留下的播放頭」有沒有被移過）；4× 只播和被跟的車有關的；每幀最多 3 個、大聲的先。播放器是 `kartAudio.ts` 的 `createCuePlayer()`（只有道具音效、沒有引擎聲，同一份配方與網站靜音開關），`cue(cue, volume)`；車手的 `KartAudio.cue` 也多一個選用的音量。瀏覽器要手勢才能出聲：`watchDom.ts` 的 `unlockOnGesture` 掛載時先試一次（頁面點過就可以），之後每次按鍵或點擊再試。
- **測試**：`tests/shared/patch.test.ts`（陣列改一個、物件陣列、加在尾巴、清空、填滿、中間刪一個、滑動窗、巢狀、陣列變物件、2,000 組隨機陣列來回且不比整個替換長、索引與 splice 越界丟例外、共用沒改的節點、`wholeArrays`）；`tests/kart/hitFx.test.ts`（`liveStart`、從頭轉、別人的車延後噴、`confirmsForeseen`、預測後房間確認不重來、太久的不配對、觀戰不預測）；`tests/kart/shots.test.ts`（`foreseeHit`：正中、擦邊留給房間、泡泡罩／已預測／自己的冰雹、雷雲、泥水坑）；`tests/kart/watchSounds.test.ts`（衰減、被跟的車全音量、命中與泡泡、即時延後、重播只播經過的、拖曳與暫停不播、每幀上限、4× 只播被跟的）。
- **已知限制**：預測錯了的暈收不回來（擦邊留了餘裕，機率低）；別人的車延後 100 ms 是固定值，不看每台車實際的轉送延遲；音效沒有左右聲道（只有遠近）；觀戰的聲音沒有人耳聽過。

### 4.23 P2 提前：賽道編輯器與自訂賽道（`e10-t07` 部分、`e10-t08`，2026-11-17，`feat/kart-track-editor`，#92）

擁有者要求「一直做不要停」；P1 與帳號（F1）還沒好，所以做不需要帳號與 R2 的版本。存 R2 與「我的賽道」等 F1。

- **規格是片段，不是幾何**（`shared/kart/editor/spec.ts`）：`TrackSpec = { name, theme, pieces }`；片段是 `straight { length }` 或 `turn { angle（度，正＝右彎）, radius }`，都有 `width`（28–60 m，從上一段在 40 m 內漸變過來）、`pad`（`none`／`left`／`middle`／`right`）、`boxes`（中間一排 5 個道具箱）。所有數字限一位小數，範圍在 `LIMITS`（長度 1–400 m、半徑 15–400 m、角度 ±360°、3–60 段、一圈 300–6,000 m、名稱 24 字）。存檔、分享、房間傳的都是片段，幾何由同一套純函式在瀏覽器與 Worker 各自算出來，所以兩邊的 gate 一樣。
- **片段→賽道**（`layout.ts`、`build.ts`）：從原點朝 heading 0（-z）出發，每段每約 6 m 取一個路點（`SAMPLE`），記得每點屬於哪一段；太近（< 1 m）的點略過。`buildSpec` 產生一般的 `TrackJson`：`id` = `custom-<hash>`、`theme`、`laps` 3、gate 與復位點每 7 個路點一個（`gatesAlong`）、8 格起跑格沿著路往回量（兩兩錯開，彎道上也貼著路）、加速帶與道具箱放在該段中點。然後檢查：**封閉**（終點離原點 ≤ 2.5 m、方向差 ≤ 4°）、**路緣不折**（彎道半徑 ≥ 前後較寬路寬的一半＋6 m）、**長度**、**不自交**（沿路距離超過 max(90 m, 1.2 × 兩點路寬和) 的兩點，地面距離必須大於兩點半寬和＋4 m，和 `oldstreet.test.ts` 同一套）、**起跑格**（每格離路緣至少車半徑＋1 m）、**道具箱**（≤ 255，pickup frame 用一個 byte 指箱子）、**段數**。每個問題帶 `pieces`（第幾段）與數字，編輯器據此塗紅、列訊息。
- **自動接回起點**（`close.ts`）：從最後一段的終點到原點、heading 0，找「彎＋直線＋彎」（Dubins 的 CSC 四種）；半徑試 45、60、80、110、150 m（小於路寬一半＋6 的跳過），兩條公切線都試、用正向模擬確認真的到達（含一位小數的捨入），直線超過 400 m 拆成幾段；依總長排序，第一個讓整條賽道沒有問題的就用。
- **代碼**（`codec.ts`、`codeShape.ts`）：`{v:1, n, t, p:[['s',長,寬,pad,boxes] | ['t',角,半徑,寬,pad,boxes]]}` 的 JSON 轉 base64url。60 段全部選項開滿、名稱 24 個中文字約 2,100 字元，9 段的起始賽道約 250 字元；**上限 `MAX_CODE_CHARS` 3,000 字元**（在房間訊息 16 kB、建房 4 kB 的上限內）。`decodeSpec` 什麼都不信：先看長度與字元集，再 base64、UTF-8（fatal）、JSON，每個欄位型別、範圍、一位小數、tuple 長度都要對，任何一項不對就是 null（所以 NaN、Infinity、字串數字、多餘欄位都擋）。名稱去掉控制字元、截 24 字。**紀錄 key**：`specHash`（cyrb53，base36）只算片段，名稱、主題不算；`recordKey(track)` 就是 `custom-<hash>`，所以最佳紀錄、最快單圈、幽靈車（`records.ts`）不用改就分得開。
- **自訂賽道在比賽裡**（`custom.ts`、`tracks/registry.ts`）：比賽的 `track` 是 `custom:<code>`。`raceTrack(id)` 遇到這個前綴就 `customTrack(code)`：超過上限先擋（不解碼、不快取）→ 解碼 → `buildSpec` 有問題就不收 → 再過一次 `parseTrack`；結果快取 16 筆（建一次要比對每對路點，1,000 個點約幾毫秒）。所以 `RaceView`、觀戰、重播、房主代跑電腦車、伺服器判圈的程式都沒改，只是拿到的 `Track` 從代碼建出來。`spikeLoop` 多一個選用的 `track`（`RaceView` 改傳 `Track` 本身，不再用 id 查 `SpikeCourse`）與 `autopilot`（計時賽的 `?autopilot`，e2e 用）。
- **房間選項**（`shared/games/types.ts`、`options.ts`）：選項多一種 `TextOption`（`kind: 'text'`、`maxLength`、`pattern`、選用的 `check` 與 `control`）。卡丁車的 `track` 多一個 `custom` 選項值，另一個欄位 `custom`（代碼，`showIf` track = custom）。瀏覽器的 schema（`info.ts`，進等待室才載）只帶長度與字元集；**Worker 的 schema（`rules.ts` 的 `kart.options`）多 `check: isTrackCode`**，所以房主建房（`POST /api/rooms`）、換遊戲、改選項、開賽時的 `parseOptions` 都會完整重建、檢查一次，不合法就回預設（空字串），開賽時 `raceTrackId` 再檢查一次、不行就跑第一張圖。`RoomHost` 沒有改。代碼跟著 room view 的 `options` 與比賽 state 的 `track` 傳給每個人（各一份，最多 3 kB）。
- **等待室的控制項**（`src/components/optionControls.ts`）：`TextOption.control` 指名一個 lazy 元件；卡丁車的 `kart-track` 是 `src/kart/editor/RoomTrackPicker.tsx`：房主貼連結（整個網址、只有路徑或只有代碼都可以，`link.ts` 的 `codeFromText`）或從本機存檔選，送出前先用同一套檢查，不合法當場說；其他人看到賽道名稱與長度，和「自己先跑跑看」的連結。沒有指名控制項的文字選項是一般輸入框（Enter 或離開時送出）。
- **編輯器**（`src/kart/editor/EditorPage.tsx`，lazy chunk；`View3D.tsx` 再一個 lazy chunk，選 3D 才載 three.js）：片段庫（`presets.ts`）、片段列表（選取、上下移、複製、刪除）、選取段的屬性（數字欄位 Enter 或離開才套用，夾在範圍內）、復原（50 步）、平面圖（`MapView.tsx`，SVG，每段一個 path，按一下選取）、3D（`createKartScene` 加 `watch`，一台車沿路 30 m/s 飛）。存檔在 `saves.ts`（`tku-arcade.kart.editor.tracks`，最多 30 筆，讀回來每筆都重新解碼，壞的丟掉，`storage.ts` 不會丟例外）。分享面板給 `/kart?custom=<code>` 與「複製連結」（剪貼簿失敗就請人從框裡複製）。
- **`/kart`**（`SpikePage.tsx`）：網址有 `custom` 就建那條賽道，「場地」選單多一項（顯示賽道名稱），連結壞了顯示一行提示、照常用內建賽道；左上多「賽道編輯器」（或「複製這條賽道來改」）。對戰電腦的面板也能選它（`BotSetup.track = 'custom'`，代碼不存進設定）。主題：`TrackJson.theme`（選填，`parseTrack` 檢查是四個之一），`trackArt.ts` 的 `themeOf` 先看它；場景走一般賽道的程式產生裝飾（沒有手工賽道的地標）。顏色在 `kartTokens.ts` 的 `kartEditor`。
- **測試**：`tests/kart/editor.test.ts`（片段幾何與方向、取樣與漸變、起始賽道合法且 8 格起跑格在路上、沒封閉、8 字自交、平行太近、彎太急、太短太長、線剛出彎的起跑格、自動駕駛跑三圈、自動接回四種缺口與斜角、代碼來回與一位小數、60 段在上限內、各種惡意代碼（版本、主題、型別、範圍、小數、tuple 長度、NaN、超長、壞 UTF-8）、雜湊只看片段、`raceTrack` 解析與拒絕）；`tests/kart/editorSaves.test.ts`（貼上的連結、路徑或代碼；存檔的順序、上限、壞資料）；`tests/worker/room-realtime.test.ts`（真的 `RoomHost`：自交、亂碼、超長、非字串的代碼設不進去，合法的同步給大家、開賽 state 是 `custom:<code>`、照那條賽道判圈到完賽；建房給壞代碼就跑第一張圖）；`e2e/kart-editor.spec.ts`（拼賽道→自動接回→存檔→分享→開連結自動駕駛跑完計時賽、幽靈車存在 `custom-<hash>`；兩人房房主貼連結、壞連結當場擋、兩邊看到名稱、跑一圈兩人都有完賽時間）。
- **數字**：卡丁車線 **298.6 kB** gzip（合併 #91 之後）（預算 600 kB），編輯器相關約 18 kB（`build` 5.5、`EditorPage` 6.4、字串約 3、`RoomTrackPicker` 1.1、`View3D` 1.0）；主站與各遊戲首屏不變（等待室只多一個控制項登記與兩個常數）。
- **沒做**：存 R2、帳號下的「我的賽道」、公開賽道列表（等 F1）；高低差、跳台、分岔（物理是平面，分岔要手工的路中牆）；在 3D 裡直接拖曳編輯；自訂賽道的地標與場景物件擺放；`/kart` 計時賽的圈數固定 3。

### 4.24 路線圖外：大獎賽、每台車的紀錄與幽靈車（2026-11-17，`feat/kart-grand-prix`）

擁有者要求繼續開發卡丁車：把 §4.20 的對戰電腦延伸成盃賽，並補 #84 的「紀錄不分車」。程式都在 `src/kart/cup/`（新檔），`/kart` 頂欄不加按鈕（1180 px 寬時頂欄已經剛好一行，再加會折行壓到面板）：「對戰電腦」面板最上面多一顆「大獎賽」，換成大獎賽的面板；計時框下面多一組幽靈車按鈕。

- **盃**（`cups.ts`）：`ebb`（河畔→漁港）、`hill`（淡江→老街）、`rivermouth`（四張依序）、`sprint`（只有 `?autopilot` 看得到的一場測試短盃）。名稱是暫名（`KART-WORLD.md` §6.1，`shared/kart/i18n.cup.ts`）。
- **積分**（`points.ts`，原創，不是任何遊戲或賽事的表）：`racePoints(名次, 台數) = 台數 − 名次 + 1 + [3, 2, 1][名次 − 1]`（8 台 11、9、7、5、4、3、2、1；2 台 5、3）。名次用房間 `result` 的 `rank`，所以沒跑完、照圈數同名次的車同分。總表 `cupTable`：積分 → 勝場 → 最近一場的名次 → 座位。
- **狀態機**（`cupRun.ts`，純函式）：`startCup`（抽一次電腦車：名字、車款、車手整盃固定）→ `ready` →`beginRace`→ `racing` →`finishRace(每個座位的名次)`→ 下一場 `ready` 或最後一場後 `podium`。`quitRace`／`resumeCup`（比賽中離開或重新整理：該場回 `ready`、從起跑重來）、`leaveCup`（回選單，`away` 讓重新整理留在選單）。放棄＝刪存檔。每場的種子由盃的種子與場次算出（`raceSeed`）。座位：電腦車 0…n−1、玩家最後（和對戰電腦一樣）。
- **存檔**（`store.ts`，`storage.ts` 不會丟例外，讀回一律 `parseCupRun` 檢查格式、名次範圍、場數與 phase 是否一致）：`tku-arcade.kart.cup.run`（每一步存）、`…cup.setup`（上次的設定）、`…cup.best.<盃>`（名次優先、同名次比積分；到頒獎台時記一次）。`KartPlay` 開頁時有進行中且沒 `away` 的盃就直接開 `CupView`。
- **畫面**：`CupSetupPanel.tsx`（選單面板：盃與賽道、最佳成績、設定、繼續／放棄）；`CupView.tsx`（lazy chunk）：盃賽卡（下一場、第一場前列參賽者、之後列累計積分榜與每場得分）、比賽（`BotRaceView` 多一個選用的 `cup`：用盃的電腦車與種子，完賽只有「看積分榜」，回傳每個座位的 `rank`；畫面上方的「離開比賽」回盃賽卡）、頒獎台（第二／第一／第三名的台子由下往上長出來，`prefers-reduced-motion` 時不動）。獎盃 `Trophy.tsx` 是程式畫的 SVG：碗口寬度、碗上的波紋圈數、頂上星星的角數由盃 id 的雜湊決定（`trophyShape.ts`），兩側把手是捲起的浪，底座一場一階；顏色全部來自 tokens。
- **每台車的紀錄**（`src/kart/records.ts`）：總最佳沿用 e8-t11 的 key `tku-arcade.kart.ghost.<賽道>`、`…bestLap.<賽道>`，另存每台車的 `…kartGhost.<車>.<賽道>`、`…kartBestLap.<車>.<賽道>`。賽道 key（`recordKey`，或賽道編輯器的內容雜湊）是任意字串、永遠放在最後一段，前綴不同所以不會互撞。幽靈車（`shared/kart/ghost.ts`）多一個選用的 `kart`（格式版本不變，不認得的車款當作沒有）。`keepIfBetter` 一次比總最佳與那台車的最佳。
- **舊紀錄的遷移**：不用搬：舊 key 原地就是總最佳。舊幽靈車沒有 `kart`，畫面標「未知車款」，**不歸到 `tide`**：#61（2026-11-14）起就能換車而紀錄不知道，舊紀錄可能是任何一台開的；歸給標準車會讓一台快車的時間變成 `tide` 永遠破不了的紀錄。之後誰破了總最佳，就換成有車款的新紀錄。
- **追哪個幽靈**：計時框下面的「幽靈車」三個按鈕（`src/kart/GhostPicker.tsx`；不用下拉，因為被點過的下拉會吃掉方向鍵）（`tku-arcade.kart.ghostPick`：`overall` 預設／`kart`／`off`），`spikeLoop` 的 `ghostPick` 選項；換了就重開這一趟（和換車一樣）。計時框的「紀錄」標車款，多一行「這台車」；完賽時只破了這台車的紀錄也會提示。
- **測試**：`tests/kart/cup.test.tsx`、`tests/kart/ghost.test.ts`（見 `NEXT.md`）、`e2e/kart-cup.spec.ts`。
- **已知限制**：比賽中重新整理那一場從起跑重來；每台車各存一份幽靈車（最多 6 台 × 每張賽道一份，約 30 kB 一份）；盃賽中途換車照樣算（每場用車庫當下的車）。

### 4.25 路線圖外：手機觸控操作（2026-11-17，`feat/kart-touch`）

擁有者要求一直開發卡丁車，朋友多半用手機。之前只有鍵盤與手把（§J2 的 `shared/kart/input.ts`），手機打開 `/kart` 只能看。物理沒動（另一個分支在做高度與跳台），只加輸入層、HUD 疊加層與設定面板。

- **輸入對映**（`shared/kart/touch.ts`，純函式，和 `input.ts` 同一層）：`touchInput(按住與點過的鍵, 設定, 時刻) → KartInput`，`mergeInputs` 和鍵盤／手把的輸入合併（任一邊按就算、轉向相加到滿）。
  - **按住「甩尾」＝油門也踩著**：右手一根拇指就能甩尾，不用同時壓油門；放開甩尾就是同時放開兩個，正好是 §4.13 收尾加速要的「放開 → 反打 → 再按前進」。
  - **自動油門**（設定，預設開）：GO 之後一直踩，三種情況放掉：按住煞車（才能倒車）、有一發收尾加速在等（`burstReady` 或 `releaseWindow > 0`，讀步進前的車況）、還沒按過任何觸控鍵（`engaged`，免得手機放著車自己衝出去）。GO 之前照實際按的算，起步加速要自己抓時機。所以自動油門下收尾加速一樣要「點」油門，技巧不會被送掉。
  - **點擊不漏**：按下的那一刻記一筆（`tapped`），下一步一定算到，比一步（16.7 ms）還短的點也有效（和鍵盤的 `boostTapped` 同一個道理）。
  - **滑桿**：`sliderSteer(拇指離落點的位移, 範圍)`，中間 8% 死區、之後線性到滿（範圍 1.1 顆鍵寬）；往回拖過起點就是反打。
- **觸控甩尾的手勢**（§4.12–4.13 的技巧怎麼用手機打出來）：
  1. 左拇指按住轉向（或滑桿往彎內拖），右拇指**按住「甩尾」**：車甩出去、集氣。
  2. 右拇指**放開「甩尾」**：車滑出去（金色火花）。
  3. 左拇指**滑到另一顆轉向鍵**（不用抬起，同一叢裡滑過去就換鍵）或滑桿往回拖：反打拉回來（火花變藍）。
  4. 右拇指**點一下「油門」**：收尾加速。噴完馬上再點甩尾、照做一次是雙收尾；直線上短甩一路接下去是連噴。
  「噴射」放出存好的加速、「道具」在道具賽才出現。e2e 用真的觸控事件（DevTools Protocol，多指）在測試空地打出收尾加速；單元測試用 `touchInput` 接 `stepKart` 跑同一套手勢，手動與自動油門都噴、不點油門都不噴。
- **畫面**（`src/kart/touch/`）：
  - `touchSource.ts`：手指按住什麼，放在 React 外面給 `spikeLoop` 每步讀（和鍵盤的 `held` 一樣）；設定存 `localStorage` 的 `tku-arcade.kart.touch`（try/catch，存不了就本次有效並提示）。
  - `useTouchControls.ts`：一個比賽畫面一份。`pointer: coarse` 或第一次 `pointerType === 'touch'` 就顯示；`spikeLoop` 看到開車的鍵（`ownsKey`）或手把有任何鍵／搖桿過半就隱藏，再碰螢幕又出現。隱藏時觸控不駕駛。
  - `TouchControls.tsx`：兩叢鍵。左下轉向（兩顆 1.2 倍大的鍵，或可拖的滑桿）；右下 2 欄：「復位」與設定（48 px）／「道具」「煞車」／「噴射」＋高的「油門」／「甩尾」＋「油門」——油門在外緣、甩尾在拇指根部、噴射在甩尾上面。左手模式整組左右對調。Pointer Events 每根手指各自追蹤（`setPointerCapture`），手指落在兩顆鍵之間算最近的那顆，滑到同一叢的別顆就換鍵、滑出去不放。叢上 `touch-action: none`、不選字、不跳長按選單、`contextmenu` 擋掉；畫布也 `touch-action: none`（不雙擊縮放）。按下的樣子直接改 DOM 的 `data-pressed`，不經 React。直拿時中間一行「把手機轉橫」，6 秒後淡掉，直拿照樣能開。
  - `TouchSettingsPanel.tsx`（齒輪鍵開）：轉向方式、自動油門、按鍵大小 80–140%（標準 64 px，**任何大小都不小於 48 px**）、不透明度 30–90%、左手模式、震動，以及觸控的操作說明。
  - `touchLayout.ts`：兩叢的尺寸換成 CSS 變數（`--touch-left`、`--touch-right`、`--touch-tall`），配合 #89 的窄螢幕排版：橫拿時 HUD 那一列夾在兩叢中間（`Hud` 的 `dense`：字與加速條小一號），直拿時 HUD 抬到兩叢上面；高 500 px 以下小地圖改放在計時框旁邊、移到轉向那一邊（高的那叢在另一邊）。`/kart` 底下的操作說明在觸控時收起（標題留給讀螢幕的人），說明改在設定面板。
  - **四種卡丁車畫面都有**：計時賽（`SpikePage`，`/kart` 與 `/kart/spike`）、對戰電腦、大獎賽、多人房比賽（都是 `RaceView`）；道具賽多「道具」鍵，道具欄的提示改成「按 道具」。觀戰與重播（#85）本來就是按鈕（觸控時 `sm` 已放大到 44 px、鍵盤提示已藏），重播的時間軸在觸控時加高到 44 px。
- **震動**（`navigator.vibrate`，有才用、設定可關、只在觸控顯示時）：噴射（任何一發：存的、收尾、加速帶、起步）25 ms，被道具打中 80 ms。iOS Safari 沒有這個 API，就不震。
- **測試**：`tests/shared/kart-touch.test.ts`（設定的讀寫與範圍、滑桿、每顆鍵、點擊、甩尾帶油門、自動油門的三種放掉、合併、手勢接物理）；`e2e/kart-touch.spec.ts`（844×390 與 667×375：每顆鍵 ≥ 48 px、在畫面內、不壓 HUD／小地圖／計時框、axe 沒問題（含設定面板）；三指同時按、拇指滑過去換鍵；滑動、雙擊、長按後頁面不捲動不縮放不選字；**只用觸控跑完測試橢圓三圈的計時賽**；甩尾手勢打出收尾加速；設定改滑桿與左手、重新整理還在；按方向鍵觸控鍵消失、再碰又出現；桌機滑鼠不出現）；`kart-spike.spec.ts` 原本「手機說不能開」改成「有觸控鍵、點畫面不會開走」。
- **數字**：卡丁車線 **313.2 kB** gzip（預算 600 kB）；主站與各遊戲首屏不變（觸控程式與字串都在卡丁車 chunk）。
- **已知限制**：沒上實體手機（只在 Playwright 的觸控模擬與軟體繪圖看過）：按鍵位置、大小與手感、iOS Safari 的手勢（邊緣滑動返回、底部橫條）、震動強弱都要實機試；多指在某些 Android 機型可能有上限；直拿只提示不鎖方向（瀏覽器不讓網頁鎖，除非全螢幕）。

### 4.26 路線圖外：高低差與跳台、觀音山坡道（2026-11-17，`feat/kart-jumps`）

擁有者 2026-11-17 要求繼續開發卡丁車；#83（燈籠老街）與 #92（賽道編輯器）都記了「物理是平面的，沒有高低差、跳台」。

**硬性前提：平面賽道一個 bit 都不變。** 沒有高度資料的賽道（現有四張、所有舊的自訂賽道代碼）`courseOf` 不帶 `terrain`，`stepRun` 走原本的 `stepKart` → 牆 → 檢查點，物件也不多任何 key。`tests/kart/flatGolden.test.ts` 的雜湊是在 `7f53e13`（改動前）取的：困難電腦車在四張賽道各跑三圈（約 5,300–6,400 步）、測試場一段固定輸入（2,400 步，含甩尾、撞牆、噴射、重置），每一步的 x、z、朝向、速度、加速條、噴射、抓地、圈數、gate、重置次數都進 FNV-1a，最後連 state 的 key 也算進去；改動後完全一樣。所以既有紀錄、幽靈車、壓測數字都不受影響。

- **模型**（`shared/kart/terrain.ts`，純函式）：路點多一個選填的 `y`（中線的高度，左右不傾斜），`TrackJson.jumps` 是起跳線的路點 index。地面高度＝最近一段中線線段的內插（`groundAt`，也回傳坡度向量與離中線的距離）。
  - **地面上**：就是平面的車（`stepKart` 多一個參數 `limitScale`，平面時是 1，乘 1 不改任何值），只是坡度沿行進方向的分量 `grade` 讓極速 ×(1 − 0.5·grade)（最多 ±12%），再加一個沿坡的重力 9·grade m/s²：10% 的上坡極速少 5%、4 秒後的速度少不到一成；下坡相反。溫和，不改手感。
  - **起跳**：在地上往前穿過起跳線（和 gate 同一套 `gateCrossing`，線寬比路寬多 1 m）、沿路速度 ≥ 6 m/s，就離地：高度＝起跳點、向上速度＝沿路速度 × 0.18，甩尾、推滑、收尾加速的準備都取消。
  - **空中**（`stepAir`）：水平速度不變（不加速、不拖慢）、重力 30 m/s²、方向盤只轉車頭（0.55 rad/s，微調）、不能甩尾、不集氣、油門與噴射鍵沒作用；噴射與各種時間窗照常倒數。空中時間跟速度走：57 m/s 約 0.86 秒（約 50 m）、85 m/s（噴射中）約 1.15 秒；慢的車只是從跳台邊掉下來。
  - **落地**：高度 ≤ 地面就落地。空中超過 0.45 秒、按著油門、車頭和飛行方向差 16° 內，給 0.5 秒的收尾加速（不算連噴）。落地那一步若按著甩尾＋方向，下一步就照一般規則開始甩尾（「接甩尾」）。
  - **其他東西都在地面投影上**：牆、gate 與圈數、道具箱、投射物、車撞車、加速帶（空中的車不吃加速帶）、伺服器裁定，全部和以前一樣用 x、z。跳台整個路寬都是，所以車不會飛過路緣牆。
- **賽道格式**（`track.ts`）：`y` 在 ±80 m、相鄰路點坡度 ≤ 0.4（起跳線後一段例外：那是跳台的背面）；`jumps` 是不重複的路點 index、最多 40 個。沒有 `y` 也沒有 `jumps` 的賽道 `parseTrack` 的輸出和以前一樣。
- **編輯器**（`shared/kart/editor/`）：兩種新片段 `slope { length, rise }`（上坡／下坡，高度用 smoothstep 緩進緩出）與 `jump { length, height }`（14 m 的坡上到起跳線、之後回到原高度，剩下的長度是落地區；不能放加速帶與道具箱）。片段庫多「上坡」「下坡」「跳台」。代碼多兩種 tuple：`['u', 長, 升降, 寬, pad, boxes]`、`['j', 長, 高, 寬]`；**版本還是 1**，沒有這兩種的代碼解出來、`piecesKey`、雜湊、紀錄都和以前一樣（測試用起始賽道的 key 字串逐字比對）。新的檢查（`build.ts`，Worker 也跑）：`steep`（平均坡度 > 0.12）、`level`（一圈回來高度不是 0）、`high`（離起點高度 > 40 m）；解碼的範圍：坡長 30–400 m、升降 ±24 m 且不是 0、跳台長 50–200 m、高 1–4 m。「自動接回起點」遇到高度差會把接回的直線換成坡。只有用到坡或跳台的賽道路點才有 `y`。
- **新賽道「觀音山坡道」**（暫名，id `guanyin`，`shared/kart/tracks/guanyin.ts`）：用編輯器的片段拼的，所以和分享的賽道走同一套建構與檢查。1.8 km：起點長直線 → 右彎爬 16 m → S 彎 → 山頂的第一個跳台（2.5 m）→ 160° 髮夾彎下坡（加速帶）→ 左彎 → 道具箱直線 → 右彎上第二個跳台（3 m）→ 長下坡回起點。主題 `day`。單機計時賽、對戰電腦、多人房都能選（`RACE_TRACK_IDS`）；大獎賽的盃沒有改（加進盃會改到盃的最佳成績，留給擁有者決定）。
- **3D**（`src/kart/art/hillArt.ts`、`trackArt.ts`、`Scene.ts`、`effects.ts`）：路面、路緣、護欄照每個路點的高度畫（護欄背面往下 4 m，像路堤）；地面在有高度的賽道換成高度場（8 m 一格、路兩側 26 m 內貼著路、再 110 m 漸回平地，跳台的坡不算進地形）；平地放在最低路面再低 0.6 m。跳台是紅白條紋的坡面加藍色側板與背板。車照高度畫、車頭沿坡度或飛行的弧線俯仰；攝影機的高度用每秒 7 的速率跟（起跳時稍微落後）；落地噴一團灰塵、留一小段胎痕、一聲輕的撞擊音；空中不留胎痕、不噴灰、不噴火花。道具箱、投射物、被打的星光都放在路面高度。平面賽道這些都走原本的值（高度 0、俯仰 0）。
- **別人的車、觀戰、重播、幽靈車**：frame 的旗標 byte 第 7 bit 原本沒用，現在是 `FLAG_AIRBORNE`（`net.ts`）：在空中才設，frame 大小與其他欄位不變，舊頁面忽略它（解碼只看 5–6 bit 的甩尾方向），所以**協定不升版**。畫別人的車時：旗標說在地上就貼地；在空中就用 `heightGuess`——從後面最近的起跳線、用現在的速度算同一條拋物線（和真正的飛行差不到 1 m，測試逐步比對）。重播的樣本沒有空間放這個 bit（第 7 bit 是「絕對樣本」），幽靈車也沒有，所以這兩種一律用 `heightGuess`；落地後若剛好吃到落地加速，可能會比實際晚一點點貼地（只影響畫面）。
- **伺服器**：不用改。速度上限與「跳太遠」看的是水平速度與 x、z，空中水平速度不變，不會超過；圈數一樣用 x、z 的線段穿越。編輯器代碼的驗證就是 `build.ts` 的新檢查加 `parseTrack` 的高度與坡度上限。
- **電腦車**（`src/kart/bots/brain.ts`）：知道跳台的位置（`createBotBrain` 多一個 `jumps`）。起跳線前 18 m＋0.9 秒的路程內：不開始甩尾、不點甩、正在甩的放掉、走路中間對正；空中按住油門、車頭對齊飛行方向，所以幾乎每次都吃到落地加速。平面賽道 `jumps` 是空的，判斷一次都不會進去（黃金測試證明）。
- **測試**：`tests/kart/flatGolden.test.ts`（平面不變）、`tests/kart/terrain.test.ts`（地面內插與坡度、平面賽道沒有 terrain、上下坡的速度與極速、起跳／拋物線／落地、越快飛越久越高、空中水平速度不變、空中只能微調不甩尾不集氣、起跳時甩尾結束、落地接甩尾、落地加速的條件、空中重置、`heightGuess` 跟著真正的飛行、格式的範圍與坡度、舊代碼逐字不變、新片段代碼來回與範圍、`level`／`steep`／`high`、自動接回會補坡、跳台片段的起跳線、觀音山坡道合法、三種難度電腦車都跑完三圈每圈飛兩次不重置）、`tests/kart/net.test.ts`（`FLAG_AIRBORNE` 只改那一個 bit）、`tests/kart/bots.test.ts`（自動涵蓋新賽道：三種難度跑完、難的比較快、本機房間道具賽由房間規則裁定完賽）、`e2e/kart-hills.spec.ts`（對戰電腦一圈，自己的車起跳落地兩次以上、結果出來）。
- **沒做／限制**：路面不傾斜（沒有 bank）；隧道、高架交叉（同一個 x、z 兩層路）不支援，地面取最近的中線，路太靠近而高度不同時邊緣的高度可能取錯（編輯器的「撞到自己」檢查會先擋掉大部分）；車撞車不看高度（空中的車照樣和地上的車互推）；觀音山坡道的場景只有通用的樹、燈、看台與比賽日布置，沒有專屬地標；手感數字（重力、起跳係數、上下坡的強度）都是起始值，要擁有者試玩。

## 5. i18n

- `t(key, params)`，key 以語意命名（`lobby.newRoom`）；`en.ts` 是來源，`zh-TW.ts` 必須 key 完全一致（`check-i18n` 在 CI 擋）。
- 規則頁是 markdown 兩份（`rules.en.md`、`rules.zh-TW.md`）。
- 預設 `en`；第一次進站依瀏覽器第一順位語言偵測（`zh`、`zh-*` → `zh-TW`），之後以 localStorage 的使用者選擇為準；`<html lang>` 跟著改。

### 5.1 首屏只帶一種語言（2026-11-15，`feat/first-screen-diet`）

原本兩種語言的全部字串、每款遊戲的選項與字串都在入口 chunk，每加一款遊戲首屏就多一份（兩語）。現在入口**沒有任何字串表**，各自是 lazy chunk：

| 字串 | 檔案 | 什麼時候載入 |
| --- | --- | --- |
| 網站與大廳（首頁、帳號、錯誤頁、規則頁標題、主題、語言…） | `src/i18n/en.ts`、`zh-TW.ts`，加上每款遊戲的名稱與簡介 `shared/games/lobby.en.ts`、`lobby.zh-TW.ts`，合成 `src/i18n/messages.<語言>.ts` | 第一次 render 之前，只載目前語言那份（`src/main.tsx` 等 `loadStartLanguage()`） |
| 房間（等待室、房主、聊天、結算、房間錯誤、倒數） | `src/i18n/room.en.ts`、`room.zh-TW.ts` | 和房間的 chunk 一起（`src/App.tsx` 的 `roomChunk`，`roomStrings.ts`），只載目前語言 |
| 一款遊戲的選項與房間要的字串（選項標籤、錯誤、結算） | `shared/games/<id>/info.ts`、`i18n.ts`（仍是兩語一檔，很小） | 進那款遊戲的房間時（`src/i18n/gameDetails.ts` 用 `import.meta.glob` 每款各一個 chunk；`RoomPage` 一拿到房間摘要就開始載，第一次顯示房間前等它；房主換遊戲時選單一變就開始載） |
| 陞官圖完整版的畫面字串（最大的一張表） | `shared/games/promotion/i18n.full.en.ts`、`i18n.full.zh-TW.ts` | 和完整版畫面一起（`screens.ts` 的 lazy、`full/fullStrings.ts`），只載目前語言；字型要的中文字在畫面之後才載（`fullFont.ts`） |
| 其他遊戲畫面的字串、卡丁車 | `i18n.screen.ts` 等，`registerMessages` | 照舊隨畫面 chunk，兩語 |

- **不閃英文**：`index.html` 有一段 inline script，用和 `t.ts` 一樣的規則（localStorage，否則 `navigator.languages`）決定語言，對那份字串 chunk 發 `modulepreload`，所以它和入口一起下載、不是入口跑完才開始；檔名由 `vite.config.ts` 的 `languageChunks` 在 build 時填進去（找不到就 build 失敗）。`src/main.tsx` 等那份到了才 render。載入失敗就改用英文，再失敗也照樣 render（看到的是 key）。
- **切換語言**：`setLanguage` 先記住選擇（localStorage），等那個語言的網站字串與已註冊的語言分片（`registerLanguageParts`：房間、陞官圖完整版）都到了才換；載過一次之後是立即的。連點兩下以最後一次為準。
- **API**：`loadLanguage`、`loadStartLanguage`、`registerLanguageParts(name, { en, 'zh-TW' })`（回傳目前語言那份的 promise，lazy 畫面在 factory 裡和畫面 chunk 一起等）、`registerMessages`（兩語一起，照舊）、`hasMessage`（網路來的 key 是否已有字串，`useRoom` 的錯誤碼用）、`preloadLanguage`（測試用，`tests/setup.ts` 一開始就把兩語、房間、完整版與每款遊戲的 details 都載好）。
- **check-i18n**：多比對 `room.*.ts` 與 `lobby.*.ts` 兩語一致；`lobby.en.ts` 只准 `games.<id>.name`／`.summary`／`.tryAlone`；全部遊戲的字串仍從 `shared/games/index.ts` 的 `GAME_MESSAGES`（含大廳那兩張表）比對。
- **擋回頭路**：`tests/games/catalog.test.ts` 從 `src/main.tsx` 沿靜態 import 走一遍，入口不得碰到任何字串表、`catalog.ts`、任何遊戲的 `info.ts`／`i18n.ts`；`src/` 任何地方都不得靜態 import `catalog.ts`。`check-budget` 的主站另有較低的上限（下面）。
- 卡丁車的字串在 `shared/kart/i18n.ts`，由它的 lazy chunk 用 `registerMessages` 註冊，不進首屏（§4.1）。卡丁車的選項標籤與賽道名稱原本由等待室 chunk 註冊（`waitingExtras.ts`），現在就是卡丁車的 `i18n.ts`，和其他遊戲一樣隨房間載入。
- 陞官圖的四個結果字（`games.promotion.glyph.*`）只有簡化版畫面用，移到 `i18n.screen.ts`；默契牌局與放風箏的常數移到各自的 `limits.ts`，畫面不再 import `info.ts`（同一個模組既被畫面靜態 import、又被 `gameDetails` 動態載入，打包器會多切一個 runtime chunk）。

### 5.2 首屏預算的量法（2026-11-15 起）

`npm run budget` 每條線都算「畫面出來之前要下載的」：入口與它的靜態 import、**較重的那個語言**的網站字串，遊戲的線再加房間 chunk、房間字串、那款遊戲的 `info.ts`／`i18n.ts` 與畫面 chunk（陞官圖完整版再加它的語言分片）。所以 2026-11-15 之前與之後的數字量法不同：之前沒有語言 chunk 與遊戲 details 要另算，全部都在入口裡。

- 主站（大廳）上限 **103 kB**（原本和遊戲一樣 150）：加一款遊戲應該只多一行 meta 與一個名稱，超過就是有東西跑錯地方。
- 遊戲首屏上限照舊 150 kB；離上限不到 10 kB 印 `warn`。
- `SCREEN_LANGUAGE_PARTS`：畫面自己的語言分片要列在這裡才算進那條線；沒列的 `*.en.ts`／`*.zh-TW.ts` 動態 chunk 會讓腳本失敗。

| 線（gzip） | 之前（main 005d496） | 之後（zh-TW，較重的語言） |
| --- | --- | --- |
| 主站 | 109.3 | **97.6** |
| 陞官圖完整版（最緊） | 149.8 | **139.7** |
| 陞官圖簡化版 | 144.6 | **137.9** |
| 光譜 | 138.3 | **129.8** |
| 德州撲克 | 136.2 | **127.7** |
| 卡丁車房間（畫面） | 127.6 | **119.0** |

## 6. 帳號（M1，F1 起已實作）

**決定**（擁有者 2026-11-09，總 PRD Q2）：不共用牌桌的 session、不複製牌桌的帳號程式。牌桌（平台名 **Overtrick**）簽一個短效 token，本站 Worker 驗簽後發**自己的** session。訪客永遠可玩；登入只多「暱稱固定」（之後還有戰績、好友、解鎖進度）。介面上帳號一律叫「Overtrick 帳號」（牌桌 DESIGN.md §6：平台名只有英文）。

**流程**：

```
本站頁面 ──「用 Overtrick 登入」── GET /api/auth/start?return=<本站路徑>
  └─ 本站 Worker：發 state（32 byte 隨機）放進 HttpOnly cookie __Secure-arcade_auth_state（Path=/api/auth/、10 分鐘）
     302 → 牌桌 GET /api/arcade/login?return_to=<本站網址>&state=<state>
        └─ 牌桌：沒登入 → 它自己的登入頁（/arcade）→ 回來；只給淡江的社員
           302 → <本站網址>#overtrick_token=v1.<claims>.<HMAC-SHA256>
本站頁面（main.tsx 最先跑 startAccount）：把 # 後面從網址拿掉（history.replaceState）
  └─ POST /api/auth/callback { token }（同源，Origin 要是本站）
     └─ 本站 Worker 驗：格式 → HMAC（crypto.subtle.verify，定時比較）→ iss = overtrick → aud = 本站 origin
        → nonce = state cookie（定時比較）→ exp − iat ≤ 300 秒、iat 不在未來、exp 未過（各容許 30 秒時鐘誤差）
        → 名字可用（normalizeName，太長截成 16 字）→ jti 第一次出現（D1 auth_token_uses，主鍵擋重複）
        → 發 session cookie __Host-arcade_session（HttpOnly、Secure、SameSite=Lax、Path=/、30 天），清掉 state
```

- **token 走 `#`**：不會進任何一邊的伺服器紀錄，也不會出現在 Referer；頁面一讀到就從網址拿掉，之後的歷史紀錄與複製的連結都沒有它。query string 會留在紀錄與歷史裡；牌桌自動送出的表單 POST 要行內 script，牌桌的 CSP 不放行。剩下的窗口是那一次轉址本身的歷史紀錄，靠 5 分鐘到期與只能用一次擋。
- **state 擋登入 CSRF**（別人把自己的 token 塞給你的瀏覽器）：state 只在本站的 HttpOnly cookie 裡，牌桌原樣簽回 `nonce`。
- **session 是簽過的 cookie，不是資料庫**：內容是帳號 id、名字、時間，用從共用 secret 衍生的另一把鑰匙簽（HMAC(secret, "tku-arcade session v1")），所以 token 永遠不能當 session 用；瀏覽器讀不到（HttpOnly）、改了簽章就不對。代價：單一 session 沒辦法從伺服器撤銷，只能等 30 天或換金鑰（換金鑰會讓所有人登出）。朋友圈規模可接受；要撤銷時再加 D1 的 session 表。
- **暱稱固定，在伺服器擋**：`worker/rooms.ts` 在 WebSocket 升級時讀 session，把帳號放進 header `X-Arcade-Account` 給 `RoomDO`（先刪掉瀏覽器自己送的同名 header；Durable Object 從外面連不到，所以這個 header 只可能來自 Worker）。`RoomDO` 把帳號存在 socket 的 attachment（休眠後還在），`RoomHost.join` 對登入的人一律用帳號的名字，**不看 `join.name`**；同房去重「(2)」照舊（跟訪客、跟同一個帳號的第二台裝置都比）。訪客帶 seat token 回來時已經登入，座位不變、名字換成帳號的。帳號 id 存在 `MemberRecord.account`，不進任何 view。
- **沒設定就沒有**：`AUTH_SHARED_SECRET`（Worker secret，至少 32 字）與 `AUTH_BRIDGE_URL`（var，`wrangler.jsonc` 頂層，https）都有才開。沒開時 `GET /api/me` 回 `{ configured: false, account: null }`（就算瀏覽器有舊 cookie），其他三條路由回 404 `not_configured`，頁面不出現任何按鈕，房間也不收帳號。所以這批可以在牌桌那邊上線之前合併。
- **路由**：`GET /api/me`、`GET /api/auth/start`、`POST /api/auth/callback`、`POST /api/auth/signout`（後兩個要同源 `Origin`）。程式在 `worker/auth.ts`、`shared/account.ts`、`src/lib/account.ts`、`src/components/AccountControl.tsx`；牌桌那邊在牌桌 repo 的 `worker/arcade-login.ts`（牌桌 `e1-t37`）。
- **首屏**：登入的程式只有一個小 store 與一個按鈕（沒登入時在大廳最下面、房間的暱稱步驟；登入後在大廳的暱稱那一行。不放頂欄：頂欄在 360 px 要維持一行；也不放遊戲上面：手機第一個畫面要看得到「開新房」），跟著主站一起載入（`/api/me` 是開站時的一個請求）；沒有新套件。

## 7. 部署與環境

- 一個 Worker、`main` 通過 CI 後自動部署；每個 PR 部署自己的 Worker `tku-arcade-pr-<號>`（`wrangler deploy --name`，PR 關閉即刪；不用 `versions upload`，因為 DO migration 不能走 versions upload，且版本會共用正式站的 DO 與 D1）；預覽共用 staging D1 `tku-arcade-staging`，R2 assets 與正式站共用、沒有備份桶。細節見 `DEPLOY.md`。
- Secrets：`AUTH_SHARED_SECRET`（與牌桌共用，F1；var `AUTH_BRIDGE_URL` 是牌桌的網址，DEPLOY.md §11）、`ANTHROPIC_API_KEY`（題目草稿）、`LONGTALK_URL`（選用）。
- 成本：Workers、DO、D1、R2 都在免費額度內；卡丁車多人是最大變數（E12 儀表板）。

## 8. 從牌桌與 LongTalk 直接搬的東西

| 東西 | 來源 | 備註 |
| --- | --- | --- |
| `shared/patch.ts`、`room-id.ts`、`chat.ts` | LongTalk | 直接複製 |
| RoomDO hibernation WebSocket、心跳、45 秒逾時 | LongTalk `RoomDO` | 結構相同 |
| per-seat view 裁切思路 | 牌桌 `worker/views.ts` | 概念，不複製程式 |
| D1 遷移、備份 cron、錯誤回報、JS 預算腳本、Playwright 視覺回歸流程 | 牌桌／橋館 | 複製腳本 |
| 設計 token 與 styled-components 慣例（`$` prop） | 全部 | 同一套規則 |
