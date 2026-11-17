/* Food Dasher — procedural 2.5D isometric street, buildings, vehicles, cameos & GPS strip renderer. */
(function (root) {
  'use strict';
  const FD = (root.FD = root.FD || {});

  let canvasEl = null;
  let ctx = null;

  function setCanvas(cv) {
    canvasEl = cv;
    ctx = cv && cv.getContext ? cv.getContext('2d') : null;
  }

  function isoBox(c, camS, s, laneX, z, wS, wL, hZ, segments, colTop, colLeft, colRight, strokeCol) {
    const P = FD.Iso.project;
    const hs = wS * 0.5;
    const hl = wL * 0.5;
    // 4 base corners -> top corners
    const b0 = P(camS, s - hs, laneX - hl, z, segments);
    const b1 = P(camS, s + hs, laneX - hl, z, segments);
    const b2 = P(camS, s + hs, laneX + hl, z, segments);
    const b3 = P(camS, s - hs, laneX + hl, z, segments);

    const t0 = P(camS, s - hs, laneX - hl, z + hZ, segments);
    const t1 = P(camS, s + hs, laneX - hl, z + hZ, segments);
    const t2 = P(camS, s + hs, laneX + hl, z + hZ, segments);
    const t3 = P(camS, s - hs, laneX + hl, z + hZ, segments);

    c.lineJoin = 'round';
    c.strokeStyle = strokeCol || '#121318';
    c.lineWidth = 1.6;

    // Front-left face (b0 -> b3 -> t3 -> t0)
    c.fillStyle = colLeft;
    c.beginPath();
    c.moveTo(b0.x, b0.y); c.lineTo(b3.x, b3.y); c.lineTo(t3.x, t3.y); c.lineTo(t0.x, t0.y);
    c.closePath(); c.fill(); c.stroke();

    // Right face (b3 -> b2 -> t2 -> t3)
    c.fillStyle = colRight;
    c.beginPath();
    c.moveTo(b3.x, b3.y); c.lineTo(b2.x, b2.y); c.lineTo(t2.x, t2.y); c.lineTo(t3.x, t3.y);
    c.closePath(); c.fill(); c.stroke();

    // Roof / Top face (t0 -> t1 -> t2 -> t3)
    c.fillStyle = colTop;
    c.beginPath();
    c.moveTo(t0.x, t0.y); c.lineTo(t1.x, t1.y); c.lineTo(t2.x, t2.y); c.lineTo(t3.x, t3.y);
    c.closePath(); c.fill(); c.stroke();

    return { t0: t0, t1: t1, t2: t2, t3: t3, b0: b0, b1: b1, b2: b2, b3: b3 };
  }

  function drawRoadCorridor(c, state) {
    const camS = state.player.s;
    const segs = state.segments;
    const P = FD.Iso.project;
    const startS = Math.floor((camS - 180) / 40) * 40;
    const endS = camS + 1080;
    const step = 40;

    // Draw back-to-front quad strips for lawn, sidewalk, asphalt, and center lines
    for (let s = endS; s >= startS; s -= step) {
      const s0 = s;
      const s1 = s + step + 2;

      // Left lawn
      const lL0 = P(camS, s0, -3.5, 0, segs);
      const lL1 = P(camS, s1, -3.5, 0, segs);
      const lR1 = P(camS, s1, -1.25, 0, segs);
      const lR0 = P(camS, s0, -1.25, 0, segs);
      c.fillStyle = ((Math.floor(s / 80) % 2) === 0) ? '#2b6e3f' : '#256037';
      c.beginPath();
      c.moveTo(lL0.x, lL0.y); c.lineTo(lL1.x, lL1.y); c.lineTo(lR1.x, lR1.y); c.lineTo(lR0.x, lR0.y);
      c.closePath(); c.fill();

      // Right lawn
      const rL0 = P(camS, s0, 1.25, 0, segs);
      const rL1 = P(camS, s1, 1.25, 0, segs);
      const rR1 = P(camS, s1, 3.5, 0, segs);
      const rR0 = P(camS, s0, 3.5, 0, segs);
      c.fillStyle = ((Math.floor(s / 80) % 2) === 0) ? '#2f7845' : '#28683c';
      c.beginPath();
      c.moveTo(rL0.x, rL0.y); c.lineTo(rL1.x, rL1.y); c.lineTo(rR1.x, rR1.y); c.lineTo(rR0.x, rR0.y);
      c.closePath(); c.fill();

      // Left & right concrete sidewalks
      const swL0 = P(camS, s0, -1.28, 0, segs);
      const swL1 = P(camS, s1, -1.28, 0, segs);
      const swLi1 = P(camS, s1, -1.0, 0, segs);
      const swLi0 = P(camS, s0, -1.0, 0, segs);
      c.fillStyle = '#94a3b8';
      c.beginPath();
      c.moveTo(swL0.x, swL0.y); c.lineTo(swL1.x, swL1.y); c.lineTo(swLi1.x, swLi1.y); c.lineTo(swLi0.x, swLi0.y);
      c.closePath(); c.fill();

      const swRi0 = P(camS, s0, 1.0, 0, segs);
      const swRi1 = P(camS, s1, 1.0, 0, segs);
      const swR1 = P(camS, s1, 1.28, 0, segs);
      const swR0 = P(camS, s0, 1.28, 0, segs);
      c.fillStyle = '#cbd5e1';
      c.beginPath();
      c.moveTo(swRi0.x, swRi0.y); c.lineTo(swRi1.x, swRi1.y); c.lineTo(swR1.x, swR1.y); c.lineTo(swR0.x, swR0.y);
      c.closePath(); c.fill();

      // Asphalt street surface
      const segKind = FD.Iso.segmentKindAt(segs, s0);
      c.fillStyle = segKind === 'uturn_reroute' ? '#362d42' : '#2a2e39';
      c.beginPath();
      c.moveTo(swLi0.x, swLi0.y); c.lineTo(swLi1.x, swLi1.y);
      c.lineTo(swRi1.x, swRi1.y); c.lineTo(swRi0.x, swRi0.y);
      c.closePath(); c.fill();

      // Curb lines
      c.strokeStyle = '#e2e8f0';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(swLi0.x, swLi0.y); c.lineTo(swLi1.x, swLi1.y);
      c.moveTo(swRi0.x, swRi0.y); c.lineTo(swRi1.x, swRi1.y);
      c.stroke();

      // Dashed yellow center divider
      if (Math.floor(s / 40) % 2 === 0) {
        const c0 = P(camS, s0 + 6, 0, 0, segs);
        const c1 = P(camS, s0 + 28, 0, 0, segs);
        c.strokeStyle = '#ffbe0b';
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(c0.x, c0.y); c.lineTo(c1.x, c1.y);
        c.stroke();
      }
    }
  }

  function drawPickupZoneAndBuilding(c, state, stop) {
    const camS = state.player.s;
    const segs = state.segments;
    const P = FD.Iso.project;
    const sideSign = stop.side === 'left' ? -1 : 1;
    const curbLane = sideSign * 0.95;

    // Glowing curb pickup box
    if (!stop.completed && !stop.missed) {
      const pulse = 0.55 + 0.35 * Math.sin(state.elapsed * 8);
      const p0 = P(camS, stop.s - 65, curbLane - 0.35, 1, segs);
      const p1 = P(camS, stop.s + 65, curbLane - 0.35, 1, segs);
      const p2 = P(camS, stop.s + 65, curbLane + 0.35, 1, segs);
      const p3 = P(camS, stop.s - 65, curbLane + 0.35, 1, segs);

      c.save();
      c.fillStyle = stop.color;
      c.globalAlpha = 0.25 + pulse * 0.25;
      c.beginPath();
      c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.lineTo(p3.x, p3.y);
      c.closePath(); c.fill();
      c.globalAlpha = 0.95;
      c.strokeStyle = '#ffbe0b';
      c.lineWidth = 3;
      c.stroke();
      c.restore();
    }

    // Restaurant isometric building (extra curb setback & clamped height on right side so roofs never obscure right-lane hazards)
    const bLane = sideSign > 0 ? 2.55 : -2.15;
    const bHeight = sideSign > 0 ? 44 : 68;
    const box = isoBox(
      c, camS, stop.s, bLane, 0, 120, 1.10, bHeight, segs,
      '#fca5a5', '#dc2626', '#991b1b', '#181214'
    );
    // Neon roof sign
    const signP = P(camS, stop.s, bLane, sideSign > 0 ? 60 : 88, segs);
    c.save();
    c.fillStyle = '#181214';
    c.strokeStyle = stop.color;
    c.lineWidth = 2.5;
    c.beginPath();
    c.roundRect(signP.x - 54, signP.y - 16, 108, 26, 5);
    c.fill(); c.stroke();
    c.fillStyle = '#fffbeb';
    c.font = 'bold 11px monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const tag = stop.completed ? 'PICKED UP ✓' : ('PICKUP ' + stop.orderId + ' ' + (stop.offer ? stop.offer.food.icon : ''));
    c.fillText(tag, signP.x, signP.y - 3);
    c.restore();
    return box;
  }

  function drawDropoffHouseAndMat(c, state, stop, activeCtx) {
    const camS = state.player.s;
    const segs = state.segments;
    const P = FD.Iso.project;
    const sideSign = stop.side === 'left' ? -1 : 1;
    const matLane = sideSign * 1.85;
    const matMul = FD.Game.getMatMultiplier ? FD.Game.getMatMultiplier() : 1;
    const matHalfS = 32 * matMul;

    // Concrete driveway walkway
    const d0 = P(camS, stop.s - 22, sideSign * 1.28, 0, segs);
    const d1 = P(camS, stop.s + 22, sideSign * 1.28, 0, segs);
    const d2 = P(camS, stop.s + 22, sideSign * 2.05, 0, segs);
    const d3 = P(camS, stop.s - 22, sideSign * 2.05, 0, segs);
    c.fillStyle = '#cbd5e1';
    c.beginPath();
    c.moveTo(d0.x, d0.y); c.lineTo(d1.x, d1.y); c.lineTo(d2.x, d2.y); c.lineTo(d3.x, d3.y);
    c.closePath(); c.fill();

    // Color-coded Welcome Mat bullseye
    const m0 = P(camS, stop.s - matHalfS, matLane - 0.24, 1, segs);
    const m1 = P(camS, stop.s + matHalfS, matLane - 0.24, 1, segs);
    const m2 = P(camS, stop.s + matHalfS, matLane + 0.24, 1, segs);
    const m3 = P(camS, stop.s - matHalfS, matLane + 0.24, 1, segs);
    c.fillStyle = stop.completed ? '#475569' : stop.color;
    c.strokeStyle = '#ffbe0b';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(m0.x, m0.y); c.lineTo(m1.x, m1.y); c.lineTo(m2.x, m2.y); c.lineTo(m3.x, m3.y);
    c.closePath(); c.fill(); c.stroke();

    // Aiming reticule on porch when carrying this bag (always hints near house; full range with Precision Porch Cannon)
    const cannonLv = FD.Game.getCareer().upgrades.porch_cannon || 0;
    if (!stop.completed && state.activeBags.indexOf(stop.orderId) !== -1 && (cannonLv > 0 || Math.abs(stop.s - camS) < 220)) {
      const leadS = state.player.s + state.player.speed * 0.30;
      const aimP = P(camS, leadS, matLane, 3, segs);
      c.save();
      c.strokeStyle = Math.abs(leadS - stop.s) <= matHalfS * 1.35 ? '#a3e635' : '#ffbe0b';
      c.lineWidth = cannonLv > 0 ? 3 : 2;
      c.setLineDash([4, 3]);
      c.beginPath();
      c.ellipse(aimP.x, aimP.y, 18, 10, 0, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }

    // Suburban House behind the porch (extra curb setback & clamped height on right side)
    const hLane = sideSign > 0 ? 2.95 : -2.55;
    const bodyH = sideSign > 0 ? 38 : 56;
    const roofH = sideSign > 0 ? 14 : 22;
    isoBox(
      c, camS, stop.s, hLane, 0, 125, 0.96, bodyH, segs,
      '#fde68a', '#f59e0b', '#b45309', '#181214'
    );
    // Pitched roof ridge
    isoBox(
      c, camS, stop.s, hLane, bodyH, 110, 0.70, roofH, segs,
      '#9a3412', '#7c2d12', '#431407', '#181214'
    );

    const tagP = P(camS, stop.s, hLane, sideSign > 0 ? 68 : 95, segs);
    c.save();
    c.fillStyle = '#181214';
    c.strokeStyle = stop.color;
    c.lineWidth = 2;
    c.beginPath();
    c.roundRect(tagP.x - 52, tagP.y - 14, 104, 22, 4);
    c.fill(); c.stroke();
    c.fillStyle = '#fffbeb';
    c.font = 'bold 10px monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const lbl = stop.completed ? 'DELIVERED ✓' : ('DROP ' + stop.orderId + ' · +$2 MAT');
    c.fillText(lbl, tagP.x, tagP.y - 3);
    c.restore();
  }

  function drawAmbientBuilding(c, camS, s, sideSign, segs, seedIdx) {
    const colors = [
      ['#bae6fd', '#38bdf8', '#0369a1'],
      ['#bbf7d0', '#4ade80', '#15803d'],
      ['#e9d5ff', '#c084fc', '#7e22ce'],
      ['#fed7aa', '#fb923c', '#c2410c']
    ][seedIdx % 4];
    const lane = sideSign > 0 ? 2.85 : -2.45;
    const hZ = sideSign > 0 ? (32 + (seedIdx % 3) * 4) : (44 + (seedIdx % 3) * 10);
    isoBox(c, camS, s, lane, 0, 96, 0.88, hZ, segs, colors[0], colors[1], colors[2], '#181214');
  }

  function drawHazardEntity(c, state, h) {
    const camS = state.player.s;
    const segs = state.segments;
    const P = FD.Iso.project;
    const pos = P(camS, h.s, h.laneX, 0, segs);

    if (h.kind === 'pothole') {
      c.save();
      c.fillStyle = '#0f172a';
      c.strokeStyle = '#64748b';
      c.lineWidth = 2.5;
      c.beginPath();
      c.ellipse(pos.x, pos.y, 24, 13, -0.32, 0, Math.PI * 2);
      c.fill(); c.stroke();
      c.fillStyle = '#334155';
      c.beginPath();
      c.ellipse(pos.x + 2, pos.y + 2, 14, 7, -0.32, 0, Math.PI * 2);
      c.fill();
      c.restore();
      return;
    }

    if (h.kind === 'car' || h.kind === 'reversing_suv') {
      const col = h.kind === 'reversing_suv' ? '#e11d48' : (h.color || '#60a5fa');
      isoBox(c, camS, h.s, h.laneX, 3, 56, 0.44, 18, segs, col, '#475569', '#1e293b', '#0f172a');
      isoBox(c, camS, h.s - 4, h.laneX, 21, 30, 0.38, 12, segs, '#e2e8f0', '#64748b', '#334155', '#0f172a');
      if (h.kind === 'reversing_suv' && h.triggered) {
        const alertP = P(camS, h.s, h.laneX, 42, segs);
        c.fillStyle = '#ffbe0b';
        c.font = 'bold 11px monospace';
        c.textAlign = 'center';
        c.fillText('BEEP! BEEP!', alertP.x, alertP.y);
      }
      return;
    }

    if (h.kind === 'rival_dasher') {
      isoBox(c, camS, h.s, h.laneX, 2, 34, 0.24, 14, segs, '#a855f7', '#7e22ce', '#581c87', '#111');
      isoBox(c, camS, h.s, h.laneX, 16, 16, 0.16, 14, segs, '#f8fafc', '#cbd5e1', '#94a3b8', '#111');
      return;
    }

    if (h.kind === 'lawnmower') {
      isoBox(c, camS, h.s, h.laneX, 1, 28, 0.28, 12, segs, '#ef4444', '#b91c1c', '#7f1d1d', '#111');
      return;
    }

    if (h.kind === 'goose') {
      // STF Arcade Parking Lot Goose Cameo
      c.save();
      c.fillStyle = 'rgba(0,0,0,0.28)';
      c.beginPath(); c.ellipse(pos.x, pos.y, 14, 7, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#f8fafc';
      c.strokeStyle = '#181214';
      c.lineWidth = 2;
      c.beginPath(); c.ellipse(pos.x, pos.y - 10, 11, 8, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      // Neck + orange beak
      c.beginPath(); c.moveTo(pos.x + 6, pos.y - 13); c.lineTo(pos.x + 11, pos.y - 24);
      c.strokeStyle = '#f8fafc'; c.lineWidth = 5; c.stroke();
      c.fillStyle = '#f97316';
      c.beginPath(); c.moveTo(pos.x + 12, pos.y - 25); c.lineTo(pos.x + 20, pos.y - 23); c.lineTo(pos.x + 12, pos.y - 21); c.fill();
      c.restore();
      return;
    }

    if (h.kind === 'recliner') {
      // STF Arcade World's Worst Driver Motorized Recliner Cameo
      isoBox(c, camS, h.s, h.laneX, 3, 36, 0.42, 16, segs, '#92400e', '#78350f', '#451a03', '#111');
      isoBox(c, camS, h.s + 8, h.laneX, 18, 16, 0.40, 18, segs, '#b45309', '#92400e', '#78350f', '#111');
      const lp = P(camS, h.s, h.laneX, 44, segs);
      c.fillStyle = '#ffbe0b';
      c.font = 'bold 10px monospace';
      c.textAlign = 'center';
      c.fillText('RECLINER!', lp.x, lp.y);
    }
  }

  function drawYardProp(c, state, yp) {
    const camS = state.player.s;
    const segs = state.segments;
    const P = FD.Iso.project;
    const pos = P(camS, yp.s, yp.laneX, 0, segs);

    if (yp.kind === 'bush') {
      c.fillStyle = '#15803d';
      c.strokeStyle = '#052e16';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(pos.x - 7, pos.y - 6, 11, 0, Math.PI * 2);
      c.arc(pos.x + 7, pos.y - 5, 10, 0, Math.PI * 2);
      c.arc(pos.x, pos.y - 12, 12, 0, Math.PI * 2);
      c.fill(); c.stroke();
    } else if (yp.kind === 'puddle') {
      c.fillStyle = 'rgba(56, 189, 248, 0.72)';
      c.strokeStyle = '#0284c7';
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(pos.x, pos.y, 19, 10, -0.25, 0, Math.PI * 2);
      c.fill(); c.stroke();
    } else if (yp.kind === 'sprinklers') {
      c.save();
      c.fillStyle = '#64748b';
      c.fillRect(pos.x - 4, pos.y - 6, 8, 6);
      const spray = 14 + Math.sin(state.elapsed * 14) * 6;
      c.strokeStyle = '#38bdf8';
      c.lineWidth = 2;
      for (let a = -2; a <= 2; a++) {
        c.beginPath();
        c.moveTo(pos.x, pos.y - 6);
        c.quadraticCurveTo(pos.x + a * 8, pos.y - 24 - spray * 0.5, pos.x + a * 13, pos.y - 6);
        c.stroke();
      }
      c.restore();
    } else if (yp.kind === 'dog') {
      c.fillStyle = '#b45309';
      c.strokeStyle = '#181214';
      c.lineWidth = 2;
      c.beginPath(); c.ellipse(pos.x, pos.y - 8, 12, 7, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.arc(pos.x + 9, pos.y - 14, 6, 0, Math.PI * 2); c.fill(); c.stroke();
    } else if (yp.kind === 'angry_customer') {
      c.fillStyle = '#ef4444';
      c.strokeStyle = '#181214';
      c.lineWidth = 2;
      c.fillRect(pos.x - 6, pos.y - 22, 12, 16);
      c.strokeRect(pos.x - 6, pos.y - 22, 12, 16);
      c.fillStyle = '#fde68a';
      c.beginPath(); c.arc(pos.x, pos.y - 28, 6, 0, Math.PI * 2); c.fill(); c.stroke();
    } else if (yp.kind === 'goose') {
      drawHazardEntity(c, state, { kind: 'goose', s: yp.s, laneX: yp.laneX });
    }
  }

  function drawKaijuStomp(c, state, ks) {
    if (ks.state === 'pending') return;
    const pos = FD.Iso.project(state.player.s, ks.s, ks.laneX, 0, state.segments);
    c.save();
    if (ks.state === 'telegraph') {
      const ratio = Math.min(1, ks.timer / ks.telegraphDur);
      c.fillStyle = 'rgba(125, 255, 79, ' + (0.2 + ratio * 0.35) + ')';
      c.strokeStyle = '#7dff4f';
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(pos.x, pos.y, 46 * (1.5 - ratio * 0.5), 24 * (1.5 - ratio * 0.5), -0.3, 0, Math.PI * 2);
      c.fill(); c.stroke();
    } else if (ks.state === 'stomped') {
      // Giant 3-toed Gorgantor footprint crater + expanding atomic shockwave ring
      c.fillStyle = '#1b2e19';
      c.strokeStyle = '#7dff4f';
      c.lineWidth = 2.5;
      c.beginPath();
      c.ellipse(pos.x, pos.y, 34, 18, -0.3, 0, Math.PI * 2);
      c.fill(); c.stroke();
      for (let t = -1; t <= 1; t++) {
        c.beginPath();
        c.arc(pos.x + 22 + t * 8, pos.y - 14 + t * 6, 8, 0, Math.PI * 2);
        c.fill(); c.stroke();
      }
      if (ks.timer < 0.85) {
        const r = ks.shockRadius * 65;
        c.strokeStyle = 'rgba(125, 255, 79, ' + (1 - ks.timer / 0.85) + ')';
        c.lineWidth = 4;
        c.beginPath();
        c.ellipse(pos.x, pos.y, r, r * 0.54, -0.3, 0, Math.PI * 2);
        c.stroke();
      }
    }
    c.restore();
  }

  function drawPlayerVehicle(c, state, veh) {
    const camS = state.player.s;
    const laneX = state.player.laneX;
    const segs = state.segments;
    const P = FD.Iso.project;
    const flash = state.player.invulnTimer > 0 && Math.floor(state.elapsed * 18) % 2 === 0;
    if (flash) {
      c.save();
      c.globalAlpha = 0.55;
    }

    const hoverZ = veh.hover ? 8 + Math.sin(state.elapsed * 9) * 3 : 2;
    const pos = P(camS, camS, laneX, 0, segs);

    // Shadow / repulsor glow
    c.save();
    c.fillStyle = veh.hover ? 'rgba(163, 230, 53, 0.45)' : 'rgba(0, 0, 0, 0.35)';
    c.beginPath();
    c.ellipse(pos.x, pos.y + 2, veh.id === 'van' ? 30 : 20, veh.id === 'van' ? 14 : 10, -0.32, 0, Math.PI * 2);
    c.fill();
    c.restore();

    if (veh.id === 'scooter' || veh.id === 'hover_moped') {
      isoBox(c, camS, camS, laneX, hoverZ, 34, 0.22, 12, segs, veh.color, '#991b1b', '#450a0a', '#181214');
      // Rider + helmet
      isoBox(c, camS, camS - 2, laneX, hoverZ + 12, 16, 0.16, 16, segs, '#fef08a', '#334155', '#1e293b', '#181214');
      // Thermal pack behind rider
      if (state.activeBags.length > 0) {
        isoBox(c, camS, camS - 14, laneX, hoverZ + 12, 14, 0.18, 12, segs, '#ffbe0b', '#ff3b1f', '#991b1b', '#181214');
      }
    } else if (veh.id === 'hatchback') {
      isoBox(c, camS, camS, laneX, 3, 54, 0.40, 16, segs, veh.color, '#ca8a04', '#854d0e', '#181214');
      isoBox(c, camS, camS - 4, laneX, 19, 32, 0.34, 12, segs, '#fef9c3', '#475569', '#334155', '#181214');
    } else {
      // Turbo Delivery Van
      isoBox(c, camS, camS, laneX, 3, 64, 0.46, 26, segs, veh.color, '#0891b2', '#155e75', '#181214');
      isoBox(c, camS, camS + 18, laneX, 18, 20, 0.42, 11, segs, '#fffbeb', '#38bdf8', '#0284c7', '#181214');
    }

    if (flash) c.restore();
  }

  function drawTopGpsStrip(c, state, activeCtx, w) {
    const prog = Math.min(1, Math.max(0, state.player.s / Math.max(1, state.totalLength)));

    c.save();
    c.fillStyle = 'rgba(18, 16, 22, 0.88)';
    c.strokeStyle = '#ffbe0b';
    c.lineWidth = 2;
    c.beginPath();
    c.roundRect(16, 12, w - 32, 54, 10);
    c.fill(); c.stroke();

    // Route progress bar
    const barX = 32;
    const barY = 30;
    const barW = Math.min(480, w * 0.42);
    c.fillStyle = '#27272a';
    c.fillRect(barX, barY, barW, 8);
    c.fillStyle = '#ff3b1f';
    c.fillRect(barX, barY, barW * prog, 8);

    // Stop waypoint pins along bar
    for (let i = 0; i < state.stops.length; i++) {
      const stop = state.stops[i];
      const sp = Math.min(1, Math.max(0, stop.s / Math.max(1, state.totalLength)));
      const sx = barX + sp * barW;
      c.fillStyle = stop.completed ? '#52525b' : stop.color;
      c.beginPath();
      c.arc(sx, barY + 4, stop.kind === 'PICKUP' ? 5 : 4, 0, Math.PI * 2);
      c.fill();
    }

    // Player dot on GPS bar
    c.fillStyle = '#ffbe0b';
    c.beginPath();
    c.arc(barX + barW * prog, barY + 4, 6.5, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = '#fffbeb';
    c.font = 'bold 11px monospace';
    c.textAlign = 'left';
    c.fillText('GPS ROUTE · ' + Math.round(prog * 100) + '% · ' + Math.round(state.player.speed) + ' PX/S', barX, 22);

    // Active thermal bags temperatures on right side
    let tx = barX + barW + 24;
    if (state.activeBags.length === 0) {
      c.fillStyle = '#9ca3af';
      c.font = 'bold 12px monospace';
      c.fillText('THERMAL PACK EMPTY — PULL TO CURB TO GRAB!', tx, 42);
    } else {
      for (let i = 0; i < state.activeBags.length && i < 4; i++) {
        const oid = state.activeBags[i];
        const ord = state.orders[oid];
        if (!ord) continue;
        const temp = Math.round(ord.thermal);
        const pillW = 136;
        c.fillStyle = '#272024';
        c.strokeStyle = ord.offer.color;
        c.lineWidth = 2;
        c.beginPath();
        c.roundRect(tx, 19, pillW, 38, 6);
        c.fill(); c.stroke();

        c.fillStyle = '#fffbeb';
        c.font = 'bold 11px monospace';
        c.fillText(ord.id + ' ' + ord.offer.food.icon + ' ' + temp + '%', tx + 8, 34);

        c.fillStyle = '#3f3f46';
        c.fillRect(tx + 8, 42, pillW - 16, 7);
        c.fillStyle = temp > 65 ? '#a3e635' : temp > 35 ? '#ffbe0b' : '#ef4444';
        c.fillRect(tx + 8, 42, (pillW - 16) * (temp / 100), 7);
        tx += pillW + 10;
      }
    }

    // Context action hint pill
    if (activeCtx && (activeCtx.type === 'GRAB' || activeCtx.type === 'TOSS')) {
      const label = activeCtx.type === 'GRAB'
        ? (activeCtx.inLane ? '[SPACE] GRAB HOT BAG!' : 'PULL INTO CURB LANE!')
        : '[SPACE] TOSS TO PORCH!';
      c.fillStyle = activeCtx.type === 'GRAB' && !activeCtx.inLane ? '#ef4444' : '#ffbe0b';
      c.beginPath();
      c.roundRect(w * 0.5 - 150, 74, 300, 30, 15);
      c.fill();
      c.fillStyle = '#181214';
      c.font = 'bold 13px monospace';
      c.textAlign = 'center';
      c.fillText(label, w * 0.5, 93);
    }

    // Reroute / alert banner
    if (state.bannerTimer > 0 && state.bannerText) {
      c.fillStyle = '#ff3b1f';
      c.strokeStyle = '#ffbe0b';
      c.lineWidth = 3;
      c.beginPath();
      c.roundRect(w * 0.5 - 210, 112, 420, 38, 8);
      c.fill(); c.stroke();
      c.fillStyle = '#fffbeb';
      c.font = 'bold 16px monospace';
      c.textAlign = 'center';
      c.fillText(state.bannerText, w * 0.5, 136);
    }
    c.restore();
  }

  function drawScene(state, activeCtx, career) {
    if (!ctx || !canvasEl || !state) return;
    const w = canvasEl.width;
    const h = canvasEl.height;
    const camS = state.player.s;
    const segs = state.segments;

    ctx.save();
    if (state.shakeTimer > 0) {
      const amp = state.shakeAmp * (state.shakeTimer / 0.4);
      ctx.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
    }

    // 1980s Sunset / Neon Horizon Backdrop
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#1a0b2e');
    sky.addColorStop(0.45, '#4c1d4c');
    sky.addColorStop(1, '#221518');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Distant synth sun & skyline
    ctx.fillStyle = 'rgba(255, 190, 11, 0.22)';
    ctx.beginPath();
    ctx.arc(w * 0.78, 128, 72, 0, Math.PI * 2);
    ctx.fill();

    // Road corridor
    drawRoadCorridor(ctx, state);

    // Kaiju stomps on road surface
    for (let i = 0; i < state.kaijuStomps.length; i++) {
      drawKaijuStomp(ctx, state, state.kaijuStomps[i]);
    }

    // Painter's algorithm list of visible roadside buildings & stops
    const drawList = [];
    const baseBlock = Math.floor((camS - 120) / 170) * 170;
    for (let bs = baseBlock; bs < camS + 1020; bs += 170) {
      const nearStopL = state.stops.some(function (st) { return st.side === 'left' && Math.abs(st.s - bs) < 120; });
      const nearStopR = state.stops.some(function (st) { return st.side === 'right' && Math.abs(st.s - bs) < 120; });
      if (!nearStopL) drawList.push({ s: bs, fn: drawAmbientBuilding, args: [ctx, camS, bs, -1, segs, Math.abs(Math.floor(bs / 170))] });
      if (!nearStopR) drawList.push({ s: bs, fn: drawAmbientBuilding, args: [ctx, camS, bs, 1, segs, Math.abs(Math.floor(bs / 170)) + 2] });
    }

    for (let i = 0; i < state.stops.length; i++) {
      const stop = state.stops[i];
      if (stop.s < camS - 180 || stop.s > camS + 1080) continue;
      drawList.push({
        s: stop.s,
        fn: stop.kind === 'PICKUP' ? drawPickupZoneAndBuilding : drawDropoffHouseAndMat,
        args: [ctx, state, stop, activeCtx]
      });
    }

    for (let i = 0; i < state.yardProps.length; i++) {
      const yp = state.yardProps[i];
      if (yp.s < camS - 160 || yp.s > camS + 1050) continue;
      drawList.push({ s: yp.s, fn: drawYardProp, args: [ctx, state, yp] });
    }

    for (let i = 0; i < state.hazards.length; i++) {
      const hz = state.hazards[i];
      if (hz.s < camS - 160 || hz.s > camS + 1050) continue;
      drawList.push({ s: hz.s, fn: drawHazardEntity, args: [ctx, state, hz] });
    }

    const veh = FD.VEHICLES[career.equippedVehicle] || FD.VEHICLES.scooter;
    drawList.push({ s: camS, fn: drawPlayerVehicle, args: [ctx, state, veh] });

    // Back-to-front sort (highest s draws first)
    drawList.sort(function (a, b) { return b.s - a.s; });
    for (let i = 0; i < drawList.length; i++) {
      drawList[i].fn.apply(null, drawList[i].args);
    }

    // Parabolic food bag projectiles + ground shadows
    for (let i = 0; i < state.projectiles.length; i++) {
      const pr = state.projectiles[i];
      const u = Math.min(1, pr.age / Math.max(0.01, pr.dur));
      const curS = FD.Util.lerp(pr.startS, pr.endS, u);
      const curLane = FD.Util.lerp(pr.startLaneX, pr.endLaneX, u);
      const arcZ = 18 + Math.sin(u * Math.PI) * 86;

      const shadowP = FD.Iso.project(camS, curS, curLane, 0, segs);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(shadowP.x, shadowP.y, 10, 5, 0, 0, Math.PI * 2); ctx.fill();

      const bagP = FD.Iso.project(camS, curS, curLane, arcZ, segs);
      ctx.fillStyle = pr.color || '#ff3b1f';
      ctx.strokeStyle = '#ffbe0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(bagP.x - 10, bagP.y - 10, 20, 18, 4);
      ctx.fill(); ctx.stroke();
    }

    // Particles
    for (let i = 0; i < state.particles.length; i++) {
      const pt = state.particles[i];
      const pp = FD.Iso.project(camS, pt.s, pt.laneX, pt.z, segs);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pp.x - 3, pp.y - 3, 6, 6);
    }

    // Comic Callouts
    for (let i = 0; i < state.callouts.length; i++) {
      const cl = state.callouts[i];
      const cp = FD.Iso.project(camS, cl.s, cl.laneX, cl.z, segs);
      const alpha = Math.max(0, 1 - cl.age / cl.dur);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 15px monospace';
      const tw = ctx.measureText(cl.text).width + 18;
      ctx.fillStyle = '#181214';
      ctx.strokeStyle = cl.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(cp.x - tw * 0.5, cp.y - 14, tw, 24, 6);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = cl.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cl.text, cp.x, cp.y - 2);
      ctx.restore();
    }

    ctx.restore();
    drawTopGpsStrip(ctx, state, activeCtx, w);
  }

  FD.Render = {
    setCanvas: setCanvas,
    drawScene: drawScene
  };
})(typeof window !== 'undefined' ? window : globalThis);
