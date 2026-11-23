# SECURITY — 安全複查（P1，`e12-t13`）與濫用防護（`e12-t06`）

2026-11-19 的複查結論，2026-11-20 補上 `e12-t06` 的濫用防護（§6、§7、§9）。範圍：WebSocket 來源檢查、CSP 與其他安全標頭、依賴、房間 API 的速率限制、擁有者端點的權限。下一次複查（或新增對外端點、外部資源）時照這份的表格逐項重看。

## 1. 結論一覽

| 項目 | 現況 | 這批做了什麼 |
| --- | --- | --- |
| WebSocket 升級的 Origin | `/ws/<id>`：瀏覽器送的 `Origin` 必須等於本站（`worker/rooms.ts`），否則 403 `forbidden_origin`；沒有 `Origin` 的（非瀏覽器）放行 | 不用改。實測擋外部來源（§2） |
| CSP | 原本沒有 | 加上（§3），`_headers` 由 build 產生 |
| 其他安全標頭 | 原本沒有 | `X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy`、`Cross-Origin-Opener-Policy`、`X-Frame-Options`（§4） |
| 依賴 | `npm audit`：0 個弱點 | 沒有安全更新要做，沒升級（§5） |
| 建房速率 | 原本沒有限制 | 每個 Worker instance 每個位址每分鐘 30 間（§6）；`e12-t06` 加上跨 instance 的每位址每分鐘 10 間（原 5 間，擁有者 2026-11-22 調高） |
| 連線上限 | 每房 72 條／64 人 | `e12-t06`：每房每位址 24 條、每位址每分鐘 120 次升級＋斷線重連另 240 次（§6） |
| 暱稱 | 濾控制字元、方向覆寫、長度 | `e12-t06`：再濾零寬與隱形字元、擋冒充與基本髒話，伺服器端也檢查（§9） |
| 卡丁車排行榜上傳 | — | 2026-11-23：伺服器嚴格解碼重播、逐樣本用房間的判定重跑、檢查兩個樣本之間有沒有穿牆、每位址每分鐘 6 次、256 kB 上限；擋得住改檔，擋不住會開車的腳本（§11） |
| 房間密碼 | 明文存在房間儲存、放在成員的 view | 2026-11-23：只存加鹽 PBKDF2-SHA256（20,000 次），定時比較，舊房間載入時轉成雜湊；view／列表／日誌都沒有密碼；每房每位址 15 分鐘錯 10 次就鎖（§12） |
| 擁有者端點 | `/api/stats` 要 `STATS_KEY` | 新的 `/api/admin/flags`、`/api/admin/usage` 共用同一個檢查（`worker/owner.ts`）；`e12-t06` 加上錯 5 次鎖一分鐘、比對不洩漏長度（§7） |

## 2. WebSocket 來源檢查

- 規則：`Origin` 存在時必須和請求網址的 origin 完全相同。正式站只接受 `https://tku-arcade.genelee-pro.workers.dev`；每個 PR 預覽是自己的 Worker 與網域（`tku-arcade-pr-<號>.genelee-pro.workers.dev`），所以「只允許自己的網域與預覽網域」自然成立：**預覽的頁面連不到正式站的 socket，反之亦然**，也不需要維護一份允許清單。
- 沒有 `Origin` 的連線放行：瀏覽器一定會送 `Origin`，所以這條只擋「別的網站的頁面用訪客的瀏覽器連進來」（跨站 WebSocket 劫持）；非瀏覽器的客戶端本來就能偽造任何標頭，擋它沒有意義，房間的規則與權限在 `RoomHost` 裡另外檢查。
- `POST /api/errors` 用同一條規則。
- 測試：`tests/worker/rooms.test.ts`（`Origin: https://evil.example` → 403）。
- 預覽站實測（#107）：見 §8。

## 3. Content-Security-Policy

由 `shared/security-headers.ts` 產生，`vite.config.ts` 的 `security-headers` 外掛在 build 時寫成 `dist/client/_headers`（套用到所有靜態資產路徑 `/*`）：

```
default-src 'self';
script-src 'self' 'sha256-<index.html 的 inline script>';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: blob:;
media-src 'self' data: blob:;
connect-src 'self';
worker-src 'self';
manifest-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none'
```

逐項的理由：

- **script**：只有本站的檔案，加上 `index.html` 唯一一段 inline script（預先下載語言 chunk）。那段 script 內含每次 build 都不同的 chunk 檔名，所以 hash 只能在 build 時算，這也是 `_headers` 不放在 `public/` 而由外掛寫出的原因。沒有 `'unsafe-inline'`、沒有 `'unsafe-eval'`：Vite 產物、React、three.js 都不用 `eval`。
- **style `'unsafe-inline'`**：styled-components 在執行時寫 `<style>`、React 寫 `style=` 屬性，兩者都不能帶 hash（nonce 需要每次回應不同的 HTML，而頁面是靜態資產）。風險是「能注入 HTML 的人可以改樣式」，前提是先有 HTML 注入；React 預設跳脫輸出，聊天的連結也只轉 `http(s)`（`src/lib/chatText.ts`）。
- **字型**：Google Fonts（`src/styles/webFonts.ts`、陞官圖的 `boardFont.ts`／`fullFont.ts`）：CSS 從 `fonts.googleapis.com`、檔案從 `fonts.gstatic.com`。
- **connect**：只有本站。CSP Level 3 的 `'self'` 包含同主機的 `ws:`／`wss:`，房間 socket 不用另外寫。成本儀表板查 Cloudflare GraphQL 是 Worker 端，不經瀏覽器。
- **卡丁車**：WebGL 不受 CSP 管，shader 不是 script；音效是 Web Audio 合成（`src/kart/kartAudio.ts`），不下載音檔；材質是程式產生的 canvas。`img-src`／`media-src` 的 `data:`、`blob:` 是給 canvas 與將來的 R2 資產留的。
- **Service worker**（`scripts/pwa/sw.js`，build 寫成 `/sw.js`，`ARCHITECTURE.md` §4.56）：同源，`worker-src 'self'`；manifest 是 `manifest-src 'self'`，CSP 沒有為它放寬。它自己的 fetch 也受同一份 CSP（`connect-src 'self'`），所以只處理同源的 GET：頁面永遠走網路（離線才回離線頁）、`/assets/*` 雜湊檔 cache-first；**`/api/*`、`/ws/*`、非 GET 與別的網域完全不攔**，房間與帳號的回應不會進快取。離線頁的副本保留原本的安全標頭；離線頁沒有任何 script（「再試一次」是連結）。新版本等使用者按「重新整理」才接手，頁面本身從不讀快取，所以不會被舊版卡住。
- **字型**（2026-11-21 查過）：Google Fonts 的 CSS 都是 `<link rel="stylesheet">`（`webFonts.ts`、陞官圖的 `boardFont.ts`／`fullFont.ts`），走 `style-src https://fonts.googleapis.com`，字檔走 `font-src https://fonts.gstatic.com`，**沒有任何 `fetch()`**，所以 `connect-src` 維持 `'self'`。`index.html` 的 `preconnect` 不受 CSP 管。service worker 不碰別的網域的請求。`e2e/csp.spec.ts` 除了 0 違規，也查字型真的載入了（大廳的 Saira、陞官圖的霞鶩文楷，以及在 service worker 控制下）；在正式站與 PR 預覽都重現不出 `connect-src` 擋字型 CSS 的情形。
- **不嵌入、不被嵌入**：`frame-ancestors 'none'`（加上舊瀏覽器用的 `X-Frame-Options: DENY`）；LongTalk 語音房是開新分頁，不是 iframe。
- **form-action `'self'`**：站內的表單都是 JS 送出；登入是導向牌桌的連結（導覽，不受 `form-action` 管）。

開發伺服器（`npm run dev`）不套用 `_headers`（Vite 的 HMR 需要 inline script），所以 CSP 只在 build 後（預覽站、正式站、`vite preview`）生效。改了 `index.html` 的 inline script 或加了新的外部來源（CDN、字型、圖片網域）時，要改 `shared/security-headers.ts`，並在預覽站開幾款遊戲看 console 有沒有 `Content Security Policy` 錯誤。

## 4. 其他安全標頭

靜態資產（`_headers`）與 Worker 自己的回應（`worker/security.ts`，WebSocket 升級除外）都有：

| 標頭 | 值 | 為什麼 |
| --- | --- | --- |
| `X-Content-Type-Options` | `nosniff` | JSON 與上傳內容不會被當成 script／HTML |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | 房間網址（含房間 id）不會整條送給外部網站 |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), browsing-topics=()` | 本站都不用；語音在 LongTalk。卡丁車的搖桿（Gamepad）、全螢幕、剪貼簿、震動維持預設（同源可用） |
| `Cross-Origin-Opener-Policy` | `same-origin` | 開出去的分頁（LongTalk、牌桌登入）拿不到本頁的 `window` |
| `X-Frame-Options` | `DENY` | 同 `frame-ancestors 'none'`，給舊瀏覽器 |

`*.workers.dev` 在 HSTS preload 清單上（`.dev` 整個頂級網域），所以沒有另外送 `Strict-Transport-Security`；換自訂網域時要加。

## 5. 依賴

2026-11-19：`npm audit` 回報 **0 個弱點**，所以沒有「安全更新」要做。為了不和平行的卡丁車分支在 `package-lock.json` 上衝突，這批沒有順手升級。可以升的版本（`npm outdated`）：

| 套件 | 現在 | 同一主版本最新 | 最新 | 備註 |
| --- | --- | --- | --- | --- |
| `vite` | 8.3.5 | 8.3.8 | 8.3.8 | patch |
| `vitest` | 5.1.0 | 5.1.1 | 5.1.1 | patch |
| `@vitejs/plugin-react` | 6.2.1 | 6.3.0 | 6.3.0 | minor |
| `oxlint` | 1.90.0 | 1.94.0 | 1.94.0 | minor，可能多新規則 |
| `wrangler` | 4.156.2 | 4.165.0 | 4.165.0 | minor |
| `@cloudflare/vite-plugin` | 1.67.0 | 1.70.1 | 1.70.1 | minor，和 wrangler 一起升 |
| `@cloudflare/workers-types` | 5.20261103.1 | 5.20261119.1 | 同 | 型別 |
| `three`、`@types/three` | 0.186 | — | 0.187 | 0.x 的 minor 等於 major，**不升**（卡丁車要一起驗） |
| `@playwright/test` | 1.64.0 | — | 1.65.1 | 固定版本（視覺回歸容器 `v1.64.0`），要一起換 |
| `jsdom` | 30.1.3 | — | 31.0.1 | major，不升 |
| `@testing-library/jest-dom` | 7.0.1 | — | 8.0.0 | major，不升 |

建議在沒有其他分支開著的時候開一個小 PR 一次升 patch／minor（`npm update`），跑完整 CI 與 e2e。

## 6. 速率限制與連線上限現況

| 端點 | 限制 | 在哪 |
| --- | --- | --- |
| `POST /api/rooms`（開房） | **每位址每分鐘 10 間**（擁有者 2026-11-22 從 5 間調高），所有 instance、所有機房共用（`LimiterDO`，`e12-t06`）；前面還有每 instance 每位址 30 間、instance 合計 600 間的記憶體限制（`e12-t13`）。超過 429（`retry-after: 60`），大廳 toast「你所在的網路剛開了太多房間」 | `worker/rooms.ts`、`worker/rate-limit.ts` |
| `/ws/<id>`（WebSocket 升級） | **每位址每分鐘 120 次**（`LimiterDO`）；用完後，帶 `?resume=1` 的（頁面斷線後重連）另有 **240 次**（`resume` 桶，2026-11-22）；超過時接受再以 **4429** `tooManyConnections` 關閉，不叫醒房間。頁面把 4429 當成「等一下」：至少 20 秒後再試，5 分鐘都還是 4429 才顯示「連線太多」（`docs/NETWORK.md`） | `worker/rooms.ts` |
| WebSocket（房內） | 每房 `MAX_CONNECTIONS`（72）條、`MAX_MEMBERS`（64）人；**每房每位址 `MAX_CONNECTIONS_PER_ADDRESS`（24）條**（含旁觀，`e12-t06`），超過 4429 | `RoomHost.admit` |
| 擁有者金鑰 | 每位址每分鐘錯 5 次後鎖一分鐘（§7） | `worker/owner.ts` |
| `POST /api/errors` | 每位址每分鐘 10 則、instance 合計 120 則 | `worker/errors.ts` |
| `POST /api/kart/board`（排行榜上傳，2026-11-23） | **每位址每分鐘 6 次**（`LimiterDO` 的 `board` 桶）＋每 instance 每位址 6 次、合計 120 次；body 256 kB（邊讀邊數）；超過 429 `rateLimited`／413 | `worker/kartBoard.ts` |
| `GET /api/kart/board/replay`（下載重播） | 每 instance 每位址每分鐘 60 次、合計 1200 次 | `worker/kartBoard.ts` |
| 聊天 | 每人每 10 秒 10 則、每則 500 字 | `shared/chat.ts`、`RoomHost` |
| 表情 | 每人間隔 `REACTION_MIN_MS` | `RoomHost` |
| 房間密碼 | 每條 socket 錯 `PASSWORD_TRIES`（5）次關掉；**每房每位址 15 分鐘錯 `PASSWORD_FAILS`（10）次**後，那個位址到視窗結束前的加入一律 `rate_limited` 並關掉 socket，不再算雜湊（存在房間儲存，換 socket、休眠都不歸零；2026-11-23，§12） | `RoomHost` |
| `GET /api/lobby`（大廳與卡丁車房間列表，2026-11-23） | **每 instance 每位址每分鐘 240 次**、instance 合計 2 萬次（記憶體，不走 `LimiterDO`：列表每 10 秒輪詢，每次多一個 DO 請求不划算；本機不限）；每個 instance 把 LobbyDO 的回答沿用 2 秒；`?game=` 不是遊戲 400 | `worker/app.ts`、`worker/lobby-list.ts` |
| `/ws/lobby`（卡丁車房間列表推送，2026-11-23） | 同站 `Origin`；**每 instance 每位址每分鐘 30 次升級**、instance 合計 3,000 次（記憶體，本機不限），超過以 4429 關掉、不叫醒 LobbyDO；LobbyDO 同時開著的**全站 1,000 條、每位址 12 條**，超過 4429（頁面退回輪詢）；頁面只能送 `ping`，其他訊息關掉（4422） | `worker/app.ts`、`worker/lobby-feed.ts` |
| `POST /api/rooms/quick`（卡丁車快速加入，2026-11-23） | 找房吃上一列的 240 次；真的開新房時再吃 `POST /api/rooms` 的全部額度（每位址每分鐘 10 間）；房名照暱稱規則（§9），不合 400 `bad_name` | `worker/rooms.ts` |
| `GET /api/rooms/<id>`、`GET /api/codes/<code>`、`GET /api/flags` | **沒有** | — |
| `/api/telemetry` | 只收區間計數，見 `worker/telemetry.ts` | — |

說明：

- **位址**：`CF-Connecting-IP`，IPv4 整個、IPv6 取 /64（一個家或一支手機拿到整段 /64，可以在裡面換位址），加前綴後 SHA-256，只留前 16 個十六進位字（`worker/address.ts`）。完整位址不存、不寫日誌；雜湊只當 rate limiter 的 key（Cloudflare 那邊只留一分鐘的計數）、房間記憶體裡的連線計數（socket 的 attachment，連線關掉就沒了），以及 2026-11-22 起的**踢人黑名單**：房間儲存裡每個成員記著最後一次加入的位址雜湊（`MemberRecord.address`，房間刪掉就一起沒了；沒人用的房間最晚 24 小時就刪），被踢的那筆黑名單（`RoomRecord.bans`）記著位址雜湊＋名字 10 分鐘（`KICK_BAN_MS`）。都不進任何 view、不寫日誌。
- **LimiterDO**（`worker/limiter.ts`，DO migration `v2`）：依位址雜湊的第一個字分 16 個物件，每個物件在記憶體裡對每個桶（`create`／`socket`／`resume`／`ownerFail`，數字在 `worker/rate-limit.ts` 的 `SHARED_LIMITS`）做每分鐘的固定視窗，**不寫儲存**；物件被回收就忘掉，只會讓人早點能再試。所有 instance 與機房都問同一個物件，所以計數精確。物件不存在（沒有 binding）或出錯時放行（限制器壞掉不該把網站一起拖垮），只剩每 instance 的記憶體限制。代價：每次建房、每次 WebSocket 升級、每次錯的金鑰多一次 DO 請求（免費額度每日 10 萬次）。
- **為什麼不用 Cloudflare 的 Rate Limiting binding**：先做過（`ratelimits`，#110 的第一版）：部署成功、binding 有列出，但預覽站的日誌顯示同一個 key 連打 25 次都回 `success: true`，在這個帳號上沒有作用。它本來也只在單一機房內共用、最終一致。
- **本機**：127.0.0.1、::1 不經 LimiterDO（Cloudflare 不會報這種位址），所以 `npm run dev` 與整套瀏覽器測試不會被擋。
- **踢人黑名單**（2026-11-22，`shared/protocol.ts` 18.）：被踢的人 10 分鐘內，同一個 seat token、同一個社團帳號、或「同一個位址雜湊**而且**同一個名字」都進不來（4411）。不只看位址是刻意的：同一個校園 Wi-Fi 或宿舍共用一個位址，只看位址會把整桌朋友都擋掉。代價：換名字或換網路就能回來；朋友圈可以接受，再不行就設房間密碼或解散另開。
- **共用位址**：同一個校園 Wi-Fi 或手機網路的人共用位址。10 間／分鐘、120 次升級／分鐘（重連另 240 次：一次部署會讓所有 socket 同時斷，一整桌在同一個校園位址一起回來不該被當成洪水；`resume` 是誰都能帶的參數，所以這是「額外的額度」不是繞過，腳本最多 360 次）、每房 24 條是照「幾桌朋友在同一個 Wi-Fi」抓的（建房原本 5 間，2026-11-22 擁有者為校園 Wi-Fi 調成 10）；「再來一局」與換遊戲都不算建房。
- **聊天以外的文字**：遊戲內的文字輸入都由規則在伺服器限長度、也只在該輪能送（撞詞與搭橋的提示 12 字、撞詞猜答 20 字、光譜的答案 30 字：`shared/games/*/clue.ts`、`answer.ts`），所以不另外限速率；每則訊息還有 `MAX_CLIENT_MESSAGE_CHARS`。沒有題目投稿、卡丁車名牌；卡丁車編輯器的分享碼只在瀏覽器解析。
- 其他 GET 端點沒有限制：它們只讀、回應很小，Cloudflare 的 DDoS 防護在前面；成本儀表板會先看到異常（每日 Workers 請求 80% 警示）。`GET /api/lobby` 2026-11-23 起有記憶體限制，因為卡丁車的房間列表會一直輪詢、而且每次都可能叫醒 LobbyDO。
- **公開房列表露出什麼**（2026-11-23）：房主暱稱、房名、遊戲、人數、電腦車數、狀態（等待中／比賽中）、有沒有密碼、`select`／`int` 選項（賽道、模式、圈數）；**不露出**密碼本身、成員名單、房號以外的任何識別、自訂賽道代碼這類打字欄位。只有房主設成公開的房間才列；有密碼的公開房列成「鎖著」，大廳首頁的列表照舊不列。

## 7. 擁有者端點

`/api/stats`、`/api/admin/flags`（GET／PUT）、`/api/admin/usage`、`/api/admin/kart-board`（DELETE，2026-11-23）都走 `worker/owner.ts` 的 `ownerRefusal`：

- 沒有 `STATS_KEY` secret → 404（站上看不出有這些端點）。
- 金鑰用 `Authorization: Bearer <key>`，固定時間比對（`e12-t06` 起連長度都不洩漏：時間只看正確金鑰的長度）；**不在網址裡**，所以不會出現在 Worker 日誌或瀏覽器紀錄，Worker 也不 log 標頭；別的網站的頁面不能讓瀏覽器帶這個標頭，所以 PUT 沒有 CSRF 問題（跨站的帶自訂標頭請求要過 CORS preflight，本站不回 CORS 標頭）。
- **暴力嘗試**（`e12-t06`）：同一個位址一分鐘內錯 5 次（`LimiterDO`，或單一 instance 的記憶體計數）之後，這個 instance 一分鐘內對它一律回 429（`retry-after: 60`），**連對的金鑰也一樣**；別的 instance 在它下一次錯的時候就知道（LimiterDO 已經超過）。對的金鑰從不計數。`/stats` 顯示「金鑰錯太多次了」。金鑰本身應該是長的隨機字串（`DEPLOY.md` §12）。
- 金鑰存在擁有者那台瀏覽器的 localStorage（`/stats` 的「忘記這個瀏覽器的金鑰」可清掉）。
- Cloudflare 的 API token（成本儀表板）只在 Worker 的 secret，**不進前端、不進 repo**；建議只給 Account Analytics 讀取權限（`DEPLOY.md` §13）。

## 8. 實測（#107）

PR 預覽站（`tku-arcade-pr-107`）：

- 標頭：首頁與靜態檔都帶 §3、§4 的標頭；`/api/flags` 的 JSON 帶 `X-Content-Type-Options: nosniff`。
- WebSocket 來源：用 curl 對同一個房間的 `/ws/<id>` 送升級請求：`Origin: https://evil.example` → 403；`Origin: https://tku-arcade.genelee-pro.workers.dev`（正式站，從預覽看是外部來源）→ 403；預覽自己的 origin → 101。
- CSP 沒擋任何東西：`e2e/csp.spec.ts`（`BASE_URL=<預覽> npx playwright test e2e/csp.spec.ts`）開大廳（等 Google Fonts 載完）、規則頁、`/stats`、兩個人經 WebSocket 開一局陞官圖、卡丁車 `/kart/spike` 低畫質 WebGL 自動駕駛並按鍵啟動 Web Audio，收集 console 的 CSP 訊息與 `securitypolicyviolation` 事件：**三個情境都是 0 筆**。反向驗證：同一頁面硬塞一段 inline script 與一個往 `example.com` 的 fetch，兩者都被擋、也都被收集到，表示監聽有效。

本機（`vite` dev，真的 workerd `RoomDO` 與本機 D1，`STATS_KEY` 放 `.dev.vars`）測功能旗標：暫停卡丁車後 `POST /api/rooms` 403、大廳卡片標「維護中」且按鈕停用、`/stats` 按「重新開放」恢復；井字棋房開局後暫停，等過 30 秒快取，**當局照常下完到 `ended`**，「再來一局」回 `game_disabled`，換成陞官圖成功、換回井字棋回 `game_disabled`。預覽站沒有 `STATS_KEY`（每個預覽是新 Worker，沒有 secret），所以預覽站只驗了 `/api/admin/flags` 回 404、`/api/flags` 回空清單。

## 9. 暱稱（`e12-t06`）

`shared/protocol.ts` 的 `normalizeName`（瀏覽器送出前與伺服器收到時都跑）：

- 刪控制字元、方向覆寫（原本就有），再刪**看不見的字元**：軟連字號、零寬空格與零寬不連字、方向標記、word joiner 與隱形運算子、韓文填充字、點字空白、BOM、tag 字元。零寬連字（ZWJ）只留在 emoji 中間（👩‍💻）。
- 空白（含**全形空白**）收成一個半形空白、去頭尾；剩下沒有可見字元或超過 16 個字（code point）就不收。

`shared/nickname.ts` 的 `nameProblem`，清單在 `shared/nickname-words.ts`（可以直接改；英文先做 NFKC 與小寫，`ＡＤＭＩＮ` 等於 `admin`）：

- **冒充**：英文詞（admin、moderator、system、host、owner、official、tkuarcade…）要整個名字去掉非字母後剛好是那個字才擋（`admin_01`、`[System]` 擋；`Badminton`、`Hostess` 不擋）；中文詞（房主、管理員、系統、站長、官方、客服…）出現在名字任何地方就擋。
- **髒話**：英文整個單字（shit、bitch…，`shiitake` 不擋）或任何位置都不會是正常字的（fuck、nigger…，含 `f.u.c.k`）；中文的明顯罵人詞組（幹你娘、操你媽、雞掰…）。**單字「幹」不擋**（幹部、能幹）。清單刻意短：它進每個人的首屏，而且擋到正常名字比漏掉創意拼法更糟；真的有人亂取名，房主可以踢。
- 表單邊打邊提示（`nickname.reserved`／`nickname.blocked`／長度）；伺服器在 `join` 用同一套檢查（`acceptableName`），不過就當協定錯誤關閉（4422），因為正常的頁面送不出這種名字。localStorage 裡存的舊暱稱不合規時會重新問。登入帳號的名字來自牌桌、不經這個檢查。
- 測試：`tests/worker/abuse.test.ts`（擋與不擋的例子都列了）、`tests/components/NicknameForm.test.tsx`。
- **房名**（2026-11-23，`shared/roomName.ts`）：卡丁車建房與快速加入可以取房名，公開房的房名會給陌生人看，所以用同一套：`normalizeText` 清理（最多 24 字）＋`nameProblem` 同一份清單；伺服器在 `POST /api/rooms`、`/api/rooms/quick` 檢查，不合回 400 `bad_name`（不默默丟掉）；表單邊打邊提示。測試 `tests/worker/lobby-list.test.ts`、`tests/kart/onlineView.test.tsx`。


## 10. 實測（#110）

PR 預覽站（`tku-arcade-pr-110`），從一台電腦（同一個 IPv6 /64）：

- **建房**：連續 7 次 `POST /api/rooms` → `201 ×5、429 ×2`，429 帶 `Retry-After: 60`。第一版用 Rate Limiting binding 時同樣的測試是 25 次全部 201（日誌裡每次 `success: true`），所以換成 `LimiterDO`。
- **WebSocket 升級**：對一個不存在的房間連續開 125 條 → 120 條 4404（找不到房間）、5 條 **4429**。
- **每房每位址**：同一個房間開 26 條並送 `join` → 24 條留著、第 25、26 條 **4429**。
- **暱稱**：`join` 送 `系統`、`Admin` → 4422；`A` + 零寬空格 + `l` → 正常加入。
- **擁有者金鑰**：預覽沒有 `STATS_KEY`（端點 404），鎖定只有單元測試。

## 11. 卡丁車排行榜的防作弊（2026-11-23，`feat/kart-leaderboard`）

計時賽排行榜（`ARCHITECTURE.md` §4.81）收的是瀏覽器錄的重播檔，所以**檔案裡的每個 byte 都當成攻擊者寫的**。目標是朋友圈等級：改一下檔案、改一下時間、拿別張圖或舊版路線的檔案，都上不了榜；真的要作弊的人得寫一個在物理限制內開車的程式。

**伺服器做的事**（`worker/kartBoard.ts` → `shared/kart/boardCheck.ts`，任何一項不過就拒收、不寫入）：

| 檢查 | 擋什麼 | 拒收原因 |
| --- | --- | --- |
| 同站來源（`Origin`）、每位址每分鐘 6 次、body 256 kB 邊讀邊數 | 別的網站代送、洗版、大檔 | 403、`rateLimited`、`tooBig` |
| 賽道是 14 張內建比賽賽道之一；網址的 `revision` 與檔頭的 `revision` 都等於伺服器現在的路線版本 | 自訂與挑戰賽道、舊路線的成績混進新榜 | `track`、`revision` |
| 物理戳記（`boardStamp.ts`：所有調參、車款數字的雜湊＋手動的 `BOARD_PHYSICS_REVISION`）等於這次部署的 | 部署前開著的分頁用舊物理跑的成績 | `physics` |
| 暱稱照 #110 的規則（`acceptableName`：不可見字元、冒充、髒話） | 冒充、亂取名 | `nickname` |
| 嚴格解碼（`readReplayFile`：檔案 2 MB、解壓邊解邊數 8 MB、標頭逐欄、meta 逐欄、每個陣列有上限、多的 bytes 就整個不收；`KART-NETCODE.md` §11.4） | 壞檔、壓縮炸彈、塞奇怪欄位 | `file` |
| 形狀：一台車、`mode: 'race'`、本賽道的圈數、沒有道具事件與子彈、沒有隊伍 | 拿比賽或道具賽的重播來充 | `shape` |
| 樣本：從 tick 0、在計時賽起點 2 m 內、速度 < 1 m/s 開始；相鄰樣本 1–6 tick（錄影器每 6 tick 一個，**不能有洞**）；最多 12,000 個；整趟同一個車款車手 byte；只有最後一個樣本是「完賽」 | 截掉一段、從中間開始、半路換車 | `samples` |
| **每個樣本用房間判 live frame 的同一個 `judgeFrame`**：車款自己的速度上限（`speedCapFor`，所有加速疊起來 × 1.5）、兩個樣本間的距離不能超過速度上限允許的＋12 m、重置只能落在復位點／起點 30 m 內、不能穿過關著的閘門或貨櫃、座標在 ±20 km 內 | 改速度、瞬移、假重置、穿閘門 | `speed`、`jump`、`reset`、`obstacle`、`far` |
| **穿牆**（2026-11-23，`boardWalls.ts`，`ARCHITECTURE.md` §4.94）：相鄰兩個樣本連成的直線不能穿過當時擋在那個高度的牆。物理保證真的車中心永遠不越過牆線，所以只排除三種合法的：繞過牆的**自由端**（1.2 m 內；兩面牆相接的地方沒有縫）、**飛過**有 `top` 的牆（高度由伺服器自己從跳台算拋物線，沒有跳台可起跳的「在空中」當在地上）、立體交叉與高台正面的 `base`／`top`（車在哪一層由伺服器從上一個樣本一路跟）；高度兩邊各留 1 m，弦的任一端合法就放過；重置那一段不看 | 在路上直接穿過矮欄或高台正面（不跳）、穿出路緣再回來、從並行的另一條路切過來 | `wall` |
| **gate 由伺服器自己數**（線段穿過 gate 才算、照順序、倒著過會退回去）；房間會在 gate 附近相信車子自己報的數字（live frame 可能掉），重播不會掉樣本，所以只有「重置」那一個樣本的自報被參考（重置是立刻存的，可能剛好跟在過 gate 之後） | 繞在路旁、抄近路漏 gate、少跑一圈 | `laps` |
| 伺服器數到的圈數＝賽道圈數；每一圈結束的時間（在兩個樣本間內插）和檔案寫的累計時間差 ≤ 120 ms；總時間＝最後一個樣本的 tick（±1 ms）；各圈加起來＝總時間。位置存到公分，終點樣本可能剛好落在線上：最後一個樣本少一個 gate 時沿速度往前 2 cm 再判一次（只寬 2 cm） | 改成績、改圈時間、整段時間壓縮、提早結束 | `time`、`laps` |

拒收時 Worker 日誌一行 `{"event":"kart_board_refused","why":…,"track":…,"at":<第幾個樣本>}`，並記進 `daily_metrics`（`metric = 'board_upload'`，`game` 欄＝原因）；收下的記 `improved` 或 `kept`。擁有者看到明顯不對的成績，`DELETE /api/admin/kart-board?id=<列 id>`（`Authorization: Bearer <STATS_KEY>`；列 id 在 `GET /api/kart/board` 的回應裡）。

**擋不住的事**（寫清楚，不假裝）：

- **會開車的程式**：改瀏覽器、注入腳本、或用站上測試用的 `?autopilot` 開出來的一趟，只要每一步都在物理之內，就是一趟真的可以開出來的成績，伺服器分不出是誰在開。內建的自動駕駛是慢的保守駕駛，上得了榜但排不前面；寫一個比人快的程式要花的力氣，遠超過朋友圈的排行榜值得的。速度上限是「所有加速同時疊起來再 × 1.5」，所以「一直維持接近上限」的假檔也過得了速度檢查，只是這種檔要自己把整條路的每個樣本、gate 與時間都算對。
- **穿牆的剩餘空間**（2026-11-23 起有檢查，上表）：為了 0 誤殺留的寬容可以被利用，但都很小：牆的自由端 1.2 m 內（岔路口路緣的尾巴）可以切；飛越有 `top` 的牆時高度寬 1 m（矮欄可以「低飛 1 m」擦過去，但前提是真的從跳台起跳、而且速度夠）；弦只要有一端合法就放過（剛離開高台或剛起飛那一段）。樣本之間 0.1 s 的路徑是伺服器猜的直線，一條牆如果薄到能整個藏在兩個樣本之間（例如只有幾公尺長、離兩個樣本都很近），偽造的檔案可以把它「繞」過去。移動障礙物照舊由 `throughObstacle` 依比賽時鐘判。驗證：28 張圖 × 自動駕駛與四級駕駛（含大師的技術線）× 21 台車輪流 × 一半夾重置，616 趟 0 誤殺；一趟的穿牆檢查 0.1–1.1 ms（`ARCHITECTURE.md` §4.94）。
- **調參**：只在瀏覽器擋（只有標準調參的一趟會給上傳鈕）；伺服器看不到調參，只靠速度上限與跳點。
- **暱稱不是身分**：還沒有帳號（F1），任何人都能用任何沒被擋的暱稱上傳，包括別人的暱稱（它只會在比原本快時蓋掉那一列）。F1 上線後的認領方式見 `ARCHITECTURE.md` §4.81。
- **位址**：每分鐘 6 次是每個位址；換網路就能再傳。上傳很貴的部分（解壓、判樣本、穿牆）一趟約 1–7 ms CPU（穩態；一個 isolate 第一次判某張圖要建牆的索引，多幾 ms）。
- 重播檔是公開的：誰都能下載任何一列的 `.tkureplay`；裡面只有路線、時間與暱稱。

## 12. 房間密碼只存雜湊（2026-11-23，`feat/room-security-push`）

#168 回報「專案原本就沒有密碼雜湊，密碼是明碼門牌」：房間密碼（e1-t16）原本照打的字存在 RoomDO 儲存，還放在每個成員的 view 裡讓大家轉給朋友。它只是朋友間的門牌，但人會重複用自己慣用的字，所以改成：

- **存什麼**：`RoomRecord.passwordHash = { salt, hash, iterations }`（`worker/room-password.ts`）。PBKDF2-SHA256，**每次設密碼一個新的 16 bytes 隨機 salt**，輸出 32 bytes，十六進位存。用 Web Crypto（`crypto.subtle`），Workers 與 Node 都有，不用 `nodejs_compat`。
- **迭代 20,000 次**：本機量 ~3.4 ms CPU（Node 與 Workers 都是原生 BoringSSL／OpenSSL 的同一段），一次加入或 `set_password` 連同其他工作仍在免費方案每次事件 10 ms CPU 之內；100,000 次要 ~16 ms 會超過。線上猜密碼靠下面的速率限制擋，雜湊是讓「拿到一份儲存／備份／除錯輸出」的人讀不回原文。每筆雜湊記著自己的次數，以後調高不會鎖住舊房間。
- **比對**：一定跑一次完整的 PBKDF2，再把 32 bytes 全部比完（`sameBytes`，沒有提早跳出，沿用 #110 管理金鑰 `sameKey` 的寫法）；錯的和對的花一樣久，跟猜中幾個字無關。
- **非同步怎麼接**：`RoomHost` 是同步的（測試直接跑），雜湊是非同步的。`RoomHost.passwordWork(conn, raw)` 說這則訊息需不需要先算：新來的人帶密碼的 `join` 要比對、房主的 `set_password` 要雜湊；其他訊息（含帶 seat token 回來的成員、已被鎖的位址）回 `null` 走原本的快路。RoomDO 在 `blockConcurrencyWhile` 裡算完再把結果（`PasswordPrep`）交給 `message`，房間的訊息順序不變。建房（`POST /api/rooms` → `RoomDO.create`）在 DO 裡先雜湊再交給房間，明文不進儲存。沒有雜湊結果的 `set_password`（繞過 RoomDO）回 `unavailable`，絕不改存明文。
- **遷移**：舊房間儲存裡的 `password`（明文）在 DO 下次載入時（建構子的 `blockConcurrencyWhile`，任何訊息之前）雜湊成 `passwordHash` 並在同一次寫入刪掉明文（`legacyPassword`／`migratePassword`）。遷移前的那一刻（只有 `RoomHost` 單獨跑時才會遇到）照樣能進：兩邊各取 SHA-256 再定時比較（`sameLegacyPassword`）。
- **不出現的地方**：view 只有 `room.locked: true`（`RoomInfo.password` 拿掉了）；`summary()`、`listing()`／`GET /api/lobby` 只有 `locked`；錯誤只有 `password_required`／`wrong_password`／`rate_limited`；沒有任何 `console.*` 帶密碼（測試攔下所有 console 輸出檢查）。**代價**：房裡的人看不到密碼了。房主看到的是「這個瀏覽器設的那個」（設定時存在 `sessionStorage`，`src/lib/roomPassword.ts`，原本就拿來重連），其他成員只看到「這個房間有密碼」，要密碼問設的人。
- **速率限制**：每條 socket 錯 5 次關掉（原本就有）；新加**每房每位址**（`connection.address`，§6 的位址雜湊；沒有位址的算同一個 `unknown`）15 分鐘錯 10 次就鎖到視窗結束，鎖住時連對的密碼也不收、也不算雜湊（擋 CPU 消耗）。計數存在房間儲存的 `pwfails` 一個 key（最多 200 個位址，舊的先丟），換 socket、DO 休眠都不歸零；房間刪掉就一起沒了。校園共用位址：一整桌朋友 15 分鐘內合計打錯 10 次才會被擋，朋友圈可以接受。
- **擋不住的事**：密碼仍然從瀏覽器以明文經 TLS 送到 Worker（WebSocket 的 `join`、`POST /api/rooms` 的 body），Worker 與 DO 的記憶體裡短暫有它；Cloudflare 的請求日誌不記 body 與 WebSocket 內容。門牌最多 32 字，短的門牌被拿到雜湊後仍可離線暴力猜（20,000 次只是讓它慢）；它本來就不是保護帳號的密碼。
- **測試**：`tests/worker/room-password.test.ts`（對／錯、每次 salt 不同、照存的次數比、`sameBytes` 每個位置都決定結果、近似與差很多的猜測花的時間同量級、舊明文比對）、`tests/worker/room-host.test.ts` 的「a room password」（建房設密碼、正確／錯誤、儲存與 view 只有雜湊／`locked`、成員回來不算雜湊、房主設定與拿掉、沒有雜湊不存明文、公開房標鎖、每 socket 5 次、每位址 10 次跨 socket 與休眠、鎖住時對的也不收且不算、換位址不受影響、視窗過後可再試、日誌不含密碼、舊明文遷移）、`tests/components/WaitingRoom.test.tsx`（房主看到自己設的、成員只看到有密碼）、`e2e/rooms-i3.spec.ts`。
