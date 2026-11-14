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
    catalog.ts          瀏覽器用的遊戲清單（id、meta、options、首屏字串），不含規則
    index.ts            Worker 與腳本用的登記表（含規則），瀏覽器不得 import
    tictactoe/          範本（測試用）
    promotion/          陞官圖：board.ts、rules.ts、i18n.ts（大廳、等待室、錯誤與結算的字串）、i18n.screen.ts 與 i18n.detail.ts（隨畫面載入，含格名與官階名）、rules.en.md、rules.zh-TW.md
    silent-table/         默契牌局：rules.ts、types.ts、i18n.ts（等待室要的字串）、i18n.screen.ts（隨畫面載入）
    screenMessages.ts     隨畫面載入的字串總表：只給 check-i18n 與 npm run play，網站不能 import
    spectrum/             光譜猜題（暫名）：rules.ts、types.ts、info.ts、i18n.ts、i18n.screen.ts；topics.ts 是題庫（由 scripts/spectrum-topics.mjs 從 CSV 產生，只在 Worker，F3 搬到 D1）
    bluff/                真假朗讀（暫名）
    lantern/              宮燈點點（暫名）：rules.ts、types.ts、info.ts、i18n.ts、i18n.screen.ts；即時合作，同時的動作照 RoomDO 收件順序
    kite/                 放風箏（暫名）：rules.ts、types.ts、info.ts、i18n.ts、i18n.screen.ts；沒有題庫
    odd-word/             誰的詞不一樣（暫名）：rules.ts、types.ts、info.ts、i18n.ts、i18n.screen.ts；bank.ts 是詞組（由 scripts/odd-word-bank.mjs 從 CSV 產生，只在 Worker）
    tiles/                社辦牌陣（暫名）：rules.ts、types.ts、info.ts、i18n.ts、i18n.screen.ts；tiles.ts 是牌組與桌面的判斷（前後端共用）
    traders/              滬尾商行（暫名）：rules.ts、types.ts、info.ts、i18n.ts、i18n.screen.ts；bank.ts 是牌與貴客（由 scripts/traders-cards.mjs 從 CSV 產生，只在 Worker）；貨的顏色在 src/styles/tradersTokens.ts
    secret-scroll/        奪祕笈（暫名）：rules.ts、types.ts、info.ts、i18n.ts、i18n.screen.ts；deck.ts 是牌堆組成（規則與畫面的參考表共用，不在首屏）
    wasabi/               芥末餃子（暫名）：rules.ts、types.ts、info.ts、i18n.ts、i18n.screen.ts
    palace/               朝堂暗鬥（暫名）：rules.ts、types.ts、info.ts、i18n.ts、i18n.screen.ts；沒有題庫
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
- 新遊戲＝`shared/games/<id>/` ＋ `src/games/<id>/` ＋ 登記表一行 ＋ harness 測試一局 ＋ 規則頁兩份 md ＋ i18n 兩份。

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

## 5. i18n

- `t(key, params)`，key 以語意命名（`lobby.newRoom`）；`en.ts` 是來源，`zh-TW.ts` 必須 key 完全一致（`check-i18n` 在 CI 擋）。
- 遊戲模組的字串在 `shared/games/<id>/i18n.ts`（同樣兩語），由登記表合併。卡丁車的字串在 `shared/kart/i18n.ts`，由它的 lazy chunk 用 `registerMessages` 註冊，不進首屏（§4.1）。
- 規則頁是 markdown 兩份（`rules.en.md`、`rules.zh-TW.md`）。
- 預設 `en`；第一次進站依瀏覽器第一順位語言偵測（`zh`、`zh-*` → `zh-TW`），之後以 localStorage 的使用者選擇為準；`<html lang>` 跟著改。

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
