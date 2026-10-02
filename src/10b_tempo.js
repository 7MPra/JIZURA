/* ============================================================
   JIZURA — tempo map (BPM グラフ): tempo changes over a song or a DJ mix
   project.timing.tempo = [{ t, bpm, ramp, anchor }, …]   (seconds, BPM)
     ramp    the tempo slides linearly from the previous point to this one (a DJ's pitch ride);
             off = it jumps to this BPM at t
     anchor  a beat falls exactly on t (the next track's first beat); off = the beats carry on
             from the previous section
   Before the first point the first BPM runs back to 0 s. When the map has points it replaces the
   single BPM and the detected beat grid.
   ============================================================ */
(() => {
'use strict';

/* the points, cleaned and in time order (null when there is no map) */
J.tempoPoints = (timing) => {
  const a = timing && Array.isArray(timing.tempo) ? timing.tempo : [];
  const pts = a.filter(p => p && isFinite(+p.t) && +p.bpm >= 20 && +p.bpm <= 400)
    .map(p => ({ t: Math.max(0, +p.t), bpm: +p.bpm, ramp: !!p.ramp, anchor: p.anchor !== false }))
    .sort((x, y) => x.t - y.t);
  return pts.length ? pts : null;
};

/* BPM at time t */
J.tempoBpmAt = (pts, t) => {
  if (!pts || !pts.length) return 0;
  if (t <= pts[0].t) return pts[0].bpm;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (t < b.t) return b.ramp && b.t > a.t ? J.lerp(a.bpm, b.bpm, (t - a.t) / (b.t - a.t)) : a.bpm;
  }
  return pts[pts.length - 1].bpm;
};

/* beat times (seconds) from 0 to duration */
J.tempoBeats = (pts, duration) => {
  const out = [];
  if (!pts || !pts.length) return out;
  const D = Math.max(1, duration || 600), MAX = 20000;
  // before the first point: its tempo, counted back from it
  const L0 = 60 / pts[0].bpm, back = [];
  for (let t = pts[0].t - L0; t > -1e-6 && back.length < MAX; t -= L0) back.push(t);
  back.reverse().forEach(t => out.push(+Math.max(0, t).toFixed(4)));
  let t = pts[0].t;
  for (let i = 0; i < pts.length && out.length < MAX; i++) {
    const p = pts[i], end = i + 1 < pts.length ? pts[i + 1].t : D, next = pts[i + 1];
    if (i > 0 && p.anchor) t = p.t;                         // this point starts a fresh beat grid
    const nextAnch = next && next.anchor;
    while (t < end - 1e-6 && out.length < MAX) {
      const len = 60 / J.tempoBpmAt(pts, t);
      // the next point re-anchors the grid: a beat closer than 40% of a beat before it would make a stutter
      if (nextAnch && end - t < len * 0.4) break;
      out.push(+t.toFixed(4));
      t += 60 / J.tempoBpmAt(pts, t + len / 2);              // midpoint step: follows a ramp closely
    }
    if (nextAnch) t = end;
  }
  return out;
};

/* beat length (s) at time t for a timing block: the map when there is one, else the single BPM (0 = none) */
J.beatLenAt = (timing, t) => {
  const pts = J.tempoPoints(timing);
  if (pts) return 60 / J.tempoBpmAt(pts, t || 0);
  return timing && timing.bpm > 0 ? 60 / timing.bpm : 0;
};
})();
