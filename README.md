# TKU Arcade

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/lockup-dark.svg" />
  <img src="docs/brand/lockup-light.svg" alt="TKU Arcade · 淡江遊樂場" height="64" />
</picture>

A browser game lobby for friends of the Tamkang University Bridge Club: open one link, pick a nickname, choose a game, play together. Non-commercial, friends only. The UI defaults to English and switches to Traditional Chinese automatically when the browser prefers it (a manual toggle is always available).

**Status:** live for friends. Promotion is playable; Silent Table is built and waiting for its IP sign-off; a kart physics spike runs at `/kart/spike`. The current position is tracked in [`docs/NEXT.md`](docs/NEXT.md), the batch order in [`docs/ROADMAP.md`](docs/ROADMAP.md).

> Design docs are written in Traditional Chinese (the owner's working language). This README, all code, comments, commit messages and PR titles are in English.

## Games

| Game | How it plays | Milestone |
| --- | --- | --- |
| Promotion | *Sheng Guan Tu*, a traditional Chinese dice-and-board game (public domain) | M0 |
| Silent Table | Cooperative poker without talking: rank chips are the only hints | M1 |
| Spectrum (working title) | Everyone but the guesser gets a secret 1–10 and answers a two-ended topic; the guesser picks the highest and lowest | M1 |
| Bluff Reader (working title) | One honest reader, everyone else bluffs, the judge picks | M1 |
| Odd Word Out (working title) | Most players get one word, a few get a similar one; describe yours on your voice call and spot the odd ones out | Off-roadmap |
| Lantern Lane (working title) | Real-time co-op: light numbered lanterns 1–100 in rising order without saying a word | Off-roadmap |
| Clubroom Tiles (working title) | Number-tile rummy for 2–4: lay runs and groups, rework the whole table, empty your rack first | Off-roadmap |
| Kite Day (working title) | Co-op card game: fly five colours of kites in order, seeing every hand but your own; notes are the only way to talk about cards | Off-roadmap |
| Tamsui Traders (working title) | Engine building on the old Tamsui harbour: take goods, buy shops that discount the next, win over patrons; 2–4 players | Off-roadmap |
| Secret Scroll (working title) | A sixteen-card deduction game in a martial-arts world: hold one card, draw one, play one | Off-roadmap |
| Wasabi Dumplings (working title) | Hide a wasabi dumpling among plain ones, bid how many you can eat, then eat | Off-roadmap |
| Misery Line (working title) | Every card is a disaster with a hidden misery index from 1 to 100; slot it into your own line, and steal the ones others misplace | Off-roadmap |
| Kart (working title) | Arcade kart racing: drift, fill the gauge, boost | M2–M3 |

Game mechanics are not protected by copyright; names, art, characters, tracks, music and prompt decks are. Everything of the second kind here is original or CC0/CC BY licensed; asset files will be registered in `docs/ASSETS.md` once the first one lands (none yet). Games that borrow a modern game's mechanics name it only on their own rules page, in one descriptive sentence. The reasoning is in [`docs/PRD/01-legal-ip-analysis.md`](docs/PRD/01-legal-ip-analysis.md).

## Milestones

| | Scope | Done when |
| --- | --- | --- |
| **M0** | Lobby, nicknames, rooms, game-module framework, reconnection, Promotion, chat, EN/zh-TW | Four friends finish a game on their own devices |
| **M1** | Three party games, prompt decks (300+ topics for Spectrum, 100+ for Bluff Reader), rules pages, optional club login, records | One club meetup plays all three |
| **M2** | Single-player kart: three.js scene, track format, arcade drift physics, time trial, ghost, gamepad | Owner and two friends sign off on the feel |
| **M3** | Multiplayer kart: binary state sync, interpolation, item race with server-adjudicated hits, 2–3 tracks, characters and karts | Six players finish an item race with nobody dropping |
| **M4** | Friends, achievements, leaderboards, seasons, next-game vote, track editor, cost dashboard | Monthly cloud cost stays at zero |

## Architecture (planned)

- **Client**: React 19, TypeScript (strict), styled-components, Vite. Every UI string goes through a 100-line `t()` with `en` as the source language and `zh-TW` as the translation; CI fails on missing keys.
- **Server**: a single Cloudflare Worker serving static assets, with Durable Objects (`LobbyDO`, one `RoomDO` per room), D1 (prompt decks, records) and R2 (3D assets, backups).
- **Game framework**: each board game is a pure-function `GameModule` (`init / reduce / view / legalActions / isOver / result`). The `RoomDO` runs `reduce`, slices hidden information per seat through `view`, and pushes diffs over WebSocket. Replays are the action log plus the RNG seed.
- **Kart**: three.js with a fixed 60 Hz simulation loop outside React. Each client simulates its own kart; the `RoomDO` relays 20 Hz binary state, interpolates nothing itself, and adjudicates laps, placings and item hits. No server-authoritative physics by design (friends-only, free tier).

Full detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/DESIGN.md`](docs/DESIGN.md).

## Documentation

```
docs/PRD/00-prd.md               product requirements: vision, F1–F39, acceptance criteria, risks
docs/PRD/01-legal-ip-analysis.md copyright and trademark analysis, asset licensing policy
docs/PRD/e1 … e12                twelve epics: 124 tasks, 70 acceptance criteria
docs/ROADMAP.md                  44 batches in phases A–P; one batch = one PR
docs/NEXT.md                     current position and the per-batch working rules
docs/ARCHITECTURE.md             technical design
docs/DESIGN.md                   design tokens, components, i18n rules, glossary
docs/PLANNING-METHOD.md          why three layers of planning docs and not more
```

## Related projects

Same stack and the same planning method as [TKU BridgeTable](https://github.com/GeneCLee6/TKU-BridgeTable) (online bridge table, WebSocket rooms on Durable Objects), [TKU BridgeHall](https://github.com/GeneCLee6/TKU-BridgeHall) (the club's bidding-system handbook) and [LongTalk](https://github.com/GeneCLee6/LongTalk) (a meeting room with no time limit).

## Development (after batch A1)

```bash
npm run dev          # http://localhost:5175
npm run lint && npm run typecheck && npm test && npm run build
npm run check-i18n   # en / zh-TW key parity
npm run check-assets # every asset registered in docs/ASSETS.md
npm run play -- <game>   # random playthrough in the terminal (smoke test)
```

## License

Source code: MIT (to be added with the first code batch). Game names, artwork, characters, tracks, audio and prompt decks are original works of the project and are not covered by the code license.
