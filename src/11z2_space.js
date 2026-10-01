/* JIZURA pack: space — text placed in 3D (perspective), drawn glyph by glyph with Canvas 2D: each glyph's centre is
   projected, its size follows the depth, its baseline turns with the plane and is foreshortened along it.
     sp3Plane     傾いた面    the line set on a plane tilted away in space, turning slowly; glyphs drop onto it on the beat
     sp3Depth     奥行きの道  each word further into the frame; the camera travels forward and each word arrives as it is sung
     sp3Cylinder  回る筒      the glyphs round a vertical cylinder that turns; the sung part comes round to the front
   Text only (no shapes). Text-only styles draw from these (J.TEXT_POOL); every other style plans as before. */
(() => {
'use strict';
const clamp = J.clamp, K = J.beatKit, DEG = Math.PI / 180;
const out3 = x => 1 - Math.pow(1 - clamp(x), 3), inOut = x => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const lat = t => K.hasLatin(t);
const strip = t => (lat(t) ? String(t).trim() : K.strip(t));
const reg = (key, def) => J.register('layout', key, Object.assign(def, { set: 'kinetic' }), 'space');
const own = it => Object.assign(it, { enter: 'cut', exit: 'cut', hold: 'still', mi: 0, noHold: true });
const font = (st, roles) => J.fontsOf(st, roles)[0];

/* a camera: focal length f, points with z > -f*0.85 are drawn */
function cam(W, H, f) {
  const P = (x, y, z) => { const s = f / (f + z); return { x: W / 2 + x * s, y: H / 2 + y * s, s }; };
  return { f, P };
}
const rotX = (p, a) => ({ x: p.x, y: p.y * Math.cos(a) - p.z * Math.sin(a), z: p.y * Math.sin(a) + p.z * Math.cos(a) });
const rotY = (p, a) => ({ x: p.x * Math.cos(a) + p.z * Math.sin(a), y: p.y, z: -p.x * Math.sin(a) + p.z * Math.cos(a) });

/* draw a text on a 3D plane: local (u along the line, v down) → world through R(), each glyph projected */
function drawOnPlane(env, text, fnt, size, R, C, glyphFn) {
  const it0 = { text, font: fnt, size, track: 0.04 };
  const lay = J.layoutText(it0);
  let bb = null;
  for (const g of lay) {
    if (/\s/.test(g.ch)) continue;
    const o = glyphFn ? glyphFn(g.i, lay.N) : {};
    if (o === null) continue;
    const u = g.x, v = g.y;
    const p0 = R({ x: u, y: v, z: o.lift || 0 }), p1 = R({ x: u + size * 0.5, y: v, z: o.lift || 0 }), p2 = R({ x: u, y: v + size * 0.5, z: o.lift || 0 });
    if (p0.z < -C.f * 0.8) continue;
    const a = C.P(p0.x, p0.y, p0.z), b = C.P(p1.x, p1.y, p1.z), d = C.P(p2.x, p2.y, p2.z);
    const ux = b.x - a.x, uy = b.y - a.y, vx = d.x - a.x, vy = d.y - a.y;
    const lu = Math.hypot(ux, uy) / (size * 0.5), lv = Math.hypot(vx, vy) / (size * 0.5);
    if (lu < 0.02 || lv < 0.02) continue;
    // the glyph's own box: rotated with the baseline, stretched by the two foreshortened axes
    const rot = Math.atan2(uy, ux) / DEG, s = Math.max(lu, lv), sx = lu / s, sy = lv / s;
    const facing = ux * vy - uy * vx;                       // < 0: the plane is seen from behind
    bb = J.unionBB(bb, J.mainDraw(env, own({ text: g.ch, font: fnt, size: size * s, x: a.x, y: a.y, rot, sx: facing < 0 ? -sx : sx, sy, color: o.color || env.sc.fg, alpha: (o.alpha ?? 1) * clamp(1.4 - (p0.z / (C.f * 1.6))) })));
  }
  return bb;
}

/* ================================================================== sp3Plane — 傾いた面 */
reg('sp3Plane', {
  name: '傾いた面', tags: ['editorial', 'graphic', 'emotional', 'calm'], w: 0.9, ae: 'center', fits: n => n >= 2 && n <= 24,
  plan(rng, cut, st) {
    return { font: font(st, ['display']), ay: rng.pick([1, -1]) * rng.range(38, 55), ax: rng.range(12, 26) * rng.pick([1, -1]), turn: rng.pick([1, -1]) * rng.range(2.5, 5), drop: rng.chance(0.6) };
  },
  render(env) {
    const { W, H, sc } = env, c = env.cut, P = c.params, port = K.isPort(env);
    const t = strip(c.text), n = [...t].length;
    const lines = n > (port ? 6 : 10) ? J.splitLines(t, Math.ceil(n / 2)) : t;
    const f = Math.max(W, H) * 0.85, C = cam(W, H, f);
    const ay = (P.ay + P.turn * env.lt) * DEG, ax = P.ax * DEG;
    // the size where the plane, seen in perspective, fills the frame: measured on the projected glyph centres
    // the plane is pushed back until its near end is no closer than half the focal length (a long line on a steep plane
    // would otherwise come right up to the camera and force everything small)
    let size = H * 0.3, off = { x: 0, y: 0 }, zc = 0;
    for (let k = 0; k < 4; k++) {
      const lay = J.layoutText({ text: lines, font: P.font, size, track: 0.04 });
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, zmin = 1e9;
      for (const g of lay) { const p = rotX(rotY({ x: g.x, y: g.y, z: 0 }, ay), ax); zmin = Math.min(zmin, p.z); }
      zc = Math.max(0, -zmin - f * 0.5);
      for (const g of lay) for (const [du, dv] of [[-0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [0.5, -0.5]]) {
        const p = rotX(rotY({ x: g.x + du * size, y: g.y + dv * size, z: 0 }, ay), ax), q = C.P(p.x, p.y, p.z + zc);
        x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
      }
      const k2 = Math.min(W * (port ? 0.86 : 0.84) / (x1 - x0), H * (port ? 0.5 : 0.78) / (y1 - y0));
      size *= k2; off = { x: (W / 2 - (x0 + x1) / 2) * k2, y: (H / 2 - (y0 + y1) / 2) * k2 };
    }
    const C2 = { f, P: (x, y, z) => { const q = C.P(x, y, z + zc); return { x: q.x + off.x, y: q.y + off.y, s: q.s }; } };
    const R = p => rotX(rotY(p, ay), ax);
    const N = J.layoutText({ text: lines, font: P.font, size, track: 0.04 }).N;
    const step = Math.min(0.06, c.dur * 0.4 / Math.max(1, N));
    return drawOnPlane(env, lines, P.font, size, R, C2, i => {
      const dt = env.lt - i * step; if (dt < 0) return null;
      const q = out3(dt / 0.3);
      return P.drop ? { lift: -(1 - q) * size * 2.2, alpha: Math.min(1, q * 2) } : { alpha: Math.min(1, q * 2.5) };
    });
  },
});

/* ================================================================== sp3Depth — 奥行きの道 */
reg('sp3Depth', {
  name: '奥行きの道', tags: ['pop', 'graphic', 'editorial', 'glitch'], w: 0.9, ae: 'scatter', fits: n => n >= 2 && n <= 30,
  plan(rng, cut, st) { return { font: font(st, ['display']), side: rng.pick([1, -1]), gap: rng.range(0.9, 1.3), tilt: rng.range(-8, 8) }; },
  render(env) {
    const { W, H, sc } = env, c = env.cut, P = c.params, port = K.isPort(env);
    const words = K.unitsOf(c, 6).map(strip).filter(Boolean), n = words.length, ts = K.onsets(env, n);
    const f = Math.max(W, H) * 1.1, C = cam(W, H, f), gap = f * P.gap;
    // each word i sits at depth i*gap; the camera reaches it when it is sung (eased between onsets), then keeps drifting
    let k = 0; for (let i = 0; i < n; i++) if (env.lt >= ts[i]) k = i;
    // a quick move forward on each word (the previous word slides past the camera), then a slow drift
    const camZs = k * gap - gap * (1 - out3((env.lt - ts[k]) / 0.35)) + Math.max(0, env.lt - ts[k] - 0.35) * gap * 0.08;
    const base = Math.min(H * (port ? 0.2 : 0.34), W * 0.84 / Math.max(2, Math.max(...words.map(w => [...w].length)) * 0.95));
    let bb = null;
    // the camera also slides sideways onto the word being sung, so that word is always centred and whole
    const posOf = i => [(i % 2 ? 1 : -1) * P.side * W * (port ? 0.1 : 0.26), (i % 2 ? -1 : 1) * H * (port ? 0.14 : 0.1)];
    const mv = out3((env.lt - ts[k]) / 0.35), pa = posOf(Math.max(0, k - 1)), pb = posOf(k);
    const cx = k > 0 ? pa[0] + (pb[0] - pa[0]) * mv : pb[0], cy = k > 0 ? pa[1] + (pb[1] - pa[1]) * mv : pb[1];
    for (let i = n - 1; i >= 0; i--) {
      const z = i * gap - camZs;
      if (z < -f * 0.7 || z > gap * 3.2) continue;
      // the words further in sit off to alternate sides (and up / down), so the one ahead shows past the one being sung
      const [x0, y0] = posOf(i), x = x0 - cx, y = y0 - cy;
      const p = C.P(x, y, z), near = z < 0 ? clamp(1 + z / (f * 0.7)) : 1, far = clamp(1 - z / (gap * 3.2));
      const sung = env.lt >= ts[i] - 0.05;
      const sz = Math.min(J.fitSize(words[i], P.font, W * 0.84, H * 0.42, { track: 0.02 }), base);
      bb = J.unionBB(bb, J.mainDraw(env, own({ text: words[i], font: P.font, size: sz * p.s, x: p.x, y: p.y, rot: P.tilt * (i % 2 ? 1 : -1) * 0.5, track: 0.02, color: sc.fg, alpha: near * (sung ? 1 : 0.18) * (0.25 + 0.75 * far) })));
    }
    return bb;
  },
});

/* ================================================================== sp3Cylinder — 回る筒 */
reg('sp3Cylinder', {
  name: '回る筒', tags: ['pop', 'graphic', 'emotional'], w: 0.8, ae: 'circle', fits: n => n >= 3 && n <= 18,
  plan(rng, cut, st) { return { font: font(st, ['display']), tilt: rng.range(-10, 10) }; },
  render(env) {
    const { W, H, sc } = env, c = env.cut, P = c.params, port = K.isPort(env);
    const chars = [...strip(c.text)].filter(ch => !/\s/.test(ch)), n = chars.length;
    if (!n) return null;
    const step = 360 / Math.max(9, n + 3), R = Math.min(W * (port ? 0.46 : 0.36), H * 0.6), f = Math.max(W, H) * 1.2, C = cam(W, H, f);
    const size = Math.min(2 * Math.PI * R * step / 360 * 1.0, H * (port ? 0.2 : 0.34));
    // read left to right across the front; the drum turns as the line goes on, so the sung part comes round to the front
    const prog = clamp(env.lt / Math.max(0.3, c.dur * 0.75)), spin = (prog - 0.5) * (n - 1) * step * 0.7;
    const items = [];
    chars.forEach((ch, i) => {
      const a = ((i - (n - 1) / 2) * step - spin) * DEG;
      const x = Math.sin(a) * R, z = R - Math.cos(a) * R, cosA = Math.cos(a);
      if (cosA < 0.05) return;                                       // the back of the drum
      const p = C.P(x, (i - (n - 1) / 2) * size * P.tilt * 0.012, z);
      const shown = env.lt >= (i / n) * c.dur * 0.6 - 0.05;
      items.push({ z, it: own({ text: ch, font: P.font, size: size * p.s, x: p.x, y: p.y, sx: Math.max(0.1, cosA), color: sc.fg, alpha: (shown ? 1 : 0.22) * clamp(0.15 + cosA) }) });
    });
    let bb = null;
    items.sort((a, b) => b.z - a.z).forEach(g => { bb = J.unionBB(bb, J.mainDraw(env, g.it)); });
    return bb;
  },
});

// the text-only styles draw from these
if (J.TEXT_POOL) Object.assign(J.TEXT_POOL.layout, { sp3Plane: 0.9, sp3Depth: 0.9, sp3Cylinder: 0.6 });
for (const [k, add] of Object.entries({ edMincho: { sp3Plane: 1 }, minimal: { sp3Plane: 0.9 }, street: { sp3Depth: 1.1 }, showa: { sp3Plane: 0.8 }, bsSlam: { sp3Depth: 1 }, bsScale: { sp3Plane: 0.9 }, mpSpin: { sp3Depth: 0.6 }, mpEllipse: { sp3Cylinder: 0.7 } })) {
  const st = J.STYLES[k]; if (st && st.pool && st.pool.layout) Object.assign(st.pool.layout, add);
}
})();
