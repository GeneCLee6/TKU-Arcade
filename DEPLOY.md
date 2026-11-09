# DEPLOY — 部署

## 1. 架構

TKU Arcade 是**一個 Cloudflare Worker**（`tku-arcade`）：同一個 Worker 回答 `/api/*`、`/ws/*`，承載 Durable Object（每房一個 `RoomDO`、全站一個 `LobbyDO`），其餘路徑交給靜態資產（React app，`dist/client`，SPA fallback）。D1 `DB` 放題目、結果等資料；R2 `ASSETS_BUCKET` 放模型、貼圖、音檔，`BACKUPS` 放 D1 每日備份（§10）。Worker 另有一個 cron（`scheduled`），只有正式站有。設定都在 `wrangler.jsonc`。

一個 Worker 一次部署：前端與 API 永遠是同一個 commit。建置時 `APP_VERSION`（commit SHA）寫進首頁 `<meta name="app-version">`，部署時也以 `--var APP_VERSION:<sha>` 給 Worker；smoke test 就是查這個。

## 2. 環境

| 環境 | Worker | 網址 | D1 | Durable Object 資料 |
| --- | --- | --- | --- | --- |
| 正式 | `tku-arcade` | <https://tku-arcade.genelee-pro.workers.dev> | `tku-arcade` | 正式站自己的 |
| PR 預覽 | `tku-arcade-pr-<PR 號>` | `https://tku-arcade-pr-<號>.genelee-pro.workers.dev` | `tku-arcade-staging`（所有預覽共用） | 每個預覽自己的，PR 關閉時隨 Worker 刪除 |

PR 預覽以 `CLOUDFLARE_ENV=preview` 建置（Vite 的 Cloudflare 外掛把 `env.preview` 的設定烤進 `dist/`），再用 `wrangler deploy --name tku-arcade-pr-<號>` 部署成**獨立的 Worker**。`env.preview` 本身的名字 `tku-arcade-preview` 只在手動部署 staging 時用到。

**為什麼每個 PR 一個 Worker，而不是 `wrangler versions upload`**（`ARCHITECTURE.md` §7 原本的寫法）：

- 正式 Worker 的 version 和正式站共用同一個 Durable Object namespace 與 D1，預覽會直接動到正式站的房間與資料。
- Durable Object 的 migration 不能經由 `versions upload` 套用，只能 `wrangler deploy`；新增 DO class 的 PR 根本做不出預覽。
- Cloudflare 不給實作 Durable Object 的 Worker 預覽網址。

LongTalk 一開始也走 `versions upload`，因為以上原因改成每個 PR 一個 Worker，已經跑過。

## 3. 一次性設定

### 3.1 Cloudflare API token

儀表板 → My Profile → API Tokens → Create Token → 範本「Edit Cloudflare Workers」，再**加上 D1 Edit**。帳號限定為自己的帳號。需要的權限：

| 範圍 | 權限 | 為什麼 |
| --- | --- | --- |
| Account | Workers Scripts：Edit | 部署、刪除預覽 Worker、`wrangler secret put` |
| Account | D1：Edit | `wrangler d1 migrations apply --remote` |
| Account | Workers R2 Storage：Read（範本給 Edit 也可以） | 部署時確認 R2 綁定的 bucket |
| Account | Account Settings：Read | wrangler 讀取帳號與 workers.dev 子網域 |
| User | User Details：Read、Memberships：Read | wrangler 確認身分（範本內建） |

範本另外附的 Workers KV、Workers Routes、Workers Tail 用不到，留著無妨。

### 3.2 GitHub secrets

```sh
gh secret set CLOUDFLARE_API_TOKEN      # 貼上 3.1 的 token
gh secret set CLOUDFLARE_ACCOUNT_ID     # 儀表板右側欄 Account ID，或 npx wrangler whoami
gh secret list                          # 確認兩個都在
```

**沒設定 secret 時，部署與預覽 workflow 會跳過（notice，不是失敗）**，CI 照跑。

### 3.3 GitHub 分支保護

`main` 設為受保護分支：要求 PR、要求 `CI / verify` 通過、禁止 force-push（`CLAUDE.md` 規則 6、7）。

### 3.4 已建好的資源（不用再建）

| 種類 | 名稱 | id | 用途 |
| --- | --- | --- | --- |
| D1 | `tku-arcade` | `b1922db6-2ced-45f9-994f-ab588cfb44b6` | 正式站 |
| D1 | `tku-arcade-staging` | `d880eccb-2826-4bb5-9ed0-38e4e1654674` | 所有 PR 預覽共用 |
| R2 | `tku-arcade-assets` | — | 模型、貼圖、音檔（正式與預覽都讀這個；內容雜湊檔名，e12-t08） |
| R2 | `tku-arcade-backups` | — | D1 每日備份，只有正式站綁定（§10） |

**正式站的 D1 id 只能出現在 `wrangler.jsonc` 頂層**，不要放進 `env.preview`。

## 4. 日常流程

1. 開分支、開 PR（標題英文、照 ROADMAP 批次號）。
2. `ci.yml`：`npm ci` → lint → typecheck → test → build，全綠才可合併。
3. `preview.yml`：套用 staging 的 D1 遷移 → 建置 → 部署 `tku-arcade-pr-<號>` → smoke test → 在 PR 留言預覽網址（同一則留言隨每次 push 更新）。
4. 在預覽站看過，`gh pr merge <號> --squash --delete-branch`。
5. `deploy.yml`（CI 在 `main` 綠了之後）：套用正式 D1 的遷移 → 建置 → `wrangler deploy` → smoke test 確認正式站正在提供這個 commit。**合併就是上線。**
6. PR 關閉（合併或放棄）時，`preview.yml` 的 `cleanup` 刪掉 `tku-arcade-pr-<號>` 與它的 Durable Object 資料。

| Workflow | 何時 | 做什麼 |
| --- | --- | --- |
| `ci.yml` | PR 到 `main`、push 到 `main` | lint、typecheck、test、build（之後依批次加上：A2 JS 預算、B1 `check-i18n`、K1 `check-assets`） |
| `preview.yml` | PR 開啟、更新、重開；關閉 | 部署並留言預覽網址；關閉時刪除 |
| `deploy.yml` | CI 在 `main` 成功後；或手動 Run workflow | 部署正式站 |

部署之間不會重疊：正式站一個 concurrency group（排隊、不中途取消），每個 PR 一個（新的 push 取代進行中的預覽部署）。

錯誤與日誌：Worker 開了 observability（`wrangler.jsonc`，預覽站也有），儀表板 → Workers → `tku-arcade` → Logs 可查。瀏覽器的錯誤由 `POST /api/errors` 寫成 `{"event":"client_error",...}`，備份寫成 `backup_done`，搜尋這些字即可；內容已去掉引號內文字、房號、token、email，也不記 IP（`shared/client-error.ts`）。

smoke test 檢查：首頁 `<meta name="app-version">` 是這個 commit（最多重試約一分鐘）、未知路徑回 200（SPA fallback）。

漏刪的預覽：在 repo 外的資料夾執行 `npx wrangler delete --name tku-arcade-pr-<號>`（避免讀到 `wrangler.jsonc`）。

## 5. 手動部署

通常不需要。要的話：

- 正式站：GitHub Actions → Deploy → Run workflow（部署 `main` 最新 commit），或本機：

  ```sh
  npx wrangler login
  npx wrangler d1 migrations apply DB --remote   # 有新遷移時
  npm run deploy                                  # build + wrangler deploy
  ```

- staging（`tku-arcade-preview`）：

  ```sh
  npx wrangler d1 migrations apply DB --remote --env preview
  CLOUDFLARE_ENV=preview npm run build && npx wrangler deploy
  ```

本機 secret 放 `.dev.vars`（不進 git）。

## 6. D1 遷移規則

- 現有：`0001_app_meta.sql`（骨架，只有一張 `app_meta`）；`prompts`、`results` 等表由用到的批次加。
- 遷移檔放 `migrations/`（`wrangler.jsonc` 的 `migrations_dir`），用 `npx wrangler d1 migrations create DB <名稱>` 產生，檔名帶流水號，**已合併的檔案不要改、不要刪**；要改就再加一個。
- workflow 在**建置之前**套用遷移（建置後 Vite 外掛會把 wrangler 導向 `dist/` 的設定，那份設定不接受 `--env`）；`migrations/` 沒有 `.sql` 時直接跳過。
- 遷移在新程式上線**之前**套用，所以每個遷移都要讓**舊程式照常運作**：只加表、加欄位（給預設值）、加索引；要刪欄位或改名，分兩次 PR（先讓程式不再用，下一次再刪）。
- staging 被所有預覽共用：某個 PR 的遷移套到 staging 後，即使 PR 沒合併也會留著。staging 的資料不重要，必要時可以清空重建；正式站不行。
- 查看狀態：`npx wrangler d1 migrations list DB --remote`（staging 加 `--env preview`）。

## 7. Durable Object migration 只增不改

- `wrangler.jsonc` 的 `migrations`（DO 的，不是 D1 的）**只能往後加**：已部署的 tag 不要改、不要刪。新增 DO class 就加一個新 tag。現有：`v1` `RoomDO`、`LobbyDO`（SQLite 版，免費方案只能用這種）；下一個是 `v2`。
- 刪除或改名 DO class 也要用新的 migration tag（`deleted_classes`／`renamed_classes`），而且**會刪資料**，先問擁有者。
- `env.preview` **不會繼承**頂層的綁定與 `vars`：新增 DO、D1、R2 綁定或 var 時，頂層與 `env.preview` 各寫一次；DO 的 `migrations` 只寫在頂層。

## 8. 回滾

```sh
npx wrangler deployments list            # 看最近的部署與 version id
npx wrangler rollback                    # 回到上一個 version
npx wrangler rollback <version-id> --message "rollback: <原因>"
```

- `rollback` 換回程式與靜態資產，**不會**撤銷 D1 遷移，也不會撤銷 DO migration；有新 DO migration 的部署可能無法回滾到它之前。所以第 6、7 節的「只增、舊程式要能跑」很重要。
- 回滾後 `main` 仍是壞的版本：盡快開 revert PR（`git revert <sha>`），合併後正式站會再部署一次，和 `main` 一致。

## 9. Secrets 清單

### GitHub Actions secrets（現在需要）

| 名稱 | 用途 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 部署、遷移、刪除預覽（§3.1） |
| `CLOUDFLARE_ACCOUNT_ID` | 指定 Cloudflare 帳號 |

### Worker secrets（之後的批次加入）

| 名稱 | 批次 | 用途 |
| --- | --- | --- |
| `AUTH_SHARED_SECRET` | F1 | 與淡江牌桌（Overtrick）共用的登入簽章金鑰，至少 32 字；步驟見 §11。牌桌的網址是 var `AUTH_BRIDGE_URL`（`wrangler.jsonc` 頂層），不是 secret |
| `ANTHROPIC_API_KEY` | H2 | 題目草稿 |
| `LONGTALK_URL` | 選用 | LongTalk 語音房的網址 |

只用 `wrangler secret put` 放在 Worker，**不進前端、不進 repo**：

```sh
npx wrangler secret put AUTH_SHARED_SECRET                          # 正式站（互動輸入值）
printf '%s' "$VALUE" | npx wrangler secret put ANTHROPIC_API_KEY    # 從 stdin 給值
npx wrangler secret put AUTH_SHARED_SECRET --name tku-arcade-pr-12  # 某個預覽
npx wrangler secret list
```

PR 預覽是每次新建的 Worker，不會自動有這些 secret；需要時由該批次在 `preview.yml` 加一步，從 GitHub secret（例如 `PREVIEW_AUTH_SHARED_SECRET`）`wrangler secret put --name "$WORKER"`，沒設定就 notice 跳過。

## 10. D1 備份與還原

**備份**：`wrangler.jsonc` 的 cron `0 19 * * *`（UTC，台北 03:00）觸發 `worker/index.ts` 的 `scheduled`，由 `worker/backup.ts` 透過 `DB` 綁定把整個資料庫匯出成 SQL、gzip 後寫到 R2 `tku-arcade-backups`，key 為 `d1/<日期>/tku-arcade-<時間>.sql.gz`。不需要任何新 secret。寫入成功後才刪除超過 30 天的備份。只有正式站有 `BACKUPS` 與 cron；預覽站 `triggers.crons` 是空的，就算被觸發也只記一行 `backup_skipped`。

限制：

- 分頁讀取、不是快照，備份途中的寫入可能在、也可能不在裡面（資料很少寫，又在清晨跑，可接受）。
- 匯出整份放在記憶體裡。資料庫大到幾十 MB 時要改成串流。
- 超過 2^53 的整數會失準（JavaScript 數字）；目前沒有這種欄位，新增時要注意。

**確認有在跑**：

儀表板 → R2 → `tku-arcade-backups` 看 `d1/` 底下有沒有當天的檔案（wrangler 沒有列 bucket 內容的指令），或 Workers → `tku-arcade` → Logs 搜尋 `backup_done`；失敗時該次 cron 顯示為 failed。

**還原**（先選 A，只有超過 A 的時間窗才用 B）：

A. **Time Travel**（D1 內建，精確到分鐘；免費方案保留 7 天）：

```sh
npx wrangler d1 time-travel info DB                                  # 看目前的 bookmark
npx wrangler d1 time-travel restore DB --timestamp=<ISO 8601 時間>    # 就地還原，會覆蓋現況
```

B. **從 R2 的備份還原到一個新的空資料庫**。備份裡有 `CREATE TABLE`，所以目標必須是空的；`d1_migrations` 也在裡面，還原後遷移紀錄是對的：

```sh
npx wrangler r2 object get tku-arcade-backups/d1/<日期>/<檔名>.sql.gz --remote --file backup.sql.gz
gunzip backup.sql.gz
npx wrangler d1 create tku-arcade-restored                          # 記下新的 database_id
npx wrangler d1 execute tku-arcade-restored --remote --file backup.sql
npx wrangler d1 execute tku-arcade-restored --remote --command "SELECT name FROM sqlite_master"   # 檢查
```

確認內容正確後，開 PR 把 `wrangler.jsonc` 頂層的 `database_name`、`database_id` 換成新的（§3.4 也要改），合併即生效；舊資料庫留著，確定沒問題再由擁有者刪除。

實測（2026-11-06，本機 `wrangler dev`，不是正式站）：`/cdn-cgi/handler/scheduled` 觸發 → 備份寫入本機 R2 → 取回、解壓 → `d1 execute --file` 進空的本機 D1 → 資料相同，且 `d1 migrations apply` 回報沒有待套用的遷移。本機觸發要用這條路徑，`/__scheduled` 會被靜態資產的 SPA fallback 接走：

```sh
npm run build
npx wrangler d1 migrations apply DB --local --config wrangler.jsonc
npx wrangler dev --config dist/tku_arcade/wrangler.json --test-scheduled --port 5176
curl 'http://localhost:5176/cdn-cgi/handler/scheduled?cron=0+19+*+*+*'
```

## 11. 選用登入：Overtrick 帳號（F1，`e1-t11`–`e1-t13`）

淡江橋藝社的朋友可以用牌桌（Overtrick）的帳號登入，名字就固定是帳號的名字。牌桌簽一個 5 分鐘的 token，本站驗簽後發自己的 session（`ARCHITECTURE.md` §6）。**兩邊的 Worker 共用一個 secret**：牌桌叫 `ARCADE_LOGIN_SECRET`，本站叫 `AUTH_SHARED_SECRET`，值一樣。

**沒設 secret 時什麼都不會發生**：大廳沒有登入連結，`GET /api/me` 回 `{"configured":false,"account":null}`，其他登入路由回 404 `not_configured`。本站的 var `AUTH_BRIDGE_URL`（`https://tku-bridge-table.genelee-pro.workers.dev`）已經寫在 `wrangler.jsonc` 頂層；預覽沒有。

### 11.1 打開（擁有者，一次）

前提：牌桌那邊的端點已經合併、上線（牌桌 repo 的 `e1-t37`，它的 DEPLOY.md §4.22）。順序：先牌桌、再本站；本站一設好，按鈕就會出現。

```sh
# 1. 在自己的終端機產生一個 256 bit 的值（不要貼進聊天、issue、PR）
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# 2. 牌桌正式站（在牌桌 repo 的資料夾裡跑，互動貼上同一個值）
npx wrangler secret put ARCADE_LOGIN_SECRET

# 3. 本站正式站（在這個 repo 的資料夾裡跑，貼上同一個值）
npx wrangler secret put AUTH_SHARED_SECRET
```

**檢查**：`curl -s https://tku-arcade.genelee-pro.workers.dev/api/me` 回 `"configured":true`；開首頁，大廳標題下有「Sign in with Overtrick／用 Overtrick 登入」；按下去 → 牌桌（沒登入會先要你登入）→ 回到原本那一頁，首頁顯示「你的暱稱：<帳號名稱>（Overtrick 帳號）」；進一間房，名字就是帳號的名字，不會問暱稱。Workers Logs 搜尋 `auth_signed_in`、`auth_refused`（`reason` 說是哪一關沒過），牌桌那邊搜尋 `arcadeToken`。

### 11.2 換金鑰

1. 產生新值（同上）。
2. 牌桌：`npx wrangler secret put ARCADE_LOGIN_SECRET`；本站：`npx wrangler secret put AUTH_SHARED_SECRET`，兩個指令接著跑。中間那一兩分鐘登入會失敗（`auth_refused`、`reason: signature`），再按一次就好。
3. **換金鑰會讓本站所有人登出**：session cookie 的簽章鑰匙是從這個 secret 衍生的。大家再按一次登入即可，房間、座位不受影響（座位靠的是 seat token，不是登入）。

懷疑 secret 外洩時就換；平常不用定期換。

### 11.3 關掉

`npx wrangler secret delete AUTH_SHARED_SECRET`（本站）：按鈕消失、已登入的人變回訪客（名字回到自己輸入的暱稱）。牌桌那邊要不要也刪 `ARCADE_LOGIN_SECRET`，看牌桌的文件。

### 11.4 在 PR 預覽測（不碰正式站與牌桌）

預覽 Worker `tku-arcade-pr-<號>` 是每次新建的，沒有這些設定。**只用隨機的測試值，不要用正式的 secret，也不要動牌桌**：

```sh
TEST_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")
printf '%s' "$TEST_SECRET" | npx wrangler secret put AUTH_SHARED_SECRET --name tku-arcade-pr-<號>
printf '%s' "https://tku-bridge-table.genelee-pro.workers.dev" | npx wrangler secret put AUTH_BRIDGE_URL --name tku-arcade-pr-<號>
```

（預覽的設定沒有 `AUTH_BRIDGE_URL` 這個 var，所以可以用同名的 secret 補上。）牌桌不會替預覽簽 token（它沒有這個測試值），所以自己簽：`GET /api/auth/start` 拿到 state cookie 與轉址裡的 `state`，用同一個測試值照牌桌的格式（`v1.<base64url JSON>.<HMAC-SHA256>`，claims 見 `ARCHITECTURE.md` §6）簽一個 `aud` 是預覽網址、`nonce` 是那個 `state` 的 token，開 `<預覽網址>/#overtrick_token=<token>`。預覽在 PR 關閉時整個刪掉，secret 一起消失。staging D1 的 `auth_token_uses` 是所有預覽共用的，只有隨機 id，不用清。

