# ASSETS — 資產登記

每一個不是這個 repo 自己程式碼的資產（模型、貼圖、音檔、字型、圖片）都登記在這裡：來源、授權、作者、放在哪裡、誰用它。規則見 `CLAUDE.md` 硬性規則 4、`docs/PRD/01-legal-ip-analysis.md` §4-4、`DESIGN.md` §7。

- 模型、貼圖、音檔放 R2（`tku-arcade-assets`），**不 commit**；小於 100 kB 的 SVG／PNG 圖示可以進 repo。
- 程式畫的 SVG（陞官圖圖版、陀螺、骰子，默契牌局的牌與皮膚）與 `src/lib/sound.ts` 用 WebAudio 合成的音效是這個 repo 自己的程式碼，不用登記（DESIGN §7）。**獨立的圖檔**即使是自己畫的也登記，例如陞官圖的官階浮水印（下面「圖片」）。
- `npm run check-assets`（`e12-t08`，K1 起在 CI）：repo 裡每個圖片、模型、音檔、字型檔的路徑都要用反引號寫在這份表裡；模型、貼圖、音檔一律不准進 repo（放 R2）；進 repo 的圖檔不超過 100 kB。測試基準圖除外。
- **卡丁車的賽道美術是程式產生的**（K1，`e8-t05b`）：路面、路緣、護欄、草地、河、橋、樹、房子、山、燈柱、起終點門、看台、輪胎堆的形狀與貼圖都由 `src/kart/art/` 的程式在瀏覽器裡畫出來（canvas 貼圖、three.js 幾何），沒有任何模型或圖檔，所以不用登記、也不用放 R2。風格是本專案自己的低多邊形卡通（Q4），沒有參考或模仿任何現成遊戲的美術。
- **第二張賽道「漁港」（暫名，N1 `e10-t03`）的美術也是程式產生的**：`src/kart/art/harbourArt.ts` 畫海、碼頭、防波堤與消波塊、燈塔、漁船、起重機、貨輪、貨櫃、倉庫、椰子樹、燈籠、山坡與房子，貼圖（混凝土、浪板、窗戶與亮窗、夕陽光帶）都是 canvas 畫的；沒有模型或圖檔，不用登記、不放 R2。
- **懸浮車與第三張賽道「淡江校園」（暫名，2026-11-14）的美術也是程式產生的**：三款懸浮車身與 Q 版車手（`src/kart/art/kartModel.ts`）、火花與發光軌跡（`effects.ts`）、淡江校園的宮燈與宮燈教室、高塔、圖書館、書卷雕塑、草坪、商管大樓、船形博物館、克難坡的階梯、淡水鎮、河、觀音山（`src/kart/art/tamkangArt.ts`），貼圖（地磚、窗戶、琉璃瓦、草坪條紋、石碑上的純文字校名）都是 canvas 畫的；沒有模型或圖檔，不用登記、不放 R2。建築是公共建築的風格化印象，沒有用任何照片、校徽或標誌。
- **測試的基準圖不是資產**：`e2e-visual/__screenshots__/*.png`（I4，`e7-t10`）是網站自己畫面的截圖，由 CI 的 Playwright 容器產生，只給視覺回歸比對用，不出現在網站上，不登記、不放 R2（13 張，共約 3.6 MB；畫面改了才換）。大廳卡片的小圖（`src/components/GameArt.tsx`）是程式畫的 SVG，同上不用登記。

## 字型

| 資產 | 用在哪裡 | 來源 | 授權 | 怎麼載入 | 登記日期 |
| --- | --- | --- | --- | --- | --- |
| LXGW WenKai TC（霞鶩文楷 TC），700 字重 | 陞官圖圖版的官職名稱、部門牌匾、品級印章、榮歸、陀螺與目的地標記；格子說明的標題（`font.kai`，`src/styles/tokens.ts`） | LXGW（落霞孤鶩），經 Google Fonts 提供：<https://fonts.google.com/specimen/LXGW+WenKai+TC>；原始專案 <https://github.com/lxgw/LXGWWenKaiTC> | SIL Open Font License 1.1 | **不打包、不 commit、不放 R2**。陞官圖畫面打開時加一個 `<link>` 到 Google Fonts 的 CSS，用 `text=` 只要求圖版會畫的字（175 個漢字加拉丁字母，`src/games/promotion/boardFont.ts`），Google 回傳只含這些字的一個 woff2，約 63 kB（2026-11-10 量）。完整版（C7）另發一個請求，只要完整版圖版畫的字（182 個官名、部門牌匾、印章、六面的字，`src/games/promotion/full/fullFont.ts`），只有完整版的房間會發。載入前或載入失敗時用系統楷書（macOS 的「BiauKai」／「Kaiti TC」、Windows 的「標楷體 DFKai-SB」），再退到襯線字 | 2026-11-10（C4） |
| Saira，斜體 800、900 字重 | 拉丁文的標題、按鈕、標誌字 `TKU Arcade`、大廳主視覺（`font.display`） | Omnibus-Type，經 Google Fonts 提供：<https://fonts.google.com/specimen/Saira>；原始專案 <https://github.com/Omnibus-Type/Saira> | SIL Open Font License 1.1 | **不打包、不 commit、不放 R2**。`main.tsx` 一開始由 `src/styles/webFonts.ts` 加一個 `<link>` 到 Google Fonts 的 CSS（三個字型同一個請求，`display=swap`），用程式加的樣式表不擋首次繪製；Google 依 `unicode-range` 切片，頁面只下載用到的拉丁切片。沒載到時用 Arial Narrow 或系統字 | 2026-11-11（批次 E1） |
| Noto Sans TC（思源黑體 TC），900 字重 | 中文的標題與按鈕（`font.displayZh`，`displayType` 在 `:lang(zh)` 時） | Google，經 Google Fonts 提供：<https://fonts.google.com/noto/specimen/Noto+Sans+TC>；原始專案 <https://github.com/notofonts/noto-cjk> | SIL Open Font License 1.1 | 同上一列。CJK 字型由 Google 切成約百個 `unicode-range` 切片，瀏覽器只下載畫面上的字所在的切片；只要 900 一個字重。內文與 mono **不用**它（只載了 900，放進內文會全部變超粗），內文用系統的蘋方／微軟正黑體。沒載到時用蘋方、微軟正黑體 | 2026-11-11（批次 E1） |
| JetBrains Mono，500、700 字重 | 數字、房號、座位號、小標籤、倒數秒數、表頭（`font.mono`） | JetBrains，經 Google Fonts 提供：<https://fonts.google.com/specimen/JetBrains+Mono>；原始專案 <https://github.com/JetBrains/JetBrainsMono> | SIL Open Font License 1.1 | 同上。沒載到時用 SF Mono、Menlo、Consolas | 2026-11-11（批次 E1） |

使用者的瀏覽器會向 `fonts.googleapis.com` 與 `fonts.gstatic.com` 要字型，Google 看得到請求的 IP。批次 E1 之前只在陞官圖畫面發生；**批次 E1 起每一頁都會**（外框的三個顯示字型），陞官圖畫面再多要一次楷書。`index.html` 對這兩個網域 `preconnect`。Worker 目前沒有設 CSP；之後加 CSP 時要放行這兩個網域的 `style-src` 與 `font-src`。

## 圖片、模型、音檔

| 資產 | 用在哪裡 | 來源 | 授權 | 怎麼載入 | 登記日期 |
| --- | --- | --- | --- | --- | --- |
| 陞官圖官階浮水印 `src/games/promotion/rankArt.svg`（約 18 kB，gzip 約 2 kB）：13 個 `<symbol>`，瓜皮帽、士子暖帽、科甲簪花帽、文官涼帽三級、最高的官帽與朝珠、綠營頭盔三級、侍衛暖帽兩級，加榮歸格子的牌坊；C7 為完整版加 3 個：`peer`（爵位：官帽與誥命）、`arch`（退休的方形牌坊）、`exile`（長戍：山、烽燧與旗），共約 20 kB | 陞官圖每個官職格子的浮水印、玩家籤的小帽子、榮歸的牌坊（`rankArt.ts`、`PromotionBoard.tsx`、`PromotionScreen.tsx`）；完整版的每一格（`full/fullArt.ts`、`full/FullBoard.tsx`） | **本專案原創**：AI 協作者為 TKU Arcade 畫的線稿（座標由程式產生，2026-11-12），沒有描或參考任何現成圖片；服飾只取清代官帽的大意，畫面標「示意」 | 與這個 repo 的程式碼相同（擁有者所有） | 小於 100 kB 的 SVG，**commit 在 repo**、不放 R2。Vite 打包成有雜湊的檔（`?no-inline`，不內嵌成 data URL），格子用 `<use href="…#symbol">` 引用，瀏覽器在首次繪製後才下載，不算 JS 首屏。只用 `currentColor` 與 `var(--knob)`，顏色由 `tokens.ts` 給；測試擋檔內出現顏色、外部參照、腳本與壞掉的 XML（`tests/games/promotion/rankArt.test.ts`） | 2026-11-12（C5） |
| 網站標誌與 favicon：`public/favicon.svg`（標誌，約 0.4 kB）、`public/favicon-32.png`（32 px）、`public/apple-touch-icon.png`（180 px）、`docs/brand/mark-light.svg`（淺色版）、`docs/brand/lockup-dark.svg`／`docs/brand/lockup-light.svg`（橫式組合，各約 18 kB） | 分頁 favicon、iOS 主畫面圖示（`index.html`）、頂欄的標誌（`TopBar.tsx`）；橫式組合用在 README 與網站以外 | **本專案原創**：AI 協作者為 TKU Arcade 設計（2026-11-12，批次 E3），幾何是手寫的座標，沒有描或參考任何現成標誌；不含淡江大學校徽。橫式組合的字是 Saira 斜體 900 與 Noto Sans TC 900（上面「字型」兩列，SIL OFL 1.1）轉成的外框：OFL 允許用字型做成的圖像，圖像本身不受 OFL 約束。PNG 由 `favicon.svg` 用 Chromium 算出來 | 與這個 repo 的程式碼相同（擁有者所有） | 小檔，**commit 在 repo**、不放 R2。`public/` 的檔由 Vite 原樣複製到網站根目錄，`<link>` 與 `<img>` 直接用固定網址，不進 JS。圖檔讀不到 CSS 變數，顏色寫成色碼，但只能是 `tokens.ts` 的值；`tests/brand.test.ts` 擋別的顏色、腳本、外部參照與 `<text>`，也查 PNG 的尺寸 | 2026-11-12（批次 E3） |
| App 圖示與安裝檔：`public/icon-192.png`、`public/icon-512.png`（標誌加 10% 邊）、`public/icon-maskable-512.png`（標誌在 80% 安全圓內）、`public/manifest.webmanifest`、`public/offline.html`（離線頁）、`public/sw.js`（只快取離線頁） | 安裝成 App（PWA，`e7-t09`）：主畫面圖示、啟動畫面、離線時的頁面 | **本專案原創**：由 `public/favicon.svg`（上一列）放在夜色底（`tokens.ts` 的 `bg`）上，用 Chromium 算出 PNG（2026-11-13） | 與這個 repo 的程式碼相同（擁有者所有） | 小檔，**commit 在 repo**、不放 R2；`public/` 原樣複製到網站根目錄。`tests/brand.test.ts` 查 PNG 尺寸、manifest 的圖示與顏色、離線頁只用 token 色、service worker 不快取 App | 2026-11-13 |

模型、音檔目前沒有。
