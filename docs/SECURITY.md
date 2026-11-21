# SECURITY — 安全複查（P1，`e12-t13`）與濫用防護（`e12-t06`）

2026-11-19 的複查結論，2026-11-20 補上 `e12-t06` 的濫用防護（§6、§7、§9）。範圍：WebSocket 來源檢查、CSP 與其他安全標頭、依賴、房間 API 的速率限制、擁有者端點的權限。下一次複查（或新增對外端點、外部資源）時照這份的表格逐項重看。

## 1. 結論一覽

| 項目 | 現況 | 這批做了什麼 |
| --- | --- | --- |
| WebSocket 升級的 Origin | `/ws/<id>`：瀏覽器送的 `Origin` 必須等於本站（`worker/rooms.ts`），否則 403 `forbidden_origin`；沒有 `Origin` 的（非瀏覽器）放行 | 不用改。實測擋外部來源（§2） |
| CSP | 原本沒有 | 加上（§3），`_headers` 由 build 產生 |
| 其他安全標頭 | 原本沒有 | `X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy`、`Cross-Origin-Opener-Policy`、`X-Frame-Options`（§4） |
| 依賴 | `npm audit`：0 個弱點 | 沒有安全更新要做，沒升級（§5） |
| 建房速率 | 原本沒有限制 | 每個 Worker instance 每個位址每分鐘 30 間（§6）；`e12-t06` 加上跨 instance 的每位址每分鐘 5 間 |
| 連線上限 | 每房 72 條／64 人 | `e12-t06`：每房每位址 24 條、每位址每分鐘 120 次升級（§6） |
| 暱稱 | 濾控制字元、方向覆寫、長度 | `e12-t06`：再濾零寬與隱形字元、擋冒充與基本髒話，伺服器端也檢查（§9） |
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
| `POST /api/rooms`（開房） | **每位址每分鐘 5 間**，所有 instance、所有機房共用（`LimiterDO`，`e12-t06`）；前面還有每 instance 每位址 30 間、instance 合計 600 間的記憶體限制（`e12-t13`）。超過 429（`retry-after: 60`），大廳 toast「你所在的網路剛開了太多房間」 | `worker/rooms.ts`、`worker/rate-limit.ts` |
| `/ws/<id>`（WebSocket 升級） | **每位址每分鐘 120 次**（`LimiterDO`）；超過時接受再以 **4429** `tooManyConnections` 關閉，不叫醒房間 | `worker/rooms.ts` |
| WebSocket（房內） | 每房 `MAX_CONNECTIONS`（72）條、`MAX_MEMBERS`（64）人；**每房每位址 `MAX_CONNECTIONS_PER_ADDRESS`（24）條**（含旁觀，`e12-t06`），超過 4429 | `RoomHost.admit` |
| 擁有者金鑰 | 每位址每分鐘錯 5 次後鎖一分鐘（§7） | `worker/owner.ts` |
| `POST /api/errors` | 每位址每分鐘 10 則、instance 合計 120 則 | `worker/errors.ts` |
| 聊天 | 每人每 10 秒 10 則、每則 500 字 | `shared/chat.ts`、`RoomHost` |
| 表情 | 每人間隔 `REACTION_MIN_MS` | `RoomHost` |
| 房間密碼 | 錯 `PASSWORD_TRIES` 次關掉 socket | `RoomHost` |
| `GET /api/lobby`、`GET /api/rooms/<id>`、`GET /api/codes/<code>`、`GET /api/flags` | **沒有** | — |
| `/api/telemetry` | 只收區間計數，見 `worker/telemetry.ts` | — |

說明：

- **位址**：`CF-Connecting-IP`，IPv4 整個、IPv6 取 /64（一個家或一支手機拿到整段 /64，可以在裡面換位址），加前綴後 SHA-256，只留前 16 個十六進位字（`worker/address.ts`）。完整位址不存、不寫日誌；雜湊只當 rate limiter 的 key（Cloudflare 那邊只留一分鐘的計數）和房間記憶體裡的連線計數（socket 的 attachment，連線關掉就沒了）。
- **LimiterDO**（`worker/limiter.ts`，DO migration `v2`）：依位址雜湊的第一個字分 16 個物件，每個物件在記憶體裡對每個桶（`create`／`socket`／`ownerFail`，數字在 `worker/rate-limit.ts` 的 `SHARED_LIMITS`）做每分鐘的固定視窗，**不寫儲存**；物件被回收就忘掉，只會讓人早點能再試。所有 instance 與機房都問同一個物件，所以計數精確。物件不存在（沒有 binding）或出錯時放行（限制器壞掉不該把網站一起拖垮），只剩每 instance 的記憶體限制。代價：每次建房、每次 WebSocket 升級、每次錯的金鑰多一次 DO 請求（免費額度每日 10 萬次）。
- **為什麼不用 Cloudflare 的 Rate Limiting binding**：先做過（`ratelimits`，#110 的第一版）：部署成功、binding 有列出，但預覽站的日誌顯示同一個 key 連打 25 次都回 `success: true`，在這個帳號上沒有作用。它本來也只在單一機房內共用、最終一致。
- **本機**：127.0.0.1、::1 不經 LimiterDO（Cloudflare 不會報這種位址），所以 `npm run dev` 與整套瀏覽器測試不會被擋。
- **共用位址**：同一個校園 Wi-Fi 或手機網路的人共用位址。5 間／分鐘、120 次升級／分鐘、每房 24 條是照「一桌朋友在同一個 Wi-Fi」抓的；「再來一局」與換遊戲都不算建房。
- **聊天以外的文字**：遊戲內的文字輸入都由規則在伺服器限長度、也只在該輪能送（撞詞與搭橋的提示 12 字、撞詞猜答 20 字、光譜的答案 30 字：`shared/games/*/clue.ts`、`answer.ts`），所以不另外限速率；每則訊息還有 `MAX_CLIENT_MESSAGE_CHARS`。沒有題目投稿、卡丁車名牌；卡丁車編輯器的分享碼只在瀏覽器解析。
- GET 端點沒有限制：它們只讀、回應很小，Cloudflare 的 DDoS 防護在前面；成本儀表板會先看到異常（每日 Workers 請求 80% 警示）。

## 7. 擁有者端點

`/api/stats`、`/api/admin/flags`（GET／PUT）、`/api/admin/usage` 都走 `worker/owner.ts` 的 `ownerRefusal`：

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


## 10. 實測（#110）

PR 預覽站（`tku-arcade-pr-110`），從一台電腦（同一個 IPv6 /64）：

- **建房**：連續 7 次 `POST /api/rooms` → `201 ×5、429 ×2`，429 帶 `Retry-After: 60`。第一版用 Rate Limiting binding 時同樣的測試是 25 次全部 201（日誌裡每次 `success: true`），所以換成 `LimiterDO`。
- **WebSocket 升級**：對一個不存在的房間連續開 125 條 → 120 條 4404（找不到房間）、5 條 **4429**。
- **每房每位址**：同一個房間開 26 條並送 `join` → 24 條留著、第 25、26 條 **4429**。
- **暱稱**：`join` 送 `系統`、`Admin` → 4422；`A` + 零寬空格 + `l` → 正常加入。
- **擁有者金鑰**：預覽沒有 `STATS_KEY`（端點 404），鎖定只有單元測試。
