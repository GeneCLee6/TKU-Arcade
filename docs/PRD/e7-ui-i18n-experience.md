---
title: E7 — 介面、i18n 與體驗
date: 2026-11-03
status: planned
epic: E7
owner: GeneCLee6
milestones: [M0, M1]
depends_on: []
---

## 背景

這是淡江系列第一個**預設英文**的站，也是第一個真正雙語的站（牌桌與橋館是繁中單語，字串集中在 `strings.ts`）。所以 i18n 不是「之後加翻譯」，是 M0 的地基：每一句介面文字從第一天就有 key，英文是來源語言，繁中是翻譯，CI 擋缺漏。視覺上沿用淡江系列的 token 做法（顏色只來自 `styles/tokens.ts`），但大廳要比牌桌「玩」一點。

## 目標

- M0：設計 token、基礎元件、i18n 架構、語言切換、深淺色、手機版、鍵盤可操作、規則頁框架。
- M1：PWA、無障礙檢查、視覺回歸、表情反應（選用）。

## 非目標

- 第三種語言（架構允許，但不做）。
- 第三種語言以外的自動翻譯；URL 帶語言參數（不做）。

## 需求

- **i18n 架構**：`src/i18n/en.ts`（來源，key 以英文句子或語意命名）、`src/i18n/zh-TW.ts`；`useT()` 回傳 `t(key, params)`；複數與數字格式用 `Intl`；日期用 `Intl.DateTimeFormat`；遊戲模組的字串在 `shared/games/<id>/i18n.ts`，同樣兩個語言；**CI 腳本 `scripts/check-i18n.mjs`**：zh-TW 缺 key 或多餘 key 就失敗；前端缺翻譯時 fallback 英文並在 dev console 警告。
- **語言切換**：右上角 `EN / 繁中`；存 localStorage；`<html lang>` 跟著改；URL 不帶語言。**初次語言**：localStorage 沒有紀錄時，`navigator.languages` 第一個以 `zh` 開頭的就用 `zh-TW`，否則 `en`；之後以 localStorage 為準。
- **設計 token**：顏色（深淺色各一組）、間距、圓角、字級、字型（Inter＋Noto Sans TC variable，沿用牌桌的 `@fontsource-variable/noto-sans-tc`）；大廳每款遊戲一個主題色。
- **基礎元件**：Button、IconButton、Card、Dialog、Drawer、Toast、Tabs、Countdown、Avatar（暱稱首字＋顏色）、LanguageSwitch。
- **手機**：桌遊全部可在手機玩（直向）；大廳卡片單欄；房內聊天是抽屜。
- **鍵盤與無障礙**：所有互動可 Tab 到、有可見焦點；擲骰、拖曳排序、拿籌碼都有鍵盤替代；狀態不只靠顏色；axe 檢查無嚴重錯誤。
- **規則頁框架**：`/games/<id>/rules`，從 `shared/games/<id>/rules.md`（雙語兩份 `rules.en.md`、`rules.zh-TW.md`）渲染；房內「怎麼玩」浮層讀同一份。
- **PWA（M1）**：manifest、安裝提示、離線時顯示「需要網路」。
- **視覺回歸（M1）**：Playwright 截圖比對（沿用牌桌做法，基準圖只在 CI 的 Linux 容器產生）。
- **表情反應（M1 選用）**：房內六種表情浮出（默契牌局禁聊時仍可用）。

## 設計方向

- 不引入 i18n 函式庫（react-i18next 等），自己寫 100 行的 `t()`，和牌桌 `strings.ts` 的習慣接近、JS 預算小。
- key 命名：`lobby.newRoom`、`room.kick`、`game.promotion.roll`；禁止在 JSX 裡寫裸字串（oxlint 規則或簡單 grep 腳本擋 CJK 與英文句子）。
- 深淺色：~~跟隨系統，可手動固定~~。批次 E1（#24）起**預設深色**（電競風的夜色），淺色是同一套設計的白天版；「跟隨系統」仍是一個選項，選了會記住。
- **電競風（批次 E1，擁有者 2026-11-09 要求、2026-11-11 核准）**：夜色深底、青色與洋紅點綴、每款遊戲一個主題色；按鈕、分段切換、分頁、標籤往右斜 14°，面板切一角；玻璃面板；背景是淡淡的透視格線地板。規格在 `DESIGN.md` §1–§3。
- 卡丁車頁（E8）有自己的 HUD 樣式，但字串仍走同一套 i18n。

## 驗收條件

- [ ] AC-7.1 — 設計 token 與基礎元件；深淺色；每款遊戲主題色。
- [x] AC-7.2 — i18n 架構：`t()`、兩個語言檔、初次依瀏覽器語言（`zh*` → 繁中，其餘英文）、切換與記住、`<html lang>`、fallback。
- [ ] AC-7.3 — 繁中翻譯完整：`check-i18n` 在 CI 擋缺漏；切成繁中整站無英文殘留（人工走查清單）。（M0 的畫面走過一次，#14，`ZH-WALKTHROUGH.md`；M1 三款的二次走查是 `e7-t13`，勾選等它）
- [ ] AC-7.4 — 手機：大廳、房間、四款桌遊直向可玩。（大廳、房間、陞官圖完成，#14，用 Playwright 手機模擬驗證，未上實體手機；另外三款還沒有）
- [ ] AC-7.5 — PWA 可安裝、離線提示。
- [ ] AC-7.6 — 無障礙：鍵盤全程、焦點可見、axe 無嚴重錯誤。（現有畫面都過，#14；axe 進 CI 與另外三款是 M1 的事，勾選等它）
- [x] AC-7.7 — 規則頁框架與房內怎麼玩。（#13）
- [ ] AC-7.8 — 視覺回歸基準圖與 CI job。

## Task 拆分

### M0

- [x] `e7-t01` 設計 token、GlobalStyle、字型、深淺色、Button／Card／Dialog／Toast · AC-7.1 · M · ← e12-t01 · #3
- [x] `e7-t02` i18n：`t()`、`en.ts`／`zh-TW.ts`、`useT`、`LanguageSwitch`、localStorage、`<html lang>` · AC-7.2 · M · ← e7-t01 · #3
- [x] `e7-t03` `scripts/check-i18n.mjs` 與裸字串檢查，接進 CI · AC-7.3 · S · ← e7-t02, e12-t02 · #6
- [x] `e7-t04` Drawer、Tabs、Countdown、Avatar、Dialog 的手機版 · AC-7.4 · S · ← e7-t01 · #11
- [x] `e7-t05` 大廳與房間的手機版面 · AC-7.4 · S · ← e1-t02, e1-t04 · #14
- [x] `e7-t06` 鍵盤與焦點樣式、`visually-hidden`、axe 測試骨架 · AC-7.6 · S · ← e7-t01 · #14
- [x] `e7-t07` 規則頁框架（markdown 雙語渲染）與房內「怎麼玩」浮層 · AC-7.7 · S · ← e7-t02 · #13
- [x] `e7-t08` 繁中全站走查清單與修正（M0 結束前） · AC-7.3 · S · #14

### M1

- [ ] `e7-t09` PWA manifest、安裝提示、離線提示 · AC-7.5 · S
- [ ] `e7-t10` Playwright 視覺回歸與 axe job · AC-7.8 · M · ← e12-t02
- [ ] `e7-t11` 表情反應（六種、浮出、禁聊時可用） · — · S · ← e1-t07
- [ ] `e7-t12` 每款遊戲主題色與大廳卡片插圖（原創） · AC-7.1 · S（主題色在批次 E1 做了，#24：`tokens.ts` 的 `gameHue`；插圖還沒做，卡片上仍是字首）
- [ ] `e7-t13` 繁中全站二次走查（M1 結束前，含三款桌遊） · AC-7.3 · S
- [x] `e7-t14` 電競風視覺方向：token（夜色、青色與洋紅、每款遊戲主題色、深色預設）、基礎元件（斜切按鈕與掃光、玻璃面板、標籤、分段切換、分頁、輸入框、焦點）、外框（頂欄、大廳、等待室、規則頁、遊戲外框）；顯示字型 · AC-7.1 · M · ← e7-t01 · #24（批次 E1，擁有者 2026-11-09 要求、2026-11-11 核准）

## 風險與對策

| 風險 | 對策 |
| --- | --- |
| 翻譯漏在 JSX 裡的裸字串 | 腳本擋 CJK 與長英文字串；AC-7.3 人工走查 |
| 英文介面的遊戲術語不自然 | 規則頁請英語母語的朋友看一次；術語表放 `DESIGN.md` |

## 未決問題

- [x] **Q:** 瀏覽器語言是 zh-TW 時要不要自動切繁中？
      **A:** 2026-11-03 擁有者拍板：要。第一次進站若 `navigator.language` 以 `zh` 開頭就用繁中，否則英文；localStorage 有使用者的選擇時以使用者為準（`e7-t02`，AC-7.2）。
