# CLAUDE.md — TKU Arcade · 淡江遊樂場

給 Claude Code 的專案說明。開始工作前先讀 `docs/NEXT.md`；實作後會補 `RULES.md` 與 `ARCHITECTURE.md` 的實作細節。

## 這是什麼

淡江橋藝社朋友圈的遊戲大廳：一個網址、暱稱進場、選一款遊戲一起玩。四款派對桌遊（陞官圖、合作撲克、光譜猜題、真假朗讀）＋ 一款瀏覽器 3D 卡丁車（甩尾加速手感致敬 2000 年代的經典卡丁車）。**非營利、只給朋友**。介面**預設 English**，初次依瀏覽器語言自動切繁中，之後以使用者切換為準。GitHub `GeneCLee6/TKU-Arcade`（公開）；**README 只寫英文**（給面試官看），其他文件繁中。技術與淡江牌桌（`C:\dev\TKU-BridgeTable`）、LongTalk（`C:\dev\LongTalk`）相同：React 19 + TypeScript（strict）+ styled-components + Vite；Cloudflare Workers（帶靜態資產）+ Durable Objects + D1 + R2。

## 先讀

| 情境 | 讀 |
| --- | --- |
| 現在做到哪、下一批是什麼 | `docs/NEXT.md` |
| 批次順序 | `docs/ROADMAP.md` |
| 產品範圍、某個功能的 AC 與 task | `docs/PRD/00-prd.md`、`docs/PRD/e*.md` |
| **能不能用某個名稱／圖／題目／模型** | `docs/PRD/01-legal-ip-analysis.md` §4 |
| 架構、GameModule、卡丁車同步 | `docs/ARCHITECTURE.md` |
| 介面、token、i18n 規則、術語表 | `docs/DESIGN.md` |

## 硬性規則

1. **玩法可學，表達不抄。** 不得加入任何原作（跑跑卡丁車／KartRider、紙牌幫／The Gang、腦洞量表／Wavelength、ito、瞎掰王／9upper）的名稱當作自己的名稱、角色、美術、音樂、題目文字、模型、程式；提到原作只在規則頁用一句描述性的話。不確定就問擁有者。
2. **介面文字一律走 i18n**：`t('key')`，`en.ts` 是來源、`zh-TW.ts` 必須同步；JSX 不得有裸字串；`npm run check-i18n` 在 CI 擋。
3. **規則在伺服器**：遊戲狀態只由 RoomDO 的 `GameModule.reduce` 改變；前端只呈現 `view`；隱藏資訊只能透過 `view` 裁切。
4. **資產一律登記** `docs/ASSETS.md`（來源、授權）；模型、貼圖、音檔走 R2，不 commit；CI 擋未登記的檔案。
5. **顏色只來自 `src/styles/tokens.ts`**（卡丁車 3D 場景的色值在同資料夾的 `kartTokens.ts`：WebGL 讀不到 CSS 變數，放在 tokens.ts 會進每個人的首屏，K2 起）；只用於樣式的 prop 加 `$` 前綴。
6. **不要直接推送到 `main`，也不要 force-push。** 功能走分支＋PR，合併用 `gh pr merge <號> --squash --delete-branch`。
7. **合併到 `main` 就會自動上線**；PR 要 CI 全綠、看過預覽站才合併。
8. 程式碼、註解、commit、**PR 標題**用英文；文件用繁體中文（台灣用語）；介面兩語都要。
9. **一批一個 PR**，照 `docs/ROADMAP.md` 的批次號；在同一個 PR 更新 epic 勾選、`PRD/README.md` 進度表、ROADMAP、NEXT。
10. 卡丁車多人（Phase L）在手感簽核（K3）之前不開工。

## 指令（A1 之後生效）

```bash
npm run dev          # http://localhost:5175（牌桌 5173、橋館 5174）
npm run build        # tsc -b + vite build
npm run lint         # oxlint
npm run typecheck    # tsc -b
npm test             # vitest run
npm run check-i18n   # zh-TW 與 en 的 key 一致
npm run check-assets # 資產登記
npm run play -- <game>   # 終端機隨機玩完一局（煙霧測試）
npm run test:browser # Playwright
npm run deploy       # 手動部署（通常不用，main 自動）
```
