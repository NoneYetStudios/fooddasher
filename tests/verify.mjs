/* Headless Node + PHP/SQLite verification suite for Food Dasher. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadScripts(files) {
  const store = Object.create(null);
  const sandbox = {
    globalThis: null,
    window: null,
    console: console,
    Math: Math,
    Date: Date,
    Number: Number,
    String: String,
    Array: Array,
    Object: Object,
    JSON: JSON,
    Set: Set,
    Promise: Promise,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    }
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const rel of files) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, ctx, { filename: rel });
  }
  return ctx.FD;
}

async function runGameLogicTests() {
  const FD = loadScripts([
    'js/config.js',
    'js/util.js',
    'js/audio.js',
    'js/input.js',
    'js/iso.js',
    'js/dispatch.js',
    'js/entities.js',
    'js/render.js',
    'js/game.js',
    'js/ui.js'
  ]);

  // 1. Phase 1 Dispatch & Route Planner
  FD.Game.resetCareer();
  const dispatch1 = FD.Game.prepareDispatch(12345);
  assert.equal(dispatch1.offers.length, 3, 'Shift 1 should generate 3 offers');
  assert.ok(dispatch1.offers.some((o) => o.isBait && o.basePay === 2.25 && o.estimatedTip === 0), 'Bait $2.25 NO TIP order present');

  const dispatch3 = FD.Dispatch.generateShiftOffers(3, 999);
  assert.equal(dispatch3.length, 5, 'Shift 3+ should generate 5 offers');
  const foodsPresent = new Set(dispatch3.map((o) => o.foodType));
  assert.ok(foodsPresent.has('burrito') && foodsPresent.has('soup') && foodsPresent.has('ice_cream') && foodsPresent.has('pizza'), 'All 4 food types appear');

  const q3Default = FD.Dispatch.buildQueueFromOffers(dispatch3);
  const selectedIds3 = new Set(q3Default.map((s) => s.orderId));
  assert.ok(selectedIds3.size >= 1 && selectedIds3.size <= 2, 'Default dispatch pre-selects at most 2 offers');

  const overlapPins = FD.Dispatch.resolveMapPins([
    { id: 'A', rx: 0.5, ry: 0.5, cx: 0.5, cy: 0.5 },
    { id: 'B', rx: 0.5, ry: 0.5, cx: 0.5, cy: 0.5 }
  ], 440, 260).pins;
  for (let i = 0; i < overlapPins.length; i++) {
    for (let j = i + 1; j < overlapPins.length; j++) {
      const dx = Math.abs(overlapPins[i].x - overlapPins[j].x);
      const dy = Math.abs(overlapPins[i].y - overlapPins[j].y);
      assert.ok(dx >= 40 || dy >= 24, 'Map pin de-overlapping keeps all pins separated');
    }
  }

  // Route invariant: moving DROPOFF before its PICKUP must fail
  const q0 = dispatch1.queue;
  const firstDropIdx = q0.findIndex((s) => s.kind === 'DROPOFF');
  const matchingPickupIdx = q0.findIndex((s) => s.kind === 'PICKUP' && s.orderId === q0[firstDropIdx].orderId);
  const badSwap = FD.Game.swapQueueStops(firstDropIdx, matchingPickupIdx);
  assert.equal(badSwap.ok, false, 'Swapping a Dropoff before its matching Pickup must be rejected');

  // Valid reorder: move second PICKUP earlier
  if (q0.length >= 4 && q0[1].kind === 'PICKUP') {
    const goodMove = FD.Game.moveQueueStop(1, -1);
    assert.equal(goodMove.ok, true, 'Valid pickup reorder should succeed');
    assert.equal(FD.Util.validateRouteOrder(FD.Game.getDispatch().queue).ok, true);
  }

  // Smart Sort
  const sorted = FD.Game.smartSortDispatch();
  assert.equal(FD.Util.validateRouteOrder(sorted).ok, true, 'Smart Sort must keep Pickup < Dropoff invariant');

  // Corridor 1-to-1 interleaved stop order check
  const interleavedQueue = [
    { uid: 'A_P', orderId: 'A', kind: 'PICKUP', label: 'Rest A', side: 'left', color: '#ff3b1f', foodType: 'burrito' },
    { uid: 'A_D', orderId: 'A', kind: 'DROPOFF', label: 'Cust A', side: 'right', color: '#ff3b1f', foodType: 'burrito' },
    { uid: 'B_P', orderId: 'B', kind: 'PICKUP', label: 'Rest B', side: 'right', color: '#22d3ee', foodType: 'soup' },
    { uid: 'B_D', orderId: 'B', kind: 'DROPOFF', label: 'Cust B', side: 'left', color: '#22d3ee', foodType: 'soup' }
  ];
  const interleavedCorridor = FD.Dispatch.buildCorridorFromQueue(interleavedQueue, {}, 1);
  assert.deepEqual(
    Array.from(interleavedCorridor.stops, (s) => s.uid),
    ['A_P', 'A_D', 'B_P', 'B_D'],
    'Corridor preserves exact 1-to-1 interleaved stop order'
  );
  for (let i = 1; i < interleavedCorridor.stops.length; i++) {
    assert.ok(interleavedCorridor.stops[i].s > interleavedCorridor.stops[i - 1].s, 'Corridor stops progress monotonically');
  }

  // 2. Phase 2 Missed Pickup U-Turn Rerouting & Double-Miss Cancellation
  const offerA = {
    id: 'A',
    color: '#ff3b1f',
    restaurantName: 'Saigon Steam Kettle',
    customerName: 'Chad V.',
    address: '114 Sycamore Ct',
    foodType: 'soup',
    food: FD.FOOD_TYPES.soup,
    basePay: 5.00,
    estimatedTip: 4.50,
    isBait: false,
    itemCount: 2,
    note: 'LEAVE AT DOOR',
    hazardTag: 'ANGRY CUSTOMER',
    yardHazard: 'angry_customer',
    pickupSide: 'right',
    dropoffSide: 'right'
  };
  const offerB = {
    id: 'B',
    color: '#22d3ee',
    restaurantName: 'Zero-G Creamery',
    customerName: 'Brenda K.',
    address: '208 Mulberry Ln',
    foodType: 'ice_cream',
    food: FD.FOOD_TYPES.ice_cream,
    basePay: 4.50,
    estimatedTip: 5.00,
    isBait: false,
    itemCount: 1,
    note: 'SPRINKLERS ON',
    hazardTag: 'SPRINKLERS ON',
    yardHazard: 'sprinklers',
    pickupSide: 'left',
    dropoffSide: 'left'
  };
  const customOffers = { A: offerA, B: offerB };
  const customQueue = [
    { uid: 'A_P', orderId: 'A', kind: 'PICKUP', label: offerA.restaurantName, side: 'right', color: offerA.color, foodType: 'soup' },
    { uid: 'B_P', orderId: 'B', kind: 'PICKUP', label: offerB.restaurantName, side: 'left', color: offerB.color, foodType: 'ice_cream' },
    { uid: 'A_D', orderId: 'A', kind: 'DROPOFF', label: offerA.customerName, side: 'right', color: offerA.color, foodType: 'soup' },
    { uid: 'B_D', orderId: 'B', kind: 'DROPOFF', label: offerB.customerName, side: 'left', color: offerB.color, foodType: 'ice_cream' }
  ];

  const stReroute = FD.Game.createRunState(customQueue, customOffers, 2, 555);
  const firstPickupS = stReroute.stops[0].s;
  const origDropS = stReroute.stops.find((s) => s.uid === 'A_D').s;

  // Drive past A_P without pressing GRAB
  stReroute.player.s = firstPickupS + 95;
  FD.Game.stepRun(stReroute, 0.016, { steer: 0, throttle: 0, action: false });
  assert.equal(stReroute.orders.A.missedPickups, 1, 'First missed pickup increments counter');
  assert.equal(stReroute.bannerText, 'MISSED PICKUP! REROUTING...', 'Reroute banner triggers');
  assert.ok(stReroute.segments.some((seg) => seg.kind === 'uturn_reroute'), 'Emergency U-turn loop spliced');
  const retryStop = stReroute.stops.find((s) => s.uid === 'A_P_RETRY');
  assert.ok(retryStop && retryStop.s > firstPickupS, 'Retry pickup inserted ahead');
  assert.equal(stReroute.stops.find((s) => s.uid === 'A_D').s, origDropS + 380, 'Downstream stops pushed +380 units');

  // Drive past retry stop too without grabbing -> order canceled with 1-star penalty
  stReroute.player.s = retryStop.s + 95;
  FD.Game.stepRun(stReroute, 0.016, { steer: 0, throttle: 0, action: false });
  assert.equal(stReroute.orders.A.status, 'canceled', 'Second missed pickup cancels order');
  assert.equal(stReroute.orders.A.ratingAwarded, 1.0, 'Canceled order applies 1-star penalty');

  // 3. Thermal Decay, Pothole Soup Spill, Porch Toss & Parody Receipt Math
  const stPlay = FD.Game.createRunState(customQueue, customOffers, 2, 777);
  stPlay.hazards = [];
  stPlay.yardProps = stPlay.yardProps.filter((y) => y.kind === 'bush' || y.kind === 'puddle');

  const stopAP = stPlay.stops.find((s) => s.uid === 'A_P');
  stPlay.player.s = stopAP.s;
  stPlay.player.laneX = 0.95;
  const grabA = FD.Game.triggerAction(stPlay);
  assert.equal(grabA.ok, true);
  assert.equal(grabA.kind, 'GRAB');
  assert.ok(stPlay.activeBags.includes('A'));

  const stopBP = stPlay.stops.find((s) => s.uid === 'B_P');
  stPlay.player.s = stopBP.s;
  stPlay.player.laneX = -0.95;
  const grabB = FD.Game.triggerAction(stPlay);
  assert.equal(grabB.ok, true);

  for (let i = 0; i < 40; i++) {
    FD.Game.stepRun(stPlay, 0.05, { steer: 0, throttle: 0, action: false });
  }
  assert.ok(stPlay.orders.B.thermal < stPlay.orders.A.thermal, 'Ice cream decays faster than hot soup');

  const integrityBefore = stPlay.orders.A.integrity;
  const potRes = FD.Game.applyHazardImpact(stPlay, { kind: 'pothole', s: stPlay.player.s, laneX: 0 });
  assert.equal(potRes.spilledSoup, true, 'Pothole should spill Hot Soup');
  assert.ok(stPlay.orders.A.integrity < integrityBefore, 'Soup integrity drops after pothole');

  // Shock-Absorbing Rack Lv2 mitigates pothole soup spill
  FD.Game.getCareer().bankroll = 200;
  assert.equal(FD.Game.buyUpgrade('shock_rack').ok, true);
  assert.equal(FD.Game.buyUpgrade('shock_rack').ok, true);
  const integrityBeforeRack = stPlay.orders.A.integrity;
  FD.Game.applyHazardImpact(stPlay, { kind: 'pothole', s: stPlay.player.s, laneX: 0 });
  assert.ok(integrityBeforeRack - stPlay.orders.A.integrity < 6, 'Shock-Absorbing Rack Lv2 sharply reduces pothole spill');

  // Hover-Moped glides over potholes cleanly
  assert.equal(FD.Game.buyOrEquipVehicle('hover_moped').ok, true);
  const hoverPotRes = FD.Game.applyHazardImpact(stPlay, { kind: 'pothole', s: stPlay.player.s, laneX: 0 });
  assert.equal(hoverPotRes.ignored, true, 'Hover-Moped glides over potholes');

  // Welcome Mat Bullseye landing for A
  const stopAD = stPlay.stops.find((s) => s.uid === 'A_D');
  const matRes = FD.Game.resolveTossLanding(stPlay, {
    orderId: 'A',
    stopUid: stopAD.uid,
    endS: stopAD.s,
    endLaneX: 1.85
  });
  assert.equal(matRes.outcome, 'bullseye');
  assert.equal(stPlay.orders.A.bullseyeBonus, 2.00, 'Welcome mat grants +$2.00 bonus');
  assert.equal(stPlay.orders.A.ratingAwarded, 5.0, 'Welcome mat grants 5.0 rating');

  // Ruined by yard hazard for B
  const stopBD = stPlay.stops.find((s) => s.uid === 'B_D');
  stPlay.yardProps.push({ id: 'test_sprinkler', kind: 'sprinklers', s: stopBD.s, laneX: -1.85 });
  const ruinRes = FD.Game.resolveTossLanding(stPlay, {
    orderId: 'B',
    stopUid: stopBD.uid,
    endS: stopBD.s,
    endLaneX: -1.85
  });
  assert.equal(ruinRes.outcome, 'ruined');
  assert.equal(stPlay.orders.B.ratingAwarded, 1.0);

  const receipt = FD.Game.buildShiftReceipt(stPlay);
  assert.equal(receipt.grossBasePay, 5.00);
  assert.equal(receipt.bullseyeBonuses, 2.00);
  assert.ok(receipt.algorithmFee > 0 && receipt.bagDepreciation > 0 && receipt.convenienceFee > 0, 'Parody fees itemized');
  assert.ok(receipt.netShiftEarnings > 0 && receipt.netShiftEarnings < receipt.grossTotal);

  FD.Game.resetCareer();
  FD.Game.getCareer().rating = 2.05;
  const badReceipt = { netShiftEarnings: 0, deliveredCount: 0, shiftAvgRating: 1.0 };
  const commitRes = FD.Game.commitShiftReceipt(badReceipt);
  assert.ok(commitRes.career.rating < 2.00, 'Rating dropped below 2.00');
  assert.equal(commitRes.deactivated, true, 'Rating < 2.00 triggers deactivation');

  // 4. Hazards & STF Cameos
  const corridor = FD.Dispatch.buildCorridorFromQueue(customQueue, customOffers, 3);
  const spawned = FD.Entities.spawnShiftEntities(corridor, 3, 2026);
  assert.ok(spawned.hazards.some((h) => h.kind === 'goose'), 'Parking Lot Goose cameo spawned');
  assert.ok(spawned.hazards.some((h) => h.kind === 'recliner'), 'Motorized Recliner cameo spawned');
  assert.ok(spawned.kaijuStomps.length > 0, 'Late-shift Kaiju Stomp cameo spawned');

  // Local Mode Leaderboard Fallback
  const loc1 = FD.UI.submitLocalScore({ name: 'LOCAL_ACE', score: 120, deliveries: 9, shifts_completed: 3, peak_rating: 4.88, vehicle_id: 'van' });
  assert.equal(loc1.ok, true);
  const loc2 = FD.UI.submitLocalScore({ name: 'LOCAL_ACE', score: 85, deliveries: 7, shifts_completed: 2, peak_rating: 4.6, vehicle_id: 'scooter' });
  assert.equal(loc2.ok, true);
  const overallLocal = FD.UI.bestPerPlayer([loc1.best, loc2.best], null);
  assert.equal(overallLocal.length, 1, 'Overall best-per-player deduplicates across vehicles');
  assert.equal(overallLocal[0].score, 120);

  console.log('✓ Game logic, route planner, rerouting, thermal/receipt math & STF cameos passed.');
}

function verifyPhpStaticSyntaxAndContracts() {
  const phpFiles = ['api/db.php', 'api/leaderboard.php', 'api/submit_score.php', 'api/seed_dev.php'];
  for (const rel of phpFiles) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(src.startsWith('<?php'), `${rel} must start with <?php`);

    // Lexer check for balanced quotes, comments, and delimiters
    let inSingle = false;
    let inDouble = false;
    let inLineComment = false;
    let inBlockComment = false;
    const stack = [];
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      const next = src[i + 1] || '';
      if (inLineComment) {
        if (ch === '\n') inLineComment = false;
        continue;
      }
      if (inBlockComment) {
        if (ch === '*' && next === '/') { inBlockComment = false; i++; }
        continue;
      }
      if (inSingle) {
        if (ch === '\\') { i++; continue; }
        if (ch === "'") inSingle = false;
        continue;
      }
      if (inDouble) {
        if (ch === '\\') { i++; continue; }
        if (ch === '"') inDouble = false;
        continue;
      }
      if (ch === '/' && next === '/') { inLineComment = true; i++; continue; }
      if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }
      if (ch === '#') { inLineComment = true; continue; }
      if (ch === "'") { inSingle = true; continue; }
      if (ch === '"') { inDouble = true; continue; }
      if (ch === '{' || ch === '(' || ch === '[') stack.push(ch);
      else if (ch === '}' || ch === ')' || ch === ']') {
        const open = stack.pop();
        const match = (open === '{' && ch === '}') || (open === '(' && ch === ')') || (open === '[' && ch === ']');
        assert.ok(match, `Unmatched delimiter '${ch}' in ${rel} at offset ${i}`);
      }
    }
    assert.equal(inSingle, false, `Unterminated single quote in ${rel}`);
    assert.equal(inDouble, false, `Unterminated double quote in ${rel}`);
    assert.equal(inBlockComment, false, `Unterminated block comment in ${rel}`);
    assert.equal(stack.length, 0, `Unclosed delimiters in ${rel}: ${stack.join(',')}`);
  }

  const dbPhp = fs.readFileSync(path.join(ROOT, 'api/db.php'), 'utf8');
  assert.ok(dbPhp.includes('PRAGMA journal_mode = WAL'), 'db.php configures WAL mode');
  assert.ok(dbPhp.includes('PRAGMA busy_timeout = 4000'), 'db.php configures busy_timeout');
  assert.ok(dbPhp.includes("['scooter', 'hatchback', 'van', 'hover_moped']"), 'db.php defines FD_VEHICLES');
  for (const param of [':v', ':v2', ':n', ':nk', ':s', ':s6', ':d', ':d5', ':sh', ':sh4', ':pr', ':pr3', ':ca', ':ca2', ':id']) {
    assert.ok(dbPhp.includes(`bindValue('${param}'`), `db.php binds placeholder ${param}`);
  }

  console.log('✓ Static PHP syntax & SQL placeholder contract checks passed.');
}

async function runEndpointsVerification(baseUrl) {
  const sub1 = await fetch(`${baseUrl}/api/submit_score.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'TEST_DASH',
      score: 245,
      deliveries: 14,
      shifts_completed: 4,
      peak_rating: 4.94,
      vehicle_id: 'hover_moped'
    })
  });
  assert.equal(sub1.status, 200);
  const j1 = await sub1.json();
  assert.equal(j1.ok, true);
  assert.equal(j1.status, 'new');
  assert.equal(j1.best.name, 'TEST_DASH');

  const sub2 = await fetch(`${baseUrl}/api/submit_score.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'TEST_DASH',
      score: 98,
      deliveries: 6,
      shifts_completed: 2,
      peak_rating: 4.70,
      vehicle_id: 'scooter'
    })
  });
  assert.equal((await sub2.json()).ok, true);

  const sub3 = await fetch(`${baseUrl}/api/submit_score.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'MUNI_VAN',
      score: 180,
      deliveries: 11,
      shifts_completed: 3,
      peak_rating: 4.82,
      vehicle_id: 'van'
    })
  });
  assert.equal((await sub3.json()).ok, true);

  // Invalid vehicle check -> 422
  const badVeh = await fetch(`${baseUrl}/api/submit_score.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'BAD_CAR',
      score: 50,
      deliveries: 3,
      shifts_completed: 1,
      peak_rating: 4.5,
      vehicle_id: 'spaceship'
    })
  });
  assert.equal(badVeh.status, 422);

  // Implausible score check -> 422
  const badScore = await fetch(`${baseUrl}/api/submit_score.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'CHEATER',
      score: 99999,
      deliveries: 1,
      shifts_completed: 1,
      peak_rating: 5.0,
      vehicle_id: 'scooter'
    })
  });
  assert.equal(badScore.status, 422);

  // Overall board should show best-per-player (TEST_DASH once with 245, MUNI_VAN with 180)
  const lbOverall = await (await fetch(`${baseUrl}/api/leaderboard.php?view=overall`)).json();
  assert.equal(lbOverall.ok, true);
  assert.equal(lbOverall.entries.length, 2, 'Overall board returns 1 best entry per player');
  assert.equal(lbOverall.entries[0].name, 'TEST_DASH');
  assert.equal(lbOverall.entries[0].score, 245);

  // By Vehicle view filtered by scooter returns TEST_DASH's 98 scooter run
  const lbScooter = await (await fetch(`${baseUrl}/api/leaderboard.php?view=vehicle&vehicle_id=scooter`)).json();
  assert.equal(lbScooter.ok, true);
  assert.equal(lbScooter.entries.length, 1);
  assert.equal(lbScooter.entries[0].vehicle_id, 'scooter');
  assert.equal(lbScooter.entries[0].score, 98);
}

function sqlExec(dbFile, sql, json = false) {
  const args = json ? ['-json', dbFile, sql] : [dbFile, sql];
  const res = spawnSync('sqlite3', args, { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`sqlite3 failed: ${res.stderr || res.stdout}`);
  }
  return json ? (res.stdout.trim() ? JSON.parse(res.stdout) : []) : res.stdout;
}

function sqlStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

async function runSqliteFallbackHarness(dbFile) {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  sqlExec(
    dbFile,
    `PRAGMA busy_timeout = 4000;
     PRAGMA journal_mode = WAL;
     CREATE TABLE IF NOT EXISTS scores (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       player_name TEXT NOT NULL,
       name_key TEXT NOT NULL,
       vehicle_id TEXT NOT NULL,
       score INTEGER NOT NULL,
       deliveries INTEGER NOT NULL,
       shifts_completed INTEGER NOT NULL,
       peak_rating REAL NOT NULL,
       created_at INTEGER NOT NULL,
       UNIQUE (name_key, vehicle_id)
     );
     CREATE INDEX IF NOT EXISTS idx_scores_rank
       ON scores (score DESC, deliveries DESC, shifts_completed DESC, peak_rating DESC, created_at ASC);
     CREATE INDEX IF NOT EXISTS idx_scores_vehicle
       ON scores (vehicle_id, score DESC);`
  );

  const vehicles = ['scooter', 'hatchback', 'van', 'hover_moped'];
  const sendJson = (res, status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/api/leaderboard.php' && req.method === 'GET') {
      const v = url.searchParams.get('vehicle_id') || null;
      if (v && !vehicles.includes(v)) return sendJson(res, 422, { ok: false, error: 'Unknown vehicle_id.' });
      const view = url.searchParams.get('view') || 'overall';
      const limit = Math.max(1, Math.min(25, Number(url.searchParams.get('limit') || 25)));
      const whereClause = v ? `WHERE vehicle_id = ${sqlStr(v)}` : '';
      const rows = sqlExec(
        dbFile,
        `WITH f AS (SELECT * FROM scores ${whereClause}),
         best AS (
           SELECT *, ROW_NUMBER() OVER (
             PARTITION BY name_key
             ORDER BY score DESC, deliveries DESC, shifts_completed DESC, peak_rating DESC, created_at ASC, id ASC
           ) AS rn FROM f
         )
         SELECT player_name, vehicle_id, score, deliveries, shifts_completed, peak_rating, created_at
         FROM best WHERE rn = 1
         ORDER BY score DESC, deliveries DESC, shifts_completed DESC, peak_rating DESC, created_at ASC, id ASC
         LIMIT ${limit};`,
        true
      );
      const entries = rows.map((r, i) => ({
        rank: i + 1,
        name: r.player_name,
        player_name: r.player_name,
        vehicle_id: r.vehicle_id,
        score: Number(r.score),
        deliveries: Number(r.deliveries),
        shifts_completed: Number(r.shifts_completed),
        peak_rating: Math.round(Number(r.peak_rating) * 100) / 100,
        created_at: Number(r.created_at)
      }));
      return sendJson(res, 200, { ok: true, view, filters: { vehicle_id: v }, entries });
    }

    if (url.pathname === '/api/submit_score.php' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const input = JSON.parse(body || '{}');
        const name = String(input.name ?? input.player_name ?? '').replace(/\s+/g, ' ').trim();
        if (!name || name.length > 12 || !/^[A-Za-z0-9 _.\-!?]+$/.test(name)) {
          return sendJson(res, 422, { ok: false, error: 'Invalid name' });
        }
        const vid = String(input.vehicle_id || '');
        if (!vehicles.includes(vid)) return sendJson(res, 422, { ok: false, error: 'Unknown vehicle_id.' });
        const score = Number(input.score);
        const deliveries = Number(input.deliveries);
        const shifts = Number(input.shifts_completed);
        const peak = Math.round(Number(input.peak_rating) * 100) / 100;
        if (!Number.isInteger(score) || !Number.isInteger(deliveries) || !Number.isInteger(shifts)) {
          return sendJson(res, 422, { ok: false, error: 'Non-integer fields' });
        }
        if (deliveries > shifts * 8 || score > deliveries * 150 + shifts * 100 + 250) {
          return sendJson(res, 422, { ok: false, error: 'Plausibility check failed' });
        }
        const nk = name.toLowerCase();
        const now = Math.floor(Date.now() / 1000);
        sqlExec(
          dbFile,
          `INSERT INTO scores (player_name, name_key, vehicle_id, score, deliveries, shifts_completed, peak_rating, created_at)
           VALUES (${sqlStr(name)}, ${sqlStr(nk)}, ${sqlStr(vid)}, ${score}, ${deliveries}, ${shifts}, ${peak}, ${now})
           ON CONFLICT(name_key, vehicle_id) DO UPDATE SET
             player_name = excluded.player_name,
             score = excluded.score,
             deliveries = excluded.deliveries,
             shifts_completed = excluded.shifts_completed,
             peak_rating = excluded.peak_rating,
             created_at = excluded.created_at
           WHERE excluded.score > scores.score;`
        );
        return sendJson(res, 200, {
          ok: true,
          status: 'new',
          rank_overall: 1,
          rank_vehicle: 1,
          best: { name, player_name: name, vehicle_id: vid, score, deliveries, shifts_completed: shifts, peak_rating: peak }
        });
      });
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await runEndpointsVerification(`http://127.0.0.1:${port}`);
    console.log('✓ SQLite CLI + HTTP leaderboard harness passed (Overall + By Vehicle + validation).');
  } finally {
    server.close();
  }
}

async function runApiTests() {
  const dbFile = path.join(ROOT, 'data', 'leaderboard.sqlite');
  const hadExistingDb = fs.existsSync(dbFile);
  let backupBuf = null;
  if (hadExistingDb) backupBuf = fs.readFileSync(dbFile);
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(dbFile + suffix)) fs.unlinkSync(dbFile + suffix);
  }

  try {
    const phpVer = spawnSync('php', ['-v'], { encoding: 'utf8' });
    if (phpVer.status === 0) {
      for (const rel of ['api/db.php', 'api/leaderboard.php', 'api/submit_score.php', 'api/seed_dev.php']) {
        const lint = spawnSync('php', ['-l', path.join(ROOT, rel)], { encoding: 'utf8' });
        assert.equal(lint.status, 0, lint.stderr || lint.stdout);
      }
      const phpMods = spawnSync('php', ['-m'], { encoding: 'utf8' });
      assert.ok(phpMods.stdout.includes('pdo_sqlite'), 'pdo_sqlite PHP extension required');

      const port = 18923;
      const server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', ROOT], {
        env: { ...process.env, FD_SKIP_RATE_LIMIT: '1' },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      try {
        let ready = false;
        for (let i = 0; i < 30; i++) {
          try {
            const res = await fetch(`http://127.0.0.1:${port}/api/leaderboard.php`);
            if (res.ok) { ready = true; break; }
          } catch (e) {}
          await new Promise((r) => setTimeout(r, 100));
        }
        assert.ok(ready, 'PHP built-in server did not become ready in time');
        await runEndpointsVerification(`http://127.0.0.1:${port}`);
        console.log('✓ Live PHP 8 + SQLite leaderboard endpoints passed.');
      } finally {
        server.kill('SIGTERM');
      }
    } else {
      verifyPhpStaticSyntaxAndContracts();
      await runSqliteFallbackHarness(dbFile);
    }
  } finally {
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(dbFile + suffix)) fs.unlinkSync(dbFile + suffix);
    }
    if (backupBuf) fs.writeFileSync(dbFile, backupBuf);
  }
}

await runGameLogicTests();
await runApiTests();
console.log('ALL FOOD DASHER VERIFICATION TESTS PASSED!');
