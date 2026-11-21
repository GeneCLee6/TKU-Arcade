# 卡丁車效能：量法與前後數字（2026-11-20，`feat/kart-perf-replay`）

擁有者 2026-11-20：「繼續開發」。卡丁車 chunk 約 425／600 kB；#104 電競畫風之後中畫質慢了 6–11%；之後又加了技術賽道場景（#115）、夜間車燈（#117）、17＋3 台車與變身、14 種道具特效。朋友多半用手機玩，實機幀數沒量過。這份文件記**怎麼量**、**量到什麼**、**改了什麼**，之後再改畫面時照同樣的方法量前後。

## 1. 量法

- **腳本**：`scripts/kart-fps.mjs`。開真的頁面（`/kart?autopilot`），選單開一場**電腦車道具賽**（7 台電腦車、困難、3 圈），玩家用測試自動駕駛；`--warmup` 秒後開始數，數 `--seconds` 秒。**不鎖幀**（`--disable-frame-rate-limit --disable-gpu-vsync`），所以 fps 是「這台機器最多畫多快」，用來比前後，不是手機的實際幀數。
  - `--track all`：12 張內建賽道；`--screens desktop,phone,small`：1280×720@1、手機橫向 844×390@3、小手機 667×375@2；`--qualities low,medium,high`；`--json out.json` 存每一列。
  - 每列：fps、**平均每幀 draw calls 與三角形**（整個數的區間平均，含陰影與後處理的每一個 pass）、GPU 上的 geometries／textures／programs、實際的 pixel ratio、**每幀 JS 時間**（`requestAnimationFrame` 回呼從頭到尾，含物理、電腦車、畫面的 CPU 端）、JS heap。
- **頁面上的數字**：`window.__kartSpike.render`（最近一幀，0.5 秒更新：calls、triangles、geometries、textures、programs、pixelRatio）、`jsMs`（平滑後的每幀 JS ms）、`totals`（累計的幀數、calls、triangles、JS ms，腳本拿區間差）。`Scene.ts` 把 `renderer.info.autoReset` 關掉，每幀開頭自己歸零，所以陰影、bloom 的每個 pass 都算到。
- **找成本**：Chrome DevTools 的 Performance 錄 5 秒（或 CDP `Profiler`，`vite build --minify false` 看得到函式名）；draw call 的分類是暫時把 `renderer.renderBufferDirect` 包起來，照物件所屬的最上層群組與材質種類計數（這次的一次性分析，沒有留在程式裡）。
- **前後對照**：「前」是 `main` 的 `9b97c01` 只加上量測用的計數（`git archive` 到別的資料夾建置），「後」是這個分支；兩個建置用同一個靜態伺服器輪流量，同一台機器（Intel UHD Graphics 770 內顯，ANGLE D3D11）。**這台機器同時有別的工作在跑，fps 的絕對值會飄 ±20%**；draw calls、三角形、geometries 不受影響，比較可靠。

```bash
npm run build && node scripts/kart-fps.mjs --base http://localhost:<port> \
  --qualities low,medium --screens phone --track all --warmup 5 --seconds 8 --json after.json
```

## 2. 量到的成本（優化前，手機 844×390@3、中畫質、河濱）

| 項目 | 每幀 | 說明 |
| --- | --- | --- |
| 粒子（煙、火花、噴射的火） | **約 370 個 draw call** | 每一顆都是一個 three.js `Sprite`，一顆一個 draw call；8 台車的池子共 1,358 個 Sprite 掛在場景上，每幀都要走一遍矩陣更新 |
| 每台車 | **52–73 個 draw call** | `flatten` 只合併「同一個材質」的零件；每台車約 20 個材質（`colour()` 每次都新建一個），變身的每個鉸鏈、車手的每個關節是各自的群組，乘起來 |
| 自己車的陰影 | 59 個 draw call | 陰影 pass 把車的每個零件再畫一次 |
| 賽道 | 73＋陰影 32 | 本來就大量用 InstancedMesh，這次不動 |
| JS | 每幀 8–11 ms（低畫質 7–8 ms） | 前幾名：Sprite 與零件的 `updateMatrixWorld`、three.js 的每個 draw call 成本（`setProgram`、uniforms、VAO 綁定）、物理的 `collideWalls`（8 台車 × 每步全部牆面） |
| 場景物件 | 2,191 個 | 其中 1,358 個是 Sprite |

中畫質的 GPU 成本主要在後處理（HDR 半浮點緩衝 4× MSAA、bloom 4 層）與 1.5 倍解析度；低畫質是 CPU（draw calls 與 JS）卡住。

## 3. 做了什麼（照投報率）

1. **粒子合批**（`src/kart/art/particles.ts`）：一個 instanced 四邊形，一批一個 draw call，每顆粒子是一個 instance（中心、大小、顏色、透明度、旋轉）。shader 照 three.js 的 Sprite（同樣面向鏡頭、同樣的大小、霧、色彩空間、tone mapping），所以**畫面不變**。每台車兩批（煙：一般混色；火花與噴射的火：加法混色），撞擊特效（`hitArt.ts`）兩批（星星、光暈）。同顏色的煙在一般混色下前後順序不影響結果（數學上對稱），所以不用排序。**粒子 370 → 最多 16 個 draw call，場景物件 2,191 → 約 680。**
2. **車的烤漆合併**（`kartParts.ts` 的 `createPaintMaterial`、`flatten(…, paint)`）：每種「烤漆」（`colour()` 做的標準材質、碳纖維）記下自己的顏色、粗糙度、金屬度、自發光、環境反射強度、有沒有碳纖維紋，寫進合併後幾何的**頂點屬性**；一個群組裡所有的烤漆合成**一個** mesh、用一個共用材質，shader 是 three.js 自己的 `MeshStandardMaterial`，只把那幾個值從 uniform 改讀頂點（`onBeforeCompile`）。光照、反射、碳纖維紋一模一樣。**每台車 52–73 → 27–46 個 draw call。**
3. **遠處的車用簡化版**（`KartModel.detail(far)`）：別的車在建的時候多做一份「靜止的自己」（變身關、開各一份），所有零件按材質合併成幾個 mesh，掛在底盤上（所以還是會浮動、壓彎、抬頭）；離鏡頭超過 22／32／45 m（低／中／高，±2 m 的緩衝）就換成這份。差別只有車手的手和頭不動、變身瞬間切換，在那個距離是一兩個像素。**遠處每台車約 10–12 個 draw call。**
4. **自己的車的陰影用替身**：同樣合併成**一個** mesh（只有位置，關、開各一份），不寫顏色也不寫深度，只投影子；零件本身不投影子。**陰影 59 → 1 個 draw call**（主畫面多 1 個不寫任何東西的 draw）。
5. **撞牆檢查先看外框**（`shared/kart/walls.ts`）：每面牆的外框算一次（每份牆的陣列一次），車離外框超過半徑＋1 mm 就跳過那面牆，不算最近點。被跳過的牆在原本的算法裡也一定不會推車（距離 ≥ 半徑），**結果逐位元相同**（`flatGolden`、`branchGolden` 不變）；8 台車 × 每步幾百面牆的計算大多省掉。
6. **動態解析度**（`src/kart/resolution.ts`）：每秒算一次平均幀數；低於 50 就把 pixel ratio 降一級（×0.85，最低是該畫質的 60%），之後 30 秒內不再升回那一級；連續 4 秒 ≥ 57 才升一級。跟得上的機器永遠停在該畫質原本的解析度（**高畫質在好機器上一個像素都不會少**）；處理器畫圖（瀏覽器測試）時不啟用。目前的值在 `__kartSpike.render.pixelRatio`。

沒有做的（評估過）：

- **每幀零配置**：GC 在 profile 裡只佔約 1%，這次不動；粒子與牆檢查已經不再每幀建物件。
- **後處理按畫質關**：低畫質本來就沒有後處理；中畫質的 bloom 是 #104 的畫風本身，關掉就回到 #104 之前的樣子，所以改用動態解析度保幀數。
- **把賽道場景、車款模型、音樂拆成 lazy chunk**：見 §5。

## 4. 前後數字

（「前」＝`main` `9b97c01`＋計數；「後」＝這個分支。7 台電腦車、道具賽、熱身 5 秒後數 8 秒；fps 不鎖幀。）

### 4.1 手機橫向 844×390@3，12 張賽道

| 畫面 | 賽道 | 畫質 | fps 前 → 後 | draw calls 前 → 後 | 三角形 前 → 後 | geometries 前 → 後 | JS ms/幀 前 → 後 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 844x390@3 | riverside | low | 67 → 133 | 697 → 271 | 148k → 145k | 579 → 535 | 10.2 → 4.8 |
| 844x390@3 | riverside | medium | 46 → 79 | 795 → 318 | 217k → 220k | 574 → 533 | 14.8 → 8.4 |
| 844x390@3 | harbour | low | 83 → 136 | 537 → 289 | 153k → 154k | 620 → 509 | 7.9 → 4.7 |
| 844x390@3 | harbour | medium | 48 → 82 | 751 → 389 | 279k → 280k | 628 → 520 | 14.5 → 8.8 |
| 844x390@3 | tamkang | low | 62 → 127 | 700 → 284 | 215k → 213k | 596 → 545 | 10.6 → 5.1 |
| 844x390@3 | tamkang | medium | 40 → 84 | 845 → 346 | 325k → 328k | 657 → 566 | 16.7 → 8.1 |
| 844x390@3 | oldstreet | low | 68 → 133 | 635 → 312 | 150k → 148k | 702 → 603 | 9.6 → 4.8 |
| 844x390@3 | oldstreet | medium | 53 → 79 | 643 → 398 | 248k → 256k | 715 → 646 | 12.6 → 8.8 |
| 844x390@3 | guanyin | low | 76 → 142 | 574 → 241 | 144k → 146k | 567 → 498 | 8.6 → 4.4 |
| 844x390@3 | guanyin | medium | 46 → 87 | 685 → 300 | 209k → 217k | 576 → 534 | 14.4 → 7.7 |
| 844x390@3 | mangrove | low | 78 → 126 | 776 → 263 | 153k → 156k | 548 → 547 | 9.1 → 5.0 |
| 844x390@3 | mangrove | medium | 51 → 77 | 958 → 314 | 283k → 285k | 597 → 541 | 13.6 → 8.8 |
| 844x390@3 | fort | low | 80 → 130 | 694 → 267 | 146k → 149k | 561 → 544 | 8.9 → 5.1 |
| 844x390@3 | fort | medium | 57 → 70 | 761 → 297 | 220k → 226k | 584 → 558 | 12.3 → 9.7 |
| 844x390@3 | danhai | low | 80 → 107 | 694 → 280 | 130k → 130k | 620 → 620 | 8.5 → 5.8 |
| 844x390@3 | danhai | medium | 51 → 62 | 810 → 352 | 225k → 227k | 657 → 638 | 13.3 → 10.3 |
| 844x390@3 | datun | low | 78 → 116 | 696 → 247 | 184k → 183k | 556 → 531 | 8.6 → 5.3 |
| 844x390@3 | datun | medium | 50 → 74 | 799 → 284 | 282k → 286k | 555 → 533 | 13.5 → 8.7 |
| 844x390@3 | wharf | low | 69 → 100 | 633 → 243 | 159k → 161k | 573 → 530 | 9.4 → 6.0 |
| 844x390@3 | wharf | medium | 47 → 62 | 776 → 315 | 243k → 244k | 608 → 564 | 13.5 → 10.2 |
| 844x390@3 | lanes | low | 56 → 113 | 817 → 256 | 169k → 170k | 593 → 553 | 12.0 → 5.5 |
| 844x390@3 | lanes | medium | 51 → 74 | 899 → 309 | 259k → 261k | 580 → 545 | 13.6 → 8.9 |
| 844x390@3 | works | low | 58 → 90 | 709 → 296 | 172k → 170k | 592 → 545 | 11.0 → 7.1 |
| 844x390@3 | works | medium | 45 → 64 | 785 → 337 | 249k → 255k | 593 → 527 | 13.8 → 10.0 |
| **平均** | 手機 × 12 張 | low | 71 → 121 | 680 → 271 | | | 9.5 → 5.3 |
| **平均** | 手機 × 12 張 | medium | 49 → 74 | 792 → 330 | | | 13.9 → 9.0 |

### 4.2 小手機 667×375@2 與桌機 1280×720，三張代表賽道、三種畫質

| 畫面 | 賽道 | 畫質 | fps 前 → 後 | draw calls 前 → 後 | 三角形 前 → 後 | geometries 前 → 後 | JS ms/幀 前 → 後 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 667x375@2 | riverside | low | 76 → 180 | 625 → 248 | 143k → 142k | 564 → 506 | 8.9 → 3.6 |
| 667x375@2 | riverside | medium | 57 → 104 | 727 → 321 | 215k → 218k | 571 → 539 | 11.8 → 6.5 |
| 667x375@2 | riverside | high | 44 → 75 | 848 → 333 | 234k → 233k | 624 → 536 | 15.4 → 9.0 |
| 667x375@2 | oldstreet | low | 84 → 161 | 564 → 335 | 147k → 149k | 680 → 569 | 7.8 → 4.0 |
| 667x375@2 | oldstreet | medium | 56 → 101 | 785 → 343 | 251k → 249k | 743 → 616 | 12.1 → 6.6 |
| 667x375@2 | oldstreet | high | 54 → 69 | 728 → 412 | 293k → 297k | 706 → 616 | 12.4 → 10.2 |
| 667x375@2 | works | low | 106 → 124 | 574 → 297 | 166k → 170k | 579 → 577 | 6.3 → 5.2 |
| 667x375@2 | works | medium | 58 → 82 | 712 → 361 | 249k → 256k | 583 → 576 | 11.5 → 7.9 |
| 667x375@2 | works | high | 45 → 62 | 814 → 372 | 269k → 269k | 615 → 474 | 14.3 → 10.2 |
| 1280x720@1 | riverside | low | 85 → 147 | 633 → 248 | 145k → 147k | 557 → 512 | 8.1 → 4.4 |
| 1280x720@1 | riverside | medium | 56 → 82 | 721 → 327 | 214k → 221k | 580 → 545 | 12.1 → 8.2 |
| 1280x720@1 | riverside | high | 70 → 71 | 736 → 328 | 231k → 235k | 564 → 536 | 9.9 → 9.6 |
| 1280x720@1 | oldstreet | low | 94 → 149 | 457 → 304 | 141k → 148k | 688 → 580 | 6.9 → 4.4 |
| 1280x720@1 | oldstreet | medium | 60 → 74 | 519 → 372 | 237k → 258k | 711 → 587 | 11.0 → 8.7 |
| 1280x720@1 | oldstreet | high | 53 → 68 | 760 → 385 | 296k → 295k | 757 → 631 | 13.1 → 9.8 |
| 1280x720@1 | works | low | 67 → 104 | 725 → 273 | 168k → 168k | 602 → 533 | 9.7 → 6.0 |
| 1280x720@1 | works | medium | 51 → 66 | 782 → 352 | 250k → 251k | 582 → 494 | 12.6 → 10.0 |
| 1280x720@1 | works | high | 41 → 76 | 761 → 390 | 267k → 273k | 575 → 477 | 15.2 → 8.9 |
| **平均** | 2 種畫面 × 3 張 | low | 85 → 144 | 596 → 284 | | | 7.9 → 4.6 |
| **平均** | 2 種畫面 × 3 張 | medium | 56 → 85 | 708 → 346 | | | 11.9 → 8.0 |
| **平均** | 2 種畫面 × 3 張 | high | 51 → 70 | 774 → 370 | | | 13.4 → 9.6 |

## 5. chunk

`npm run budget -- --chunks`（gzip）：

| | 前（`9b97c01`） | 後 |
| --- | --- | --- |
| 卡丁車全部 lazy chunk 合計（預算 600 kB） | 425.7 kB | 434.2 kB |
| 其中進比賽一定載的 `kartModel`（three.js＋模型＋賽道場景）＋`Scene` | 163.3＋54.4 kB | 164.7＋55.5 kB |
| 房間的卡丁車首屏 `KartScreen`（預算 150 kB） | 145.3 kB | 145.8 kB |

多的 8.5 kB 是粒子合批、遠處車、動態解析度（約 2.5 kB，進比賽就載），以及重播檔（`ReplayShare` 1.0 kB、`/kart/replay` 1.9 kB、`replayBlob`／`replayFile` 的驗證，都只在用到時才載）。房間首屏只多了 0.5 kB：重播的打包與驗證放在 `replayBlob.ts`、字串放在 `i18n.replayFile.ts`，首屏只錄不打包，所以不帶它們；`ITEM_IDS` 搬到 `itemIds.ts`，驗證不必連帶載入道具規則與賽道。

**拆 lazy chunk 的評估**（各檔單獨 minify＋gzip 的大小）：

| 候選 | 大小 | 結論 |
| --- | --- | --- |
| 各賽道專屬場景（tamkangArt 6.0、harbourArt 5.9、oldStreetArt 3.8、localArt＋localPlan 4.8、worksArt 2.8、lanesArt 2.7、festival 2.6、wharfArt 2.5、skillKit／skillWalls／skillCues 7.3、cornerArt 1.8） | 合計約 40 kB（同一個 chunk 裡壓縮後約 30 kB） | **2026-11-21 做了，見 §7**。當時的評估：值得，但這次不做。一場比賽只用到其中一兩個，可省進比賽首屏約 25 kB（約 kartModel＋Scene 的 11%）。要先把 `createKartScene` 改成非同步（或每個入口先 `await` 載入賽道場景）：入口有 `startSpikeLoop`（計時賽、電腦車、房間比賽、大獎賽）、`startWatchLoop`（觀戰、重播）、編輯器 3D 預覽，漏一個就是少了場景。列在 NEXT 當下一步 |
| 車款模型（kartBodies 4.1、moreBodies 3.9、bikeBodies 1.8、itemBodies 1.5） | 約 11 kB | 不拆：一場 8 台車通常橫跨好幾個系列，省不到多少，還多一次往返 |
| 音樂與環境音（songs、sequencer、musicPlayer、ambience） | 約 6 kB，`musicPlayer` 已經是自己的 chunk | 不拆：已經夠小 |
| three.js 本身 | 約 120 kB | 不能拆：第一幀就要 |

## 7. 拆 lazy chunk：建場景改成先載完再建（2026-11-21，`feat/kart-lazy-chunks`）

擁有者 2026-11-21：「繼續開發」。房間的卡丁車首屏 146.4／150 kB 長期黃色警告；之後還有新賽道、新車、新配樂要加。做法與程式的形狀在 `ARCHITECTURE.md` §4.52；這裡記數字。

**房間首屏**（不改行為，只搬模組）：首屏的錄影器 `useRaceRecorder` → `replay.ts` → `shots.ts` 只為了一個 `KART_RADIUS` 就把整個物理（`physics.ts`、`classic.ts`、`walls.ts`，6.5 kB）帶進首屏；`useFinishHold` 只為了 `CELEBRATE_SECONDS` 帶進整個導播（0.8 kB）；`replay.ts` 的 `shotsAt`（只有播放用）帶進投射物的路徑（1.6 kB）。改成 `shared/kart/kartRadius.ts`、`src/kart/race/celebrate.ts`、`shared/kart/replayShots.ts` 三個葉子模組（原本的地方 re-export，物理與 golden 不變）。

**比賽**：引擎（three.js＋場景＋迴圈）、賽道專屬場景（10 張賽道各自的區塊）、車款模型（第一批 6 台跟引擎，另外三個車系各一個 chunk）、配樂（7 首各一個 chunk）都是 lazy chunk，進比賽前在載入畫面一起下載，到齊才建場景。

`npm run build && npm run budget -- --chunks`（gzip，zh-TW）：

| | 前（`a5bb590`） | 後 |
| --- | --- | --- |
| 房間的卡丁車首屏 `KartScreen`（上限 150，警告線 140） | **146.4 kB**（warn） | **137.9 kB**（ok） |
| 單機 `/kart` 首屏（選單；之前三.js 與整個引擎都在裡面） | **456.0 kB** | **226.8 kB**（載入畫面與選單先出來，引擎隨後） |
| `/kart` 開一場河濱計時賽，總共下載 | 456.0 kB | 433.3 kB |
| 房間進比賽總共下載：河濱（沒有專屬場景） | 481.9 kB | 461.4 kB |
| 同上：漁港 | 481.9 kB | 467.0 kB |
| 同上：高架廠區（技術賽道，場景最多） | 481.9 kB | 470.8 kB |
| 同上：紅樹林（四張在地賽道之一） | 481.9 kB | 466.0 kB |
| 卡丁車全部 chunk 合計（上限 600） | 450.0 kB | 474.8 kB |
| chunk 數 | 約 73 | 約 110 |

- 各賽道專屬場景（後）：漁港 5.6、淡江 5.8、老街 3.6、在地四張 2.8＋共用的 plan 1.8、碼頭 5.8、巷弄 5.9、廠區 6.0（後三張共用 skillKit／skillWalls／skillCues）kB；車系：moreBodies 4.0、bikeBodies 1.8、itemBodies 1.5 kB；每首歌約 0.3 kB。
- **合計多了約 25 kB**：拆成多個 chunk 每個都從頭壓縮，共用的字典沒了（平均每多一個 chunk 約 0.6 kB），加上載入器、載入畫面、預先下載約 3 kB。玩家實際下載的只會少：進一場比賽少 11–20 kB，`/kart` 的第一個畫面少一半。three.js 本身用 `vite.config.ts` 的 `codeSplitting.groups` 固定成一個 chunk（`three`）：賽道場景與車系只 import 它的核心類別，打包器原本會把它切成兩塊、多約 1 kB。
- 試過沒用的：把 skillKit／skillWalls／skillCues 與在地賽道的 plan／art 用 `codeSplitting.groups` 各併成一塊——group 預設連相依一起拉，結果把 three.js 整個拉進去（170 kB），不能用。

## 8. 之後再量

- 改了畫面（新賽道、新車、新特效）就跑一次 §1 的指令，前後各一份 JSON，貼到 PR。看 draw calls 與 JS ms；fps 只在同一台、沒有別的工作時才比。
- **實機**：擁有者手上的手機開 `/kart/spike`，統計面板的 fps、drawing buffer；或接 USB 用 Chrome 的 `chrome://inspect` 看 `__kartSpike.render` 與 `jsMs`。
