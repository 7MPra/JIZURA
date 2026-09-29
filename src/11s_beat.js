/* JIZURA pack: beat — text-only styles for fast, dense songs (アニソン / ボカロ 140–170 BPM): the words land on the beat.
   Layouts
     bsBeatWord   一拍一語      one word of the cut at a time, each on its own beat, with a short punch
     bsScaleLine  大小ライン    the whole cut small on one line, the current word huge above it
     bsRefrain    リフレイン    the cut repeated row after row, one new row per beat (the older rows go to outline)
     bsTypeBeat   拍タイプ      the letters typed in on the beat grid (8th / 16th notes) — for the slow songs
   Styles (all テキストのみ: lyric text only, no shapes / backgrounds / captions)
     bsSlam  ビートスラム / bsRefrain リフレイン / bsScale 大小 / bsBallad 夜の打鍵
   A style lists the only parts it uses (style.pool — see inPool in 08_planner.js) so the look stays consistent. */
(() => {
'use strict';
const E = J.E;
const P = 'beat';
const clamp = J.clamp;
// poolOnly: random picks use these layouts only in the styles that list them (the other styles' plans stay as they were)
const reg = (group, key, def) => J.register(group, key, Object.assign(def, { set: 'kinetic', poolOnly: true }), P);

/* ---------------------------------------------------------------- helpers */
const isPort = env => env.H > env.W * 1.08;
const hasLatin = t => /[A-Za-z]/.test(String(t || ''));
const strip = t => String(t || '').replace(/\s+/g, '');
const gcount = t => [...strip(t)].length;
const accOn = sc => (J.contrast(sc.accent, sc.bg) >= 1.7 ? sc.accent : sc.fg);
const motionK = env => 0.4 + 0.85 * (env.fx.motion ?? 0.7);
// a hit that falls off fast: 1 on the onset → 0
const kick = (dt, k = 16) => (dt < 0 ? 0 : Math.exp(-dt * k));

/* the cut's words (planner chunks), merged down to at most maxN by joining the shortest neighbours */
const unitCache = new Map();
function unitsOf(cut, maxN) {
  const key = cut.text + '\u0002' + maxN;
  let w = unitCache.get(key);
  if (w) return w;
  const lat = hasLatin(cut.text);
  w = (cut.words && cut.words.length ? cut.words : J.chunkText(cut.text)).map(s => String(s).trim()).filter(Boolean);
  if (strip(w.join('')) !== strip(cut.text)) w = J.chunkText(cut.text).map(s => String(s).trim()).filter(Boolean);
  if (!w.length) w = [String(cut.text).trim()];
  while (w.length > maxN) {
    let bi = 0, bv = 1e9;
    for (let i = 0; i < w.length - 1; i++) { const v = gcount(w[i]) + gcount(w[i + 1]); if (v < bv) { bv = v; bi = i; } }
    w.splice(bi, 2, w[bi] + (lat ? ' ' : '') + w[bi + 1]);
  }
  if (unitCache.size > 500) unitCache.clear();
  unitCache.set(key, w);
  return w;
}

/* beat length around a time (song beat grid, else the typed BPM, else 0.42 s) */
function beatLen(env, t) {
  const bs = (env.plan && env.plan.beats) || [];
  if (bs.length > 1) {
    let lo = 0, hi = bs.length - 2;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (bs[m] <= t) lo = m; else hi = m - 1; }
    return clamp(bs[lo + 1] - bs[lo], 0.2, 1);
  }
  return 0.42;
}

/* onset (seconds from the cut start) of each of n words. The first word lands on the cut start (the planner puts cut
   starts on the beat); the rest go on the following beats — every beat, every other beat when there is room, or on 8th
   notes when the words outnumber the beats. Without a beat grid they are spread evenly. */
const gridCache = new WeakMap();
function onsets(env, n, o = {}) {
  const c = env.cut;
  let m = gridCache.get(c);
  if (!m) { m = new Map(); gridCache.set(c, m); }
  const key = n + ':' + (o.room || 0);
  let v = m.get(key);
  if (v) return v;
  const dur = c.dur, endT = Math.max(0.15, dur - Math.max(0.28, c.outDur || 0) - (o.room || 0));
  const bs = (env.plan && env.plan.beats) || [];
  v = null;
  if (n <= 1) v = [0];
  else if (bs.length > 1) {
    const len = beatLen(env, c.start);
    let g = bs.map(b => b - c.start).filter(r => r > 0.12 && r < endT);
    g = [0].concat(g);
    if (g.length >= n * 2 && len < 0.5) g = g.filter((_, i) => i % 2 === 0);         // room to spare: every other beat
    if (g.length < n) {                                                                 // too many words: 8th notes
      const h = [];
      g.forEach((t, i) => { h.push(t); const mid = t + len / 2; if (mid < endT && (i + 1 >= g.length || mid < g[i + 1] - 0.08)) h.push(mid); });
      g = h;
    }
    if (g.length >= n) v = g.slice(0, n);
  }
  if (!v) {
    const step = clamp(endT * 0.8 / n, 0.14, 0.48);
    v = []; for (let i = 0; i < n; i++) v.push(i * step);
  }
  m.set(key, v);
  return v;
}
const curIdx = (ts, t) => { let k = -1; for (let i = 0; i < ts.length; i++) if (t >= ts[i]) k = i; return k; };
// J.mainDraw starts an item's entrance at delay = mi × cut.stagger
const miAt = (env, t) => Math.max(0, t) / Math.max(0.005, env.cut.stagger || 0.04);
// is this word one of the line's *強調* words (or the whole cut is an emphasis cut)?
const isEmph = (env, w) => { const L = env.plan && env.plan.lines && env.plan.lines[env.cut.line]; return !!(L && L.emph && L.emph.some(e => w.includes(e) || e.includes(w))); };

/* ================================================================== bsBeatWord — 一拍一語 */
const WALK = [[0, 0], [-0.5, -0.45], [0.55, 0.35], [-0.35, 0.5], [0.45, -0.5], [0, 0.3], [-0.55, 0.1], [0.5, 0]];
reg('layout', 'bsBeatWord', {
  name: '一拍一語', tags: ['pop', 'graphic', 'glitch'], w: 0.8, ae: 'center', fits: n => n >= 2 && n <= 26,
  enterBias: { cut: 4, knWordSlam: 1, zoom: 0.4, stretch: 0.3 },
  plan(rng, cut, st) {
    const disp = J.fontsOf(st, ['display']);
    const f1 = rng.pick(disp), f2 = rng.chance(0.35) ? rng.pick(J.fontsOf(st, ['display', 'serif'])) : f1;
    return { fonts: [f1, f2], move: rng.pick(['punch', 'punch', 'drop', 'side', 'tilt']), walk: rng.chance(0.4), punch: rng.range(0.1, 0.18),
      track: rng.range(0, 0.06), accentLast: rng.chance(0.45), start: rng.int(0, 7) };
  },
  render(env) {
    const { W, H, sc } = env, c = env.cut, Pm = c.params, port = isPort(env);
    const units = unitsOf(c, 9), n = units.length, ts = onsets(env, n), k = curIdx(ts, env.lt);
    if (k < 0) return null;
    const t = units[k], dt = env.lt - ts[k], font = Pm.fonts[k % Pm.fonts.length];
    const one = gcount(t) <= 2 && !hasLatin(t);
    let size = Math.min(J.fitSize(t, font, W * 0.86, H * (port ? 0.3 : 0.5), { track: Pm.track }), H * (one ? 0.5 : port ? 0.24 : 0.42));
    const m = motionK(env), q = kick(dt, 15), e = 1 - E.outExpo(clamp(dt / 0.16));
    let dx = 0, dy = 0, rot = 0, s = 1 + Pm.punch * m * q;
    const side = k % 2 ? 1 : -1;
    if (Pm.move === 'drop') { dy = -H * 0.07 * m * e; s = 1 + Pm.punch * 0.5 * m * q; }
    else if (Pm.move === 'side') dx = side * W * 0.05 * m * e;
    else if (Pm.move === 'tilt') rot = side * 7 * m * e;
    let ox = 0, oy = 0;
    if (Pm.walk && n > 1) {
      const w = WALK[(k + Pm.start) % WALK.length];
      const mw = J.measure({ text: t, font, size, track: Pm.track }).w;
      ox = w[0] * Math.max(0, (W * 0.9 - mw) / 2); oy = w[1] * H * 0.18;
    }
    const acc = isEmph(env, t) || (Pm.accentLast && k === n - 1 && n > 1) || (c.emph && k === 0);
    return J.mainDraw(env, { text: t, font, size: size * s, x: W / 2 + ox + dx, y: H / 2 + oy + dy, rot, track: Pm.track, color: acc ? accOn(sc) : sc.fg, mi: miAt(env, ts[k]) });
  },
});

/* ================================================================== bsScaleLine — 大小ライン */
reg('layout', 'bsScaleLine', {
  name: '大小ライン', tags: ['editorial', 'graphic', 'pop'], w: 0.8, ae: 'center', fits: n => n >= 3 && n <= 28,
  enterBias: { cut: 3, fadeStagger: 0.8, blur: 0.5 },
  plan(rng, cut, st) {
    return { big: rng.pick(J.fontsOf(st, ['display'])), small: rng.pick(J.fontsOf(st, ['body', 'serif'])), top: rng.chance(0.3), left: rng.chance(0.35), punch: rng.range(0.06, 0.12) };
  },
  render(env) {
    const { W, H, sc } = env, c = env.cut, Pm = c.params, port = isPort(env);
    const units = unitsOf(c, 8), n = units.length, ts = onsets(env, n), k = curIdx(ts, env.lt);
    if (k < 0) return null;
    const lat = hasLatin(c.text), gap = lat ? 0.3 : 0.12;
    // the small line: one item per word so the current one can be lit
    let ss = clamp(Math.min(H * 0.045, W * 0.04), 14, 60);
    const ws = units.map(u => J.measure({ text: u, font: Pm.small, size: ss, track: 0.08 }).w);
    let tot = ws.reduce((a, b) => a + b, 0) + ss * gap * (n - 1);
    const maxW = W * (port ? 0.86 : 0.8);
    if (tot > maxW) { const f = maxW / tot; ss *= f; tot = maxW; for (let i = 0; i < n; i++) ws[i] *= f; }
    const ly = Pm.top ? H * 0.16 : H * 0.84;
    let x = Pm.left ? W * 0.1 : W / 2 - tot / 2, bb = null;
    if (n > 1) units.forEach((u, i) => {
      const on = i === k, done = i < k;
      const b = J.mainDraw(env, { text: u, font: Pm.small, size: ss, x: x + ws[i] / 2, y: ly, track: 0.08, color: on ? accOn(sc) : sc.fg, alpha: on ? 1 : done ? 0.75 : 0.32, mi: i * 0.6 });
      bb = J.unionBB(bb, b);
      x += ws[i] + ss * gap;
    });
    // the big word
    const t = units[k], dt = env.lt - ts[k];
    const size = Math.min(J.fitSize(t, Pm.big, W * 0.86, H * (port ? 0.34 : 0.46), { track: 0.02 }), H * (gcount(t) <= 2 ? 0.44 : 0.38));
    const s = 1 + Pm.punch * motionK(env) * kick(dt, 14);
    const cy = Pm.top ? H * 0.56 : H * 0.44;
    const x0 = Pm.left ? W * 0.1 : W / 2;
    const b2 = J.mainDraw(env, { text: t, font: Pm.big, size: size * s, x: x0, y: cy, align: Pm.left ? 'left' : 'center', track: 0.02, color: sc.fg, mi: miAt(env, ts[k]) });
    return J.unionBB(bb, b2);
  },
});

/* ================================================================== bsRefrain — リフレイン */
reg('layout', 'bsRefrain', {
  name: 'リフレイン', tags: ['pop', 'graphic'], w: 0.6, ae: 'center', fits: n => n >= 1 && n <= 14,
  enterBias: { cut: 3, stretch: 0.5, zoom: 0.4 },
  plan(rng, cut, st) {
    return { font: rng.pick(J.fontsOf(st, ['display'])), order: rng.pick(['down', 'down', 'up', 'out']), stag: rng.chance(0.6), outline: rng.chance(0.7), rows: rng.int(3, 5) };
  },
  render(env) {
    const { W, H, sc } = env, c = env.cut, Pm = c.params, port = isPort(env);
    const text = hasLatin(c.text) ? String(c.text).trim() : strip(c.text);
    const nR = clamp(Pm.rows + (port ? 2 : 0), 3, 7);
    const rowH = H * 0.92 / nR;
    const size = Math.min(J.fitSize(text, Pm.font, W * (Pm.stag ? 0.84 : 0.9), rowH * 0.92, { track: 0.02 }), rowH * 0.92);
    const ts = onsets(env, nR), k = curIdx(ts, env.lt);
    if (k < 0) return null;
    // row slots top → bottom; the order they fill
    const slots = [];
    for (let i = 0; i < nR; i++) slots.push(H / 2 + (i - (nR - 1) / 2) * rowH);
    let seq = slots.map((_, i) => i);
    if (Pm.order === 'up') seq.reverse();
    else if (Pm.order === 'out') { const mid = (nR - 1) / 2; seq.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b); }
    const mw = J.measure({ text, font: Pm.font, size, track: 0.02 }).w, room = Math.max(0, (W * 0.94 - mw) / 2);
    let bb = null;
    for (let j = 0; j <= k; j++) {
      const r = seq[j], newest = j === k, dt = env.lt - ts[j];
      const s = newest ? 1 + 0.1 * motionK(env) * kick(dt, 15) : 1;
      const ox = Pm.stag ? (r % 2 ? 1 : -1) * room * 0.8 : 0;
      const it = { text, font: Pm.font, size: size * s, x: W / 2 + ox, y: slots[r], track: 0.02, color: sc.fg, mi: miAt(env, ts[j]) };
      if (!newest) {
        if (Pm.outline) Object.assign(it, { fill: false, stroke: Math.max(1, size * 0.02), strokeColor: sc.fg });
        else it.alpha = 0.3;
      }
      bb = J.unionBB(bb, J.mainDraw(env, it));
    }
    return bb;
  },
});

/* ================================================================== bsTypeBeat — 拍タイプ */
reg('layout', 'bsTypeBeat', {
  name: '拍タイプ', tags: ['calm', 'emotional', 'editorial'], w: 0.6, ae: 'type', fits: n => n >= 2 && n <= 40,
  enterBias: { cut: 4, blur: 0.3 },
  plan(rng, cut, st) {
    return { font: rng.pick(J.fontsOf(st, rng.chance(0.6) ? ['serif'] : ['display'])), vert: rng.chance(0.45), track: rng.range(0.06, 0.16), rise: rng.range(0.12, 0.3) };
  },
  render(env) {
    const { W, H, sc } = env, c = env.cut, Pm = c.params, port = isPort(env);
    const lat = hasLatin(c.text), vert = Pm.vert && !lat;
    const text = vert ? J.splitLines(strip(c.text), port ? 9 : 7) : J.splitLines(c.text, port ? 7 : 13);
    const o = { track: Pm.track, lead: vert ? 1.5 : 1.3, vertical: vert };
    const size = Math.min(J.fitSize(text, Pm.font, W * (vert ? 0.6 : 0.84), H * (vert ? 0.8 : 0.5), o), H * (vert ? 0.14 : 0.2));
    const it = Object.assign({ text, font: Pm.font, size, x: W / 2, y: H / 2, color: sc.fg }, o);
    const N = J.measure(it).lay.N;
    // letter step: the largest of beat / 8th / 16th that types the cut within ~60% of it
    const bl = beatLen(env, c.start), budget = c.dur * 0.6;
    let step = [bl, bl / 2, bl / 4].find(s => s * N <= budget) || Math.max(0.045, budget / N);
    if (!(env.plan && env.plan.beats && env.plan.beats.length)) step = clamp(budget / N, 0.045, 0.14);
    const lt = env.lt, rise = size * Pm.rise;
    it.pre = (e2, it2) => {
      const base = it2.charFn;
      it2.charFn = (i, g, n) => {
        const q = clamp((lt - i * step) / 0.16);
        if (q <= 0) return { hide: true };
        const r = base ? base(i, g, n) : null;
        if (r && r.hide) return r;
        const e = E.outExpo(q), mine = { dy: (1 - e) * rise, a: E.outCubic(q) };
        if (!r) return mine;
        return Object.assign({}, r, { dy: (r.dy || 0) + mine.dy, a: (r.a ?? 1) * mine.a });
      };
    };
    return J.mainDraw(env, it);
  },
});

/* ---------------------------------------------------------------- styles */
const BASE = { texture: { grain: 0, paper: 0, scan: 0 }, hud: false, glow: 0, decor: {}, textOnly: true };
const S = {
  bsSlam: {
    name: 'ビートスラム', desc: '一拍に一語を叩きつける・黒地に白の極太・サビ頭で白黒反転', moods: ['pop', 'glitch'], chorusHit: true, oneCut: 0.6, ghost: 0.15,
    schemes: [
      { bg: '#0A0A0A', fg: '#FFFFFF', sub: '#9A9A9A', accent: '#FF2E4D', accent2: '#FFE600', ink: '#FFFFFF', dim: '#161616', ghostA: '#FF2E4D', ghostB: '#2EC5FF' },
      { bg: '#0A0A0A', fg: '#FFFFFF', sub: '#9A9A9A', accent: '#FFE600', accent2: '#FF2E4D', ink: '#FFFFFF', dim: '#161616', ghostA: '#FFE600', ghostB: '#7A5CFF' },
      { bg: '#F4F2EE', fg: '#0A0A0A', sub: '#6B6B6B', accent: '#E0102F', accent2: '#0A0A0A', ink: '#0A0A0A', dim: '#E8E5DF', ghostA: '#E0102F', ghostB: '#1A6BFF' },
    ],
    fonts: { display: ['gothic_black', 'dela', 'zenkaku'], serif: ['mincho_black'], body: ['gothic_bold'], mono: ['mono'] },
    pool: {
      layout: { bsBeatWord: 3.2, bsScaleLine: 1.2, knRhythmCuts: 1, knSlamStack: 0.8, knTypeSlam: 0.6, huge: 0.5, bsRefrain: 0.4 },
      enter: { cut: 3, knWordSlam: 1.4, zoom: 0.6, stretch: 0.5, slice: 0.3 },
      exit: { cut: 4, knJumpCutOut: 1, zoomThrough: 0.5, shrink: 0.3 },
      hold: { still: 1.2, knWordPulse: 1, knTickShift: 0.5, pulse: 0.5 },
      treat: { none: 1 },
      cam: { beatPunch: 2, push: 1, knJumpCut: 1, stepZoom: 0.8 },
      trans: { knStutterCut: 1, knStripSlam: 0.4 },
      fx: { zoomPunch: 1.2, zoomStutter: 1, whipBlur: 0.6, squash: 0.5, rotateSnap: 0.5, blackFrame: 0.4 },
    },
  },
  bsRefrain: {
    name: 'リフレイン', desc: '同じ言葉を一拍ごとに重ねて画面を埋める・古い行は袋文字に・ポップな二色', moods: ['pop'], chorusHit: true, oneCut: 0.4, ghost: 0.12,
    schemes: [
      { bg: '#FF3D8B', fg: '#FFFFFF', sub: '#FFD0E2', accent: '#1B1464', accent2: '#FFE600', ink: '#1B1464', dim: '#F23580', ghostA: '#FFE600', ghostB: '#1B1464' },
      { bg: '#1B1464', fg: '#FFE600', sub: '#B7B0FF', accent: '#FF3D8B', accent2: '#FFFFFF', ink: '#FFE600', dim: '#231B78', ghostA: '#FF3D8B', ghostB: '#2EC5FF' },
      { bg: '#FFE600', fg: '#1B1464', sub: '#5A4E9E', accent: '#FF3D8B', accent2: '#1B1464', ink: '#1B1464', dim: '#F2DA00', ghostA: '#FF3D8B', ghostB: '#2E8BFF' },
    ],
    fonts: { display: ['round', 'pop', 'dela'], serif: ['round'], body: ['round'], mono: ['mono'] },
    pool: {
      layout: { bsRefrain: 2.6, bsBeatWord: 1.4, tile: 0.8, knSwapCenter: 0.8, knSlamStack: 0.6, mixed: 0.5 },
      enter: { cut: 2.5, pop: 1.2, knWordSlam: 0.8, zoom: 0.5 },
      exit: { cut: 3.5, popOut: 1, knWordKick: 0.6 },
      hold: { still: 1, knWordPulse: 1, pulse: 0.8, knBeatLean: 0.6 },
      treat: { none: 1 },
      cam: { beatPunch: 1.6, bounce: 1, push: 1 },
      trans: { knStutterCut: 0.6, knCornerSwing: 0.6 },
      fx: { zoomPunch: 1, squash: 1, rotateSnap: 0.6, mirrorFlash: 0.4 },
    },
  },
  bsScale: {
    name: '大小', desc: '大きな一語と小さな一行の対比・生成り地に墨・余白で見せる', moods: ['editorial', 'graphic'], chorusHit: true, oneCut: 0.6, ghost: 0.1, glitchBoost: 0.4,
    schemes: [
      { bg: '#EFEBE3', fg: '#141414', sub: '#6E6A62', accent: '#D0341C', accent2: '#141414', ink: '#141414', dim: '#E4DFD5', ghostA: '#D0341C', ghostB: '#3A6BD9' },
      { bg: '#141414', fg: '#EFEBE3', sub: '#8C877E', accent: '#FF5A36', accent2: '#EFEBE3', ink: '#EFEBE3', dim: '#1D1D1D', ghostA: '#FF5A36', ghostB: '#4F86FF' },
    ],
    fonts: { display: ['gothic_black', 'mincho_black'], serif: ['mincho', 'shippori'], body: ['gothic_med', 'mincho'], mono: ['mono'] },
    pool: {
      layout: { bsScaleLine: 2.6, mixed: 1.4, huge: 1, bsBeatWord: 1, center: 0.6 },
      enter: { cut: 2.5, fadeStagger: 1, trackIn: 0.8, riseMask: 0.8, blur: 0.5 },
      exit: { cut: 3, blur: 0.8, riseOut: 0.6, trackOutWide: 0.5 },
      hold: { still: 1.5, drift: 0.8, breathe: 0.5 },
      treat: { none: 2, knWordScale: 1 },
      cam: { push: 1.5, beatPunch: 0.8, driftDiag: 0.6 },
      trans: {},
      fx: { zoomPunch: 0.6, defocus: 0.4 },
    },
  },
  bsBallad: {
    name: '夜の打鍵', desc: '一文字ずつ拍に乗せて打ち込む・夜の紺に明朝・静かな動き', moods: ['calm', 'emotional'], oneCut: 0.5, ghost: 0.06, glitchBoost: 0.01,
    schemes: [
      { bg: '#0D1526', fg: '#EEF1F7', sub: '#8793AD', accent: '#9CC3FF', accent2: '#EEF1F7', ink: '#EEF1F7', dim: '#141E33', ghostA: '#9CC3FF', ghostB: '#C39CFF' },
      { bg: '#F3F1EC', fg: '#1C2233', sub: '#7A8094', accent: '#3D5A99', accent2: '#1C2233', ink: '#1C2233', dim: '#E9E6DF', ghostA: '#3D5A99', ghostB: '#99583D' },
    ],
    fonts: { display: ['mincho_bold', 'shippori'], serif: ['mincho', 'mincho_light', 'shippori'], body: ['mincho'], mono: ['mono'] },
    pool: {
      layout: { bsTypeBeat: 2.6, center: 1, hanging: 0.8, bsScaleLine: 0.4 },
      enter: { cut: 1.5, type: 1, fadeStagger: 1.2, blurStagger: 1, blur: 0.8 },
      exit: { blur: 1.2, dissolve: 1, blurOutStagger: 1, riseOut: 0.6 },
      hold: { still: 1.5, drift: 1, breathe: 0.8 },
      treat: { none: 1 },
      cam: { push: 1.5, driftDiag: 1, pullOut: 0.6 },
      trans: {},
      fx: {},
    },
  },
};
for (const [k, v] of Object.entries(S)) {
  if (J.STYLES[k]) continue;
  J.STYLES[k] = Object.assign({ bias: {} }, BASE, v);
  J.STYLES[k].pool = Object.assign({ decor: {}, bg: {} }, v.pool);        // テキストのみ: nothing to draw there anyway
  if (!J.STYLE_ORDER.includes(k)) J.STYLE_ORDER.push(k);
}
})();
