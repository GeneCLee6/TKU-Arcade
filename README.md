# TKU Arcade · 淡江遊樂場

A game lobby for friends of the TKU Bridge Club: one link, pick a nickname, choose a game, play together. Non-commercial, friends only. English by default, Traditional Chinese available.

淡江橋藝社朋友圈的遊戲大廳：一個連結、取個暱稱、選一款遊戲、一起玩。非營利、只給朋友。介面預設英文，可切繁體中文。

**Status: planning complete (2026-11-03), no code yet.** Start at [`docs/NEXT.md`](docs/NEXT.md).

## Games

| Game | Inspired by (mechanics only) | Milestone |
| --- | --- | --- |
| Promotion（升官圖） | Traditional Chinese board game (public domain) | M0 |
| The Heist (working title) | *The Gang* — cooperative poker | M1 |
| Spectrum (working title) | *Wavelength* — spectrum guessing | M1 |
| Bluff Reader (working title) | *9upper* — honest reader vs. bluffers | M1 |
| Kart (working title) | Classic 2000s drift-boost kart racing | M2–M3 |

All names, art, characters, tracks, music and prompt decks are original. See [`docs/PRD/01-legal-ip-analysis.md`](docs/PRD/01-legal-ip-analysis.md).

## Docs

- [`docs/PRD/00-prd.md`](docs/PRD/00-prd.md) — product requirements
- [`docs/PRD/`](docs/PRD/README.md) — 12 epics with acceptance criteria and tasks
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — batch order (one batch = one PR)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/DESIGN.md`](docs/DESIGN.md)

## Stack (planned)

React 19 + TypeScript + styled-components + Vite · Cloudflare Workers + Durable Objects + D1 + R2 · three.js for the kart game. Same stack as [TKU BridgeTable](https://github.com/GeneCLee6/TKU-BridgeTable) and [LongTalk](https://github.com/GeneCLee6/LongTalk).
