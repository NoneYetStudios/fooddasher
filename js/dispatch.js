/* Food Dasher — Phase 1 Dispatch & Route Planner (offers, bait orders, route queue, Smart Sort). */
(function (root) {
  'use strict';
  const FD = (root.FD = root.FD || {});

  const LETTERS = ['A', 'B', 'C', 'D', 'E'];

  function pickFoodKeys(shiftNum, count, baitIdx, baitFood, rng) {
    const all = ['burrito', 'soup', 'ice_cream', 'pizza'];
    const picked = new Array(count);
    picked[baitIdx] = baitFood;
    const remaining = all.filter(function (k) { return k !== baitFood; });
    let rIdx = (shiftNum - 1) % remaining.length;
    const orderedRest = [];
    for (let i = 0; i < remaining.length; i++) {
      orderedRest.push(remaining[(rIdx + i) % remaining.length]);
    }
    let fillPtr = 0;
    for (let i = 0; i < count; i++) {
      if (i === baitIdx) continue;
      if (fillPtr < orderedRest.length) {
        picked[i] = orderedRest[fillPtr++];
      } else {
        picked[i] = all[Math.floor(rng() * all.length)];
      }
    }
    return picked;
  }

  /** Generate 3–5 gig offers for a shift, including a classic NO-TIP bait offer. */
  function generateShiftOffers(shiftNum, seed) {
    const U = FD.Util;
    const rng = U.createRng(seed != null ? seed : (shiftNum * 9973 + Date.now()));
    const count = Math.min(5, 2 + Math.max(1, shiftNum));
    const baitIdx = Math.min(count - 1, Math.max(1, Math.floor(rng() * count)));
    const baitFood = rng() < 0.5 ? 'ice_cream' : 'soup';
    const foodKeys = pickFoodKeys(shiftNum, count, baitIdx, baitFood, rng);
    const noteKeys = Object.keys(FD.HAZARD_NOTES);

    const REST_ZONES = [
      [0.20, 0.22],
      [0.72, 0.20],
      [0.24, 0.56],
      [0.78, 0.54],
      [0.48, 0.24]
    ];
    const CUST_ZONES = [
      [0.44, 0.78],
      [0.80, 0.80],
      [0.18, 0.80],
      [0.54, 0.48],
      [0.74, 0.36]
    ];

    const offers = [];
    for (let i = 0; i < count; i++) {
      const id = LETTERS[i] || String(i + 1);
      const isBait = i === baitIdx;
      const foodKey = foodKeys[i];
      const food = FD.FOOD_TYPES[foodKey];
      const noteObj = isBait
        ? FD.HAZARD_NOTES.goose
        : FD.HAZARD_NOTES[noteKeys[(i + shiftNum) % noteKeys.length]];

      const restPool = FD.RESTAURANTS.filter(function (r) { return r.food === foodKey; });
      const rest = restPool[Math.floor(rng() * restPool.length)] || FD.RESTAURANTS[i % FD.RESTAURANTS.length];
      const cust = FD.CUSTOMERS[(i * 3 + shiftNum) % FD.CUSTOMERS.length];

      const basePay = isBait ? 2.25 : U.round2(3.50 + shiftNum * 0.35 + rng() * 2.40);
      const estimatedTip = isBait
        ? 0.00
        : U.round2(2.50 + (food.decayRate > 1.5 ? 2.40 : 1.10) + shiftNum * 0.45 + rng() * 3.80);
      const itemCount = isBait ? 12 : Math.floor(1 + rng() * 4);
      const rz = REST_ZONES[i % REST_ZONES.length];
      const cz = CUST_ZONES[i % CUST_ZONES.length];

      offers.push({
        id: id,
        color: FD.ORDER_COLORS[i % FD.ORDER_COLORS.length],
        restaurantName: rest.name,
        customerName: cust.name,
        address: cust.street,
        foodType: foodKey,
        food: food,
        basePay: basePay,
        estimatedTip: estimatedTip,
        isBait: isBait,
        itemCount: itemCount,
        note: isBait ? 'NO TIP — 12 ITEMS / BEWARE OF GOOSE' : noteObj.note,
        hazardTag: noteObj.hazardTag,
        yardHazard: noteObj.yardHazard,
        pickupSide: rng() < 0.5 ? 'left' : 'right',
        dropoffSide: rng() < 0.5 ? 'right' : 'left',
        // Normalized 0..1 mini-map coordinates spread across quadrants
        rx: U.clamp(rz[0] + (rng() - 0.5) * 0.08, 0.12, 0.88),
        ry: U.clamp(rz[1] + (rng() - 0.5) * 0.08, 0.14, 0.86),
        cx: U.clamp(cz[0] + (rng() - 0.5) * 0.08, 0.12, 0.88),
        cy: U.clamp(cz[1] + (rng() - 0.5) * 0.08, 0.14, 0.86)
      });
    }
    return offers;
  }

  /** Build initial route queue from selected order IDs (defaults to first 2 non-bait offers). */
  function buildQueueFromOffers(offers, selectedIds) {
    const queue = [];
    const wanted = selectedIds || offers.filter(function (o) { return !o.isBait; }).slice(0, 2).map(function (o) { return o.id; });
    if (wanted.length === 0 && offers.length > 0) wanted.push(offers[0].id);

    for (let i = 0; i < offers.length; i++) {
      const o = offers[i];
      if (wanted.indexOf(o.id) === -1) continue;
      queue.push({
        uid: o.id + '_P',
        orderId: o.id,
        kind: 'PICKUP',
        label: o.restaurantName,
        side: o.pickupSide,
        color: o.color,
        foodType: o.foodType
      });
    }
    for (let i = 0; i < offers.length; i++) {
      const o = offers[i];
      if (wanted.indexOf(o.id) === -1) continue;
      queue.push({
        uid: o.id + '_D',
        orderId: o.id,
        kind: 'DROPOFF',
        label: o.customerName + ' (' + o.address + ')',
        side: o.dropoffSide,
        color: o.color,
        foodType: o.foodType
      });
    }
    return queue;
  }

  /** Toggle an order's PICKUP + DROPOFF pair inside an existing route queue. */
  function toggleOfferInQueue(queue, offer) {
    const exists = queue.some(function (s) { return s.orderId === offer.id; });
    if (exists) {
      return queue.filter(function (s) { return s.orderId !== offer.id; });
    }
    const next = queue.slice();
    next.push({
      uid: offer.id + '_P',
      orderId: offer.id,
      kind: 'PICKUP',
      label: offer.restaurantName,
      side: offer.pickupSide,
      color: offer.color,
      foodType: offer.foodType
    });
    next.push({
      uid: offer.id + '_D',
      orderId: offer.id,
      kind: 'DROPOFF',
      label: offer.customerName + ' (' + offer.address + ')',
      side: offer.dropoffSide,
      color: offer.color,
      foodType: offer.foodType
    });
    return next;
  }

  /**
   * Smart Sort: prioritizes fast-decay / high-value orders with tight pickup->dropoff
   * pairing while grouping nearby pickups where beneficial. Always guarantees Pickup < Dropoff.
   */
  function smartSortQueue(queue, offersById) {
    const orderIds = [];
    for (let i = 0; i < queue.length; i++) {
      if (orderIds.indexOf(queue[i].orderId) === -1) orderIds.push(queue[i].orderId);
    }
    if (orderIds.length <= 1) return queue.slice();

    // Sort orders: fast-decay / fragile foods go cleanly back-to-back after sturdy pickups.
    orderIds.sort(function (a, b) {
      const oa = offersById[a];
      const ob = offersById[b];
      if (!oa || !ob) return 0;
      const scoreA = oa.food.decayRate * 2 + oa.food.fragility * 1.5 - (oa.basePay + oa.estimatedTip) * 0.05;
      const scoreB = ob.food.decayRate * 2 + ob.food.fragility * 1.5 - (ob.basePay + ob.estimatedTip) * 0.05;
      return scoreA - scoreB;
    });

    const pickups = Object.create(null);
    const dropoffs = Object.create(null);
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].kind === 'PICKUP') pickups[queue[i].orderId] = queue[i];
      else dropoffs[queue[i].orderId] = queue[i];
    }

    const sorted = [];
    // Interleave sturdy orders first (2 pickups then their dropoffs), then immediate pickup->dropoff for rapid-melt orders.
    const batch = [];
    for (let i = 0; i < orderIds.length; i++) {
      const oid = orderIds[i];
      const o = offersById[oid];
      if (o && o.food.decayRate >= 1.5) {
        if (pickups[oid]) sorted.push(pickups[oid]);
        if (dropoffs[oid]) sorted.push(dropoffs[oid]);
      } else {
        batch.push(oid);
      }
    }
    // Insert batched sturdy pickups before fast-decay chain if any, or interleave neatly.
    const sturdyPart = [];
    for (let i = 0; i < batch.length; i++) {
      if (pickups[batch[i]]) sturdyPart.push(pickups[batch[i]]);
    }
    for (let i = 0; i < batch.length; i++) {
      if (dropoffs[batch[i]]) sturdyPart.push(dropoffs[batch[i]]);
    }
    return sturdyPart.concat(sorted);
  }

  /**
   * Build the Phase 2 continuous isometric street corridor from the planned queue.
   * Creates stops spaced along s plus sweeping 90° turns and cul-de-sac loops.
   */
  function buildCorridorFromQueue(queue, offersById, shiftNum) {
    const STOP_SPACING = 520;
    const LEAD_IN = 420;
    const TAIL_OUT = 360;
    const stops = [];
    const segments = [];

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      const offer = offersById[item.orderId];
      const s = LEAD_IN + i * STOP_SPACING;
      stops.push({
        uid: item.uid,
        orderId: item.orderId,
        kind: item.kind,
        label: item.label,
        side: item.side,
        color: item.color,
        foodType: item.foodType,
        offer: offer || null,
        s: s,
        completed: false,
        missed: false,
        isRetry: false
      });

      // Add a sweeping 90° turn or cul-de-sac U-turn loop between stops.
      if (i < queue.length - 1) {
        const segStart = s + 120;
        const segEnd = s + STOP_SPACING - 100;
        const mod = (i + shiftNum) % 3;
        if (mod === 0) {
          segments.push({ startS: segStart, endS: segEnd, kind: 'turn_right', kappa: 0.0024 });
        } else if (mod === 1) {
          segments.push({ startS: segStart, endS: segEnd, kind: 'turn_left', kappa: -0.0024 });
        } else {
          segments.push({ startS: segStart, endS: segEnd, kind: 'culdesac', kappa: 0.0042 });
        }
      }
    }

    const totalLength = LEAD_IN + Math.max(0, queue.length - 1) * STOP_SPACING + TAIL_OUT;
    return {
      stops: stops,
      segments: segments,
      totalLength: totalLength
    };
  }

  /** Compute non-overlapping pixel positions for all Pickup/Dropoff pins on the dispatch mini-map. */
  function resolveMapPins(offers, w, h) {
    const U = FD.Util;
    const pins = [];
    const byKey = Object.create(null);
    const padX = 36;
    const padY = 22;

    for (let i = 0; i < offers.length; i++) {
      const o = offers[i];
      const pPin = {
        key: o.id + '_PICKUP',
        orderId: o.id,
        kind: 'PICKUP',
        offer: o,
        x: U.clamp(o.rx * w, padX, w - padX),
        y: U.clamp(o.ry * h, padY, h - padY)
      };
      const dPin = {
        key: o.id + '_DROPOFF',
        orderId: o.id,
        kind: 'DROPOFF',
        offer: o,
        x: U.clamp(o.cx * w, padX, w - padX),
        y: U.clamp(o.cy * h, padY, h - padY)
      };
      pins.push(pPin, dPin);
      byKey[pPin.key] = pPin;
      byKey[dPin.key] = dPin;
    }

    const minX = 48;
    const minY = 28;
    for (let pass = 0; pass < 24; pass++) {
      let moved = false;
      for (let i = 0; i < pins.length; i++) {
        for (let j = i + 1; j < pins.length; j++) {
          const a = pins[i];
          const b = pins[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          if (Math.abs(dx) < minX && Math.abs(dy) < minY) {
            moved = true;
            const ox = minX - Math.abs(dx);
            const oy = minY - Math.abs(dy);
            if (ox < oy) {
              const sx = dx === 0 ? ((i + j) % 2 === 0 ? 1 : -1) : (dx > 0 ? 1 : -1);
              a.x -= sx * ox * 0.55;
              b.x += sx * ox * 0.55;
            } else {
              const sy = dy === 0 ? ((i + j) % 2 === 0 ? 1 : -1) : (dy > 0 ? 1 : -1);
              a.y -= sy * oy * 0.55;
              b.y += sy * oy * 0.55;
            }
            a.x = U.clamp(a.x, padX, w - padX);
            a.y = U.clamp(a.y, padY, h - padY);
            b.x = U.clamp(b.x, padX, w - padX);
            b.y = U.clamp(b.y, padY, h - padY);
          }
        }
      }
      if (!moved) break;
    }

    return { pins: pins, byKey: byKey };
  }

  /** Draw stylized Phase 1 Neighborhood Dispatch Mini-Map onto a canvas. */
  function drawDispatchMap(canvas, offers, queue) {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#14171d';
    ctx.fillRect(0, 0, w, h);

    // Street grid blocks
    ctx.strokeStyle = '#252b36';
    ctx.lineWidth = 1.5;
    for (let gx = 32; gx < w; gx += 48) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
    }
    for (let gy = 28; gy < h; gy += 44) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    }

    // Arterial roads
    ctx.strokeStyle = '#2f3746';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5);
    ctx.moveTo(w * 0.5, 0); ctx.lineTo(w * 0.5, h);
    ctx.stroke();

    const resolved = resolveMapPins(offers, w, h);
    const pinByKey = resolved.byKey;

    // Draw planned route polyline connecting queue stops
    const pts = [{ x: w * 0.1, y: h * 0.86, label: 'START', color: '#ffbe0b' }];
    for (let i = 0; i < queue.length; i++) {
      const q = queue[i];
      const pin = pinByKey[q.orderId + '_' + q.kind];
      if (!pin) continue;
      pts.push({ x: pin.x, y: pin.y, color: pin.offer.color, num: i + 1, kind: q.kind, orderId: q.orderId });
    }

    if (pts.length > 1) {
      ctx.save();
      ctx.strokeStyle = '#ffbe0b';
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.restore();
    }

    // Draw unqueued / queued offer pair connectors & pill pins
    for (let i = 0; i < offers.length; i++) {
      const o = offers[i];
      const inQueue = queue.some(function (q) { return q.orderId === o.id; });
      const pPin = pinByKey[o.id + '_PICKUP'];
      const dPin = pinByKey[o.id + '_DROPOFF'];
      if (!pPin || !dPin) continue;

      ctx.save();
      ctx.globalAlpha = inQueue ? 1.0 : 0.35;
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(pPin.x, pPin.y); ctx.lineTo(dPin.x, dPin.y); ctx.stroke();

      // Pickup pill (🍔 A)
      ctx.fillStyle = o.color;
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(pPin.x - 23, pPin.y - 11, 46, 22, 6);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#111';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🍔 ' + o.id, pPin.x, pPin.y + 0.5);

      // Dropoff pill (🏠 A)
      ctx.fillStyle = '#181c24';
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(dPin.x - 23, dPin.y - 11, 46, 22, 11);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fffbeb';
      ctx.fillText('🏠 ' + o.id, dPin.x, dPin.y + 0.5);
      ctx.restore();
    }

    // Queue step badges
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const bx = p.x + 23;
      const by = p.y - 11;
      ctx.fillStyle = '#ffbe0b';
      ctx.beginPath(); ctx.arc(bx, by, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(p.num), bx, by + 0.5);
    }

    // Start pin
    ctx.fillStyle = '#ffbe0b';
    ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffbe0b';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('START', pts[0].x + 11, pts[0].y + 3);
  }

  FD.Dispatch = {
    generateShiftOffers: generateShiftOffers,
    buildQueueFromOffers: buildQueueFromOffers,
    toggleOfferInQueue: toggleOfferInQueue,
    smartSortQueue: smartSortQueue,
    buildCorridorFromQueue: buildCorridorFromQueue,
    resolveMapPins: resolveMapPins,
    drawDispatchMap: drawDispatchMap
  };
})(typeof window !== 'undefined' ? window : globalThis);
