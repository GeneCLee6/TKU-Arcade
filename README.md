# TKU Arcade

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/lockup-dark.svg" />
  <img src="docs/brand/lockup-light.svg" alt="TKU Arcade · 淡江遊樂場" height="64" />
</picture>

A browser game lobby for a university bridge club's circle of friends: open one link, pick a nickname, choose a game and play together on phones or laptops. Sixteen multiplayer board and party games plus a real-time 3D kart racer, all running on Cloudflare's edge with no game servers to manage. Non-commercial and friends only.

**Live:** https://tku-arcade.genelee-pro.workers.dev

| | |
| --- | --- |
| Games | 16 turn-based board and party games, 1 real-time 3D kart racer |
| Kart content | 12 original tracks, 20 vehicles (including 3 hover motorbikes), 14 items, 4 computer levels |
| Kart netcode under load | 6 players, 3-lap item race on a preview deployment: 17,482 frames judged by the server, 0 dropped; relay latency p50 / p95 / p99 = 35 / 47 / 70 ms; about 0.8 kB/s up and 4 kB/s down per player |
| Tests | 4,100+ Vitest unit and integration tests, 39 Playwright end-to-end specs, an automated playthrough of every board game, visual regression |
| Languages | English and Traditional Chinese, picked from the browser and switchable at any time |

## Features

**Lobby and rooms**
- Nickname entry or optional club sign-in, a public room list, four-digit room codes, QR invites and optional room passwords.
- Seats, ready checks, host controls (kick, hand over, end game), chat, emoji reactions and rematch.
- Reconnection puts a player back in the same seat of the same game; the host can skip, or play for, someone who has left.
- Computer players for Texas Hold'em, Promotion and Tamsui Traders at two levels, so one person can open a table. The server plays them, and they see only what a person in their seat would.
- Replays of finished games, rebuilt from the RNG seed and the action log.

**Board and party games (16):** Promotion (the traditional Chinese dice-and-board game, in a simple and a full edition), Texas Hold'em, Silent Table, Spectrum, Bluff Reader, Odd Word Out, Lantern Lane, Clubroom Tiles, Kite Day, Tamsui Traders, Secret Scroll, Wasabi Dumplings, Palace Bluff, Misery Line, Word Bridge and Clue Clash. Several names are working titles; every game has a rules page in both languages.

**3D kart racer**
- Race rooms for up to eight players: item races and pure races, solo or red-versus-blue team races, and computer opponents up to an expert level that drives racing lines and shortcuts.
- Arcade drift-and-boost handling tuned through the owner's play tests, solo time trials with ghosts, and a grand prix over several cups.
- A track editor with branching routes, shareable track codes and server-side validation.
- Spectating, race replays, touch controls, gamepads and three graphics tiers.
- An original soundtrack and ambience synthesised live with WebAudio (no audio files), night lighting and animated drivers.

## Architecture

- **Client:** React 19, TypeScript (strict), styled-components and Vite; three.js for the kart, with a fixed-step simulation loop outside React. Every UI string goes through `t()`, and CI fails on a missing translation. A game's rules, options and strings load only with its room, and a bundle budget in CI keeps the first load small.
- **Server:** one Cloudflare Worker serving the static assets, with Durable Objects (one `RoomDO` per room, a lobby object and a sharded rate limiter), D1 for accounts, results, feature flags and metrics, and R2 for backups.
- **Game framework:** each board game is a pure `GameModule` (`init / reduce / view / legalActions / isOver / result`, with optional timers and a computer-player policy). The `RoomDO` is the only place where game state changes: it checks every action, cuts hidden information per seat in `view`, and pushes JSON patches over hibernating WebSockets. A replay is the seed plus the action log, run through the same code.
- **Kart netcode:** each client simulates its own kart and sends compact binary frames; the `RoomDO` relays them and judges checkpoints, laps, finishing order and every item pickup and hit, so a modified client cannot award itself a lap or a hit. Clock sync, interpolation and prediction of other karts run on the client. Detail in [`docs/KART-NETCODE.md`](docs/KART-NETCODE.md).

Full design: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Testing and CI

- **Vitest** covers the rules engines, the room server (run without Cloudflare on a fake clock), the protocol, the kart physics and the React screens. A shared harness plays every game at random and checks at every step that no hidden card, role or word reaches a viewer who should not see it, and that a replay reproduces the game.
- **Playwright** runs end-to-end tests through the real Worker and Durable Objects; a **sweep** plays every board game from the waiting room to the result on desktop and phone sizes with accessibility (axe) and layout checks; **visual regression** compares screenshots.
- **CI** on every pull request: lint, strict type check, i18n parity, asset registry, bundle budget, unit tests, the visual and sweep jobs, and a preview deployment per PR. Merging to `main` deploys to production.

## Security

- A strict Content-Security-Policy and security headers on every response.
- Rate limits shared across every instance (room creation, WebSocket upgrades, owner endpoints), per-address connection caps and room passwords; addresses are hashed and never stored.
- Owner-only endpoints for per-game feature flags, metrics and a cost dashboard that warns at 80% of the free tier. Detail in [`docs/SECURITY.md`](docs/SECURITY.md).

## Intellectual property

Game mechanics can be learned from; their expression is not copied. Every name, character, track, piece of art, piece of music and prompt deck here is original, or CC0 / CC BY and registered in `docs/ASSETS.md`. A game inspired by a modern design names it only once, descriptively, on its own rules page. The reasoning is in [`docs/PRD/01-legal-ip-analysis.md`](docs/PRD/01-legal-ip-analysis.md).

## Development

```bash
npm ci
npm run dev            # http://localhost:5175
npm run lint && npm run typecheck && npm run check-i18n && npm test && npm run build
npm run test:browser   # Playwright end-to-end
npm run test:sweep     # every board game played to its end, three screen sizes
npm run play -- <game> # a random playthrough in the terminal
```

Design documents are written in Traditional Chinese, the project's working language; code, comments, commits and this README are in English. Current status: [`docs/NEXT.md`](docs/NEXT.md); batch order: [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Related projects

Same stack and planning method as [TKU BridgeTable](https://github.com/GeneCLee6/TKU-BridgeTable) (an online bridge table on Durable Objects), [TKU BridgeHall](https://github.com/GeneCLee6/TKU-BridgeHall) and [LongTalk](https://github.com/GeneCLee6/LongTalk).

## License

The source is public for review only. No open-source licence has been chosen, so all rights are reserved: you may read the code, but not copy, modify or redistribute it. Game names, artwork, characters, tracks, audio and prompt decks are original works of the project and are not licensed for reuse.
