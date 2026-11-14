# docs/content — 遊戲題庫草稿

這裡放還沒上線的題庫草稿，**全部要擁有者逐題審過才會上線**。

## `traders-cards.csv`、`traders-patrons.csv`

滬尾商行（暫名 Tamsui Traders，規則見 [`../PRD/e22-tamsui-traders.md`](../PRD/e22-tamsui-traders.md)）的牌與貴客，全部為本專案自己設計，沒有參考原作卡表（`../PRD/01-legal-ip-analysis.md` §2.9）。

| 檔案 | 欄位 |
| --- | --- |
| `traders-cards.csv`（90 張） | `id`（`t1-01` 起，層數加編號）、`tier`（1–3）、`bonus`（這張牌給的折扣：`tea`、`camphor`、`indigo`、`sugar`、`pepper`）、`points`、五種貨各要幾個 |
| `traders-patrons.csv`（10 位） | `id`、`zh`、`en`（貴客名稱，畫面依語言顯示）、五種貨的牌各要幾張 |

- 欄位裡不能有半形逗號。改完跑 `node scripts/traders-cards.mjs` 重新產生 `shared/games/traders/bank.ts`，再跑 `npm run sim:traders` 看局長與先手優勢有沒有變。`tests/games/traders/bank.test.ts` 擋不同步，並檢查每種貨每層張數與總分相同、被要求的量差不多、價錢曲線、每張都買得到。
- **狀態：草稿，等擁有者看。**

## `odd-word-pairs.zh-TW.csv`

誰的詞不一樣（暫名 Odd Word Out，規則見 [`../PRD/e13-odd-word-out.md`](../PRD/e13-odd-word-out.md)）的詞組，267 組、14 類，全部為本專案自寫（一般 13 類寫了 327 組，逐組看過後刪掉太像、太遠、太冷門或重複的，留 229 組；擁有者 2026-11-14 加要求的「港劇港片」一類 38 組，給喜歡 TVB 港劇與周星馳電影的朋友：茶餐廳與港式小吃、劇種、角色類型、香港地方與交通、片場用語。不放演員名字、片名台詞與政治）。

| 欄位 | 意思 |
| --- | --- |
| `category` | 分類（食物飲料、校園、生活用品、地點、交通、職業、娛樂、運動、動物、節日習俗、科技網路、穿搭、日常、港劇港片），揭曉時顯示 |
| `first`、`second` | 一組相近的詞，**不分先後**：每回合隨機決定哪個是多數人的詞 |

好的詞組：兩個東西有很多共同點，描述其中一個聽起來也像另一個，但仔細聽抓得到差別（例如 `鹹酥雞,雞排`、`悠遊卡,一卡通`、`期中考,期末考`）。不要：實際上一樣的、差太遠的、冷門的、政治宗教性與冒犯的、真人姓名。同一個詞在整份題庫只出現一次（測試會擋）；欄位裡不能有半形逗號。

- **狀態：草稿。** 擁有者審核時直接改、刪這個檔案，然後跑 `node scripts/odd-word-bank.mjs` 重新產生 `shared/games/odd-word/bank.ts`（`tests/games/odd-word/bank.test.ts` 擋兩者不同步）。
- **英文還沒寫**；之後另寫，不是逐字翻譯。
- 不參考任何網路上或出版的題目清單；新增詞組也一樣（`../PRD/01-legal-ip-analysis.md` §4-3）。

## `spectrum-topics.zh-TW.csv`

光譜猜題（暫名 Spectrum，規則見 [`../PRD/e5-spectrum-guess.md`](../PRD/e5-spectrum-guess.md)）的題目，335 題，全部為本專案自寫。

| 欄位 | 意思 |
| --- | --- |
| `category` | 分類（食物、校園、橋牌與遊戲…），房主開房時可以選 |
| `topic` | 題目 |
| `low` | 數字 **1** 那一端 |
| `high` | 數字 **10** 那一端 |

例如 `食物,宵夜,最不想吃,最想吃`：拿到 1 的人要說一個最不想吃的宵夜，拿到 10 的人說最想吃的。

- **狀態：草稿。** 擁有者審核時可以直接改、刪這個檔案；刪掉的題目不會上線。
- **英文還沒寫。** 英文題目之後另外寫，不是逐字翻譯；在那之前只有繁中。
- **光譜那一批開工時**（`e5-t01`，ROADMAP 的 F3），審過的題目會轉成 D1 `prompts` 表的 seed 資料（`game='spectrum'`）；之後以 D1 為準，這個檔案只是來源紀錄。
- 不參考任何出版品的題目卡寫題；新增題目也一樣（`../PRD/01-legal-ip-analysis.md` §4-3）。
