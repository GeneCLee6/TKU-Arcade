# DESIGN — 設計規格與 i18n 規則（規劃版，2026-11-03）

## 1. 調性

- 淡江系列的第三個站，但這個是「玩」的地方。**2026-11-09 擁有者同意改成電競風、2026-11-11 核准（批次 E1，`e7-t14`）**：夜色深底、青色（`brand`）與洋紅（`magenta`）點綴、斜切的分頁與按鈕、切角的玻璃面板、背景一片淡淡的透視格線地板。參考是擁有者看過的可點原型（純 HTML，不在 repo 裡）；照它的樣子做，程式是自己寫的。原本「乾淨、沒有霓虹」的方向作廢。
- **深色是預設**（沒有選過的人看到深色）；淺色是同一套設計的白天版（淺灰藍底、白色玻璃、深青與深洋紅），對比測試一樣要過。主題切換仍是「跟隨系統／淺色／深色」三個，選了就記在 localStorage（`tku-arcade.theme`；選回深色就刪掉這筆）。
- 每款遊戲一個主題色（`e7-t12` 的主題色部分）：陞官圖金色（深色 `#FFC23D`、淺色 `#9A5800`）、默契牌局綠（`#5CFFA8`／`#0B7A47`）、光譜猜題藍（`#4DA3FF`／`#1D5FC4`，H2）、真假朗讀紫（`#B48CFF`／`#6B3FD1`，批次 E3 的即將推出卡片先加）、誰的詞不一樣橘紅（`#FF8F66`／`#B03A12`，2026-11-14）、宮燈點點宮燈粉（`#FF9ECF`／`#A8246A`，2026-11-14）、社辦牌陣萊姆綠（`#C6F35B`／`#3F6212`，2026-11-14）、放風箏天藍紫（`#A3B8FF`／`#3D52C2`，2026-11-14；風箏本身的顏色沿用 `promotionBoard` 的宮廷色，深淺色相同）、滬尾商行茶褐（`#E3B98A`／`#85471C`，2026-11-14）、奪祕笈鋼灰（`#C3CCDD`／`#4A5570`，2026-11-14）、芥末餃子青綠（`#45D6B8`／`#0E6B5A`，2026-11-14）、朝堂暗鬥朱漆紅（`#FF6F7F`／`#A3182B`，2026-11-14）、德州撲克蘭花紫（`#E68AF5`／`#8E2A9A`，2026-11-14；牌桌、牌與籌碼借用默契牌局的 `felt*`、`card*`、`chip*`）、搭橋靛藍（`#8F9BFF`／`#3B48B8`，2026-11-14）、撞詞青綠（`#4FE3D0`／`#0A6A60`，2026-11-14）、慘度排排站芥黃（`#E6CF45`／`#7A6400`，2026-11-14；它的慘度色階借用默契牌局綠、社辦牌陣萊姆、陞官圖金、誰的詞不一樣橘紅四款遊戲色加 `danger`，字用 `onAccent`）；其他遊戲沒有主題色時用 `brand`。卡丁車用 `brand` 的青（批次 E3 決定，不另加 token；要和品牌分開再加進 `gameHues`）。用法：
  - 大廳卡片與公開房列表的那一列，在自己的子樹把 `--color-accent` 換成那款遊戲的顏色（`gameHue(id)`）；
  - 房間頁與規則頁，`data-game="<id>"` 一出現在頁面上，`GlobalStyle` 用 `:root:has([data-game=…])` 把整頁的 `--color-accent` 換掉：頂欄的按下狀態、背景的光暈與格線、主按鈕、標題前的斜槓都跟著變。元件不必知道是哪款遊戲。
- 陞官圖圖版（`promotionBoard`）、默契牌局的牌桌與牌（`felt*`、`card*`、`chip*`）、座位顏色（`seat0`–`seat5`）都**不跟著改**，深淺色相同。

## 2. Token（`src/styles/tokens.ts`，唯一來源）

- 顏色（深淺各一組，名稱相同；`color.*` 是 CSS 變數）：
  - 底與面：`bg`（頁面）、`surface`（不透明：對話框、toast、dock、有列的地方）、`panel`（玻璃，半透明）、`sunken`（陷進面板：聊天紀錄、輸入框、列）、`raised`／`raisedHover`（面板上控制項自己的底色：次要按鈕、沒按下的分段）。
  - 字：`text`、`muted`；線：`border`（輸入框、次要按鈕的框）、`line`（面板的髮絲邊）。
  - 品牌：`brand`（青）、`magenta`；`accent`＝目前的主題色（大廳是 `brand`，遊戲裡是那款遊戲的顏色），`onAccent` 在每個主題色與兩個品牌色上都讀得到（深色是近黑、淺色是白）。
  - 每款遊戲：`gamePromotion`、`gameSilentTable`、`gameSpectrum`、`gameBluffReader`、`gameOddWord`、`gameLantern`、`gameTiles`、`gameKite`、`gameTraders`、`gameSecretScroll`、`gameWasabi`、`gameMisery`、`gameWordBridge`、`gameClueClash`、`gamePalace`、`gameHoldem`。
  - 狀態：`success`、`danger`、`warning`；`overlay`。
  - 不跟主題變的：`qr*`、`seat*`、`felt*`、`card*`、`chip*`、`tile*`（社辦牌陣的牌面），`promotionBoard`、`kartScene`、`tradersPieces`（純值；後兩個在各自的 `kartTokens.ts`、`tradersTokens.ts`，只有那款的 chunk 載入）。
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
### 3.6 卡丁車的電競轉播風格（2026-11-18，`feat/kart-esports-art`）

擁有者：「畫風跟人物跟車子要再更電競感，現在像個小朋友玩的一樣。」卡丁車的畫面（3D 與介面）改成**職業賽事轉播**的樣子：銳利、科技、暗色加霓虹。規則：

**3D（`src/kart/art/`，顏色在 `kartTokens.ts`）**

- **車身只有平面與稜線**：用 `kartParts.ts` 的 `hull`（八條稜線的切面船身，每一面都是平的）、`plate`、`blade`、`wedge` 拼；不用球、膠囊、圓角蒙皮（`loft` 留著但車身不再用）。楔形車鼻、低車身（離地 0.27 m）、刀鋒側裙、大尾翼、外露的渦輪與噴口。
- **配色**：車身是霧面黑（`main`，帶一點該車的色相）＋碳纖＋一個霓虹強調色（`accent`，面板與車庫色票；`glow` 是同色的光：發光條、車底光暈、噴口、甩尾火花）。**一台車只有一個霓虹色**，不加第二個彩色。
- **戰隊塗裝是程式畫的 canvas 貼花**（`kartModel.ts` 的 `paintNumber`、`MARKS`）：車手的賽車號碼（斜體白字＋車手色底線）與每台車自己的抽象標誌（16×16 格上的幾條斜槓）。**不放任何真實品牌、贊助商、文字標語**；新標誌只用抽象幾何。
- **發光條隨速度變亮**：靜止 0.4、極速 1.0、噴射中再加到 1.9 倍（進 bloom）；噴射時往火焰色偏一點。
- **車手是正常人體比例**：切面全罩安全帽、鏡面護目鏡（全金屬、粗糙度 0.05，染車手色）、花色徽章躺在帽頂後方當戰隊 logo（追車鏡頭看得到）、拼色賽車服（深色底、肩與胸與側邊是車手色）、背號、碳纖護頸、手套與靴子。不做 Q 版大頭。
- **光照是「賽事夜場／黃昏」的對比**：四個主題（`kartThemes`）都降低天光、提高太陽光，陰影深、霓虹才讀得出來；`day` 改成傍晚（低角度暖色太陽、長影子）。賽道路線與路邊場景不屬於這條規則（`KART-WORLD.md` §6）。
- **後處理（`post.ts`）**：色調曲線之前加一點對比與飽和（`grade`）；bloom 的門檻降一點、強度與擴散收一點，發光條讀成線而不是霧；暗角稍重。

**介面（`src/kart/ui/broadcast.ts`，顏色照舊只來自 `tokens.ts`）**

- **`broadcast` 面板**取代卡丁車畫面裡的 `glass`：右上與左下各切一角、左上一小段主題色橫條、上下髮絲線；900 px 以上才模糊。要蓋住賽道的整面文字（車庫）用不透明的 `broadcastSolid`。
- **`ticker`**：斜的實色條，放短標籤（圈數、名次、警告、提示）。圈數是主題色 ticker；名次表每列的名次是斜的小牌，自己那列主題色。
- **`digits`**：所有會跳動的數字（計時、時速、圈速、成績）用等寬字、`tabular-nums`，數字跳動時版面不抖。
- **大字（3、2、1、GO、完美起跑、噴射、連噴）**：`slam` 從過大且傾斜砸進定位，左右各分出一道洋紅與主題色的邊（`splitShadow`）；大的喊話後面有一道橫掃的光（`streak`）。**`prefers-reduced-motion` 時全部靜止**（不只是縮短），字照樣顯示。倒數的字高是 `clamp(88px, min(24vh, 30vw), 200px)`，直拿手機不會蓋住 HUD。
- **車庫**：每台車、每位車手是一張切角卡，左邊一道斜的色條（車的霓虹色、車手的徽章色），車手下面是賽車號碼；數值條是斜的格子。選中是主題色框加底色，不只靠顏色（`aria-checked`、框變粗）。
- **不變的**：道具欄在正上方中間（#100）、手機橫／直的版面規則（#89、#95）、所有 `data-testid` 與 ARIA；clip-path 一律在 `::before`（焦點框完整）；文字顏色只用 `text`／`muted`／`onAccent`，霓虹色只當裝飾（色條、框），不當文字底色以外的對比來源。

**卡丁車等待室（2026-11-21，`feat/kart-room-lobby`，`ARCHITECTURE.md` §4.58）**

- 同一套轉播風格：陣容、準備列、賽道卡都是 `broadcastSolid`；號位是 `ticker`；名字、狀態用 `displayType`；標籤用 `monoType`。
- **準備完成**＝綠色（`success`）2 px 框＋內光暈＋大字；房主＝主題色框＋「房主」；沒準備／離線是 `muted` 字，不只靠顏色（狀態一定有字）。隊伍是格子上緣 4 px 的隊色＋隊名標籤。
- 背景圖只是裝飾（`aria-hidden`），面板一律不透明，文字對比不靠背景。

## 4. 版面

- 頂欄：玻璃、黏在最上面；標誌（`public/favicon.svg`，批次 E3）＋ `TKU Arcade`（Saira 斜體），右邊主題與語言切換。400 px 以下只留標誌（名字只是看不到，連結名稱還在），所以到 360 px 都是一行。
- **標誌（批次 E3，`e7-t16`）**：斜 −14° 的切角徽章（左上與右下切角，青色框、夜色底），裡面一個 A：兩條往遠方收的路邊（青），橫槓是一顆洋紅菱形（橋牌的方塊）。檔案與用法：
  - `public/favicon.svg`：標誌本身，自帶 `surface` 夜色底，**深淺主題都用這一個**；分頁 favicon 與頂欄共用。`favicon-32.png`、`apple-touch-icon.png`（180 px，加 `bg` 夜色方底，iOS 自己切圓角）由它算出來。
  - `docs/brand/mark-light.svg`：淺色版（白底、深青、深洋紅），給網站以外的淺色背景用；`lockup-dark.svg`／`lockup-light.svg`：橫式組合，標誌＋`TKU ARCADE`（Saira 斜體 900）＋小字 `淡江遊樂場`（Noto Sans TC 900，品牌色），字已轉外框。
  - 規則：顏色只用 `tokens.ts` 的值（圖檔讀不到 CSS 變數，所以寫成色碼；`tests/brand.test.ts` 擋 token 以外的顏色）；不改比例、不加陰影或描邊、不換顏色；標誌四周至少留徽章寬度的 1/4；最小 16 px（16 px 時框線約 1 px，仍認得出 A 與菱形）；橫式組合高度至少 32 px，更小只用標誌。不用淡江大學校徽或任何現成品牌的標記。
- 大廳的「即將推出」卡片（批次 E3）：沒開放的遊戲照樣一張卡，主題色頂邊與字首，玻璃上一層主題色 9% 的斜線（−76°，跟著 −14° 的斜角），不浮起；名稱下一個斜標籤（`raised` 底、mono 大寫）；只有簡介，沒有人數、時間、規則連結與按鈕。
- 大廳：主視覺（洋紅斜標籤、大標題、一句話、暱稱、貼連結加入；寬螢幕右邊是幾塊程式畫的色塊，手機藏起來，好讓第一款遊戲的「建立房間」留在第一個畫面）＋ **「跟電腦玩」**（2026-11-21）＋ 遊戲卡片網格（桌機三欄、手機單欄；卡片頂邊與字首是那款遊戲的顏色）＋ 公開房列表（斜條，遊戲名用那款遊戲的顏色）。
- **「跟電腦玩」區塊**（2026-11-21，`QuickPlay.tsx`，`ARCHITECTURE.md` §4.55）：`sunken` 混 8% `brand` 的底、左邊 4 px 品牌色條（和安裝提示、App 的房號欄同一種「醒目但不是卡片」的做法）；標題＋一句說明，右上（手機在下）是「電腦難度」分段切換（簡單／普通，預設普通）。下面一格一款：小玻璃卡、頂邊 3 px 那款遊戲的顏色、遊戲名（`displayType`，不是標題元素）、「你和 N 位電腦玩家」、主要按鈕「立刻開玩」（填那款遊戲的顏色）。桌機一列放得下全部，手機兩欄（360 px 也是兩欄、不捲橫向）。卡丁車兩格：對戰電腦（主要按鈕）與駕訓班（次要按鈕）。遊戲卡片的人數與時間後面加「可以跟電腦玩」：字是 `text` 色、前面一顆主題色小菱形（顏色只當記號，不當文字）。
- **新版本提示**（2026-11-21，`UpdatePrompt.tsx`）：任何頁面的上方置中、`surface` 底、左邊品牌色條，像 toast 但不會自己消失（`role=status`）；「重新整理」（主要）與「稍後」（ghost）。安裝提示多一個「不用了」（ghost），按了就記在這台裝置。
- 房間：頂欄 ＋ 房間標題列（遊戲名，前面一條發光的主題色斜槓；在房人數的斜標籤；「怎麼玩」）＋ 主區（遊戲畫面）＋ 右欄（座位、聊天；手機變抽屜）。等待室寬螢幕兩欄：左邊座位、旁觀者與開始條（準備、站起來、開始遊戲），右邊邀請（房號大字、連結、QR）、遊戲與規則、解散、聊天；手機一欄，順序相同，聊天仍是底部的抽屜。
- 規則頁：大標題、玻璃面板上的文章，每個小標題前一個主題色斜方塊；表頭用 mono。寬度 900px 以下算手機版面（`COMPACT_QUERY`）：等不得的東西不放抽屜（倒數、卡住的座位、遊戲結束後的房主動作），底部固定一條 dock（輪到誰、擲骰、開抽屜）。
- 默契牌局：牌桌上面是三張玻璃進度卡（關卡與本輪、連過、失敗；數字旁邊一條斜的分段條，連過用 `success`、失敗用 `danger`）與禁聊時的洋紅橫條（鎖頭＋文字）；牌桌（`felt*` token，深淺色相同，切四角、主題色細框）依序放公共牌、自己的座位（牌桌上一塊較暗的區域）、籌碼軌，375 × 667 的第一個畫面就看得到這些（批次 E2）；其他座位是玻璃列，左邊一條座位色，準備好了是 `success` 的框加上文字；揭牌是玻璃面板，每列左邊綠或紅、斜標籤寫對或錯，判定是一大行顯示字型；其他人的座位在牌桌下面，手機一欄。籌碼軌一條線排 1 到 n，同時是目前的排列和拿籌碼的按鈕。揭牌由最弱的手牌排起。
- 光譜猜題（H2）：回合數與三步、題目卡（分類斜標籤、大字題目、1 藍 10 洋紅的兩端）、依階段的內容（祕密數字卡＋回答、回答卡＋最小／最大按鈕、數線揭曉）、計分板。「確定」與「下一回合」在 dock。題目卡、量表、數線都是主題色到洋紅的漸層；最大用洋紅、最小用主題色，按下的按鈕上有字，不只靠顏色。手機一欄，600 px 以下數線下面多一張看得到的回答清單。
- 陞官圖圖版（C4 的外觀，C5 的版面）：79 格分成八個部門，每個部門一塊，上面一塊漆牌寫部門名，格子由高到低排。**整張圖版、輪到誰與擲骰永遠同時在畫面上，不捲動**（C5）：圖版有橫式（約 5:3，上排侍衛處｜翰林院｜中樞｜京師部院、下排綠營武職｜武科｜科舉｜地方官）與直式（約 3:5，左欄中樞、翰林院、京師部院、科舉，右欄侍衛處、綠營武職、地方官、武科）兩種排法，畫面量出圖版能用的盒子，選放得最大的那種並縮放；一格不到 60 px 時官名放大、印章不寫字。榮歸是中樞上面的金色大格。朱漆金邊、宣紙格子、楷書官名、角落的紅色品級印章、示意的頂戴顏色；每個官職格子後面一張淡淡的官階浮水印（原創線稿，帽子分出仕途階段、官越大帽子越大越氣派，墨色 22%）；選中的格子（預設是自己那格）以德才功贓小印標出四種結果的去向；點格子開底部的說明面板。玩家籤上一頂自己那格的小帽子。全螢幕（或不支援時的專注模式）時圖版佔滿，旁邊一條欄放陀螺、輪到誰與擲骰。手機直拿時下面一行小字提示轉橫再全螢幕。顏色是 `tokens.ts` 的 `promotionBoard`，深淺色相同。英文格子只放音譯，括號意譯與完整品級在說明裡。
- 卡丁車：全螢幕 canvas，HUD 疊在上面（速度、加速條、圈數、分段、小地圖、道具欄），Esc 開選單。`/kart` 頂欄寬 1180 px 以下或高 500 px 以下只留「回大廳」與「選單」，其他控制項收進選單（360 px 寬與橫拿手機都點得到、不水平捲動）；小螢幕上操作說明預設收起；高 500 px 以下 HUD 並排、小地圖 88 px。手機觸控（2026-11-17，`ARCHITECTURE.md` §4.25）：偵測到觸控才出現半透明虛擬鍵，左下轉向、右下油門／甩尾／噴射／道具／煞車／復位與設定齒輪，每顆 ≥ 48 px（標準 64 px，可調 80–140%）、透明度可調、可左右對調；顯示時 HUD 夾在兩叢中間、字小一號，直拿時 HUD 抬到鍵上面，橫拿時小地圖移到計時框旁的轉向那一側；叢上 `touch-action: none`、不選字、不跳長按選單；顏色用 token（油門 `success`、煞車 `danger`、甩尾 `warning`、噴射 `magenta`、其他 `accent`）。

## 5. i18n 規則

1. **英文是來源語言**：先寫 `en.ts`，再翻 `zh-TW.ts`；key 以語意命名，不以英文句子當 key（句子會改）。
2. **禁止裸字串**：JSX 裡的可見文字一律 `t()`；`scripts/check-i18n.mjs` 擋 zh-TW 缺 key 與多餘 key，也讀 `src/` 每個檔案的語法樹（Vite 的 oxc parser；TypeScript 7 沒有 JS API）找裸字串（2026-11-22，NEXT #6）：JSX 文字、JSX 子節點裡的字串（`{'Hello'}`、三元與 `||`／`??`／`&&` 的字串分支、template、`+` 拼接）、看得到的屬性不論怎麼寫（`aria-label`、`title`、`placeholder`、`alt`、`label`，以及元件的 `message`／`hint`／`heading`／`text` 等），傳給 `alert`／`confirm`／`prompt`／`toast`／`notify`／canvas `fillText`／`new Notification` 的字串，指定給 `document.title`／`textContent` 的字串；註解以外的 CJK。不看：`className`、`data-testid` 等其他屬性、`t()` 等函式呼叫的參數、沒有兩個連續英文字母的字串（符號、數字、單一字母）、網址與路徑。**豁免**：同一行 `// i18n-ignore`，或上一行 `// i18n-ignore-next-line`；JSX 子節點裡寫 `{/* // i18n-ignore */}`。豁免只給景物（卡丁車石碑上的校名）這類兩語都一樣的字。
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
   | Odd one out / Blank / Runs the round | 詞不一樣的人／白板／主持這回合 |
   | Lantern / Match / Moonlight / The avenue / Hand up / Too early | 宮燈（燈）／火柴／月光／大道／舉手／點太早 |
   | Tile / Rack / Pool / Set / Run / Group / Wildcard / First play | 牌／牌架／牌堆／牌組／順子／同數／萬用牌／第一次出牌 |
   | Kite / Kite train / Note / Snapped / Fly it / Set aside | 風箏／串風箏／紙條／斷線／放上去／收起來 |
   | Goods / Gold / Wharf / Stalls · Shops · Trading houses / Reserve / Patron | 貨／金／碼頭／攤子・店號・商行／保留／貴客 |
   | Renown / Shielded / Set aside | 名望／護體／拿掉 |
   | Steamer / Plain / Wasabi / Bid / I'm full / Gold chopstick | 蒸籠／鮮肉／芥末／喊價／吃不下／金筷子 |
   | Backer / Silver / Challenge / Block / Pass | 靠山／銀兩／質疑／擋下／不出手 |
   | Fold / Check / Call / Bet / Raise / All in / Pot / Side pot / Blinds / Sit out | 蓋牌／過牌／跟注／下注／加注／全下／底池／邊池／盲注／暫離 |
   | Misery index / Line / Steal | 慘度／慘度線／搶牌 |
   | Drift / Boost gauge / Boost | 甩尾／加速條／噴射 |
   | Start boost / Jump start / Release boost / Chain / Boost slide | 起跑加速／偷跑熄火／收尾加速／連噴／推滑 |
   | Stacked boost / Counter catch / Boost pad / Chain broken | 疊噴／反打回正／加速帶／連噴中斷 |
   | Double release / Slide (the car sliding in a drift) / Grip | 雙收尾／側滑／抓地（2026-11-14；「甩頭 Flick」已拿掉） |
   | Time trial / Item race / Ghost | 時間賽／道具賽／幽靈車 |

7. **規則頁**是 markdown 兩份，不是 `t()`；由英文寫起，繁中翻譯，兩份都是「自己的話」，不轉載原作說明書。
8. **預設語言**：`en`；第一次進站（localStorage 無紀錄）依 `navigator.languages` 偵測，`zh*` 用繁中、其餘英文；之後以使用者切換為準（2026-11-03 拍板）。
9. **字串放哪裡**（2026-11-15，首屏只帶一種語言，`ARCHITECTURE.md` §5.1）：大廳與全站共用的放 `src/i18n/en.ts`／`zh-TW.ts`；只有房間裡才看得到的（等待室、房主、聊天、結算、房間錯誤）放 `room.en.ts`／`room.zh-TW.ts`；遊戲的名稱與簡介放 `shared/games/lobby.en.ts`／`lobby.zh-TW.ts`（只准這兩個 key 與 `tryAlone`）；遊戲的選項、錯誤、結算放那款的 `i18n.ts`；畫面自己的放 `i18n.screen.ts` 等隨畫面載入。放錯地方 `check-i18n`、`catalog.test.ts` 或 `npm run budget` 會擋。

## 6. 無障礙

- 全部操作可鍵盤完成；焦點樣式可見；拖曳（例如光譜猜題全排序模式的排序）有鍵盤替代（方向鍵移動、Enter 放下）。
- 陞官圖**完整版**圖版（C7）：同樣的朱漆、宣紙、楷書、印章與棋子；182 格、37 個部門，**部門牌匾直立在格子左邊**（中文直書、英文橫躺的短名），格子由低到高、由左到右，六部五格對齊成表；頂端（歸宿、封爵、宮銜、殿閣）在中欄上面，科舉與出身在中欄下面。官階同時用三種方式表示：浮水印（墨色 30%，越大的官帽子越大）、格子的紙色隨品級變金、頂戴小圓點與品級印章；大賀與予告榮歸是金格、長戍灰格。格子底部：銀兩小印（左）與要求（右，藍底一字）。dock 三行固定高度：輪到誰、組合、結果兩行；玩家籤一條固定 56 px，寫銀兩、功名、旗民、退休與長戍（文字，不只靠顏色）。銀兩轉帳在圖版上方浮出清單，籤上浮起 ±；結算是蓋在圖版上的表，一欄一欄出現。`promotionBoard` 多了 `face.liang`、`face.rou`、`silver`、`silverDeep`、`gain`、`loss`、`exile`、`onExile`、`requirement`、`onRequirement`。
- 一大片格子只佔一個 Tab 停靠點：陞官圖圖版用方向鍵在格子間移動（照畫面上下左右，不是沿著路徑），Enter 或空白鍵看說明，Home、End 到起點與榮歸。
- 按鈕上看得到的字要包含在無障礙名稱裡（WCAG 2.5.3）：「轉移房主：{name}」，不是另一句話。只給螢幕閱讀器的文字用 `VisuallyHidden`。
- 觸控螢幕上（`pointer: coarse`）可點的東西至少 44 px：`Button` 的 `sm` 尺寸自己會放大，連結要自己設。手機版面的底部 dock 用 `scroll-padding-bottom` 避開，Tab 不會停在 dock 後面。
- `e2e/a11y.spec.ts`（axe，擋 serious 與 critical）、`keyboard.spec.ts`、`mobile.spec.ts`、`zh-walkthrough.spec.ts` 目前要手動跑（`npm run test:browser`，先 `npm run dev`，或設 `BASE_URL` 指向預覽站），CI 還沒跑。新畫面要各加一行。繁中走查清單在 `ZH-WALKTHROUGH.md`。
- 狀態不只靠顏色：輪到誰同時有外框與文字；道具圖示形狀各異。
- 動畫尊重 `prefers-reduced-motion`。
- axe 無嚴重錯誤是 CI 的一部分（M1）。

## 7. 視覺資產

- 所有圖示、插圖、模型、音效都在 `docs/ASSETS.md` 登記（來源、授權、作者）。例外：程式畫的 SVG 與 CSS（陞官圖圖版、CSS 3D 的四面陀螺、骰子，默契牌局的花色、牌背、皮膚線條）與 `src/lib/sound.ts` 用 WebAudio 合成的音效都是這個 repo 自己的程式碼，沒有資產檔，不用登記。陞官圖的官階浮水印（C5）是獨立的 SVG 檔（`src/games/promotion/rankArt.svg`），雖然也是這個 repo 自己畫的，仍照資產登記。網站標誌與 favicon（批次 E3，`public/`、`docs/brand/`）也一樣登記。
- 風格一致：低多邊形卡通（3D）、簡單幾何插圖（2D）。
- 不出現任何原作的角色、標誌、配色組合。
