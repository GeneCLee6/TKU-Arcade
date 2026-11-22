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
  address.ts            位址雜湊（IPv6 取 /64、SHA-256），濫用防護的 key（e12-t06，docs/SECURITY.md §6）
  rate-limit.ts         每 instance 的固定視窗；SHARED_LIMITS 與 takeShared（建房、WebSocket 升級、擁有者金鑰）
  limiter.ts            LimiterDO：跨 instance 的濫用限制，依位址雜湊第一個字分 16 片、只在記憶體（e12-t06）
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
- **電腦玩家**（2026-11-20，選用）：寫 `bot(view, legal, level, rng)`（只拿那個座位的 view 與合法動作），加上 `bots: TABLE_BOTS` 與 `lobby.ts` 的 `computer: true`，房間就會在 DO 裡替電腦座位下（§4.49）。

執行的程式都在 `shared/games/match.ts`：`startMatch`、`applyAction`、`projectGame`（一個 viewer 會收到的全部內容，即協定的 `RoomView.game`）、`replayMatch`。RoomDO、重播與測試共用，所以測到的就是實際跑的。

測試用 `tests/games/harness.ts` 的 `playRandom(module, { seed, secrets })`：隨機玩完一局，每一步檢查 JSON、patch 可重建、不丟例外、不改 state、合法動作都被接受、垃圾動作與別人的動作都被拒、`secrets` 沒出現在該 viewer 收到的內容裡、會在步數上限內結束；最後檢查同種子同一局、種子＋動作重播結果相同。終端機煙霧測試：`npm run play -- <game> [--seed n] [--seats n]`。

### 房間與引擎（A4 起已實作）

- 分層：`worker/rooms.ts`（`POST /api/rooms`、`GET /api/rooms/:id`、`/ws/<id>`）→ `worker/room.ts`（`RoomDO`：只接 Cloudflare 的 storage、alarm、hibernation WebSocket）→ `worker/room-host.ts`（`RoomHost`：成員、座位、房主、狀態機，不依賴 Cloudflare，測試直接跑）→ `worker/room-turn.ts`（包 `match.ts`，接住模組丟出的例外）。
- 儲存：`room`、`members`、`rev`、`game`（整個 `Match`＋種子、座位、選項）各一個 key，動作紀錄每步一個 key（`step:000000000000`），給 e2-t09 重播。同一次變更的寫入之間沒有 `await`，DO 會一起提交，且寫入完成前不送出訊息。
- Diff 不存「每條連線上次送了什麼」：hibernation 會清掉記憶體，而所有已加入的連線都在同一個 `rev`、view 又是儲存內容的純函式，所以每次變更都當場算每個 viewer 的前後 view 再 diff。每個 `rev` 每條連線都收到一個 patch（可能是空的），所以 rev 有缺口就代表真的掉訊息。
- 模組丟例外：動作回 `game_failed`、局面不變；新局面若有任何 viewer 算不出 view，該動作也不接受。已存的局面算不出 view 時送 `game: null`，絕不送原始 state。
- 心跳：`ping` 由 runtime 自動回 `pong`，不喚醒 DO；有連線時 alarm 每 15 秒掃一次，所以 45 秒無心跳實際在 45–60 秒間關閉，10 秒未 `join` 在 10–25 秒間關閉。
- 一個 DO 只有一條 alarm：`RoomHost.nextAlarm()` 取「15 秒掃描、最早的遊戲倒數、清除時間」三者最小值，`RoomDO.syncAlarm` 只在時間有變時才寫；到時間一律進 `sweep()`，它自己看哪些工作到期。
- 清除（e1-t10）：`RoomRecord.emptySince`（沒有任何 socket 開著的起點）與 `idleSince`（`ended` 時最後一次有動靜的時間；聊天、換座、重連都算，`resync` 與心跳不算）。任一個滿 `ROOM_CLEANUP_MS`（10 分鐘）就 `wipe`：留著的 socket 以 `CloseCode.roomNotFound` 關閉，`storage.deleteAll()`。兩個值存進 `room` 是因為休眠後不能重算；它們不進 `RoomView`，所以不走 `change()`、不動 `rev`。`settleCleanup()` 是唯一調整它們的地方，每個入口結束時呼叫。2026-11-22 加第三個：`activeAt`（最後一次有成員送任何訊息或二進位 frame 的時間，心跳不算），滿 `ROOM_IDLE_MAX_MS`（24 小時）也 `wipe`，**有 socket 開著也一樣**（一個分頁開著放好幾天，原本會讓 alarm 每 15 秒醒一次到永遠）；為了不讓每則訊息都寫一次儲存，只有落後 `ACTIVITY_SAVE_MS`（10 分鐘）以上才更新並寫入，所以實際是 24 小時到 24 小時 10 分。舊房間沒有這欄，`restore` 時從醒來那一刻算。比 e1-t10 還舊的房間沒有 alarm：下次被喚醒時（`GET /api/rooms/:id` 或連線）`restore` 才開始計時並寫入；從沒人再碰的那些沒辦法主動清——Worker 只能用房名 `idFromName` 叫到 DO，那時還沒有房號，沒有任何地方記著它們的名字（Cloudflare 列 DO 的 API 只給雜湊後的 id，換不回名字），只佔一點儲存。踢人黑名單由 `isBanned`／`isBannedNewcomer` 比對到期時間，`sweep()` 另外把過期的從儲存刪掉。被清掉的房間 `listing()` 是 null，`syncLobby` 同一次就告訴 `LobbyDO` 拿掉，`GET /api/lobby` 不會再出現（回報掉了也有 `LOBBY_TTL_MS`）。
- 公開房（e1-t09）：`RoomRecord.public` 在建房時設定（`POST /api/rooms` 的 `public: true`，其他值都算私人；舊房間沒有這欄就是私人）；2026-11-22 起進 view（`RoomInfo.public`，私人房沒有這欄），房主在任何狀態都能用 `set_public` 切換（協定 19.），等待室的邀請區塊寫「公開：等人時會列在大廳」／「私人：只能用連結或房號加入」／「公開，但有密碼時不會列在大廳」，房主多一顆「列在大廳」／「改成私人」。`RoomHost.listing()` 由已存狀態推導：公開、`waiting`、有房主、有人在線、還有空座位才上榜。`RoomDO.syncLobby` 每個事件後比對上次回報（存在 `lobby` key，私人房永遠沒有這個 key），有變化或滿 `LOBBY_HEARTBEAT_MS`（4 分鐘）才以 RPC 告訴 `LobbyDO`，不等結果，失敗就下一次事件或掃描重試。`LobbyDO`（`worker/lobby.ts` 接 Cloudflare，`worker/lobby-board.ts` 是邏輯）每房一個 key，`LOBBY_TTL_MS`（10 分鐘）沒回報就移除，房間刪除時的回報掉了也會自己消失；最多追蹤 200 間，`GET /api/lobby` 最多回 50 間、新的在前。首頁每 15 秒輪詢，分頁隱藏時暫停。列表只公開遊戲、房主暱稱與人數。
- 倒數：執行中的倒數存在 `StoredGame.timers`（到期時間存絕對時間，和局面一起存、一起換），alarm 取最早的倒數與 15 秒掃描的較小值，所以休眠、重啟都照原時間觸發。到期先標 `spent` 再以 `actor: 'system'` 走 `reduce`，並進動作紀錄；模組拒絕或丟例外也不會重複觸發，state 還列著同一個 id 時也不會重新開始（要新的倒數就換 id）。瀏覽器只收剩餘毫秒數，再用自己的 `performance.now()` 換算。
- 聊天：每則一個 key（`chat:000000000000`），醒來時用 `list` 讀回；不進 `RoomView`、不動 `rev`，`welcome` 之後一定送一次 `reset`（空的也送），重連的瀏覽器才會丟掉舊清單。速率限制只在記憶體，休眠忘掉只會讓人早點能送。
- 離線：斷線當下 `online: false`；掃描發現超過 `RECONNECT_GRACE_MS` 才標 `absent`，並存起來，因為 view 只能由已存狀態推導。**讓座**（2026-11-22，協定 17.）：`waiting` 或 `ended` 時離線超過 `SEAT_RELEASE_MS`（90 秒，掃描發現，所以 90–105 秒）就讓出座位（`releaseSeats`，清掉 ready），那時已經是 `absent`，同一次掃描的 `removeAbsentSpectators` 就把他移出房間（房主除外：房主留著當沒座位的成員，等別人來接手或他回來）；回來的人拿舊 token 是新成員，等待中照樣坐最低空位。`playing` 時座位一直是他的，照舊用暫離與代打。電腦成員不受影響。結束後有人坐上別人讓出的座位（踢人、離開、讓座），看結算時是旁觀者的 view，不是那個座位的（`StoredGame.holders` 記開局時每個座位是誰；舊的局沒有這欄，照舊只看座位）。**主動離開**：「回到大廳」連結（等待室下方與結算畫面）先送 `leave`：房主當場轉給在線、有座位、最早進來的人（沒人在線就給最早進來、沒有 `absent` 的離線真人，再沒有就給任何真人，一個都沒有就 `hostId = null`、下一個進來的人當房主），socket 以 `CloseCode.left`（4413）關掉、不重連；`waiting`／`ended` 移出房間，`playing` 時遊戲裡的座位留著、當場 `absent`（房主可以馬上代打，拿 token 回來照舊），旁觀者移出。左上角標誌、關分頁、上一頁都不算主動離開（可能只是重新整理），走原本的 45 秒＋90 秒。房主斷線的轉移維持 `RECONNECT_GRACE_MS`（45 秒，實際 45–60 秒）：手機鎖螢幕或切 App 常常就是幾十秒，再短會一直換房主；最常見的「房主回大廳」已經由 `leave` 當場處理。`RoomView.coverable` 由 `absent`、空座位和 `legalActions` 推導。代打的隨機選擇不用遊戲的 Rng，選到的動作照常進動作紀錄，重播因此一致。
- 房主控制：黑名單存在 `RoomRecord.bans`（不進 view），`join` 時比對；2026-11-22 起（協定 18.）一筆有：seat token、到期時間（`KICK_BAN_MS`，10 分鐘，原 5 分鐘）、被踢的人登入時的社團帳號 id、最後一次 `join` 的位址雜湊（`MemberRecord.address`，所以離線時被踢也有）與名字。拿 token 回來的照舊比 token；沒有 token 的新成員比「同一個帳號」或「**同一個位址雜湊＋同一個名字**」（`sameName`，和 `uniqueName` 一樣的比法：大小寫、全形半形、看不見的字元都算同一個）。**只有位址不擋**：校園 Wi-Fi、宿舍、手機網路共用位址，只看位址會把整棟宿舍擋在門外；代價是換個名字、或換網路（手機切 4G）就能回來，朋友圈之間可以接受，真的有人一直回來就解散房間另開、或設密碼。未知位址（`UNKNOWN_ADDRESS`，Cloudflare 後面不會有）不記。解散呼叫 `storage.deleteAll()`。房主離線 `RECONNECT_GRACE_MS` 後由 alarm 的掃描轉給最早進來、在線的成員，有座位的優先；回來不會還給他。
- 路徑以 `/ws/<id>?v=1`（`shared/protocol.ts`）為準，不是 E1 寫的 `/api/rooms/<id>/ws`。
- 錯誤（e12-t04）：`src/App.tsx` 的 `ErrorBoundary` 包住所有路由（含懶載入），`src/lib/errorReport.ts` 另外接 `window` 的 `error`、`unhandledrejection`，都送 `POST /api/errors`。舊分頁載不到舊 chunk 時（SPA fallback 回 HTML，瀏覽器拒絕當模組）自動重新載入一次，60 秒內不再自動重試，改顯示按鈕。端點沒有登入：Origin 要同站、每個 Worker instance 每分鐘每 IP 10 則、總共 120 則（只在記憶體，不精確，也不寫儲存）、8 kB 上限；`shared/client-error.ts` 去掉引號內文字、房號、token、email、query，IP 不寫進日誌。
- 前端（B2 起）：`src/lib/roomConnection.ts` 管一條 socket（`join`、心跳、rev 與 patch、缺口時 `resync`），`src/lib/useRoom.ts` 把它接進 React 並把 `error` 轉成 toast。畫面只讀 `view`，送出只走 `useRoom()` 的函式。
- 規則選項（2026-11-22，協定 16.）：表單一次只送改的那一欄，`set_options` 帶 `patch: true`，`RoomHost.setOptions` 併進房間現在的選項再照 schema 檢查（`keepHidden`），所以前一個改動還沒回來就改第二個，兩個都會留。沒有 `patch` 的（更新前的分頁）照舊是一整組、少的欄位回預設；新頁面對舊伺服器只會在部署那一兩分鐘發生（同一個 Worker 一起上線），所以 `PROTOCOL_VERSION` 不變。`leave`、`set_public`、`RoomInfo.public`、`Seat.bot` 也都是向後相容的新增。
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

> **2026-11-17 註**：§4.10–4.13 記的是當時的數字，後面幾節一路改過，有些已經不對（例如收尾加速 0.6／0.9 秒、`releaseWindow` 0.3、`chainGrace` 0.5、起跑 1.2 秒、`catchGrip` 3、`driftRecovery` 0.4、疊噴 ×1.55、速度表 261／365 km/h）。這套手感（§4.13 為止）現在是調參面板的「**街機（舊）**」預設組 `ARCADE_TUNING`，**現值**：極速 60 m/s、加速 28（等加速、硬截）、煞車 56；甩尾 `driftTurnRate` 1.9 ± `driftSteerRate` 0.9、`driftAlign` 2.2、上限 58°、`driftScrub` 64、`driftRecovery` 0.9、`slideCarry` 0.45；反打 `catchGrip` 4.5 × `catchSeconds` 0.25；收尾加速 `releaseWindow` 0.4、`chainDuration` 0.7、推力 64、×1.2、連噴 +3% × 4 環、`chainGrace` 0.6、`chainMinDrift` 0.25、`doubleWindow` 0.5；噴射 3.25 秒、×1.45、推力 60、疊噴 1.2 秒 ×1.6、上限 6 秒；起跑 `startWindow` 0.35、1.8 秒、熄火 0.8 秒；加速帶 1.2 秒；牆 0.2／0.6／10／4。速度表倍率 1.45 已拿掉（現在一律 ×3.6，60 m/s 顯示 216 km/h）。預設手感改成「經典」，見 §4.27 與 `docs/KART-FEEL.md`。

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
- **線上**（2026-11-19 起車 5 bit＋角色 3 bit，舊 byte 不變，§4.39）：frame 第 2 個 byte＝車 index（低 4 bit）＋角色 index（高 4 bit）（`loadoutByte`／`loadoutOfByte`；舊的 0–2 讀成同一台車、第一個角色）。別人的車照這個 byte 畫。伺服器 `judgeFrame` 多一個 `speedCap`，房間用 frame 那台車的 `speedCapFor`（該車極速 × 疊噴倍率 × 1.5）；`SPEED_CAP` 改成最快那台車的上限。
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
- **已知限制**：比賽中重新整理那一場從起跑重來；每台車各存一份幽靈車（每台車 × 每張賽道一份，約 30 kB 一份；2026-11-19 起 17 台車，全部開過會接近瀏覽器 5 MB 的上限，存不進去時紀錄只留到關頁面，§4.39）；盃賽中途換車照樣算（每場用車庫當下的車）。

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

### 4.27 路線圖外：「經典」手感（2026-11-17，`feat/kart-classic-feel`）

擁有者：「手感不對，當甩尾的時候，只要還沒拉回來，還在甩，反打再往前都可以加速，然後倒數的時候按往前應該要噴加速……跟跑跑設計以及手感還是差非常多，速度也怪怪的。」規格、原作研究（只當量級）、參數表、給擁有者試的清單：**`docs/KART-FEEL.md`**。玩法與手感可以學，名稱、美術、程式不抄。

- **兩套物理並存**（`physics.ts`）：`KartTuning` 多一個 `model`（`MODEL_ARCADE` 0／`MODEL_CLASSIC` 1）。`stepKart` 看到 1 就交給 `shared/kart/classic.ts` 的 `stepClassic`，否則是原本的程式，一行都沒動。`KART_TUNING` 是經典（預設）；`ARCADE_TUNING` 是舊的全部數字。兩組有同一套 key（經典多 23 個：`dragShare`、`steerResponse`、`gripScrub`、`driftSlip`、`dashMinSlip`、`dashAccelFactor`、`boostAccelFactor`、`stackPush`（§4.30 已刪）、`startAccelFactor`、`wallGaugeKeep`……），調參面板只顯示該手感讀的那些（`shownKeys`）。`KartState` 只**多選填**欄位（`steerNow`、`driftPeak`、`driftKey`、`driftLatch`、`launchSeconds`，只有經典會設），`KartInput` 多選填 `throttleTap`（前進鍵的 tap 鎖存，`input.ts`／`touch.ts`／`spikeLoop.ts` 跟噴射鍵一樣記「這一步之前按過」）。
- **黃金測試**（`tests/kart/flatGolden.test.ts`）：`7f53e13` 的雜湊現在擋 `ARCADE_TUNING`（困難電腦車四張平面賽道＋測試場，每一步、連 state 的 key），全過，所以舊手感逐位元不變；另一組新雜湊擋經典手感。
- **經典的步驟**（`classic.ts`）：抓地／甩尾／滑出三種狀態；甩尾時「行進方向」轉、車頭＝行進方向＋側滑角（0.22 秒甩到 30° ± 12°）；回正 75°/s、反打 ×2、斷位 0.1 秒；推力減阻力 `a = 34 × 倍率 − 34 × (0.3u + 0.7u²)`；瞬間加速（`burstReady` 由深度 ≥ 20° 給、還在甩／滑時反打＋前進或新按前進、回正後 0.5 秒內新按）沿用 `miniSeconds`／`chain`／`doubleWindow`／`releaseWindow` 欄位，所以 HUD、大字提示、火花、frame 旗標、重播不用改；N2O 再按重新計時＋`stackSeconds` 內多推。起跑在 `timeTrial.ts`（`TrialStart` 多 `'quick'`：太早按住的小加速；經典不熄火；GO 後 `startLate` 內新按也算，大字提示在那一步出）。重撞牆（`course.ts`）：經典另外結束甩尾、取消瞬間加速資格、加速條 ×0.5。
- **畫面**：速度表 `SPEEDOMETER_SCALE` 1.45 → **1**（誠實）；鏡頭（`camera.ts`）改臨界阻尼彈簧（0.15 秒，側滑時 0.2 秒、往車頭只偏 15%），FOV 速度 +15°（60° → 75°）、噴射 +8°，高速後拉 1.2 → 0.4 m／單位 pace（`Scene.ts`）；倒數時一行提示「GO 前最後一刻按前進：完美起跑」（`RaceOverlay.tsx`）；大字提示多「起跑加速」（`quick`），文字改成「瞬間加速／反打＋前進！／按前進！／雙收尾！／完美起跑！」；說明文字兩語重寫。
- **觸控**：`kartBurstWaiting(state, tuning)`：經典只在「已回正、窗開著」時讓自動油門放開（給點按），甩尾與滑出中油門一直按著，所以反打就噴；街機照舊。
- **電腦車**（`brain.ts`）：經典走 `classicHands`（街機的路徑與亂數順序不變，黃金測試證明）：甩尾中用方向控制行進轉速（不反打到 0.3 以上以免誤噴）、彎不夠就邊甩邊煞、出彎依技巧反打＋前進噴、直線往下一個彎的方向點甩 7 步再反打（困難）、N2O 快結束才再按。三種難度排序與五張賽道（含 `guanyin`、`oldstreet`）跑完三圈由 `tests/kart/bots.test.ts`、`terrain.test.ts` 擋。
- **多人**：協定不變。`speedCapFor` 取經典與街機（玩家可在調參面板選）兩者的最大值（標準車仍是 144 m/s）。
- **紀錄**：內建賽道 `revision` 全部 +1（`riverside@7`、`harbour@7`、`tamkang@6`、`oldstreet@2`、`guanyin@2`）；自訂賽道的雜湊只看片段，所以 `build.ts` 給自訂賽道 `revision` `CUSTOM_REVISION` 2（`custom-<hash>@2`）。調參存檔 key `tku-arcade.kart.tuning.2` → `.3`；匯出版本 1 → 2，讀到版本 1 的匯出就當街機手感（缺的數字用 `ARCADE_TUNING` 補）。
- **道具**：冰雹速度固定成 84 m/s（原本是極速 ×1.4，極速改了也不跟著變）；拖曳、逆風、被打的速度上限仍是極速的倍數。
- **技巧差距**（`npm run kart:feel`，`scripts/kart/feel.ts`；三圈秒數；新手＝簡單電腦車的手，一般＝會甩尾、不刻意噴，高手＝困難電腦車的手、乾淨路線、完美起跑）：

  | 賽道 | 新手 | 一般 | 高手 | 高手比新手 | 高手三圈瞬間加速 |
  | --- | --- | --- | --- | --- | --- |
  | 河畔 | 131.3 | 111.6 | **105.0** | 少 20% | 100 |
  | 漁港 | 138.3 | 128.6 | **112.0** | 少 19% | 95 |
  | 淡江 | 152.0 | 124.1 | **114.2** | 少 25% | 106 |
  | 老街 | 130.7 | 111.8 | **102.0** | 少 22% | 52 |
  | 觀音山 | 96.9 | 86.4 | **78.3** | 少 19% | 55 |

  街機（舊）同一套駕駛：高手比新手少 16–31%。經典的高手比街機的高手慢一些（極速高但噴射弱、甩尾掉速），這是電腦車的手，不是人的上限。`tests/kart/feel.test.ts` 擋三張圖：高手 < 一般 < 新手、高手至少比新手少 15%、高手瞬間加速 > 30 次且是一般的三倍以上（一般駕駛出彎往外打時按著油門，偶爾也會噴，這就是擁有者要的規則）。
- **測試**：`tests/kart/classic.test.ts`（30 個：加速曲線單調逼近、245 km/h、方向盤平滑、甩尾比抓地轉得快且每弧度掉速少、低速不原地轉、側滑角與回正、斷位與接甩、瞬間加速四條觸發路徑＋淺甩不給＋窗後不給＋tap 鎖存＋新甩尾作廢＋效果與上限＋連噴＋雙收尾、N2O 重置不累加與上限與集氣規則、起跑完美／太早／GO 後、撞牆角度損失與重撞減半、觸控自動油門、鏡頭 0.15 秒不過衝）；舊手感的測試（`kart-boost`、`kart-physics`、`kart-skill`、`kart-touch`、`timeTrial`、`expert`）改成釘 `ARCADE_TUNING`，數字一個都沒改。
- **數字**：卡丁車 chunk 約 323 kB gzip（上限 600）；主站與各遊戲首屏不變。
- **限制**：紀錄只依賽道分，不依手感：在調參面板換成街機（舊）再跑，紀錄會混在一起（以前改調參也是這樣）；手感數字都是起始值，**沒有人用實體鍵盤開過**；電腦車在最急的彎還會擦牆（三圈 1–9 次）。

### 4.28 路線圖外：瞬間加速只認新按前進、噴射與甩尾的畫面聲音（2026-11-17，`feat/kart-feel-fable`）

擁有者（針對 §4.27 上線的版本）：「完美起跑要有噴的感覺，甩尾也要有煞車聲煞車痕，反打之後不能自動噴，要讓玩家在按前進才會拉正噴……跟跑跑比，我們這根本是 toy project。」規格與試玩清單：`docs/KART-FEEL.md` §3.2、§3.3、§6、§7。

- **瞬間加速的觸發**（`classic.ts`）：`whileSliding = burstReady && inSlide && tapped && (!input.drift || countering)`。§4.27 的「反打＋油門按著就噴」拿掉了：只有前進鍵**新按下**（`!state.throttleHeld` 或 `input.throttleTap`）才噴；甩尾鍵還按著時另外要反打（往彎內打時收油再踩不會把甩尾結束）。反打本身只讓回正率 ×2。回正後的窗（`releaseWindow`）照舊。
- **`kartBurstWaiting`**（`physics.ts`）：經典手感改成「甩尾鍵已放＋（滑出中且 `burstReady`，或窗開著）」。兩個用途：觸控的自動油門在這段時間鬆開等玩家點 GAS（`touch.ts` 不用改）；HUD 的提示。
- **數字**：`dashAccelFactor` 1.4 → 1.6；`startAccelFactor` 1.7 → 1.9；新 `startTopSpeedFactor` 1.15（起跑加速期間的極速上限；`CLASSIC_ONLY`，調參面板看得到）。完美起跑 0 → 100 km/h 0.47 秒、1.5 秒時 258 km/h。`speedCapFor` 不用動（仍取 `boostStackFactor` 1.32 × 1.5，比 1.15 高）。
- **電腦車**（`brain.ts` `classicHands`）：`lift` 這個動作多一個 `counter`（反打的方向）。出彎、直線點甩結束、或滑出中還有資格時：放開甩尾＋反打＋油門放開 `LIFT_STEPS` 2 步 → 再踩。街機那條路沒動。
- **`src/kart/feelFx.ts`**（純函式）：`skidStrength(slip, speed, sliding, braking)` 0–1（3° 以下 0、24° 以上 1、最淺 0.4；急煞 ≥ 14 m/s 給 0.6）；`squealVoice(strength, speed)` → `{ gain, hz }`；`burstBetween(before, after, fullStart)` → `'start' | 'quick' | 'boost' | 'dash' | null`；`BURST_POWER`。`spikeLoop.ts` 每幀算 `skid`、每步算 `burstBetween`，放進 `KartLook`（新欄位 `skid`、`burstPower`，都選填：別人的車沒有就照舊）與 `KartSound.skid`，並呼叫 `audio.burst(power)`。以前起跑加速不算 `bursts`（沒有任何特效），現在算。
- **鏡頭**（`camera.ts`）：`CameraRig.kick`（0–1，`kickRig(rig, power)` 設、`followCar` 以 `KICK_SECONDS` 0.7 秒指數衰減，30 與 144 fps 一樣）；`cameraPull(rig)`＝噴射中 0.7 m ＋ kick × 2.4 m（鏡頭被甩在後面）、`cameraShake(rig)`＝kick² × 0.11 m、`fieldOfView` 多 kick × 9°。`Scene.ts`：`look.bursts` 變多就 `kickRig`；鏡頭改近改低（後 6.2 m、高 2.6 m、看車前 6 m 高 1 m 的點；原 7.5／3.4／3／0.6）。`prefers-reduced-motion` 全部不做。
- **速度線**（`art/speedLines.ts`）：一像素的線改成 72 條細帶（一個 draw call）；`speedLineStrength(pace, boost)`＝極速附近或任何噴射（從靜止也有）；噴射時至少以 60 m/s 流過。
- **特效**（`art/effects.ts`）：胎痕池 2400 → 6000 段、寬 0.5 m、每段記自己的深淺（`skidDark`）、40 秒淡掉、每移動 ≥ 0.22 m 才鋪一段（幀率低也一樣密）；煙 40 → 110 顆、依 `skid` 變濃並往彎外飄；噴射中每個噴口每秒 100 顆的火（留在世界座標，160 顆的池）；點火時地上一圈 `RingGeometry` 光環。全部沿用同一張 canvas 柔光貼圖，沒有新資產。
- **車身**（`art/kartModel.ts`）：甩尾側傾依 `skid` 加深（0.13 → 最多 0.22 rad）；點火時車頭上揚（依 `burstPower`）再回來。
- **聲音**（`kartAudio.ts`，全部 WebAudio 合成）：引擎 `engineFrequency` 改成 5 個檔位（`GEAR_SPEEDS`，每檔爬 78 Hz、換檔掉回去）＋兩個微失諧鋸齒波；風聲（速度平方）；輪胎尖叫（兩個帶 17 Hz 顫音的音＋窄頻噪音，跟 `squealVoice`）；噴射轟鳴（帶通噪音＋低頻）；`burst(power)` 一次性的「轟」。
- **HUD**（`Hud.tsx`）：時速與加速條分開在車的左右（`KART_GAP`），中間下方 `DashPrompt`（`SpikeHud.dash`：1＝甩尾中已有資格、2＝現在新按前進會噴）；`BoostVeil`（噴射中畫面四周透光，`SpikePage`／`RaceView` 都放）；大字提示從 24% 移到 13%；操作說明預設收合。大字提示 `counter` 改成在「放開甩尾、有資格」那一刻出現，文字「重按前進！」。
- **紀錄**：物理變了，內建賽道 `revision` 再 +1（`riverside@8`、`harbour@8`、`tamkang@7`、`oldstreet@3`），`CUSTOM_REVISION` 2 → 3（自訂賽道與觀音山 `guanyin@3`）；調參存檔 key `.3` → `.4`。`flatGolden` 的街機雜湊不變、經典的四張賽道雜湊重取（測試場的腳本不會噴，雜湊沒變）。
- **技巧差距**（`npm run kart:feel`，三圈秒數）：

  | 賽道 | 新手 | 一般 | 高手 | 高手比新手 | 高手三圈瞬間加速 |
  | --- | --- | --- | --- | --- | --- |
  | 河畔 | 121.3 | 112.0 | **97.5** | 少 20% | 101 |
  | 漁港 | 139.4 | 125.3 | **113.9** | 少 18% | 109 |
  | 淡江 | 147.2 | 126.1 | **110.4** | 少 25% | 122 |
  | 老街 | 130.8 | 111.7 | **96.5** | 少 26% | 87 |
  | 觀音山 | 96.8 | 86.3 | **76.6** | 少 21% | 66 |

- **測試**：`tests/kart/classic.test.ts`（反打＋一直按前進＝不噴，甩尾中、滑出中、回正後都驗；反打確實比不打早回正；甩尾中往內打重踩油門不結束甩尾；一路按油門的人放開再按才噴；雙收尾也要新按；觸控滑出中自動油門鬆開、點 GAS 才噴、沒資格的滑出不鬆；完美起跑 1.5 秒領先 > 12 m、超過極速、0–100 < 0.6 秒）、`tests/kart/feelFx.test.ts`（胎痕與尖叫的觸發條件、噴射分類與力道、鏡頭 kick 的衰減與幀率無關、速度線）、`tests/kart/kartAudio.test.ts`（檔位）；e2e `kart-touch.spec.ts` 的甩尾手勢改成「反打後點 GAS」。
- **限制**：這些都是視聽回饋的第一版，強度（鏡頭甩多遠、煙多濃、聲音大小）沒有人用實機調過；聲音是合成的，尖叫像不像輪胎見仁見智；胎痕只有自己的車有（別人的車只有發光軌跡），觀戰與重播也還沒有新的點火特效；懸浮車沒有輪子（擁有者 2026-11-14 的決定），「胎痕」是車尾兩個接地點留下的。

### 4.29 路線圖外：彎道箭頭板、別人的車的特效（2026-11-17，`feat/kart-race-dressing`）

接 §4.28（同一則擁有者回饋的「地圖也要盡量像跑跑」「toy project」）。`docs/KART-FEEL.md` §8，含還沒做的差距清單。

- **`shared/kart/cornerSigns.ts`**（純函式）：`roadCorners(road)` 算每點的轉角（相鄰兩段的 heading 差）、五點平滑的曲率，`|k| ≥ 1/CORNER_RADIUS`（80 m）且同向的連續區段（容許 2 點的空隙）、總轉角 ≥ `CORNER_TURN`（40°）就是一個彎；從一段直路開始掃，所以環的接縫不會把彎切兩半。`cornerSigns(road, share)` 在每個彎的外側（右彎＝路的左邊：`a.x − cos(h)·turn·reach`）從入彎前 `LEAD` 14 m 到 70% 處每 `SIGN_SPACING` 10 m 一塊，離路緣 `SIGN_OFFSET` 1.8 m，最多 9 塊；`roadClearance` < 1.08 m（旁邊是另一段路）不立；`share` < 0.75（畫質低）隔一塊。只看 `road`，所以編輯器做的賽道也有。
- **`src/kart/art/cornerArt.ts`**：`buildCornerSigns(kit, heightAt)`，`trackArt.ts` 在比賽日佈置之前呼叫。左彎、右彎各一張 canvas 貼圖（三個箭頭）、各一個 `InstancedMesh`（`MeshBasicMaterial`，不受光）；柱子一個 `InstancedMesh`。坡道賽道用該路點的高度。多 3 個 draw call。
- **別人的車的特效**：`createKartEffects(world, kart, lite)`：`lite` 用小池子（胎痕 1200、煙 36、火花 50、軌跡 120、火 48），不鋪發光軌跡，胎痕淡 25%。`Scene.others` 每台車建一份、每幀 `update`、換車或離開時 `dispose`。`netRace.ts` 的 `others()` 用 frame 的速度與車頭算側滑角，填 `look.skid`（`skidStrength`）。協定、frame 都沒動。7 台電腦車在 1280×720（真 GPU）仍是 60 fps。
- **速度線**：`speedLineStrength` 的速度門檻 0.92 → 1.02 倍極速（平常開不出線）。
- **測試**：`tests/kart/cornerSigns.test.ts`（體育場形的路：兩個右彎、反向是左彎、大半徑不算彎；板子在路外、在外側、箭頭方向、入彎前就開始、間距、低畫質變少；五張內建賽道每個彎至少 2 塊、沒有一塊在路上、同一條路給同一組板子）。
- **限制**：箭頭板可能和樹、旗桿、看台重疊（都在護欄外，沒有逐一避開）；觀戰與重播的車沒有特效；別人的車沒有點火的光環與鏡頭效果（frame 裡沒有「哪一種噴射」）。

### 4.30 路線圖外：甩大才噴、N2O 噴完才能再噴、道具欄在正上方（2026-11-18，`feat/kart-drift-depth`）

擁有者（針對 §4.28、§4.29 上線的版本）：「甩尾抓地力還是太好，玩家可以很無腦的甩一點點噴甩一點點噴，就會變成整路都一直噴，跑跑的設計是需要甩大一點才能噴…道具目前有哪些? 可以出現在畫面正上方，比較顯眼，疊噴有什麼意義嗎? 是直接把時間疊上去嗎? 因為正常來說噴完一次才能再噴一次」。規格、數字、試玩清單：`docs/KART-FEEL.md` §3.1、§3.2、§3.5、§5、§6（a–i）、§7、§9。

- **甩尾變滑**（`classic.ts`、`KART_TUNING`）：`driftSlip` 30° → 24°、`driftSlipSteer` 12° → 16°（置中 24°、往內 40°、往外 8°）、`driftSlipIn` 0.22 → 0.45 秒、`driftRecoverRate` 1.3 → 1.1 rad/s。新 `driftLoose` 0.6：甩尾中行進方向的轉速乘 `bite = 1 − driftLoose × (1 − min(1, |slip| / driftSlip))`，剛甩的時候只有 40%，側滑角到 `driftSlip` 才是全部（車尾先出去、車才轉過來）。
- **瞬間加速的資格**：`driftPeak ≥ dashMinSlip`（20° → **32°**）**且** `driftSeconds ≥ dashMinSeconds`（新，**0.45 秒**）。極速、方向打滿：0.32 秒過 32°、0.45 秒達標，行進方向已轉約 56°。置中甩（24°）與往外打（8°）永遠不達標。`doubleWindow` 0.5 → **0**（雙收尾關掉：它讓瞬間加速後的任何淺甩都有資格；程式與 `doubles` 欄位留著，調參面板調回來就有）。效果加大：`chainDuration` 0.5 → 0.8 秒、`dashAccelFactor` 1.6 → 1.8、`miniTopSpeedFactor` 1.07 → 1.10。
- **`kartDashDepth(state, tuning)`**（`physics.ts`）：0–1，`min(driftPeak / dashMinSlip, driftSeconds / dashMinSeconds)`，達標後 1，不在甩尾 0。HUD 的深度條用。
- **集氣**：甩尾中的填充多乘深度 `gaugeShallow + (1 − gaugeShallow) × min(1, |slip| / driftSlip)`（新 `gaugeShallow` 0.5）；`gaugeFillRate` 60 → 70。點甩照樣集氣，約深甩的一半。
- **N2O 一次一個**（`classic.ts`）：`fire = storedBoosts > 0 && boostSeconds === 0 && (新按 || autoBoost)`。噴射中按鍵那一步與沒按逐位元相同（測試比 `boostSeconds`、速度、位置、存量）。`stackSeconds` 在經典手感恆為 0；`stackPush` 從 `KartTuning` 刪掉，`boostStackSeconds`／`boostStackFactor` 移進 `ARCADE_ONLY`（調參面板在經典手感不顯示）。**加速帶**（`course.ts`：`boostSeconds < padBoostSeconds` 才設成它）與**道具順風**（`itemEffects.ts` `boostKart`：`max`）本來就是「取較長的、不相加」，沒改；它們噴的也是 `boostSeconds`，所以期間 N2O 鍵同樣無效、存量留著。瞬間加速（`miniSeconds`）、起跑加速（`launchSeconds`）與 N2O 並行時推力與上限各取最大，不相乘。街機（`physics.ts` 的舊路徑）完全沒動：`flatGolden` 的 `7f53e13` 雜湊照過。
- **HUD**（`Hud.tsx`、`spikeLoop.ts`）：`SpikeHud` 多 `depth`、`boostLeft`（都是 `HUD_STEPS` 20 分之幾，量化後才比 `sameHud`，不會每幀重畫）與 `boostLocked`。`DashSlot` 裡：`dash === 0 && depth > 0` 畫 `role="meter"` 的「甩深一點」量表（`kart-depth`），達標換成原本的金色提示。加速條面板底下 `kart-boost-left`（洋紅色、隨 `boostSeconds / boostDuration` 縮短）；`boostLocked` 時存量格空心、`aria-label` 換成 `kart.hud.storedLocked`。火花顏色沒動：`look.charge` 本來就在 `burstReady` 時變金，現在等於「達標才變金」。
- **道具欄**（`src/kart/race/ItemHud.tsx`）：`ItemSlot` 自己定位（`Dock`：`position: absolute; top; left: 50%`），是比賽頁（`RaceView` 的 `Page`）的直接子元素，不再放在左下的 `Bottom` 裡。72 px 框、`fontSize.xl` 的名稱；`key={item}` 讓每次拿到新道具都重播 `drop`（掉進來＋彈）與 `flash`（框的光）；`(max-width: 760px), (max-height: 500px)` 縮成 48 px，矮螢幕藏按鍵提示；`(max-width: 560px) and (orientation: portrait)` 放到 `ITEM_SLOT_PORTRAIT_TOP` 92 px、地圖左邊空位的中間。（2026-11-22 起比賽頁置中，見 §4.63。）大字提示（`CalloutBox`）的 `top` 改成 `max(13%, var(--kart-callout-clear, 0px))`（`CALLOUT_CLEAR`），`RaceView` 在道具賽（`data-items`）設 104／72／156 px。`BotRaceView` 的「離開比賽」從正上方移到名次旁（`QuitCorner`）。**觀戰與重播**：`WatchParts.tsx` 新 `WatchedItem`（同一個 `ItemSlot`、沒有按鍵提示），`WatchedPanel` 不再帶道具那一行。
- **電腦車**（`brain.ts` `classicHands`）：轉速估計帶 `bite`；有打算噴（`dashPlan`）而且前面的彎還在繼續（`later` 同向且 > 抓地的 0.5 倍）時，往彎內至少打到 `(dashMinSlip + 3° − driftSlip) / driftSlipSteer`（約 0.69）直到 `driftPeak` 過門檻；差一點就達標（時間差 ≤ 0.2 秒、深度差 ≤ 5°）也撐著；長彎不再「放掉再甩」而是往外打（最多到 −1）維持；決定進甩尾後按住到真的進去（`entering`，否則反應延遲會讓它在門檻邊一步按一步放）；直線點甩與雙收尾在經典手感拿掉；N2O 只在沒在噴時按。街機那條路與亂數順序沒動。
- **紀錄**：`riverside@9`、`harbour@9`、`tamkang@8`、`oldstreet@4`，`CUSTOM_REVISION` 3 → 4（自訂賽道與觀音山）；調參存檔 key `.4` → `.5`。`flatGolden` 的經典雜湊（四張賽道＋測試場）重取，街機的不變。
- **多人**：協定、frame、伺服器都沒動。`speedCapFor` 仍取經典與街機兩組的最大值（街機的 `boostStackFactor` 1.6 最大），瞬間加速 1.10 ＋ 3 環 0.03 遠低於它。
- **技巧差距**（`npm run kart:feel`，三圈秒數）：

  | 賽道 | 新手 | 一般 | 高手 | 高手比新手 | 高手三圈瞬間加速（§4.28 → 現在） |
  | --- | --- | --- | --- | --- | --- |
  | 河畔 | 119.2 | 109.3 | **98.3** | 少 18% | 101 → 30 |
  | 漁港 | 138.8 | 123.5 | **114.3** | 少 18% | 109 → 24 |
  | 淡江 | 138.4 | 121.9 | **114.8** | 少 17% | 122 → 24 |
  | 老街 | 129.7 | 111.4 | **106.7** | 少 18% | 87 → 10 |
  | 觀音山 | 96.3 | 85.8 | **83.2** | 少 14% | 66 → 12（6 次是落地加速） |

  直線上左右硬甩來噴（腳本）：10 秒 543 m（還得有 120 m 寬的路），直直開 680 m，所以「無腦一直噴」現在是虧的。`tests/kart/feel.test.ts`：高手 < 一般 < 新手、高手至少比新手少 15%（三張圖）、高手三圈 6–36 次且是一般的三倍以上、新手 ≤ 2 次。
- **測試**：`tests/kart/classic.test.ts`（點甩 0.1／0.2／0.3 秒怎麼按都不噴；置中甩 3 秒不達標；夠深但不夠久不給、撐到 0.45 秒才給且已轉 > 40°；`kartDashDepth` 單調、達標才 1；剛甩的 0.1 秒轉得比甩深後少 35% 以上；雙收尾預設沒有、`doubleWindow` 調回來就有；N2O 噴射中按鍵與沒按逐位元相同、連按 2 秒也一樣、噴完按著不放不發、重按才發；加速帶噴射中按鍵與自動噴射都不發）、`tests/kart/hud.test.tsx`（深度條→金色提示；剩餘條與鎖住的存量）、`tests/kart/itemHud.test.tsx`（空欄、圖示＋名稱＋按鍵、換道具是新元素、觀戰版沒有按鍵提示）、`e2e/kart-bots.spec.ts`（道具欄在畫面上方正中、不壓到名次與離開按鈕）、`e2e/kart-spike.spec.ts`（噴射中看得到剩餘條）。
- **限制**：門檻與「滑」的程度是起始值，沒有人用實機調過；~~手機直拿時道具欄不在正中間；觸控的噴射按鈕在噴射中沒有變樣子~~（2026-11-22 做了，§4.63）；高手比新手的差距比 §4.28 小（少了直線點甩那一塊），之後要拉開得靠路線與 N2O 的用法，不是再把瞬間加速放寬。
### 4.31 路線圖外：團隊賽與團隊噴射（2026-11-18，`feat/kart-team-race`）

擁有者 2026-11-18：「團隊賽可以跟跑跑一樣，有藍色的 N2O，噴比較久比較快」。玩法可學、表達不抄：名稱（團隊噴射／Team boost、團隊加速條／Team gauge，都是暫名，`KART-WORLD.md` §5.1）、積分表、HUD 造型都是自己的。線上格式在 `KART-NETCODE.md` §17。

- **選項**：`KartOptions.teams`（`solo`／`teams`，預設 `solo`），和 `mode`（道具／競速）互相獨立，四種組合都可以。
- **`shared/kart/team.ts`**（純函式，Worker 與瀏覽器共用）：`assignTeams(seats)`（自己選的照舊，沒選的依座位順序補到人少的那一隊，紅隊先；兩台以上時不會有一隊是空的）、`scoreTeams(placed, teamOf, sizes)`（名次 10、8、6、5、4、3、2、1；每隊取最好的 K 台，K＝人少那隊的人數；同分看第一名是哪一隊）、`teamGain(trace, frame, now, teamSize, burning)`（一個 frame 幫隊伍賺多少）、`gaugeStep`、`teamBoostsLeft`。`shared/kart/teamBoost.ts` 只有數字（`TEAM_BOOST`），沒有 import，物理才能讀它而不成環。
- **分隊怎麼進遊戲**：等待室的選擇存在成員上（`RoomMember.team`，新訊息 `set_team`），開賽時跟著座位進 `init`（`Seat.team`，其他遊戲不讀）。`KartRacer` 多 `team`／`teamBoosts`／`teamUsed`／`teamUntil`，`KartState` 多 `teams: { gauge, fills }`；都是選用欄位，個人賽的 state 一個欄位都沒多。
- **團隊加速條由房間裁定**（`rules.ts` 的 `fillTeamGauge`）：不信任瀏覽器回報的集氣量，直接從**已經通過合理性檢查的 frame** 推算：frame 的甩尾旗標＋速度（每秒 `driftRate` 14 點 × 速度／68 m/s，最多 1.25 倍）× 距上一個 frame 的時間（最多算 100 ms）；噴射旗標在甩尾後 1.5 秒內由 0 變 1 算一次瞬間加速（5 點）；全部除以隊伍人數；自己的團隊噴射燃燒中不算。小數留在 DO 記憶體（frame 不寫 storage，§4.14 的原則），每跨過 4 點才送一個 `tgauge` system 動作（HUD 用），滿 100 送 `tfill`：那一隊還在跑的每台車 `teamBoosts` +1（上限 2），加速條歸零。DO 被趕出記憶體後從 state 的那一格接著算。
- **團隊噴射在物理裡**（`classic.ts`）：`KartState` 多兩個選用欄位 `teamBoosts`（可以噴幾個）、`teamSeconds`（還剩幾秒）。按噴射鍵時**先噴團隊的**，而且要等其他噴射噴完（`boostSeconds === 0 && teamSeconds === 0`）；燃燒中自己的存量不會噴、個人加速條不累積。`TEAM_BOOST`：4.35 秒（一般 2.9 秒的 1.5 倍）、極速 × 1.36（一般 1.28）、引擎推力 × 1.65（一般 1.5）。逆風與被打中會把它一起吹熄。「街機（舊）」手感沒有更快的噴射，團隊噴射在那裡是一個 4.35 秒的一般噴射（`stepArcadeTeam`）。沒有這兩個欄位的車（個人賽、計時賽）每一步的結果和以前 bit-for-bit 相同。
- **誰算數**：`teamBoosts` 的發放與扣除都在房間。瀏覽器看到自己被發了就可以**馬上**在本機噴（不等來回），同時送一個 8 bytes 的 `OP_TEAM` frame；房間確認手上有才扣（`tfire`）並記 `teamUntil`。`shared/kart/teamRider.ts` 讓兩邊對得起來：本機可噴數＝房間說的持有數 −（本機已噴 − 房間已記）；5 秒沒被記到的就當作沒送到。車手（`netRace.ts`）、電腦車（`botRace.ts`）、壓測機器人共用。
- **藍色**：走 §4.32 的 `boostFx.ts`（合併 `feat/kart-visual-overhaul` 時整合，原本暫用的 `KartLook.tint` 與 `effects.ts` 的 `paint` 拿掉了）。自己的車：`boostKindOf` 看到 `teamSeconds > 0` 就回 `'team'`；別人的車：`netRace.ts` 的 `others()` 從房間狀態（`teamUntil`）知道誰的團隊噴射在燒，填 `look.boostKind = 'team'`。藍色的火焰、光帶、光環、衝擊波環與變身都由 `BOOST_FX.team` 決定（顏色在 `kartTokens.ts` 的 `kartBoost.team`）。
- **畫面**：等待室 `src/kart/team/RoomTeams.tsx`（lazy，只在團隊賽的卡丁車房間）；比賽 `src/kart/race/TeamHud.tsx`：右下角藍色團隊加速條與持有數（在個人加速條上方靠右，不占畫面正上方）、名次下方兩隊即時總分（照目前名次試算）、燃燒時畫面邊緣一圈藍光；名牌底下一條隊色、小地圖上其他車是隊色圓點（`Minimap` 的 `dots`／`others`）；`Standings` 與結果面板顯示隊伍與得分。
- **單機**：「對戰電腦」與大獎賽的設定多一個「分隊」（`BotSetup.teams`、`CupSetup.teams`）；`localRoom.ts` 收 `sides`，玩家固定紅隊、電腦車平均分。電腦車的腦（`brain.ts`）在直線上、沒有其他噴射時噴團隊噴射。大獎賽的積分仍照個人名次。
- **電腦車在多人房**：房主代跑的電腦車（§4.21）照常用代送的 frame 累積團隊加速條、代送 `OP_TEAM`。
- **測試**：`tests/kart/team.test.ts`（分隊、計分、frame 賺多少、物理的時長與速度、先後順序、個人賽不變、房間的累積／發放／使用／權限／結果、六台電腦車跑完一場團隊賽）、`tests/worker/room-teams.test.ts`（`set_team` 的解析與權限、隊伍進遊戲、休眠後還在）、`tests/kart/teamUi.test.tsx`、`e2e/kart-team.spec.ts`（兩人各一隊＋電腦車跑一圈）。
- **同一天稍晚改了**（§4.34）：噴射改成「個人集個人的、分紅藍」（滿了是手上的存量變藍，不再另外發）；觀戰與重播補上藍色與團隊 HUD。下面這條限制的前半已經不成立。
- **限制**：觀戰與重播的車沒有藍色尾焰與團隊 HUD（重播沒有錄 `teamUntil`）；比賽中不能換隊；團隊加速條的 HUD 以 4 點為一格；不甩尾的自動駕駛（`?autopilot`）集不到氣，壓測要加 `--teams` 讓機器人在彎道甩尾。

### 4.32 路線圖外：車款重畫、噴射特效一套系統、噴氮氣變身、後處理（2026-11-18，`feat/kart-visual-overhaul`）

擁有者 2026-11-18：「車子的設計還有噴氮氣的特效要再設計過……要越來越逼真，越帥，比如跑跑有些車子噴氮氣還會變身」。造型、變身與特效全部原創（規則 1），全部程式產生（`ASSETS.md`），物理、協定、HUD 版面都沒動。

**特效 API（`src/kart/boostFx.ts`，純函式，Node 測）**

- `type BoostKind = 'mini' | 'n2o' | 'team' | 'start'`：瞬間加速（小）、N2O（大）、團隊 N2O（藍色）、完美起跑（金色）。`BOOST_FX[kind]` 是一張表：火焰的心、身、尖與光帶的顏色（`kartTokens.ts` 的 `kartBoost`）、長度與粗細、會不會變身（`transforms`，只有 `mini` 不會）、有沒有光帶與持續火花（`ribbons`）、點火力道（`power`，與 `feelFx.ts` 的 `BURST_POWER` 同一把尺）、地上光環的半徑、有沒有立起來的衝擊波環。
- **呼叫方式：`boostFx(kind)`**。回傳 `{ boosting: true, boostKind: kind }`（`boostFx(null)` 是 `{ boosting: false }`），攤進車的 `KartLook`：`{ ...look, ...boostFx('team') }`。之後火焰、光帶、火花、光環、變身、鏡頭、後處理全部跟著走，呼叫的人不用碰別的。團隊賽的藍色團隊噴射就是這樣接的：`boostKindOf` 看到 `teamSeconds > 0` 回 `'team'`。
- `boostKindOf(state, launch)`：自己的車從物理狀態讀種類（`teamSeconds > 0` → `team`；`boostSeconds > 0` → `n2o`；`launchSeconds > 0` → 完美起跑 `start`、小起跑 `mini`；`miniSeconds > 0` → `mini`）。
- `readBoost(before, look, seconds)`：每幀把 `look` 讀成 `BoostReading`（`kind`、`last`、`morph` 0–1、`heat` 0–1、`fired` 計數、`power`、`age`）。`kartModel.ts` 每台車各存一份，`effects.ts` 讀同一份（`model.boost()`）。
- **別人的車、電腦車、觀戰、重播**：frame 只有一個「在噴」的 bit，沒有種類，協定不動。`look.boostKind` 沒給時 `readBoost` 自己推：開始噴先當 `mini`，連續噴滿 `DERIVE_FULL_SECONDS`（0.75 秒；瞬間加速 0.5–0.7 秒、N2O 約 3 秒）就升成 `n2o`，升級時再點一次火（`fired` +1）並開始變身。所以別人的 N2O 變身比實際晚 0.75 秒。**團隊噴射例外**：`netRace.ts` 的 `others()` 從房間狀態（`teamUntil`，§4.31 團隊賽）知道誰在燒，直接填 `boostKind: 'team'`，所以別人的團隊噴射是藍色、立刻變身；觀戰與重播沒有填，看到的是橘色。
- 變身的時間：開 `MORPH_IN_SECONDS` 0.25 秒、收 `MORPH_OUT_SECONDS` 0.3 秒；`morphEase` 是帶一點過衝的 ease-out-back。
- 除錯：`window.__kartSpike.fx = 'n2o' | 'team' | …`（只影響畫面，物理不變）、`window.__kartSpike.view = { orbit, back, up }`（鏡頭繞車）；`scripts/kart-shots.mjs` 用這兩個截圖。

**車（`src/kart/art/kartParts.ts`、`kartBodies.ts`、`kartModel.ts`、`driverModel.ts`）**

- `kartParts.ts`：`loft(sections)`（沿車長過一串超橢圓截面拉出的蒙皮，車身的線條靠它）、`plate`、`blade`、`bell`（噴口）、`hoop`；`buildKartEnvironment(renderer, sky, horizon)` 用 `PMREMGenerator` 從一個小場景（賽道自己的天空色漸層、暗地板、四塊亮板）做環境貼圖，每個 `Scene` 一張；`carbonTexture()` 是 32 px 的 canvas 碳纖編織；`flatten(root)` 把每個 group 裡同材質的 mesh 併成一個（一台車約 15–25 個 draw call，不併是 100 以上）；`morphOf(object, to, ease)` 記住零件現在的位置與變身後的位置（`from`／`until` 可以錯開時間）。
- `kartModel.ts`：材質是 `MeshStandardMaterial`（金屬漆 metalness 0.6、碳纖、金屬、玻璃）＋環境貼圖，發光件是 `MeshBasicMaterial`（發光條、噴口、核心、頭燈、尾燈；有後處理時顏色乘到 1 以上讓 bloom 抓）。`BodyKit`（`put`、`colour`、`morph`、`nozzle`、`strip`）借給車身與車手。每幀：`readBoost` → 變身（`morph` 變了才動零件）、車身降 7 cm、噴口亮度跟速度與噴射、核心亮度跟變身、煞車時尾燈變亮、地上多一塊頭燈光。幽靈車整台一個半透明材質。
- 六台車的造型與變身在 `KART-WORLD.md` §4.2。
- 車手：坐姿（腿、手握把手）、轉向與甩尾時上半身往彎內傾、噴射與起步時後仰（煞車前傾）、手跟著把手、被打中時（`Scene` 從 `hitFx` 的打轉得知）上半身搖晃、頭亂晃。`update(look, seconds, dazed)`。

**噴射特效（`src/kart/art/effects.ts`）**

- 火焰：每個噴口一個 `ShaderMaterial` 的噴流（lathe 幾何，掛在噴口的 anchor 上，所以跟著變身後的噴口走）；fragment 用視線與法線的夾角算厚度（中間白熱的心、邊緣是顏色）、沿長度從身的顏色到尖的顏色、往後跑的馬赫環、抖動。長度與粗細照 `BOOST_FX`，點火瞬間拉長。
- 點火：噴口一團閃光（0.16 秒）、地上光環（顏色與半徑照種類）、`n2o`／`team`／`start` 多一個立在車後、面向前進方向的衝擊波環（0.34 秒）、一把火花；持續噴的時候 `ribbons` 的種類每個噴口（最多兩個）拖一條世界座標的光帶（每 0.3 m 一個點、0.3 秒淡出、最多 30 點）並持續噴火花。
- 別人的車（`lite`）同一套，池子小一號（光帶 16 點、火花 40%）。
- 鏡頭沿用 §4.28 的 `kickRig`／`cameraPull`／FOV；自己的車變身開、收各有一聲（`kartAudio.morph`：鋸齒波掃頻的伺服聲＋一下扣上的聲音，合成）。

**後處理（`src/kart/post.ts`）與畫質（`quality.ts` 的 `post`）**

- 自己寫的一條鏈（沒有用 three.js examples 的 `EffectComposer`，省 bundle）：場景畫進 `HalfFloat` 的 render target（MSAA 4×，canvas 自己不開 antialias）→ 亮部（> 1.45，軟膝）降到 1/2 → 逐級減半 → 逐級用 tent 濾鏡加回去（bloom）→ 最後一個 pass：加 bloom、Khronos PBR Neutral 色調映射（0.76 以下的顏色不變，只壓高光）、sRGB、抖色。瀏覽器不能畫到浮點 target 時退回 8 bit（門檻 0.9）。
- 三級：`low` = `off`（直接畫到畫面，和以前一樣，沒有 bloom，發光件不超過 1）；`medium` = `bloom`（4 級 bloom＋色調映射）；`high` = `full`（5 級，另加輕微暈影、噴口後方的熱擾動（把自己的車的噴口後方投影到螢幕，在那一圈扭 UV）、噴射時往畫面邊緣的放射狀拖影）。`prefers-reduced-motion` 時不做拖影與熱擾動。
- 手機預設仍是 `medium`、桌機 `high`（`loadQuality`，沒變）；`/stats` 的 fps 遙測照舊分畫質記。
- **軟體繪圖時自動關掉**：`Scene.ts` 的 `softwareRenderer()` 開一個丟棄用的 context 讀 `UNMASKED_RENDERER_WEBGL`，是 SwiftShader、llvmpipe 之類（瀏覽器關了硬體加速、虛擬機、Playwright 的 headless Chromium）就不管畫質一律不做後處理，也不做環境貼圖（車漆沒有反射）。原因：軟體繪圖下 PMREM 一張就要好幾秒（兩個人的房間 e2e 會等不到畫面），後處理讓每幀慢好幾倍。環境貼圖是 64 px 的 cube（車在畫面上只有幾百像素）。

**測試**：`tests/kart/boostFx.test.ts`（每種的樣式、`boostFx`、`boostKindOf`、變身開 0.25 秒收 0.3 秒、`mini` 不變身、有 `bursts` 時照呼叫者的計數點火、只有 `boosting` 時先 `mini` 後 `n2o` 並再點一次、`morphEase`）。模型、特效、後處理要 WebGL，靠 `scripts/kart-shots.mjs`（真 GPU 截圖）、`scripts/kart-fps.mjs`（真 GPU、不鎖幀的 fps，拿來和另一個分支比）與卡丁車 e2e（軟體繪圖，所以走的是沒有後處理的那條路）。

**限制**：別人的車 N2O 變身晚 0.75 秒；觀戰與重播的團隊噴射是橘色（見上）；熱擾動只做自己的車；車還是程式拼的幾何（沒有 UV 貼圖、沒有法線貼圖、沒有骨架動畫）；`medium` 在舊手機上多一次全螢幕 pass 加 bloom 鏈，掉幀就切 `low`。

### 4.33 路線圖外：五張賽道重畫成技術型（2026-11-18，`feat/kart-technical-tracks`）

擁有者：「地圖要有趣一點，不要這麼多直線，像跑跑地圖很多經典的地圖，都有技術含量的。」五張內建賽道的路線全部重畫（id 不變、`revision` 各 +1，舊紀錄與幽靈車照慣例作廢）。**路線全部原創**：只學技術型賽道的設計語彙（連續 S 彎、髮夾串、越轉越緊的彎、雙 apex、窄門、彎接跳台、有風險的捷徑），沒有對照任何一款遊戲的任何一張地圖。設計原則與每張的個性在 `KART-FEEL.md` §10、`KART-WORLD.md` §6.0。

**程式**

- `shared/kart/tracks/circuit.ts`（新）：手畫賽道共用的建法。控制點 `[x, z, 寬, 高?]` → Catmull-Rom 取樣（高度用 smoothstep 在兩個控制點之間過渡，不會超出兩端）→ 從起跑線開始的 `road`、每 7 點一個檢查點與復位點、**八格**起跑格（以前手畫的四張只有六格）、跳台（把跳台唇前兩個路點墊成坡，`hillArt.ts` 就是照這個形狀畫楔形）、加速帶與道具箱（都用「最靠近某座標的路點」定位，路線改了不用重算 index）。河畔、漁港、淡江改用它；老街因為廟口分岔的島牆仍用自己的檔案；觀音山仍是編輯器的片段（`GUANYIN_PIECES`），所以照樣是「一張分享賽道」的建法與檢查。
- 漁港、淡江的控制點改寫成公尺（以前是「畫圖單位 × 比例」）；`HARBOUR_SCALE`、`TAMKANG_SCALE` 留著，場景仍用畫圖單位擺。
- **高低差**：河畔（堤防上坡 7 m ＋ 1.6 m 跳台）、淡江（宮燈道頂右轉上山 9 m、山頂髮夾、2 m 跳台、下坡）是新加的；漁港與老街仍是平面（`flatGolden.test.ts` 鎖的平面賽道剩這兩張）。淡江的校園場景是平的，所以山是「堆在校園上的土堤」：`hillGround(track, { near: 22, fade: 46 })`（一般坡道賽道是 26／110），`trackArt.ts` 的 `groundAt` 對淡江是 `tamkangGround + max(0, 土堤)`，樹、路燈、看台跟著土堤高度；校園建築都在土堤範圍外（山在宮燈道東側，原本沒有路也沒有建築）。
- **彎道配套**（`shared/kart/cornerSigns.ts` 純函式、`src/kart/art/cornerArt.ts` 的 `buildCornerDressing`），和箭頭板一樣從路線算，自訂賽道也有：
  - `apexKerbs`：每個彎內側一條加寬的紅白路緣石，佔彎的中間 70%、在 apex 最寬（3.4 m）、兩端收到 0：一眼看得出該切哪裡。
  - `brakeBoards`：總轉角 ≥ 75° 的彎，入彎前 90／60／30 m 在外側各立一塊倒數牌（三槓、兩槓、一槓，白底紅槓，自己畫的 canvas）；前面如果還是彎（S 彎中間）就不立。
  - `gatePosts`：路寬收到 ≤ 28.5 m、且前後 12 個路點內至少寬 1.4 m 的地方是「窄門」，進出口兩側各立一根 5.2 m 的紅白柱。
  - 既有的輪胎牆（最緊的彎外側）與箭頭板照舊。
- **電腦車**（`src/kart/bots/brain.ts`、`skill.ts`）：
  - `apex`（一般、困難 0.3；簡單沒有）：跑線往彎內靠。每個路點前後 28 m 的平均曲率 × 60 m 決定靠多少，所以 S 彎之間會換邊、chicane 會拉直；半徑 35 m 以下的髮夾不靠（甩尾的滑動兩邊都要留空間，實測靠內反而撞牆、噴不出來）。
  - `shortcuts`（只有困難）：路中間有島牆（`track.walls`）時整段固定走一條車道：困難走彎內那條（老街廟口的捷徑），其他走另一條。以前所有電腦車都走外側。`createBotBrain` 多一個 `walls` 參數。
- `scripts/kart/shape.ts`：**直線比例**的定義（見下）；`npm run kart:feel` 先印每張的圈長、直線比例、最長直線、左右換向次數，再印三種駕駛的秒數。`scripts/kart/track-svg.ts`＋`svg-png.mjs`（俯視圖，標路點編號、檢出自交與路緣折疊）、`track-check.ts`（三種難度＋三種駕駛跑三圈）、`track-shots.mjs`（真 GPU 行車截圖）是設計時用的工具，留著給下次改路線。

**直線比例**：中心線平滑後（五點）曲率半徑 > 150 m、且連續 ≥ 50 m 的路段佔圈長的比例。150 m：極速時不甩尾、方向只要輕輕帶；50 m：兩個 S 彎之間換向的那一瞬間不算直線。

| 賽道 | 圈長 前 → 後 | 直線比例 前 → 後 | 最長直線 前 → 後 | 換向次數 前 → 後 |
| --- | --- | --- | --- | --- |
| 河畔 | 2487 → 2436 m | 36% → **33%** | 342 → 273 m | 14 → 12 |
| 漁港 | 2737 → 2848 m | 54% → **31%** | 505 → 275 m | 10 → 22 |
| 淡江 | 2742 → 3132 m | 36% → **32%** | 524 → 377 m | 14 → 19 |
| 老街 | 2415 → 2424 m | 60% → **37%** | 462 → 323 m | 6 → 12 |
| 觀音山 | 1825 → 1875 m | 56% → **40%** | 190 → 180 m | 4 → 12 |

**高手 vs 新手**（`npm run kart:feel`，經典手感，三圈秒數；「差距」是新手比高手多花的時間）：

| 賽道 | 之前 新手／一般／高手 | 差距 | 之後 新手／一般／高手 | 差距 | 高手三圈瞬間加速 前 → 後 |
| --- | --- | --- | --- | --- | --- |
| 河畔 | 119.2／109.3／98.3 | 20.9 s（21%） | 122.1／109.9／102.9 | 19.1 s（19%） | 30 → 20 |
| 漁港 | 138.8／123.5／114.3 | 24.5 s（21%） | 138.9／124.7／118.5 | 20.4 s（17%） | 24 → 24 |
| 淡江 | 138.4／121.9／114.8 | 23.6 s（21%） | 155.9／140.2／132.9 | 23.0 s（17%） | 24 → 24 |
| 老街 | 129.7／111.4／106.7 | 22.9 s（21%） | 124.7／108.5／102.4 | 22.2 s（22%） | 10 → 9 |
| 觀音山 | 96.3／85.8／83.2 | 13.2 s（16%） | 96.3／83.8／78.0 | 18.3 s（23%） | 12 → 27 |

**這張表沒有如預期全面變大，照實寫**：只有觀音山明顯拉開（16% → 23%），老街持平，河畔、漁港、淡江反而縮了 2–4 個百分點。原因是這個量法的駕駛是電腦車：(1) 「新手」是簡單電腦車的手，它不會撞牆、也從不需要煞車（路寬 28 m 以上，甩尾不掉速），所以彎再多它也只是照 86% 極速開完；(2) 「高手」贏的幾乎全是瞬間加速，而電腦車只有在髮夾或接在長直線後的大彎才甩得夠深夠久（≥ 32°、≥ 0.45 秒），連續 S 彎與 chicane 它是靠跑線切過去，一次都噴不到，噴出來的速度在下一個彎前也用不完。也就是說：新路線對**人**的要求變多（連續換邊、窄門、跳台後馬上入彎、捷徑），但腳本量不到「新手會撞牆」這件事。要讓這個數字誠實，下一步是讓簡單電腦車在技術路段會犯錯（入彎太快擦牆、S 彎跟不上），而不是再改路線；這會動到對戰電腦的難度，沒有在這一批做。

**測試**：`tests/kart/technical.test.ts`（五張各一組：紀錄 key、直線比例低於上表上限且不高於重畫前、最長直線、換向 ≥ 10 次、路寬 ≥ 28 m、不自交、路緣不折疊、檢查點依序且相鄰 < 70 m、從每個復位點往下一個開會正向通過下一個檢查點、復位點在路上且離島牆夠遠、起跑格八格都在線後的路上且互不重疊、加速帶與道具箱在路上、跳台數與高低差如表、跳台後 30 m 是直的；**簡單／一般／困難電腦車各兩個種子跑完三圈、零次逆走警告、零次卡住復位**；困難走老街捷徑而其他不走；每張都是困難 < 一般 < 簡單）、`cornerSigns.test.ts`（apex 路緣石、倒數牌、窄門柱）。既有測試的預期照新路線更新：`expert.test.ts` 的三圈秒數、`feel.test.ts`（跳台落地加速不算瞬間加速、高手 < 新手 × 0.87）、`tamkang.test.ts`／`timeTrial.test.ts` 的急彎數、`flatGolden.test.ts`（賽道 hash 重取，只剩漁港與老街；**測試場的 hash 沒變**，物理沒有動）。

**限制**：(1) 上面說的差距量法。(2) 淡江的土堤會蓋住它範圍內的校園地面裝飾；建築沒事。(3) 老街只把直線打斷、後巷 S 彎做實，廟口分岔沒動；沒有新增第二條捷徑。(4) 漁港、老街沒有跳台（它們的場景有自己的地面高度，沒有接坡道地面）。(5) 沒有做「技術展示」的第六張賽道。(6) 與 `feat/kart-feel-team-n2o` 同時進行：它如果也改了 `revision` 或 `flatGolden` 的 hash，合併時 `revision` 取較大值再 +1、hash 重取。

### 4.34 路線圖外：有甩到就噴、團隊賽的噴射個人集個人的（紅與藍）（2026-11-18，`feat/kart-feel-team-n2o`）

擁有者 2026-11-18（試完 #99–#101）：「感覺好像又甩太大了，有甩到就應該噴，只是抓地力不用這麼好，再來就是雖然是團隊賽，但是N2O是個人集個人的，有分紅跟藍氮氣」。

**一、瞬間加速的門檻**（`KART-FEEL.md` §3.2、§5、§6 的 A–E）

- `dashMinSlip` 32° → **18°**、`dashMinSeconds` 0.45 s → **0.22 s**：車尾明顯滑出去、甩了一小段就有；點一下就放（≤ 0.2 秒）沒有。達標時（方向打滿 0.23 秒）側滑 28°、行進方向只轉了 26°，#100 是轉了 56° 才有。
- **抓地沒有調回去**：`driftSlipIn` 0.45 s、`driftLoose` 0.6、`driftRecoverRate` 1.1 都不動；`driftScrub` 18 → **22**（甩著的時候多掉一點速度）。
- 瞬間加速本身收一點：`chainDuration` 0.8 → **0.7 s**、`dashAccelFactor` 1.8 → **1.7**、`miniTopSpeedFactor` 1.10 → **1.08**。目的是「直線左右硬甩連噴」不划算：12 秒 11 次、前進 819 m 對直直開 816 m（+0.4%），左右各偏 26 m（路寬 28–34 m）。只降門檻不收效果的話是 840 m（+3%）。`tests/kart/classic.test.ts` 有這條測試。
- 雙收尾維持關閉（它等於把點甩放回來）。兩組變化預設也跟著降（抓地 15°／0.2 s、滑胎 24°／0.3 s、滑胎的 `driftScrub` 28）。
- **電腦車**（`brain.ts`）：在大彎仍照自己的標準甩深甩久（`CLASSIC_HOLD_SLIP` 32°、`CLASSIC_HOLD_SECONDS` 0.45 s）。試過讓它照新門檻提早放：（舊河畔）撞牆次數從三圈 2 次變 11 次、反而慢 5 秒，所以路線不動，只是比較短的甩尾現在也有瞬間加速。不打算噴的手在瞬間加速備妥時不重踩油門（簡單電腦車原本會因為「到極速收油再踩」碰巧噴出來：舊河畔三圈 22 次 → 1–7 次）。
- **數字**（`npm run kart:feel`，三圈，在 §4.33 重畫過的賽道上；括號是同樣賽道、#100 的門檻與數值）：高手瞬間加速 河畔 40（19）、漁港 30（24）、淡江 40（26）、老街 15（9）、觀音山 32（27）；其中跳台落地加速河畔 3、淡江 3、觀音山 6，扣掉之後每圈 5–12 次（#100 的門檻 3–8 次）。高手比新手少 13–17% 的時間（#100 的門檻 15–19%：瞬間加速收小、甩尾掉速多了一點，高手慢 0.7–3.3 秒，只有河畔快 0.9 秒）。重畫前的舊賽道上量的數字（36／31／45／10／17）在 `KART-FEEL.md` §5。
- HUD 的量表文字「甩深一點」→「再甩一下」（`kart.hud.depth`）；量表的算法沒動（讀同兩個參數）。
- 內建賽道 `revision`：和 §4.33（同一天重畫賽道、也各 +1）撞號，合併時取較大值再 +1：`riverside@11`、`harbour@11`、`tamkang@10`、`oldstreet@6`、`guanyin@6`（`GUANYIN_REVISION`）、`CUSTOM_REVISION` 5（同一張圖的紀錄不能和舊物理的混在一起）；調參存檔 key `.6`；經典手感的黃金雜湊重取，街機（舊）的沒動。

**二、團隊賽的噴射：個人集個人的，分紅與藍**（線上格式 `KART-NETCODE.md` §17）

- **原作研究**（經典 PC 版的團隊競速；只學規則，名稱與畫面不用）。來源與確信度：
  - 中文維基百科「跑跑卡丁車」（實際讀到頁面）：甩尾集氣，個人的集氣條滿了得到一個紅色加速器；「藍氣集滿時，全隊持有的紅色加速器升級為加速時間更長的藍色加速器」。<https://zh.wikipedia.org/zh-tw/跑跑卡丁車>
  - namu.wiki「크레이지레이싱 카트라이더/아이템」「용어사전」（頁面回 403，只看到搜尋摘要，沒有逐字核對）：只有甩尾能集團隊條；甩尾集個人條的同時團隊條加同樣的量；團隊條的需求量＝個人條 × 2 × 隊員數；滿的時候手上沒有加速器的人不會得到；藍色的（俗稱團隊加速器）持續約 4.5 秒，是一般的 1.5 倍；轉換的瞬間有很短的不能用的時間。<https://namu.wiki/w/크레이지레이싱%20카트라이더/아이템>
  - 後來的同系列作品（wiki.gg，實際讀到）：全隊共用一條，集滿時「一般的加速器升級成團隊加速器」，時間是兩倍。<https://kartriderdrift.wiki.gg/wiki/Speed_mode>
  - 沒有任何來源說紅藍和隊伍顏色有關：都是「一般＝紅、團隊＝藍」，兩隊一樣（這一點是從各來源一致的描述推出來的，沒有哪一句正面寫出來）。沒有找到官方的規則頁。兩個來源有一處不同（中文維基說斷位時全隊得到藍氣，namu 說甩尾就同步累積），採 namu 的。
- **採用的規則**：(1) 每台車照常集自己的加速條、拿自己的存量（最多 2），團隊賽裡畫成**紅色**。(2) 每隊一條共用的團隊加速條，**只有甩尾**累積，需求量約為「全隊每人集滿自己的兩次」。(3) 它滿的那一刻，隊上每台還在跑的車**手上有的存量全部變藍**；手上沒有的這次沒有；之後才集到的是紅的。(4) 藍色的先噴，噴一個扣一個存量，一次只噴一個。(5) 藍色與隊伍顏色無關。**和原作不同、刻意的地方**：藍色除了比較久（1.5 倍，和原作一樣）還比較快（擁有者在 #101 說的「噴比較久比較快」，數值沒動）；轉換瞬間的短暫鎖定沒做；團隊條不是和個人條逐點同步（房間看不到個人條），而是房間自己從 frame 算、速率調成差不多的量。#101 的「滿了每人另外發一個團隊噴射」整個換掉。
- **物理**（`classic.ts`、`physics.ts` 的 `stepArcadeTeam`）：`KartState.teamBoosts` 的意思從「另外可以噴幾個團隊噴射」改成「手上的存量有幾個是藍的」（不會超過 `storedBoosts`）。噴射鍵噴一個存量：有藍的就是藍的（`teamSeconds`），否則是一般的。沒有存量就沒有藍色可噴。
- **房間**（`rules.ts`）：`tfill` 把那一隊還在跑的車的 `teamBoosts` 設成 2（上限）；新的 system 動作 `tkeep { seat, held }` 只能往下改。`fillTeamGauge` 的累積只看甩尾（`TEAM_GAUGE.driftRate` 14 → 30，`dashPoints` 拿掉）。`judgeTeamKeep` 檢查「比賽中、還在跑、回應的是目前這次滿、比現在少」。
- **誰知道手上有幾個**：只有車自己的瀏覽器（存量在本機物理裡；房間照 `KART-NETCODE.md` §1 不信任回報的集氣量，也沒有要它回報）。`shared/kart/teamRider.ts` 在看到 `fills` 變了的那一步取 min（房間給的、手上的存量），少了就送 8 bytes 的 `OP_TEAM_KEEP`（道具 frame 的 op 4，新增）。房間只接受往下，所以最壞的情況是改過的瀏覽器不送、每次滿都拿滿 2 個藍色額度。車手、電腦車、壓測機器人共用同一個 rider。
- **HUD**：個人加速條面板的存量格在團隊賽裡分顏色（`Hud.tsx`）：藍的排前面（先噴）、其餘是隊伍賽的紅（`color.teamBoost`、`color.teamRed`），`aria-label` 是「可用噴射：紅 1、藍 1（最多 2）」，`data-red`／`data-blue` 給測試。個人賽照舊（洋紅、沒有紅藍）。團隊加速條面板（`TeamHud.tsx` 的 `TeamPanel`）拿掉原本的「團隊噴射持有數」，改成一行說明「滿了：手上的噴射變藍色」，燃燒中顯示「藍色噴射」。滿的時候畫面上方的提示分兩種：手上有存量「你手上的噴射變成藍色！」、沒有「可是你手上沒有噴射可以變藍」。只動內容，面板的樣式（`glass`、斜角、字體）沿用 §4.32 的電競風格。
- **觀戰與重播**（#99 回報的「團隊噴射是橘色」）：觀戰 `SpectateView.tsx` 照 `netRace.ts` 的 `others()` 用 `teamUntil` 填 `look.boostKind = 'team'`。重播的錄影（`shared/kart/replay.ts`）多一塊選用的 `teams`（每一次藍色噴射的起訖 tick、加速條每次變動），`ReplayRacer.team` 記隊伍；`teamBurnsAt`、`teamGaugesAt` 給播放用。兩個畫面左上角都多了兩隊即時總分（`runningScore`）與兩隊的團隊加速條（`TeamGauges`）。舊的重播檔沒有這一塊，照樣能播（沒有藍色、沒有團隊 HUD）。
- **測試**：`tests/kart/classic.test.ts`（真的甩出去就有、置中甩也有、點甩沒有、直線硬甩不划算、量表）、`tests/kart/feel.test.ts`（高手三圈 8–48 次）、`tests/kart/team.test.ts`（只有甩尾算、需求量約兩倍、藍色扣存量與先後順序、沒有存量就沒有藍色、rider 的各種情況：手上 2／1／0 個、之後集到的是紅的、撞掉存量、房間沒記到；房間的 `tkeep`：只往下、只認目前這次滿、玩家不能自己送動作）、`tests/kart/replay.test.ts`（錄到隊伍、藍色噴射、加速條）、`tests/kart/hud.test.tsx`（紅藍存量格）、`tests/kart/teamUi.test.tsx`（面板文字、觀戰用的兩隊加速條）、`e2e/kart-team.spec.ts`。
- **測試用的自動駕駛**：`?autopilot=drift`（`src/kart/race/autopilot.ts` 的 `driftingAutopilot`）＝原本的 `?autopilot` 加上「高速的彎道按住甩尾、留一個存量等變藍、多的噴掉」，給截圖與手動檢查團隊賽用；原本的 `?autopilot` 不變。
- **限制**：改過的瀏覽器可以每次滿都拿 2 個藍色額度（見上）；`fills` 只送低 8 位（一場比賽滿不到 256 次）；`?autopilot` 不甩尾，所以它永遠沒有存量、也就沒有藍色；電腦車一有存量就在直線上噴掉，所以團隊條滿的時候它們手上常常是空的（真人會學著留）。六台電腦車 3 圈（3 對 3，重畫後的賽道）：困難在河畔兩隊各滿 5 次（約 22 秒一次）、每台噴到 0–2 個藍的；普通在淡江各滿 6–7 次、每台 0–1 個；簡單在漁港各滿 5–6 次、每台 0–3 個。
### 4.35 路線圖外：卡丁車電競畫風（2026-11-18，`feat/kart-esports-art`）

擁有者試完 §4.32 的車款與變身：「畫風跟人物跟車子要再更電競感，現在像個小朋友玩的一樣。」車款、車手、卡丁車介面、光照與後處理改成職業賽事轉播的樣子。**全部原創、全部程式產生**；車款 id、四位角色的身分、變身機制、`boostFx.ts` 的 API、賽道路線都沒動。風格規則在 `DESIGN.md` §3.6，造型描述在 `KART-WORLD.md` §3、§4.2。

**程式**

- `src/kart/art/kartParts.ts`：新增 `hull`（切面船身：每個截面是頂、兩肩、兩腰、兩龍骨、底共八點，面與面之間不共用頂點所以每一面都是平的；注意三角形的繞向要朝外）、`wedge`、`decalTexture`；`BodyKit` 新增 `decal(parent, kind, w, l, x, y, z, face?, tilt?)`（`kind` 是 `number` 或 `mark`，`face` 是朝上／左／右／後，幽靈車不畫）與 `colour` 的第四個參數（自發光，霓虹面板在陰影與夜裡不會變黑）。
- `src/kart/art/kartBodies.ts`：六台車重寫，共用 `cockpit`（風擋、邊框、整流罩）、`rearWing`（後掠主翼、霓虹唇、發光後緣、有號碼的端板、跟著翼一起動的支柱）、`skirt`、`thruster`（八角渦輪殼＋肋環＋原本的 `kit.nozzle`）、`slit`（細縫燈）、`coreHatch`。每個 `kit.morph` 的目標沿用 §4.32。座位改成 `y: 0`：車手的髖在車身裡，腰以上露出來。
- `src/kart/art/kartModel.ts`：離地高度 0.34 → 0.27 m；漆改霧面（粗糙度 0.46）；`accent` 帶 0.32 的自發光；貼花材質（`alphaTest` 0.45、`polygonOffset`，每台車號碼與標誌各一張 canvas：128×64、64×64）；發光條的材質每格依速度與噴射熱度改顏色；把手換成方向軛。`KartModel`、`KartLook` 的介面沒變。
- `src/kart/art/driverModel.ts`：重寫成正常比例的坐姿車手；`DriverModel`（`group`、`torso`、`head`、`arms`）不變，所以 `kartModel.ts` 的傾身、後仰、被打中的搖晃照舊。四肢是兩點之間的六角柱（`limb`），軀幹與安全帽是 `hull`。賽車號碼 `DRIVER_NUMBERS` 在 `shared/kart/karts.ts`（等待室的車庫也顯示，不能從 three.js 的檔案拿）。
- `src/styles/kartTokens.ts`：`kartBodies`、`kartDrivers`（新增 `panel`、`visor`）改色，新增 `kartLivery`；`kartThemes` 四個主題降天光、升太陽光，`day` 改成傍晚。
- `src/kart/post.ts`：`grade`（色調曲線前的對比 ×1.1、飽和 ×1.14）；bloom 門檻 1.45 → 1.3、強度 0.55 → 0.48、擴散 1 → 0.85；暗角 0.3 → 0.36。層數與 pass 數沒變，成本相同。
- `src/kart/ui/broadcast.ts`（新）：`broadcast`、`broadcastSolid`、`ticker`、`digits`、`slam`、`streak`、`splitShadow`。卡丁車畫面裡原本用 `glass` 的十三處改用 `broadcast`；`RaceOverlay.tsx`（圈數 ticker、計時 digits、倒數大字、提示、成績）、`RaceView.tsx`（名次、名牌、警告）、`Standings.tsx`（名次表）、`RosterPicker.tsx`／`GaragePanel.tsx`（車庫）、`Hud.tsx`（喊話的砸入與橫掃光）照新樣式。DOM 結構、`data-testid`、ARIA、版面位置都沒變，所以既有的 e2e 不用改。
- `scripts/kart-ui-shots.mjs`（新）：用真 GPU 截卡丁車介面（倒數、計時賽、車庫、電腦賽設定、比賽中、成績）在桌機、手機橫、手機直與中英文的圖，跟 `kart-shots.mjs` 一樣只給人看、不比對。

**效能**：卡丁車 chunk 353.0 kB gzip（改動前約 347 kB）（預算 600 kB）。每台車的 draw call 與 §4.32 同級（同材質合併；多了兩張小貼花貼圖與一到兩個貼花 mesh）；切面船身每段 16 個三角形，比原本 20–24 邊的蒙皮少。後處理的 pass 數沒變。

**沒做**：車庫的 3D 轉台（`/kart` 的車庫選了要關掉面板才換車，預覽得另開一個 WebGL context，手機記憶體不划算；先用色條與號碼）；等待室的車庫（`RoomGarage.tsx`）只跟著 `RosterPicker` 換樣式。

### 4.36 路線圖外：加速條看甩尾品質、時機三級、連段；量法換成噴射覆蓋率（2026-11-18，`feat/kart-n2o-economy`）

擁有者試完 #102–#104：「氮氣集太慢，要設計成高手可以整路噴，但新手不行，然後技術要求高一點，地圖可能也有差，地圖多設計一些，要有實力鑑別度的」。地圖在另一個分支（`feat/kart-more-tracks`）；這一批是集氣規則、技術上限、量法與 HUD。規格與要試的清單：`KART-FEEL.md` §3.2、§3.5、§5.1、§6、§7。

**一、規則**（`shared/kart/classic.ts`；只有經典手感，街機（舊）每一步都沒變）

- **加速條分兩筆**。甩尾中的小筆：`gaugeFillRate` 34 ×（速度比）² × 深度 × 起步（前 `gaugeLead` 0.2 秒不給）× 遞減 × 連段倍率。出彎接瞬間加速的大筆（一次給）：`gaugeDashBonus` 24 × `driftWorthOf()`（深度 0.6–1.25 × 長度：0.3 秒以下 0、0.52 秒以上 1）×（速度比）² × 時機（1.4／1／0.6）× `comboFactor()`（每環 +12%、最多 5 環）；甩尾中碰過牆是 0。極速下一個 0.5–0.6 秒的甩尾：小筆 6.5–9.5、大筆完美 34–36／普通 21–23／太晚 14–15。
- **噴射中照常集氣**（`boostGaugeShare` 1，藍色團隊噴射中也是）。#102 以前是不集。這條是「整路噴」的前提：噴射佔七成時間時，那七成的甩尾不能白甩。
- **時機三級**（`KartState.dashGrade`，常數 `DASH_LATE`／`DASH_GOOD`／`DASH_PERFECT`）：完美＝甩尾 ≥ `perfectMinSeconds` 0.4 秒，且放開甩尾鍵後 `perfectWindow` 0.1 秒內新按前進，且放開前 0.2 秒內沒有在甩尾中白按過前進（`tapEarly`：連打拿不到）；普通＝滑出中較晚，或甩尾鍵還按著；太晚＝回正後的窗。完美的瞬間加速 0.98 秒、推力 ×1.9、上限 ×1.11；太晚的 0.42 秒、×1.5、×1.05。
- **連段**沿用 `chain`／`chainWindow`：`chainGrace` 1 → 2.5 秒，窗在甩尾中與噴射中都不倒數；太晚與碰牆的那一次不加；賺到瞬間加速沒噴（窗過了、或直接再甩）歸零；重撞牆歸零。
- **撞牆**（`course.ts` `afterWalls`）：甩尾或滑出中碰到牆 → `driftDirty`；重撞（≥ `wallBreakSpeed`）加速條依力道扣（剛過門檻約 17%，三倍門檻以上扣到剩 `wallGaugeKeep`）。
- `KartState` 新增的欄位全是選填、只有經典手感會設：`driftDirty`、`sinceRelease`、`driftWorth`、`driftHeld`、`tapEarly`、`dashGrade`、`dashCount`、`gaugeGain`。街機（舊）的狀態物件一個鍵都沒多（`flatGolden.test.ts` 連鍵名一起雜湊）。
- 新參數（調參面板都看得到）：`gaugeLead`、`gaugeDashBonus`、`gaugeComboStep`、`gaugeComboLinks`、`perfectWindow`、`perfectMinSeconds`、`perfectShare`、`perfectAccelStep`、`perfectSpeedStep`、`lateShare`；`boostGaugeShare` 經典手感現在也讀；`chainGrace` 的上限放寬到 5 秒。調參的儲存鍵換成 `tku-arcade.kart.tuning.7`（舊鍵存的集氣數字會蓋掉新規則）。
- **直線硬甩**（#102 的檢查保留，再加一條算上加速條的）：直線上左右連甩連噴、集到就噴 N2O，30 秒，甩到剛好夠／多撐 0.2 秒／多撐 0.4 秒，前進距離都 ≤ 直直開的 101%。靠的是三件事：前 0.2 秒不集氣、大筆在 0.3 秒以下是 0、完美要 0.4 秒以上。
- **團隊條（§4.34）不動**：`shared/kart/team.ts` 的 `teamGain` 只看甩尾中的時間與速度，伺服器沒改，所以這批沒有跑 `kart:loadtest -- --teams`。理由寫在 `KART-FEEL.md` §3.5。
- 內建賽道 `revision` 各 +1（河畔 12、漁港 12、淡江 11、老街 7、觀音山 7）、`CUSTOM_REVISION` 5 → 6：紀錄與幽靈車重來。經典手感的 golden 重取（`flatGolden.test.ts`）；街機（舊）的三個雜湊沒變。

**二、量法**（`scripts/kart/drivers.ts`、`src/kart/bots/drivers.ts`、`scripts/kart-feel.ts`）

- **噴射覆蓋率**＝比賽中 `kartBoosting()` 為真的步數比例。`measure(track, driver, tuning, seed)` 回傳秒數、最快圈、覆蓋率、其中 N2O 的比例、N2O 發數、瞬間加速數與三級各幾次、最長連段、重撞牆數、復位數。新賽道直接呼叫它。
- **駕駛腳本是人**：`DRIVERS.novice`／`average`／`expert`＝對戰電腦的追路線（`brain.ts`）＋人的手（`Hands`：方向抖、恍神、彎前鬆油門、亂甩、放太晚）。`createDriver(driver, track, tuning, seed)` 回傳 `(trial) => KartInput`，有種子、可重現。放在 `src/` 是為了 `/kart/spike?autopilot=expert|average|novice` 能在瀏覽器裡看它開。
- **對戰電腦沒有變**：`BOT_SKILLS` 三級一個數字都沒改。`BotSkill` 多了五個選填欄位，只有腳本在用，沒給的時候 `brain.ts` 走原本的路、亂數序列也一樣：`flatOut`（不在自己的極速收油）、`exitWait`／`liftSteps`（放開甩尾後多久鬆油門、鬆多久：時機）、`boostAt`（多彎還敢噴 N2O）、`holdSeconds`（每個甩尾甩滿）、`cornerTurn`（前方路轉不到這麼多就不甩；`turnAhead()`）。困難電腦車的手照舊（短甩多），在新規則下河畔三圈 101.1 秒、覆蓋率 44–58%；試過把 `holdSeconds`／`cornerTurn` 給它，覆蓋率到 71–88% 但撞牆多三倍、秒數沒變快，所以沒給。
- **結果**（5 場平均，三圈）：高手 79–89%（老街 43%）、中等 19–37%、新手 5–11%；高手比新手少 35–41% 的時間。完整的表、怎麼讀、哪裡沒達標在 `KART-FEEL.md` §5.1。`npm run kart:feel -- --seeds 5`（`--classic` 只跑經典）。

**三、HUD**（`src/kart/Hud.tsx`、`spikeLoop.ts`、`callouts.ts`；樣式用 `ui/broadcast.ts` 的 `ticker`）

`SpikeHud` 多 `combo`、`perfectReady`、`gains`、`gain`、`grade`（都選填）。加速條面板：洋紅「連段 ×n」ticker；獎勵進帳時整條閃光（`Jump`）＋飄走的「+35」（`Gain`，以 `gains` 當 key 重播）；甩夠久時金色提示換成發光的「完美時機 已備妥」。大字多 `perfect`（「完美！」／「完美！連段 ×n」）與 `late`。`scripts/kart-ui-shots.mjs --only combo` 截圖。

**測試**：`tests/kart/classic.test.ts`「the gauge by the quality of the drift」（點甩不集、速度平方、噴射中集、三級時機、完美要甩夠久、連打不算、不接只有三分之一、連段與中斷、碰牆與重撞、直線硬甩 ×3）；`feel.test.ts`（覆蓋率與秒數的門檻）；`hud.test.tsx`（連段、獎勵數字、完美提示、大字）；`team.test.ts`（團隊條的節奏、藍色噴射中照常集）。e2e：測試場太小、速度低，原本「甩一圈就集滿」的兩個情境改成先存一組集得快的調參（`quickGauge`）；回正後才按的那一下現在是「太晚」。

**沒做**：聲音沒有分級（完美與普通同一聲）；困難電腦車不會新打法（見上）；老街到不了 70%（要改路線）；時機窗沒有依裝置調整（手機兩指的 0.1 秒可能偏緊，等擁有者試）。
### 4.37 路線圖外：四張新的技術賽道、漲潮盃（2026-11-18，`feat/kart-more-tracks`）

擁有者：「技術要求高一點，地圖可能也有差，地圖多設計一些，要有實力鑑別度的。」新增四張內建賽道（原本五張 → 九張）與一個收錄它們的盃。**路線、名稱（暫名）、場景全部原創**，主題是淡水一帶的地方；沒有對照或重現任何一款遊戲的任何一張地圖（`IP-CHECKLIST.md`）。每張的個性與設計原則在 `KART-FEEL.md` §10.1、`KART-WORLD.md` §6.0。

**程式**

- `shared/kart/tracks/lay.ts`（新）：第二種畫賽道的方法。`circuit.ts` 是「手擺控制點再用 Catmull-Rom 平滑」，適合跟著地形走的路；技術賽道要的是「這個髮夾半徑 31 m、那個 36 m」這種精確度，所以改成像烏龜走路：從起跑線開始一段一段寫 `line(長, 寬)`、`right(角度, 半徑, 寬)`、`left(...)`，每 6 m 取一個路點（寬度沿著一段線性變、高度用 smoothstep）。**其中兩段直線寫 `fitted(寬)`，長度由程式解**（終點位置對這兩個長度是線性的，解 2×2）讓圈剛好接回起跑線；轉角總和不是 ±360°、兩段平行、或解出來短於 12 m 都直接丟錯。`mark`／`mid` 幫某一段的終點或中點取名，跳台、加速帶、道具箱用名字定位。產出的是 `CircuitPoint[]`，交給 `circuit()`（`sample` 相同，所以每個點就是一個路點）做檢查點、復位點、八格起跑格、跳台坡。
- `circuit.ts` 多一個選項 `island: { from, inner, outer }`：在「路寬 ≥ from」的那一段中間圍一圈島牆（兩側沿路、兩端各一個尖鼻），把路分成兩條車道；回傳 `walls`。和老街廟口的攤位島同一種做法，老街的檔案沒動。
- 四張：`mangrove.ts`、`fort.ts`、`danhai.ts`、`datun.ts`；`list.ts`（`RACE_TRACK_IDS`）、`registry.ts`、`spikeLoop.ts`（`SPIKE_COURSES`）、字串 `kart.course.<id>`／`games.kart.track.<id>`。`revision` 都是 1（紀錄 key 就是 id）。各自在檔案裡指定 `theme`（`day`／`sunset`／`night`／`campus`），所以光照與天空走既有的 `kartThemes`（#104 的電競對比）。單機計時賽（紀錄、幽靈車）、對戰電腦、多人房選單、小地圖、道具箱都是跟著 id 清單來的，不用另外接。
- **盃**（`src/kart/cup/cups.ts`）：`flood` 漲潮盃＝紅樹林 → 淡海 → 砲台 → 大屯（由易到難）。原有三個盃沒動。
- **場景**（`src/kart/art/localPlan.ts` 純函式、`localArt.ts`）：每張一個認路用的地標，位置從路線算（`roadClearance`），永遠不會壓到路；共用的樹與節慶佈置會避開它們（`fits`）。紅樹林：潮池、池邊的紅樹林叢、白鷺、起跑直線旁的棧道。砲台：跳台直線正前方的紅磚砲台（城牆、四個稜堡、主樓、四門砲、會飄的三角旗）與山頂的矮磚牆。淡海：約 120 棟亮窗大樓（窗戶貼圖同時當 `emissiveMap`）、屋頂霓虹邊（青、洋紅、琥珀，`MeshBasicMaterial`，進 bloom）、圓環中央兩個慢慢轉的光環。大屯：芒草、火山岩、稜線上的氣象雷達球、冒蒸氣的噴氣孔。顏色在 `kartTokens.ts` 的 `localScene`。全部是程式畫的形狀與 canvas 貼圖，沒有模型或圖檔，沒有真實建築的照片、招牌或標誌。
- 設計工具：`scripts/kart/track-hits.ts`（三種駕駛各在哪個路點撞牆、高手在哪裡噴到）、`track-shot-at.mjs`（電腦開到某個座標時截一張）。

**數字**（`npm run kart:feel`，經典手感，三圈秒數；前五張是既有的，同一次量）

| 賽道 | 圈長 | 直線比例 | 最長直線 | 換向 | 新手／一般／高手 | 高手 vs 新手 | 高手三圈瞬間加速 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 河畔 | 2436 m | 33% | 273 m | 12 | 121.5／110.7／102.3 | 19.2 s（19%） | 40 |
| 漁港 | 2848 m | 31% | 275 m | 22 | 139.0／125.0／119.0 | 20.0 s（17%） | 30 |
| 淡江 | 3132 m | 32% | 377 m | 19 | 155.6／140.7／134.8 | 20.8 s（15%） | 40 |
| 老街 | 2424 m | 37% | 323 m | 12 | 124.9／110.6／105.5 | 19.5 s（18%） | 15 |
| 觀音山 | 1875 m | 40% | 180 m | 12 | 95.9／84.1／79.9 | 15.9 s（20%） | 32 |
| **紅樹林水道** | 2481 m | **17%** | 267 m | 20 | 123.8／106.6／100.4 | **23.4 s（23%）** | 47 |
| **滬尾砲台坡** | 1833 m | **21%** | 168 m | 12 | 88.6／81.6／79.2 | 9.3 s（12%） | 33 |
| **淡海夜城** | 2033 m | **23%** | 202 m | 12 | 99.3／88.8／83.0 | 16.3 s（20%） | 33 |
| **大屯稜線** | 2758 m | **22%** | 148 m | 20 | 137.3／124.5／120.5 | 16.8 s（14%） | 47 |

直線比例四張都在目標 30% 以下（既有五張 31–40%）。

**「高手 vs 新手」照實寫**：目標是四張都比既有五張大，**只有紅樹林做到（23%），淡海持平（20%），砲台與大屯反而比較小（12%、14%）**。這個量法的三位駕駛都是電腦車（§4.33 寫過它的限制），這次多看到兩件事：(1) 「新手」慢的主因是它只開到極速的 86%，這在快的連續彎（紅樹林的蛇形）最吃虧；髮夾與上坡每個人都得慢下來，極速上限反而沒差，所以髮夾多、有坡的砲台與大屯差距小。(2) 「高手」電腦車在最刁的地方自己也會撞牆（跳台落地馬上接彎、越轉越緊的髮夾：它在空中與剛噴完時不會收油），三圈撞 6–10 次，把噴到的時間吐回去；「一般」（不噴、不撞）只比它慢 2–6 秒。也就是說，這個數字量的是電腦車的手，不是賽道對人的鑑別度：人在這些彎會先收油或早一點甩，電腦車不會。`feat/kart-n2o-economy`（另一個進行中的分支）在做比較像人的駕駛腳本與「噴射覆蓋率」，它先合併了，用它量的結果在下一段。沒有為了讓數字好看去動電腦車（`brain.ts`、`skill.ts` 那個分支正在改）。

**用人類化駕駛量（合併 #105 之後，定稿的量法）**：`feat/kart-n2o-economy`（§4.36，#105）在這一批合併前先進了 main，`kart:feel` 換成會犯錯、會撞牆復位的駕駛，並多了「噴射覆蓋率」（整場比賽有多少時間在噴）。合併 main 之後在同一棵樹上量（`npm run kart:feel -- --classic`，三個種子平均，三圈秒數；上面那張表是合併前舊量法的紀錄）：

| 賽道 | 新手／一般／高手（秒） | 新手比高手多花 | 噴射覆蓋率 新手／一般／高手 | 高手撞牆（三圈） |
| --- | --- | --- | --- | --- |
| 河畔 | 152.9／126.6／90.8 | 68% | 6%／19%／88% | 11.7 |
| 漁港 | 180.9／128.6／108.3 | 67% | 11%／37%／80% | 14.7 |
| 淡江 | 194.6／150.6／120.0 | 62% | 8%／30%／80% | 14.3 |
| 老街 | 143.6／109.3／96.8 | 48% | 9%／32%／45% | 4.3 |
| 觀音山 | 116.1／89.2／72.5 | 60% | 10%／39%／80% | 8.3 |
| **紅樹林水道** | 167.2／120.1／89.5 | **87%** | 14%／52%／88% | 10.7 |
| **淡海夜城** | 134.1／91.3／77.2 | **74%** | 10%／60%／83% | 11.3 |
| **滬尾砲台坡** | 124.8／83.7／72.4 | **72%** | 13%／41%／77% | 16.0 |
| **大屯稜線** | 175.8／131.4／112.9 | 56% | 16%／50%／77% | 23.0 |

用這個量法，**紅樹林、淡海、砲台的差距比既有五張（48–68%）都大；大屯 56% 落在中間**：它最難，連高手腳本三圈也撞 23 次，高手自己被拖慢（新手在上面也有 16% 的時間在噴，是九張裡最高的：彎多到亂甩也集得到）。大屯要不要把最刁的兩三個彎放寬，等擁有者實際開過再決定。新四張的 `revision` 仍是 1（#105 改了物理，但它們還沒上線過，沒有舊紀錄要作廢）。

**測試**：`tests/kart/technical.test.ts` 的整組檢查現在跑九張（新四張的上限：直線比例 < 30%）：不自交、路緣不折疊、路寬 ≥ 28 m、檢查點依序且相鄰 < 70 m、復位點在路上且離島牆夠遠、起跑格八格、加速帶與道具箱在路上、跳台數與落地直線、**簡單／一般／困難各兩個種子三圈零逆走零復位**、困難 < 一般 < 簡單。`tests/kart/moreTracks.test.ts`（新）：`lay()`（閉合、弧在圓上、寬高、三種拒絕）、每張的彎數與換向下限、道具箱、三種駕駛的順序與差距下限（寬鬆：物理還在改）、場景不壓路且每次相同、砲台在跳台正前方、光環在圓環圓心、淡海島牆是封閉的一圈且兩側車道夠寬、**困難電腦車走圓環內側捷徑、其他走外側**。`cornerSigns.test.ts`、`cup.test.tsx` 加新圖與新盃。e2e `kart-more-tracks.spec.ts`：四張各自從賽道選單開成計時賽（小地圖、淡海的島牆畫在地圖上）、對戰電腦與大獎賽選單列出四張與漲潮盃、大屯對一台電腦跑一圈過兩個跳台。

**限制**：(1) 上面說的差距量法。(2) 名稱是暫名。(3) 潮池是貼地的平面，行車視角只看得到一條水色，認得出來的是池邊的紅樹林。(4) 大屯的 31 m 髮夾與兩個落地彎，困難電腦車每圈大約撞一次；它跑得完、不逆走不卡住，但看起來不夠聰明。(5) 沒有做會動的障礙、第二條捷徑。(6) 卡丁車 chunk 353 → 361 kB gzip（預算 600 kB）（四張的路線是執行時算的，不是存好的座標）。

### 4.38 路線圖外：反直覺技術（甩尾起跳、飛越矮欄、穿縫）、兩張背圖賽道、巷弄盃（2026-11-19，`feat/kart-skill-tracks`）

擁有者：「太容易變成高手了……上跳台前要先甩、要提前背好地圖、有捷徑但是要技術好才過得去。」規格、操作方式與量到的數字在 `KART-FEEL.md` §11；這裡記程式怎麼做的。

**物理**（`shared/`，純函式，瀏覽器、Worker、壓測共用）

- `terrain.ts` **甩尾起跳**：`settleTerrain` 起跳時，如果是經典手感（狀態有 `steerNow`）、正在甩尾、甩尾鍵按著、車尾甩出 ≥ `driftJumpSlip`，就不清掉甩尾而是記在 `airDrift`（方向）與 `airHeld`（已經甩了幾秒）。`stepAir`：甩尾鍵按著時車頭用 `airDriftTurnRate` 轉、夾在滑行方向到 `driftMaxSlip` 之間、連段視窗不倒數；放開就把 `airDrift` 歸零。落地：`airDrift` 還在就直接回到甩尾狀態（`drifting`、`driftSeconds = airHeld`、`driftPeak`），補 `driftJumpGauge` 加速條（滿了照 `classic.ts` 的規則變成存量），`driftJumps`＋1。`KartState` 多三個選填欄位 `airDrift`、`airHeld`、`driftJumps`：沒有在甩尾中起跳過的車永遠沒有它們，街機（舊）手感永遠不會設。`stepOnTerrain` 把 `driftJumps` 帶過地面那一步（`stepClassic` 回傳的是新物件）。`settleTerrain` 多一個參數 `maxStoredBoosts`（`course.ts` 傳 tuning 的）。
- `walls.ts`：`Wall.top?`。`collideWalls` 開頭算一次車的高度（在空中才算，否則 −∞），`top` 有值且高度 ≥ `top` 的牆跳過。`track.ts` 的 `parseTrack` 檢查 `top` 是數字。路緣牆沒有 `top`，照舊誰都飛不過。
- 多人：車的物理本來就在各自的瀏覽器跑，frame 只送位置、朝向、速度與旗標，這三個新欄位不上線；`PROTOCOL_VERSION` 沒動。別人看你的高度用 `heightGuess`（從地面位置與速度推），甩尾起跳的飛行也是同一條拋物線。
- **車款參數的介面**（另一個分支 `feat/kart-vehicle-roster` 在做車種）：甩尾起跳的數字（`driftJumpSlip`、`airDriftTurnRate`、`driftJumpGauge`、`airTurnRate`）在 `TERRAIN_TUNING`，`stepOnTerrain`／`settleTerrain` 都收 `numbers: TerrainTuning` 參數（預設 `TERRAIN_TUNING`）。之後要讓某種車空中比較靈活，在 `course.ts` 的 `stepRun` 依車款傳一份不同的 `numbers` 就好，不用動 `terrain.ts`。這一批沒有動 `karts.ts`。

**導引**（`shared/kart/tracks/guide.ts`，新）

- `TrackGuide`：`safe`／`tech` 兩條線（每個路點一個「中心線右邊幾公尺」）、各自的 `safeRoom`／`techRoom`（線兩側可以晃的寬度）、`slots`（技術線上的缺口：路點＋橫向位置）、`cues`（`DriftJumpCue`：哪個跳台、往哪邊甩、落點、方向打多深、落地時車尾要多開、起跳最快多少）。`guides.ts` 用賽道 id 查（`trackGuide(id)`）；沒有導引的賽道回 `undefined`，一切照舊。導引沒有放進 `TrackJson`：它是給駕駛腳本與電腦車用的，不是賽道格式的一部分，編輯器做的賽道沒有。
- 給賽道作者的工具：`acrossRoad(road, 路點（可帶小數）, 公尺)`、`fence(road, 路徑, 高度?)`、`island(road, 起, 迄, 內, 外, 高度?)`（把 `circuit.ts` 的島牆做成可重複用的）、`guideFor(road)` 回一個 builder：`.safe`／`.tech`／`.both` 上有 `hold(起, 迄, 橫向, room)` 與 `chord(起點, 終點, room)`（**世界座標上的直線**換算成每個路點的橫向位置，穿縫的線就是這樣畫的），`.slot()`、`.cue()`、`.build()`（安全線的階梯會平滑三次，技術線不平滑）。

**電腦車與駕駛**（`src/kart/bots/`）

- `createBotBrain` 多第七個參數 `guide`。有導引時：路線＝導引的線＋自己的晃動與切彎（夾在 room 內），不再用 `walls` 猜島牆的車道。`skill.tricks`（新，只有頂尖駕駛有）走技術線，其他人（三種難度的電腦車、新手、一般、高手）走安全線。
- **缺口**：離缺口 85 m 內「排隊」（不開新的甩尾、正在甩的放掉）；70 m 內方向盤直接瞄準缺口中心再往後 10 m；20 m 內不再修（來不及了，硬修只會打橫）。
- **甩尾起跳**：每一步從「車現在的滑行方向、到跳台線還有幾秒」算「現在開始甩，到跳台時滑行方向會轉多少」（`driftTurn`：照 `classic.ts` 的 slip 與 `driftLoose` 積分），和「從起跳點到落點要轉多少」比，剛好夠就開始甩。所以不管從哪裡、多快進來，起跳方向都對（第一版用固定秒數，進彎位置差 5 m 就飛到牆上）。到跳台線的距離是對那條線投影算的，不是用路點（6 m 一格太粗）。空中把車尾甩到 `nose`。超過 `most` 就收油。
- **退回安全線**：復位之後、或到了要甩尾起跳的跳台但速度不到極速 70%（剛撞過牆），接下來走安全線，直到兩條線重合的地方才換回來（否則會隔著牆想切過去）。
- **坡頂收油**（所有人，沒有導引的舊賽道也是）：建腦時對每個跳台算「路在跳台後多遠轉了 0.3 rad」與「以速度 v 起跳會飛多遠」（`flightOver`：沿路點走拋物線，路往下掉就飛得更遠），二分找出來得及落地的最快起跳速度；快到跳台時超過就鬆油門、超過 3 m/s 就煞車。有 cue 的頂尖駕駛不收（它用甩尾起跳）。
- `drivers.ts` 多 `master`（`DRIVER_IDS` 四個）：高手的手＋`tricks`。`/kart/spike?autopilot=master` 可以看。

**賽道**（`shared/kart/tracks/wharf.ts`、`lanes.ts`，`lay.ts` 的寫法）

- 捷徑都是「寬路裡的車道」：62 m 寬的直角彎區（貨櫃列、院子）裡，每個彎的內側伸出一道牆，牆上留 10 m 缺口，三個缺口在同一條直線上；84 m 寬、半徑 60 m 的大迴轉（倉庫、碼頭、水井）中間圍島牆，內側車道的入口用牆（留一個缺口）或矮欄（只能飛）封住。中心線永遠在安全車道裡，所以房間的 `?autopilot`、名次、逆走判定都不用改。
- 兩張都有 `theme`（`day`／`sunset`），`revision` 1。加速帶：`circuit()` 給的兩條＋近路上的（`padsAlong` 用技術線的橫向位置擺，所以一定在車道中間）。
- 選單、多人房選項、對戰電腦、小地圖（牆本來就會畫）跟著 `RACE_TRACK_IDS` 來；`spikeLoop.ts`、字串 `kart.course.<id>`／`games.kart.track.<id>`、盃 `backstreet`（`cups.ts`、`kart.cup.name.backstreet`）。

**畫面**（`src/kart/art/trackArt.ts`）：有 `top` 的牆照高度畫。4 m 以下是矮欄（黃色，`kartScene.fence`）；以上是高牆，最多畫 7 m、厚 1.4 m：碼頭是貨櫃色（`container`），其他是紅磚貼圖（`yardWall`）。底部貼著地形（`groundAt`）。沒有新的模型或圖檔。`callouts.ts`／`Hud.tsx` 多 `driftJump`。

**量測**：`scripts/kart-feel.ts` 表格多頂尖一列與「master vs expert」一行（有導引的賽道才有）；`scripts/kart/track-lines.ts`（新，設計工具：四位駕駛在一張圖上幾個種子的秒數、復位、甩尾起跳次數、撞牆的路點）、`track-shots-at.mjs`（新：指定駕駛開到一串座標時各截一張）、`track-svg.ts` 多畫導引的兩條線（綠＝安全、紅＝技術）與矮欄（橘）。數字在 `KART-FEEL.md` §11.3。

**測試**：`tests/kart/skillTracks.test.ts`（新）：甩尾起跳（直飛照舊有落地加速；先甩的帶上空中、斜著飛、落地在甩尾裡、補加速條、瞬間加速已賺到、callout；落地 0.3 秒後轉過的角度比直飛的大；空中放開就放棄；車尾沒出去不算；街機手感不變）、牆的 `top`（夠高飛過、太慢撞上、沒有 `top` 或太高照撞、只算空中的車、格式檢查）、導引的工具、兩張圖各自（兩條線都在路上且安全線離每道牆 ≥ 4.2 m、缺口兩側剛好各有一個牆端、cue 的跳台存在且落點在路上、矮欄 1.5 m 其餘 ≥ 7 m、近路上至少三條別人碰不到的加速帶、**頂尖比高手快**（碼頭 > 9%、山城 > 6.5%，三個種子平均）、新手跑得完、頂尖三圈每次甩尾起跳都落地且每個缺口都穿過、三種難度電腦車零甩尾起跳零穿縫）、大屯高手撞牆 ≤ 20、沒有導引的賽道上頂尖＝高手。`technical.test.ts` 的整組檢查跑十一張（新兩張直線比例上限 36%、40%：穿縫的路就是直線）。`cup.test.tsx`、`cornerSigns.test.ts`、`bots.test.ts` 加新圖新盃。e2e `kart-skill-tracks.spec.ts`：兩張各自從選單開成計時賽、牆畫在小地圖上；對戰電腦與巷弄盃列出它們；`?autopilot=master` 在碼頭落地一次甩尾起跳；規則頁有「進階技巧」。

**限制（照實寫）**：(1) 山城的頂尖 vs 熟練是 8.0%，在目標下緣。(2) 捷徑是「寬路裡的車道」，不是真的離開路面的岔路：要做穿過建築物的獨立小路得改賽道格式（路緣開口、第二條中心線、檢查點），這一批沒有做。(3) 高牆是素色的箱子（貨櫃色／磚牆），還沒有個別的場景（`localArt.ts` 那種地標）。(4) 困難電腦車不會這些技巧、走遠路：會甩尾起跳與穿縫的人在這兩張圖上會穩贏困難電腦車 8–11%。要不要給困難電腦車 `tricks` 等擁有者開過再決定。(5) 甩尾起跳的時機對人來說多寬鬆還沒有人試過；腳本是算出來的，人是用感覺。(6) 貼牆滑行、落地瞬間按鍵的時機噴沒有做。(7) 卡丁車 chunk 361 → 369 kB gzip（預算 600 kB）。

### 4.39 路線圖外：車系、17 台車、懸浮摩托車、選車頁籤與 3D 預覽（2026-11-19，`feat/kart-vehicle-roster`）

擁有者：「車種要多一些，以前跑跑都有什麼舒適，尖峰，等離子有的沒的，還有摩托車，你再多變通一下。」6 台 → **17 台（14 台卡丁車＋3 台摩托車）**，有自己的車系／等級／車型體系。原作的車名、車系、造型、數值表都沒用（`IP-CHECKLIST.md`）；車款表、暫名、造型與變身在 `KART-WORLD.md` §4.3，公平性的數字在 `KART-FEEL.md` §12，協定在 `KART-NETCODE.md` §12。解鎖（`e10-t06`）仍等 F2，全部開放。

**資料（`shared/kart/karts.ts`）**

- `KartSpec` 多三個欄位：`kind`（`kart`／`bike`）、`series`（`allround`／`sprint`／`speed`／`drift`／`heavy`）、可選的 `traits`。`KART_IDS` 前 6 個照舊（位置、等級、點數都沒動，測試擋），後面接 8 台卡丁車、3 台摩托車。
- **依車種調整參數的介面：`KartTraits`**＝「`KART_TUNING` 任一個 key → 倍率」。`applyKart(base, id)` 先套四項點數（照舊），再乘車型的倍率（`KIND_TRAITS[kind].traits`），再乘這台車自己的（`spec.traits`，目前沒有車用）。**物理完全不知道車種**：`classic.ts`、`physics.ts` 只讀傳進來的 `KartTuning`。之後誰加新技術（跳台前甩、新的噴射），照常把數字放進 `KART_TUNING`、從 `t` 讀；要讓摩托車或某台車不一樣，只在 `KIND_TRAITS` 或那台車的 `traits` 加一行，技術的程式不用碰（`karts.ts` 檔頭寫了這段給平行開發的人）。倍率只作用在存在的 key，`tide` 套完仍等於 `KART_TUNING`（測試擋）。
- **碰撞圓**：`KIND_TRAITS[kind].radius`（卡丁車 1.2 m＝`walls.ts` 的 `KART_RADIUS`，測試把兩個數字綁在一起；摩托車 0.85 m）。`applyKart` 在不是 1.2 時多放一個 `bodyRadius` 到回傳的 tuning；`KartTuning` 型別多一個**可選**的 `bodyRadius`（不在 `KART_TUNING`、不在調校面板、不會存進預設）。`collideWalls` 讀 `tuning.bodyRadius ?? KART_RADIUS`（最多 `KART_RADIUS`：分段檢查的步長是照它算的）。所以所有走 `stepRun`／`stepTrial` 的地方（計時賽、對戰電腦、多人、壓測機器人、`kart:feel`）自動用對的半徑，沒有改任何呼叫端的簽名。
- **車撞車**：`bumpKart(kart, others, mass, radius)`，`others` 的每一台可帶 `radius`；兩台的接觸距離＝兩個半徑相加。`kartMass(id)`＝重量點數 × 車型質量（摩托車 0.8）。`netRace.ts`、`botRace.ts`、`spikeLoop.ts` 從 frame 的車 byte 查 `kartMass`／`kartRadius`（`botRace` 以前把真人當質量 1，現在也查表）。
- **線上的車 byte**：5 bit 車＋3 bit 角色，舊 byte 解出來不變（`KART-NETCODE.md` §12）。PR 預覽站 `npm run kart:loadtest -- --bots 6 --karts petrel,swift,hornet,whale,shrimp,tide`（新指令列選項；海燕是第 17 台，用到新的那一位元）：老街道具賽三圈，17,208 個 frame 被拒 0、圈數與房間一致、六台都完賽、轉送延遲 p50／p95 40／59 ms。`speedCapFor` 沒改：它本來就走 `applyKart`，摩托車的倍率不動極速與噴射上限，所以上限只跟極速點數走。
- 道具命中（`shots.ts`）仍用 `KART_RADIUS`：摩托車不會比較難被打中。

**摩托車的手感**是 `KIND_TRAITS.bike` 那十幾個倍率（表在 `KART-WORLD.md` §4.3）：窄、輕、方向跟手快、甩尾來得快收得快但淺、側滑與撞牆更痛、**不甩尾硬拐掉速很多**（`gripScrub` ×1.6）、出彎加成多一點。沒有分叉出第二套物理，也沒有新的狀態欄位。

**畫面**

- `src/kart/art/vehicleBodies.ts`（新）：車身的總表；`kartBodies.ts` 匯出原本六台（`FIRST_BODIES`）與共用零件（`cockpit`、`rearWing`、`skirt`、`thruster`、`coreHatch`、`slit`），`moreBodies.ts`（八台）、`bikeBodies.ts`（三台）各自一個檔。每台都有自己的 N2O 變身（`kit.morph`）。
- `BodyFit` 多一個可選的 `bike: { bar, crouch }`。`kartModel.ts` 看到它就：車手用 `buildDriver(kit, id, true)`（跨坐：大腿往前下夾油箱、小腿往後踩腳踏）、上身前趴 `crouch`、頭抬回來、把手換成低的分離把；**傾車**：抓地轉向時車身 roll 到 `BIKE_LEAN`（0.52 rad，約 30°，乘速度），甩尾 0.5–0.62 rad，而且繞著地面那條線傾（`chassis.position.x/y` 跟著補），所以懸浮墊留在路面上、車手的頭往彎內去；車底光暈與頭燈光斑變窄。別人的摩托車、電腦車、重播用同一個模型與同樣的 `KartLook`，所以也會傾。
- 摩托車只有一個後接觸點（`rearContacts` 一筆）：胎痕、火花、煙都是一道；`effects.ts` 本來就照筆數做，沒改。
- 11 個新的抽象標誌（`MARKS`）與 11 組顏色（`kartTokens.ts` 的 `kartBodies`）。

**選車畫面（`src/kart/roster/`）**

- `RosterPicker.tsx`：卡片上方一排頁籤（`role="tablist"`）：全部、摩托車、五個車系、三個等級，單選、預設「全部」；卡片第二行寫性格與等級（摩托車寫「摩托車」與等級）；選中的車有名稱、標籤（車型、車系、性格、等級，摩托車多三個）、一句話、數值條；選摩托車時多一段說明。仍然不 import three.js（等待室先畫得出來）。換頁籤不會改選中的車。
- `KartPreview.tsx`＋`previewStage.ts`（新）：3D 預覽。自己的一個小 WebGL 場景（透明底、一顆半球光一顆太陽、深色圓盤、環境貼圖），畫**比賽用的同一個模型**；自己慢慢轉（`prefers-reduced-motion` 時不轉）、拖曳或方向鍵轉、「N2O 變身」開關（`boosting`＋`boostKind: 'n2o'`，模型自己開合）。沒有後處理、沒有陰影。canvas 由 stage 自己建立與移除（React StrictMode 會重掛一次，重掛拿到新的 canvas；卸載時 `forceContextLoss`）。**沒有 WebGL 時整塊不畫**（jsdom、被擋的 GPU），選車照常。預覽 `position: sticky`，卡片在它下面捲，選了馬上看得到；螢幕高度 < 500 px（橫拿手機）不黏。
- `/kart` 的 `GaragePanel` 直接用（three 已載入）；等待室的 `RoomGarage` 用 `lazy` 載（three 不進等待室的首屏；反正接下來的比賽要載同一包）。

**電腦車**：`drawBots`、`RoomBots` 本來就從 `KART_IDS` 抽，所以會抽到新車與摩托車；`botBrain` 用那台車的 tuning 開。

**量到的**（`npm run kart:feel -- --karts`：同一位駕駛腳本、九張賽道、每台車、五個種子平均；完整表在 `KART-FEEL.md` §12）

| | 高手腳本（五個種子） | 新手腳本（三個種子） |
| --- | --- | --- |
| 原本六台卡丁車（數值沒動） | 91.0（白鷺）–94.8（招潮蟹）秒 | 154.4–159.1 秒 |
| 新的八台卡丁車 | 91.9（蝦蛄）–94.9（寄居蟹）秒 | 153.6（蝦蛄）–161.4（彈塗魚）秒 |
| 三台摩托車 | 93.9（雨燕）、94.3（海燕）、94.6（虎頭蜂）秒 | 154.8、153.8、153.6 秒 |
| 最快與最慢的平均差 | 3.9 秒（4.3%） | 7.8 秒（5.2%） |
| 單一賽道第一最多的車 | 白鷺 3／9 張 | 蝦蛄 3／9 張 |

摩托車調了三輪（`KART-FEEL.md` §12.3）：第一版海燕九張贏五張；第二版把代價放在噴射上（N2O 短、集氣少），結果新手腳本騎三台摩托車是全場最快的三台（新手幾乎不噴，代價只有高手付）；定案把代價改成 `gripScrub` ×1.6（不甩尾硬拐掉速），兩位腳本的摩托車都落在卡丁車的範圍裡。

上面的數字是合併 #109（§4.38）之前量的（九張賽道）；合併後車款數值沒變，完整 vitest（195 檔 3,857 個）與卡丁車 e2e 重跑過。

**測試**：`tests/kart/karts.test.ts`（17 台、舊六台的位置／等級／點數／手感不變、每車系至少兩台且等級不重複、每車系在自己那一項是正的、點數總和 0、極速 ±5% 且彼此 3% 內、摩托車的倍率在範圍內且不動極速與噴射上限、所有車都在調校面板允許的範圍內；車 byte 來回、每種組合一個 byte、容量、舊 byte 逐一相容、舊頁面讀新 byte 不會讀到空的；每台車的速度上限；摩托車：半徑與質量、有得有失、倍率只動被點名的 key、牆邊 1 m 卡丁車被推開而摩托車不碰、車撞車的接觸距離與被推開的比例）、`tests/kart/vehicles.test.ts`（同一位高手換車：兩張短賽道，摩托車與標準車差 5% 內、沒有一台兩張都明顯最快）、`tests/kart/roster.test.tsx`（17 張卡、頁籤篩選、標籤、摩托車說明、每台車雙語都有名字與介紹）、`e2e/kart-spike.spec.ts`（車庫：頁籤、3D 預覽的 canvas 與變身開關、選摩托車後關車庫開跑、沒有 console error；下拉選單 17 台）。

**預算**：卡丁車 chunk 364 → **376 kB**／600（gzip；和 #109 合併之後一起是 381 kB）；多人房第一個畫面 140.0／150 kB（多的是車名與選車字串）。

**限制**

1. 名稱（車系與 11 台車）都是暫名，等擁有者拍板。
2. **公平性是用駕駛腳本量的，不是人**（`KART-FEEL.md` §12.4 照實寫了腳本的偏差：它對「操控」點數的反應和人相反）。摩托車窄車身的好處，腳本只吃到「少擦牆」，不會刻意鑽縫；人可能吃到更多，所以定案的摩托車在高手腳本手上刻意偏慢。要擁有者實際開過再調 `KIND_TRAITS`。
3. 既有六台之間本來就有差距（同一個量法 3–4 秒／場），這一批沒有動它們的數值（紀錄與幽靈車依車款存）。
4. 每台車各存一份幽靈車：17 台 × 9 張賽道全部開過約 4.6 MB，接近 localStorage 上限；存不進去時不會壞（`storage.ts` 不丟例外），只是那筆紀錄關頁面就沒了。真的遇到再做「只留最近用的幾台」。**2026-11-20 已解決**：幽靈車改存 IndexedDB，紀錄留 localStorage（§4.40）。
5. 還開著的舊頁面會把第 17 台車（海燕）畫成別台，重新整理就好（`KART-NETCODE.md` §12）。
6. 摩托車沒有專屬的引擎聲、沒有後輪滑胎之類的專屬特效；道具命中判定仍用卡丁車的圓。
7. 沒有「道具型」車系：重裝型（礁岩系）在車陣與道具賽最吃香，但沒有改道具機率或效果的車款參數；要做的話在 `KartTraits` 之外另加（道具邏輯在伺服器，不讀 tuning）。
8. 3D 預覽在等待室會一直以 60 fps 畫（分頁在背景時瀏覽器自己停）；低階手機若嫌重，之後可改成捲出畫面就停。

### 4.40 路線圖外：第四級電腦車「專家」、幽靈車改存 IndexedDB（2026-11-20，`feat/kart-expert-bots`）

#105、#109 都回報「困難電腦車沒學新打法、走遠路，會的人在新圖上穩贏它 8–11%」，要不要教困難級等擁有者開過再定。所以**不改三級**（`BOT_SKILLS.easy/normal/hard` 的數值與行為一個都沒動，三級既有的測試照舊），另加第四級 **專家**（`expert`，暫名 Expert／專家）。

**專家（`src/kart/bots/expert.ts`）**

- 就是 `kart:feel` 的「頂尖」腳本（`drivers.ts` 的 `master`）拿掉人的手（不抖、不恍神），甩尾門檻稍改（見下）：完美時機瞬間加速、連段、能噴就噴（`boostAt` 0.6）、只對夠大的彎甩並且甩滿（`cornerTurn`／`holdSeconds`）、雙噴、直線點甩、疊噴、必拿起跑加速；`tricks`＋`shortcuts`：有導引（`shared/kart/tracks/guide.ts`）的賽道走技術線，甩尾起跳、坡頂收油、飛越矮欄、穿縫；沒有導引的賽道（含自訂賽道）就是「高手」腳本的開法。
- **不作弊**：同一套物理、同一台車的數字，`topSpeedShare` 1（只到自己這台車的極速，噴射照常超過，和玩家一樣）。
- **rubber band 照舊**：`brain.ts` 唯一的改動是 `flatOut`（油門踩到底）只在 rubber band 給的比例是 1 時生效；領先玩家時照 `bandedShare` 鬆油門。腳本永遠傳 1，所以三級與駕駛腳本的行為不變（`tests/kart/bots.test.ts` 量了專家在領先時確實變慢）。
- **出現的地方**：`shared/games/kart/bots.ts` 的 `BOT_LEVELS` 加 `'expert'`，一處改全部跟著：單機對戰電腦、大獎賽、團隊賽隊友（這三個都讀 `DIFFICULTIES`）、多人房加電腦車（`RoomBots.tsx` 讀 `BOT_LEVELS`；伺服器 `room-host.ts` 用 `rules.ts` 的 `bots.levels` 驗，房主代跑時 `roomBots.ts` 的 `isDifficulty` 認得它）。字串 `kart.bots.difficulty.expert`、`games.kart.bot.level.expert`。
- 獨立模組：`feat/kart-branch-routes` 可能改 `brain.ts` 的路線選擇；專家只是一組 `BotSkill`，不碰路線程式。

**量到的（三個種子平均每圈秒數，單人三圈）**：見 `KART-FEEL.md` §13。每張圖專家 < 困難 < 普通 < 簡單；碼頭、山城和頂尖腳本差 0.1%、1.1%。和頂尖腳本只差兩個習慣：`cornerTurn` 0.7（頂尖 0.5）、`driftAt` 0.95（頂尖 0.9），十一張加總一樣快、撞牆從 110 降到 78 次（困難 95）。

**幽靈車改存 IndexedDB（`src/kart/ghostStore.ts`、`records.ts`）**

- #108 量到 17 台 × 9 張全開過幽靈車約 4.6 MB，接近 localStorage 上限，存不進去時那筆紀錄關頁就沒了。現在：
  - **紀錄**留在 localStorage，每筆幾十 bytes：`bestRun.<track>`（`{"total":步數,"kart":車}`）、`kartBestRun.<kart>.<track>`（步數）、`bestLap.*`／`kartBestLap.*`（不變）。紀錄**一定存得下**，和幽靈車存不存得下無關。
  - **幽靈車軌跡**存 IndexedDB `tku-arcade-kart` → store `ghosts`（key `overall|<track>` 或 `kart|<kart>|<track>`，帶 `savedAt` 索引）。`keepIfBetter` 仍是同步的（馬上回報破紀錄），軌跡在背景寫；`loadGhost`／`loadKartGhost` 變成 async，`spikeLoop.ts` 先用紀錄顯示 HUD，幽靈車讀到再出現（期間若已破紀錄就不覆蓋）。
  - 只比賽「紀錄自己那一圈」的幽靈：存幽靈失敗時，舊的、比紀錄慢的幽靈不會冒充。
- **遷移**：第一次要讀幽靈時，把 localStorage 的 `ghost.<track>`、`kartGhost.<kart>.<track>` 搬進 IndexedDB（同時補上對應的紀錄鍵），**每筆搬成功才刪**；壞掉的那筆直接刪；搬失敗的留著下次再搬。一頁只跑一次。
- **沒有 IndexedDB**（部分私密視窗、封鎖網站資料、開不起來）：不存新幽靈，紀錄照存；舊的 localStorage 幽靈留在原地照樣能比，被新紀錄取代時才刪。所有 IndexedDB 呼叫都在 try/catch 裡。
- **容量**：每張圖保留總最佳＋每台車最佳；上限 `MAX_GHOSTS` 320 筆（17 台＋總最佳 × 11 張 = 198，留給自訂賽道）；超過時、或瀏覽器丟 `QuotaExceededError`（先清最舊的 25% 再試一次），**先清最舊的各車幽靈，最後才清賽道總最佳**；被清掉的只有軌跡，紀錄還在。
- 大獎賽進度、調參、幽靈選擇（`ghostPick`）等其他 localStorage 都沒動。
- 測試：`tests/kart/ghost.test.ts` 用 `fake-indexeddb`（新 devDependency）跑真的 IndexedDB 實作，另有記憶體版 `memoryGhostStore(capacity)` 模擬滿了；`e2e/kart-spike.spec.ts` 在瀏覽器裡確認舊幽靈搬走、紀錄鍵補上。

**限制**

1. 困難級要不要學新技巧，仍待擁有者（NEXT §2.1）。專家十一張加總撞牆比困難少，但砲台、河畔、大屯比困難多（`KART-FEEL.md` §13.2）；沒有卡死或逆走。
2. 專家在沒有導引的賽道（含自訂賽道）不會走技術捷徑，因為不知道捷徑在哪。
3. 幽靈車一頁搬一次；搬家期間（第一次讀，通常 < 1 秒）HUD 已有紀錄，幽靈晚一點出現。

### 4.41 路線圖外：真岔路（賽道格式的分支路段）、高架廠區、碼頭倉庫的倉庫巷、老街 70%（2026-11-20，`feat/kart-branch-routes`）

擁有者（2026-11-19）：「我覺得太容易變成高手了……之前像城鎮手指，有捷徑但是要技術好才過得去這種，我覺得我們的地圖要展現出這種風格出來。」#109 做了技術，但回報「捷徑是寬路裡用牆隔出來的車道，不是離開路面的獨立岔路；那要改賽道格式」。這一批改了格式。手感、操作與數字在 `KART-FEEL.md` §14；這裡記程式怎麼做的。只學「捷徑要技術才過得去」這個風格，沒有對照或重現任何現成地圖（`IP-CHECKLIST.md`）。

**格式**（`shared/kart/branches.ts`，新；`track.ts`）

- `TrackJson.branches?`：每條 `{ from, to, road, jumps? }`。`from`／`to` 是主線的路點（`0 ≤ from`、`to ≥ from + 2`、`to` 不繞過終點），`road` 是兩點之間分支自己的中心線（每點有 `x`、`z`、`width`、選填 `y`），`jumps` 是分支自己的跳台（`road` 的索引）。沒有 `branches` 的賽道：`parseTrack` 走的路一行都沒變，產出的物件一個欄位都沒多（`branchGolden.test.ts` 釘住九張舊圖與三條編輯器代碼在 `fb5f7e1` 的雜湊）。
- `parseBranches`（`parseTrack` 在主線、閘門、牆都檢查完之後才叫）：每條的路點照主線的規則檢查；最多 6 條、每條 400 點、主線加分支共 2000 點；相鄰點 ≥ 0.5 m、坡度 ≤ 0.4（跳台除外；從主線跳台出發的那一段也除外：跟著跳台背面掉下去）；**不自交**（非相鄰線段不相交）、**不穿過主線中心線**（兩端除外）；**兩端重疊、中間要完全離開主路一次**（「開了又回來」不行）；**範圍不重疊**（一條接回之後下一條才能出發）、兩條的路面不相碰；**終點線不能在分支繞過的範圍裡**。全部問題一次列出（`branches[i]: …`）。
- 解析後 `Track.forks?: Fork[]`：完整中心線 `path`（主線 `from` 點＋分支點＋主線 `to` 點，兩端寬度取分支自己的）、`jumps`（`path` 索引）、它繞過的主線閘門 `first`／`count`、以及**替身閘門** `gates`／`respawns`（下面）。`TrackJson.branches` 被正規化成檢查過的版本。
- **路緣**：`forkKerbs`：主線兩側路緣、每條分支兩側路緣（開放的線，`openKerbs`），凡是落在另一條路面裡的部分切掉（`clipWall`：只有和別條路面的外框相交的牆才切成 0.25 m 小段判斷，連續保留的段再接回一條；沒碰到的牆原物件保留）。結果：岔路口開著，分支在主路裡的那段路緣不存在，兩條路的路緣在 V 字尖端交會（縫 < 0.35 m，車過不去）。`Track.allWalls` 就是這組加 `walls`。
- **路面判定**：`roadDepth(points, closed, x, z)`＝最近線段的半寬（內插）減距離（正＝在路上幾公尺）。`placeOnTrack`／`forkAt`：點在哪條路上（取最深的那條）。`scenery.ts` 的 `roadClearance` 透過 `rememberForks`（`parseTrack` 用主線陣列當 key 記下分支）把分支也當路，所以樹、房子、看板、場景不會長在分支上，所有呼叫端不用改簽名。

**閘門、復位與伺服器裁定**（`course.ts`、`race.ts`、`items.ts`）

- 分支繞過的主線閘門（中點落在 `(from, to)` 開區間、連號、不含 0 號），每一個在分支「離開主路的那一段」上平均放一個替身（`gateAcross`＋朝分支前進方向的復位點），離分支上的牆（例如縫的牆）至少 4 m。檢查：**每個替身離主路 ≥ 0.5 m、每個主線閘門離每條分支 ≥ 0.5 m**——所以沒有人能「繞過閘門的端點」漏判，也不會在岔路口同時碰到兩條線。給作者用的 `gatesClearOf` 把碰到分支的主線閘門沿路挪到最近的清楚位置（找不到才拿掉），編輯器的繞道也用它。
- `Course.checkpoints.lines?`：每個閘門的所有線（主線自己、分支替身，`route` 0＝主線、k+1＝第 k 條分支）。`passGates` 有 `lines` 時走 `passLines`：**下一個閘門的任一條線**往前越過就算過、安全點是那條線的復位點；倒著越過上一個閘門的任一條線就退回，安全點取「上一個閘門在同一條路上的線」的復位點（沒有就主線）。沒有 `lines` 的賽道照舊。
- `judgeFrame`（伺服器）用同一個 `passGates`，所以**走分支一樣逐門計數，不會被判逆走或漏門**；另外三處改成認得替身：復位落點可以是替身的復位點；客戶端追上的那一門，只要靠近該門的任一條線就採信、安全點取最近的那條線；換位道具（交換位置）的安全點取最近的線（`respawnNear`、`safeBehind`）。協定、frame 格式、`PROTOCOL_VERSION` 都沒動（分支是賽道資料，兩邊從同一份 JSON 算出同樣的替身）。
- `raceProgress`（名次）：有 `lines` 時取「上一門任一條線 → 下一門任一條線」比例最大的那個，名次在岔開與匯合的地方不會倒退。
- `timeTrial.ts`：`TrialCourse` 從 `courseOf` 帶 `branches`（每條的中心線），`goingBackwards` 用車所在那條路的方向判逆走。

**地形**（`terrain.ts`）：`Terrain` 多 `forks`（每條分支帶高度與半寬的中心線）與 `halves`；有分支時 `groundAt` 取車**最深在哪條路上**的那條路的高度（兩條路並排時最近中心線不一定是自己這條），沒有分支照舊。分支的跳台照樣變成 `Lip`（多一個 `fork`），`hillArt.ts` 的地面高度場與跳台斜面都認得。

**路線與電腦車**（`src/kart/bots/routes.ts`，新；`brain.ts` 沒動）

- `routeRoad(track, taken)`：主線接上選定的分支，變成一條封閉中心線（附 `from`：每點來自主線還是哪條分支、`main`：主線路點對應到路線的哪一點）。
- `createTrackBrain(skill, track, tuning, seed)`：沒有分支＝`createBotBrain(...)` 原樣（逐步相同，測試擋）。有分支：兩顆腦，一顆開主線（主線導引 `trackGuide`），一顆開「每條分支都走」的路線（路線導引 `routeGuide`，`guides.ts` 新的表）。**每一步兩顆都算**（讓接手的那顆看到的是真實車況），選一個輸出：車在分支上（`forkAt`）→ 路線腦；在分支前 16 個路點內且 `skill.tricks` 且這條沒失敗過 → 路線腦；否則主線腦。接近或在分支上被復位＝這條「失敗」，直到過了它才再試（甩尾起跳不夠的車不會一直撞欄）。簡單／普通／困難沒有 `tricks`，永遠走主線；**專家**（#111）有，每條分支都走（`skillTracks.test.ts` 釘住：兩個種子三圈、每圈每條、零逆走零復位）。`botRace.ts`、`drivers.ts`（`kart:feel`、`?autopilot=`）都改用它。

**畫面**：`forkArt.ts`（新）畫每條分支的柏油與路緣漆（開放的帶子，比主路高一點並用 polygon offset，重疊處不閃）；有分支的賽道主線的護欄改成照 `allWalls` 的路緣逐段畫（一個 mesh），岔路口真的開著。`cornerSigns.ts` 的 `branchCornerSigns` 在分支自己的彎外側立箭頭板。小地圖多畫分支（`Minimap` 的 `forks`），下一個閘門的替身也標出來。觀戰、重播用同一份賽道，自動有。

**編輯器的繞道**（`shared/kart/editor/`）：`TrackSpec.bypasses?`：`{ from, to, side, offset, width }`＝從第 `from` 段開頭到第 `to` 段結尾，主路往一側平移 `offset`（頭尾各 70 m 緩和），寬 `width`。代碼多一個欄位 `b`（沒有繞道的代碼一個位元組都沒變，所以舊代碼的 id、紀錄、幽靈車照舊；`specHash` 有繞道時才把它算進去）。`decodeSpec` 檢查：最多 3 條、整數段、`to` 不是最後一段、偏移 20–90 m、寬 10–30 m。`buildSpec` 鋪出分支、用 `gatesClearOf` 放閘門，再整條丟進 `parseTrack`：分支的問題（太近、交叉、跨到別段）變成 `bypass` 問題、標出那幾段。伺服器（`custom.ts` → `parseTrack`）用的是同一套檢查。編輯器的段落面板多「岔路」一區（加、接回段、哪邊、距離、寬、拿掉），地圖畫出繞道。

**賽道**

- **高架廠區** `works`（新，`shared/kart/tracks/works.ts`）：三條岔路，見 `KART-FEEL.md` §14。`worksArt.ts` 畫廠房、煙囪、北邊一條高架線（橋墩避開路面）、裝卸平台底下的橋墩；顏色在 `kartTokens.ts` 的 `worksScene`。巷弄盃加它（四張）。
- **碼頭倉庫** `wharf@2`：倉庫那條「寬路裡的後巷」改成真的岔路（倉庫髮夾的內側穿過去）；髮夾改成 40 m 寬、半徑 76 m，主路那段不再是 84 m 寬。其餘捷徑（裝卸坡、貨櫃列、碼頭坡）照舊。
- **老街** `oldstreet@9`：市場街中間一條加速帶（高手覆蓋率 68% → 73%）。

**測試**：`branches.test.ts`（新：格式與每種不合法的岔路、路緣切開後兩條路都不撞牆、替身閘門、`passGates` 兩條路都三圈逐門、分支上復位與倒退、伺服器裁定兩條路的圈時、復位與追門、名次不倒退、逆走、路線、`createTrackBrain` 在舊圖上逐步等於 `createBotBrain`、分支高度、編輯器繞道的代碼與檢查）、`branchGolden.test.ts`（新：舊圖與舊代碼不變）、`skillTracks.test.ts`（兩張有岔路的圖：頂尖每圈每條都走、三種難度兩個種子都不走且不逆走零復位；高架廠區三條各自的技術、頂尖比熟練快 ≥ 8%、新手跑得完）、`technical.test.ts`（十二張，岔路的路緣不摺、替身復位在路上離牆）、`feel.test.ts`（老街 ≥ 70%）。

**限制（照實寫）**：(1) 碼頭倉庫的頂尖 vs 熟練從 11% 掉到約 6–7%：真岔路比「寬路裡的後巷」窄、要轉的角度大，頂尖腳本在那裡沒有以前快；測試門檻相應放寬到 5.5%。(2) 分支不能從分支再分（巢狀）、不能立體交叉（高架只是比旁邊高，不會從主路上面跨過去）。(3) 編輯器的繞道只是「平移的平行路」，沒有跳台、牆或縫。(4) 頂尖腳本的路線是「每條都走」，沒有「這圈太慢就不走」的判斷；專家電腦車要走分支，得在那個分支加 `tricks`。

### 4.42 路線圖外：倒數時全員排在起跑格上、起跑加速放寬（2026-11-20，`feat/kart-grid-start`）

擁有者（2026-11-20）：「要像跑跑一樣倒數321時，全部車手一起排成一排，目前是只能看的到自己車子，起步噴射範圍要給寬一點，我常常按了但沒噴成功」。原因、新規則與數字在 `KART-FEEL.md` §15、線上的部分在 `KART-NETCODE.md` §19；這裡記程式怎麼做的。

**GO 前別人的車**（`src/kart/race/netRace.ts`）

- `onGrid(poses, view)`：房間在 `loading`／`countdown`、本機算的剩餘秒數還 > 0 時，把 `view.racers` 裡除了自己、還沒退賽的每一台放在 `gridSpot(track, slot)`（`slot`＝在 `racers` 裡的位置，房間的格位就是這個），速度 0、不 stale。車款與車手：最新 frame 的車 byte；沒有 frame 時 `RaceNetOptions.lookOf(seat)`，再沒有就用預設車。`others()`、名牌（`drawn`）、小地圖都用這份；GO 之後照舊用 `remotes.ts` 的插值。
- `lookOf`：`RaceView` 的新 prop。多人房（`KartScreen`）從成員的 `look`（`parseLook`）；對戰電腦／大獎賽（`BotRaceView`）從電腦車名單的 `kart`／`driver`。
- **倒數的 frame tick**：`send` 在倒數時用 `countdown()` 讀到的房間剩餘秒數（不是比賽那個「準備」時停在 3 的倒數），GO 還沒定就不送；`botRace.ts` 的 `sendFrame` 用房間的 `goAt` 同樣處理。tick 不再停住，別人的 `remotes.ts` 不會在「3」「2」把它標成 stale。

**倒數鏡頭**（`src/kart/director.ts`，新，純函式）

- `gridShot(spots)`：桿位的前進方向上，最後一格再往後 `GRID_SHOT_BACK` 11 m、高 `GRID_SHOT_UP` 6.5 m、橫向在整個格的中間；看向桿位前 6 m。所有格位都在鏡頭前方 ±25° 內（測試釘住）。
- `countdownBlend(left)`：剩餘秒數 ≥ `GLIDE_FROM` 2.1（或還沒定 GO）＝1，到 `GLIDE_TO` 1.05 平滑（smoothstep）降到 0；減少動態時剩 `CUT_AT` 1.6 秒一刀切。
- `KartScene.shot(shot | null)`（`Scene.ts`）：追車鏡頭照常算完，再把位置與注視點各自往 `shot.eye`／`shot.target` 內插 `blend`。調參用的 `view`（看車的角度）優先。
- `spikeLoop.ts`：有 `SpikeNet.gridSpots`（新，選填；`netRace` 給每個格位）而且在倒數時，每幀 `scene.shot(countdownShot(...))`；之後給一次 null。計時賽沒有 `net`，不變。

**起跑加速**（`shared/kart/timeTrial.ts`、`physics.ts`、`touch.ts`、`tuning.ts`）

- 經典手感 `startWindow` 0.5 → **1** 秒、`startLate` 0.1 → **0.25** 秒（面板上限 1 → 2 秒）。
- `TrialStart` 多 `'late'`：經典手感、還沒起跑加速、GO 後超過 `startLate` 但在 `START_LATE_TELL` 0.75 秒內第一次新按下 → `'late'`（沒有加速，只有提示）。
- 「新按下」＝油門按著、不是自動油門、而且（上一步沒按著，或這一步有 `throttleTap`）。
- `KartInput.autoThrottle`（新，選填，物理不讀）：`touchInput` 只有自動油門撐著時標記；`mergeInputs` 只有兩邊都只是自動油門（或沒按）時保留。
- `parseStoredTuning`：經典手感存的值剛好是舊預設（0.5／0.1）就換成新預設（`widenedStart`），其他自己改過的值照留。
- 提示（`callouts.ts`、`Hud.tsx`）：`quick` 的字改「太早」，新的 `startLate`「太晚」（紅）；倒數提示「數到 1 時按住前進：完美起跑」。

**測試**：`tests/kart/startWindow.test.ts`（新）、`tests/kart/gridStart.test.ts`（新）、`e2e/kart-bots.spec.ts`（倒數中就看得到電腦車）。

### 4.43 路線圖外：背圖賽道的地標場景與技術點提示、碼頭倉庫的倉庫巷重設計（2026-11-20，`feat/kart-skill-scenery`）

擁有者要「越來越逼真、越帥」、電競感（#104），以及要背地圖的技術賽道。#109 回報「高牆是素色箱子（貨櫃色／紅磚），沒有個別地標場景」，#113 回報碼頭倉庫的頂尖比熟練從 11% 掉到 6.6%。這一批只畫場景、只動碼頭倉庫一段路線；**碰撞幾何（牆、縫、矮欄的位置與高度）一點都沒改**，手感與數字在 `KART-FEEL.md` §16。

**牆照它是什麼來畫**（`src/kart/art/skillWalls.ts`，新）：`trackArt.ts` 的牆迴圈在 `skillStyleOf(track.id)` 是 `wharf`／`lanes`／`works` 時跳過有 `top` 的牆，改交給這裡。`wallRuns` 把每面牆換成畫的資料（兩端、長度、方向、地面、`top − 地面`；低於 4 m 是矮欄）；`findSlots` 從牆找縫：兩面高牆的**自由端**（不和別面牆共用的端點，所以島的轉角不算）相距 6–13 m、而且兩端都朝對方（同一直線）。不靠導引，所以高架廠區窄巷的縫（在分支上、導引沒有）也找得到；`skillArt.test.ts` 釘住碼頭倉庫與山城坡巷導引上的每一個縫都找得到、廠區一個。

- 碼頭倉庫：每面高牆是一排三層的貨櫃（`InstancedMesh`，一個 draw），長度均分成 6.1 m 左右的櫃、每櫃自己的顏色（`setColorAt`）、隔一個頭尾對調、頂層偶爾缺一個；貼圖是 canvas 畫的波浪鋼板、框、門縫、四根門把與鎖桿、一塊淺色代碼條（沒有字）。
- 山城坡巷：紅磚牆（磚貼圖每 3.5 m 一次）＋灰瓦壓頂與屋脊；每個縫（院門）兩側磚柱、上面一根橫樑與小小的瓦頂門樓（離地 7.4 m，車飛不到）。
- 高架廠區：離主路遠的高牆（窄巷）是紅磚＋混凝土壓頂，兩面都噴了原創的抽象塗鴉（canvas 畫的粗圓筆畫、描邊、星點與滴痕，**沒有字、沒有任何人的標誌**，一張貼圖四幅，透明處 `alphaTest`）；貼著主路緣的高牆（盲切）是廠房的浪板側牆、一條玻璃窗帶、屋簷與牆腳。
- 三張共用：矮欄是黃黑斜紋（canvas，每公尺一組）＋兩端的鐵柱。

**合併幾何**（`src/kart/art/skillKit.ts`，新）：`Batch` 把盒子、稜柱（任意凸多邊形擠出：山牆屋頂、鋸齒屋頂的齒、船殼）、圓管（管線、電線、扶手、欄杆）與平面板合成**一個** `BufferGeometry`，每個零件自己的頂點色、選填「每 N 公尺重複一次」的 UV；`addBatch` 用一個 `MeshStandardMaterial({ vertexColors })` 加進場景。一整區的素色零件一個 draw。共用的 canvas 貼圖（斜紋、貨櫃、浪板、磚、瓦、路面箭頭、倉庫編號、塗鴉）也在這裡。`fitRect`／`insideFootprint`：在路與分支之間找放得下建築的長方形（`roadClearance` 會把分支當路）。

**各張圖的場景**：

- `wharfArt.ts`（新）：`wharfPlan`（純函式，先算好，樹與比賽日佈置也避開）：最東邊的路再往東 48 m 是海；倉庫巷繞過的那個髮夾裡，髮夾頂點與分支背直線之間放下最大的倉庫（編號 07，13 m 高）；外圍的編號倉庫（01–06、08；`scatter` 離路 24 m、半對角線 ≤ 20 m）；貨櫃堆。畫：海面（共用水貼圖的複本，慢慢流）、碼頭邊的混凝土、黃邊與岸壁、繫纜樁（黑柱黃帽）、兩座龍門吊（四腳、橫樑、伸到海上的吊臂、機房、司機室、拉索、吊著一個櫃）、一艘貨櫃輪（船殼、船艏、舷緣白帶、後段船樓與翼橋、煙囪、甲板上 15 × 7 疊櫃）、兩艘工作船；倉庫是浪板牆＋低山牆屋頂＋鐵捲門＋兩面編號牌（深底白字白框，canvas，一張貼圖八格）。
- `lanesArt.ts`（新）：`lanesPlan`：水井在最後那個髮夾的內側（從島牆找到髮夾，取三個路點的外接圓心，離路 > 4 m 才放）；房子 `scatter` 離路 11 m、正面朝最近的路。畫：粉牆房子（石砌牆腳、窗與窗台、木門、山牆瓦頂四面出簷 0.9 m、屋脊）、門口的燈籠與兩盆盆栽；水井（十塊石砌井欄、水面、兩根木柱、橫木、吊繩與桶、小瓦頂）與一圈盆栽；三個台階跳台的兩側各一段往山上爬的石階（12 階）與兩側扶手；沿路每 7 個路點一根木電線桿（左右交替、避開房子），桿與桿之間兩段垂下的電線，每段掛兩個燈籠；每個院門掛兩個燈籠。燈籠本體是不受光的 `MeshBasicMaterial`（自己發光）。
- `worksArt.ts`（改）：廠房的平屋頂換成**鋸齒屋頂**（深度每 5 m 一齒，斜面＋直立的玻璃北窗）、浪板貼圖；**鑄造場**放在裝卸平台跨過的那塊空地（在那段主路的外框裡網格找離路最遠的點）：大廠房、山牆屋頂、屋脊的玻璃天窗、兩側發光的大門、後面三根煙囪冒**蒸氣**（每根四團，循環上升、變大、變淡，`update` 驅動）；第一棟旁邊有空地的廠房加一條爬上屋頂的**輸送帶**；最長直線外側一排**管架**（T 形架、三條不同顏色的管）；裝卸平台高於 1.6 m 的那段兩側加**欄杆**（黃黑斜紋踢腳板、扶手、立柱）。原本的高架線、橋墩、平台橋墩照舊。

**技術點提示**（`src/kart/art/skillCues.ts`，新）：顏色在 `kartTokens.ts` 的 `skillCue`：**「路」青色**（縫、岔路口）、**「跳」琥珀色**（甩尾起跳的跳台、矮欄）。

- 縫：兩端內側一條青色燈條（不受光）、頂上一盞青燈；縫前 7、13、19 m 的路面上青色雙箭頭，朝穿過縫的方向（`roadAt` 取最近那條路——主路或分支——的方向決定是哪一面）。
- 岔路：分支前幾個路點每隔一點一個青色箭頭；分支口兩側（不在任何路面上時）各一根黑柱青燈。
- 跳台：跳台兩端路緣外各一根黑柱琥珀燈；跳台前 10、7、4 個路點各一個琥珀箭頭，放在導引的技術線上、往導引說的甩尾方向越來越斜（`cue.way`；沒有導引但跳台就是分支起點的——廠區的裝卸平台——用分支往哪邊離開）。
- 矮欄：頂上每 5 m 一盞琥珀燈。
- 燈慢慢呼吸（亮度 55–100%，青與琥珀錯開半拍）；其他都不動。路面箭頭是 `polygonOffset` 的透明平面，`depthWrite` 關。導引的路點數和賽道不同（編輯器的副本）就不用導引，只標跳台與縫。
- **可以關**（擁有者 2026-11-22）：`/kart` 操作設定的「賽道技術提示」開關（預設開，`src/kart/trackCues.ts`，localStorage `tku-arcade.kart.trackCues`，讀寫都走不會丟例外的 `lib/storage.ts`）。關掉時 `SkillCues.setVisible(false)` 把全部標記（路面箭頭、燈、燈條、燈柱）藏起來，比賽中切換也立刻生效（`trackArt.ts` 訂閱，`dispose` 時退訂）；牆、縫、跳台本身不變。測試 `tests/kart/trackCues.test.tsx`。

**效能**（Playwright、`--use-angle=d3d11` 真 GPU、1280 × 720、中畫質、自動駕駛 10 秒）：每幀 draw call 碼頭倉庫 203 → 215、山城坡巷 213 → 228、高架廠區 249 → 242；幀數在量測雜訊內（70 → 79、70 → 73、67.5 → 64）。卡丁車 chunk 391 → 403.0 kB gzip（上限 600）。貨櫃、燈、箭頭、盆栽、燈籠用 instancing，其他用 `Batch` 合併；低畫質照 `level.density` 少放倉庫、房子、貨櫃堆。

**碼頭倉庫 `wharf@3`**（`shared/kart/tracks/wharf.ts`）：倉庫那個左迴轉的進出兩條直線各加長 30 m（`SHED_REACH`），迴轉往外推 30 m、主路那段多 60 m；分支的起訖點跟著往外移，所以在地上的位置不變。分支改成：沿路緣 20° 的緩彎離開（半徑 60 m）、直角左轉（半徑 32 m）到倉庫背面、沿背牆一條直線、再直角左轉接回。主路那段 399 m、分支 201 m（以前 339／256 m）。格式照 #113 的 `branches`，伺服器檢查照舊；`revision` 3。數字與試過的其他設計在 `KART-FEEL.md` §16。

**測試**：`skillArt.test.ts`（新：三張圖才換畫法、每面有 `top` 的牆都畫到、導引的每個縫都找得到、廠區的縫寬、倉庫在髮夾裡且離兩條路都 > 4 m、倉庫與貨櫃堆不在路上、海在每條路以東 30 m 以外、樹不長在倉庫裡、水井找得到且不在路上、房子不在路上）；`skillTracks.test.ts` 的碼頭倉庫門檻調回 10%、新手復位上限回 8；`technical.test.ts` 的紀錄 key `wharf@3`。`branchGolden.test.ts` 不動（舊九張與編輯器代碼不變）。

**限制（照實寫）**：(1) 場景都是程式畫的低多邊形，不是寫實模型；倉庫編號用瀏覽器的 sans-serif 字型畫在 canvas 上（只有數字）。(2) 海是一張貼在地面上方 4 cm 的平面，岸壁是一面薄牆，沒有真的往下挖。(3) 燈不會照亮周圍（只是自己發光的材質），晚上的圖看起來最明顯。(4) 鋸齒屋頂的齒方向跟著廠房轉，不保證朝北。

### 4.44 路線圖外：比賽演出（開場巡覽、名次變動、最後一圈、終點慶祝）（2026-11-20，`feat/kart-race-show`）

接 §4.42。之前評估離商業作品還差的「演出」：開場、名次變動、終點。都是畫面，規則與裁定不變；`prefers-reduced-motion` 時簡化。

**開場巡覽**

- 房間的倒數 `COUNTDOWN_MS` 從 4 秒改成 `INTRO_MS` 2.5 秒＋4 秒＝**6.5 秒**（`shared/games/kart/rules.ts`）：GO 仍是房間的同一個時刻，只是排好之後多等 2.5 秒。協定、frame、裁定都不變；單機對戰電腦／大獎賽用的是同一個 rules，所以也有。
- `director.ts` 的 `introShot(spots, left)`：剩 6.5 → 3 秒時，鏡頭從起跑格**前方高處**（看著車頭）繞一側到**後方**，最後 25% 的時間平滑接上 §4.42 的起跑格鏡頭，「3」出現時剛好接上倒數鏡頭。`inIntro(left)`＝剩餘 > 3 秒。
- **跳過**：`spikeLoop.ts` 在倒數中收到任何按鍵或 `pointerdown` 就 `skipped`，之後直接用起跑格鏡頭；GO 不變（是房間的），只影響自己的畫面。減少動態時不飛，直接是起跑格鏡頭。
- 畫面：`SpikeTrial.intro` 為真時 `RaceView` 不顯示數字與起跑提示，改顯示 `IntroCard`（`src/kart/ui/RaceShow.tsx`）：賽道名（自訂賽道沒有）、圈數、「按任意鍵跳過」（觸控「點一下跳過」）。
- 計時賽沒有 `net`，不巡覽。

**名次變動與最後一圈**（`RaceView.tsx`）

- 比賽中名次一變：數字放大彈回、變綠（上升）或紅（下降），名次框下方出現上／下三角形 1.6 秒（`PlaceArrow`，形狀而已，文字在 `aria-label`「升到第 n 名」）。三角形是絕對定位，名次框不會變寬撞到旁邊的按鈕。
- 進入最後一圈（圈數 > 1）：「最後一圈」大字橫幅 2.4 秒（`FinalLapBanner`）。

**終點慶祝**

- `director.ts` 的 `finishShot`：過線那一刻起，鏡頭在 2.2 秒內從車後繞到車前略偏一側、壓低，之後停在那裡；0.35 秒淡入。減少動態時不轉。
- `SpikeTrial.celebrating`：過線後 `CELEBRATE_SECONDS` 3.2 秒內。`RaceView` 顯示名次大字（「第 n 名」／「P n」）＋「抵達終點！」＋彩帶與三次火花（`Confetti.tsx`，2D canvas、程式產生、顏色用 `kartTokens.ts` 的 `kartFestival.flags`；減少動態時不畫），之後才是原本的完賽面板。計時賽（`RaceCenter`）顯示「抵達終點！」＋總時間，之後才是成績。
- **過線後車子不倒車**：完賽後 `stepTrial` 只在車還往前時煞車，停了就放開（原本一直按煞車＝倒車，車在演出時倒退過終點線、圈數被扣回一圈；之前結果立刻出現所以看不出來）。
- **結果畫面等演出**：`useFinishHold`（`src/kart/race/useFinishHold.ts`）從自己完賽起 3.2 秒內為真；`BotRaceView` 在房間已結束時也先留在比賽畫面，`KartScreen` 在 `game.over` 時也先留在 `RaceView`。最後一個到的人也看得到自己的演出。

**測試**：`tests/kart/raceShow.test.ts`（巡覽填滿 6.5 → 3 秒、從前方開始、接上起跑格鏡頭、每幀移動 < 2 m；終點從車後轉到車前、減少動態不轉；彩帶顏色與時長；結果等 3.2 秒）、`tests/worker/room-realtime.test.ts`（GO＝現在＋`COUNTDOWN_MS`）、`e2e/kart-bots.spec.ts`（巡覽卡片、按鍵跳過、終點慶祝之後才有結果）。

### 4.46 路線圖外：原創配樂、環境音、音樂／音效音量（2026-11-20，`feat/kart-audio-atmos`）

接 §4.44。之前評估離商業作品還差「聲音全部合成、沒有音樂、環境音」。**仍然沒有任何音檔**：配樂與環境音全部在瀏覽器裡用 WebAudio 即時合成（振盪器＋一段共用的白噪音），旋律、節奏、音色都是為這個遊戲寫的（`IP-CHECKLIST.md` 卡丁車 2026-11-20 補記）。

**一條匯流排**（`src/kart/audio/bus.ts`）

- 整個卡丁車只有**一個 `AudioContext`**（原本引擎一個、觀戰的道具音效一個；手機上多開一個就多一份成本）。三條匯流排：音樂（先經一個 low-pass，給 N2O 打開）→ 音樂音量；音效（引擎、輪胎、道具、環境音）→ 音效音量；兩者再經過網站的聲音開關（`lib/sound.ts` 的 `isSoundOn`）。`refreshKartBus()` 每幀呼叫、只有值變了才送。
- 瀏覽器要手勢才能出聲：`unlockKartAudio()` 在第一個按鍵或**點擊**（`pointerdown`，原本只有按鍵，手機一直沒聲音）時建立或喚醒。`kartAudio.ts` 的引擎、`createCuePlayer`（觀戰、重播）都改接到這條匯流排；`dispose` 不再關 context，只停掉自己的聲源、斷開。
- **音量**（`volumes.ts`）：音樂預設 70%、音效 100%，存 `localStorage` 的 `tku-arcade.kart.volumes`（`lib/storage.ts`，讀寫失敗不丟例外，存不了就只活到關頁並提示）；平方後套用，滑桿中間聽起來像一半。滑桿 `VolumeSliders.tsx` 在 `/kart` 的「操作設定」與觸控設定面板裡。

**配樂**（`songs.ts` 資料、`sequencer.ts` 純邏輯、`musicPlayer.ts` 合成）

- 一首歌是一張小表：速度、調、每小節的和弦、16 格一小節的鼓（大鼓、小鼓、hi-hat、打擊樂）、bass 與琶音（相對和弦的音級）、主旋律（相對調的音級，一小節一個字串），加上音色（波形、濾波、搖擺、回聲）。七首共約 3 kB 原始碼。
- **每種賽道一首**（`TRACK_SONGS`，`KART-WORLD.md` §6.3）：`breeze`（河畔、紅樹林：輕快大調）、`sunset`（漁港、砲台：夕陽 groove、七和弦、搖擺）、`neon`（老街、淡海：電子城市、16 分琶音、八度 bass）、`folk`（淡江、山城：五聲音階旋律、木魚、大鼓）、`steel`（碼頭、廠區：工業節奏、弗里吉亞調式、金屬敲擊）、`ridge`（觀音山、大屯：山路搖滾、強力和弦、tom）；選單與結果 `lounge`（慢、七和弦、柔和琶音）。自訂賽道依天空主題選（夜＝neon、夕陽＝sunset、校園＝folk、白天＝breeze）。
- **動態**（`sectionFor`、`mixFor`）：倒數與開場巡覽＝`intro`（只有 pad、拍點上的 bass、hi-hat、每小節第一拍的大鼓，濾波器關到 1.1 kHz）；比賽＝`race`（全編制，濾波器 3.6 kHz，留空間給 N2O）；**最後一圈**＝`final`（速度 ×1.08、主旋律高八度加一層、hi-hat 填滿 16 分）；**N2O（任何噴射）時濾波器全開到 18 kHz**；**過線**＝`outro`（一聲 crash 與第一個和弦長音收尾，之後安靜）；演出結束、結果畫面＝`menu`（`lounge`）。GO、最後一圈都從第一小節重來並加一聲 crash。
- **排程**：每 50 ms 醒一次，把未來 0.2 秒內的 16 分音符排上音訊時鐘（節拍不受幀率影響）；背景分頁卡住後跳到現在，不一次補播。每格只建幾個短命的節點，常駐的只有三個濾波器與一個回聲。
- **誰在放**：`claimMusic(race)` 回一個 claim；比賽的 claim（`spikeLoop.ts`）蓋過選單的，否則最新的勝出，放掉就回到前一個。`useMenuMusic()` 掛在 `KartScreen`（房間的結果、觀戰）、`BotRaceView`（單機結果）、`CupView`（盃的卡片與頒獎台）；它在畫面出來後才 `import()` 播放器，房間首屏不帶音樂（KartScreen 首屏只多 0.5 kB）。
- 量過（Playwright 接在 `destination` 前的 analyser，`--autoplay-policy`）：音樂 100%、音效 0 時峰值約 0.4、RMS 0.06–0.09；音效 100%、音樂 0 時比賽中 RMS 約 0.065；**沒有削波、沒有 NaN**。預設音樂 70% 時約比音效低 9 dB。**沒有人耳聽過**，要擁有者聽。

**環境音**（`ambience.ts` 純資料與距離曲線、`ambiencePlayer.ts` 合成）

- 圖層：海浪（低通噪音＋7 秒一次的湧浪）、海鷗（三角波上滑下滑，3–8 秒一次）、小鳥、夜市（人聲般的帶通噪音加顫動、攤位小鈴、炒菜的嘶聲）、城市（遠處低鳴、偶爾一台車經過）、機械（55 Hz 嗡聲、每 1.6 秒一下沖壓、偶爾蒸氣）、風（帶通噪音、頻率與音量慢慢起伏）、蟲鳴（白天蟬、晚上蟋蟀）。每張賽道的組合在 `TRACK_AMBIENCE`（`KART-WORLD.md` §6.3）。
- **依位置**：起終點的觀眾聲依車到線中點的距離淡入淡出（35 m 內全開、170 m 外全無、中間 smoothstep，`crowdLevel`），每次過線再一聲歡呼。其餘圖層整張賽道都在。
- 走音效匯流排，跟引擎一樣受音效音量與聲音開關控制。

**測試**：`tests/kart/music.test.ts`（各段的編制與濾波、什麼時候從頭來、排程的格點與搖擺、卡住後跳到現在、音級換算、每首歌格式正確且音高在 30 Hz–3 kHz、每張賽道有歌且六種不同、音量的預設與夾值與存不了、環境音的距離曲線與間隔）；`e2e/kart-night.spec.ts`（第一個按鍵後放賽道的歌、`intro`；音量在操作設定裡改、重新整理後還在）。`SpikeDebug.music` 是每幀要的 `歌:段落`。

### 4.47 路線圖外：夜間車燈與路燈、車手動作（2026-11-20，`feat/kart-audio-atmos`）

之前評估的另外兩項：「燈只自己發亮、不會照亮周圍」「角色和車沒有動畫」。

**夜間的燈**（`src/kart/art/nightLights.ts`，只在夜間賽道：老街、淡海夜城、編輯器的夜間主題，`isNightTrack`）

- **車頭燈**依畫質（`headlightLevel`）：**高**＝自己的車掛一盞真的 `SpotLight`（車頭上方 1.1 m、照 16 m 外、半角 0.42、不投影），照得到前面的牆、景物與別人的車，再加路面光斑；**中**＝只有路面光斑：一片貼在路上的加法混合四邊形，canvas 畫的「車前窄而亮、往前變寬變淡」的形狀（`beamShade`），沒有光源、不用算光；**低**＝關。處理器畫圖時（軟體 WebGL）高也只用光斑。別人的車一律只有光斑（場景只有一盞額外的光，換畫質才重建，不會在比賽中重新編譯 shader）。
- **尾燈**：原本就有的尾燈材質在煞車時變亮（`kartModel.ts`）；夜裡車後路面多一團紅光，跟著 `KartModel.braking()` 變亮。
- **路燈**：沿路每 30 m 一盞、左右交替（`lampSpots`），每盞在路面上一片 12 m 的暖色光斑（烘焙成一個 `InstancedMesh`，整條賽道一次 draw call，低畫質也有）；淡海與自訂夜間賽道另外立一根燈柱、橫臂與發光燈頭（三個 `InstancedMesh`）；老街本來就有成串的燈籠，只鋪燈籠色的光斑、不立柱。
- **效能**（真 GPU、RTX 筆電、`node scripts/kart-fps.mjs --track danhai`，新增 `--track`；7 台電腦車、不鎖幀）：手機版面 844×390@3 中畫質，燈關（還原 Scene.ts）50／55／47 fps、燈開 57／62／58 fps；1280×720 中畫質 64 → 58–68、高畫質 58 → 52。這台機器每次量的差（±8 fps）比燈的成本大，**量不出差別**；成本主要是中畫質每台車兩片加法四邊形的填充率，與高畫質的一盞 spot light。

**車手動作**（`src/kart/driverGestures.ts` 純邏輯、`kartModel.ts` 套到骨架）

- 手勢：`idle`（起跑格上：左右看、偶爾在方向盤上打拍子）、`wave`（開場巡覽：右手舉起揮）、`pump`（名次上升：右拳往上兩下，1.3 秒）、`cheer`（過線：雙手 V 字、晃、座位上彈，4 秒）、`podium`（大獎賽頒獎台：雙手輪流揮、看觀眾）；被打中暈眩照舊（#99）。`gestureAt` 決定時機：終點優先，再來是 GO 前（剩 > 3 秒＝揮手、≤ 3 秒＝待機），再來是名次上升。
- 套用：`KartLook.gesture`；`kartModel.ts` 對目標姿勢做指數平滑（每秒 14），手臂的旋轉順序改成 `ZXY`（先抬、再往外張；沒有手勢時與原本 `XYZ` 完全相同）；每台車一個隨機相位，整排車手不會同步。
- 誰給：自己的車由 `spikeLoop.ts`（倒數剩餘、過線時刻、`SpikeNet.place()` 新增的名次）；別人的車由 `netRace.ts` 的 `others()`（房間的 GO 與各人的 `finishMs`）；頒獎台是 `CupView` 在名次表下方放一個 `KartPreview`（新增 `pose`：車停著、不顯示提示與 N2O 開關），前三名 `podium`、其他 `idle`，lazy 載入。
- 看動作：主控台 `__kartSpike.gesture = 'cheer'`（`idle`／`wave`／`pump`／`cheer`／`podium`，`null` 還原），配合 `__kartSpike.view = { orbit: 2.5, back: 3, up: 1.5 }` 從前面看。

**測試**：`tests/kart/nightAndGestures.test.ts`（只有兩張夜間賽道、各畫質的車燈等級、光束形狀、路燈間距與位置在路邊且燈頭朝路、手勢時機與優先、各手勢的姿勢、平滑、相位不同）；`e2e/kart-night.spec.ts`（淡海中畫質車前路面平均亮度明顯高於低畫質，附兩張截圖）。

### 4.48 路線圖外：六個新道具、道具型車系「拾貝系」（2026-11-20，`feat/kart-items-more`）

接 §4.47。擁有者 2026-11-20：「繼續開發」。道具表原本缺的類型各補一個：防禦、範圍、位移、干擾、團隊、陷阱；#108 的車系沒有「道具型」，補一個系列三台。**全部原創**：名稱是淡水河口與漁村的一般詞（回浪板、海霧、打水漂、靜電、加油旗、假箱子；鵜鶘、水獺、鸕鶿、拾貝系），效果與造型都是自己設計、程式產生；沒有用任何原作的道具名、外觀或數值（`IP-CHECKLIST.md` 補記）。

**六個新道具**（`shared/kart/items.ts` 的 `ITEM_IDS` 接在後面，前八個在線上的編號不變；fog、decoy 是投射物，在 `shots.ts`）

| id | 暫名 | 類型 | 效果（伺服器裁定） | 和既有道具 |
| --- | --- | --- | --- | --- |
| `mirror` | 回浪板／Rebound | 防禦 | 8 秒內，下一個會打中你的投射物（冰雹、雷雲、泥水坑、假箱子）改打回丟的人（`hit` 事件 `bounced`，`by` 是回浪板那台、`targets` 是丟的人）；用掉 | 和泡泡罩同時開著時先用回浪板（泡泡罩保留）；丟的人有泡泡罩就擋掉、不會再彈第二次；對逆風、調包、靜電沒用（那是泡泡罩的事）；海霧不算攻擊 |
| `fog` | 海霧／Sea Fog | 範圍 | 在前一台（團隊賽：前面最近的對手）**正前方**沿它的方向 `max(25 m, 0.9 秒×車速)` 處放一團半徑 7 m 的霧，撞牆前停；停 7 秒。誰開進去（放霧的人除外）就 `hit` 一次（每台一次，`shot.struck` 記錄），**畫面起霧 1.6 秒**（中間仍看得到路）、極速壓到 82%（噴射中不受影響）| 不算攻擊：泡泡罩、回浪板都擋不住也不會用掉；霧留給下一台 |
| `skip` | 打水漂／Skip Stone | 位移 | 跳到下一個（或再下一、兩個）檢查點的重生點，距離 18–110 m，面向賽道、計入那個檢查點，落地小加速 0.6 秒；**永遠不會跳到或跳過終點線**（圈數只由伺服器算）。用 swap 的 `warp` 機制：伺服器記下落點，只收那裡的 reset frame | 跳過的路段上的泥水坑、假箱子、冰雹碰不到（只判落點）；雷雲照樣追得到 |
| `jam` | 靜電／Static | 干擾 | 全場第一台（團隊賽：對手最前面那台；距離 600 m 內）3.5 秒內放不出噴射，正在燒的噴射（含藍色）切斷；手上的噴射保留（`jamStep` 讓噴射鍵視為一直按著，物理只在「新按下」時放）| 泡泡罩擋得住（`HARMFUL_ITEMS`）；第一名拿不到 |
| `rally` | 加油旗／Rally Flag | 團隊 | 只在團隊賽：自己和每個還在跑的隊友小加速 1.3 秒 | 個人賽抽不到（`TEAM_ONLY_ITEMS`）也用不了 |
| `decoy` | 假箱子／Fake Box | 陷阱 | 丟在車後（和泥水坑同位置），長得像道具箱（核心暗紅、轉得慢、比較低：唯一的破綻），誰開進去就打轉 1 秒，停 25 秒；丟的人 0.9 秒後才會被自己的箱子打到 | 泡泡罩擋得住；回浪板彈回給丟的人 |

**道具表**（`ITEM_TABLE`，權重；`drawWeights(bucket, { teams, luck })`）：前段多了回浪板 2、假箱子 2、加油旗 2（團隊賽）；中段多了回浪板 1、海霧 2、打水漂 2、靜電 1、假箱子 1、加油旗 2；後段多了海霧 2、打水漂 3、靜電 2、加油旗 2。**第一名拿不到任何會打到前面的道具**（`TARGETED_ITEMS` 多了 `jam`、`fog`；打水漂也不在前段），測試擋。

**道具型車系「拾貝系」**（`shared/kart/karts.ts`，`KartSeries` 多了 `item`；`KART_IDS` 接在後面，frame 的車 index 仍 5 bit）：一台車可以把預算點數花在道具上（`ItemPoints`）：`luck`（0–2，每點讓 `STRONG_ITEMS` 的權重 ×(1+0.3)）、`duration`（0–2，自己的計時道具每點久 25%：順風、泡泡罩、拖繩、回浪板、加油旗）、`shield`（0–1，泡泡罩多擋一次）。**四項數值＋道具點數＝0**（測試擋），所以在競速賽裡它們就是每一項都差一點；極速都是 0（和標準車一樣）。

| id | 暫名 | 等級 | 極速 | 加速 | 操控 | 集氣 | 重量 | 道具 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `pelican` | 鵜鶘／Pelican | 入門 | 0 | 0 | +1 | −2 | +1 | 泡泡罩擋兩次 |
| `otter` | 水獺／Otter | 進階 | 0 | +1 | −1 | −2 | −1 | 運氣 1、道具久 25% |
| `cormorant` | 鸕鶿／Cormorant | 高階 | 0 | −1 | −1 | −1 | 0 | 運氣 2、泡泡罩擋兩次 |

**伺服器讀車款參數**：`rules.ts` 的 `perksOfFrame(last)` 從那台車最後一個 frame 的 `body`（`loadoutOfByte`，房間本來就用它限極速）查表；抽道具時帶 `luck`；用道具時把加長後的時間放在 `use` 動作與事件的 `ms`，泡泡罩擋幾次放在 `hits`，reducer 驗證範圍（`ms` 1–60000 整數、`hits` 1–3）。racer 多了 `shieldHits?`、`mirrorUntil?`；事件多了 `ms?`、`kept?`（泡泡罩擋了但還在）、`bounced?`。舊的瀏覽器不認得的欄位直接忽略，協定版本不變。

**畫面與聲音**：HUD 圖示（`ItemHud.tsx`，自己畫的線條：手鏡與折返箭頭、三道霧線、打水漂的弧、劃掉的火花、旗子、斜放的箱子）；場景（`itemArt.ts`：回浪板是繞車旋轉的銀環加亮點、海霧是一圈大霧團、假箱子是暗紅核心的箱子）；特效沿用 #86 的 `hitFx`：新增 `flash` 效果（`bounce` 銀色碎片、`fog` 灰色霧團、`splash` 藍色水花、`cheer` 綠色上升閃光、`static` 紫色小電花，`hitArt.ts` 一個 `STYLES` 表）；音效沿用 `itemSounds` 的介面（`USE_SOUNDS` 六個、`CUE_SOUNDS` 多 `bounce`、`fogged`、`jammed`，`kartAudio.ts` 沒動）；被霧罩住時 `FogVeil`（`HitHud.tsx`，四周起霧、中間留路，減少動態時不淡入淡出）。**觀戰與重播**：場景、特效、音效都從同一份事件與 shots 算（`SpectateView` 讀 `mirrorUntil`；重播記下 `bounced`／`kept`／`ms`，`mirrorsAt`、`shieldsAt` 照著算）。

**電腦車**（`itemSense.ts`，簡單／普通／困難／專家同一套，專家與困難都有 `itemSense`）：回浪板同泡泡罩（有威脅立刻用）；海霧在前一台 30–288 m 內；靜電只要前面有人；打水漂與加油旗在直線上，打水漂遇到威脅也立刻用來躲；假箱子同泥水坑。`effects.ts`、`netRace.ts`、壓測機器人（`scripts/kart/loadtest-bot.ts`）都套用靜電、海霧、加油旗、加長的時間。

**測試**：`tests/games/kart-items-more.test.ts`（每個新道具的裁定、和泡泡罩／回浪板的互動、團隊賽、打水漂不過終點且每張賽道大多數位置找得到落點、抽籤規則、鸕鶿實際抽到比較多強道具、鵜鶘擋兩次、水獺時間加長、亂報的 `ms`／`hits` 被拒）、`tests/kart/itemsMore.test.ts`（靜電保留噴射、海霧減速、電腦車的效果、特效與音效、觀戰聽得到、重播的回浪板與擋兩次、電腦車何時用）、`tests/kart/karts.test.ts`（拾貝系的預算與上限）。

### 4.49 路線圖外：桌遊電腦玩家（德州撲克、陞官圖、滬尾商行）（2026-11-20，`feat/boardgame-bots`）

擁有者：「桌遊都要真人湊齊人數」。三款加電腦玩家，一個人或人數不夠也能開局。和卡丁車的電腦車（§4.21，房主的瀏覽器在跑）不同：回合制遊戲在 **RoomDO 裡直接算**，不靠任何瀏覽器。

- **介面**（`shared/games/types.ts`）：`GameModule.bot?(view, legal, level, rng): A | null`，選用。拿到的就是那個座位的瀏覽器會拿到的東西：自己的 `view`（`projectFor`，隱藏資訊照樣裁掉）與 `legal`，**拿不到 state**，所以電腦不會作弊。`rng` 是房間的（不是遊戲的），選了什麼照樣進動作紀錄，重播仍是「種子＋動作」。回 null 或回被拒的動作，房間改挑一個隨機合法動作，所以電腦玩家不可能卡住一局。也會在不是它的回合時被問（`legal` 是空的），這時要便宜、通常回 null（德州撲克用來從暫離回來）。名字與難度沿用 `GameModule.bots = { levels, names }`，三款共用 `shared/games/tableBots.ts`：難度 `easy`／`normal`，九個原創名字（白鷺、榕樹……，字串在 `room.bot.name.*`）。`GameMeta.computer: true`（`lobby.ts`）讓瀏覽器不用載模組就知道要顯示「加電腦玩家」；測試保證它和 `bot` 一致。其他遊戲之後要接，就寫一個 `bot` 加上這兩個欄位。
- **房間怎麼跑**（`worker/room-host.ts`）：每次 `change` 後與 `restore` 後 `settleBots()` 找「座位順序第一個現在有事做的電腦座位」，記下 `botTurn = { key, at }`（`key` 是種子＋步數＋座位，`at` 是現在＋0.6–1.5 秒的隨機「思考」時間，`BOT_THINK_MS`），`nextAlarm()` 把它算進 alarm；alarm 的 `sweep()` 在 timer 之後 `playBot(now)`：用那個座位的 projection 問 `bot`、`playAction` 以那個座位的身分送進 `reduce`（和真人一樣被裁判），接受後再 settle 下一個。`botTurn` 只在記憶體：被趕出記憶體後 `restore` 重新給一個思考時間。同一座位連下兩步（德州撲克先同意停、再下注）也各自等一次。
- **沒有人在房間就暫停**：沒有任何真人連著 socket 時 `botTurn` 是 null，電腦不會對著空房間打完一局；有人回來（`join` 是一次 `change`）就接著下。德州撲克的行動計時照走，電腦可能因此被判暫離，所以 `bot` 在不是它回合時看到自己 `away` 會回 `away: false` 回來。
- **權限**：只有房主能加（等待中或結束後、放最低空位、`ready`／`online` 恆為 true、和卡丁車同一個 `add_bot`）；房主在等待室能移除（`kick`，不記 ban），遊戲中不行；**電腦不能是房主**（`transfer` 要對方有 socket，`replaceAbsentHost` 只挑在線真人）；房主不能替房間在跑的電腦座位送動作（`isBotSeatFor` 對有 `bot` 的遊戲一律 false）。
- **再來一局、換遊戲**：再來一局時電腦和大家一起重編座位、照樣上桌。換遊戲時，新遊戲的 `bots` 有它的難度與名字才留（三款之間互換會留；換成卡丁車或沒有電腦玩家的遊戲就拿掉），座位數變少而沒有位子的電腦直接拿掉（不會變成旁觀的電腦）。
- **畫面**：等待室在房主畫面多一個「電腦玩家」區塊（`src/components/TableBots.tsx`，lazy chunk，難度＋按鈕）；座位列表的電腦顯示「白鷺（電腦）」與難度、房主的移除鈕（`MemberEntry`，`botKey` 先找遊戲自己的 `games.<id>.bot.*`、沒有就用房間的 `room.bot.*`）；遊戲畫面直接用 `member.name`，所以 `RoomPage` 交給畫面的 view 先把電腦成員的名字換成讀得懂的（`withBotNames`）。
- **三款的策略**（都只看自己的 view）：
  - **德州撲克**（`shared/games/holdem/bot.ts`）：翻牌前用公開的 Chen 起手牌分數；翻牌後用看不到的牌（牌堆＋別人的手牌）模擬 60 次發完公牌與對手的牌估勝率（對手最多模擬 3 位，再多用次方折算），和底池賠率比。普通：弱牌棄、中等跟、強牌加注（池的一半到一池，偶爾全下）、籌碼少於 10 BB 時好牌全下、少量詐唬。簡單：常跟注、很少加注、不看賠率。有人按「這手打完就停」時電腦在下一次輪到時同意（沒有別人在投就收回）。
  - **陞官圖**（`shared/games/promotion/bot.ts`）：擲骰就是擲骰；完整版的抉擇：授職看「那格的品級＋一擲之後平均品級的一半」比現在那格好才接受；捐納只花得起「三分之二銀兩以內」、而且明顯比雜職好（分數差 > 2）才捐，否則就任雜職。簡單：抉擇隨機。
  - **滬尾商行**（`shared/games/traders/bot.ts`）：貪婪＋短前瞻。買得起就買價值最高的（分數 × 1.5、貴客還差的那一色、前期的永久折扣）；買不起就挑「價值 ÷（還差幾個）^1.5」最高的目標，拿最能補缺口的貨（第二目標要的算 0.3）；拿貨幫不上或手上快滿就保留目標（順便拿金）；超過十個時退目標最不需要的、金最後退。簡單：買得起七成會買、其他隨機拿貨。
  - 強度（兩人、30 個種子，普通對簡單）：德州撲克 28：2、滬尾商行 29：1、陞官圖完整版 21：9（陞官圖大多是運氣）。
- **德州撲克的已知限制**：~~真人出局之後，剩下的電腦會打到分出勝負~~ 2026-11-22 解決：房間開局時告訴遊戲哪些座位是電腦（`Seat.bot`，`beginFromSeats`；存在 `StoredGame.seats`，重播一樣），德州撲克記在 `HoldemPlayer.bot`；一手結束後的 `next` 發現**所有真人都出局、桌上只剩電腦**（`peopleOut`）就直接結束，結算照籌碼排（電腦依籌碼、真人依出局順序）。不讓房主選：沒有真人在玩，看電腦打完沒有意義，想再看就「再來一局」。舊的進行中牌局沒有 `bot`，照舊打到底。
- **測試**：`tests/games/table-bots.test.ts`（三款各種人數、兩種難度與混合、多個種子全電腦對局都能結束；電腦只用合法動作——德州撲克的同意停與回來除外，那兩個本來任何時候都收；同一個 view 不管隱藏的牌怎麼換都下同一步；別人蓋著保留的牌不會被當目標；`GameMeta.computer` 與 `bot` 一致；各策略的單元測試）、`tests/worker/room-table-bots.test.ts`（加入與移除的權限、換遊戲、電腦不能當房主、0.6–1.5 秒才動且不早一毫秒、問 `bot` 時只給那個座位的 view、房主不能替它下、沒人時暫停回來接著下、hibernation、再來一局、一人＋兩電腦三款各玩完一局）、巡檢 `e2e/smoke-games.spec.ts` 多一組「一人＋兩個電腦玩家」（桌機，三款）。
- **2026-11-21 補充：再四款（`feat/boardgame-bots-2`）**：朝堂暗鬥、奪祕笈、芥末餃子、社辦牌陣也接上（`shared/games/<id>/bot.ts`、`GameMeta.computer`），房間的跑法不變，只多一個選用的 `GameModule.botLeaves?(action)`：電腦不按的動作（三款的「下一輪」——任何人都能按、按了大家就看不到計分），房間在 `settleBots`／`playBot` 先用 `botLegal()` 濾掉；只剩這些時不算電腦的回合，交給真人或計時。
  - **朝堂暗鬥**：每次回應窗都會問到電腦（房間一個座位一個座位問，每個 0.6–1.5 秒）。估「某人有某官職」＝看不到的那個官職張數（3－自己的－翻開的）分在看不到的牌（牌堆＋別人的靠山）裡、那人拿到至少一張的機率（超幾何），再看「經過」（從他上次換牌、被證實之後）：同一官職自稱多次就加、自稱過的官職種類比靠山多就打折。普通：7 銀就政變（挑靠山多、錢多的）；有侍衛就拘捕（挑不像有太后的）、有司庫就課稅、有太監就勒索（挑有錢、不像能擋的）；沒有就以 20% 唬；機率低於門檻（受威脅時高、只剩一張時低）才質疑，一張都不可能有就一定質疑；有能擋的就擋，被拘捕而只剩一張時一定硬擋；丟最沒用的靠山、換牌留最好的。簡單：唬 45%、18% 隨便質疑、一半忘了擋、35% 的回合隨便選。
  - **奪祕笈**：看不到的牌＝牌組－自己手牌－所有人丟出與翻開的牌－兩人局的明牌；某人的牌＝自己密探或決鬥看到、之後他沒出過那張、沒被醉漢逼丟、沒換過手（`knownCard`），否則照看不到的牌的比例。每個合法出牌打分：捕快＝猜中機率（看過就猜看過的）、決鬥＝贏的機率－1.3×輸的機率、醉漢＝逼出祕笈的機率、面具師＝換到更大的牌、都加上「留下那張的大小 ×（牌堆越少越重）」；祕笈 −100。簡單：隨便出，但不自己丟祕笈。
  - **芥末餃子**：某個蒸籠藏芥末的機率＝55%（還有芥末時；少了餃子就按比例降）、這輪喊過價的 ×0.35、說吃不下的 ×1.5；吃上面 k 顆都是鮮肉的機率＝1－機率×k／沒翻開的顆數。喊價的勝算＝自己蒸籠先吃（芥末上面的鮮肉以外一律 0），剩下的一顆顆挑最可信的蒸籠吃。普通：開局 65% 先藏芥末、疊到平均每人 1.8 顆才開喊、只喊勝算 ≥ 55% 的最大數字、跟價只加一、吃最可信的、自己的芥末被咬時丟鮮肉。簡單：開局 50% 藏芥末、平均 1 顆就喊、勝算 ≥ 20% 就加（另外 25% 亂加）、隨便吃。
  - **社辦牌陣**：牌架照花色×數字計數，列出所有可能的順子（同花連續、萬用牌補至多手上張數的空、至少兩張真牌）與同數組（3／4 種花色、萬用牌補），DFS：拿最小的還沒處理的牌，試每個以它為最小的組合、或留在牌架；分數＝出的張數，同分比點數；第一次出牌要組合點數 ≥ 30。步數上限（普通 40,000、簡單 6,000）讓結果只由 view 決定；另有 50 ms 保險（`BOT_BUDGET_MS`，每 512 步看一次時間）。普通再把剩下的牌一張張接到桌面現有的組合（還沒破冰時只接自己這回合的新組合；萬用牌只在接完就出完時才接）。不拆桌面重組。送出前 `checkTurn` 驗過，不過改送只有牌架組合的版本，再不過就摸牌。動作是 `commit` 附整個桌面（`reduce` 本來就收，不在 `legal` 裡）。
  - 強度（普通坐一席、其他是簡單，輪流換位子；「第一的比率」，同名次平分）：朝堂暗鬥 2 人 73%、3 人 58%（簡單每席 21%）；奪祕笈 2 人 86%、3 人 64%（18%）；芥末餃子 3 人 63%（18%）、4 人 60%（13%）；社辦牌陣 2 人 99%、3 人 87%（7%）。每步最慢 3 ms 以內（社辦牌陣最大牌架約 15 ms）。
  - **沒有跳過任何一款**：四款都是回合制、沒有即時互動；朝堂暗鬥的吵架本來就在通話裡，電腦不會說話，但仍有唬人與質疑可玩。
  - **測試**：`tests/games/table-bots.test.ts` 多四款的全電腦對局（各兩種人數、兩種難度與混合）、普通對簡單的勝率（三人，各 40–120 局，普通要高於 1／人數且高於簡單每席的 1.5 倍）、換掉看不到的東西（別人的牌、牌堆、蓋著的牌、蒸籠內容）view 與下一步都不變、各策略的單元測試、`botLeaves`；`tests/worker/room-table-bots.test.ts` 多四款一人＋兩電腦玩完、奪祕笈一輪結束後電腦等真人按「下一輪」；巡檢多四款（朝堂暗鬥、芥末餃子到結束或真人出局，奪祕笈到第二輪開始，社辦牌陣十回合）。

### 4.50 路線圖外：駕訓班（教學模式）與比賽中的技巧提示（2026-11-20，`feat/kart-tutorial`）

接 §4.48（§4.49 是同一天平行的桌遊電腦玩家）。擁有者 2026-11-20：「繼續開發」。卡丁車要練的技巧已經很多（`KART-FEEL.md` §3、§11、§14、§15），新玩家很難自己發現。這一批做一個「駕訓班」（暫名），十堂課一堂一招，再加上比賽中的一次性提示。程式全在 `src/kart/school/`（自己的 lazy chunk），共用檔只有小插入。

**入口**：`/kart` 選單多一顆「駕訓班」；第一次進 `/kart`（沒回答過、也沒上過任何一課）左上角會出現建議卡「去駕訓班／不用了」，回答一次就不再出現（`store.ts` 的 `shouldInvite`）。網址 `/kart?school` 直接進課程列表，`?school=<課 id>` 直接進那一課（重新整理停在原地）；`?autopilot` 讓頂尖駕駛（`drivers.ts` 的 `master`）來開，給 e2e 與展示用。`KartPlay.tsx` 多一種 `Playing`（`school`），和對戰電腦、大獎賽一樣 lazy 載入 `SchoolView.tsx`。

**課程**（`lessons.ts`；每課的賽道、目標、時限、星等規則）

| # | id | 技巧 | 賽道 | 目標 | 星等 |
| --- | --- | --- | --- | --- | --- |
| 1 | `drive` | 油門與轉向 | 駕訓場 | 跑完一圈（120 秒內） | 依撞牆次數：0／≤2 |
| 2 | `drift` | 甩尾 | 駕訓場 | 3 次讓量表變金（`burstReady`） | 依秒數：15／30 |
| 3 | `dash` | 瞬間加速 | 駕訓場 | 噴出 3 次（任何等級） | 16／35 秒 |
| 4 | `perfect` | 完美時機 | 駕訓場 | 連續 3 次完美（`dashGrade` 3） | 20／60 秒 |
| 5 | `combo` | 連段 | 駕訓場 | 連段 ×3（`chain`） | 20／50 秒 |
| 6 | `n2o` | N2O | 駕訓場 | 集滿一格、噴出去、噴射中再集 8 點 | 20／45 秒 |
| 7 | `start` | 完美起跑 | 駕訓場 | 完美起跑一次（`start === 'boost'`） | 依次數：1／≤3 |
| 8 | `jump` | 甩尾起跳 | 碼頭倉庫的第一個跳台 | 甩尾起跳落地一次（`driftJumps`） | 1／≤3 次 |
| 9 | `gap` | 穿縫與捷徑 | 山城坡巷的三道院牆 | 三個門依序穿過 | 1／≤3 次 |
| 10 | `final` | 綜合考驗 | 考驗賽道（兩圈） | 50 秒內跑完 | 28／36 秒 |

- **兩張原創短賽道**（`shared/kart/tracks/school.ts`，用 `lay.ts` 一個彎一個彎鋪）：駕訓場 `school-yard`（700 m、30 m 寬、平地、無牆，五個都能甩的彎，圈數 20：課程達標就結束）與考驗賽道 `school-test`（870 m，右、左、髮夾、快彎、左、兩個長右彎，兩圈）。**不在 `RACE_TRACK_IDS` 裡**：房間選不到，伺服器也不認得。第 8、9 課直接開既有賽道的第一段（碼頭倉庫起跑後 333 m 的裝卸坡；山城坡巷 282–462 m 的三道院牆），用它們的導引（`guide.ts` 的 slots）判斷有沒有穿過門。
- 學校固定用「經典」標準手感（`KART_TUNING`＋玩家在 `/kart` 選的車，`applyKart`）、瞬間加速規則開著、自動噴射關著，不管調參面板改過什麼；不存幽靈車（`ghostPick: 'off'`）。

**判定**（`judge.ts`，純函式）：`spikeLoop.ts` 多一個選填的 `onStep`（每一個物理步之後呼叫一次：前後的 `KartState`、輸入、`Trial`、撞牆速度），學校把它轉成 `Sample`，`judgeStep(lesson, judge, sample, context)` 回傳新的 `Judge`（計數、過關、失敗、這一次結束、最後一個錯誤與每種錯誤的次數、嘗試次數、撞牆次數）。全部從物理狀態判斷，不另外模擬：

- `watchDash`：瞬間加速的事件。賺到（`burstReady` 由假變真且在甩）、沒賺到就放開（`driftSeconds < dashMinSeconds`＝放太快，否則＝不夠深）、噴出（`dashCount` 增加，帶 `dashGrade`；不是完美時說為什麼：還按著甩尾、甩不到 `perfectMinSeconds`、甩尾中先按了前進（`tapEarly`）、放開後太晚按；1 級＝太晚）、錯過（等待中的瞬間加速沒噴就沒了：又甩了、撞牆、一直按著前進、放開後沒再按）。
- 連段：`chain` 沒增加時說是太晚、還是那次甩尾碰過牆；`chain` 歸零時說是撞牆、錯過、還是超過 2.5 秒。N2O：噴射中按噴射鍵（沒用）、沒有存量時按；噴射中加速條增加才算第三步。起跑：GO 後 `startLate + START_LATE_TELL` 再判，`quick`＝太早、`late`＝太晚、`none`＝沒按。甩尾起跳：起跳那一步沒帶上 `airDrift` 時看起跳前有沒有在甩（沒甩／車尾還沒出去），空中 `airDrift` 歸零＝放開了甩尾。穿縫：每道牆在路上的那條線，越過時離門中心的橫向距離 ≤ 5.5 m 才算穿過，否則＝繞過牆；牆前 30 m 內重撞＝撞到門邊。
- 每一課都會說：重撞牆（第 1、10 課）、逆向（進入逆向那一下）、站著不動 2 秒（`{reset}` 復位）、按甩尾卻沒方向、太慢甩不起來。同一個錯誤一秒內只說一次，但次數照算；失敗時結果卡顯示最常出的錯（`worstNote`）。
- 「嘗試型」課程（起跑、甩尾起跳、穿縫）每一次就是一趟：失敗那一下結果顯示 1.8 秒，然後自動從起跑格重來（`nextTry` 保留嘗試次數與錯誤次數）。其他課程有時限，超過＝沒過關。
- `liveHint`：當下的提示，跟著車的狀態走（甩尾中還沒金＝繼續甩、金了＝放開、甩夠久＝完美時機、滑出中＝放開前進再按、有 N2O＝按噴射、噴射中＝繼續甩、倒數中＝等到「1」／現在按住）。

**按鍵圖示**（`controls.ts`、`KeyText.tsx`）：課程說明、當下提示、錯誤提示裡的 `{throttle}`、`{drift}`、`{boost}` 等，畫成鍵帽，內容是玩家自己的操作：鍵盤（綁定的第一個鍵，`keyLabel`）、手把（`padLabel`）或觸控（「油門」「甩尾」…，轉向是 ◀ ▶），依最後用的裝置自動切換（按鍵盤＝鍵盤；手把有按住的控制＝手把，每 0.3 秒看一次；觸控按鈕顯示中＝觸控，§4.25）。

**畫面**（`SchoolView.tsx`）：課程列表（十課、每課目標、最佳星等或「已跳過」、建議的下一課高亮、總星數）；上課時左上是課程面板（第幾課、名稱、目標、`count / target`、第幾次、可展開的「怎麼做」與星等規則），右上「重來／跳過／全部課程」，畫面中下是當下提示與紅色錯誤 ticker，底下是一般 HUD（深度量表、加速條都照舊），倒數用 `RaceCenter`；綜合考驗另有比賽時鐘。過關卡：過關！、星等、秒數、下一課／再試一次／全部課程；最後一課過關改成「去比賽」。轉播風格（§4.35 的 `broadcast`、`ticker`、`slam`）。

**進度**（`store.ts`，localStorage，全部 try/catch，壞資料當沒有）：`tku-arcade.kart.school`（每課最佳星等，0＝跳過；跳過不會蓋掉已過的星）、`tku-arcade.kart.coach`（情境提示開關）、`tku-arcade.kart.tips`（給過的提示）、`tku-arcade.kart.schoolInvite`（回答過建議卡）。

**比賽中的情境提示**（`coach.ts` 純函式、`useCoach.ts`、`CoachTip.tsx`）：時間賽（`SpikePage`）與比賽畫面（`RaceView`：對戰電腦、大獎賽、多人房）都掛 `onStep`。偵測玩家還沒做過的技巧，每種一輩子只給一次，7 秒後自己收起（也可按 ×），整個框不吃點擊（只有 × 會），不擋比賽的按鈕；玩家自己做到了（例如自己噴出瞬間加速）那個提示就標成已知、永遠不給。`?autopilot` 時不掛。只在經典手感。

| 提示 | 什麼時候 |
| --- | --- |
| `repress` | 賺到瞬間加速，但一直按著前進直到機會沒了：「甩尾之後放開前進再按一下：瞬間加速」 |
| `deeper` | 連續三次甩尾都沒賺到：甩久一點、往彎內打，量表變金 |
| `perfect` | 四次普通的瞬間加速、一次完美都沒有：放開甩尾的同一瞬間按前進 |
| `fire` | 有 N2O 存著 8 秒沒噴 |
| `locked` | 噴射中按噴射鍵 |
| `start` | 起跑沒拿到完美起跑 |
| `reset` | 比賽中站著不動 3 秒 |

開關在操作面板「規則」那一區：「比賽中的技巧提示」（`CoachSwitch`）。

**驗證**：`tests/kart/school.test.ts`（每一課的判定用合成的物理狀態序列：達標、每種錯誤的原因、時間到、星等；瞬間加速事件；當下提示；兩張賽道過 `parseTrack`；進度存取、壞資料、localStorage 被擋也不丟例外；情境提示）、`tests/kart/school.master.test.ts`（頂尖駕駛每一課都一次過、三顆星；新手過不了甩尾起跳與完美起跑，原因是「沒在甩」與「太早」）、`e2e/kart-school.spec.ts`（建議卡與選單入口；`?autopilot` 自動完成前兩課、星等存進 localStorage）。`npm run kart:feel -- --school` 印四種駕駛每一課的結果（`KART-FEEL.md` §17）。

### 4.51 路線圖外：效能與重播分享（2026-11-20，`feat/kart-perf-replay`）

接 §4.48（§4.49、§4.50 是同日的桌遊電腦玩家與駕訓班）。量法、成本分析與前後數字在 `docs/KART-PERF.md`；重播檔的格式與防護在 `KART-NETCODE.md` §11.4。這裡記程式的形狀。

- **合批粒子**（`src/kart/art/particles.ts`）：`createParticleBatch(world, { capacity, map, additive })` 是一個 `InstancedBufferGeometry` 的四邊形加一個 `ShaderMaterial`（照 three.js 的 sprite shader：面向鏡頭、`offset.w` 是大小、`spin` 旋轉、`tint` 是顏色與透明度、霧、tone mapping、色彩空間）。用法：每幀 `begin()`、每顆活著的 `add(...)`、`end()`（只上傳用到的範圍；沒有粒子就不畫）。`effects.ts` 每台車兩批（煙；火花＋噴射的火），`hitArt.ts` 兩批（星星；光暈＋閃光）。粒子本身是普通物件（位置、速度、年齡），不再是場景裡的 Sprite。
- **烤漆合併**（`kartParts.ts`）：`markPaint(material, look)` 在 `colour()` 與碳纖維材質上記下樣子；`flatten(root, keep, shadows, paint)` 把一個群組裡所有記過的材質的 mesh 合成一個、用 `paint`（`createPaintMaterial`：`MeshStandardMaterial`＋`onBeforeCompile`，粗糙度、金屬度、自發光、環境反射強度、碳纖維紋的比例改讀頂點屬性 `paintRM`、`paintEmissive`、`paintEnv`，顏色用 `vertexColors`）。鬼影車（一個材質）不受影響。
- **遠處的車與陰影替身**（`kartModel.ts` 的第六個參數 `KartDetail`）：`{ far: true }`（別人的車）多做「關」「開」兩份靜止的合併版掛在底盤上，`detail(far)` 切換，更新時照 `reading.morph ≥ 0.5` 選哪份；`Scene.ts` 照鏡頭距離切（`FAR_KART`：低 22、中 32、高 45 m，±2 m）。`{ shadowProxy: true }`（自己的車）把零件合成一個只有位置的 mesh（`colorWrite`／`depthWrite` 關，只投影子；同樣關、開兩份），零件本身不投影子。`mergeTree(root, meshes, keep, material?)` 是兩者共用的合併。
- **撞牆外框**（`shared/kart/walls.ts`）：`wallBoxes(walls)` 每份牆陣列算一次外框（`WeakMap`，長度變了重算）；`collideWalls` 在算最近點前先比外框＋半徑＋1 mm。只是跳過一定不會推車的牆，順序與結果不變（golden 測試）。
- **動態解析度**（`src/kart/resolution.ts`，純函式）：`startResolution(top)`／`nextResolution(state, frameSeconds)`；`Scene.ts` 在 `draw`／`watch` 每幀之後呼叫，pixel ratio 變了才 `setPixelRatio`＋`resize`（含後處理的緩衝）。處理器畫圖時不啟用。測試 `tests/kart/resolution.test.ts`。
- **量測掛鉤**：`KartScene.stats()`（`renderer.info`，`autoReset` 關掉、每幀 `present` 開頭歸零，所以含陰影與後處理的 pass）、`drawn()`（不配置）；`spikeLoop.ts` 的 `__kartSpike.render`／`jsMs`／`totals`。
- **重播檔**：`shared/kart/replayBlob.ts`（從 `replay.ts` 搬出來的 `encodeReplay`／`decodeReplay`，加上嚴格的 `checkReplayMeta`；房間首屏只錄不打包，所以不帶它）、`shared/kart/replayFile.ts`（`.tkureplay` 容器、deflate-raw、大小限制、連結的 base64url）、`shared/kart/itemIds.ts`（`ITEM_IDS` 本身，讓驗證不用載入道具規則）。介面：`src/kart/watch/ReplayShare.tsx`（下載、複製連結；房間結果是 lazy chunk）、`replayFiles.ts`（檔名、檔案資訊、觸發下載）、`ReplayFilePage.tsx`（路由 `/kart/replay`，lazy）、`ReplayView` 多了 `revision` 與 `notice`；字串在 `shared/games/kart/i18n.replayFile.ts`，由 `src/kart/watch/replayMessages.ts` 在用到時註冊。電腦車比賽（`BotRaceView`）用房間同一個 `useRaceRecorder` 錄，結果畫面有看重播與下載。

### 4.52 路線圖外：賽道場景、車款、配樂拆成 lazy chunk；載入畫面與預先下載（2026-11-21，`feat/kart-lazy-chunks`）

接 §4.51。數字在 `docs/KART-PERF.md` §7。原則：**建場景本身照舊是同步的**（`createKartScene`、`buildTrackArt`、`buildKartModel` 不變），改的是「建之前先把要的東西載完」；物理、伺服器裁定、協定都沒動。

- **載入器**（`src/kart/load/kartLoad.ts`，沒有 three.js）：`RACE_ENGINE`（`spikeLoop.ts`：計時賽、電腦車、房間比賽、大獎賽、駕訓班）、`WATCH_ENGINE`（`watch/watchLoop.ts`：觀戰、重播、重播檔）、`SCENE_ENGINE`（`Scene.ts`）三個「引擎槽」，各自只下載一次、失敗會忘掉（再要一次就重抓）。`loadKart(plan, onProgress)` 同時下載 plan 的四樣：引擎、賽道專屬場景、車系、這張賽道的歌，回報加權進度（引擎 8、場景 2、每個車系 1、歌 1）；`peekKartLoad(plan)` 全部到齊就直接給引擎（第二場同賽道不會閃載入畫面）；`prefetchKart(plan)` 在瀏覽器閒置時背景下載、錯誤留給載入畫面。React 用 `useKartLoad(plan, key)`（`engine`、`progress`、`failed`、`retry`）。
- **入口**：`RaceView`（房間、電腦車、大獎賽）、`SchoolView`、`SpikePage`（`/kart`）、`SpectateView`、`ReplayView`（含 `/kart/replay`）的迴圈 effect 都等 `engine` 不是 null 才呼叫 `engine.startSpikeLoop`／`engine.startWatchLoop`；這些頁面本身不再靜態 import 引擎（`supportsWebGL2` 搬到 `webgl.ts`、`SPIKE_COURSES`／`spikeTrack` 搬到 `courses.ts`、`HUD_STEPS` 搬到 `hudSteps.ts`，原處 re-export）。編輯器的 3D 預覽（`editor/View3D.tsx`）本來就是自己的 chunk，先 `await loadTrackScenery` 再建。`/kart` 車庫的 3D 預覽改成 lazy（`GaragePanel`），選單不再帶 three.js。
- **房間的「畫好賽道」**（`KART-NETCODE.md` §3）：`RaceView` 在 `startSpikeLoop` 之後才送 `loaded`，現在 `startSpikeLoop` 要等全部載完，所以「大家都畫好（或等了 25 秒）→ 倒數」的意思不變：慢的人還在載入畫面時，別人的畫面顯示「等大家到起跑格（n／m）」、房間不會倒數（`e2e/kart-loading.spec.ts` 用網路節流驗）。25 秒的保底在伺服器，照舊。
- **賽道專屬場景**（`src/kart/art/trackScenery.ts`）：`loadTrackScenery(track)`／`loadedScenery(track)`；`harbour`、`tamkang`、`oldstreet` 各一個模組，`works`／`wharf`／`lanes` 是各自的模組加共用的 `skillWalls`＋`skillCues`（與 `skillKit`），`mangrove`／`fort`／`danhai`／`datun` 是 `localPlan`＋`localArt`；其他（河濱、觀音、測試橢圓、編輯器做的、駕訓班）沒有自己的，立即可用。`buildTrackArt(track, level, scenery = loadedScenery(track))` 從 `TrackScenery` 拿函式；沒載到就畫成普通賽道並在 console 報錯（不會當掉）。festival、cornerArt、forkArt、hillArt 每張賽道都用，跟引擎一起。**新賽道有專屬場景就加進 `LOADERS`**（`tests/kart/lazyChunks.test.ts` 擋清單）。
- **車款**（`src/kart/art/bodyLoad.ts`）：`BODY_FAMILY` 每台車屬於哪個車系（`first` 跟引擎；`more`、`bike`、`item` 各一個 chunk），`loadBodies(ids)`、`bodiesLoaded`、`bodyMakers`（`vehicleBodies.ts` 註冊第一批）。比賽前載入畫面先載「起跑格上已知的車」（自己的、`lookOf` 的每個座位、大獎賽的電腦車）；之後才出現、車系還沒到的車（觀戰、重播、frame 才知道的），`Scene.others` 先畫成預設車、背景載入、到了再換成本人。車庫預覽（`previewStage.show`）先載車系再畫。**新車要加進 `BODY_FAMILY`**（測試對照每個車系檔案匯出的清單）。
- **配樂**（`src/kart/audio/songs.ts` 與 `songBook/`）：每首歌一個檔（`songBook/<id>.ts`，共用 `scales.ts`），`loadSong`／`loadedSong`／`SONG_IDS`；`TRACK_SONGS`、`songFor` 照舊。`musicPlayer` 要播的歌還沒到就先靜音、到了再開始（載入畫面已經先載好了；選單的 lounge 由播放器自己載）。
- **載入畫面**（`src/kart/load/KartLoading.tsx`，#104 的轉播風格：`broadcastSolid` 面板、斜標籤「下一場」）：賽道名、一則技巧提示（駕訓班的 `kart.school.tip.*`，照玩家的按鍵；觀戰沒有）、進度條（`role="progressbar"`）與百分比；房間裡多一行「等大家到起跑格（n／m）」。失敗時顯示錯誤、「重試」（只重抓還沒到的）與「重新整理頁面」。字串在 `shared/kart/i18n.load.ts`（併進 `KART_MESSAGES`，載入畫面自己也註冊，因為觀戰不帶卡丁車的整包字串）。`data-testid="kart-loading"`、`data-percent`、`data-failed`。
- **預先下載**：等待室的「車款與車手」（`RoomGarage`，多了 `track` prop，`WaitingRoom` 傳房間的賽道選項）在選定賽道後背景下載那場比賽（引擎、場景、座位上選的車、歌）；比賽結果的換車面板同樣；大獎賽（`CupView`）在每場之前的卡片下載這一場，比賽中下載下一場。
- **房間首屏**：`KART_RADIUS`（`shared/kart/kartRadius.ts`）、`CELEBRATE_SECONDS`（`src/kart/race/celebrate.ts`）、`shotsAt`（`shared/kart/replayShots.ts`）搬成葉子模組，首屏不再帶物理與導播。
- **預算腳本**：`npm run budget` 多三種 `info` 行（不設上限）：`/kart` 首屏、比賽引擎、每張賽道專屬場景的大小。

### 4.55 路線圖外：大廳「跟電腦玩」一鍵開局（2026-11-21，`feat/lobby-quickplay-pwa`）

擁有者 2026-11-21「繼續開發」。以前一定要湊人；現在桌遊有電腦玩家（§4.49）、卡丁車有對戰電腦與駕訓班，所以大廳首頁多一塊「跟電腦玩」：一個人、一下就開局。

- **協定**：`POST /api/rooms` 多一個選用的 `bots: { count, level }`（`shared/protocol.ts` 的 `CreateRoomRequest`／`QuickBots`）。`shared/games/quickBots.ts` 的 `parseQuickBots(module, raw)` 檢查：遊戲要有 `bot`（房間在 DO 裡下的那種；卡丁車的電腦車是房主瀏覽器跑的，不收）與 `bots`；`level` 在 `bots.levels`；`count` 是正整數，加上那一個人在 `[minPlayers, maxPlayers]` 之間、不超過名字數。不合就 **400 `bad_bots`**（不默默丟掉）。帶 `bots` 的房間一律私人（`public` 被忽略）。**速率限制不變**：一鍵開局就是一個 POST，照樣算進每位址每分鐘的建房上限（2026-11-22 起 10 間；`tests/worker/abuse.test.ts`）。
- **RoomDO**：`RoomHost.create(..., bots)` 建房時就把電腦放進座位 1..count（名字照 `bots.names` 的順序，`newBot` 與等待室的「加電腦玩家」共用），`RoomRecord.startOnJoin = true`。第一個加入的人照舊成為房主、坐 0 號，`join` 在 `welcome` 之後**以房主身分**走 `beginFromSeats`（同一套檢查：人數、遊戲暫停）；旗標用完即刪、跟著存檔，所以只會開一次，之後進來的人是旁觀。遊戲被擁有者暫停時留在等待室、房主收到 `game_disabled`，恢復後自己按開始。`RoomDO.webSocketMessage` 在 `startsOnJoin()` 時把 `join` 也當成會開局的訊息，先讀暫停清單（§e12-t11）。
- **大廳**（`src/components/QuickPlay.tsx`，自己的 lazy chunk，首屏之後才載）：英雄區下面、遊戲卡片上面。列出 `LOBBY_GAMES` 裡 `meta.computer` 的桌遊（新遊戲加了 `computer: true` 就自動出現），每格「你和 N 位電腦玩家」＋「立刻開玩」；N＝`quickBotCount(meta)`＝`max(1, minPlayers − 1)`。難度是區塊上方的分段切換（簡單／普通，預設普通）。卡丁車兩格直接導到 `/kart?bots`（`KartPlay` 讀一次就從網址拿掉，`SpikePage` 以 `openBots` 開在對戰電腦設定）與 `/kart?school`。沒有暱稱時先跳暱稱框，再建房（和「建立房間」同一條路）。格子裡的遊戲名**不是標題**（`<p>`），因為測試與巡檢用 h3 找遊戲卡片。
- **遊戲卡片**多一個「可以跟電腦玩」標籤：`meta.computer` 或有 `tryAlone`（卡丁車）的卡片。
- **首屏**：主站 99.9 → 101.0 kB（字串、卡片標籤、service worker 註冊與更新提示的 hook；`QuickPlay`、`UpdatePrompt` 不在首屏）；`QuickPlay` 約 1.3 kB gzip 在首屏之外。
- **測試**：`tests/games/quick-bots.test.ts`（每款 `computer` 遊戲的預設請求都合法、別的都不合法；每個難度與人數的邊界；格式）、`tests/worker/rooms.test.ts`（交給 DO 的參數、強制私人、各種不合法 400）、`tests/worker/room-table-bots.test.ts`「a room opened with computer players」（座位、加入就開局、只開一次、hibernation、暫停時留在等待室、房主重連不重開、卡丁車不收、一局玩到底）、`e2e/quick-play.spec.ts`（手機一鍵德州撲克到發牌、不在公開房列表、卡片標籤、卡丁車兩格）。


### 4.55b 「跟電腦玩」自選數量與各自難度（2026-11-22，`feat/table-bots-many`，#147）

擁有者 2026-11-22：「其他遊戲添加電腦你也要給多電腦模式，比如德州撲克目前只能加1個電腦。」§4.55 的一鍵開局只給 `max(1, minPlayers − 1)` 個電腦（德州撲克 1 個）。

- **數量**：`shared/games/quickBots.ts` 的 `quickBotRange(meta, names)`＝最少 `max(1, minPlayers − 1)`、最多 `min(maxPlayers − 1, 名字數)`；`quickBotCount(gameId, meta)` 是每款的預設（德州撲克 5，陞官圖、滬尾商行、社辦牌陣、朝堂暗鬥、奪祕笈、芥末餃子 3），夾在範圍內。大廳每格多一個「− N ＋」。
- **難度**：分段切換多一個「各自選」：每格出現每個電腦一顆小鈕（「1 普通」），點一下換下一個難度。請求變成 `bots: { count, level, levels }`，`levels` 一個電腦一個、照座位順序；`parseQuickBots` 檢查長度等於 `count`、每個都在 `bots.levels`，不合就 400 `bad_bots`。`RoomHost.create` 用 `quickBotLevel(bots, i)` 給第 i 個電腦難度。伺服器的人數上限本來就是座位數 − 1（不用放寬）；速率限制不變（一鍵仍是一個 POST）。
- **等待室**：`TableBots.tsx` 多「空位全部坐滿（N）」，送 N 個 `add_bot`（房間照舊一個一個放進最低空位，超過的回 `seat_taken`）；七款都能加到滿座（`MAX_MEMBERS` 64 遠大於座位）。
- **測試**：`tests/games/quick-bots.test.ts`（範圍、預設、`levels` 格式）、`tests/components/QuickPlay.test.tsx`（預設 5、1 到 8、各自選）、`tests/worker/room-table-bots.test.ts`「one person and a full table of computers」（七款各一人＋滿座電腦、難度交錯，房間下完一局；等待室加到滿、多的兩個被拒）、`e2e/quick-play.spec.ts`（手機一鍵德州撲克 5 個電腦開局、桌機 8 個電腦各自難度）。
### 4.56 路線圖外：PWA 的快取與新版本提示（2026-11-21，`feat/lobby-quickplay-pwa`）

`e7-t09`（#48）已經有 manifest、圖示、只回離線頁的 service worker 與安裝提示。這批把 service worker 改成「App 殼＋靜態資產」快取、加上新版本提示，安裝提示可以關。

- **service worker 由 build 寫出**：原始碼在 `scripts/pwa/sw.js`（不再放 `public/`），`scripts/pwa/serviceWorker.ts` 的 Vite 外掛在 client build 的 `generateBundle` 把 `VERSION`（所有輸出檔名的 SHA-256 前 12 碼，檔名本身帶內容雜湊）與 `SHELL`（入口 chunk、它 import 的 chunk 與 CSS、兩個語言 chunk）填進去，輸出 `/sw.js`。沒有用 `vite-plugin-pwa`：要的只有這兩個值，手寫零相依、首屏零成本；`vite.config.ts` 只多一行（和 `feat/kart-lazy-chunks` 的 chunk 設定不衝突，shell 是照 bundle 算的）。
- **快取策略**：頁面（navigate）**永遠走網路**，只有完全沒網路時回離線頁，所以新部署一載入就是新版；`/assets/*`（雜湊檔名，一個名字永遠是同一個檔）cache-first，第一次用到就留下，安裝時先留 shell；只留 `ok`、同源、不是 HTML 的回應（舊部署的檔案被 SPA fallback 回成 index.html 時不會被當成 JS 存起來），有 `Range` 的請求不碰。`/api/*`、`/ws/*`、非 GET、別的網域（Google Fonts）**完全不攔**。快取名 `tku-arcade-<VERSION>`，新版接手時刪掉舊版（含 e7-t09 的 `tku-arcade-offline-v1`）。
- **離線頁**：Cloudflare 把 `/offline.html` 307 轉到 `/offline`，被轉址的回應不能拿來回應導覽（e7-t09 起離線頁其實一直出不來：`ERR_FAILED`）。現在安裝時讀完再以 `/offline.html` 重新存成一個沒轉址的回應，**保留站上原本的安全標頭**（CSP）。離線頁的「再試一次」從 inline `onclick`（CSP 本來就擋）改成連到同一網址的連結。
- **更新**：`installApp.ts` 用 `updateViaCache: 'none'` 註冊；頁面回到前景且距上次檢查超過 10 分鐘就 `registration.update()`。新版裝好會**等待**（不自動 `skipWaiting`），頁面看到 `waiting` 且已有 controller 時顯示「淡江遊樂場有新版本了 · 重新整理／稍後」（`UpdatePrompt.tsx`，lazy，只有有新版時才載），按重新整理 → `postMessage('skip-waiting')` → `controllerchange` → 重新載入。關掉所有分頁也會換新。因為頁面永遠從網路拿，就算沒按也不會卡在舊版：重新整理就是新版；協定版本不合（4400）時原本的「重新整理」提示照舊有效。
- **安裝提示**（`InstallApp.tsx`）：多「不用了」，記在 `localStorage` 的 `tku-arcade.installHint`；Android 上沒有 `beforeinstallprompt` 的瀏覽器顯示「從瀏覽器選單安裝」。manifest 的 `name` 改成「TKU Arcade 淡江遊樂場」（主畫面用 `short_name`「TKU Arcade」）。
- **CSP 不變**：`worker-src 'self'`、`manifest-src 'self'` 本來就有；service worker 自己的 fetch 也受同一份 CSP（`connect-src 'self'`），所以它只碰同源請求。
- **測試**：`tests/pwa.test.ts` 在假的全域、Cache Storage 與網路上跑真的 `sw.js`（安裝留下 shell 與離線頁、離線頁不是轉址且帶 CSP、只在頁面說的時候接手、舊快取刪掉、API／WebSocket／POST／別的網域不碰、頁面永遠走網路、雜湊檔第一次之後從快取、錯誤與 HTML 不留、Range 不碰），外掛的 shell、版本與範本；`e2e/pwa.spec.ts`（manifest 與圖示可讀、註冊、快取內容、離線頁與 0 個 CSP 違規、再試一次回到大廳、API 不經 service worker；只有 build 出來的站有 service worker，dev server 上跳過）。更新流程在 `vite preview` 手動驗過（兩次 build 之間要重開 preview：它的資產 etag 是開機時算的，同一個 preview 裡 `sw.js` 換了也回 304）。

### 4.57 路線圖外：同一條起跑線（2026-11-21，`feat/kart-room-lobby`）

擁有者：「賽道不要這樣有人前後，不公平，一開始就全部車要在同一起跑線上。」起跑格從「兩兩一排往後排」（竿位線後 10 m、最後一排 34.5 m）改成**一排並排**，全部在線後 10 m：`shared/kart/startLine.ts` 的 `lineGrid(centre, width)`，間距依路寬（≤ 4 m、≥ 3.2 m）、從中間往外排、太窄時鋸齒（內建與編輯器賽道都用不到）。手畫賽道、老街、測試橢圓、編輯器都改用它。計時賽另有 `TrackJson.solo`＝舊竿位，所以紀錄、鬼影、`revision` 不動；倒數鏡頭依排寬退後。細節與測試在 `KART-NETCODE.md` §20。

### 4.58 路線圖外：卡丁車等待室（2026-11-21，`feat/kart-room-lobby`）

擁有者：「進入遊戲大廳介面要……可以看到每個人角色正面還有開什麼車，還有背景圖案，還需要按準備。」只改卡丁車房；桌遊的等待室不動。

- **進入點**：`WaitingRoom.tsx` 在 `gameId === 'kart'` 時改畫 lazy 的 `src/kart/lobby/KartLobby.tsx`（自己的 chunk；房間首屏不變）；右欄的邀請、密碼、遊戲與規則、解散、聊天照舊，由 `WaitingRoom` 傳進去（`side`）。外層留 `data-room-columns`，頁面寬度規則不變。
- **出賽陣容**：8 格（640 px 以上 4×2、以下 2×4）。每格：號位、房主皇冠、電腦／難度標籤、「你」、隊色（團隊賽，`assignTeams` 與開賽時同一套分法）、車手**正面**的 3D 小圖、名字、車款與車手、車系與等級、大字狀態（準備完成＝綠色亮框；房主；還沒準備；離線）；房主看得到踢出／轉移房主／移除電腦。空位顯示「空位」、入座，房主在**第一個**空位有「加電腦車」（房間就是放在那裡）。手機上準備／開始列放在陣容上面。
- **3D 小圖只有一個 WebGL context**（`lobbyStage.ts`，three.js 在卡片出來後才 lazy 載入）：一個不在頁面上的 renderer 輪流畫每一格（220×180、pixel ratio ≤ 1.5），畫完 `drawImage` 到該格自己的 2D canvas。桌機每 33 ms 畫全部可見的格、手機（粗指標或寬 < 700）每次兩格；不在畫面內（IntersectionObserver）或分頁隱藏就不畫；`prefers-reduced-motion` 每格只畫一次、靜止。鏡頭在車前方左右緩慢擺動；車手用 #117 的動作：平常 `idle`，按下準備那 2.2 秒 `cheer`。沒有 WebGL 時格子照樣有文字與車色光暈，只是沒有圖。
- **背景**（`LobbyBackdrop.tsx`）：程式畫的 SVG，依賽道主題（`src/kart/art/themeName.ts`，`trackArt.ts` 的 `themeOf` 也改讀它）用該賽道的天空色、太陽或月亮、夜晚星星與窗燈、白天雲；山稜與天際線形狀由賽道 id 決定（同一張賽道每次一樣）；賽道俯視輪廓在下方發光。換賽道就換。顏色在 `kartTokens.ts` 的 `kartLobby`。
- **賽道卡**（`TrackCard.tsx`）：名稱、俯視小地圖（含起終點線與線上 8 個點）、圈數、模式、賽制、「所有車並排在同一條起跑線上出發」。賽道 JSON 從 `tracks/registry.ts` 的 chunk 來（比賽本來就要）。之後若車庫有「推薦車款」可以加在這裡。
- **準備**：非房主有「準備／取消準備」（`aria-pressed`）；房主的「開始遊戲」在有人沒準備時 disabled，下面寫「等 A、B 按準備」（`Intl.ListFormat`）。規則在伺服器（`KART-NETCODE.md` §20）：`GameMeta.readyCheck`、`not_ready`、斷線清準備；換車保留準備。`readiness.ts` 的 `waitingOn` 與 `worker/room-host.ts` 的 `notReady` 同一個判斷。
- **車庫**：「車庫」按鈕開 `Dialog`，裡面是原本的 `RosterPicker`＋`KartPreview`（車庫開著時才多一個 WebGL context）。選車的同步改成 `src/kart/roster/useRoomLook.ts`，車庫關著也照樣告訴房間。賽後的車庫（`KartScreen.tsx`）照舊用 `RoomGarage.tsx` 的預設匯出。
- **測試**：`tests/kart/lobby.test.tsx`（8 格、狀態、皇冠、電腦、加電腦只在第一個空位、開始要等準備、準備／取消、賽道卡、背景主題）、`tests/worker/room-bots.test.ts`「the race room waits for everyone to be ready」（`not_ready`、換車保留、取消、斷線清掉、踢掉後可開、桌遊不受影響）、e2e `kart-race`／`kart-team`／`kart-editor`／`kart-loading`（Bob 按準備後才開始）。

### 4.59 路線圖外：賽道特性決定最快車、賽季旗艦（2026-11-21，`feat/kart-meta-flagship`）

擁有者要「每個時期一台公定最快的車」，以及「哪一台車跑哪一張圖最快，分上下坡、急彎、直線」。完整數字在 `KART-META.md`。

- **坡道上的重量**（`shared/kart/terrain.ts` 的 `slopeWeight`、`TERRAIN_TUNING.slopeMass*`）：坡度超過 3% 的部分，極速再變動 5 ×（質量 − 1）× 超過的坡度（±6% 封頂）。`applyKart` 把 `kartMass` 放進 `KartTuning.mass`（和 `bodyRadius` 一樣，調參面板不顯示也不存）；標準重量不放，所以標準車與平面賽道一個 bit 都沒變（`flatGolden`、`branchGolden` 原封不動，`revision` 不動）。只算陡的部分，是因為閉合賽道爬升＝下降，正比於坡度的效果整圈抵銷。
- **賽道特性與矩陣**（`scripts/kart/meta.ts`，純函式）：`trackTraits`（急彎數／km、直線比例、最長直線、爬升、上下坡比例與平均坡度）、`raceMatrix`（每格九場的中位數）、`ranking`、`podiums`、`winCounts`、`without`、`fairness`（旗艦以外沒有一台在每張或過半的圖第一）、`flagshipLead`。`npm run kart:meta`（`scripts/kart-meta.ts`）每張賽道開一個子行程平行跑。
- **推薦是靜態的**（`shared/kart/meta.ts` 的 `TRACK_META`：前三名＋特性標籤）：車庫（`RosterPicker` 的 `track`，`/kart` 與等待室都傳）、`/kart` 的賽道選單、對電腦的設定面板顯示。比賽要跑幾分鐘，所以測試只擋資料形狀。
- **賽季**（`shared/kart/karts.ts`）：`KART_TIERS` 多 `flagship`；`KartSpec.season`；`KART_SEASONS`（每季的旗艦與退役後的等級／數值／倍率）、`CURRENT_SEASON`、`inSeason`（`kartSpec` 都經過它：過季的旗艦換成退役版）、`seasonFlagship`、`isFlagship`。沒有時間機制，換季是一次發版。
- **黑鳶 `kite`**：`KART_IDS` 第 21 個（loadout byte 5 bit，可到 32）；數值超出預算，代價是 `FLAGSHIP_TRAITS`；`speedCapFor` 讀它的參數，所以伺服器上限自動包含。造型 `src/kart/art/flagshipBodies.ts`，新的 lazy 家族 `flagship`（`bodyLoad.ts`），色票 `kartBodies.kite`，標誌在 `kartModel.ts` 的 `MARKS`。
- **測試**：`tests/kart/slopeWeight.test.ts`（重量與坡道）、`tests/kart/meta.test.ts`（矩陣純邏輯、賽道特性、靜態推薦的形狀與公平、賽季與退役）、`tests/kart/flagship.test.ts`（頂尖腳本在漁港開旗艦比白鷺快、新手在山城開雨燕比旗艦快、速度上限）；`karts.test.ts` 的預算與極速 3% 規則改成只管非旗艦車。

### 4.60 路線圖外：挑戰模式（計時獎牌與任務關卡）（2026-11-21，`feat/kart-challenges`）

擁有者 2026-11-21：「要多設計多一點有挑戰性的關卡」；之前也要實力鑑別度、背地圖、反直覺技巧（`KART-FEEL.md` §11、§14）。這一批做「挑戰」模式（暫名）：每張賽道的**計時獎牌**與 24 個**任務關卡**，外加兩張只在挑戰模式出現的原創短賽道。程式全在 `src/kart/challenge/`（自己的 lazy chunk），共用檔只有小插入。（§4.57、§4.58 是同一天平行的 `feat/kart-room-lobby`，§4.59 是 `feat/kart-meta-flagship`。）

**入口**：`/kart` 選單多一顆「挑戰」（`SpikePage` 的 `onChallenge`）；`KartPlay.tsx` 多一種 `Playing`（`challenge`），lazy 載入 `ChallengeView.tsx`。網址 `/kart?challenge`（任務列表）、`?challenge=medals`（獎牌牆）、`?challenge=<任務 id>`、`?challenge=medal-<賽道 id>`，重新整理停在原地；`?autopilot` 讓頂尖駕駛（`drivers.ts` 的 `master`）來開（e2e 與展示）。

**任務**（`missions.ts`）：每關一張賽道＋一個條件，四章（入門、技術、高手、魔王）各 6 關；前一章過 4 關（`UNLOCK_PASSES`）下一章才開（`store.ts` 的 `chapterOpen`）。條件種類（`MissionKind`）：`finish`（跑完，加規則）、`combo`／`perfects`／`driftJumps`（連段長度、完美瞬間加速次數、甩尾起跳次數，圈數內達到）、`slots`（每圈依序穿過導引的每道門）、`branches`（每圈走遍每條真岔路）、`cover`（全程加速覆蓋率 ≥ N%）、`place`（對電腦前 N 名）、`elimination`（淘汰賽）、`chase`（一對一贏過專家電腦車）。規則（`MissionRules`）：`noCrash`、`noN2O`、`noReset`、`boostStart`；另有 `limit`（時限，**用賽道的獎牌時間換算**：某面獎牌 × 任務圈數／賽道圈數 × slack）、`vehicle`（指定車款，例如摩托車）、`fog`（全程海霧）、`bots`（電腦車數與難度）。反向賽道沒做：跳台與甩尾起跳的落點、導引、岔路都有方向，反過來要重畫，不是資料翻轉。「倒車賽段」也沒做（物理的倒車只是低速後退，沒有可判的賽段）。

**判定**（`judge.ts`，純函式，測試用合成的步驟與房間）：
- 單人任務走時間賽的迴圈（`spikeLoop.ts`）。`spikeLoop` 多三個選填參數：`laps`（這一趟跑幾圈；和賽道圈數不同時不存紀錄、不存幽靈車）、`keepRecords: false`（任務一律不存，免得有限制的成績變成賽道紀錄）、`ghost`（指定一台幽靈車，取代紀錄裡的）。每個物理步經 `onStep` 轉成 `Sample`（多了重設次數與所在岔路 `forkAt`），`judgeStep(mission, judge, sample, context)`：重撞牆（`hit ≥ wallBreakSpeed` 的那一步）、噴 N2O（存量減少且 `boostSeconds > 0`）、重設次數增加、GO 後 `startLate + START_LATE_TELL` 還不是 `start === 'boost'`，都是立即失敗；計數達標立即過關；穿縫沿用駕訓班的 `gateLines` 與 ±5.5 m 判定（`school/judge.ts` 的 `GATE_HALF`），每圈循環；岔路每過一圈檢查這圈有沒有每條都走過（位元）；覆蓋率在終點判；超過時限或比賽結束仍未達標＝失敗，原因留在 `why`。
- 對電腦的任務走對戰電腦那一套（`createLocalRoom`、`createBotRace`、`RaceView`，`mode: 'race'` 不開道具）。`RaceView` 多一個選填的 `onStep`（和教練提示一起掛），用 `ruleBroken` 判 `noN2O` 等規則；名次、淘汰由 `judgeRace(mission, racers, playerSeat)` 從房間的 `lapMs`／`finishMs` 判：`eliminations` 每圈（最後一圈除外）淘汰還在場上最後過線的那台，只剩一台還沒過線時立刻判它出局（不等它真的過線）；`place`／`chase` 在玩家過線時算名次，或已經有太多台先到就提前判失敗；淘汰賽只算還在場上的車。出局的電腦車照樣在跑（只是不算），畫面左上的任務面板列出出局者。起跑格與一般對戰電腦相同：合併 `feat/kart-room-lobby`（§4.57）之後全部車並排在同一條起跑線，所以追逐賽是一對一的正面對決，不再是「追前面的車」；計時賽與單人任務用 `solo` 竿位，獎牌時間不受影響。

**獎牌**（`medals.ts`、`medalTable.ts`）：12 張內建賽道各有銅、銀、金與隱藏的白金（拿到金牌才顯示）。時間是**量出來的**：`npm run kart:medals`（`scripts/kart-medals.ts`）用 `kart:feel` 的駕駛（`average`、`expert`、有導引的賽道再加 `master`）各跑三個種子三圈，`calibrate` 算出：金＝頂尖（每個種子取專家與頂尖較快者）最慢的一場；銀＝max(專家最慢 × 1.01, 金 × 1.04)；銅＝max(一般最慢 × 1.01, 銀 × 1.06)；白金＝頂尖最快 × 0.98；都取到 0.1 秒。接著單人任務各讓頂尖（頂尖過不了的用專家）跑三個種子，最慢的通過秒數寫進 `MISSION_PACE`，星等＝通過時間 ≤ 該秒數 × 1.12（三星）／× 1.35（兩星），有時限的任務兩星要比時限快 3%、三星再快 5%；沒有 pace 的任務（對電腦、沒有駕駛過得了的）用賽道銀牌／銅牌換算。結果寫回 `medalTable.ts`（產生的檔，不手改）。**物理或賽道改了就重跑**（`tests/kart/challenge.medals.test.ts` 會擋：頂尖拿不到金、專家拿不到銀時失敗）。
- **目標幽靈車**：獎牌計時賽可選「跟某面獎牌的幽靈車一起跑」。執行時用頂尖駕駛的手在那張賽道上跑一趟（`headless.ts` 的 `targetGhost`，約一兩百毫秒），再 `retimed` 把整段播放時間縮放成剛好那面獎牌的秒數：路線是頂尖的，速度是獎牌的。不存成靜態資料（物理一改就要重錄）。
- 計時賽本身照常存賽道紀錄與自己的幽靈車（獎牌趟就是一般的三圈時間賽，用標準調校）。

**挑戰專用賽道**（`shared/kart/tracks/challenge.ts`，用 `lay.ts` 鋪，**不在 `RACE_TRACK_IDS`**，房間與對戰電腦選不到；`missionTrack` 認得它們）：針眼巷 `ch-needle`（約 0.9 km、18 m 寬，一個 S、三個連續髮夾、兩道橫跨路面的牆各留一個 9 m 的門，偏左；導引登記在 `guides.ts`，兩條線都穿門）與跳台場 `ch-hop`（約 0.95 km、6 m 落差，三個落差跳台各接一個彎，回程一個長高速彎）。量測：針眼巷頂尖 46.5–48 秒、專家撞第二道牆重設三次（60 秒）、一般 50–59 秒；跳台場專家 55 秒、一般 59–60 秒（`KART-FEEL.md` §19）。

**畫面**（`ChallengeView.tsx`、文字在 `goals.ts`）：首頁兩個分頁：任務（四章、每章過幾關或怎麼解鎖、每關名稱＋目標＋規則＋賽道與圈數、最佳星等、開始）與獎牌牆（12 張賽道的牌、最佳時間、四面獎牌的目標時間、白金未解鎖顯示 ???）。任務中左上是任務面板（章節、賽道、圈數、目標、規則、進度 `count / target`、星等規則），右上重來／所有挑戰；海霧任務整個畫面蓋一層只留前方小窗的霧；對電腦的任務面板放在 `RaceView` 名次下面、多「出局：…」。結果卡：過關／這次沒過、星等、時間或名次、失敗原因（`kart.challenge.why.<原因>`）、下一關（下一章還沒開就不顯示）／再試一次／所有挑戰。賽道名用房間的 `games.kart.track.<id>`（`ChallengeView` 自己註冊 `kartMessages`）。

**首屏**：挑戰的字串併進 `KART_MESSAGES`（和駕訓班一樣，`check-i18n` 才擋得到），房間的卡丁車首屏 137.9 → 139.7 kB（含 #130）（警告線 140 以下）；畫面與判定在自己的 lazy chunk，卡丁車合計 506.2 kB（合併 main 後，上限 600）。

**進度**（`store.ts`，localStorage `tku-arcade.kart.challenge`，經 `lib/storage.ts` 不丟例外，JSON 解析 try/catch，壞資料當沒有）：`medals`（每張賽道最佳獎牌）、`best`（獎牌趟最佳秒數）、`stars`（每關最佳星等）。

**驗證**：`tests/kart/challenge.test.ts`（任務資料：24 關、每章 6 關、每關有名字、對電腦只在比賽賽道；兩張挑戰賽道過 `parseTrack`、不在 `RACE_TRACK_IDS`；判定的每種條件、規則與時限；淘汰順序、名次、追逐；獎牌校準公式、每張賽道銅 > 銀 > 金 > 白金、時限與星等；目標幽靈車縮放；進度存取、壞資料、章節解鎖）、`tests/kart/challenge.medals.test.ts`（河畔、紅樹林、碼頭倉庫：頂尖拿金、專家至少銀、一般至少銅、新手沒有；頂尖過得了七個技術任務且至少兩星；新手過不了甩尾起跳、穿縫、岔路、十連段）、`e2e/kart-challenge.spec.ts`（選單入口、章節鎖、獎牌牆與隱藏白金；`?autopilot` 完成「完美五發」、星等存進 localStorage）。截圖：`scripts/kart-challenge-shots.mjs`（真 GPU）。

### 4.61 路線圖外：房間卡丁車首屏瘦身、單機畫面的字串各自 lazy（2026-11-22，`feat/kart-fixes-budget`）

擁有者 2026-11-22「全照建議」。數字在 `KART-PERF.md` §9。**更正 §4.60 的「首屏」一段**：挑戰的字串併進 `KART_MESSAGES` 不影響房間首屏（`KART_MESSAGES` 跟 `RaceView` 在首屏之後），#131 的 +0.7 kB 是打包器重切共用 chunk。

- **字串**：`KART_MESSAGES`（`shared/kart/i18n.ts`）只放選單與比賽要的；駕訓班 `KART_SCHOOL_MESSAGES`、挑戰 `KART_CHALLENGE_MESSAGES`、編輯器 `KART_EDITOR_MESSAGES` 由 `SchoolView`／`ChallengeView`／`EditorPage` 自己 `registerMessages`（和 `promotion/i18n.sheets.ts` 同一招）。三個畫面以外用到的幾句（`kart.school.open`／`loading`／`invite*`／`coach*`／`tip*`、`kart.challenge.open`／`loading`、`kart.editor.open`／`editCopy`／`badLink`／`untitled`）在 `i18n.menu.ts`。型別 `KartMessageKey` 仍包含全部（只有型別，不進 chunk）；`KART_MESSAGES` 的型別是其中的 `KartBaseKey`。**新增單機畫面的字串**：自己一個 `shared/kart/i18n.<名>.ts`，由畫面登記，列進 `scripts/check-i18n.mjs` 的 `KART_PARTS`（沒列又沒併進 `i18n.ts` 會被擋）；別的畫面也要說的那幾句放 `i18n.menu.ts`。
- **錄影器**（`src/games/kart/useRaceRecorder.ts`）：首屏只有一個殼 `deferredRecorder`，`import('../../kart/watch/raceTape.ts')`（frame 解碼＋`createReplayRecorder`）在掛上時開始；之前的 `heard`／`sent`／`view` 呼叫排隊，到了依序重放。`recorder.hasFrames()` 在 chunk 到之前是 false（結果面板的「看重播」不出現），`recorder.ready` 給測試等。
- **觀戰名次表**：`KartScreen` 的 `Standings` 改 `lazy`（`RaceView`、`BotRaceView` 仍靜態 import，它們本來就在首屏之後）。

### 4.62 路線圖外：名牌貼著車（坡上也是）、三個 e2e 的修正（2026-11-22，`feat/kart-fixes-e2e`，#135）

- **名牌偏在遠方**（#129 預覽截圖）：原因是名牌錨點用固定高度——`netRace.ts`、`SpectateView`、`ReplayView` 都投影 `[x, TAG_HEIGHT 2.4 m, z]`，但車子畫在路面高度上（#94 起坡道賽道，`liftOf` 的 `y`）。12 張比賽賽道裡 8 張有起伏（河濱最高 8.6 m、淡江 10.9、觀音山 17.0、砲台 17.8、大屯 25.0、山城 12.5、廠區 5.0、碼頭 2.0），車在 10 m 高的路上，名牌就投影在車底下 7.6 m 的地方，看起來落在車後方遠處；平地賽道（漁港、老街、紅樹林、淡海）沒事，所以是「有時」。LOD（#124）與非同步車款替換（#128）都沒有問題：遠處簡化車與替換後的車用的是同一個 `group`。修法：`KartScene.tagPoints(ids, above)` 直接取那台車最後畫出來的 `group.position`（含坡道高度、空中、被打中的彈起）再加 `above`；三個地方都改用它。`window.__kartRace.wheels` 給 e2e 每台車輪子的畫面座標；`e2e/kart-hills.spec.ts` 在觀音山整圈比對每個名牌的底邊中點：一定在車輪上方、橫向偏差不超過「3 px＋高度差的 20%」（相機俯角讓垂直線離畫面中心時會斜）。改回舊算法時這支會失敗。
- **`vite preview` 下 3 個「draws a real scene」**（`kart-night` 一個、`kart-spike` 兩個）：測試在頁面裡 `fetch('data:image/png…')` 讀截圖，被正式站 CSP `connect-src 'self'` 擋下（dev server 沒有 CSP 才過）。改成 `atob` 解成 `Uint8Array` 包成 `Blob` 再 `createImageBitmap`，不經過網路；CSP 不動。
- **觸控 844×390 整批跑時逾時**（#131）：是等待條件不穩，不是測試本身慢。`openTrial` 先等 `canvas` 出現（預設 5 秒），但 #128 之後畫布要等載入畫面把引擎 chunk 載完才有；閒置機器約 2 秒，整批跑或機器忙時會超過 5 秒。用 CDP `Emulation.setCPUThrottlingRate` 6 倍重現：舊版在等 canvas 失敗。改成等比賽真的在畫（`__kartSpike.frames > 5`，載入另給 45 秒，且加在測試時限上，測試本身仍是 30 秒）；axe 只掃觸控按鈕與設定面板（掃整頁時軟體 WebGL 每幀在畫，忙的機器上 axe 吃掉大半時限）。6 倍節流下新版通過。

### 4.63 路線圖外：觸控噴射鍵與直拿版面、電腦車看牆與留藍、鍵帽與多支手把（2026-11-22，`feat/kart-polish-2`）

- **觸控「噴射」鍵**（#100）：`src/kart/touch/boostButton.ts` 的純函式 `boostButtonLook(hud, maxStored)` 從 HUD 算出鍵的樣子：`burning`（噴射中：鍵外一圈 conic-gradient 的環隨剩餘時間縮短，`--boost-left` 0–1；字換成「噴射中」小一號）、`ready`、`empty`（沒存量：虛線、變暗）；經典手感一次只能一個噴射，噴射中 `locked` 也變暗。字下面一排小格子是存量（團隊賽藍的在前、其餘紅）。`TouchControls` 多了 `hud`、`maxStored` 兩個 prop，四個比賽畫面（對戰／多人、單機、駕訓、挑戰）都傳。按下的樣子仍是 DOM 的 `data-pressed`，React 重畫不碰它。
- **直拿道具欄回到正中間**（#100）：`ItemSlot` 的 `centred`（比賽頁才開；觀戰與重播仍在地圖左邊空位）：`(max-width: 560px) and (orientation: portrait)` 時 `top: ITEM_SLOT_UPRIGHT_TOP`（136 px，時鐘第二圈起四行也在它上面）、水平置中；`RaceView` 的 `MapCorner`（`$items`）把小地圖移到左邊、道具欄下方（`MAP_UNDER_ITEM_SLOT` 204 px；HUD 的兩塊在右、轉向在左下，那裡是空的），時鐘留在右上。道具賽大字的 `CALLOUT_CLEAR` 跟著改成 136 + 64。`e2e/kart-touch-portrait.spec.ts`：390×844、360×740 繁中，道具賽對電腦（`?autopilot`），道具欄置中且不碰名次、時鐘、小地圖、HUD 的板子與 9 顆觸控鍵，小地圖也不碰；第二圈（時鐘四行）再量一次；噴射鍵出現 `data-boost="burning"`「噴射中」與兩格存量。
- **電腦車看牆**（#100）：`BotSkill.wallCare`（困難 0.3、專家 0.25 秒，經典手感才有）。`brain.ts` 的 `onRoadFor`（從現在的位置、速度沿一條固定轉速的弧線推 8 步，每步找附近的路點看有沒有超過路寬一半減 1.8 m）與 `edgeAhead`（手要開的弧線 0.5 秒，加上七條 ±抓地轉速的弧線 0.8 秒）。甩尾中照實際轉速推 `wallCare` 秒，碰到路緣：已賺到瞬間加速就放，沒賺到就在甩尾裡點煞；抓地時手的弧線碰到就改開撐最久的那條，全部撐不到 0.8 秒就收油、不噴、瞬間加速的再點等一下，0.36 秒內點煞。反打那一下與專家的導引技術路線不改。量測在 `KART-FEEL.md` §13.5（`npm run kart:bots`）。
- **團隊賽留一個存量等變藍**（#102）：`BotSense.teamGauge`（`botRace.ts` 從 `state.teams.gauge[隊] / TEAM_GAUGE.full` 給）、`BotSkill.teamSave`（普通 0.7、困難與專家 0.6）、純函式 `keepsForBlue(stored, blue, gauge, from)`：條到門檻、沒有藍的、只剩一個紅的 → 那一個先不噴。
- **鍵帽與多支手把**（#19）：`devices.ts` 的 `watchKeyLayout`／`useKeyLayout`（`navigator.keyboard.getLayoutMap()`，Chromium、安全頁才有；`layoutchange` 時重讀）與純函式 `keycap(code, layout)`：字母、數字照鍵帽印的字（AZERTY 的 `KeyQ` 是 A）；方向鍵、Space、Shift 這些照位置命名的鍵、數字鍵盤不變；沒有 API 就維持美式位置的名稱。`keyLabel(code, t, layout?)` 預設用讀到的 layout，所以改鍵設定（仍存 `KeyboardEvent.code`，`e8-t12`）不用改；改鍵面板、比賽的道具鍵提示、單機與駕訓的提示都 `useKeyLayout()`，layout 到了重畫。手把：純函式 `pickPad(pads, current)`：最近有輸入的那支開（有按鍵或搖桿超過 0.5 就換到它；正在開的那支有輸入就不換；拔掉就換有輸入的、否則第一支標準配置的），`readGamepad()` 每幀照它挑，所以一台電腦任何一支手把都能開，第二支放在桌上不會搶。用陣列位置而不是 `Gamepad.index` 記（一支手把連著時位置不變）。
- **測試**：`tests/kart/polish2.test.ts`（噴射鍵三種樣子與團隊格子、`keepsForBlue`、各級 `teamSave`／`wallCare` 與腳本駕駛沒有 `wallCare`、`keycap`／`keyLabel` 的 AZERTY 與 fallback、`pickPad`）；`flagship.test.ts` 多擋漁港與老街領先 ≤ 3.5%；`bots.test.ts` 的 rubber band 只數超過速度上限時的收油（看牆的收油不算）。

### 4.64 路線圖外：觀戰與重播直拿版面、陞官圖完整版首屏離開警告區、lint 警告（2026-11-22，#142，`feat/kart-watch-portrait-promotion-lazy`）

- **觀戰與重播直拿**（#140 回報沒做的那半）：`WatchParts.tsx` 新 `WatchTop`，包住 `TopLeft`（看誰、名次、團隊分數、重播的提示）、`WatchedItem`、`MapCorner` 三塊。寬螢幕它是 `display: contents`，三塊照舊各自定位（畫面不變）；`(max-width: 560px) and (orientation: portrait)` 時它變成貼左上的一欄 grid：面板、道具欄（`justify-self: center`，水平置中）、小地圖（靠左），三塊改 `position: static`，所以面板再多幾行（重播的道具提示、團隊賽）也不會蓋到道具欄或地圖。`ItemSlot` 的 `Dock` 多 `data-item-dock`，`WatchTop` 用它把道具欄的絕對定位與 `translate` 拿掉。`SpectateView`、`ReplayView` 共用。
- **e2e**：`e2e/kart-watch-portrait.spec.ts`：960×600 跑一圈道具賽對電腦（`?autopilot`），存成重播檔，用 390×844、360×740 繁中打開：道具欄水平置中（±6 px）、小地圖在左半、在道具欄下方、三塊互不重疊也不蓋「關閉」鍵；附截圖。觀戰（`SpectateView`）用同一個 `WatchTop`，沒有另寫直拿 e2e（`kart-race.spec.ts` 照舊驗觀戰）。
- **陞官圖完整版首屏 146.2 → 139.7 kB**（zh-TW，上限 150、警告區 140 以上）：畫圖版的元件 `FullBoard.tsx` 與點名格子的句子 `fullWords.ts`（擲骰結果、這一手做了什麼、座位的官職）本來就要等圖版資料（C8 起資料在首屏之後載），所以改成和資料一起載：`fullData.ts` 的 `loadFullData` 多 import 這兩個，`FullData` 多 `view`、`words`；畫面寫 `data.view.FullBoard`、`data.words.turnSentence(...)`。不需要資料的（每人銀兩、轉帳、出身、功名：`beforeTransfers`、`transferText`、`householdText`、`degreeText`）搬到新的 `fullMoney.ts` 留在首屏，`fullWords.ts` 照舊轉出（測試不用改）。資料到之前圖版位置本來就是「正在畫圖版」，所以畫面不變。簡化版 144.3 kB 沒動（仍在警告區）。
- **`check-budget.mjs`**：一個畫面「首屏之後才載」的東西，改算它自己（和它靜態 import 的、不含入口與房間頁）的全部動態 import。以前只看畫面 chunk 本身的動態 import，所以 `fullData.ts` 載的 `fullSquare.ts` 被當成一款「遊戲」多印一行；現在它和 `FullBoard`、`fullWords` 都列在完整版的「after the first paint」（32.4 kB，不限）。
- **lint**：`tests/worker/room-robustness.test.ts` 的兩個 `no-unsafe-optional-chaining`（`game?.view as …` 再取 `.you`）改成 `game!.view`；`npm run lint` 0 警告。

### 4.65 路線圖外：會動的障礙物（升降閘門、滑動貨櫃）、閘門巷（2026-11-22，`feat/kart-track-content`）

擁有者 2026-11-22「全照建議，繼續」：`NEXT.md` §5 的賽道內容（#103）。手感、數字與試玩清單在 `KART-FEEL.md` §20、裁定在 `KART-NETCODE.md` §21；這裡記程式怎麼做的。

**格式與狀態**（`shared/kart/obstacles.ts`，新；純函式，瀏覽器、Worker、壓測共用）

- `TrackJson.obstacles?`：`boom`（升降欄杆：主路路點 `at`（可帶小數）、關住 `from`–`to`（中心線右邊幾公尺）、`period`／`shift`／`closed`／`warn`，單位都是 1/60 秒的步）與 `slider`（滑動貨櫃：沿路 `length`、橫向 `size` 的盒子，中心在 `a` 與 `b` 之間來回；`move` 步滑過去、`warn` 步預告）。`parseObstacles`（`parseTrack` 在主路之後叫）一次列出全部問題：欄杆在路緣內（最多超出 1.5 m）、至少 3 m 長；週期 1–60 秒、關至少 0.5 秒、預告至少 0.5 秒、開至少 0.5 秒；貨櫃 2–20 × 2–16 m，**離路緣永遠 ≥ `SLIDER_KERB_GAP` 3 m**（被推過去的車夾在貨櫃與路緣之間還放得下，不會卡死）、偶數週期、滑動與預告各 ≥ 0.5 秒。最多 16 個。沒有 `obstacles` 的賽道解析出來一個欄位都沒多（`branchGolden` 擋）。
- **狀態是比賽時鐘的純函式**：`boomState(json, tick)`／`sliderState(json, tick)` 只看 `tick`（GO 起算的步數，`net.ts` 的 frame 本來就帶），所以每個瀏覽器、伺服器的裁定、重播、幽靈車算出同一個狀態，**不需要多送任何東西**。欄杆在 `closed` 那段是牆；`shut`（0–1）是畫面上手臂放下的程度：預告的最後 18 步放下、打開後 30 步抬起，**牆只在關著的時候存在**。貨櫃在兩端停 `period/2 − move` 步、中間用 smoothstep 滑。
- `obstaclesOf(track)` 把每個放到路上（中心、方向、半寬、欄杆的線），每份 JSON 算一次（WeakMap）；`courseOf` 放進 `Course.obstacles`。

**物理**（`course.ts`、`timeTrial.ts`）：`stepRun` 多第六個參數 `tick`。給了、而且賽道有障礙物時，固定的牆撞完之後再對 `obstacleWalls(obstacles, tick)`（關著的欄杆一條線、貨櫃四面、`top` 2.6 m）做一次 `collideWalls`，撞擊力道與接觸取兩次的大者。`stepTrial` 比賽中傳 `trial.steps`；倒數、終點後、沒有時鐘的跑法（編輯器試跑、測試場）不傳，所以**沒有障礙物的賽道與沒有時鐘的呼叫一步都沒變**（`flatGolden` 擋；漁港的那兩條改用拿掉障礙物的同一張圖）。貨櫃往車移動時，`collideWalls` 把車從它所在的那一面推出去，速度不給；貨櫃每步最多移動約 0.13 m，遠小於車的半徑，不會穿過。

**伺服器裁定**（`race.ts` 的 `judgeFrame`）：一般的移動（非重置、非重新同步）多一關 `throughObstacle(obstacles, last, last.tick, frame, frame.tick, airborne)`：(1) 欄杆在兩個 tick **都關著、而且兩者之間一直關著**（關的那段是週期裡連續的一段，沒有繞過週期），移動線段穿過欄杆的線 → `refused('obstacle')`；剛好在這段之間放下或抬起的，給客戶端好處。(2) frame 的位置在貨櫃（那個 tick 的位置）裡面超過 `SLIDER_JUDGE_INSET` 0.6 m（碰撞推擠可能讓車陷一點）→ 同樣拒收；在空中（`FLAG_AIRBORNE`）的不算。拒收的效果和其他拒收一樣：伺服器停在上一個位置，不數門，連續拒收 `RESYNC_AFTER_MS` 後重新同步。**協定、frame 格式、`PROTOCOL_VERSION` 都沒動**。

**電腦車與駕駛**（`src/kart/bots/obstacleSense.ts`，新；`brain.ts` 沒動）：`withObstacles(brain, track, tuning)` 包在 `createTrackBrain` 的輸出外（沒有障礙物的賽道原樣回傳），所以電腦車、`kart:feel` 的駕駛腳本、`?autopilot`（`race/autopilot.ts` 的 `createAutopilot`，房間與壓測機器人都用它）都會。每一步找前方最近、還沒過的一組障礙物（同一個位置的兩支半邊欄杆算一組；只看朝著路方向的車；看 70 m 或 2.2 秒），用現在的速度（至少 9 m/s）估到達的步數，`freeAcross` 算到達前後（早 12 步、晚到「通過自己長度＋14 步」）**任何一步**有東西擋住的範圍，加上車半徑＋1 m，剩下的就是可以走的。(1) 預計的橫向位置在可以走的範圍裡：遠的照原本的手開，14 m 內自己把車夾在那一段裡、不甩尾；10 m 內「出發」（`committed`）：之後只看接下來 20 步，油門不放。(2) 不在：轉向最近的可以走的一段（換車道、繞過貨櫃），太斜就收油、太陡且快就煞。(3) 都擋住（全路面的閘門）：照剩下的距離煞車，停在 3.5 m 前等，等的時候不按重置。在貨櫃旁邊沒有更好的路線就直直往前開。**保險**：被自己的手停住超過 4 秒就把這一組交還給原本的腦（它會重置），避免任何誤判卡死。

**畫面與聲音**（`src/kart/art/obstacleArt.ts`，新；`obstacleCues.ts`，新）：同一種零件一個 `InstancedMesh`（柱、燈箱、紅白條紋手臂、紅燈、綠燈、停止線、軌道、黃色台車、貨櫃、琥珀色旋轉燈），一條賽道的障礙物總共約 10 個 draw call。手臂從路緣外的柱子伸出（全路面的從兩邊各伸一支、中間相接），照 `shut` 轉（`Euler` 順序 `YZX`）；兩顆紅燈在預告與關閉時輪流閃（每 14 步換一次），開著時亮綠燈；停止線在欄杆前 2.2 m。貨櫃每 2.6 m 一個、顏色輪流，預告與滑動時頂上琥珀燈閃。顏色在 `kartTokens.ts` 的 `obstacleScene`。`TrackArt.clock(tick)`／`KartScene.clock(tick)`：`spikeLoop.ts` 每幀用比賽時鐘（`trial.steps` 加上內插的小數；倒數時 0；終點後照幀繼續走）、觀戰用房間的 GO（減 0.1 秒內插延遲）、重播用播放頭的 tick（`WatchFrame.tick`）。聲音：`obstacleCues`（純函式）在車前方 110 m 內的欄杆開始預告時、與預告／關閉期間每 24 步響一次平交道鈴（兩聲叮），貨櫃預告開始時響兩聲低音喇叭（`itemSounds.ts` 的 `bell`、`horn`，WebAudio 合成）。

**賽道**：**漁人碼頭 `harbour@13`**：碼頭直線上兩台滑動貨櫃（路點 44、53，12 × 6.1 m，一台停左邊時另一台停右邊，要蛇行；6 秒一輪），山腳下往西的直線上一組平交道（路點 346.5，左右兩半各一支欄杆，左邊放下 2.5 秒、再換右邊，**永遠有一半開著**，8 秒一輪；右半邊過去正好接那條加速帶）。**閘門巷 `ch-lock`**（挑戰專用，`tracks/challenge.ts`，約 0.8 km、26 m 寬）：第一條直線一道**全路面**的閘門（每 5 秒關 2 秒、預告 1 秒：要等或抓時機）、背直線一台滑動貨櫃、回程一組平交道。挑戰模式加兩關：技術章「看準閘門」（閘門巷 2 圈、不能撞牆）、高手章「閘門衝刺」（3 圈、不能重設、金牌 × 1.04）。

**測試**：`tests/kart/obstacles.test.ts`（新）：狀態是時鐘的純函式且每週期重複、預告與手臂動畫的時間、只在關閉時有牆；格式檢查（九種錯誤一次列出）、貨櫃離路緣、障礙物離復位點與起跑格 > 8 m；關著的欄杆擋住車、開著或沒有時鐘時穿過、沒有障礙物的賽道給不給時鐘一步都一樣、貨櫃推車不穿；裁定：一直關著的穿越拒收、開著或剛好在變的時候採信、在貨櫃裡拒收（空中不算）、**普通與專家電腦車在閘門巷與漁港跑完的每一個 frame 都被伺服器採信**；四級電腦車各三個種子跑完閘門巷三圈不逆走、零穿越、復位 ≤ 1；專家在第一圈的閘門前停下等、抬起後才過；困難電腦車在漁港零碰撞；`freeAcross`；`createAutopilot` 跑完閘門巷零復位；手臂的配置；鈴與喇叭的時機。`bots.test.ts` 的四級三圈（含漁港）照舊；`challenge.test.ts` 26 關（各章 6／7／7／6）、閘門巷有獎牌。

**限制（照實寫）**：(1) 道具（投擲物、雲、陷阱）不認得障礙物，會穿過欄杆與貨櫃。(2) 編輯器做不出障礙物（`TrackSpec` 沒有這一項）。(3) 欄杆是一條沒有高度的線：飛在空中也飛不過（貨櫃有 2.6 m 的 `top`）。(4) 電腦車的判斷用「現在的速度」估到達時間，加減速很大時偶爾會擦到（最差的是新手腳本）；困難以上在測試的種子都沒碰到。(5) 觀戰畫面的障礙物照房間時鐘、別人的車是內插過的，網路很差時兩者可能差一點點。(6) 小地圖沒有畫障礙物。

### 4.66 路線圖外：立體交叉、傾斜彎、車撞車看高度、重播與幽靈車的「在空中」、編輯器的新片段、技術展示賽道（2026-11-22，`feat/kart-track-format-v2`，#94、#103、#113）

- **立體交叉**（`shared/kart/levels.ts`）：主路的中心線可以在平面上跨過自己（8 字）。`findCrossings(road)` 找出所有不相鄰線段的交點（從線段起點算、不含終點，交在路點上的只算一次），每個交叉記上下兩段的線段號、兩邊高度、交角與「區」半徑 `reach = ((wA + wB)/2 + 8) / sin(交角)`。合法條件：交角 ≥ 30°、兩段沿路相隔 ≥ 3 倍 `reach`、區內兩條路面重疊的每一對路點高度差 ≥ `LEVEL_CLEARANCE` 6 m、最多 4 個、區不互相重疊、區內不傾斜。`parseTrack` 在一切其他檢查都過了才找交叉；有交叉時**區內不准有任何只看平面的東西**：閘門（含端點附近 3 m）、復位點、起跑格與單人起點（10 m）、跳台唇（區外再 60 m，飛出去一定落在自己的路）、加速帶、道具箱、沒有 `base` 的牆、分支。所以伺服器裁定（`race.ts` 的 `judgeFrame`、`course.ts` 的 `passGates`，只看 x、z）**一行沒改仍然完全正確**：區外兩條路不重疊，區內沒有閘門。舊賽道沒有交叉，`Track.crossings`、地形的 `crossings`／`halves` 都不存在。
- **車在哪一條路上**：不是最近點，是「上一步的高度＋連續性」。`terrain.ts` 的 `groundAt(terrain, x, z, near)` 在區內（`groundOnLevels`）取「車在裡面（或離路緣 3 m 內）的那些路段」中，路面不高於 `near + LEVEL_STEP`（2 m）的最高者；`near` 是車上一步的 `y`（物理每一步都傳：`stepOnTerrain` 用 `state.y`、`settleTerrain` 用 `after.y`），所以在高架上的車一直在高架、地下道裡的一直在地下道，空中落下落在下方最近的路面；沒有 `near` 時取最低（只用在畫地面）。同一層裡再取最深的線段（坡度才對）。只看平面座標的東西用同一個原則：`nearestRoadPoint(road, x, z, y)`／`placeOnTrack(…, y)`（逆走、電腦車、自動駕駛）在 `rememberLevels` 登記過的路（`parseTrack` 與 `routeRoad` 登記）上加 `levelPenalty`（高出 2 m 以上或低於 4.5 m 以上重罰），電腦車的大腦本來就是往前找（`nearFrom`）；別人的車、幽靈車、重播只有平面座標，`createHeightKeeper(terrain)` 每台車記住上一次畫的高度當 `near`（`netRace.ts`、`botRace.ts`、`Scene.ts`）。
- **牆**：`Wall.base`（新，和 `top` 一起）＝只立在自己那層的牆。`collideWalls` 對有 `base` 的牆用車的 `y`（地上或空中都算）：車頂（`y + KART_BODY_HEIGHT` 1.5 m）低於 `base`、或 `y ≥ top` 就穿過。`levelKerbs` 把區內（`reach + 8`）主路兩側路緣改成 `[路面 − 1.5, 路面 + 3.5]`，上下兩層的路緣互不擋（3.5 + 1.5 < 6）。`branches.ts` 的 `clipWall` 保留 `base`／`top`。賽道自己的牆在區內必須有 `base`。
- **傾斜彎**：`RoadPoint.bank`（度，+ 左側高＝右彎的外側抬高；`MAX_BANK` 18°、相鄰兩點差 ≤ 4°；只有給了才存在）。地形點多 `cant`（tan），`Terrain.banked`；`groundAt` 用 `bankedGround` 依離中心線的橫向距離把高度抬高或壓低，另回傳 `cant` 與路的右方向（`gx`／`gz` 仍只是沿路坡度，所以上下坡的拉力不變）。物理（`stepOnTerrain`）：有 `cant`、方向盤往低的那一側打時，把速度方向與車頭一起多轉 `bankGravity`（14 m/s²）× |tan| × 打的比例 ÷ 速度——**速度大小不變**，傾斜不給速度，只讓同樣速度轉得更緊（12° 約多 5–10%，`levels.test.ts` 量）；往外打不幫。畫：`rollOf` 給車身側傾、`trackArt.ts` 的路面與路緣條兩邊各自的高度、`forkArt.ts` 的護欄用 `groundAt`。平面與沒有傾斜的賽道完全不變（`flatGolden`、`branchGolden`）。
- **車撞車看高度**：`bumpKart` 的對手可帶 `y`，兩邊都有高度且差 > `KART_BODY_HEIGHT` 就不撞（橋上橋下、一台在空中）。平面賽道沒有高度，照舊。
- **重播與幽靈車的「在空中」**（#94 的 `FLAG_AIRBORNE` 補進來）：重播的每個樣本把它放在「過終點線次數」那個位元組的第 7 位（次數不可能到 128）；`Replay.airborne: true` 表示這份重播有記，打包成 `REPLAY_VERSION` 2，沒有的打包成 1；`decodeReplay` 兩種都讀，舊檔照播、飛行照舊用猜的；舊版程式讀到 2 會說「版本太新」。重播畫面在有記的重播裡把 `airborne` 交給 Scene。幽靈車多一個 `air`（起飛、落地的樣本號交替），`ghostAt` 回傳 `airborne`；舊幽靈車沒有就照舊用猜的，手改壞的 `air` 整個不要。
- **畫面**：`crossingArt.ts` 在交叉處畫高架的橋面板（路面下 1.6 m 厚、深色底面＝隧道頂）與地下道兩側的牆（從地面到橋面板底）；`hillArt.ts` 的地面在區內取附近（16 m）最低的路面，所以地下道兩側是地下道的高度、高架在橋面板上而不是一道土堤；小地圖把上層那一段再畫一次、加淺色外框（`data-testid="kart-minimap-overpass"`）。顏色 `kartScene.concrete`／`concreteDark`。
- **編輯器**：新片段「上橋：高架」「下隧道：地下道」（`Overpass`：前三分之一升 `rise`、中間保持、後三分之一回來；180–400 m、|rise| 3.5–9 m）與「傾斜左彎／右彎」（`Turn.bank` 0–15°，兩端各 40 m 或三分之一淡入淡出；太短會 `bank` 問題）。代碼新 tuple：`'o'`（高架／地下道）、`'b'`（傾斜彎；沒傾斜照舊 `'t'`）；岔路 tuple 第 6 個數字是岔路上的東西（1 跳台、2 牆：只留路口開頭 3 個路點、3 有縫的牆：中間 9 m 縫），沒有就照舊 5 個——**舊代碼一個位元組都不變**（id、紀錄、幽靈車照舊）。`buildSpec`：路撞到自己的檢查在合法交叉區內、高度差夠的那些點對不算；`findCrossings` 的問題、區內有東西變成 `crossing` 問題並標出那幾段；閘門先避岔路（`gatesClearOf`）再避交叉（`track.ts` 的 `gatesClearOfCrossings`，往前挪、不補空）。伺服器（`custom.ts`）用同一套，再加 `decodeSpec` 的範圍檢查（未知的岔路東西、傾斜超過 15°、高架不到 3.5 m 都不是代碼）。
- **第六張技術展示賽道 `zhuwei`（暫名「竹圍高架」／Zhuwei Flyover）**：`shared/kart/tracks/zhuwei.ts`，`lay()` 多了 `eight`（轉角加起來 0°）與每步的 `bank`，`circuit.ts` 的控制點多第 5 個數字（傾斜）。8 字：東邊起跑直線→S 彎→傾斜 12° 的 U 形右彎→抽水站（主路繞一個 R32 的方塊，真岔路直直穿過去、中間一道有 9 m 縫的防汛牆）→地下道（−4.5 m）往西北→西邊 S 彎、大左彎（半徑由「兩條臂在中點正交」算出來）、S 彎、運河跳台→高架（+4.5 m）往東北越過地下道→回起跑。2.19 km、一個交叉（上下差 9 m、90°）、一個跳台、一條岔路、50 個閘門。加進選單（`RACE_TRACK_IDS`、`SPIKE_COURSES`）、多人與對戰電腦（同一份清單）、大獎賽「backstreet」盃第五站、挑戰模式獎牌表與 `kart:meta`、配樂（steel）與環境音。
- **測試**：`tests/kart/levels.test.ts`（舊賽道沒有交叉；8 字的交叉；太低、太斜、區內有閘門／加速帶／道具箱／牆／傾斜都被拒；區內路緣只擋自己那層；`groundAt` 與 `nearestRoadPoint` 照高度選路；一台車在高架上直開過交叉一直在高架、地下道一直在地下道、高度沒有跳、不撞對方的路緣；高度記憶；`bumpKart` 看高度；傾斜的路面高度與側傾、往內打轉得緊一點且不給速度、往外打不變；舊賽道沒有 `banked`；重播位元與版本相容；幽靈車 `air`；編輯器 8 字、傾斜彎、三種岔路東西的代碼來回與伺服器；壞代碼；竹圍高架四種電腦車三圈不逆走、零復位、上橋下隧道各三次、只有會技術的走岔路）、`technical.test.ts`（多一張；路撞到自己的檢查認得合法交叉）、`startLine`、`cup`、`challenge` 獎牌表、`meta` 前三名。
- **限制（照實寫）**：(1) 交叉只限主路對主路；分支仍不能巢狀、不能和主路立體交叉。(2) 道具（香蕉、泥灘、冰雹）落地與打中仍是平面判定，交叉處上下層的道具會互相作用；道具箱與加速帶本來就不准放在交叉區。(3) 電腦車量起來，抽水站的岔路只有專家走、比熟練快約 2.6%；頂尖腳本走岔路只快約 0.7%（直路賺不到甩尾的噴射），真人可能更多也可能更少，要擁有者試。(4) 傾斜只在主路；分支不傾斜。

### 4.67 路線圖外：貼牆滑行、落地時機噴、駕訓第 11 課、摩托車引擎聲、聲音分級、車身細節（2026-11-22，#145，`feat/kart-wall-slide-landing`）

- **貼牆滑行**（`shared/kart/walls.ts`）：新 `WALL_SLIDE`（`slideAngle` 12°、`scrapeShare` 0.6）與純函式 `slideShare(headOn, slideAngle)`：碰牆時速度和牆的夾角在 `tuning.wallSlideAngle`（`KART_TUNING` 新的一項，12°，調參面板「貼牆滑行角度」，牆一組）以內，沿牆損失與 `hitSpeed` 乘 (sin 夾角 ÷ sin 上限)²，那一步的擦牆拖曳 ×0.6；`WallResult.sliding` 標出整步只有滑行。只有 `MODEL_CLASSIC` 會滑，街機（舊）照舊。撞牆反應全在 `collideWalls` 裡的這兩個值，和 `feat/kart-track-format-v2` 的高度碰撞（`wall.top`）不重疊。黑鳶 `FLAGSHIP_TRAITS.wallSlideAngle` ×0.5。
- **落地時機噴**（`shared/kart/terrain.ts`）：`TERRAIN_TUNING.landingTapWindow` 0.1 s、`landingTimedBoost` 0.75 s；`KartState` 多 `airTap`、`landWindow`、`timedLandings`（只在有地形的賽道）。`stepAir` 記空中最後一次新按（`pressedAfresh`：沒按著→按下，或 `throttleTap`），`settleTerrain` 在落地時看它，或開 `landWindow` 讓落地後的新按補上；加速是 `max`（取代平常的 0.5 s 落地加速）。`stepOnTerrain` 保留 `timedLandings`。大字 `callouts.ts` 的 `landing`（「落地時機噴！」）。
- **腳本駕駛**：`BotSkill.landTap`（`brain.ts`：空中放開油門，落地那一步的輸入自然就是新按）；只有 `scripts`／`drivers.ts` 的 `master` 有，電腦車沒有。`scripts/kart-feel.ts` 在有跳台的賽道多印一行「timed landings」（頂尖有／沒有這招的差）；`Measure.timedLandings`。
- **駕訓班**：`LESSON_IDS` 多 `landing`（第 8 課，甩尾起跳之後），賽道 `riverside`（`SchoolTrackId` 多一個），一次一試；`judge.ts` 的 `landHeld`／`landEarly`／`landLate` 與即時提示 `landNow`；字串 `i18n.school.ts`；「十堂」改「十一堂」（大廳、駕訓介紹、規則頁）；`e2e/kart-school.spec.ts` 數 11 課。
- **紀錄**：內建賽道 `revision` 各 +1、`CUSTOM_REVISION` 8、`GUANYIN_REVISION` 9、調參存檔 key `tku-arcade.kart.tuning.8`；`flatGolden` 經典雜湊、`branchGolden` 重取，街機（舊）不變；獎牌表重跑。量測與數字在 `KART-FEEL.md` §22。
- **摩托車引擎聲**（#108，`src/kart/kartAudio.ts`）：`EngineVoice` 把引擎的音色與轉速曲線寫成資料，`ENGINE_VOICES.kart`（照舊：52 Hz 起、6 檔、兩支鋸齒加低八度方波）與 `.bike`（78 Hz 起、7 檔換得早、每檔爬得高，方波加鋸齒、第三聲部同音的三角波、Q 3.2 的濾波、音高 ¼ 的點火脈衝 tremolo、6 倍音高的渦輪高音）；`engineFrequency(speed, throttle, voice)`、`gearAt(speed, gears)`。`createKartAudio({ quality, kind })`，`spikeLoop.ts` 用 `kartKind(kartId)`。
- **聲音依畫質分級**（#105，`src/kart/audio/tiers.ts`）：`AUDIO_TIERS`（同時一次性聲音 4／8／16、環境音持續層 1／2／全部、偶爾的聲音低畫質關、參數每 3／2／1 幀動一次、低畫質沒有引擎的第二支鋸齒）、`tierRecipe`、`voiceBudget`；`createAmbience(..., tier)`、`createCuePlayer(quality)`。成本與表在 `KART-PERF.md` §10。
- **車身細節**（#99，`src/kart/art/bodyDetail.ts`）：`BODY_DETAIL`（低 off／中 medium／高 high）、`paintBodyDetail`（面板縫線、螺絲；高加刮痕與細顆粒）畫成 256／512 px 的高度圖，`bodyDetailTexture(level)` 一個等級一張、整頁共用；`createPaintMaterial(environment, weave, detail)` 當 `bumpMap`（`DETAIL_BUMP` 0.9），program cache key 分開；`wearDecal` 在號碼與標誌貼紙邊緣挖掉幾塊；`carbonTexture(fine)` 高畫質是 2/2 斜紋。`KartFinish.detail`，`Scene.ts` 照畫質給，車庫預覽與等待室舞台照 `loadQuality()`；幽靈車沒有。懸浮摩托車沒有輪子，所以沒有胎紋（只有懸浮墊）。顏色（灰階的高度）在 `kartTokens.ts` 的 `kartDetail`。截圖 `scripts/kart-shots.mjs --views close`。
- **測試**：`tests/kart/kartAudio.test.ts`（摩托車的音高、檔位、音色與分級、`voiceBudget`）、`tests/kart/bodyDetail.test.ts`（分級、縫線與螺絲的數量、磨損可重現）、`tests/shared/kart-walls.test.ts`（`slideShare`、淺角度貼牆只慢一點且不算重撞、街機照舊磨速、20° 照舊是撞、8° 不到一半）、`tests/kart/terrain.test.ts`（落地前後 ±0.1 s 的新按都算、取代不疊加、太早太晚不算）、`tests/kart/school.test.ts`（第 11 課的過關與三種失敗）、`skillTracks.test.ts`（頂尖在沒有指南的賽道＝熟練＋落地時機）。

### 4.68 路線圖外：燈籠老街的第二條捷徑（燈籠巷）、漁人碼頭與老街的跳台（2026-11-22，`feat/kart-track-routes`）

`NEXT.md` §5 賽道內容的另外兩項（#103）。手感與數字在 `KART-FEEL.md` §21。賽道格式、伺服器裁定沒有新東西：岔路照 #113、跳台照 #94／#109。

- **燈籠老街 `oldstreet@11`**（`shared/kart/tracks/oldstreet.ts`）：**燈籠巷**：從燈籠巷道（往西的寬直線）左轉進後巷之前的那個左彎，切過彎的內側、接回後巷（`layBranch`：半徑 12 m 左轉 40°、一條長斜線、左 25°、直線；14 m 寬），約 130 m 對主路約 165 m。巷子離開巷道兩個路點後一面店屋的牆把它封住，只在右邊留一個 9.5 m 的門（`ALLEY_DOOR*`，照高架廠區窄巷的做法）：要在斜線上就先對準，晚了會撞牆；門後一條加速帶。主路閘門用 `gatesClearOf` 讓開；路線導引 `OLDSTREET_ROUTE_GUIDE`（`guides.ts` 的 `ROUTE_GUIDES`）的技術線先沿巷道中間（room 1.5，切彎的 apex 不會把車推到左邊路緣）到巷口、再沿巷子斜線對準門、`slot` 一個，所以**專家每圈都走**，簡單、普通、困難不走（`skill.tricks`）。場景：老街的攤位與一般的路燈不放在岔路上（`oldStreetArt.ts` 認得 `forks`；`trackArt.ts` 的路燈在有岔路的賽道跳過落在別條路上的）。**老街回程的台階**：往西的老街回程、右轉進最後一條巷子之前一個 1.6 m 的跳台（`stepLip`，最接近 (212, 313) 的路點），直的跳會落在彎裡，要先收油或甩尾起跳。
- **漁人碼頭 `harbour@15`**（`harbour.ts`）：第二段山坡直線、髮夾 2（左）前一個 1.6 m 的跳台（`HARBOUR_STEP`，`circuit` 的 `jumps`）。新導引 `HARBOUR_GUIDE`（兩條線預設在中間，只有跳台前技術線靠右、`cue` 往左甩尾起跳、落在髮夾入口），專家與頂尖腳本每圈甩尾起跳。
- **電腦車的島牆判斷不看有高度的牆**（`brain.ts`）：沒有導引的賽道，`createBotBrain` 用 `walls` 猜「島牆分出的兩條車道」；燈籠巷的門牆（`top` 9 m）離主路 25–40 m，卻會被算進最近的主路路點，讓普通電腦車在左彎外側撞牆、復位（量到普通一場 4–6 次）。現在只看沒有 `top` 的牆（島牆、中島本來就沒有）；有 `top` 的牆只出現在有導引的賽道（碼頭倉庫、山城、廠區、針眼巷），那些賽道本來就不看 `walls`，所以舊賽道一步都沒變（`flatGolden`、`branchGolden`、`bots.test` 擋）。另外，**在島前被放回來的電腦車走外側車道**：復位點在老街中島的島頭前，會走捷徑內側的手（`shortcuts`）從靜止起步轉不過去、撞上島頭、又被放回同一個地方（八台困難電腦車的道具賽一台卡死在那裡）；現在被復位到島的範圍裡，這一次走外側（`safeLane`），過了島再照自己的選擇。
- **畫面**：兩張圖除了跳台都是平的，所以**不畫**山路賽道的地面高度場（會蓋掉碼頭的岸邊與老街的石板），只畫跳台的斜面（`buildJumpRamps`）。技術點提示（`skillCues.ts`）也開給這兩張：`trackScenery.ts` 讓它們多載 `skill`，`trackArt.ts` 在沒有 `skillStyle` 的賽道只畫提示（不改牆的樣子）：跳台兩端的琥珀燈、跳台前的箭頭（漁人碼頭照導引往左斜）、燈籠巷的岔路箭頭與門的青色燈條。
- **重跑**：`kart:medals -- --only harbour,oldstreet`（`kart-medals.ts` 的頂尖腳本現在在「有主路導引**或岔路導引**」的賽道都跑，老街的金牌因此照走燈籠巷的速度算）、`kart:meta -- --tracks harbour,oldstreet`。兩張的特性標籤（`shared/kart/meta.ts`）拿掉「平地」（有 1.6 m 的台階了），只剩「高速型」。
- **測試**：`tests/kart/trackContent.test.ts`（新）：燈籠巷是一條岔路、比繞彎短 15% 以上、牆上只找得到一個門（`findSlots`，和畫面用同一個）、路線導引對準它；專家兩個種子每圈都走、其他三級都不走、不逆走；兩個台階：一個、1.6 m、跳台後 60 m 內路轉 ≥ 25°（接彎）；漁人碼頭導引的 cue 就在台階、專家每圈甩尾起跳零復位；四級電腦車兩張圖三圈不逆走、復位 ≤ 1。`technical.test.ts` 的紀錄 key 與跳台數；`flatGolden`、`expert.test.ts` 改用拿掉跳台、岔路、障礙物的同一張圖（`tests/kart/flatLayout.ts`：鎖的是平地物理）；`terrain.test.ts`、`meta.test.ts` 的「平地賽道」例子換成紅樹林、淡海；`flagship.test.ts` 比的對象改成每張圖目前的第一名（不再固定白鷺）。

**限制（照實寫）**：(1) 老街沒有主路導引，所以頂尖腳本與專家在老街的台階是收油跳過，不會甩尾起跳；人可以。(2) 燈籠巷的牆是素色高牆（沒有個別的店屋場景）。(3) 台階讓困難電腦車每圈慢約 2 秒（坡頂收油）。

### 4.69 路線圖外：全螢幕遊玩（網頁與 PWA）（2026-11-22，#148，`feat/fullscreen-play`）

- **共用 API**（`src/lib/fullscreen.ts`）：全站只有一個全螢幕，對象是整頁（`document.documentElement`），不是某個元素：等待室變比賽、比賽變結果都不用重新進入，`<dialog>`（top layer）與 toast 照常。`enterFullscreen()`（要在點擊或按鍵裡呼叫；`requestFullscreen({ navigationUI: 'hide' })`，舊 Safari 用 `webkit` 前綴）、`exitFullscreen()`（暫停選單的「離開全螢幕」就呼叫它）、`toggleFullscreen()`、`fullscreenMode()`（`'off' | 'fullscreen' | 'focus'`）、`subscribeFullscreen`、React 的 `useFullscreenMode()`。
- **專注模式**：沒有 Fullscreen API 或被拒（iPhone Safari、沒權限的 iframe）時退回，和 #141 陞官圖同一個做法：`<html data-focus-mode>`，TopBar 藏起來（`TopBar.tsx`）；第一次會 toast 說明，iPhone 上提示「加到主畫面」才能沒有瀏覽器列。陞官圖自己的圖版全螢幕（`useImmersive.ts`）不動。
- **Esc**：真全螢幕時 Esc 是瀏覽器的（頁面攔不到），離開後頁面靠 `fullscreenchange`（含 `webkitfullscreenchange`）跟上；Chrome／Edge 桌機進入後用 Keyboard Lock 保留 Esc（`navigator.keyboard.lock(['Escape'])`），所以比賽的 Esc 先開暫停選單、長按 Esc 才離開全螢幕。專注模式沒有瀏覽器幫忙，Esc 由這裡處理，但有 `<dialog open>` 或畫面自己用掉這個 Esc（`event.preventDefault()`）時不動作——**要自己用 Esc 的畫面（暫停選單）請 `preventDefault()`**。
- **自動全螢幕**（設定，預設關，`localStorage` `tku-arcade.fullscreen.auto`）：`autoFullscreen()`／`setAutoFullscreen()`／`useAutoFullscreen()`；瀏覽器只准從使用者動作進全螢幕，所以 `armAutoFullscreen()` 掛一次性的 `keydown`／`pointerdown`（捕獲階段，Esc 除外），比賽的第一個鍵或第一下觸控就進去；只用真全螢幕，不會無預警進專注模式。
- **手機轉橫**：`lockLandscape()`／`unlockOrientation()`（`screen.orientation.lock('landscape')`，Chrome Android 只在全螢幕或已安裝的 app 有效，其他瀏覽器拒絕就維持現有的轉橫提示）。`src/kart/race/useRaceFullscreen.ts` 在比賽中：掛自動全螢幕、觸控裝置嘗試鎖橫（一進來先試一次給已安裝的 app，進全螢幕時再試）、離開比賽解鎖。
- **按鈕**（`src/components/FullscreenButton.tsx`，自己的 lazy chunk，字串 `shared/games/i18n.fullscreen.ts` 由它登記、`screenMessages.ts` 列給 check-i18n）：每個房間標題列（桌遊等待室與遊戲中、卡丁車觀戰與結果）、卡丁車單機選單（`SpikePage.tsx`，`landscape`：進全螢幕順便鎖橫）、卡丁車等待室（§4.70）。比賽中由暫停選單（`feat/kart-race-flow`）提供。
- **PWA**（`public/manifest.webmanifest`）：`display` 維持 `standalone`，加 `display_override: ["fullscreen", "standalone"]`，Android 從主畫面開啟就是全螢幕（iOS 不認 `display_override`，維持 standalone）；`orientation` 維持 `any`（桌遊與大廳要能直拿，卡丁車比賽時才鎖橫）。`isStandalone()` 也認 `display-mode: fullscreen`（但排除 Fullscreen API 造成的）。service worker 不受影響。
- **測試**：`tests/lib/fullscreen.test.ts`（整頁全螢幕與離開、瀏覽器自己的 Esc、專注模式與 Esc、被 `preventDefault` 或對話框攔下時不離開、自動全螢幕只在設定開時且只一次、鎖橫）、`e2e/fullscreen.spec.ts`（房間標題的按鈕進出真全螢幕；拿掉 API 時進專注模式、TopBar 消失、Esc 離開）。

### 4.70 路線圖外：卡丁車等待室滿版（一頁、橫向、車手為主角）（2026-11-22，`feat/kart-lobby-fullscreen`）

擁有者：「大廳準備階段的畫面要像跑跑一樣，全螢幕都是房主跟車手，現在的版面配置很醜也很空曠，要一頁就塞滿，橫向的寬的…總之要電競化專業化」。照規則 1 只學「準備畫面滿版、車手為主角」的類型排版；版面、美術、圖示是自己的（`IP-CHECKLIST.md`）。

- **滿版**（`src/kart/lobby/KartLobby.tsx`）：等待室本身 `position: fixed; inset: 0`（z-index 9：蓋過頁面與 TopBar 5，在 toast 10、更新提示 11 之下），一頁不捲動；`inertOthers` 讓後面的房間標題、頁尾連結不能 Tab 到、`<html>` 的 `overflow: hidden`。重新連線的橫幅（`RoomPage.tsx` 的 `ConnectionStatus`）提高到 z-index 10 並 `data-inert-keep`，蓋在等待室上面。
- **版面**：上方一條轉播風格的列（返回大廳、「出賽陣容」標題、`n/8 位車手`、工具鈕：邀請、聊天（未讀數）、團隊賽才有的分隊、房間（房主是「房間設定」）、怎麼玩、全螢幕）；主體左邊 8 格、右邊側欄（`clamp(170px, 22vw, 320px)`）：賽道卡（`TrackCard.tsx`：名稱、俯視圖撐滿剩下的高度、圈數／模式／團隊賽、「這張圖最快」三台 `trackMeta`）、車庫鈕（顯示自己的車與車手）、大的「準備」（房主「開始遊戲」，等全員時發光脈動；不能開始時說在等誰）、站起來、觀戰名單。8 格是 4×2；`Line` 是 `container-type: size`，容器寬高比 ≥ 3:1（超寬螢幕）時改 8×1。
- **每格**：3D 車手正面（`lobbyStage.ts`）佔滿上方、底下名牌條：名字、車款·車手、車系／等級／電腦難度／隊名標籤、準備狀態大字（準備完成＝綠框、閃一下、字「砸進來」`slam`；房主＝主題色框）；左上號位 `01`～`08`、房主皇冠、電腦、你；房主在別人的格子右上有「⋯」開管理對話框（電腦車移除、轉移房主、踢出，原本擠在格子裡的按鈕）。名牌條上緣是隊色（團隊賽）或主題色。空位：大「＋」、入座、房主在第一個空位「加電腦車」（一按一台，難度用房間設定裡的）。
- **3D 的成本**（`lobbyStage.ts`）：還是一個共用 renderer 畫完複製到各格。離屏畫面跟著格子大小（`ResizeObserver`，20 px 一階，最大 380×420、最小 80），所有格子共用一個尺寸；鏡頭距離依寬高比算到車寬剛好放進格子（3.1～5.8），高的格子鏡頭抬高一點。像素比桌機 ≤ 1.5、手機 1；每幀畫的格數桌機 8、手機 3（`pointer: coarse` 或短邊 < 500），33 ms 一幀，看不到或分頁隱藏不畫，`prefers-reduced-motion` 每格只畫一次。three.js 照舊等卡片出現後才 lazy 載。
- **沒有 WebGL（或 3D 還沒來）**：`KartArt.tsx` 平面畫：車的正面（車殼、輪、霓虹線用 `kartBodies` 的顏色）＋安全帽與面罩（`kartDrivers`）＋地上光暈；3D 來了就藏起來。
- **直拿手機**（`orientation: portrait` 且寬 ≤ 700）：改成可以捲的列表（每位一列：左邊 96 px 平面圖、右邊名牌），側欄在上、最上面一條「把手機轉橫」提示；3D 不畫（canvas 隱藏，`IntersectionObserver` 看不到就不畫）。
- **工具收進對話框**：邀請（房號、連結、QR、公開／私人、密碼，`WaitingRoom.tsx` 的 `invite`）、房間（`GameSetup` 選賽道與選項、解散、房主的電腦車 `RoomBots`、每個人自己的「進比賽時自動全螢幕」勾選）、分隊（`RoomTeams`）、聊天（`Drawer` 裡的 `ChatPanel`；`RoomPage` 對卡丁車等待室不再放右欄聊天或手機底部聊天列，改傳 `chat` 進來）、車庫、管理某人。`WaitingRoom` 新的 props：`chat`、`onLeave`；`KartLobby` 的 `side` 拆成 `invite`、`setup`。
- **全螢幕**（§4.69）：上方列的全螢幕鈕（`landscape`：手機進全螢幕順便鎖橫）；「自動全螢幕」打開時，按「準備」或「開始遊戲」就是瀏覽器要的那一下，直接進全螢幕。
- **字串**：`shared/games/kart/i18n.lobby.ts` 多 9 個（`racers`、`room`、`roomTitle`、`manage`、`quickest`、`yourKart`、`sideways`、`watchingList`、`lineUp`）；`TrackCard` 的「各自為戰」不再寫（團隊賽才寫）。
- **測試**：`tests/kart/lobby.test.tsx` 多 4 個（房間面板裡的電腦車與自動全螢幕設定、只有房主有管理鈕且能移除電腦車、車手數、3D 來之前的平面圖與最快車）；`e2e/kart-lobby.spec.ts`（新）：1280×720 與 844×390（觸控）房主＋Bob＋6 台電腦車：滾輪不動、等待室沒有捲動、8 格都完整在畫面內且高度 > 畫面 1/3、準備流程、axe 0 serious（含房間設定對話框）、聊天未讀數；等待室全螢幕進出；390×844 直拿是列表＋轉橫提示＋axe。`kart-race`／`kart-loading`／`kart-team`／`kart-editor` 改成從面板操作（房間設定、分隊、空位的加電腦車）。截圖：`KART_LOBBY_SHOTS=1` 時存到 `test-results/kart-lobby-*.png`。

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
| 其他 15 款桌遊畫面的字串（2026-11-22） | `shared/games/<id>/i18n.screen.en.ts`、`i18n.screen.zh-TW.ts`（`i18n.screen.ts` 只是兩語合起來給 check-i18n、`npm run play` 與測試） | 和畫面一起（`screens.ts` 的 `withStrings`、`src/games/screenStrings.ts` 用 `import.meta.glob` 每款每語一個 chunk），只載目前語言；`tests/games/screenStrings.test.ts` 擋網站再 import 兩語那份 |
| 陞官圖簡化版畫面、卡丁車 | `i18n.screen.ts` 等，`registerMessages` | 照舊隨畫面 chunk，兩語（簡化版很小、字型要全部中文字；卡丁車另有 `KART_PARTS`） |

- **不閃英文**：`index.html` 有一段 inline script，用和 `t.ts` 一樣的規則（localStorage，否則 `navigator.languages`）決定語言，對那份字串 chunk 發 `modulepreload`，所以它和入口一起下載、不是入口跑完才開始；檔名由 `vite.config.ts` 的 `languageChunks` 在 build 時填進去（找不到就 build 失敗）。`src/main.tsx` 等那份到了才 render。載入失敗就改用英文，再失敗也照樣 render（看到的是 key）。
- **切換語言**：`setLanguage` 先記住選擇（localStorage），等那個語言的網站字串與已註冊的語言分片（`registerLanguageParts`：房間、陞官圖完整版、15 款桌遊畫面）都到了才換；載過一次之後是立即的。連點兩下以最後一次為準。
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
- Secrets：`AUTH_SHARED_SECRET`（與牌桌共用，F1；var `AUTH_BRIDGE_URL` 是牌桌的網址，DEPLOY.md §11）、`ANTHROPIC_API_KEY`（題目草稿）、`LONGTALK_URL`（選用）、`STATS_KEY`（擁有者頁）、`CF_ANALYTICS_TOKEN`／`CF_ACCOUNT_ID`（成本儀表板）、`ALERT_WEBHOOK_URL`（選用）。
- 成本：Workers、DO、D1、R2 都在免費額度內；卡丁車多人是最大變數。儀表板（P1，`e12-t15`，`worker/usage.ts`）向 Cloudflare GraphQL Analytics API 要**整個帳號**的用量（免費額度是帳號共用：預覽、牌桌、LongTalk 都算），每個資料集一個查詢，一個失敗其他照常；每日 cron（與備份同一條 `0 19 * * *`，`Promise.allSettled`，任一失敗整次記失敗）超過 80% 寫 D1 `cost_alerts`（每個指標每個期間一筆，不重複警示），選用 webhook。每日額度取昨天與今天（UTC）較高的一天，因為 cron 在 19:00 UTC 跑、今天只過了 79%。
- 功能旗標（P1，`e12-t11`，`worker/flags.ts`）：D1 `game_flags`，沒有列就是開放。三個檢查點：`POST /api/rooms`（Worker，每次讀 D1）、`GET /api/lobby` 濾掉暫停遊戲的公開房、`RoomDO` 收到 `start`／`rematch`／`set_game` 時讀旗標（快取 30 秒，`blockConcurrencyWhile` 讀，訊息順序不亂；`RoomHost` 保持同步，只問 `deps.gameEnabled`）。既有房間的當局不受影響；讀不到旗標表時全部開放（旗標只會關，不能讓旗標故障關掉整站）。
- 安全標頭（P1，`e12-t13`，`docs/SECURITY.md`）：靜態資產的 `_headers` 由 `vite.config.ts` 的 `security-headers` 外掛在 build 時寫出（CSP 用 `index.html` 唯一 inline script 的 sha256，每次 build 的語言 chunk 檔名不同，所以 hash 只能在 build 時算）；Worker 自己的回應由 `worker/security.ts` 補同一組基本標頭（WebSocket 升級除外）。

## 8. 從牌桌與 LongTalk 直接搬的東西

| 東西 | 來源 | 備註 |
| --- | --- | --- |
| `shared/patch.ts`、`room-id.ts`、`chat.ts` | LongTalk | 直接複製 |
| RoomDO hibernation WebSocket、心跳、45 秒逾時 | LongTalk `RoomDO` | 結構相同 |
| per-seat view 裁切思路 | 牌桌 `worker/views.ts` | 概念，不複製程式 |
| D1 遷移、備份 cron、錯誤回報、JS 預算腳本、Playwright 視覺回歸流程 | 牌桌／橋館 | 複製腳本 |
| 設計 token 與 styled-components 慣例（`$` prop） | 全部 | 同一套規則 |
