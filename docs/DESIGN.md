# DESIGN — 設計規格與 i18n 規則（規劃版，2026-11-03）

## 1. 調性

- 淡江系列的第三個站，但這個是「玩」的地方：比牌桌明亮、比橋館活潑；仍然乾淨、沒有遊戲網站常見的霓虹與雜訊。
- 每款遊戲一個主題色（升官圖：朱紅；合作撲克：深綠；光譜猜題：靛藍；真假朗讀：橘；卡丁車：青），大廳卡片與房間頂欄用它；其餘介面用中性色。
- 深淺色都要有，跟隨系統、可固定。

## 2. Token（`src/styles/tokens.ts`，唯一來源）

- 顏色：`bg`、`surface`、`text`、`muted`、`border`、`accent`（依遊戲）、`success`、`danger`、`warning`；深淺各一組。
- 間距：4 的倍數（4、8、12、16、24、32、48）。
- 圓角：8（元件）、16（卡片）。
- 字級：14、16、18、24、32；行高 1.5。
- 字型：Inter（拉丁）＋ Noto Sans TC（中文），兩者 variable、OFL；英文介面也要能正確顯示中文暱稱。

## 3. 元件

Button、IconButton、Card、Dialog、Drawer（手機聊天）、Toast、Tabs、Countdown、Avatar（暱稱首字＋依暱稱雜湊的顏色）、LanguageSwitch、GameCard、SeatList、ScoreBoard、RulesSheet。樣式只用 styled-components，樣式用 prop 加 `$`。

## 4. 版面

- 大廳：頂欄（標誌、語言、登入）＋ 遊戲卡片網格（桌機三欄、手機單欄）＋ 公開房列表。
- 房間：頂欄（遊戲名、房號、複製連結、語言）＋ 主區（遊戲畫面）＋ 右欄（座位、聊天；手機變抽屜）。
- 卡丁車：全螢幕 canvas，HUD 疊在上面（速度、加速條、圈數、分段、小地圖、道具欄），Esc 開選單。

## 5. i18n 規則

1. **英文是來源語言**：先寫 `en.ts`，再翻 `zh-TW.ts`；key 以語意命名，不以英文句子當 key（句子會改）。
2. **禁止裸字串**：JSX 裡的可見文字一律 `t()`；`scripts/check-i18n.mjs` 擋 zh-TW 缺 key 與多餘 key，另一支腳本 grep JSX 裡的 CJK 與長英文字串。
3. **數字、日期、複數**用 `Intl`，不要手拼。
4. **英文的語氣**：短、直接、動詞開頭（"Create room"、"Join"、"Roll"）；不用「Please」開頭。
5. **繁中的語氣**：台灣用語（「建立房間」「加入」「擲骰」），不用簡中詞彙（「創建」「視頻」）。
6. **遊戲術語表**（兩語對照，隨遊戲加）：

   | en | zh-TW |
   | --- | --- |
   | Room / Host / Seat / Spectator | 房間／房主／座位／旁觀者 |
   | Roll | 擲骰 |
   | Rank chip | 順位籌碼 |
   | Clue / Dial / Target | 提示／刻度／目標 |
   | Judge / Honest reader / Bluffer | 裁判／老實人／瞎掰人 |
   | Drift / Boost gauge / Boost | 甩尾／加速條／噴射 |
   | Time trial / Item race / Ghost | 時間賽／道具賽／幽靈車 |

7. **規則頁**是 markdown 兩份，不是 `t()`；由英文寫起，繁中翻譯，兩份都是「自己的話」，不轉載原作說明書。
8. **預設語言**：`en`；切換記在 localStorage；是否在第一次進站依瀏覽器語言偵測一次，見 E7 未決。

## 6. 無障礙

- 全部操作可鍵盤完成；焦點樣式可見；拖曳（刻度盤）有鍵盤替代（左右鍵、Shift 加速）。
- 狀態不只靠顏色：輪到誰同時有外框與文字；道具圖示形狀各異。
- 動畫尊重 `prefers-reduced-motion`。
- axe 無嚴重錯誤是 CI 的一部分（M1）。

## 7. 視覺資產

- 所有圖示、插圖、模型、音效都在 `docs/ASSETS.md` 登記（來源、授權、作者）。
- 風格一致：低多邊形卡通（3D）、簡單幾何插圖（2D）。
- 不出現任何原作的角色、標誌、配色組合。
