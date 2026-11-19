# SECURITY — 安全複查（P1，`e12-t13`）

2026-11-19 的複查結論。範圍：WebSocket 來源檢查、CSP 與其他安全標頭、依賴、房間 API 的速率限制、擁有者端點的權限。下一次複查（或新增對外端點、外部資源）時照這份的表格逐項重看。

## 1. 結論一覽

| 項目 | 現況 | 這批做了什麼 |
| --- | --- | --- |
| WebSocket 升級的 Origin | `/ws/<id>`：瀏覽器送的 `Origin` 必須等於本站（`worker/rooms.ts`），否則 403 `forbidden_origin`；沒有 `Origin` 的（非瀏覽器）放行 | 不用改。實測擋外部來源（§2） |
| CSP | 原本沒有 | 加上（§3），`_headers` 由 build 產生 |
| 其他安全標頭 | 原本沒有 | `X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy`、`Cross-Origin-Opener-Policy`、`X-Frame-Options`（§4） |
| 依賴 | `npm audit`：0 個弱點 | 沒有安全更新要做，沒升級（§5） |
| 建房速率 | 原本沒有限制 | 每個 Worker instance 每個位址每分鐘 30 間（§6）；PRD 的「每 IP 每分鐘 5 間、跨 instance」仍是 `e12-t06` |
| 擁有者端點 | `/api/stats` 要 `STATS_KEY` | 新的 `/api/admin/flags`、`/api/admin/usage` 共用同一個檢查（`worker/owner.ts`）（§7） |

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
- **Service worker**（`public/sw.js`）：同源，`worker-src 'self'`。
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

## 6. 速率限制現況

| 端點 | 限制 | 在哪 |
| --- | --- | --- |
| `POST /api/rooms`（開房） | **每個 Worker instance、每個位址每分鐘 30 間，instance 合計 600 間**，超過 429（`retry-after: 60`）。這批加的 | `worker/rooms.ts`、`worker/rate-limit.ts` |
| `POST /api/errors` | 每位址每分鐘 10 則、instance 合計 120 則 | `worker/errors.ts` |
| 聊天 | 每人每 10 秒 10 則 | `shared/chat.ts`、`RoomHost` |
| 表情 | 每人間隔 `REACTION_MIN_MS` | `RoomHost` |
| 房間密碼 | 錯 `PASSWORD_TRIES` 次關掉 socket | `RoomHost` |
| WebSocket | 每房 `MAX_CONNECTIONS` 條、`MAX_MEMBERS` 人 | `RoomHost.admit` |
| `GET /api/lobby`、`GET /api/rooms/<id>`、`GET /api/codes/<code>`、`GET /api/flags` | **沒有** | — |
| `/api/telemetry` | 只收區間計數，見 `worker/telemetry.ts` | — |

說明：

- 記憶體裡的固定視窗：每個 instance 各算各的，instance 重啟就忘，所以不精確；它只防一個位址的腳本灌爆免費額度，不需要儲存，位址也不落地。30 間遠高於真人，也高於從一台電腦跑整套 Playwright（e2e 一個 worker 一分鐘開不到十幾間房）。
- PRD 的「每 IP 每分鐘 5 間、跨 instance」與暱稱過濾、管理頁權限的其餘部分仍是 `e12-t06`（M1，未做）。要做跨 instance 的精確限制可以用 Cloudflare 的 Rate Limiting binding（`ratelimits`）或 LobbyDO 計數。
- GET 端點沒有限制：它們只讀、回應很小，Cloudflare 的 DDoS 防護在前面；成本儀表板會先看到異常（每日 Workers 請求 80% 警示）。

## 7. 擁有者端點

`/api/stats`、`/api/admin/flags`（GET／PUT）、`/api/admin/usage` 都走 `worker/owner.ts` 的 `ownerRefusal`：

- 沒有 `STATS_KEY` secret → 404（站上看不出有這些端點）。
- 金鑰用 `Authorization: Bearer <key>`，固定時間比對；別的網站的頁面不能讓瀏覽器帶這個標頭，所以 PUT 沒有 CSRF 問題（跨站的帶自訂標頭請求要過 CORS preflight，本站不回 CORS 標頭）。
- 金鑰存在擁有者那台瀏覽器的 localStorage（`/stats` 的「忘記這個瀏覽器的金鑰」可清掉）。
- Cloudflare 的 API token（成本儀表板）只在 Worker 的 secret，**不進前端、不進 repo**；建議只給 Account Analytics 讀取權限（`DEPLOY.md` §13）。

## 8. 實測（#107）

PR 預覽站（`tku-arcade-pr-107`）：

- 標頭：首頁與靜態檔都帶 §3、§4 的標頭；`/api/flags` 的 JSON 帶 `X-Content-Type-Options: nosniff`。
- WebSocket 來源：用 curl 對同一個房間的 `/ws/<id>` 送升級請求：`Origin: https://evil.example` → 403；`Origin: https://tku-arcade.genelee-pro.workers.dev`（正式站，從預覽看是外部來源）→ 403；預覽自己的 origin → 101。
- CSP 沒擋任何東西：`e2e/csp.spec.ts`（`BASE_URL=<預覽> npx playwright test e2e/csp.spec.ts`）開大廳（等 Google Fonts 載完）、規則頁、`/stats`、兩個人經 WebSocket 開一局陞官圖、卡丁車 `/kart/spike` 低畫質 WebGL 自動駕駛並按鍵啟動 Web Audio，收集 console 的 CSP 訊息與 `securitypolicyviolation` 事件：**三個情境都是 0 筆**。反向驗證：同一頁面硬塞一段 inline script 與一個往 `example.com` 的 fetch，兩者都被擋、也都被收集到，表示監聽有效。

本機（`vite` dev，真的 workerd `RoomDO` 與本機 D1，`STATS_KEY` 放 `.dev.vars`）測功能旗標：暫停卡丁車後 `POST /api/rooms` 403、大廳卡片標「維護中」且按鈕停用、`/stats` 按「重新開放」恢復；井字棋房開局後暫停，等過 30 秒快取，**當局照常下完到 `ended`**，「再來一局」回 `game_disabled`，換成陞官圖成功、換回井字棋回 `game_disabled`。預覽站沒有 `STATS_KEY`（每個預覽是新 Worker，沒有 secret），所以預覽站只驗了 `/api/admin/flags` 回 404、`/api/flags` 回空清單。
