# RULES — 工程慣例

`CLAUDE.md` 是硬性規則的摘要；這份寫細節。架構見 `docs/ARCHITECTURE.md`，介面與術語見 `docs/DESIGN.md`。

## 1. 分層與職責

| 位置 | 職責 | 禁止 |
| --- | --- | --- |
| `shared/` | 前後端共用的型別與純函式（協定、id、`GameModule` 與各遊戲規則） | React、DOM、Cloudflare API |
| `shared/games/<id>/` | 一款遊戲的 `GameModule`：`setup`、`reduce`、`view` | 隨機數不經注入的 `Rng`、讀時間 |
| `worker/app.ts` | HTTP 路由：`/api/*`、`/ws/*`，其餘交給靜態資產 | 房間狀態（屬於 RoomDO） |
| `worker/room.ts` | `RoomDO`：每房一個，房間與遊戲狀態的唯一真相 | 前端邏輯 |
| `worker/lobby.ts` | `LobbyDO`：全站一個，公開房列表 | 房間內的狀態 |
| `worker/index.ts` | Worker 入口：匯出 handler 與 DO class | 其他邏輯 |
| `src/pages/` | 組合：取狀態、接路由 | 遊戲規則判斷 |
| `src/components/` | 展示與互動 | 直接呼叫 API 或 WebSocket（由 props 傳入 callback） |
| `src/games/<id>/` | 一款遊戲的畫面（`lazy()` 載入） | 自己算規則；只呈現 `view` |
| `src/styles/tokens.ts` | 顏色、字體、間距的唯一來源 | — |
| `src/i18n/` | `en.ts`（來源）、`zh-TW.ts`、`t()`（A2 起） | — |

## 2. 規則在伺服器

- 遊戲狀態只由 RoomDO 呼叫 `GameModule.reduce(state, action)` 改變；前端送 action，收 `view`。
- 隱藏資訊（手牌、題目答案、別人的角色）只能透過 `view(state, seat)` 裁切；不得把完整 state 送到瀏覽器，也不得靠前端「不顯示」來藏。
- 權限、輪到誰、計時，都在伺服器判斷；前端的按鈕只是方便，不是把關。
- 卡丁車例外：物理在瀏覽器跑（自主模擬），但吃道具、命中、圈數、完賽由 RoomDO 裁定（ARCHITECTURE.md §4）。

## 3. 介面文字（i18n）

- JSX 不得有裸字串：一律 `t('key')`。`en.ts` 是來源，`zh-TW.ts` 必須有同一組 key；`npm run check-i18n` 在 CI 擋。
- 唯一例外是產品名稱 `APP_NAME`（`shared/app.ts`），兩語相同。
- A2 之前沒有 `t()`：畫面只放產品名稱，不寫任何其他文字。
- 介面預設 English；初次依瀏覽器語言自動切繁中，之後以使用者切換為準（記在 localStorage）。
- 術語以 `docs/DESIGN.md` 的術語表為準，兩語都要。

## 4. 樣式

- 顏色只來自 `src/styles/tokens.ts`；元件裡不得寫色碼或 `rgb()`。
- 只用於樣式的 prop 加 `$` 前綴（`$active`、`$size`），避免傳到 DOM。
- 用 styled-components；不另加 CSS 檔或 CSS 框架。

## 5. 資產與智慧財產

- 玩法可學，表達不抄：不得使用原作的名稱、角色、美術、音樂、題目文字、模型、程式（`docs/PRD/01-legal-ip-analysis.md` §4）。不確定就先問擁有者。
- 每個模型、貼圖、音檔、字型都登記在 `docs/ASSETS.md`（來源、授權）；`npm run check-assets` 在 CI 擋未登記的檔案。
- 模型、貼圖、音檔放 R2（雜湊檔名），不 commit 進 repo。

## 6. 程式風格

- TypeScript strict；不使用 `any`（oxlint 擋）；`erasableSyntaxOnly`（不用 enum、建構子參數屬性）。
- Prettier 設定見 `.prettierrc.json`（無分號、單引號、尾逗號、寬 100）。
- import 寫出 `.ts`／`.tsx` 副檔名。
- 程式碼、註解、commit、分支名稱、PR 標題用英文；文件用繁體中文（台灣用語）；README 只寫英文。

## 7. 測試

- `tests/worker/`：Worker 與 DO 的邏輯，用 Worker 的 tsconfig（有 `@cloudflare/workers-types`）。DO 的邏輯盡量寫成不依賴 `cloudflare:workers` 的純類別，讓 Vitest 直接測。
- `tests/app/`：元件與頁面，以 Testing Library 依角色與名稱查詢。
- `tests/games/`：每款遊戲用 harness 跑完整一局；`npm run play -- <game>` 是終端機煙霧測試。
- `e2e/`：Playwright（`npm run test:browser`），對 `BASE_URL`（預設 `http://localhost:5175`）跑；檔名 `.spec.ts`，Vitest 不會撿到。
- 提交前：`npm run lint && npm run typecheck && npm test && npm run build`。

## 8. Commit、分支、PR

- Conventional Commits：`feat:`、`fix:`、`docs:`、`chore:`、`test:`、`refactor:`、`ci:`，可加範圍，如 `feat(promotion): board and moves [e2-t03]`。
- 一批 = 一個分支 = 一個 PR（`docs/ROADMAP.md`）。分支名帶第一個 task 編號（`feat/e12-t01-skeleton`），PR 標題結尾列出全部編號。
- 不要直接推送 `main`，不要 force-push；合併用 `gh pr merge <號> --squash --delete-branch`。
- 合併到 `main` 就自動上線：CI 全綠、看過預覽站才合併。
- 在同一個 PR 勾選 epic task、AC（有驗證才勾）、`docs/PRD/README.md` 進度表、`docs/ROADMAP.md`、`docs/NEXT.md`。
- 卡丁車多人（Phase L）在手感簽核（K3）之前不開工。
