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
- 字型：Inter（拉丁）＋ Noto Sans TC（中文），兩者 variable、OFL；英文介面也要能正確顯示中文暱稱。目前（A2）只寫字型堆疊、未打包 web font，沒安裝的裝置用系統字型；要打包時登記 `docs/ASSETS.md`。

## 3. 元件

Button、IconButton、Card、Dialog、Drawer（手機聊天）、Toast、Tabs、Countdown、Avatar（暱稱首字＋依暱稱雜湊的顏色）、LanguageSwitch、GameCard、SeatList、ScoreBoard、RulesSheet。樣式只用 styled-components，樣式用 prop 加 `$`。

## 4. 版面

- 大廳：頂欄（標誌、語言、登入）＋ 遊戲卡片網格（桌機三欄、手機單欄）＋ 公開房列表。
- 房間：頂欄（遊戲名、房號、複製連結、語言）＋ 主區（遊戲畫面）＋ 右欄（座位、聊天；手機變抽屜）。寬度 900px 以下算手機版面（`COMPACT_QUERY`）：等不得的東西不放抽屜（倒數、卡住的座位、遊戲結束後的房主動作），底部固定一條 dock（輪到誰、擲骰、開抽屜）。
- 升官圖圖版：直向手機 7 欄 × 12 列，由外往內繞，三圈正好 78 格，中央 1 × 6 留給「榮歸」；寬螢幕同一個螺旋橫放成 12 × 7。英文格子只放音譯，括號意譯在點格子後的說明。
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
8. **預設語言**：`en`；第一次進站（localStorage 無紀錄）依 `navigator.languages` 偵測，`zh*` 用繁中、其餘英文；之後以使用者切換為準（2026-11-03 拍板）。

## 6. 無障礙

- 全部操作可鍵盤完成；焦點樣式可見；拖曳（刻度盤）有鍵盤替代（左右鍵、Shift 加速）。
- 一大片格子只佔一個 Tab 停靠點：升官圖圖版用方向鍵在格子間移動（照畫面上下左右，不是沿著路徑），Enter 或空白鍵看說明，Home、End 到起點與榮歸。
- 按鈕上看得到的字要包含在無障礙名稱裡（WCAG 2.5.3）：「轉移房主：{name}」，不是另一句話。只給螢幕閱讀器的文字用 `VisuallyHidden`。
- `e2e/a11y.spec.ts`（axe，擋 serious 與 critical）、`e2e/keyboard.spec.ts`、`e2e/mobile.spec.ts` 目前要手動跑（`npm run test:browser`，先 `npm run dev`），CI 還沒跑。新畫面要在 `a11y.spec.ts` 加一行。
- 狀態不只靠顏色：輪到誰同時有外框與文字；道具圖示形狀各異。
- 動畫尊重 `prefers-reduced-motion`。
- axe 無嚴重錯誤是 CI 的一部分（M1）。

## 7. 視覺資產

- 所有圖示、插圖、模型、音效都在 `docs/ASSETS.md` 登記（來源、授權、作者）。例外：程式畫的 SVG（升官圖圖版、陀螺、骰子）與 `src/lib/sound.ts` 用 WebAudio 合成的音效都是這個 repo 自己的程式碼，沒有資產檔，不用登記。
- 風格一致：低多邊形卡通（3D）、簡單幾何插圖（2D）。
- 不出現任何原作的角色、標誌、配色組合。
