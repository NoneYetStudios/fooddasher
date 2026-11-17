# Food Dasher — STF Arcade

**Hot Food. Cold Tips. Zero Benefits.**

A zero-build, 1980s *Paperboy*-meets-modern-gig-economy isometric 2.5D arcade browser game for **Stab The Finger Arcade** (`fooddasher.stabthefinger.com`).

## Features
- **Two-Phase Gig Loop:**
  1. **Phase 1 — Interactive Dispatch & Route Planner:** Review incoming gig offers on a clickable neighborhood mini-map, spot `$2.25 NO TIP` bait orders, toggle orders into your interleaved **Route Queue Strip** (from the offer list or directly by clicking map pins), manually sequence `Pickup` / `Dropoff` stops with `▲`/`▼` or click-to-swap (on the strip or map), and press `Space` (or **▶ START DASH (SPACE)**) to launch your shift.
  2. **Phase 2 — Isometric 2.5D *Paperboy* Auto-Scroller:** Cruise straightaways, sweeping 90° turns, and cul-de-sac loops. Pull into restaurant curb lanes to **GRAB** hot bags (miss once and get emergency U-turn rerouted; miss twice and lose the order with a `★ 1.0` penalty) and **TOSS** bags onto customer welcome mats for `+$2.00` bullseye tips.
- **Parody Shift Receipt & Penalties:** Itemized shift payouts deduct app/bag/convenience fees plus a `$3.50` **Stolen / Ruined Order Fee** per ruined or canceled order and an **Insurance Deductible** (`$1.25` per collision, `$0.50` per non-hovered pothole hit), with net shift earnings clamped at `$0.00`.
- **Vehicles & Gear Shop:** Upgrade from the **2004 Scooter** to the **Rusty Hatchback**, **Turbo Delivery Van**, and **Hover-Moped** (glides over potholes), plus **Insulated Thermal Bag**, **Shock-Absorbing Rack**, and **Precision Porch Cannon**.
- **STF Arcade Cameos & Hazards:** Traffic, reversing SUVs, rival dashers, soup-spilling potholes, sprinklers, lawnmowers, cul-de-sac **Geese** (*Parking Lot*), runaway **Motorized Recliner** (*World's Worst Driver*), and late-shift **Kaiju Stomp Shockwaves** (*Kaiju Brawl*).
- **Procedural Web Audio:** Retro synth SFX and toggleable 1980s chiptune synthwave soundtrack (`M` to mute).
- **PHP 8 + SQLite Leaderboard (`api/`):** WAL-mode SQLite database with `Overall` and `By Vehicle` rankings plus automatic `LOCAL MODE` (`localStorage`) fallback.

## Controls
- **Desktop:** `Space` on Menu / Dispatch to advance and start the shift · `A`/`D` or `←`/`→` to steer across lanes · `W`/`S` or `↑`/`↓` to accelerate/brake · `Space` for context `GRAB` / `TOSS` · `M` mute audio · `P` / `Esc` pause
- **Mobile:** On-screen `◄` / `►` lane buttons, `BRAKE` / `BOOST`, and context-sensitive `GRAB` / `TOSS` button.

## Deploying to JetHost

Upload the following files and folders into your site's web root (e.g. `public_html/` or subdomain document root for `fooddasher.stabthefinger.com`):

- `index.html`
- `.htaccess` (blocks dotfiles, `.sqlite`/`.md`/`.log` files, and directory listings)
- `assets/` (`assets/favicon.svg`)
- `css/` (`css/style.css`)
- `js/` (`audio.js`, `config.js`, `dispatch.js`, `entities.js`, `game.js`, `input.js`, `iso.js`, `render.js`, `ui.js`, `util.js`)
- `api/` (`.htaccess`, `db.php`, `leaderboard.php`, `submit_score.php`)

**Server requirements & permissions:**
- **PHP 8+** with the **`pdo_sqlite`** extension enabled (if unavailable, the game still runs in `LOCAL MODE` using `localStorage`).
- Ensure the web root (or a pre-created `data/` folder inside it) is **writable by PHP** (`755` or `775`) so `api/db.php` can create and write `data/leaderboard.sqlite`.
- You do **not** need to upload `tests/`, `PLAN.md`, `README.md`, `.gitignore`, or `api/seed_dev.php`.

## Local Running & Verification

Serve with PHP 8's built-in server (requires `pdo_sqlite`):

```bash
php -S 127.0.0.1:8080
```

Seed sample leaderboard scores (CLI only):

```bash
php api/seed_dev.php
```

Run syntax checks and the automated verification suite:

```bash
for f in js/*.js tests/verify.mjs; do node --check "$f"; done
for f in api/*.php; do php -l "$f"; done
node tests/verify.mjs
```
