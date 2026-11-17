/* Food Dasher — deterministic PRNG, math, formatting & route queue helpers. */
(function (root) {
  'use strict';
  const FD = (root.FD = root.FD || {});

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function fmtMoney(n) {
    const val = Number(n) || 0;
    const sign = val < 0 ? '-' : '';
    return sign + '$' + Math.abs(val).toFixed(2);
  }

  function fmtRating(n) {
    return '★ ' + clamp(Number(n) || 0, 1.0, 5.0).toFixed(2);
  }

  function createRng(seed) {
    let s = (Number(seed) || 1337) >>> 0;
    if (s === 0) s = 0x6d2b79f5;
    return function next() {
      s += 0x6d2b79f5;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cleanName(s) {
    return String(s || '')
      .replace(/[^A-Za-z0-9 _.\-!?]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 12);
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /** Verify every order in queue has exactly one PICKUP before its matching DROPOFF. */
  function validateRouteOrder(queue) {
    if (!Array.isArray(queue)) {
      return { ok: false, reason: 'Queue must be an array.' };
    }
    const seen = Object.create(null);
    for (let i = 0; i < queue.length; i++) {
      const stop = queue[i];
      if (!stop || !stop.orderId || (stop.kind !== 'PICKUP' && stop.kind !== 'DROPOFF')) {
        return { ok: false, reason: 'Invalid waypoint in queue.' };
      }
      const rec = seen[stop.orderId] || { pickup: -1, dropoff: -1 };
      if (stop.kind === 'PICKUP') {
        if (rec.pickup !== -1) return { ok: false, reason: 'Duplicate pickup for order ' + stop.orderId };
        rec.pickup = i;
      } else {
        if (rec.dropoff !== -1) return { ok: false, reason: 'Duplicate dropoff for order ' + stop.orderId };
        if (rec.pickup === -1) {
          return { ok: false, reason: 'Pickup must precede its matching Dropoff!' };
        }
        rec.dropoff = i;
      }
      seen[stop.orderId] = rec;
    }
    const keys = Object.keys(seen);
    for (let i = 0; i < keys.length; i++) {
      const rec = seen[keys[i]];
      if (rec.pickup === -1 || rec.dropoff === -1 || rec.pickup >= rec.dropoff) {
        return { ok: false, reason: 'Pickup must precede its matching Dropoff!' };
      }
    }
    return { ok: true, reason: '' };
  }

  /** Move stop at index by delta (-1 or +1) while enforcing Pickup < Dropoff. */
  function moveStopInQueue(queue, index, delta) {
    if (!Array.isArray(queue) || index < 0 || index >= queue.length) {
      return { ok: false, queue: queue, reason: 'Invalid stop index.' };
    }
    const target = index + delta;
    if (target < 0 || target >= queue.length) {
      return { ok: false, queue: queue, reason: 'Already at queue boundary.' };
    }
    const next = queue.slice();
    const tmp = next[index];
    next[index] = next[target];
    next[target] = tmp;
    const check = validateRouteOrder(next);
    if (!check.ok) {
      return { ok: false, queue: queue, reason: check.reason };
    }
    return { ok: true, queue: next, reason: '' };
  }

  /** Swap two stops at idxA and idxB while enforcing Pickup < Dropoff. */
  function swapStopsInQueue(queue, idxA, idxB) {
    if (!Array.isArray(queue) || idxA < 0 || idxB < 0 || idxA >= queue.length || idxB >= queue.length) {
      return { ok: false, queue: queue, reason: 'Invalid swap indices.' };
    }
    if (idxA === idxB) {
      return { ok: true, queue: queue.slice(), reason: '' };
    }
    const next = queue.slice();
    const tmp = next[idxA];
    next[idxA] = next[idxB];
    next[idxB] = tmp;
    const check = validateRouteOrder(next);
    if (!check.ok) {
      return { ok: false, queue: queue, reason: check.reason };
    }
    return { ok: true, queue: next, reason: '' };
  }

  FD.Util = {
    clamp: clamp,
    lerp: lerp,
    round2: round2,
    fmtMoney: fmtMoney,
    fmtRating: fmtRating,
    createRng: createRng,
    cleanName: cleanName,
    escHtml: escHtml,
    validateRouteOrder: validateRouteOrder,
    moveStopInQueue: moveStopInQueue,
    swapStopsInQueue: swapStopsInQueue
  };
})(typeof window !== 'undefined' ? window : globalThis);
