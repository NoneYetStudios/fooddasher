# Food Dasher (`fooddasher.stabthefinger.com`) — Architecture & Design

**Food Dasher** is a zero-build, 1980s *Paperboy*-meets-modern-gig-economy isometric 2.5D arcade browser game for **Stab The Finger Arcade**, built with vanilla HTML5 Canvas, procedural Web Audio API SFX & synthwave chiptune music, and a PHP 8 + SQLite global leaderboard (`api/`).

---

## 1. File Structure

```text
fooddasher/
├── PLAN.md                 # Architecture, gameplay formulas & file layout
├── README.md               # Controls, setup & deployment guide
├── .htaccess               # Apache rules (block .sqlite/.md/dotfiles, security headers)
├── index.html              # Single-page app: STF Arcade HUD, Canvas, Touch UI, Screens, Dialogs
├── assets/
│   └── favicon.svg         # Insulated thermal delivery bag + lightning bolt SVG
├── css/
│   └── style.css           # Gig-app / thermal-bag theme, responsive tables, modals, safe-area HUD
├── js/
│   ├── config.js           # FD.CONFIG constants, vehicles, upgrades, food types, hazards
│   ├── util.js             # PRNG, currency/rating formatting, clamp/lerp, route helpers
│   ├── audio.js            # Procedural Web Audio API SFX + 80s synthwave chiptune loop
│   ├── input.js            # Keyboard (WASD/Arrows + Space/M/P) + mobile touch controls
│   ├── iso.js              # 2.5D curved isometric road projection & world-to-screen math
│   ├── dispatch.js         # Phase 1: Offer generator, bait orders, route queue, Smart Sort, map
│   ├── entities.js         # Phase 2: Traffic, potholes, sprinklers, mowers, geese, recliner, kaiju
│   ├── render.js           # Procedural 2.5D isometric street, buildings, mats, vehicles, GPS strip
│   ├── game.js             # State machine, Phase 2 physics/grab/toss/reroute, receipt & rating math
│   └── ui.js               # Screens, garage/upgrade shop, route reorder DOM, PHP + Local leaderboard
├── api/
│   ├── .htaccess           # Deny direct web access to db.php and seed_dev.php
│   ├── db.php              # SQLite PDO helper (WAL mode, busy_timeout, schema, rank/fetch)
│   ├── leaderboard.php     # GET endpoint: Overall (best per player) & By Vehicle views
│   ├── submit_score.php    # POST endpoint: validation, plausibility checks, rate limit, upsert
│   └── seed_dev.php        # CLI seed script for sample leaderboard scores
├── data/                   # Auto-created writable directory for leaderboard.sqlite
└── tests/
    └── verify.mjs          # Headless Node + PHP verification suite
```

---

## 2. Two-Phase Gameplay Loop

### Title & Garage Screen
- Displays current **App Rating** (`★ 5.00` starting; **ACCOUNT DEACTIVATED** Game Over if `< ★ 2.00`), **Net Bankroll ($)**, **Shift Counter**, **Vehicle & Gear Shop**, and **START SHIFT** / **LEADERBOARD**.
- Top HUD carries the **← STF Arcade** portal return button linking to `https://arcade.stabthefinger.com/`, restyled with Food Dasher's thermal-bag crimson, hi-vis amber, and smartphone gig-app border treatment.

### Phase 1 — Interactive Dispatch & Route Planner
- Generates `min(5, 2 + shiftNum)` gig offers on a stylized neighborhood mini-map (restaurants + delivery houses + road path preview).
- Offers include base pay, estimated tip (including bait orders like `$2.25 — NO TIP / 12 items`), food archetype (`Burrito`, `Hot Soup`, `Ice Cream`, `Giant Pizza`), and delivery note / hazard tag (`LEAVE AT DOOR — DO NOT KNOCK`, `AGGRESSIVE GOOSE IN YARD`, `SPRINKLERS ON`, `HAND IT TO ME`).
- Players toggle offers into an interleaved **Route Queue Strip** (`PICKUP` and `DROPOFF` waypoints), reorder stops with `▲` / `▼` or click-to-swap (strictly enforcing `Pickup` before its matching `Dropoff`), or hit **SMART SORT** / **START DASH**.

### Phase 2 — Isometric *Paperboy* Auto-Scroller
- Auto-scrolls through a continuous 2.5D isometric street corridor composed of straightaways, sweeping 90° turns, and cul-de-sac U-turn loops matching the planned stop sequence.
- **Steering & Speed:** `A/D` or `←/→` shifts lanes across curbs and center traffic; `W/S` or `↑/↓` adjusts speed.
- **Context Action (`[SPACE]` / `GRAB` / `TOSS`):**
  - **Drive-By Pickup (`GRAB`):** Pull into the restaurant curb lane inside the pickup window and press `GRAB`. Missing a pickup triggers `"MISSED PICKUP! REROUTING..."` and splices a `+380` unit emergency U-turn loop + retry pickup ahead (decaying carried bags). Missing twice cancels the order with a `★ 1.0` rating hit.
  - **Porch Toss (`TOSS`):** Throws a parabolic food bag toward the customer's porch. Welcome Mat bullseye grants `+$2.00` *"Followed Instructions"* + `★ 5.0`; bushes/puddles damage integrity (`-35%`, `50%` tip cut, `★ 2.5`); yard hazards (sprinklers, dogs, geese, angry customers) ruin the order (`$0`, `★ 1.0`).
- **STF Arcade Hazards & Cameos:** Traffic, reversing SUVs, rival dashers, open potholes (spills `Hot Soup`), yard sprinklers, lawnmowers, cul-de-sac **Geese** (*Parking Lot*), runaway **Motorized Recliner** (*World's Worst Driver*), and late-shift **Kaiju Stomp Shockwaves** (*Kaiju Brawl*).

### End-of-Shift Parody Receipt & Upgrades
- Gross Base Pay + Tips Earned + Bullseye Bonuses minus parody fees (*App Algorithm Fee* 8%, *Thermal Bag Depreciation* `$0.75`, *Convenience Fee for Getting Paid* `$0.99`, capped so positive shifts net at least 65%).
- Bankroll funds vehicle upgrades (`2004 Scooter` → `Rusty Hatchback` → `Turbo Delivery Van` → `Hover-Moped`) and gear (`Insulated Thermal Bag`, `Shock-Absorbing Rack`, `Precision Porch Cannon`).

---

## 3. PHP 8 + SQLite Leaderboard (`api/`)

- SQLite database at `data/leaderboard.sqlite` using PDO with `PRAGMA journal_mode = WAL` and `PRAGMA busy_timeout = 4000`.
- `scores` table tracks `player_name`, `name_key`, `vehicle_id`, `score` (Net Earnings in whole dollars), `deliveries`, `shifts_completed`, `peak_rating`, and `created_at` with `UNIQUE (name_key, vehicle_id)`, validated by `deliveries <= shifts_completed * 8` and `score <= deliveries * 150 + shifts_completed * 100 + 250`.
- Views: `overall` (best score per player across all vehicles) and `vehicle` (filtered or grouped by `vehicle_id`).
- Graceful `LOCAL MODE` fallback via `localStorage` when running without PHP.
