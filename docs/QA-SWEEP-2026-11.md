# 全站桌遊巡檢 2026-11

2026-11-20，擁有者要求「其他沒完成的也開多 agent 一起做」：大廳裡每一款桌遊（**不含卡丁車**，另有 agent 在做）從等待室、開局、玩到結束、結果畫面、再來一局，桌機與手機各走一遍，修掉明確的 bug，並留下可以重跑的巡檢腳本。

## 怎麼巡

- **腳本**：`e2e/smoke-games.spec.ts`（驅動在 `e2e/sweep.ts`），設定 `playwright.sweep.config.ts`，`npm run test:sweep`。
- **真的房間**：Vite dev server（`@cloudflare/vite-plugin`，真的 Worker＋RoomDO＋本機 D1）。每款開「最少人數」個瀏覽器 context，房主用 API 建房，其他人走邀請連結進場、入座；房主按畫面上的「開始遊戲」。
- **怎麼下到結束**：每個玩家的 WebSocket 經過 Playwright 的 `routeWebSocket` 轉送，腳本照房間送來的 `GameProjection.legal`（伺服器算的合法動作）隨機挑一步，從**那位玩家自己的 socket** 送出，等房間的 patch 回來再下一步；沒人能動時等房間的倒數（`timer` 訊息）＋15 秒，超過就算卡住。這樣 16 款不必各寫一套驅動，每一步都由伺服器裁定、每個人的畫面照常算繪。隨機來源可重現（`SWEEP_SEED`）。
- **畫面**：桌機 1280×800（英文）、手機 360×740（英文）、手機 390×844（**繁中**，`locale: zh-TW`）。
- **每款檢查**：
  - console error、未處理例外 → 失敗；console warning 記下來。
  - 卡住（沒人能動、倒數也沒推進）、房間拒絕它自己列為合法的動作 → 失敗／記下。
  - 等待室、第一手、每 40 手、結果、再來一局時，每位玩家的頁面：整頁水平捲動、畫面上出現原始 i18n key → 失敗；被別的元素蓋住的按鈕（排除 sticky／fixed 列）、被省略號截斷的字、繁中頁面上連續四個以上英文字 → 記下。
  - axe：等待室、第一手（房主與一位玩家）、後段、結果畫面，serious／critical → 失敗。
  - **重連**：第一手之後一位非房主玩家重新整理：要回到同一個座位、同一局（重新整理期間房間沒變時，重連後的 `game` 投影必須和重新整理前完全相同），且畫面不是等待室。
  - 結束時每個人都看到「結果」區塊；房主按畫面上的「再來一局」，每個人都回到新的一局。
- **沒涵蓋的**：遊戲自己的按鈕、拖曳、輸入框（動作是從 socket 送的，不是點按鈕）；這部分由各遊戲既有的 e2e（`e2e/<遊戲>.spec.ts`）負責。隨機下法常常很快結束（例如搭橋踩到陷阱、誰的詞不一樣直接結束），所以後段畫面不一定每次都走到。

## 結果

全部 16 款 × 3 種畫面最後一輪都通過（桌機 16/16、360 手機 16/16、390 繁中手機 16/16），另以 5 個不同 seed 重跑光譜、奪祕笈、陞官圖。

| 遊戲 | 桌機 | 手機 360 | 手機 390 繁中 | 重連 | a11y（axe） | 修了什麼 | 待擁有者 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 陞官圖 `promotion` | ✅ | ✅ | ✅ | ✅ | ✅（修後） | 升遷路線清單可捲動但鍵盤到不了（`CareerRoutes`） | — |
| 默契牌局 `silent-table` | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| 光譜 `spectrum` | ✅（修後） | ✅ | ✅ | ✅ | ⚠️ 見下 | 作答時 React 重複 key（每次作答都報 console error） | 一次後段畫面的對比不足，未能重現（見下） |
| 真假朗讀 `bluff` | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| 誰的詞不一樣 `odd-word` | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| 宮燈點點 `lantern` | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| 社辦牌陣 `tiles` | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| 放風箏 `kite` | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| 滬尾商行 `traders` | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| 奪祕笈 `secret-scroll` | ✅ | ✅ | ✅ | ✅ | ✅（修後） | 「這一輪」紀錄可捲動但鍵盤到不了 | — |
| 芥末餃子 `wasabi` | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| 朝堂暗鬥 `palace` | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| 德州撲克 `holdem` | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| 慘度排排站 `misery` | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| 搭橋 `word-bridge` | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| 撞詞 `clue-clash` | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| （全部）等待室 | — | — | ✅（修後） | — | ✅（修後） | 繁中「入座」按鈕的無障礙名稱「坐到座位 N」不含畫面上的「入座」（axe `label-content-name-mismatch`，serious，每款的繁中等待室都有） | — |

沒有發現：未處理例外、卡住、整頁水平捲動、原始 i18n key、繁中頁面混英文、重連後座位或局面不對、結果或再來一局失敗、房間拒絕合法動作。

## 修掉的 bug（各有測試）

1. **光譜：作答畫面 React 重複 key**。`SpectrumScreen` 的祕密數字與作答表單是兄弟元素，卻都用 `key={view.round}`，每次畫面更新 console 都報 “Encountered two children with the same key”；重複 key 可能讓 React 弄錯元件身分（表單內容跑掉）。改成 `number-<round>`、`answer-<round>`。測試：`tests/games/spectrum/SpectrumScreen.test.tsx`「renders the number and the answer form without a duplicate key」。
2. **奪祕笈：「這一輪」紀錄鍵盤無法捲動**。`max-height` 260px＋`overflow-y: auto` 的清單裡沒有可聚焦的東西，紀錄一長，鍵盤使用者捲不到（axe `scrollable-region-focusable`，serious；後段與結果畫面出現）。加 `tabIndex={0}` 與 `aria-labelledby`（同德州撲克、朝堂暗鬥的紀錄）。測試：`tests/games/secret-scroll/SecretScrollScreen.test.tsx`「can be scrolled from the keyboard」。
3. **陞官圖：升遷路線清單鍵盤無法捲動**。同一個問題（`max-height` 360px）；加 `tabIndex={0}` 與以玩家名稱為名的 `aria-label`。測試：`tests/games/promotion/CareerRoutes.test.tsx`。
4. **繁中等待室：「入座」按鈕的名稱與畫面文字不符**。`room.waiting.sitIn` 繁中由「坐到座位 {seat}」改為「入座：座位 {seat}」（英文 “Sit in seat {seat}” 本來就含 “Sit”）。語音控制說「入座」才按得到。測試：`tests/components/WaitingRoom.test.tsx`「names a sit button with the word it shows」。

## 記下但不算 bug

- **dev 才有的警告**：每位玩家進房時 `WebSocket is closed before the connection is established`。原因是 `src/main.tsx` 的 `<StrictMode>` 在開發模式把 effect 跑兩次，第一條 socket 還沒連上就被關掉；正式版不會。
- **本機 D1 沒有資料表時**：dev server 記錄 `no such table: game_flags／daily_metrics`（功能旗標讀不到就當全開、指標寫不進去就略過，不影響遊戲）。CI 的巡檢 job 先 `wrangler d1 migrations apply DB --local`。
- **光譜一次 axe 對比不足**：第一輪桌機巡檢在某個後段畫面（訪客視角）報過一次 `color-contrast`（serious），之後 6 次不同隨機局都沒再出現，沒能定位是哪個元件、哪種狀態。腳本現在會印出元素 HTML 與實際對比值，下次出現就能直接定位。列在 NEXT §2 供擁有者知悉，不擋。

## CI

新增 CI job **`sweep`**（`.github/workflows/ci.yml`）：Playwright 容器、建本機 D1、`SWEEP_SCREENS=desktop SWEEP_AXE=desktop npm run test:sweep`，16 款桌機各一局，本機約 5 分鐘；CI 失敗重試一次，失敗時上傳截圖、trace 與 `tmp/sweep/*.json`（每款的發現）。兩種手機尺寸（各約 5 分鐘、繁中那輪多 axe）只在本機跑：

```bash
npm run test:sweep                                   # 全部 16 款 × 3 種畫面，約 15 分鐘
SWEEP_GAMES=wasabi,kite SWEEP_SCREENS=desktop npm run test:sweep
SWEEP_SEED=123 npm run test:sweep                    # 換一組隨機下法
BASE_URL=http://localhost:6500 npm run test:sweep    # 用已經開著的 dev server
```

每次執行的發現寫在 `tmp/sweep/<遊戲>-<畫面>.json`（`hard`：讓測試失敗的；`soft`：只記下的）。`npm run test:browser` 不含這支（`playwright.config.ts` 的 `testIgnore`）。
