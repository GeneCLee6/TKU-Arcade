# 房間連線：斷線原因、重連與穩定度（2026-11-22）

擁有者 2026-11-22：「遊戲的穩定度要再加強，常常連線不穩。」沒有更多細節，所以這份把房間 socket 會斷的原因一條一條查過、能修的修掉，並留下一個可以重跑的長時間連線測試。卡丁車的即時 frame 在 `KART-NETCODE.md`；這裡是所有房間（桌遊與卡丁車）共用的那一層。

## 1. 連線層一覽

| 部分 | 檔案 | 做什麼 |
| --- | --- | --- |
| 頁面的 socket | `src/lib/roomConnection.ts` | 開 `/ws/<id>?v=2`、送 `join`（帶 seat token）、每 15 s `ping`、三次沒回就當死掉；送出後 3 s 沒回音就補一個 ping、4 s 沒回就換 socket；回到頁面／`online`／`focus`／`pageshow`／`resume` 立刻檢查 |
| 重連 | 同上 `connectRoom` | 0、1、2、4、8、15、30 s 退避（只往下抖 25%）；單次嘗試 10 s 逾時；5 分鐘放棄 |
| React | `src/lib/useRoom.ts`、`src/pages/RoomPage.tsx`、`src/components/ConnectionBanner.tsx` | 斷線提示、送不出的提示、重新整理 |
| Worker | `worker/rooms.ts` `handleRoomSocket` | Origin 檢查、每位址升級限制（`LimiterDO`）、轉給 RoomDO |
| RoomDO | `worker/room.ts`、`worker/room-host.ts` | hibernation、`ping`→`pong` 自動回應（不叫醒物件）、每 15 s 的 sweep 讀自動回應時間、45 s 離線→`absent`／轉房主、90 s 讓座（等待／結束時） |
| 卡丁車房間列表（2026-11-23） | `src/lib/lobbyFeed.ts`、`worker/lobby.ts`、`worker/lobby-feed.ts` | `/ws/lobby?game=kart` 推送公開房的變化；同樣的心跳與退避，隱藏分頁放掉；推不了就退回 10 s 輪詢（§6） |

## 2. 查到的斷線原因

| # | 原因 | 會怎樣 | 修了嗎 |
| --- | --- | --- | --- |
| 1 | **背景分頁的 ping 變慢**：瀏覽器把背景分頁的計時器放慢，Chrome 隱藏 5 分鐘後一分鐘只醒一次（intensive wake-up throttling）；手機背景也類似。房間 45 s 沒聽到 ping 就以 4408 關掉 | 切去 LongTalk／Discord／別的分頁一陣子，每一兩分鐘就被踢一次：自己「重新連線中」、別人看到他離線，45 s 後還會失去房主、在等待室 90 s 後失去座位 | ✅ `STALE_AFTER_MS` 45 → **90 s**（容得下一分鐘一次的 ping）。真的死掉的網路仍由頁面自己 45 s 內發現（三次沒回），正常關掉的 socket 立刻就知道 |
| 2 | **第一次連線失敗就結束**：還沒 `welcome` 前斷掉（部署那一刻、手機剛好在換網路、DO 冷啟動慢），直接顯示「無法連線到房間」 | 進房間偶爾直接失敗，要自己按重試 | ✅ 第一次連線失敗也自動重試 **20 s**（`FIRST_CONNECT_GIVE_UP_MS`），期間仍是「加入中…」 |
| 3 | **4429 是終點**：一位址每分鐘 120 次升級，超過就 4429，頁面把它當「連線太多」直接結束 | 一次部署讓所有 socket 同時斷、一整個社團在同一個校園位址一起重連，有機會撞到；撞到就整個房間的人都被踢出 | ✅ 頁面把 4429 當「等一下」：至少 20 s 後再試，5 分鐘都還是才結束；重連帶 `?resume=1`，用完 120 次後**另有 240 次**（`SHARED_LIMITS.resume`，`SECURITY.md` §6） |
| 4 | **斷線期間按的東西直接丟掉**（toast「沒有送出」） | 斷一下就要重按 | ✅ 重連期間的操作排隊（最多 16 個、10 s 內），新 socket `welcome` 後依序送出；等太久的才丟掉並提示。聊天、`set_look`、卡丁車房主替電腦車送的動作、`leave` 照舊不排隊（它們有自己的重試或不需要） |
| 5 | **斷線提示一閃一閃**：每次斷線（多半一秒內就回來）都立刻出現「連線中斷，正在重新連線…」 | 看起來比實際不穩 | ✅ 斷線 1 s 後才出現；6 s 後多一顆「立刻重試」；回來時顯示「已重新連線。」2.5 s 後自己消失（`ConnectionBanner.tsx`） |
| 6 | **卡丁車的對時在睡眠後失準**：手機睡眠時 `performance.now()` 可能停住，醒來後 offset 差了整段睡眠；舊的最短來回樣本一直留著 | 重連後道具盒、護盾、閘門時間對不上 | ✅ `RoomRealtime.onResume`：重連 `welcome` 後、頁面隱藏 ≥ 1 s 再出現時，`netRace.ts` 與 `serverClock.ts` 清掉舊樣本、重新連打 5／3 個 ping（舊 offset 留到第一個新答案） |
| 7 | 跑到 `webSocketMessage` 的 `ping`（沒被自動回應接走時）不算心跳 | 理論上可能被誤判 stale | ✅ 也算心跳 |
| 8 | **部署**：每次合併到 main 就部署，Durable Object 重啟，所有 socket 斷 | 無法避免 | 重連 0 ms 先試一次；本機與預覽量到幾百 ms 內回來（下表），加上 #5 多半看不到提示 |
| 9 | Service worker（#127） | 不攔 `/ws/*`、`/api/*`（`tests/pwa.test.ts`） | 不是原因 |
| 10 | CSP `connect-src 'self'` | CSP Level 3 的 `'self'` 含同主機 `ws:`／`wss:`；Chrome、Firefox、Safari 15.4 以上都照這個。正式站與每個預覽是自己的網域，同源，沒有被擋（e2e 的 CSP 違規數 0） | 不是原因；更舊的 iOS（15.3 以前）理論上會擋，到 2026 年可忽略 |
| 11 | 協定版本不合（4400） | 只在協定升版那次部署時，舊頁面被要求重新整理 | 照舊（本批沒有升版：`PROTOCOL_VERSION` 仍是 2，新增的 `resume` 參數舊伺服器會忽略） |
| 12 | **送出了、socket 卻已經死了**：手機換網路、進電梯、部署那一刻，按下去的那一下其實沒到（或到了但回音沒回來） | #149 只提示「剛才那一下可能沒送到，請再按一次」；再按一次又可能重複（到了只是回音丟了） | ✅ 2026-11-23 訊息序號（§5）：重連後自動重送沒被確認的，伺服器照序號去重，**剛好一次** |

## 3. 長時間連線測試（`npm run net:soak`）

`scripts/net-soak.ts`：在一個站上開一間私人房，N 個用真協定的客戶端（帶 seat token 加入、每 `--ping` 秒 `ping`、每 `--idle` 秒左右點一次「準備」），掛 `--minutes` 分鐘，記錄每次關閉的關閉碼、原因、開了多久、多久重新 `welcome`，最後印出摘要（`--json` 存檔）。`--ping 60` 模擬被瀏覽器放慢的背景分頁。不准對正式站跑（要 `--allow-production`）。

```bash
npm run net:soak -- --url https://tku-arcade-pr-<號>.genelee-pro.workers.dev --clients 3 --minutes 15 --ping 15
npm run net:soak -- --url https://tku-arcade-pr-<號>.genelee-pro.workers.dev --clients 2 --minutes 15 --ping 60
```

### 前後對比

| 情境 | 修之前 | 修之後 |
| --- | --- | --- |
| 本機 dev（Miniflare），3 人 5 分鐘，ping 60 s | **18 次 4408**（每人每小時 72 次），每次 22–37 ms 回來 | **0 次** |
| 預覽站（真 Cloudflare，#147 的預覽＝修之前），3 人 15 分鐘，ping 15 s | 0 次 | 0 次（#149 的預覽） |
| 預覽站，2 人 15 分鐘，ping 60 s | **29 次 4408**（每人每小時 58 次），重連 p50 322 ms、p90 711 ms、最慢 1.17 s | **0 次** |

正常前景（ping 15 s）在真 Cloudflare 上 15 分鐘一次都沒斷，DO hibernation（點一下之間有兩分鐘閒置）也沒有讓房間誤判誰還在：所以「常常不穩」最主要的來源是**背景分頁被當成斷線**（#1），其次是部署與換網路那一下（#2、#3、#5）。

卡丁車：`npm run kart:loadtest -- --bots 6` 對 #149 的預覽站跑一場（老街 3 圈道具賽）：6 台都完賽、圈數與伺服器一致、房間丟 0 個 frame、轉送 p50／p95 48／68 ms、對時來回 p50 48 ms，和改之前（`KART-NETCODE.md` §8）同一水準。

### 瀏覽器裡的重現（`e2e/network.spec.ts`、`e2e/connection.spec.ts`）

Playwright 讓房間 socket 經過一個可以關掉或拒絕的中繼：

- 伺服器關掉 socket（部署）：1 s 內回來，**沒有出現提示**，接著照常操作。
- 重連期間被拒（部署中）：1 s 後出現提示、6 s 後「立刻重試」，期間拿的籌碼排隊；按下去回來、籌碼送到、「已重新連線。」然後消失。
- 重連撞到 4429：不結束，等過那一分鐘自己回來。
- `context.setOffline(true)` 後再上線：自己回來，桌面一致。
- 既有的「socket 看起來開著但什麼都不通」與「回到頁面立刻檢查」照舊通過。

單元測試：`tests/lib/roomConnection.test.ts`（第一次連線重試與 20 s 放棄、4429 的暫停與 5 分鐘結束、`resume` 只在斷線後、排隊／逾時／上限、`onResumed`）、`tests/pages/RoomPage.test.tsx`（提示晚 1 s、立刻重試、已重新連線）、`tests/worker/abuse.test.ts`（`resume` 額度）、`tests/kart/serverClock.test.ts`（重新對時）。

## 4. 還沒做、可以接著做

- ~~已經送出但沒有回音的那一下不自動重送~~：2026-11-23 做了（§5）。
- 卡丁車比賽中斷線超過幾秒，伺服器那邊這台車就停在原地；回來後照新的 `welcome` 繼續，但中間的名次不會補。
- 沒有在真手機上量（iOS Safari 背景幾分鐘就會把 socket 整個關掉，回來靠 `visibilitychange` 立刻重連）。擁有者試玩時可以留意「回到 App 後多久能操作」。

## 5. 可靠送達：訊息序號與確認（2026-11-23）

#149 留下的最後一塊：socket 看起來開著、其實已死時按的那一下。頁面 3 s 沒回音就補 ping、再 4 s 沒回就換 socket，但那一下要嘛沒到、要嘛到了只是回音丟了，頁面分不出來，只能請人「再按一次」，而再按一次在後者會重複（例如德州撲克多跟一次）。

### 5.1 協定（`shared/protocol.ts` 20.）

| 誰 | 什麼 | 說明 |
| --- | --- | --- |
| 頁面 → 房間 | `join` 多帶 `session` | 這次頁面載入自己的隨機 id（16 字 base64url，`SESSION_PATTERN` 8–32 字）；同一次載入的每次重連都一樣，重新整理就換一個 |
| 頁面 → 房間 | 其他訊息多帶 `seq` | 1、2、3…照送出順序；`join`、`resync` 帶了也不理；不是正整數就當壞訊息關掉（4422） |
| 房間 → 頁面 | `welcome` 多帶 `ack` | 這個成員、這個 session 已處理到的最大 `seq`；新 session 是 0（從頭算） |
| 房間 → 頁面 | `{ t: 'ack', seq }` | 每處理完一則帶 `seq` 的訊息（套用或被拒都算）就回，只給送的人，排在那則的 patch 後面 |

**房間（`worker/room-host.ts`）**：每個成員記 `{ session, seq }`（`SeqAck`）。收到 `seq` ≤ 記住的值 → 重複，不套用、只回 `ack`；否則照常處理，處理完把 `seq` 記下（記憶體＋storage `ack:<成員>` 一個成員一個 key），回 `ack`。記 storage 和那則訊息造成的改變在同一個同步段落裡寫，Durable Object 會一起提交、提交完才放出這段時間送的訊息（output gate），所以部署重啟後「改了但沒記序號」或「記了序號但沒改」都不會發生；`ack` 送到頁面時一定已經存好。成員被移除後留下的 key 在下次喚醒時清掉，解散房間時跟整間一起刪。

**頁面（`src/lib/roomConnection.ts`）**：

- 第一次 `welcome` 有 `ack` 才開始編號（伺服器會確認）；沒有（舊伺服器）就完全照舊：不編號、不重送、socket 死掉時照舊提示「可能沒送到」。
- `send(message)`（會排隊的那種）加上 `seq` 送出，留在 outbox 直到收到 `ack`；`send(message, false)`（聊天、`set_look`、`leave`、替電腦車送的動作）照舊不編號。
- socket 死掉（關閉、或 3 + 4 s 沒回音）：不提示「再按一次」。新 socket `welcome` 的 `ack` = N：丟掉 ≤ N 的（其實到了），> N 的照原本的 `seq`、原本的順序重送，接著才送斷線期間排隊的（也已編號）。
- 太舊的不重送：送出後超過 `RESEND_TTL_MS`（30 s，偵測死掉本身就要 7 s）或排隊超過 `QUEUE_TTL_MS`（10 s）就放棄並提示「沒有送出」。遊戲本身也會拒絕已經不合時宜的動作（輪到別人、下一手）。
- 最多保留 `MAX_UNACKED`（64）則送出未確認的；正常情況幾十 ms 內就被確認。
- 每個 socket 記「送出的最大 `seq`」與「確認到的 `seq`」：還有沒確認的，任何其他訊息（例如前一則的 patch）都不算回音，3 s 計時照走（以前只要收到任何東西就不再等）。

### 5.2 相容性

| 頁面 \ 伺服器 | 舊（沒有序號） | 新 |
| --- | --- | --- |
| 舊頁面 | 照舊 | 不帶 `session`／`seq` → 不回 `ack`、`welcome` 沒有 `ack`，完全照舊（`tests/worker/room-delivery.test.ts` 最後一則） |
| 新頁面 | 舊伺服器忽略 `session`、`seq`（`parseClientMessage` 重建物件時丟掉）、不回 `ack` → 頁面不編號、不重送，等於 #149 的行為 | 剛好一次 |

部署那一刻（舊伺服器 → 新伺服器）：頁面在舊伺服器時沒編號、送出的不進 outbox；重連到新伺服器拿到 `ack: 0` 才開始編號，不會把舊伺服器可能已處理的東西重送。`PROTOCOL_VERSION` 沒升（仍是 2）。

### 5.3 測試

- `tests/worker/room-delivery.test.ts`：每則確認、排在 patch 後只給送的人；斷在途中（到了、回音沒回）重送只套用一次、還能接著送；沒到的重送會套用；亂序與重複（5、5、4、3 都只確認不套用，跳號可以）；被拒的也算處理過；聊天也只算一則；重新整理（新 session）從 0 算；**部署重啟**後序號還在；成員移除、解散房間後不留 key；舊頁面完全照舊；`seq`／`session` 的解析。
- `tests/lib/roomConnection.test.ts`「delivered once」：同一連線的 session 不變、新連線換一個；編號順序；死掉後只重送 `ack` 之後的、原號；斷線期間排隊的接在後面；確認後不再重送；兩種逾時；舊伺服器不編號；上限 64；前一則的回音不算後一則的。
- `e2e/network.spec.ts`：中繼在**送出那一下**讓 socket 無聲死掉，分「到了但回音丟了」與「根本沒到」兩種，重連後對方桌上都剛好少一個籌碼、沒有「可能沒送到」、中繼只看到那個動作過去一次；`Promise.all([點, setOffline(true)])` 讓點與斷網互相搶，回來後剛好一次；原本「斷網再上線」的測試從「2 或 3 個」改成剛好 2 個。`e2e/connection.spec.ts` 的「無聲死掉」改成不用再按、自己送到。
- `npm run net:soak` 也帶 `session` 與 `seq`，摘要多 `acked`、`slowestAckMs`（本機 2 人 1 分鐘：15 下全確認，最慢 23 ms）。

## 6. 卡丁車房間列表改推送（2026-11-23，`feat/kart-room-push`）

`/kart?online` 的公開房列表（#163，`ARCHITECTURE.md` §4.83）原本每 10 秒 `GET /api/lobby?game=kart`（Worker 沿用 2 秒）。現在列表頁開一條 WebSocket 到 LobbyDO，房間一變就推過來；做不到時退回原本的輪詢。

### 6.1 怎麼運作

- **路徑**：`/ws/lobby?game=<id>&v=1`（`shared/lobby-feed.ts` 的 `lobbyFeedPath`、`LOBBY_FEED_VERSION`）。Worker（`worker/app.ts` 的 `handleLobbySocket`）檢查同站 `Origin`、遊戲存在、每 instance 每位址每分鐘 30 次升級（記憶體，`lobbyWatchLimit`；本機不限），把位址雜湊放進 `x-tku-address` 轉給 LobbyDO。
- **LobbyDO**（`worker/lobby.ts`）：`ctx.acceptWebSocket(server, ['game:<id>'])`，attachment 記遊戲、位址雜湊、開的時間；同時開著的上限全站 `MAX_LOBBY_WATCHERS`（1,000）、每位址 `MAX_LOBBY_WATCHERS_PER_ADDRESS`（12），超過接受後以 **4429** 關掉（頁面改輪詢）。版本不合以 `versionMismatch` 關掉。第一個 frame 是 `{ t: 'rooms', rooms }`（那款遊戲列著的全部房，暫停的遊戲給空的）。
- **差異**：`LobbyBoard` 多一個 `changed(before, after)`（新增、換掉、移除、逾時清掉都會叫）；`feedChange`（`worker/lobby-feed.ts`）決定要送什麼：新的或內容變了 `{ t: 'room', room }`、不再列 `{ t: 'gone', id }`、房間 4 分鐘一次的心跳回報（內容一樣）什麼都不送。RoomDO 本來就會在人數、狀態、密碼、房名、選項改變時回報（`syncLobby`），所以新增、人數改變、開賽、結束、關房都會即時到；只有「房主一直沒回報、10 分鐘逾時」那種才晚。暫停的遊戲（e12-t11）在 LobbyDO 記 60 秒，推送時把它的房當成 `gone`。
- **休眠友善**：沒有計時器、沒有每個 socket 的記憶體狀態；心跳 `ping` 由 `setWebSocketAutoResponse` 回 `pong`，不叫醒物件。只有房間回報（本來就有的 RPC）叫醒它，這時順手 `send` 給那款遊戲的 socket。頁面送 `ping` 以外的任何東西就被關掉（4422），所以沒有訊息速率要限。
- **頁面**（`src/lib/lobbyFeed.ts` 的 `watchLobby`，沿用 #149／#153 的習慣）：每 15 秒 `ping`，超過 35 秒什麼都沒聽到就當死掉重開；斷線後等 1、2、4、8、15、30 秒（最多少 25% 的抖動）再連，連上收到完整列表就歸零；分頁隱藏就放掉 socket，回來時重開（新的完整列表）。**退回輪詢**：沒有 `WebSocket`、連 3 次都在收到列表前就斷（代理、擴充套件、舊 Worker）、或被 4429／版本不合關掉，就呼叫 `onFallback`，`OnlineView` 改回每 10 秒輪詢。頁面一開始仍先問一次 `GET /api/lobby`（推送的第一個列表通常比它先到，晚到的那份會被丟掉），「重新整理」照樣問一次。列表上方的「N 秒前更新」在推送時改成「即時：有變化馬上更新」（`data-live`）。
- 兩端用同一個 `lobbyRooms`（從 `worker/lobby-list.ts` 搬到 `shared/lobby-feed.ts`），推送拼出來的列表和輪詢的順序、截斷一模一樣。

### 6.2 成本：和輪詢比

一個人開著列表 10 分鐘、期間有 20 次房間變化：

| | 輪詢（原本） | 推送 |
| --- | --- | --- |
| Worker 請求 | 60（每 10 秒） | 1（升級）＋開頭 1 次 `GET /api/lobby` |
| LobbyDO 請求 | 最多 60（Worker 沿用 2 秒，同一個 instance 上的人共用；最壞每人各一個 instance） | 1（WebSocket 連線）＋開頭那次 `GET` 最多 1 |
| D1 讀（暫停旗標） | 60（每次 `GET /api/lobby`） | LobbyDO 60 秒最多 1 次 |
| 送出的變化 | 最晚 10 秒（＋2 秒快取）才看到 | 房間回報後立刻；送出的訊息不算請求 |
| 心跳 | — | 每 15 秒一個 `ping`，auto-response 回答、不叫醒物件 |

LobbyDO 喚醒次數只跟「房間變化」有關（本來就有的回報 RPC），跟看列表的人數無關；看的人多時差最多。代價：每條連線一個 DO 連線請求（免費額度每日 10 萬次），斷線重連與切回分頁各再一次；DO 醒著處理回報的時間多了對每個 socket `send` 的那點 CPU。

### 6.3 還沒做

- 大廳首頁的公開房列表**沒有**改（還是 15 秒輪詢，分頁隱藏時停）。首屏 102.2／103 kB，推送客戶端（約 1 kB gzip）只能首屏後 lazy 載入；首頁的列表只列「可以加入的房」，晚 15 秒的代價比卡丁車列表小，所以先不動。要做時：`watchLobby` 支援 `game` 為空（全部遊戲、只列可加入的）並在 LobbyDO 加一個 `game:*` 標籤。
- 「RoomDO 回報 LobbyDO 失敗」時只靠下一個事件或掃描重試（原本就這樣），那段時間推送也不會有。

### 6.4 測試

`tests/lib/lobbyFeed.test.ts`（完整列表＋差異照順序、`pong` 與壞 frame 不理、心跳與沒聲音就重開、斷線退避重連、連 3 次失敗改輪詢、4429／版本不合立刻改輪詢、沒有 WebSocket、隱藏分頁放掉回來重開）、`tests/worker/lobby-feed.test.ts`（每站／每位址上限、`feedChange` 的新增／變化／心跳不送／移除／暫停、`LobbyBoard.changed` 跟著回報與逾時、頁面拼出的列表等於 `GET /api/lobby` 的、`/ws/lobby` 的位址雜湊、Origin、遊戲、426、超過額度 4429 不叫醒 LobbyDO）、`tests/kart/onlineView.test.tsx`（推送的列表即時出現與更新、不再定時輪詢；其他測試照舊走輪詢）、`e2e/kart-online.spec.ts`（Bob 先開列表，Ann 快速加入開房，Ann 進到等待室後 2 秒內 Bob 的列表出現那一列，不按重新整理）。
