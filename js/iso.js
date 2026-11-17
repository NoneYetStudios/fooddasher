/* Food Dasher — 2.5D isometric curved road projection & track math. */
(function (root) {
  'use strict';
  const FD = (root.FD = root.FD || {});

  // Classic Paperboy diagonal corridor: road advances bottom-left -> top-right.
  // Forward unit axis u = (0.84, -0.46), Lateral right unit axis v = (0.64, 0.37).
  const ORIGIN_X = 350;
  const ORIGIN_Y = 560;
  const UX = 0.84;
  const UY = -0.46;
  const VX = 0.64;
  const VY = 0.37;
  const LANE_PX = 82;

  /** Evaluate curvature kappa at track distance s across road segments. */
  function curvatureAt(segments, s) {
    if (!segments || !segments.length) return 0;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (s >= seg.startS && s <= seg.endS) {
        // Smooth bell curve across the segment so entry and exit are seamless.
        const span = Math.max(1, seg.endS - seg.startS);
        const u = (s - seg.startS) / span;
        const envelope = Math.sin(u * Math.PI);
        return (seg.kappa || 0) * envelope;
      }
    }
    return 0;
  }

  /**
   * Compute cumulative lateral curve deflection (in lane-equivalent screen units)
   * at track distance `worldS` relative to camera anchor `camS`.
   */
  function curveDeflection(segments, camS, worldS) {
    const rel = worldS - camS;
    if (Math.abs(rel) < 4 || !segments || !segments.length) return 0;
    const steps = 12;
    const ds = rel / steps;
    let angle = 0;
    let offset = 0;
    for (let i = 0; i < steps; i++) {
      const midS = camS + (i + 0.5) * ds;
      const k = curvatureAt(segments, midS);
      angle += k * ds;
      offset += angle * ds;
    }
    // Scale into laneX units, softly bounded so the road never leaves canvas.
    return Math.max(-3.6, Math.min(3.6, offset * 0.0085));
  }

  /**
   * Project world track coordinates (worldS, laneX, z) into 2D canvas pixels.
   * laneX: -1.0 = left curb, 0 = road centerline, +1.0 = right curb, ±1.85 = house porch.
   */
  function project(camS, worldS, laneX, z, segments) {
    const relS = worldS - camS;
    const bend = curveDeflection(segments, camS, worldS);
    const totalLat = (laneX + bend) * LANE_PX;
    const height = z || 0;
    return {
      x: ORIGIN_X + relS * UX + totalLat * VX,
      y: ORIGIN_Y + relS * UY + totalLat * VY - height,
      relS: relS,
      bend: bend
    };
  }

  /** Helper returning the segment kind active at worldS (or 'straight'). */
  function segmentKindAt(segments, worldS) {
    if (!segments) return 'straight';
    for (let i = 0; i < segments.length; i++) {
      if (worldS >= segments[i].startS && worldS <= segments[i].endS) {
        return segments[i].kind || 'straight';
      }
    }
    return 'straight';
  }

  FD.Iso = {
    ORIGIN_X: ORIGIN_X,
    ORIGIN_Y: ORIGIN_Y,
    UX: UX,
    UY: UY,
    VX: VX,
    VY: VY,
    LANE_PX: LANE_PX,
    curvatureAt: curvatureAt,
    curveDeflection: curveDeflection,
    project: project,
    segmentKindAt: segmentKindAt
  };
})(typeof window !== 'undefined' ? window : globalThis);
