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

## 9. 房間首屏回到 135 以下；駕訓班、挑戰、編輯器的字串各自 lazy（2026-11-22，`feat/kart-fixes-budget`）

擁有者 2026-11-22「全照建議」：房間的卡丁車首屏 139.7／140 kB 又貼著警告線。**量過才知道**：#131 說是挑戰的字串併進 `KART_MESSAGES` 造成的，但 `KART_MESSAGES`（`shared/kart/i18n.ts`）從來不在房間首屏（它跟 `RaceView` 一起在首屏之後）；#131 前後首屏 139.0 → 139.7 kB 的 0.7 kB 是打包器重切共用 chunk（`Standings`、`net.ts` 分出來）。首屏裡真正能拿掉的是**錄影器**與**觀戰名次表**：

- 錄影器 `useRaceRecorder` 原本靜態帶進 `replay.ts`（錄影器＋播放的工具函式）、`net.ts`（frame 格式）、`team.ts`：改成首屏只留一個小殼，真正的錄影（`src/kart/watch/raceTape.ts`）是 lazy chunk，掛上就開始下載；到之前收到的 frame 與 view 依序排隊，到了照順序交給它（上限 20 000 筆，下載失敗就這場沒有重播，比賽照常）。比賽本身（three.js）比它大得多也晚得多，所以實際上不會漏錄。
- 觀戰名次表 `Standings`（＋`broadcast.ts`）只在「比賽中、自己沒車、沒開即時觀看」才出現，改成 lazy。

字串的部分照擁有者的建議也做了，省的是 `/kart` 首屏與進比賽要等的字串，不是房間首屏：駕訓班（`i18n.school.ts`）、挑戰（`i18n.challenge.ts`）、賽道編輯器（`i18n.editor.ts`）不再併進 `KART_MESSAGES`，各由自己的 lazy 畫面（`SchoolView`、`ChallengeView`、`EditorPage`）`registerMessages`；選單入口、駕訓班邀請、比賽中的技巧提示、分享賽道連結這幾句搬到 `i18n.menu.ts`（仍併進 `KART_MESSAGES`）。`check-i18n` 的 `KART_PARTS` 逐一比對這三個檔，key 不得和 `KART_MESSAGES` 重複，`shared/kart/i18n.*.ts` 沒併進也沒列進去就擋。

`npm run build && npm run budget -- --chunks`（gzip，zh-TW）：

| | 前（`bdd81cb`） | 後 |
| --- | --- | --- |
| 房間的卡丁車首屏 `KartScreen`（上限 150，警告線 140） | **139.7 kB**（ok，差 0.3 到警告） | **133.6 kB** |
| 　其中錄影器 `useRaceRecorder`＋`replay`＋`net`＋`team` | 4.9 kB | 0.8 kB |
| 　其中 `Standings`＋`broadcast` | 1.9 kB | 0 |
| 單機 `/kart` 首屏（選單） | 234.6 kB | 224.0 kB |
| 　其中卡丁車字串 `shared/kart/i18n.ts` chunk | 25.3 kB | 14.7 kB |
| 房間首屏之後才載的（比賽、觀戰、重播） | 155.1 kB | 151.1 kB |
| 卡丁車全部 chunk 合計（上限 600） | 506.2 kB | 508.9 kB |

## 8. 之後再量

- 改了畫面（新賽道、新車、新特效）就跑一次 §1 的指令，前後各一份 JSON，貼到 PR。看 draw calls 與 JS ms；fps 只在同一台、沒有別的工作時才比。
- **實機**：擁有者手上的手機開 `/kart/spike`，統計面板的 fps、drawing buffer；或接 USB 用 Chrome 的 `chrome://inspect` 看 `__kartSpike.render` 與 `jsMs`。

## 10. 聲音依畫質分級、車身細節（2026-11-22，#145，`feat/kart-wall-slide-landing`）

### 10.1 聲音（#105，`src/kart/audio/tiers.ts`）

WebAudio 的成本在音訊執行緒，手機上和畫面搶 CPU。`AUDIO_TIERS` 照畫質給：

| | 低 | 中 | 高 |
| --- | --- | --- | --- |
| 同時的一次性聲音（撞牆、噴射的爆音、變身、道具） | 4 | 8 | 16 |
| 環境音的持續層（最大聲的幾層） | 1 | 2 | 全部（最多 4） |
| 偶爾的聲音（海鷗、鈴、路過的車、沖床） | 不響 | 有 | 有 |
| 引擎、環境音的參數多久動一次 | 每 3 幀 | 每 2 幀 | 每幀 |
| 引擎的第二支鋸齒波 | 沒有 | 有 | 有 |

超過上限的一次性聲音直接不放（`voiceBudget`，照音訊時鐘算還在響的）；參數本來就是 `setTargetAtTime` 滑過去，每 3 幀動一次聽不出來。低畫質一台車少一個振盪器，河濱的環境音從 2 層變 1 層、鳥叫不排程。觀戰與重播的 `createCuePlayer(quality)` 也照分級。

摩托車的引擎（#108，`kartAudio.ts` 的 `ENGINE_VOICES.bike`）多一個點火脈衝的 LFO 與一個渦輪高音的振盪器（卡丁車沒有），低畫質一樣拿掉第二支鋸齒波。

### 10.2 車身細節（#99，`src/kart/art/bodyDetail.ts`）

低畫質什麼都不載（沒有貼圖、shader 沒有 bump）；中：256 px 的高度圖（面板縫線、螺絲）當 bump map、塗裝貼紙磨損；高：512 px 加刮痕與細顆粒、64 px 的 2/2 斜紋碳纖。一個畫質一張貼圖、整頁共用（所有車都用同一張），GPU 記憶體最多約 0.25 MB。

**量到的成本**（`scripts/kart-fps.mjs`，1280×720@1、河濱、7 台電腦車、正式建置用同一個靜態伺服器輪流量，各兩次；這台機器同時有別的工作，fps 的絕對值會飄）：

| | 中畫質 fps | 高畫質 fps | textures |
| --- | --- | --- | --- |
| 沒有細節（同一份程式把 `BODY_DETAIL` 都改成 off） | 66 / 63 | 58 / 56 | 65–69 |
| 有細節 | 75 / 78 | 73 / 59 | 68–70 |

差別在雜訊之內（有細節的那組反而比較快，是機器負載的起伏）；draw calls、三角形不變（同一個合併後的材質，只多一張貼圖）。chunk：比賽引擎 263.4 → 265.9 kB、`/kart` 首屏 226.1 → 227.0 kB（車庫預覽也用細節，`bodyDetail.ts` 進了選單的 chunk）、卡丁車總量 512.3 → 516.0／600 kB；房間首屏 134.6 kB 不變。

截圖：`node scripts/kart-shots.mjs --quality low|medium|high --views close`（新增的近拍視角）。

## 11. 第二輪：重新量、暫停不重畫、水面頂點、賽道零件與面板 lazy、renderer 洩漏（2026-11-23，`feat/kart-perf-2`）

擁有者 2026-11-22：「整夜繼續開發」「電競化專業化」，朋友多半用手機玩。#124 之後又加了障礙物（#143）、立體交叉與傾斜彎（#144）、車身貼圖與聲音分級（#145）、觀音山地標與真的海（#150）、滿版等待室 8 個 3D 車手（#151）、頒獎台與暫停模糊（#152）、高台（#156），卡丁車 chunk 合計 567.8／600 kB。程式的形狀在 `ARCHITECTURE.md` §4.78；這裡記量法與數字。

### 11.1 量法（`scripts/kart-fps.mjs` 新增的部分）

- **GPU 記憶體**：init script 包住 WebGL（`bufferData`、`texImage2D`／`texImage3D`／`texStorage2D`、`generateMipmap`、`renderbufferStorage(Multisample)`、三種 `delete*`、`WEBGL_lose_context.loseContext`），照內部格式算位元組；不含畫布本身的 drawing buffer。每列多一欄 `gpu`（MB）。任何 renderer 都算得到（比賽、頒獎台、等待室）。
- `--track all` 多了 `zhuwei`、`breakwater`（14 張）。
- `--pause 4`：數完比賽後先數 2 秒「比賽中」，按 Esc，再數 4 秒「暫停中」。
- `--scene podium`（一圈的比賽跑完、頒獎台出來後數）、`--scene lobby`（API 開房、主持人補 7 台電腦車，數主持人的頁面；要 Worker，所以用 `npm run preview`）、`--scene soak --races 8`（一圈賽連跑 N 場：頒獎台跳過 → 結果畫面 → 「再來一場」；每場結果畫面 `HeapProfiler.collectGarbage` 兩次後記 JS heap、GPU、DOM 節點、監聽器）。這幾種的 fps 是頁面自己的 `requestAnimationFrame` 次數、draw calls 是包住的 WebGL 計數、JS 時間是 DevTools 協定的 `ScriptDuration`。
- 找洩漏：連跑幾場前後各拍一次 heap snapshot（`HeapProfiler.takeHeapSnapshot`），照建構子比數量與大小；再用 `vite build --minify false` 的建置，從 GC root 往下找到留下來的物件的路徑（這次的一次性腳本，沒有留在程式裡）。
- **前後**：「前」＝`main` `1aaf07e` 的正式建置（`dist` 複製一份），「後」＝這個分支；同一台機器（Intel UHD 770 內顯，ANGLE D3D11）、同一個 `vite preview`（port 9100）輪流量。**fps 不鎖幀、機器上同時有別的工作，絕對值會飄 ±20%**（低畫質什麼都沒改也 155 → 180）；draw calls、三角形、GPU 記憶體才是可以比的。高畫質的 GPU 記憶體跟著動態解析度（`pr`）走，同一個場景 1.44 與 2 之間差 40 MB。

```bash
npm run build && npm run preview -- --port 9100
node scripts/kart-fps.mjs --base http://localhost:9100 --qualities low,medium,high --screens phone --track all --warmup 5 --seconds 8 --json phone.json
node scripts/kart-fps.mjs --base http://localhost:9100 --qualities medium,high --screens phone --track riverside --pause 4
node scripts/kart-fps.mjs --base http://localhost:9100 --qualities medium,high --screens phone,desktop --scene lobby --seconds 5
node scripts/kart-fps.mjs --base http://localhost:9100 --qualities medium --screens desktop --scene soak --races 8
```

### 11.2 和 #124 比：哪裡退步了

#124 之後的手機中畫質平均：draw calls 330 → **300**、JS 每幀 9.0 → 7.9 ms（同一台機器，但 #124 量的時候負載比較重，fps 不比）。新加的東西大多用了 instancing 或合併，**沒有 draw call 的退步**。找到的退步：

| 項目 | 量到的 | 原因 |
| --- | --- | --- |
| 高畫質的水面 | 漁港 403k、觀音山 316k、碼頭 292k、河濱 274k 個三角形（中畫質 278k／213k／248k／210k） | `seaWater.ts` 兩邊都照長邊切到 220 × 220：觀音山 1.5 km 的河、漁港 3 km 的海、河濱 2 km 長的窄河都是 97 000 個三角形，大部分在霧裡或比一個像素還遠 |
| 暫停 | 手機中畫質暫停中每幀 310 個 draw call、JS 7.9 ms，跟比賽中一樣（暫停時世界不動，畫面卻每幀重畫，再被 CSS 模糊） | #152 只停了時鐘 |
| 連續比賽的 JS heap | 每場 +0.35 MB、DOM 節點 +2.3，8 場沒有趨平（GPU 每場結束都歸零，沒有 GPU 洩漏） | 見 11.4 |
| 比賽中第一次出現的 shader | 漁港高畫質 profile 裡 `getProgramInfoLog` 3.7%：道具、特效第一次出現時編譯 shader，three.js 讀編譯記錄會讓這一幀等 GPU 編完 | three.js 預設 `checkShaderErrors` |
| 竹圍高架的 JS | 中畫質 profile 裡立體交叉的 `groundOnLevels` 約 8%（每段路 `Math.hypot`） | 物理與畫面共用，改了會動到 golden；**這次不動**，記在 NEXT |

等待室與頒獎台**沒有退步**：手機的等待室畫完就不畫（0 draw call），電腦每 33 ms 畫 8 格、每幀約 15 個 draw call、JS 0.2 ms；頒獎台約 110 個 draw call、JS 2 ms、GPU 3 MB。

### 11.3 做了什麼

1. **暫停時不重畫**（`KartScene.hold`）：單機暫停時畫一幀就停，畫布尺寸變了才再畫一次。
2. **水面依邊長、依遠近切格**（`seaWater.ts`）：賽道範圍外加 150 m 內每 12 m 一列（原本 12–15 m，近處沒有變粗），往外每列 ×1.4、最寬 240 m。浪的公式與 shader 不變。
3. **renderer 洩漏**（`art/sharedTextures.ts`）：見 11.4。
4. **正式建置不讀 shader 編譯記錄**（`renderer.debug.checkShaderErrors = false`，只在 `import.meta.env.PROD`）。
5. **手機跟不上時拿掉 MSAA**（`resolution.ts` 的 `starved`、`post.ts` 的 `shed`）：動態解析度已經在最低（該畫質的 60%）還連續 3 秒低於 50 fps 才做，這場比賽不再恢復；跟得上的機器永遠走不到。這台電腦量不到（一直跟得上），只有單元測試。
6. **chunk**：見 11.6。

評估過、沒做的：遠處地標 LOD（觀音山中畫質 213k 和河濱 210k 差不多，地標不是成本）；障礙物與高台 instancing（`obstacleArt` 本來就是 InstancedMesh，防波堤屋頂 draw calls 和其他圖同級）；車身貼圖共用與 mipmap（#145 起就是一個畫質一張、有 mipmap）；等待室不可見時停（本來就停：`document.hidden`、卡片不在畫面上、手機畫完就停）；後處理按裝置關 bloom（高畫質會變樣，改用上面第 5 點只拿掉最貴的 MSAA）。

### 11.4 記憶體：連續比賽留下舊的 renderer

`--scene soak`（電腦 1280×720、中畫質、河濱一圈、7 台電腦車，每場結果畫面量）：

| 第 N 場後 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| JS heap 前（MB） | 14.9 | 15.6 | 16.1 | 16.5 | 16.8 | – | – | – |
| JS heap 中間（只改了 chunk 與畫面，MB） | 14.9 | 15.6 | 16.0 | 16.5 | 16.9 | 17.2 | 17.3 | 17.6 |
| JS heap 後（MB） | 14.7 | 15.5 | 16.0 | 16.4 | 16.5 | 16.9 | 17.1 | 17.5 |
| DOM 節點 前／後 | 262／312 | 265／267 | 267／269 | 270／270 | 272／271 | –／272 | –／273 | –／274 |
| GPU（每場結束） | 0 MB | 0 MB | 0 MB | 0 MB | 0 MB | 0 MB | 0 MB | 0 MB |

heap snapshot 的差（第 1 場到第 4 場）：+2 875 個 native 物件（約 390 kB）、每場多 6 組 three.js `WebGLState` 的 closure（`setMask`、`setLocked`、`setClear`、`reset` × 顏色／深度／模板 × 每場兩個 renderer：比賽與頒獎台）。從 GC root 找下去：three.js r186 的 `DFGLUTData.js` 有一張模組層級的查表貼圖（標準材質的鏡面光照用，`getDFGLUT()`，沒匯出），每個畫過標準材質的 renderer 都在它的 `_listeners.dispose` 掛一個 `onTextureDispose`，那個 closure 抓著整個 renderer 的 state。我們的車身細節貼圖（`bodyDetail.ts`，整頁共用）是同一種情形。renderer 本身 `dispose()` 加 `forceContextLoss()`，GPU 那邊都放掉了，JS 這邊卻永遠留著。

修法：比賽、頒獎台、車庫預覽、等待室的 renderer 在 `dispose` 開頭呼叫 `releaseSharedTextures(renderer, scene)`：從畫過的材質的 uniforms 找到那張查表（`dfgLUT`，找到一次就記住），連同車身細節一起 `dispose()`。three.js 的 `dispose()` 只釋放各 renderer 的 GPU 副本並移除監聽，貼圖本身照用，還在畫的 renderer 下一幀重新上傳（16×16 與 256／512 px，一次）。修完 heap snapshot 裡的 `setMask` closure 從 22 個降到 0（只剩函式名稱字串），DOM 節點每場 +2.3 → +1。

**JS heap 還是每場 +0.4 MB**：再拍一次 snapshot 照種類分（第 1 場到第 5 場）：V8 編譯過的程式碼（`code`）+1.1 MB、Blink 的樣式與字型快取（`ComputedStyle`、`FontCache`）幾十 kB、陣列 +72 kB。程式碼是 JIT 隨著跑過的路徑越來越多而編譯的，會趨平；不是我們留住的物件。8 場（約 6 分鐘）後 17.5 MB，手機上不構成問題；之後若要再追，從 `code` 以外的部分看。

監聽器（`JSEventListeners`）8 場都是 190，沒有漏移除的監聽。

### 11.5 前後數字

（7 台電腦車、困難、道具賽、熱身 5 秒後數 8 秒；fps 不鎖幀。高畫質的漁港、觀音山、碼頭、河濱是加上「依遠近切格」之後另外量的一輪。）

#### 手機橫向 844×390@3，14 張賽道

| 畫面 | 賽道 | 畫質 | fps 前 → 後 | draw calls 前 → 後 | 三角形 前 → 後 | GPU MB 前 → 後 | JS ms/幀 前 → 後 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 844x390@3 | riverside | low | 166 → 206 | 208 → 205 | 135k → 135k | 19.6 → 19.9 | 3.78 → 3.11 |
| 844x390@3 | harbour | low | 156 → 165 | 279 → 291 | 156k → 157k | 20.5 → 20.4 | 4.16 → 3.95 |
| 844x390@3 | tamkang | low | 164 → 193 | 262 → 269 | 208k → 209k | 24.4 → 24.8 | 3.95 → 3.43 |
| 844x390@3 | oldstreet | low | 124 → 143 | 289 → 292 | 137k → 137k | 19.8 → 19.9 | 5.38 → 4.73 |
| 844x390@3 | guanyin | low | 171 → 207 | 217 → 202 | 142k → 140k | 20.3 → 20.3 | 3.62 → 3.03 |
| 844x390@3 | mangrove | low | 183 → 223 | 225 → 211 | 146k → 142k | 21.5 → 18.7 | 3.43 → 2.78 |
| 844x390@3 | fort | low | 160 → 191 | 228 → 237 | 141k → 142k | 19.6 → 20.2 | 3.89 → 3.32 |
| 844x390@3 | danhai | low | 136 → 155 | 232 → 232 | 156k → 153k | 23 → 20.4 | 4.65 → 4.1 |
| 844x390@3 | datun | low | 169 → 200 | 232 → 232 | 179k → 180k | 20.8 → 21.8 | 3.68 → 3.15 |
| 844x390@3 | wharf | low | 134 → 151 | 209 → 227 | 157k → 160k | 23.6 → 24.3 | 4.67 → 4.19 |
| 844x390@3 | lanes | low | 177 → 199 | 221 → 222 | 161k → 162k | 22.8 → 23.5 | 3.56 → 3.18 |
| 844x390@3 | works | low | 124 → 152 | 226 → 224 | 175k → 173k | 25.3 → 23.8 | 5.05 → 4.24 |
| 844x390@3 | zhuwei | low | 153 → 168 | 205 → 206 | 128k → 126k | 19.2 → 18.9 | 4.05 → 3.79 |
| 844x390@3 | breakwater | low | 150 → 171 | 218 → 227 | 164k → 163k | 20 → 19.2 | 4.22 → 3.77 |
| 844x390@3 | riverside | medium | 90 → 110 | 269 → 243 | 210k → 208k | 76.5 → 76.8 | 7.27 → 5.97 |
| 844x390@3 | harbour | medium | 80 → 93 | 351 → 358 | 278k → 278k | 78.3 → 77.7 | 8.68 → 7.8 |
| 844x390@3 | tamkang | medium | 83 → 97 | 333 → 329 | 323k → 323k | 81.8 → 82.2 | 8.16 → 6.99 |
| 844x390@3 | oldstreet | medium | 72 → 85 | 359 → 360 | 226k → 227k | 78.1 → 78.3 | 9.38 → 7.99 |
| 844x390@3 | guanyin | medium | 98 → 100 | 286 → 283 | 213k → 213k | 76.8 → 77.7 | 6.76 → 6.58 |
| 844x390@3 | mangrove | medium | 102 → 98 | 281 → 276 | 274k → 273k | 76.1 → 75.5 | 6.48 → 6.64 |
| 844x390@3 | fort | medium | 95 → 89 | 294 → 278 | 219k → 217k | 77.7 → 77 | 7.32 → 7.49 |
| 844x390@3 | danhai | medium | 76 → 82 | 322 → 302 | 236k → 234k | 77.8 → 79 | 8.55 → 7.82 |
| 844x390@3 | datun | medium | 89 → 102 | 299 → 293 | 284k → 284k | 78.3 → 78.1 | 7.35 → 6.44 |
| 844x390@3 | wharf | medium | 80 → 88 | 274 → 291 | 248k → 251k | 79.8 → 82.3 | 7.9 → 7.28 |
| 844x390@3 | lanes | medium | 101 → 102 | 285 → 288 | 251k → 254k | 78.5 → 80.6 | 6.47 → 6.41 |
| 844x390@3 | works | medium | 87 → 90 | 296 → 297 | 267k → 268k | 80.5 → 81.5 | 7.54 → 7.22 |
| 844x390@3 | zhuwei | medium | 59 → 114 | 252 → 268 | 185k → 187k | 59.3 → 73.4 | 10.58 → 5.65 |
| 844x390@3 | breakwater | medium | 82 → 112 | 296 → 305 | 245k → 247k | 73.8 → 73.9 | 7.85 → 5.89 |
| 844x390@3 | riverside | high | 53 → 57 | 289 → 311 | 274k → 230k | 118.1 → 100.2 | 13.78 → 13.32 |
| 844x390@3 | harbour | high | 59 → 65 | 348 → 350 | 403k → 319k | 120.3 → 118.6 | 12.29 → 12.2 |
| 844x390@3 | tamkang | high | 57 → 65 | 377 → 345 | 355k → 352k | 145.9 → 146.1 | 13 → 12.14 |
| 844x390@3 | oldstreet | high | 53 → 55 | 382 → 356 | 261k → 261k | 100.8 → 142.3 | 12.78 → 13.34 |
| 844x390@3 | guanyin | high | 64 → 55 | 270 → 303 | 316k → 232k | 138.9 → 138.8 | 11.15 → 13.97 |
| 844x390@3 | mangrove | high | 51 → 49 | 287 → 302 | 305k → 305k | 136.4 → 95.1 | 15.37 → 15.27 |
| 844x390@3 | fort | high | 42 → 54 | 339 → 277 | 236k → 230k | 138.7 → 137.3 | 19.18 → 15 |
| 844x390@3 | danhai | high | 45 → 52 | 360 → 349 | 254k → 253k | 139.8 → 116.3 | 16.28 → 14.26 |
| 844x390@3 | datun | high | 45 → 49 | 322 → 325 | 302k → 302k | 116.1 → 139.8 | 17.43 → 16.05 |
| 844x390@3 | wharf | high | 51 → 58 | 308 → 299 | 292k → 270k | 99.3 → 119 | 13.77 → 11.92 |
| 844x390@3 | lanes | high | 54 → 65 | 298 → 285 | 275k → 272k | 117 → 139.4 | 13.87 → 11.62 |
| 844x390@3 | works | high | 44 → 53 | 318 → 313 | 285k → 285k | 89 → 118.1 | 16.03 → 13.33 |
| 844x390@3 | zhuwei | high | 72 → 57 | 262 → 264 | 199k → 201k | 113.1 → 137.3 | 8.69 → 12.14 |
| 844x390@3 | breakwater | high | 54 → 69 | 285 → 330 | 259k → 265k | 96.1 → 137.8 | 12.83 → 10.13 |
| **平均** | 844x390@3 low × 14 | | 155 → 180 | 232 → 234 | 156k → 156k | 21 → 21 | 4.1 → 3.6 |
| **平均** | 844x390@3 medium × 14 | | 85 → 97 | 300 → 298 | 247k → 248k | 77 → 78 | 7.9 → 6.9 |
| **平均** | 844x390@3 high × 14 | | 53 → 57 | 318 → 315 | 287k → 270k | 119 → 128 | 14.0 → 13.2 |

#### 小手機 667×375@2 與桌機 1280×720，三張賽道

| 畫面 | 賽道 | 畫質 | fps 前 → 後 | draw calls 前 → 後 | 三角形 前 → 後 | GPU MB 前 → 後 | JS ms/幀 前 → 後 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 667x375@2 | riverside | low | 184 → 288 | 196 → 182 | 133k → 132k | 19.5 → 20 | 3.38 → 2.16 |
| 667x375@2 | zhuwei | low | 150 → 206 | 193 → 189 | 125k → 125k | 19 → 18.8 | 4.17 → 3.09 |
| 667x375@2 | breakwater | low | 163 → 189 | 208 → 222 | 163k → 165k | 20 → 20 | 3.93 → 3.46 |
| 667x375@2 | riverside | medium | 121 → 121 | 254 → 248 | 209k → 209k | 66 → 65.6 | 5.51 → 5.48 |
| 667x375@2 | zhuwei | medium | 100 → 106 | 246 → 250 | 184k → 184k | 61.3 → 61.3 | 6.34 → 6.09 |
| 667x375@2 | breakwater | medium | 94 → 101 | 290 → 299 | 244k → 246k | 61.9 → 62.4 | 6.92 → 6.58 |
| 667x375@2 | riverside | high | 72 → 75 | 253 → 266 | 272k → 225k | 103.8 → 120.1 | 9.3 → 9.28 |
| 667x375@2 | zhuwei | high | 73 → 73 | 268 → 267 | 199k → 201k | 116.4 → 116.5 | 8.8 → 8.73 |
| 667x375@2 | breakwater | high | 76 → 77 | 306 → 279 | 261k → 259k | 98.8 → 98.7 | 8.47 → 8.3 |
| 1280x720@1 | riverside | low | 186 → 196 | 190 → 197 | 132k → 134k | 18.9 → 19.8 | 3.4 → 3.22 |
| 1280x720@1 | zhuwei | low | 157 → 165 | 201 → 199 | 126k → 126k | 19.3 → 19 | 4.04 → 3.87 |
| 1280x720@1 | breakwater | low | 151 → 159 | 228 → 218 | 163k → 164k | 19.2 → 19.8 | 4.24 → 4.08 |
| 1280x720@1 | riverside | medium | 99 → 93 | 248 → 241 | 209k → 207k | 89.1 → 71.6 | 6.65 → 6.97 |
| 1280x720@1 | zhuwei | medium | 88 → 90 | 250 → 253 | 186k → 185k | 85.8 → 85.2 | 7.26 → 7.02 |
| 1280x720@1 | breakwater | medium | 79 → 88 | 288 → 280 | 245k → 246k | 85.9 → 85.7 | 8.21 → 7.44 |
| 1280x720@1 | riverside | high | 82 → 84 | 277 → 272 | 274k → 225k | 116.9 → 115.4 | 8.47 → 8.4 |
| 1280x720@1 | zhuwei | high | 80 → 82 | 255 → 255 | 198k → 199k | 111.2 → 111.5 | 8.01 → 7.95 |
| 1280x720@1 | breakwater | high | 74 → 81 | 285 → 288 | 260k → 260k | 111.8 → 95 | 8.73 → 7.96 |
| **平均** | 667x375@2 low × 3 | | 166 → 228 | 199 → 198 | 140k → 141k | 20 → 20 | 3.8 → 2.9 |
| **平均** | 667x375@2 medium × 3 | | 105 → 109 | 263 → 266 | 212k → 213k | 63 → 63 | 6.3 → 6.0 |
| **平均** | 667x375@2 high × 3 | | 74 → 75 | 276 → 271 | 244k → 228k | 106 → 112 | 8.9 → 8.8 |
| **平均** | 1280x720@1 low × 3 | | 165 → 173 | 206 → 205 | 140k → 141k | 19 → 20 | 3.9 → 3.7 |
| **平均** | 1280x720@1 medium × 3 | | 89 → 90 | 262 → 258 | 213k → 213k | 87 → 81 | 7.4 → 7.1 |
| **平均** | 1280x720@1 high × 3 | | 79 → 82 | 272 → 272 | 244k → 228k | 113 → 107 | 8.4 → 8.1 |

#### 暫停、頒獎台、等待室

| 畫面 | 場景 | 畫質 | 前：fps／每幀 draw calls／每幀 JS ms | 後 |
| --- | --- | --- | --- | --- |
| 844x390@3 | 河濱比賽中 | 中 | 112／268／6.6 | 129／255／5.7 |
| 844x390@3 | 河濱**暫停中** | 中 | 95／**310**／**7.9** | 773／**0**／**0.4** |
| 844x390@3 | 河濱比賽中 | 高 | 60／261／13.6 | 82／246／9.8 |
| 844x390@3 | 河濱**暫停中** | 高 | 61／**292**／**13.1** | 575／**0**／**0.7** |
| 844x390@3 | 頒獎台 | 中／高 | 345／106／2.1、382／112／2.1 | 332／113／2.6、381／107／2.2（沒改） |
| 844x390@3 | 等待室 8 位車手 | 中／高 | 0 draw call（畫完就停）、GPU 6.7／8.3 MB | 同（沒改） |
| 1280x720@1 | 等待室 8 位車手 | 中／高 | 每幀 16／15、JS 0.2 ms、GPU 6.8／8.0 MB | 14／15、0.2 ms（沒改） |

暫停中「fps」變高是因為頁面的 `requestAnimationFrame` 還在跑但什麼都不畫；手機上這等於 GPU 休息、電池省下來。

### 11.6 chunk

`npm run build && npm run budget -- --chunks`（gzip，zh-TW）：

| | 前（`1aaf07e`） | 後 |
| --- | --- | --- |
| **從選單進一場比賽要等的**（新的一列，上限 480：`/kart` 頁面＋引擎＋最重的賽道專屬場景＋賽道零件＋所有車系，不含主站） | **383.9 kB** | **368.6 kB** |
| 單機 `/kart` 首屏（選單，含主站） | 251.4 kB | 235.1 kB |
| 比賽引擎 `spikeLoop` 與它靜態帶的（不含主站） | 293.2 kB | 286.1 kB |
| 　其中 `Scene` chunk | 30.9 kB | 25.9 kB |
| 　其中 `SpikePage` chunk | 12.2 kB | 7.1 kB |
| 河濱（最常跑、沒有零件）進比賽要下載的卡丁車 chunk（不含主站） | 369.7 kB | 347.6 kB |
| 卡丁車全部 chunk 合計（上限 600） | 567.8 kB | 573.8 kB |
| 房間的卡丁車首屏 `KartScreen`（上限 150） | 137.0 kB | 137.0 kB（−16 B） |

- **拆了什麼**：賽道零件（岔路、高台、立體交叉、會動的障礙物、夜燈）合成一個 chunk `trackParts`（6.6 kB），只有用到的賽道才載；選單面板（車庫、對戰電腦、大獎賽、調校、操作設定、設定、觸控設定）合成一個 chunk `menuPanels`（7.5 kB），第一次打開才載；測試用的 `?autopilot=<driver>` 要的電腦車大腦用到才載。頒獎台、駕訓班、挑戰、編輯器、各賽道專屬場景、車系、配樂本來就是 lazy（#128、#134、#152）；海的 shader（`seaWater` 2 kB）河濱也要，留在引擎。
- **「主 chunk 536 → 480」怎麼對應**：交辦時說的 536 kB 是預算表的「卡丁車全部 chunk 合計」那一列（現在 567.8）。那一列把每個 lazy chunk 都加起來（編輯器、駕訓班、挑戰都算），**拆 lazy chunk 不會讓它變小，只會因為每個 chunk 各自壓縮而變大**（這次 +6.0 kB；先拆成 12 個小 chunk 時是 +13.5，合成兩個才降到 +6.0）。玩家真的要等的是「從選單進一場比賽」那些，所以預算多一列只算這個、上限 480：從 383.9 降到 368.6，離上限 111 kB。合計那一列 600 照舊（剩 26 kB），要不要改成只報不擋，列在 NEXT 給擁有者決定。
- **房間首屏沒有變大**（−16 B）：`KartScreen` 預先下載比賽 chunk 的清單（Vite 的 preload 名單）多了幾個共用 chunk 的檔名（`course`、`meta`、`skill`、`trackCues`：打包器因為匯入的組合變了而把它們從大塊裡分出來），和其他地方省下的抵銷。
