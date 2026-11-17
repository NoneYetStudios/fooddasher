/* Food Dasher — Phase 2 traffic, road hazards, yard obstacles & STF Arcade cameos. */
(function (root) {
  'use strict';
  const FD = (root.FD = root.FD || {});

  /** Spawn traffic, potholes, yard obstacles, and STF Arcade cameos along the corridor. */
  function spawnShiftEntities(corridor, shiftNum, seed) {
    const U = FD.Util;
    const rng = U.createRng(seed != null ? seed : (shiftNum * 4219 + 77));
    const hazards = [];
    const yardProps = [];
    const kaijuStomps = [];
    const stops = corridor.stops || [];
    const totalLen = corridor.totalLength || 1800;

    // 1. Yard props & hazards around every customer DROPOFF house.
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      if (stop.kind !== 'DROPOFF') continue;
      const sideSign = stop.side === 'left' ? -1 : 1;
      const offer = stop.offer;
      const hazardType = offer && offer.yardHazard ? offer.yardHazard : 'sprinklers';

      // Porch bush or puddle flanking the welcome mat
      yardProps.push({
        id: 'bush_' + stop.uid,
        kind: rng() < 0.5 ? 'bush' : 'puddle',
        s: stop.s - 56,
        laneX: sideSign * 1.68,
        radius: 0.36
      });

      // Order-specific yard hazard slightly past or beside the mat
      yardProps.push({
        id: 'yh_' + stop.uid,
        kind: hazardType, // 'goose' | 'sprinklers' | 'dog' | 'angry_customer'
        s: stop.s + 54,
        baseS: stop.s + 54,
        laneX: sideSign * 1.72,
        baseLaneX: sideSign * 1.72,
        radius: 0.38,
        phase: rng() * Math.PI * 2,
        active: true
      });
    }

    // 2. Road traffic, potholes, lawnmowers, and STF Arcade cameos between stops.
    const stepDist = Math.max(150, 260 - shiftNum * 18);
    let idx = 0;
    for (let s = 300; s < totalLen - 180; s += stepDist) {
      // Keep immediate pickup/dropoff curb zones clear of heavy traffic cars.
      const nearStop = stops.some(function (st) { return Math.abs(st.s - s) < 75; });
      const roll = rng();
      idx++;

      if (nearStop) {
        // Place an occasional pothole away from the stop's curb lane
        if (roll < 0.45) {
          hazards.push({
            id: 'pot_' + idx,
            kind: 'pothole',
            s: s,
            laneX: (rng() < 0.5 ? -0.35 : 0.35),
            vx: 0,
            vs: 0,
            radiusLane: 0.36,
            radiusS: 30,
            hit: false
          });
        }
        continue;
      }

      if (roll < 0.24) {
        hazards.push({
          id: 'pot_' + idx,
          kind: 'pothole',
          s: s,
          laneX: -0.75 + rng() * 1.5,
          vx: 0,
          vs: 0,
          radiusLane: 0.38,
          radiusS: 32,
          hit: false
        });
      } else if (roll < 0.46) {
        const lane = rng() < 0.5 ? -0.55 : 0.55;
        hazards.push({
          id: 'car_' + idx,
          kind: 'car',
          s: s,
          laneX: lane,
          vx: 0,
          vs: lane < 0 ? -95 : 85,
          radiusLane: 0.42,
          radiusS: 48,
          color: ['#60a5fa', '#f87171', '#facc15', '#cbd5e1'][idx % 4],
          hit: false
        });
      } else if (roll < 0.60) {
        const sideSign = rng() < 0.5 ? -1 : 1;
        hazards.push({
          id: 'suv_' + idx,
          kind: 'reversing_suv',
          s: s,
          laneX: sideSign * 1.45,
          targetLaneX: sideSign * 0.65,
          sideSign: sideSign,
          vx: 0,
          vs: 0,
          radiusLane: 0.44,
          radiusS: 48,
          triggered: false,
          hit: false
        });
      } else if (roll < 0.72) {
        hazards.push({
          id: 'rival_' + idx,
          kind: 'rival_dasher',
          s: s,
          laneX: 0,
          baseLaneX: (rng() < 0.5 ? -0.45 : 0.45),
          phase: rng() * Math.PI * 2,
          vs: 145,
          radiusLane: 0.34,
          radiusS: 36,
          hit: false
        });
      } else if (roll < 0.82) {
        const sideSign = rng() < 0.5 ? -1 : 1;
        hazards.push({
          id: 'mower_' + idx,
          kind: 'lawnmower',
          s: s,
          laneX: sideSign * 1.12,
          baseLaneX: sideSign * 1.15,
          phase: rng() * Math.PI * 2,
          vs: 0,
          radiusLane: 0.34,
          radiusS: 34,
          hit: false
        });
      } else if (roll < 0.92) {
        // STF Arcade Cameo #1: Cul-de-sac Goose (from Parking Lot)
        hazards.push({
          id: 'goose_' + idx,
          kind: 'goose',
          s: s,
          laneX: (rng() < 0.5 ? -0.8 : 0.8),
          baseLaneX: 0,
          phase: rng() * Math.PI * 2,
          vs: 0,
          radiusLane: 0.35,
          radiusS: 34,
          honked: false,
          hit: false
        });
      } else {
        // STF Arcade Cameo #2: Runaway Motorized Recliner (from World's Worst Driver)
        hazards.push({
          id: 'recliner_' + idx,
          kind: 'recliner',
          s: s,
          laneX: (rng() < 0.5 ? -0.22 : 0.22),
          vs: -155,
          phase: 0,
          radiusLane: 0.38,
          radiusS: 40,
          hit: false
        });
      }
    }

    // Ensure at least one STF Recliner & Goose cameo appear on Shift 1+
    if (!hazards.some(function (h) { return h.kind === 'goose'; })) {
      hazards.push({
        id: 'goose_cameo',
        kind: 'goose',
        s: Math.min(totalLen - 220, 660),
        laneX: -0.75,
        baseLaneX: -0.45,
        phase: 0,
        vs: 0,
        radiusLane: 0.35,
        radiusS: 34,
        honked: false,
        hit: false
      });
    }
    if (!hazards.some(function (h) { return h.kind === 'recliner'; })) {
      hazards.push({
        id: 'recliner_cameo',
        kind: 'recliner',
        s: Math.min(totalLen - 180, 940),
        laneX: 0.15,
        vs: -145,
        phase: 0,
        radiusLane: 0.38,
        radiusS: 40,
        hit: false
      });
    }

    // 3. STF Arcade Cameo #3: Late-shift Kaiju Stomp Shockwaves (from Kaiju Brawl)
    if (shiftNum >= 2) {
      const stompCount = Math.min(3, shiftNum - 1);
      for (let k = 0; k < stompCount; k++) {
        const triggerS = Math.round(totalLen * (0.45 + k * 0.22));
        kaijuStomps.push({
          id: 'kaiju_' + k,
          kind: 'kaiju_stomp',
          s: triggerS + 230,
          triggerS: triggerS,
          laneX: k % 2 === 0 ? -0.25 : 0.35,
          state: 'pending', // 'pending' | 'telegraph' | 'stomped'
          timer: 0,
          telegraphDur: 0.85,
          shockRadius: 0,
          hit: false
        });
      }
    }

    return {
      hazards: hazards,
      yardProps: yardProps,
      kaijuStomps: kaijuStomps
    };
  }

  /** Advance active traffic, yard guards, and kaiju stomp timers. */
  function updateEntities(state, dt) {
    const player = state.player;
    const hazards = state.hazards || [];
    const yardProps = state.yardProps || [];
    const stomps = state.kaijuStomps || [];
    const t = state.elapsed || 0;

    for (let i = 0; i < hazards.length; i++) {
      const h = hazards[i];
      const rel = h.s - player.s;
      if (rel < -260 || rel > 1100) continue;

      if (h.kind === 'car' || h.kind === 'recliner') {
        h.s += (h.vs || 0) * dt;
        h.phase = (h.phase || 0) + dt * 10;
      } else if (h.kind === 'rival_dasher') {
        h.s += (h.vs || 140) * dt;
        h.laneX = h.baseLaneX + Math.sin(t * 2.8 + h.phase) * 0.42;
      } else if (h.kind === 'reversing_suv') {
        if (!h.triggered && rel < 330) h.triggered = true;
        if (h.triggered) {
          h.laneX += (h.targetLaneX - h.laneX) * Math.min(1, dt * 2.6);
        }
      } else if (h.kind === 'lawnmower') {
        h.laneX = h.baseLaneX + Math.sin(t * 2.2 + h.phase) * 0.32;
      } else if (h.kind === 'goose') {
        h.laneX = (h.baseLaneX || 0) + Math.sin(t * 3.1 + h.phase) * 0.65;
        if (!h.honked && rel < 220 && rel > -20) {
          h.honked = true;
          if (state.onEvent) state.onEvent('honk', h);
        }
      }
    }

    for (let i = 0; i < yardProps.length; i++) {
      const yp = yardProps[i];
      if (yp.kind === 'goose' || yp.kind === 'dog') {
        yp.s = yp.baseS + Math.sin(t * 3.2 + yp.phase) * 26;
        yp.laneX = yp.baseLaneX + Math.cos(t * 2.6 + yp.phase) * 0.14;
      }
    }

    for (let i = 0; i < stomps.length; i++) {
      const st = stomps[i];
      if (st.state === 'pending' && player.s >= st.triggerS) {
        st.state = 'telegraph';
        st.timer = 0;
        if (state.onEvent) state.onEvent('kaiju_warn', st);
      } else if (st.state === 'telegraph') {
        st.timer += dt;
        if (st.timer >= st.telegraphDur) {
          st.state = 'stomped';
          st.timer = 0;
          st.shockRadius = 0.1;
          if (state.onEvent) state.onEvent('kaiju_stomp', st);
        }
      } else if (st.state === 'stomped') {
        st.timer += dt;
        st.shockRadius = Math.min(2.2, st.shockRadius + dt * 2.4);
      }
    }
  }

  FD.Entities = {
    spawnShiftEntities: spawnShiftEntities,
    updateEntities: updateEntities
  };
})(typeof window !== 'undefined' ? window : globalThis);
