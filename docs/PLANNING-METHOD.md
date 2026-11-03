# PLANNING-METHOD — 規劃文件要分幾層？

完整的論證在 LongTalk 的同名文件（`C:\dev\LongTalk\docs\PLANNING-METHOD.md`）；這裡只記這個專案採用的結論。

## 三層

```
00-prd.md（總 PRD）
   └─ e1 … e12（epic：功能 PRD ＋ 設計方向）
         └─ AC-<epic>.<n>（驗收條件：可勾選）
               └─ e<epic>-t<nn>（task：一個 PR，1–3 天）
```

加上三份索引：`PRD/README.md`（進度表）、`ROADMAP.md`（批次順序）、`NEXT.md`（現在的位置與工作方式）。

## 這個專案另開的獨立文件

| 文件 | 原因 | 狀態 |
| --- | --- | --- |
| `PRD/01-legal-ip-analysis.md` | 法律風險，錯了很貴；要給朋友看 | 已寫 |
| `IP-CHECKLIST.md` | 每款遊戲上線前的逐項檢查 | D2 寫 |
| `ASSETS.md` | 資產來源與授權登記 | K1 寫 |
| `KART-NETCODE.md` | 同步設計與實測數字（實質是 ADR） | L2 寫 |
| `KART-WORLD.md` | 世界觀、角色、車款、道具名稱 | N1 寫 |

不再多拆：每款桌遊一個 epic 就是它的功能 PRD；AC 的文字就是驗收規格。
