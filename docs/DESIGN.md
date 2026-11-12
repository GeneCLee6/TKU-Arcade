# DESIGN — 設計規格與 i18n 規則（規劃版，2026-11-03）

## 1. 調性

- 淡江系列的第三個站，但這個是「玩」的地方。**2026-11-09 擁有者同意改成電競風、2026-11-11 核准（批次 E1，`e7-t14`）**：夜色深底、青色（`brand`）與洋紅（`magenta`）點綴、斜切的分頁與按鈕、切角的玻璃面板、背景一片淡淡的透視格線地板。參考是擁有者看過的可點原型（純 HTML，不在 repo 裡）；照它的樣子做，程式是自己寫的。原本「乾淨、沒有霓虹」的方向作廢。
- **深色是預設**（沒有選過的人看到深色）；淺色是同一套設計的白天版（淺灰藍底、白色玻璃、深青與深洋紅），對比測試一樣要過。主題切換仍是「跟隨系統／淺色／深色」三個，選了就記在 localStorage（`tku-arcade.theme`；選回深色就刪掉這筆）。
- 每款遊戲一個主題色（`e7-t12` 的主題色部分）：陞官圖金色（深色 `#FFC23D`、淺色 `#9A5800`）、默契牌局綠（`#5CFFA8`／`#0B7A47`）、光譜猜題藍（`#4DA3FF`／`#1D5FC4`，H2）；其他遊戲沒有主題色時用 `brand`。之後的遊戲建議：真假朗讀紫、卡丁車青，做那一批時加進 `tokens.ts` 的 `gameHues`。用法：
  - 大廳卡片與公開房列表的那一列，在自己的子樹把 `--color-accent` 換成那款遊戲的顏色（`gameHue(id)`）；
  - 房間頁與規則頁，`data-game="<id>"` 一出現在頁面上，`GlobalStyle` 用 `:root:has([data-game=…])` 把整頁的 `--color-accent` 換掉：頂欄的按下狀態、背景的光暈與格線、主按鈕、標題前的斜槓都跟著變。元件不必知道是哪款遊戲。
- 陞官圖圖版（`promotionBoard`）、默契牌局的牌桌與牌（`felt*`、`card*`、`chip*`）、座位顏色（`seat0`–`seat5`）都**不跟著改**，深淺色相同。

## 2. Token（`src/styles/tokens.ts`，唯一來源）

- 顏色（深淺各一組，名稱相同；`color.*` 是 CSS 變數）：
  - 底與面：`bg`（頁面）、`surface`（不透明：對話框、toast、dock、有列的地方）、`panel`（玻璃，半透明）、`sunken`（陷進面板：聊天紀錄、輸入框、列）、`raised`／`raisedHover`（面板上控制項自己的底色：次要按鈕、沒按下的分段）。
  - 字：`text`、`muted`；線：`border`（輸入框、次要按鈕的框）、`line`（面板的髮絲邊）。
  - 品牌：`brand`（青）、`magenta`；`accent`＝目前的主題色（大廳是 `brand`，遊戲裡是那款遊戲的顏色），`onAccent` 在每個主題色與兩個品牌色上都讀得到（深色是近黑、淺色是白）。
  - 每款遊戲：`gamePromotion`、`gameSilentTable`、`gameSpectrum`。
  - 狀態：`success`、`danger`、`warning`；`overlay`。
  - 不跟主題變的：`qr*`、`seat*`、`felt*`、`card*`、`chip*`，`promotionBoard`、`kartScene`（純值）。
  - `tests/styles/tokens.test.ts` 擋：文字配色 4.5:1；玻璃與 `sunken`、`raised` 是半透明的，測試先把它疊在 `bg` 上再算。
- 間距：4 的倍數（4、8、12、16、24、32、48）。
- 圓角：4（元件）、6（卡片）；外框的形狀主要靠斜切與切角，不靠圓角。
- 字級：14、16、18、24、32；行高 1.5。大廳的大標題用 `clamp()` 放大。
- 字型（`font.*`）：
  - `display`：**Saira** 斜體 800／900（拉丁標題、按鈕、標誌字）；
  - `displayZh`：**Noto Sans TC 900**（中文標題與按鈕，不斜）；
  - `mono`：**JetBrains Mono** 500／700（數字、房號、座位號、小標籤）；
  - `sans`：內文，系統字（Inter 有裝就用），**不載 web font**；
  - `kai`：陞官圖圖版的楷書（LXGW WenKai TC，C4）。
  - 三個顯示字型從 Google Fonts 載入（`src/styles/webFonts.ts`，`main.tsx` 一開始用程式加 `<link>`，不擋首次繪製；登記在 `ASSETS.md`）；每個堆疊都以系統字結尾。**`sans` 與 `mono` 刻意不放 Noto Sans TC**：頁面只載了它的 900，放進內文會讓所有字都變超粗。
  - 標題用 `displayType`（`src/styles/esports.ts`）：英文介面是 Saira 斜體，`:lang(zh)` 時換成 Noto Sans TC 900 正體；`font-synthesis-style: none`，英文標題裡的中文暱稱不會被瀏覽器硬斜。

## 3. 元件

Button、IconButton、Card、Dialog、Drawer（手機聊天）、Toast、Tabs、Countdown、Avatar（暱稱首字＋依暱稱雜湊的顏色）、LanguageSwitch、GameCard、SeatList、ScoreBoard、RulesSheet。樣式只用 styled-components，樣式用 prop 加 `$`。

電競風的形狀與規則（`src/styles/esports.ts`）：

- **斜角 `SLANT` −14°**：按鈕、分段切換、分頁、標籤、倒數條、標題前的小斜槓都往同一個方向斜。
- **clip-path 一律畫在 `::before`（`clippedFill`）**，元件本身不剪：clip-path 會把焦點框剪掉，畫在偽元素上，元件自己與裡面任何東西的 `outline` 都完整。新元件要斜或切角時照這個做。
- **Button**：`primary` 是主題色填滿的平行四邊形，上面有一道週期掃過的光（`::after`；`prefers-reduced-motion` 時不顯示，不只是縮短）；`secondary` 是 `raised` 底加 `border` 框；`ghost` 只有 hover 底色；`danger` 是 danger 色的字、框與淡底。`sm` 在 `pointer: coarse` 放大到 44 px。字用 `displayType`。
- **玻璃面板 `glass`**：`panel` 底、`line` 髮絲邊、右上切一角；900 px 以上加 `backdrop-filter: blur(14px)`，手機不模糊（省電）。`Card`、房間的 `Section`、`ResultPanel`、規則頁的文章都是它。`Section` 是有標題的面板；只是要排在一起、不要面板的用 `Stack`。
- **標題 `Heading`**：`displayType`，前面一個主題色的小斜槓。
- **Row**：`sunken` 底；等待室的座位列用 `$mark` 在左邊畫那個座位的顏色。
- **輸入框**：`sunken` 底、`border` 框、不圓角；有焦點時框與底線變主題色（焦點框照舊）。
- **SegmentedSwitch、Tabs**：斜的；按下或選中時主題色填滿（分段）或底線加粗（分頁），狀態不只靠顏色（字重也變）。
- **Avatar**：六角形；GameCard 的字首也是六角形，填那款遊戲的顏色。
- **焦點框**：全域 `:root :focus-visible`，2 px 主題色、間隔 3 px。
- **背景**：`body::before` 是主題色與洋紅的光暈，`body::after` 是透視格線地板（主題色 24%、往上淡出）。**格線不動**：原型會動，但動 `background-position` 每一格都要重畫整頁，手機吃電；要動的話改用 `transform`。
## 4. 版面

- 頂欄：玻璃、黏在最上面；標誌（青與洋紅兩個斜箭頭，程式畫的）＋ `TKU Arcade`（Saira 斜體），右邊主題與語言切換。400 px 以下只留標誌（名字只是看不到，連結名稱還在），所以到 360 px 都是一行。
- 大廳：主視覺（洋紅斜標籤、大標題、一句話、暱稱、貼連結加入；寬螢幕右邊是幾塊程式畫的色塊，手機藏起來，好讓第一款遊戲的「建立房間」留在第一個畫面）＋ 遊戲卡片網格（桌機三欄、手機單欄；卡片頂邊與字首是那款遊戲的顏色）＋ 公開房列表（斜條，遊戲名用那款遊戲的顏色）。
- 房間：頂欄 ＋ 房間標題列（遊戲名，前面一條發光的主題色斜槓；在房人數的斜標籤；「怎麼玩」）＋ 主區（遊戲畫面）＋ 右欄（座位、聊天；手機變抽屜）。等待室寬螢幕兩欄：左邊座位、旁觀者與開始條（準備、站起來、開始遊戲），右邊邀請（房號大字、連結、QR）、遊戲與規則、解散、聊天；手機一欄，順序相同，聊天仍是底部的抽屜。
- 規則頁：大標題、玻璃面板上的文章，每個小標題前一個主題色斜方塊；表頭用 mono。寬度 900px 以下算手機版面（`COMPACT_QUERY`）：等不得的東西不放抽屜（倒數、卡住的座位、遊戲結束後的房主動作），底部固定一條 dock（輪到誰、擲骰、開抽屜）。
- 默契牌局：牌桌上面是三張玻璃進度卡（關卡與本輪、連過、失敗；數字旁邊一條斜的分段條，連過用 `success`、失敗用 `danger`）與禁聊時的洋紅橫條（鎖頭＋文字）；牌桌（`felt*` token，深淺色相同，切四角、主題色細框）依序放公共牌、自己的座位（牌桌上一塊較暗的區域）、籌碼軌，375 × 667 的第一個畫面就看得到這些（批次 E2）；其他座位是玻璃列，左邊一條座位色，準備好了是 `success` 的框加上文字；揭牌是玻璃面板，每列左邊綠或紅、斜標籤寫對或錯，判定是一大行顯示字型；其他人的座位在牌桌下面，手機一欄。籌碼軌一條線排 1 到 n，同時是目前的排列和拿籌碼的按鈕。揭牌由最弱的手牌排起。
- 光譜猜題（H2）：回合數與三步、題目卡（分類斜標籤、大字題目、1 藍 10 洋紅的兩端）、依階段的內容（祕密數字卡＋回答、回答卡＋最小／最大按鈕、數線揭曉）、計分板。「確定」與「下一回合」在 dock。題目卡、量表、數線都是主題色到洋紅的漸層；最大用洋紅、最小用主題色，按下的按鈕上有字，不只靠顏色。手機一欄，600 px 以下數線下面多一張看得到的回答清單。
- 陞官圖圖版（C4）：79 格分成八個部門，每個部門一塊，上面一塊漆牌寫部門名，格子由高到低排。寬螢幕（720 px 以上）是三欄：侍衛處｜中樞｜翰林院、綠營武職｜京師部院｜地方官、武科｜科舉｜地方官（地方官跨兩列），榮歸是中樞上面的金色大格。720 px 以下八塊由上往下排成一欄（中樞在最上、科舉在最下），不左右捲。朱漆金邊、宣紙格子、楷書官名、角落的紅色品級印章、示意的頂戴顏色；選中的格子（預設是自己那格）以德才功贓小印標出四種結果的去向。顏色是 `tokens.ts` 的 `promotionBoard`，深淺色相同。英文格子只放音譯，括號意譯與完整品級在點格子後的說明。
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
   | Hole cards / Shared cards / Reveal | 底牌／公共牌／揭牌 |
   | Topic / Answer / Guesser / Secret number | 題目／回答／猜題者／祕密數字 |
   | Judge / Honest reader / Bluffer | 裁判／老實人／瞎掰人 |
   | Drift / Boost gauge / Boost | 甩尾／加速條／噴射 |
   | Time trial / Item race / Ghost | 時間賽／道具賽／幽靈車 |

7. **規則頁**是 markdown 兩份，不是 `t()`；由英文寫起，繁中翻譯，兩份都是「自己的話」，不轉載原作說明書。
8. **預設語言**：`en`；第一次進站（localStorage 無紀錄）依 `navigator.languages` 偵測，`zh*` 用繁中、其餘英文；之後以使用者切換為準（2026-11-03 拍板）。

## 6. 無障礙

- 全部操作可鍵盤完成；焦點樣式可見；拖曳（例如光譜猜題全排序模式的排序）有鍵盤替代（方向鍵移動、Enter 放下）。
- 一大片格子只佔一個 Tab 停靠點：陞官圖圖版用方向鍵在格子間移動（照畫面上下左右，不是沿著路徑），Enter 或空白鍵看說明，Home、End 到起點與榮歸。
- 按鈕上看得到的字要包含在無障礙名稱裡（WCAG 2.5.3）：「轉移房主：{name}」，不是另一句話。只給螢幕閱讀器的文字用 `VisuallyHidden`。
- 觸控螢幕上（`pointer: coarse`）可點的東西至少 44 px：`Button` 的 `sm` 尺寸自己會放大，連結要自己設。手機版面的底部 dock 用 `scroll-padding-bottom` 避開，Tab 不會停在 dock 後面。
- `e2e/a11y.spec.ts`（axe，擋 serious 與 critical）、`keyboard.spec.ts`、`mobile.spec.ts`、`zh-walkthrough.spec.ts` 目前要手動跑（`npm run test:browser`，先 `npm run dev`，或設 `BASE_URL` 指向預覽站），CI 還沒跑。新畫面要各加一行。繁中走查清單在 `ZH-WALKTHROUGH.md`。
- 狀態不只靠顏色：輪到誰同時有外框與文字；道具圖示形狀各異。
- 動畫尊重 `prefers-reduced-motion`。
- axe 無嚴重錯誤是 CI 的一部分（M1）。

## 7. 視覺資產

- 所有圖示、插圖、模型、音效都在 `docs/ASSETS.md` 登記（來源、授權、作者）。例外：程式畫的 SVG 與 CSS（陞官圖圖版、CSS 3D 的四面陀螺、骰子，默契牌局的花色、牌背、皮膚線條）與 `src/lib/sound.ts` 用 WebAudio 合成的音效都是這個 repo 自己的程式碼，沒有資產檔，不用登記。
- 風格一致：低多邊形卡通（3D）、簡單幾何插圖（2D）。
- 不出現任何原作的角色、標誌、配色組合。
