/* Food Dasher — core game state machine, Phase 2 simulation, rerouting & parody receipt math. */
(function (root) {
  'use strict';
  const FD = (root.FD = root.FD || {});

  const CAREER_KEY = 'fd_career_v1';

  function defaultCareer() {
    return {
      bankroll: 0,
      rating: FD.CONFIG.STARTING_RATING,
      peakRating: FD.CONFIG.STARTING_RATING,
      shiftNum: 1,
      shiftsCompleted: 0,
      totalDeliveries: 0,
      bestNetScore: 0,
      ownedVehicles: ['scooter'],
      equippedVehicle: 'scooter',
      upgrades: {
        thermal_bag: 0,
        shock_rack: 0,
        porch_cannon: 0
      }
    };
  }

  function loadCareer() {
    const base = defaultCareer();
    try {
      if (typeof localStorage === 'undefined') return base;
      const raw = localStorage.getItem(CAREER_KEY);
      if (!raw) return base;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return base;
      base.bankroll = Math.max(0, FD.Util.round2(saved.bankroll || 0));
      base.rating = FD.Util.clamp(Number(saved.rating || FD.CONFIG.STARTING_RATING), 1.0, 5.0);
      base.peakRating = FD.Util.clamp(Number(saved.peakRating || base.rating), 1.0, 5.0);
      base.shiftNum = Math.max(1, Math.floor(saved.shiftNum || 1));
      base.shiftsCompleted = Math.max(0, Math.floor(saved.shiftsCompleted || 0));
      base.totalDeliveries = Math.max(0, Math.floor(saved.totalDeliveries || 0));
      base.bestNetScore = Math.max(0, Math.round(saved.bestNetScore || 0));
      if (Array.isArray(saved.ownedVehicles) && saved.ownedVehicles.length) {
        base.ownedVehicles = saved.ownedVehicles.filter(function (v) { return !!FD.VEHICLES[v]; });
      }
      if (base.ownedVehicles.indexOf('scooter') === -1) base.ownedVehicles.unshift('scooter');
      if (saved.equippedVehicle && FD.VEHICLES[saved.equippedVehicle] && base.ownedVehicles.indexOf(saved.equippedVehicle) !== -1) {
        base.equippedVehicle = saved.equippedVehicle;
      }
      if (saved.upgrades && typeof saved.upgrades === 'object') {
        for (const k in base.upgrades) {
          const maxL = FD.UPGRADES[k].maxLevel;
          base.upgrades[k] = FD.Util.clamp(Math.floor(saved.upgrades[k] || 0), 0, maxL);
        }
      }
    } catch (e) { /* ignore corrupt storage */ }
    return base;
  }

  function saveCareer(career) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CAREER_KEY, JSON.stringify(career));
      }
    } catch (e) {}
  }

  let career = loadCareer();
  let mode = 'menu'; // 'menu' | 'dispatch' | 'play' | 'pause' | 'receipt' | 'over'
  let rafId = 0;
  let lastTs = 0;

  let dispatchState = {
    offers: [],
    offersById: Object.create(null),
    queue: []
  };

  let run = null;
  let callbacks = {
    onModeChange: null,
    onHudUpdate: null,
    onShiftComplete: null,
    onDeactivated: null,
    onBanner: null
  };

  function getVehicle() {
    return FD.VEHICLES[career.equippedVehicle] || FD.VEHICLES.scooter;
  }

  function getThermalMultiplier() {
    const lv = career.upgrades.thermal_bag || 0;
    return FD.UPGRADES.thermal_bag.multipliers[lv] || 1.0;
  }

  function getShockMultiplier() {
    const lv = career.upgrades.shock_rack || 0;
    return FD.UPGRADES.shock_rack.multipliers[lv] || 1.0;
  }

  function getMatMultiplier() {
    const lv = career.upgrades.porch_cannon || 0;
    return FD.UPGRADES.porch_cannon.matMultipliers[lv] || 1.0;
  }

  function resetCareer() {
    const prevBest = career.bestNetScore || 0;
    career = defaultCareer();
    career.bestNetScore = prevBest;
    saveCareer(career);
    return career;
  }

  function startNewCareerRun() {
    resetCareer();
    return prepareDispatch(Date.now());
  }

  function prepareDispatch(seed) {
    const offers = FD.Dispatch.generateShiftOffers(career.shiftNum, seed);
    const offersById = Object.create(null);
    for (let i = 0; i < offers.length; i++) offersById[offers[i].id] = offers[i];
    const queue = FD.Dispatch.buildQueueFromOffers(offers);
    dispatchState = {
      offers: offers,
      offersById: offersById,
      queue: queue
    };
    mode = 'dispatch';
    if (callbacks.onModeChange) callbacks.onModeChange(mode);
    return dispatchState;
  }

  function toggleOffer(offerId) {
    const offer = dispatchState.offersById[offerId];
    if (!offer) return { ok: false, queue: dispatchState.queue };
    const next = FD.Dispatch.toggleOfferInQueue(dispatchState.queue, offer);
    if (next.length === 0) {
      return { ok: false, queue: dispatchState.queue, reason: 'Select at least 1 order to start a shift!' };
    }
    dispatchState.queue = next;
    return { ok: true, queue: dispatchState.queue };
  }

  function moveQueueStop(index, delta) {
    const res = FD.Util.moveStopInQueue(dispatchState.queue, index, delta);
    if (res.ok) dispatchState.queue = res.queue;
    return res;
  }

  function swapQueueStops(idxA, idxB) {
    const res = FD.Util.swapStopsInQueue(dispatchState.queue, idxA, idxB);
    if (res.ok) dispatchState.queue = res.queue;
    return res;
  }

  function smartSortDispatch() {
    dispatchState.queue = FD.Dispatch.smartSortQueue(dispatchState.queue, dispatchState.offersById);
    return dispatchState.queue;
  }

  /** Create a Phase 2 run state from an explicit or active dispatch queue. */
  function createRunState(customQueue, customOffersById, shiftNumOverride, seed) {
    const q = customQueue || dispatchState.queue;
    const byId = customOffersById || dispatchState.offersById;
    const sNum = shiftNumOverride != null ? shiftNumOverride : career.shiftNum;
    const corridor = FD.Dispatch.buildCorridorFromQueue(q, byId, sNum);
    const spawned = FD.Entities.spawnShiftEntities(corridor, sNum, seed);
    const veh = getVehicle();

    const orders = Object.create(null);
    for (let i = 0; i < q.length; i++) {
      const oid = q[i].orderId;
      if (!orders[oid] && byId[oid]) {
        const o = byId[oid];
        orders[oid] = {
          id: oid,
          offer: o,
          status: 'queued', // 'queued' | 'carried' | 'delivered' | 'ruined' | 'canceled'
          missedPickups: 0,
          thermal: 100,
          integrity: 100,
          baseEarned: 0,
          tipEarned: 0,
          bullseyeBonus: 0,
          ratingAwarded: null,
          outcomeLabel: ''
        };
      }
    }

    const state = {
      shiftNum: sNum,
      corridor: corridor,
      stops: corridor.stops,
      segments: corridor.segments,
      totalLength: corridor.totalLength,
      orders: orders,
      activeBags: [], // array of orderIds currently in thermal pack
      projectiles: [],
      callouts: [],
      particles: [],
      hazards: spawned.hazards,
      yardProps: spawned.yardProps,
      kaijuStomps: spawned.kaijuStomps,
      elapsed: 0,
      shakeTimer: 0,
      shakeAmp: 0,
      bannerText: '',
      bannerTimer: 0,
      finished: false,
      player: {
        s: 0,
        laneX: 0,
        speed: veh.minSpeed + (veh.maxSpeed - veh.minSpeed) * 0.48,
        invulnTimer: 0,
        bumpTimer: 0,
        tossCooldown: 0
      },
      onEvent: function (ev, payload) {
        if (ev === 'honk') {
          FD.Audio.sfx.honk();
          spawnCallout(state, payload.s, payload.laneX, 34, 'HONK!', '#ffbe0b');
        } else if (ev === 'kaiju_warn') {
          showBanner(state, 'ATOMIC STOMP INCOMING!', 1.2);
          spawnCallout(state, payload.s, payload.laneX, 50, 'ROAR!!', '#7dff4f');
        } else if (ev === 'kaiju_stomp') {
          FD.Audio.sfx.stomp();
          state.shakeTimer = 0.55;
          state.shakeAmp = 12;
          spawnCallout(state, payload.s, payload.laneX, 42, 'KAIJU STOMP!', '#7dff4f');
        }
      }
    };
    return state;
  }

  function startShift(seed) {
    if (!dispatchState.queue.length) return null;
    run = createRunState(dispatchState.queue, dispatchState.offersById, career.shiftNum, seed);
    mode = 'play';
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.add('playing');
    }
    FD.Input.clearAll();
    FD.Audio.startMusic(function () { return career.shiftNum; });
    if (callbacks.onModeChange) callbacks.onModeChange(mode);
    startLoop();
    return run;
  }

  function showBanner(state, text, dur) {
    state.bannerText = text;
    state.bannerTimer = dur || 1.8;
    if (callbacks.onBanner) callbacks.onBanner(text);
  }

  function spawnCallout(state, s, laneX, z, text, color) {
    state.callouts.push({
      s: s,
      laneX: laneX,
      z: z || 28,
      text: text,
      color: color || '#ffbe0b',
      age: 0,
      dur: 1.35
    });
  }

  function spawnParticles(state, s, laneX, z, color, count) {
    const n = count || 8;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      state.particles.push({
        s: s,
        laneX: laneX,
        z: z || 14,
        vs: Math.cos(ang) * 45,
        vl: Math.sin(ang) * 0.55,
        vz: 55 + (i % 3) * 28,
        color: color || '#ffbe0b',
        age: 0,
        dur: 0.55
      });
    }
  }

  /** Context-aware single button / Spacebar state. */
  function getContextAction(state) {
    const st = state || run;
    if (!st) return { type: 'TOSS_IDLE', stop: null, inLane: false };
    const ps = st.player.s;
    const veh = getVehicle();

    let bestStop = null;
    let bestDist = Infinity;
    for (let i = 0; i < st.stops.length; i++) {
      const stop = st.stops[i];
      if (stop.completed || stop.missed) continue;
      if (stop.kind === 'DROPOFF' && st.activeBags.indexOf(stop.orderId) === -1) continue;
      const dist = Math.abs(stop.s - ps);
      if (ps >= stop.s - 105 && ps <= stop.s + 85 && dist < bestDist) {
        bestDist = dist;
        bestStop = stop;
      }
    }

    if (bestStop) {
      if (bestStop.kind === 'PICKUP') {
        const targetLane = bestStop.side === 'left' ? -0.95 : 0.95;
        const inLane = Math.abs(st.player.laneX - targetLane) <= 0.65 * veh.grabRadius;
        return { type: 'GRAB', stop: bestStop, inLane: inLane, targetLane: targetLane };
      }
      return { type: 'TOSS', stop: bestStop, inLane: true };
    }

    // Also allow aiming a toss if carrying any bag toward next active dropoff
    if (st.activeBags.length > 0) {
      for (let i = 0; i < st.stops.length; i++) {
        const stop = st.stops[i];
        if (!stop.completed && stop.kind === 'DROPOFF' && st.activeBags.indexOf(stop.orderId) !== -1) {
          return { type: 'TOSS', stop: stop, inLane: true };
        }
      }
    }

    return { type: 'TOSS_IDLE', stop: null, inLane: false };
  }

  /** Execute context action (GRAB pickup or TOSS porch delivery). */
  function triggerAction(state) {
    const st = state || run;
    if (!st || st.finished) return { ok: false, kind: 'none' };
    const ctx = getContextAction(st);

    if (ctx.type === 'GRAB' && ctx.stop) {
      if (!ctx.inLane) {
        FD.Audio.sfx.error();
        spawnCallout(st, st.player.s, st.player.laneX, 34, 'PULL TO CURB!', '#ffbe0b');
        return { ok: false, kind: 'wrong_lane' };
      }
      const stop = ctx.stop;
      const ord = st.orders[stop.orderId];
      stop.completed = true;
      if (ord) {
        ord.status = 'carried';
        ord.thermal = 100;
        ord.integrity = 100;
        if (st.activeBags.indexOf(ord.id) === -1) st.activeBags.push(ord.id);
      }
      FD.Audio.sfx.grab();
      spawnParticles(st, stop.s, ctx.targetLane, 16, stop.color, 10);
      spawnCallout(st, stop.s, ctx.targetLane, 38, 'HOT BAG GRABBED!', '#ffbe0b');
      return { ok: true, kind: 'GRAB', orderId: stop.orderId };
    }

    if (ctx.type === 'TOSS' && st.activeBags.length > 0 && st.player.tossCooldown <= 0) {
      let targetStop = ctx.stop;
      if (!targetStop) {
        const firstBagId = st.activeBags[0];
        targetStop = st.stops.find(function (s) {
          return !s.completed && s.kind === 'DROPOFF' && s.orderId === firstBagId;
        }) || null;
      }
      if (!targetStop) return { ok: false, kind: 'no_target' };

      const oid = targetStop.orderId;
      const ord = st.orders[oid];
      const food = ord && ord.offer ? ord.offer.food : FD.FOOD_TYPES.burrito;
      const sideSign = targetStop.side === 'left' ? -1 : 1;
      const matLaneX = sideSign * 1.85;
      const flightDur = 0.42 / (food.tossSpeed || 1);
      // Giant Pizza has a wider arc spread unless damped by Precision Porch Cannon
      const cannonLv = career.upgrades.porch_cannon || 0;
      const spreadScale = cannonLv >= 2 ? 0.25 : cannonLv === 1 ? 0.55 : 1.0;
      const jitterS = ((Math.sin(st.elapsed * 19.7 + st.player.s * 0.07) * 0.5) * (food.arcSpread || 0) * 140) * spreadScale;
      const startS = st.player.s;
      const startLane = st.player.laneX;
      // Forward lead proportional to player speed so moving cleanly aligns with the mat
      const leadS = st.player.speed * 0.30 + jitterS;

      st.player.tossCooldown = 0.28;
      // Remove bag from active pack in flight
      const bIdx = st.activeBags.indexOf(oid);
      if (bIdx !== -1) st.activeBags.splice(bIdx, 1);

      st.projectiles.push({
        orderId: oid,
        stopUid: targetStop.uid,
        color: targetStop.color,
        foodType: targetStop.foodType,
        startS: startS,
        startLaneX: startLane,
        endS: startS + leadS,
        endLaneX: matLaneX,
        age: 0,
        dur: flightDur,
        resolved: false
      });
      FD.Audio.sfx.toss();
      return { ok: true, kind: 'TOSS', orderId: oid };
    }

    return { ok: false, kind: 'idle' };
  }

  /** Evaluate where a tossed food bag landed relative to welcome mat and yard hazards. */
  function resolveTossLanding(state, proj) {
    proj.resolved = true;
    const stop = state.stops.find(function (s) { return s.uid === proj.stopUid; });
    if (!stop) return { outcome: 'missed' };
    const ord = state.orders[proj.orderId];
    if (!ord) return { outcome: 'missed' };

    const offer = ord.offer;
    const sideSign = stop.side === 'left' ? -1 : 1;
    const matLaneX = sideSign * 1.85;
    const matRadiusS = 44 * getMatMultiplier();
    const distS = Math.abs(proj.endS - stop.s);
    const distLane = Math.abs(proj.endLaneX - matLaneX);

    // Check collision with active yard hazards (sprinklers, goose, dog, angry customer)
    let hitHazard = null;
    let hitObstacle = null;
    for (let i = 0; i < state.yardProps.length; i++) {
      const yp = state.yardProps[i];
      if (Math.abs(yp.s - proj.endS) < 28 && Math.abs(yp.laneX - proj.endLaneX) < 0.42) {
        if (yp.kind === 'bush' || yp.kind === 'puddle') hitObstacle = yp;
        else hitHazard = yp;
      }
    }

    stop.completed = true;
    const freshness = FD.Util.clamp((ord.thermal * 0.65 + ord.integrity * 0.35) / 100, 0.15, 1.0);

    if (hitHazard) {
      ord.status = 'ruined';
      ord.baseEarned = 0;
      ord.tipEarned = 0;
      ord.bullseyeBonus = 0;
      ord.ratingAwarded = 1.0;
      ord.outcomeLabel = 'RUINED BY ' + hitHazard.kind.replace('_', ' ').toUpperCase();
      FD.Audio.sfx.ruined();
      spawnParticles(state, proj.endS, proj.endLaneX, 10, '#ef4444', 12);
      spawnCallout(state, proj.endS, proj.endLaneX, 40, '1-STAR! RUINED!', '#ef4444');
      return { outcome: 'ruined', order: ord };
    }

    if (hitObstacle) {
      ord.integrity = Math.max(0, ord.integrity - 35);
      ord.status = 'delivered';
      ord.baseEarned = offer.basePay;
      ord.tipEarned = FD.Util.round2(offer.estimatedTip * freshness * 0.5);
      ord.bullseyeBonus = 0;
      ord.ratingAwarded = 2.5;
      ord.outcomeLabel = 'DAMAGED IN ' + hitObstacle.kind.toUpperCase();
      FD.Audio.sfx.pothole();
      spawnParticles(state, proj.endS, proj.endLaneX, 10, '#a3e635', 10);
      spawnCallout(state, proj.endS, proj.endLaneX, 38, 'SOGGY BAG! ★2.5', '#f59e0b');
      return { outcome: 'damaged', order: ord };
    }

    const isBullseye = distS <= matRadiusS && distLane <= 0.36;
    if (isBullseye) {
      ord.status = 'delivered';
      ord.baseEarned = offer.basePay;
      ord.tipEarned = FD.Util.round2(offer.estimatedTip * freshness);
      ord.bullseyeBonus = FD.CONFIG.BULLSEYE_BONUS;
      ord.ratingAwarded = ord.thermal >= 45 ? 5.0 : 4.2;
      ord.outcomeLabel = 'WELCOME MAT BULLSEYE';
      FD.Audio.sfx.bullseye();
      spawnParticles(state, stop.s, matLaneX, 14, '#ffbe0b', 14);
      spawnCallout(state, stop.s, matLaneX, 44, 'HOT DROP! +$2.00', '#a3e635');
      return { outcome: 'bullseye', order: ord };
    }

    if (distS <= 96) {
      ord.status = 'delivered';
      ord.baseEarned = offer.basePay;
      ord.tipEarned = FD.Util.round2(offer.estimatedTip * freshness * 0.85);
      ord.bullseyeBonus = 0;
      const cold = ord.thermal < 50;
      ord.ratingAwarded = cold ? 3.2 : FD.Util.round2(4.0 + freshness * 0.8);
      ord.outcomeLabel = cold ? 'DELIVERED LUKEWARM' : 'PORCH DELIVERY';
      FD.Audio.sfx.deliver();
      spawnParticles(state, proj.endS, proj.endLaneX, 10, stop.color, 8);
      spawnCallout(state, proj.endS, proj.endLaneX, 38, cold ? 'COLD FRIES!' : 'DELIVERED!', cold ? '#38bdf8' : '#ffbe0b');
      return { outcome: 'porch', order: ord };
    }

    // Completely missed the porch yard
    ord.status = 'ruined';
    ord.baseEarned = 0;
    ord.tipEarned = 0;
    ord.bullseyeBonus = 0;
    ord.ratingAwarded = 1.0;
    ord.outcomeLabel = 'TOSSED INTO STREET';
    FD.Audio.sfx.ruined();
    spawnCallout(state, proj.endS, proj.endLaneX, 36, '1-STAR! MISSED YARD!', '#ef4444');
    return { outcome: 'missed_yard', order: ord };
  }

  /** Handle passing a PICKUP curb window without grabbing. */
  function handleMissedPickup(state, stop) {
    stop.missed = true;
    const ord = state.orders[stop.orderId];
    if (!ord) return { action: 'none' };
    ord.missedPickups += 1;

    if (ord.missedPickups === 1) {
      // Splice an emergency U-turn cul-de-sac loop ahead and push downstream stops +380 units.
      const REROUTE_LOOP = 380;
      const insertS = stop.s + 120;
      const retryS = insertS + 230;

      for (let i = 0; i < state.stops.length; i++) {
        const s = state.stops[i];
        if (!s.completed && !s.missed && s.s > stop.s) {
          s.s += REROUTE_LOOP;
        }
      }
      for (let i = 0; i < state.segments.length; i++) {
        const seg = state.segments[i];
        if (seg.startS > stop.s) {
          seg.startS += REROUTE_LOOP;
          seg.endS += REROUTE_LOOP;
        }
      }
      for (let i = 0; i < state.hazards.length; i++) {
        if (state.hazards[i].s > stop.s + 60) state.hazards[i].s += REROUTE_LOOP;
      }
      for (let i = 0; i < state.yardProps.length; i++) {
        const yp = state.yardProps[i];
        if (yp.s > stop.s) {
          yp.s += REROUTE_LOOP;
          if (yp.baseS != null) yp.baseS += REROUTE_LOOP;
        }
      }
      for (let i = 0; i < state.kaijuStomps.length; i++) {
        const ks = state.kaijuStomps[i];
        if (ks.s > stop.s) {
          ks.s += REROUTE_LOOP;
          ks.triggerS += REROUTE_LOOP;
        }
      }

      state.segments.push({
        startS: insertS,
        endS: retryS - 30,
        kind: 'uturn_reroute',
        kappa: 0.0052
      });
      state.corridor.totalLength += REROUTE_LOOP;
      state.totalLength += REROUTE_LOOP;

      const retryStop = {
        uid: stop.orderId + '_P_RETRY',
        orderId: stop.orderId,
        kind: 'PICKUP',
        label: stop.label + ' (U-TURN)',
        side: stop.side,
        color: stop.color,
        foodType: stop.foodType,
        offer: stop.offer,
        s: retryS,
        completed: false,
        missed: false,
        isRetry: true
      };
      // Insert retry stop right after the missed stop so queue order remains valid
      const idx = state.stops.indexOf(stop);
      state.stops.splice(idx + 1, 0, retryStop);

      FD.Audio.sfx.reroute();
      showBanner(state, 'MISSED PICKUP! REROUTING...', 2.2);
      spawnCallout(state, state.player.s + 40, state.player.laneX, 44, 'MISSED PICKUP! U-TURN!', '#ff3b1f');
      return { action: 'rerouted', retryStop: retryStop };
    }

    // Missed twice -> cancel order with 1-star penalty
    ord.status = 'canceled';
    ord.baseEarned = 0;
    ord.tipEarned = 0;
    ord.bullseyeBonus = 0;
    ord.ratingAwarded = 1.0;
    ord.outcomeLabel = 'MISSED PICKUP TWICE — CANCELED';

    for (let i = 0; i < state.stops.length; i++) {
      if (state.stops[i].orderId === ord.id && state.stops[i].kind === 'DROPOFF') {
        state.stops[i].completed = true;
      }
    }
    FD.Audio.sfx.ruined();
    showBanner(state, 'ORDER ' + ord.id + ' CANCELED! ★ 1.0 PENALTY', 2.0);
    spawnCallout(state, state.player.s + 30, state.player.laneX, 44, 'ORDER CANCELED! ★ 1.0', '#ef4444');
    return { action: 'canceled', order: ord };
  }

  /** Apply collision impact from road hazards or kaiju shockwaves. */
  function applyHazardImpact(state, hazard) {
    hazard.hit = true;
    const veh = getVehicle();
    const shockMult = getShockMultiplier();

    if (hazard.kind === 'pothole') {
      if (veh.hover) {
        spawnCallout(state, hazard.s, hazard.laneX, 26, 'HOVERED OVER!', '#a3e635');
        return { ignored: true, reason: 'hover_moped' };
      }
      state.player.speed = Math.max(veh.minSpeed * 0.72, state.player.speed * 0.65);
      state.player.bumpTimer = 0.35;
      state.shakeTimer = 0.25;
      state.shakeAmp = 6;
      FD.Audio.sfx.pothole();

      let spilledSoup = false;
      for (let i = 0; i < state.activeBags.length; i++) {
        const ord = state.orders[state.activeBags[i]];
        if (!ord || !ord.offer) continue;
        const loss = ord.offer.food.potholeSpill * shockMult;
        ord.integrity = Math.max(10, ord.integrity - loss);
        if (ord.offer.foodType === 'soup') spilledSoup = true;
      }
      spawnCallout(state, hazard.s, hazard.laneX, 34, spilledSoup ? 'SOUP SPILLED!' : 'POTHOLE!', '#ffbe0b');
      return { ignored: false, kind: 'pothole', spilledSoup: spilledSoup };
    }

    if (state.player.invulnTimer > 0) return { ignored: true, reason: 'invuln' };

    state.player.invulnTimer = 1.0;
    state.player.bumpTimer = 0.45;
    state.player.speed = Math.max(veh.minSpeed * 0.65, state.player.speed * 0.55);
    state.shakeTimer = 0.36;
    state.shakeAmp = 9;
    FD.Audio.sfx.pothole();

    for (let i = 0; i < state.activeBags.length; i++) {
      const ord = state.orders[state.activeBags[i]];
      if (!ord || !ord.offer) continue;
      const baseDmg = hazard.kind === 'kaiju_stomp' ? 28 : 18;
      const dmg = (baseDmg / veh.bumpResist) * (0.5 + ord.offer.food.fragility) * shockMult;
      ord.integrity = Math.max(5, ord.integrity - dmg);
    }

    const label = hazard.kind === 'goose'
      ? 'GOOSE ATTACK!'
      : hazard.kind === 'recliner'
        ? 'RECLINER CRASH!'
        : hazard.kind === 'kaiju_stomp'
          ? 'SHOCKWAVE HIT!'
          : 'CRASH!';
    spawnCallout(state, state.player.s, state.player.laneX, 40, label, '#ff3b1f');
    return { ignored: false, kind: hazard.kind };
  }

  /** Step the Phase 2 simulation forward by dt seconds. */
  function stepRun(state, dt, controls) {
    const st = state || run;
    if (!st || st.finished) return st;
    const stepDt = Math.min(0.05, Math.max(0.001, dt));
    const ctrl = controls || FD.Input.readControls();
    const veh = getVehicle();
    const player = st.player;

    st.elapsed += stepDt;
    if (st.shakeTimer > 0) st.shakeTimer = Math.max(0, st.shakeTimer - stepDt);
    if (st.bannerTimer > 0) st.bannerTimer = Math.max(0, st.bannerTimer - stepDt);
    if (player.invulnTimer > 0) player.invulnTimer = Math.max(0, player.invulnTimer - stepDt);
    if (player.bumpTimer > 0) player.bumpTimer = Math.max(0, player.bumpTimer - stepDt);
    if (player.tossCooldown > 0) player.tossCooldown = Math.max(0, player.tossCooldown - stepDt);

    // Steering across road lanes (-1.25 to +1.25)
    if (ctrl.steer !== 0) {
      player.laneX = FD.Util.clamp(player.laneX + ctrl.steer * veh.steerSpeed * stepDt, -1.25, 1.25);
    }

    // Speed control (auto-scrolls at cruise speed, W/Up boosts, S/Down brakes)
    const cruise = veh.minSpeed + (veh.maxSpeed - veh.minSpeed) * 0.48;
    const targetSpeed = ctrl.throttle > 0 ? veh.maxSpeed : ctrl.throttle < 0 ? veh.minSpeed : cruise;
    const accelRate = veh.accel;
    if (player.speed < targetSpeed) {
      player.speed = Math.min(targetSpeed, player.speed + accelRate * stepDt);
    } else if (player.speed > targetSpeed) {
      player.speed = Math.max(targetSpeed, player.speed - accelRate * 1.15 * stepDt);
    }
    player.s += player.speed * stepDt;

    // Thermal decay for all carried bags
    const thermalMult = getThermalMultiplier();
    for (let i = 0; i < st.activeBags.length; i++) {
      const ord = st.orders[st.activeBags[i]];
      if (!ord || !ord.offer) continue;
      const rate = ord.offer.food.decayRate * 3.8 * thermalMult;
      ord.thermal = Math.max(0, ord.thermal - rate * stepDt);
    }

    if (ctrl.action) triggerAction(st);

    // Update entities & check missed pickups
    FD.Entities.updateEntities(st, stepDt);

    for (let i = 0; i < st.stops.length; i++) {
      const stop = st.stops[i];
      if (!stop.completed && !stop.missed && player.s > stop.s + 85) {
        if (stop.kind === 'PICKUP') {
          handleMissedPickup(st, stop);
        } else if (stop.kind === 'DROPOFF' && st.activeBags.indexOf(stop.orderId) !== -1) {
          // Passed house without tossing -> leftover bag spoils
          stop.completed = true;
          const bIdx = st.activeBags.indexOf(stop.orderId);
          if (bIdx !== -1) st.activeBags.splice(bIdx, 1);
          const ord = st.orders[stop.orderId];
          if (ord) {
            ord.status = 'ruined';
            ord.ratingAwarded = 1.0;
            ord.outcomeLabel = 'NEVER DELIVERED — ATE IT IN CAR';
          }
          FD.Audio.sfx.ruined();
          spawnCallout(st, player.s, player.laneX, 40, 'DROPOFF MISSED! ★1.0', '#ef4444');
        }
      }
    }

    // Advance flying projectiles
    for (let i = st.projectiles.length - 1; i >= 0; i--) {
      const p = st.projectiles[i];
      p.age += stepDt;
      if (p.age >= p.dur && !p.resolved) {
        resolveTossLanding(st, p);
        st.projectiles.splice(i, 1);
      }
    }

    // Collisions with road hazards
    for (let i = 0; i < st.hazards.length; i++) {
      const h = st.hazards[i];
      if (h.hit) continue;
      if (Math.abs(h.s - player.s) <= (h.radiusS || 34) && Math.abs(h.laneX - player.laneX) <= (h.radiusLane || 0.36)) {
        applyHazardImpact(st, h);
      }
    }

    // Collisions with stomped Kaiju shockwaves
    for (let i = 0; i < st.kaijuStomps.length; i++) {
      const ks = st.kaijuStomps[i];
      if (ks.state === 'stomped' && !ks.hit && ks.timer < 0.75) {
        const ds = Math.abs(ks.s - player.s) / 140;
        const dl = Math.abs(ks.laneX - player.laneX);
        const dist = Math.hypot(ds, dl);
        if (Math.abs(dist - ks.shockRadius) < 0.32) {
          applyHazardImpact(st, ks);
        }
      }
    }

    // Advance floating callouts & particles
    for (let i = st.callouts.length - 1; i >= 0; i--) {
      const c = st.callouts[i];
      c.age += stepDt;
      c.z += 28 * stepDt;
      if (c.age >= c.dur) st.callouts.splice(i, 1);
    }
    for (let i = st.particles.length - 1; i >= 0; i--) {
      const pt = st.particles[i];
      pt.age += stepDt;
      pt.s += pt.vs * stepDt;
      pt.laneX += pt.vl * stepDt;
      pt.z += pt.vz * stepDt;
      pt.vz -= 190 * stepDt;
      if (pt.age >= pt.dur || pt.z < 0) st.particles.splice(i, 1);
    }

    // Check end of corridor (and ensure any airborne projectiles settle)
    const allStopsDone = st.stops.every(function (s) { return s.completed || s.missed; });
    if ((player.s >= st.totalLength || allStopsDone) && st.projectiles.length === 0) {
      if (player.s >= st.totalLength - 40 || allStopsDone) {
        st.finished = true;
      }
    }

    return st;
  }

  /** Compute itemized end-of-shift parody receipt and update career bankroll/rating. */
  function buildShiftReceipt(state) {
    const st = state || run;
    const orderKeys = Object.keys(st.orders);
    let grossBasePay = 0;
    let tipsEarned = 0;
    let bullseyeBonuses = 0;
    let deliveredCount = 0;
    let ratingSum = 0;
    let ratingCount = 0;
    const lineItems = [];

    for (let i = 0; i < orderKeys.length; i++) {
      const ord = st.orders[orderKeys[i]];
      if (ord.status === 'delivered') deliveredCount++;
      grossBasePay += ord.baseEarned;
      tipsEarned += ord.tipEarned;
      bullseyeBonuses += ord.bullseyeBonus;
      const r = ord.ratingAwarded != null ? ord.ratingAwarded : 3.0;
      ratingSum += r;
      ratingCount++;
      lineItems.push({
        orderId: ord.id,
        restaurant: ord.offer ? ord.offer.restaurantName : 'Restaurant',
        customer: ord.offer ? ord.offer.customerName : 'Customer',
        status: ord.status,
        outcomeLabel: ord.outcomeLabel,
        earned: FD.Util.round2(ord.baseEarned + ord.tipEarned + ord.bullseyeBonus),
        rating: r
      });
    }

    grossBasePay = FD.Util.round2(grossBasePay);
    tipsEarned = FD.Util.round2(tipsEarned);
    bullseyeBonuses = FD.Util.round2(bullseyeBonuses);
    const grossTotal = FD.Util.round2(grossBasePay + tipsEarned + bullseyeBonuses);

    let algorithmFee = grossTotal > 0 ? FD.Util.round2(grossBasePay * 0.08) : 0;
    let bagDepreciation = grossTotal > 0 ? 0.75 : 0;
    let convenienceFee = grossTotal > 0 ? 0.99 : 0;
    const rawFees = FD.Util.round2(algorithmFee + bagDepreciation + convenienceFee);

    // Cap fees so profitable shifts always net at least 65% of grossTotal
    const maxFees = FD.Util.round2(grossTotal * 0.35);
    if (rawFees > maxFees && rawFees > 0) {
      const scale = maxFees / rawFees;
      algorithmFee = FD.Util.round2(algorithmFee * scale);
      bagDepreciation = FD.Util.round2(bagDepreciation * scale);
      convenienceFee = FD.Util.round2(maxFees - algorithmFee - bagDepreciation);
    }

    const totalFees = FD.Util.round2(algorithmFee + bagDepreciation + convenienceFee);
    const netShiftEarnings = Math.max(0, FD.Util.round2(grossTotal - totalFees));
    const shiftAvgRating = ratingCount > 0 ? FD.Util.round2(ratingSum / ratingCount) : career.rating;

    return {
      shiftNum: st.shiftNum,
      deliveredCount: deliveredCount,
      totalOrders: orderKeys.length,
      grossBasePay: grossBasePay,
      tipsEarned: tipsEarned,
      bullseyeBonuses: bullseyeBonuses,
      grossTotal: grossTotal,
      algorithmFee: algorithmFee,
      bagDepreciation: bagDepreciation,
      convenienceFee: convenienceFee,
      totalFees: totalFees,
      netShiftEarnings: netShiftEarnings,
      shiftAvgRating: shiftAvgRating,
      lineItems: lineItems
    };
  }

  /** Commit a completed shift receipt to career state and return deactivation flag. */
  function commitShiftReceipt(receipt) {
    career.bankroll = FD.Util.round2(career.bankroll + receipt.netShiftEarnings);
    career.totalDeliveries += receipt.deliveredCount;
    career.shiftsCompleted += 1;

    // Weighted rolling rating: 45% prior rating + 55% latest shift performance
    const nextRating = FD.Util.round2(
      FD.Util.clamp(career.rating * 0.45 + receipt.shiftAvgRating * 0.55, 1.0, 5.0)
    );
    career.rating = nextRating;
    career.peakRating = Math.max(career.peakRating, nextRating);
    const netDollars = Math.round(career.bankroll);
    if (netDollars > career.bestNetScore) career.bestNetScore = netDollars;

    const deactivated = career.rating < FD.CONFIG.DEACTIVATION_RATING;
    if (!deactivated) {
      career.shiftNum += 1;
    }
    saveCareer(career);
    return {
      career: career,
      deactivated: deactivated
    };
  }

  function finishShift() {
    if (!run) return null;
    stopLoop();
    FD.Audio.stopMusic();
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('playing');
    }
    const receipt = buildShiftReceipt(run);
    const outcome = commitShiftReceipt(receipt);
    if (outcome.deactivated) {
      mode = 'over';
      FD.Audio.sfx.deactivated();
      if (callbacks.onDeactivated) callbacks.onDeactivated(receipt, career);
    } else {
      mode = 'receipt';
      FD.Audio.sfx.cash();
      if (callbacks.onShiftComplete) callbacks.onShiftComplete(receipt, career);
    }
    if (callbacks.onModeChange) callbacks.onModeChange(mode);
    return { receipt: receipt, outcome: outcome };
  }

  function buyOrEquipVehicle(vehicleId) {
    const v = FD.VEHICLES[vehicleId];
    if (!v) return { ok: false, reason: 'Unknown vehicle.' };
    if (career.ownedVehicles.indexOf(vehicleId) !== -1) {
      career.equippedVehicle = vehicleId;
      saveCareer(career);
      return { ok: true, equipped: vehicleId };
    }
    if (career.bankroll < v.cost) {
      return { ok: false, reason: 'Need ' + FD.Util.fmtMoney(v.cost - career.bankroll) + ' more!' };
    }
    career.bankroll = FD.Util.round2(career.bankroll - v.cost);
    career.ownedVehicles.push(vehicleId);
    career.equippedVehicle = vehicleId;
    saveCareer(career);
    return { ok: true, purchased: vehicleId };
  }

  function buyUpgrade(upgradeId) {
    const up = FD.UPGRADES[upgradeId];
    if (!up) return { ok: false, reason: 'Unknown upgrade.' };
    const lv = career.upgrades[upgradeId] || 0;
    if (lv >= up.maxLevel) return { ok: false, reason: 'Already maxed out!' };
    const cost = up.costs[lv];
    if (career.bankroll < cost) {
      return { ok: false, reason: 'Need ' + FD.Util.fmtMoney(cost - career.bankroll) + ' more!' };
    }
    career.bankroll = FD.Util.round2(career.bankroll - cost);
    career.upgrades[upgradeId] = lv + 1;
    saveCareer(career);
    return { ok: true, level: lv + 1 };
  }

  function frame(ts) {
    if (mode !== 'play') {
      rafId = 0;
      return;
    }
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000));
    lastTs = ts;

    stepRun(run, dt);
    if (FD.Render && FD.Render.drawScene) {
      FD.Render.drawScene(run, getContextAction(run), career);
    }
    if (callbacks.onHudUpdate) callbacks.onHudUpdate(run, getContextAction(run), career);

    if (run && run.finished) {
      finishShift();
      return;
    }
    rafId = requestAnimationFrame(frame);
  }

  function startLoop() {
    if (typeof requestAnimationFrame !== 'function') return;
    stopLoop();
    lastTs = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (rafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId);
    }
    rafId = 0;
  }

  function pause() {
    if (mode !== 'play') return false;
    mode = 'pause';
    stopLoop();
    FD.Audio.stopMusic();
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('playing');
    }
    if (callbacks.onModeChange) callbacks.onModeChange(mode);
    return true;
  }

  function resume() {
    if (mode !== 'pause') return false;
    mode = 'play';
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.add('playing');
    }
    FD.Audio.startMusic(function () { return career.shiftNum; });
    if (callbacks.onModeChange) callbacks.onModeChange(mode);
    startLoop();
    return true;
  }

  function quitToMenu() {
    stopLoop();
    FD.Audio.stopMusic();
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('playing');
    }
    run = null;
    mode = 'menu';
    if (callbacks.onModeChange) callbacks.onModeChange(mode);
  }

  function setCallbacks(cbs) {
    for (const k in cbs) {
      if (k in callbacks) callbacks[k] = cbs[k];
    }
  }

  FD.Game = {
    getCareer: function () { return career; },
    getMode: function () { return mode; },
    setMode: function (m) { mode = m; },
    getDispatch: function () { return dispatchState; },
    getRun: function () { return run; },
    getVehicle: getVehicle,
    getThermalMultiplier: getThermalMultiplier,
    getShockMultiplier: getShockMultiplier,
    getMatMultiplier: getMatMultiplier,
    setCallbacks: setCallbacks,
    resetCareer: resetCareer,
    startNewCareerRun: startNewCareerRun,
    prepareDispatch: prepareDispatch,
    toggleOffer: toggleOffer,
    moveQueueStop: moveQueueStop,
    swapQueueStops: swapQueueStops,
    smartSortDispatch: smartSortDispatch,
    createRunState: createRunState,
    startShift: startShift,
    stepRun: stepRun,
    getContextAction: getContextAction,
    triggerAction: triggerAction,
    resolveTossLanding: resolveTossLanding,
    handleMissedPickup: handleMissedPickup,
    applyHazardImpact: applyHazardImpact,
    buildShiftReceipt: buildShiftReceipt,
    commitShiftReceipt: commitShiftReceipt,
    finishShift: finishShift,
    buyOrEquipVehicle: buyOrEquipVehicle,
    buyUpgrade: buyUpgrade,
    pause: pause,
    resume: resume,
    quitToMenu: quitToMenu
  };
})(typeof window !== 'undefined' ? window : globalThis);
