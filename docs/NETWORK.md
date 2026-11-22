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
| 預覽站（真 Cloudflare，#147 的預覽＝修之前），3 人 15 分鐘，ping 15 s | 0 次 | AFTER_PREVIEW_15 |
| 預覽站，2 人 15 分鐘，ping 60 s | **29 次 4408**（每人每小時 58 次），重連 p50 322 ms、p90 711 ms、最慢 1.17 s | AFTER_PREVIEW_60 |

正常前景（ping 15 s）在真 Cloudflare 上 15 分鐘一次都沒斷，DO hibernation（點一下之間有兩分鐘閒置）也沒有讓房間誤判誰還在：所以「常常不穩」最主要的來源是**背景分頁被當成斷線**（#1），其次是部署與換網路那一下（#2、#3、#5）。

### 瀏覽器裡的重現（`e2e/network.spec.ts`、`e2e/connection.spec.ts`）

Playwright 讓房間 socket 經過一個可以關掉或拒絕的中繼：

- 伺服器關掉 socket（部署）：1 s 內回來，**沒有出現提示**，接著照常操作。
- 重連期間被拒（部署中）：1 s 後出現提示、6 s 後「立刻重試」，期間拿的籌碼排隊；按下去回來、籌碼送到、「已重新連線。」然後消失。
- 重連撞到 4429：不結束，等過那一分鐘自己回來。
- `context.setOffline(true)` 後再上線：自己回來，桌面一致。
- 既有的「socket 看起來開著但什麼都不通」與「回到頁面立刻檢查」照舊通過。

單元測試：`tests/lib/roomConnection.test.ts`（第一次連線重試與 20 s 放棄、4429 的暫停與 5 分鐘結束、`resume` 只在斷線後、排隊／逾時／上限、`onResumed`）、`tests/pages/RoomPage.test.tsx`（提示晚 1 s、立刻重試、已重新連線）、`tests/worker/abuse.test.ts`（`resume` 額度）、`tests/kart/serverClock.test.ts`（重新對時）。

## 4. 還沒做、可以接著做

- 已經送出但沒有回音的那一下（socket 其實已死）仍只提示「可能沒送到」，不自動重送：伺服器沒有訊息序號去重，重送可能重複下注。要做就要在協定加 `seq` 與每成員最後序號。
- 卡丁車比賽中斷線超過幾秒，伺服器那邊這台車就停在原地；回來後照新的 `welcome` 繼續，但中間的名次不會補。
- 沒有在真手機上量（iOS Safari 背景幾分鐘就會把 socket 整個關掉，回來靠 `visibilitychange` 立刻重連）。擁有者試玩時可以留意「回到 App 後多久能操作」。
