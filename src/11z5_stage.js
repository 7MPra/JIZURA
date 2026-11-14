/* ============================================================
   JIZURA — ステージ (stage): directed presets
   A stage style does not draw one isolated layout per cut. The whole song is one continuous space:
     · every cut is a "shot" — a page of type composed on a grid (scale contrast, one lead word, the rest small)
     · the pages are laid side by side (or turned, or nested inside each other); a camera travels from page to page on
       the cut — pan, quarter turn, or a dolly into the next page — with real motion blur (sub-frame accumulation)
     · each page carries its own colour field, so a colour change is an edge that slides through the frame
     · words arrive on the beat inside the shot (masked rise, slam, tracking, focus pull)
     · abstract geometry only — plate, disc, ring, rule, bar. A plate or disc is a *lens*: the type under it is redrawn
       in the counter colour, so shape and type are one image instead of a decoration next to the lyric
     · finishing: fine grain; nothing else (no glow, no colour split, no vignette unless the preset asks)
   A style opts in with `stage: {…}` (see STYLES at the end). Its cuts are planned by the usual planner from the stage
   layouts (poolOnly), which only choose the composition; this file draws the frame (Renderer.frame is routed here).
   ============================================================ */
(() => {
'use strict';
const clamp = J.clamp, lerp = J.lerp, E = J.E, K = J.beatKit, DEG = Math.PI / 180, TAU = Math.PI * 2;
const PACK = 'stage';
if (J.SETS && !J.SETS.stage) J.SETS.stage = { on: true };     // its own part set (no switch: the layouts are poolOnly)
const bez = (x1, y1, x2, y2) => {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t, sy = t => ((ay * t + by) * t + cy) * t, dx = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => { if (x <= 0) return 0; if (x >= 1) return 1; let t = x; for (let i = 0; i < 8; i++) { const d = sx(t) - x, s = dx(t); if (Math.abs(d) < 1e-6 || !s) break; t = clamp(t - d / s); } return sy(t); };
};
const CAM = bez(0.76, 0, 0.14, 1);        // camera travel: slow out of the page, fast through the middle, a long settle
const OUT = bez(0.16, 1, 0.3, 1);         // arrive and settle
const SOFT = bez(0.4, 0, 0.2, 1);
const IN = bez(0.6, 0, 0.9, 0.4);         // leave
const KAN = /[㐀-鿿豈-﫿々〆ヵヶ]/;
const hasLatin = t => /[A-Za-z]/.test(String(t || ''));
const isJP = t => /[぀-ヿ㐀-鿿]/.test(String(t || ''));
const glyphs = t => [...String(t || '').replace(/\s+/g, '')];
const strip = t => (hasLatin(t) && !isJP(t) ? String(t).trim() : String(t || '').replace(/\s+/g, ''));
/* グリーンバック: a stage frame keeps its colours — only the ground turns key green. Colours a keyer would take for the
   key (yellow-greens, greens, mints) are turned away from it, and nothing is ever drawn across the whole frame. */
let KEYG = false, FLAT = false;          // FLAT: no full-frame colour fields (green key or transparent export)
const keySafe = c => {
  if (typeof c !== 'string' || !/^#[0-9a-f]{6}$/i.test(c)) return c;
  const [h, sat, l] = J.toHsl(c);
  if (sat < 0.25 || h < 70 || h > 175) return c;
  return J.hsl(h < 115 ? 52 : 192, sat, Math.min(l, 0.62));
};
/* グリーンバック (PR #2 の原則に合わせて): the type is white on the key, always. A style colour is used only as a third
   colour — the plates, discs and the lit band of a wall — and only on those can the type be something other than white
   (dark, when white would not read on that colour). */
const chroma = c => { const [, sat, l] = J.toHsl(c); return sat * (1 - Math.abs(2 * l - 1)); };
J.keyColourStyle = st => {
  const hex = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
  // the style's own colour: the most chromatic one any of its schemes uses (a scheme with none takes it too)
  const all = st.schemes.flatMap(s => [s.accent, s.bg, s.fg, s.accent2]).filter(hex), sig = all.slice().sort((a, b) => chroma(b) - chroma(a))[0];
  st.schemes = st.schemes.map(s => {
    const cols = [s.accent, s.bg, s.fg, s.accent2].filter(hex);
    const third = keySafe(cols.filter(c => chroma(c) > 0.25).sort((a, b) => chroma(b) - chroma(a))[0] || (sig && chroma(sig) > 0.25 ? sig : s.accent));
    const dark = cols.slice().sort((a, b) => J.lum(a) - J.lum(b))[0];
    const onThird = J.contrast('#FFFFFF', third) >= 2.4 ? '#FFFFFF' : (J.lum(dark) < 0.2 ? dark : '#111111');
    return { bg: J.KEY_BG.green, fg: '#FFFFFF', sub: '#D2D2D2', accent: third, accent2: '#FFFFFF', ink: '#FFFFFF', dim: '#1E1E1E', ghostA: '#9A9A9A', ghostB: '#5E5E5E', lensFg: onThird };
  });
  st.texture = { grain: 0, paper: 0, scan: 0 };
  st.key = true; st.keyColour = true;
};
const gnd = sc => (KEYG ? J.KEY_BG.green : sc.bg);
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; };

// compositions are cached per cut; a font arriving (J.metrics.clear) invalidates them
let gen = 0;
if (J.metrics && !J.metrics.stageHook) { const c0 = J.metrics.clear.bind(J.metrics); J.metrics.clear = () => { gen++; c0(); }; J.metrics.stageHook = true; }

/* ------------------------------------------------------------------ composition */
const TRK = { d: -0.02, b: 0.04 };
function block(text, font, size, x, y, o) {
  const b = Object.assign({ text, font, size, x, y, track: 0, u: 0, lead: false, vertical: false, col: 'fg' }, o || {});
  const m = J.measure({ text, font, size, track: b.track, vertical: b.vertical, lead: b.lh });
  b.w = m.w; b.h = m.h;
  return b;
}
const fit = (text, font, maxW, maxH, o) => Math.min(J.fitSize(text, font, maxW, maxH * 4, o), maxH);
function leadOf(units, cut, plan) {
  const L = plan && plan.lines && plan.lines[cut.line], em = (L && L.emph) || [];
  let best = 0, bv = -1;
  units.forEach((w, i) => {
    const g = glyphs(w);
    let v = g.filter(ch => KAN.test(ch)).length * 2 + Math.min(g.length, 6) * 0.5 + (i === units.length - 1 ? 0.6 : 0);
    if (em.some(e => w.includes(e) || e.includes(w))) v += 20;
    if (/[!！?？]/.test(w)) v += 1.5;
    if (g.length <= 1 && units.length > 1) v -= 3;
    if (v > bv) { bv = v; best = i; }
  });
  return best;
}
/* words stacked on a shared edge inside a box: the lead word as large as the box takes, the rest small and light */
function stackIn(c, box, units, u0, lead, side) {
  const n = units.length, out = [];
  const leadH = box.h * (n <= 1 ? 0.62 : n === 2 ? 0.5 : n === 3 ? 0.42 : 0.36);
  const sizes = units.map((w, i) => (i === lead ? fit(w, c.fd, box.w, leadH, { track: TRK.d }) : 0));
  const sub = clamp(sizes[lead] * (n <= 2 ? 0.42 : n === 3 ? 0.36 : 0.3), c.U * 0.058, c.U * 0.16);
  units.forEach((w, i) => { if (i !== lead) sizes[i] = fit(w, c.fb, box.w * 0.92, sub, { track: TRK.b }); });
  const lh = i => sizes[i] * (i === lead ? 1.02 : 1.42);
  let tot = units.reduce((a, _, i) => a + lh(i), 0);
  const k = Math.min(1, box.h / tot);
  let y = box.y - tot * k / 2;
  units.forEach((w, i) => {
    const s = sizes[i] * k, h = lh(i) * k, isL = i === lead;
    const b = block(w, isL ? c.fd : c.fb, s, 0, y + h / 2, { track: isL ? TRK.d : TRK.b, u: u0 + i, lead: isL });
    b.x = side < 0 ? box.x - box.w / 2 + b.w / 2 : side > 0 ? box.x + box.w / 2 - b.w / 2 : box.x;
    out.push(b); y += h;
  });
  return out;
}
const COMPOSE = {
  /* 組み: a flush stack */
  stStack(c) {
    const n = Math.min(c.units.length, isJP(c.text) ? 4 : 3), units = c.merge(n), lead = leadOf(units, c.cut, c.plan);
    const side = c.v.side;
    const blocks = stackIn(c, { x: 0, y: 0, w: c.W - 2 * c.m, h: c.H * (c.port ? 0.62 : 0.76) }, units, 0, lead, side);
    return { blocks, n: units.length, lead };
  },
  /* 一語: one word at a time, as large as the page takes; the next one replaces it */
  stMono(c) {
    const maxN = clamp(Math.floor((c.cut.dur - 0.25) / 0.42), 1, 4), units = c.merge(Math.min(c.units.length, maxN));
    const blocks = units.map((w, i) => {
      let t = w, g = glyphs(w).length;
      if (c.port && g > 4 && !hasLatin(w)) t = J.splitLines(w, Math.ceil(g / 2));
      else if (c.port && hasLatin(w) && /\s/.test(w) && w.length > 9) t = J.splitLines(w, Math.ceil(w.length / 2));
      const lines = t.split('\n').length;
      const s = fit(t, c.fd, c.W - 2 * c.m, c.H * (c.port ? 0.2 : 0.56) , { track: TRK.d, lead: 1.04 }) ;
      return block(t, c.fd, s, 0, (i % 2 ? 1 : -1) * c.H * 0.012 * (units.length > 1 ? 1 : 0), { track: TRK.d, u: i, lead: true, solo: units.length > 1, lh: 1.04, lines });
    });
    return { blocks, n: units.length, lead: 0 };
  },
  /* 縦: vertical columns, the first one large, the rest stepping down beside it */
  stColumn(c) {
    if (!isJP(c.text)) return COMPOSE.stStack(c);
    const maxG = c.port ? 9 : 6;
    const cols = []; let cur = '';
    for (const w of c.units) { if (cur && glyphs(cur + w).length > maxG) { cols.push(cur); cur = w; } else cur += w; }
    if (cur) cols.push(cur);
    if (cols.length > 4 || cols.some(t => glyphs(t).length > maxG + 3)) return COMPOSE.stStack(c);
    const s0 = Math.min(c.H * 0.84 / Math.max(2.4, glyphs(cols[0]).length), c.W * (c.port ? 0.3 : 0.2));
    const top = -c.H * 0.42, blocks = [];
    let x = c.v.side > 0 ? c.W * 0.5 - c.m - s0 / 2 : c.v.side < 0 ? -c.W * 0.5 + c.m + s0 * 0.5 + (cols.length - 1) * s0 * 0.7 : (cols.length - 1) * s0 * 0.36;
    cols.forEach((t, i) => {
      const s = i === 0 ? s0 : Math.min(s0 * 0.46, c.H * 0.6 / Math.max(2, glyphs(t).length));
      const b = block(t, i === 0 ? c.fd : c.fb, s, x, 0, { vertical: true, track: i === 0 ? 0 : 0.08, u: i, lead: i === 0 });
      b.y = top + (i === 0 ? 0 : s0 * 0.62 * i) + b.h / 2;
      if (b.y + b.h / 2 > c.H * 0.46) b.y = c.H * 0.46 - b.h / 2;
      blocks.push(b);
      x -= (i === 0 ? s0 * 0.5 : s * 0.5) + (i + 1 < cols.length ? Math.min(s0 * 0.46, c.H * 0.6 / Math.max(2, glyphs(cols[i + 1]).length)) * 0.5 : 0) + s0 * 0.22;
    });
    return { blocks, n: cols.length, lead: 0, vertical: true };
  },
  /* 交差: the lead word across, what comes before it small above, what follows hanging down as a column */
  stCross(c) {
    if (!isJP(c.text) || c.units.length < 2) return COMPOSE.stStack(c);
    const units = c.merge(Math.min(c.units.length, 4)), lead = leadOf(units, c.cut, c.plan);
    if (c.port && glyphs(units[lead]).length > 4) return COMPOSE.stStack(c);
    const before = units.slice(0, lead).join(''), after = units.slice(lead + 1).join('');
    if (glyphs(after).length > (c.port ? 8 : 6) || glyphs(before).length > 9) return COMPOSE.stStack(c);
    const L = fit(units[lead], c.fd, c.W * (c.port ? 0.74 : 0.56), c.H * (c.port ? 0.2 : 0.34), { track: TRK.d });
    const lw = J.measure({ text: units[lead], font: c.fd, size: L, track: TRK.d }).w;
    const sv = after ? Math.min(L * 0.44, c.H * 0.46 / Math.max(2, glyphs(after).length)) : 0;
    const x0 = -(lw + (after ? sv * 1.1 : 0)) / 2 - (c.port ? 0 : c.W * 0.06), y0 = -c.H * (after ? 0.14 : 0.02);
    const blocks = [];
    if (before) { const s = fit(before, c.fb, lw * 0.9, Math.max(c.U * 0.06, L * 0.34), { track: TRK.b }); const b = block(before, c.fb, s, 0, y0 - L * 0.5 - s * 0.72, { track: TRK.b, u: 0 }); b.x = x0 + b.w / 2 + L * 0.04; blocks.push(b); }
    blocks.push(block(units[lead], c.fd, L, x0 + lw / 2, y0, { track: TRK.d, u: before ? 1 : 0, lead: true }));
    if (after) { const b = block(after, c.fb, sv, x0 + lw + sv * 0.62, 0, { vertical: true, track: 0.06, u: (before ? 1 : 0) + 1 }); b.y = y0 - L * 0.46 + b.h / 2; blocks.push(b); }
    return { blocks, n: (before ? 1 : 0) + 1 + (after ? 1 : 0), lead: before ? 1 : 0, cross: true };
  },
  /* 分割: the page cut in two colour fields, the line set across both */
  stSplit(c) {
    const units = c.merge(Math.min(c.units.length, 3)), n = units.length, cutAt = n <= 1 ? 0 : Math.max(1, Math.round(n / 2));
    // two sides only when both halves are short enough to be set large in their field; otherwise the line stays whole
    // and the edge between the fields runs through it
    const short = t => (hasLatin(t) && !isJP(t) ? t.length <= 7 : glyphs(t).length <= 4);
    const two = n > 1 && short(units.slice(0, cutAt).join(' ')) && short(units.slice(cutAt).join(' '));
    const k = two || c.v.r < 0.5 ? 0.5 : c.v.r < 0.75 ? 0.4 : 0.6, flip = c.v.side > 0;
    const horiz = !c.port;                                   // landscape: left | right, portrait: top / bottom
    const A = horiz ? { x: -c.W / 2 + c.W * k / 2, y: 0, w: c.W * k - c.m * 1.6, h: c.H * 0.7 } : { x: 0, y: -c.H / 2 + c.H * k / 2, w: c.W - 2 * c.m, h: c.H * k - c.m * 2.4 };
    const B = horiz ? { x: -c.W / 2 + c.W * k + c.W * (1 - k) / 2, y: 0, w: c.W * (1 - k) - c.m * 1.6, h: c.H * 0.7 } : { x: 0, y: -c.H / 2 + c.H * k + c.H * (1 - k) / 2, w: c.W - 2 * c.m, h: c.H * (1 - k) - c.m * 2.4 };
    let blocks;
    if (!two) blocks = stackIn(c, { x: 0, y: 0, w: c.W - 2 * c.m, h: c.H * 0.72 }, units, 0, leadOf(units, c.cut, c.plan), 0);
    else {
      const ua = units.slice(0, cutAt), ub = units.slice(cutAt);
      blocks = stackIn(c, A, ua, 0, leadOf(ua, c.cut, c.plan), horiz ? 1 : -1).concat(stackIn(c, B, ub, cutAt, leadOf(ub, c.cut, c.plan), -1));
      // only one of the two leads the page: the other side is set at most as large as 62% of it
      const li = blocks.reduce((b, x, i) => (x.lead && x.size > blocks[b].size ? i : b), blocks.findIndex(x => x.lead));
      blocks.forEach((b, i) => { if (b.lead && i !== li) b.lead2 = true; });
    }
    const edge = horiz ? -c.W / 2 + c.W * k : -c.H / 2 + c.H * k;
    return { blocks, n, lead: blocks.findIndex(b => b.lead), split: { horiz, edge, flip } };
  },
};
const LAYOUT_KEYS = Object.keys(COMPOSE);

/* geometry for a composition: at most two shapes, placed from the type's own boxes */
function geometry(c, comp, G) {
  const out = [], rng = c.rng, U = c.U, B = comp.blocks; let lead = B.find(b => b.lead) || B[0];
  if (!lead) return out;
  const BIG = Math.max(c.W, c.H) * 4;
  if (lead.solo) for (const b of B) if (b.w > lead.w) lead = b;
  const lb = { x0: lead.x - lead.w / 2, x1: lead.x + lead.w / 2, y0: lead.y - lead.h / 2, y1: lead.y + lead.h / 2 };
  const pickG = (opts) => { const cand = opts.filter(k => (G[k] || 0) > 0).map(k => [k, G[k]]); return cand.length ? rng.wpick(cand) : null; };
  if (comp.split) {
    const s2 = comp.split;
    out.push(s2.horiz ? { type: 'plate', lens: true, x0: s2.flip ? -BIG : s2.edge, x1: s2.flip ? s2.edge : BIG, y0: -BIG, y1: BIG, from: s2.flip ? 'l' : 'r', t: 0, dur: 0.7 }
      : { type: 'plate', lens: true, x0: -BIG, x1: BIG, y0: s2.flip ? -BIG : s2.edge, y1: s2.flip ? s2.edge : BIG, from: s2.flip ? 't' : 'b', t: 0, dur: 0.7 });
    return out;
  }
  // a hairline (only the quiet presets weight it) runs from the lead out of the page
  const kind = comp.vertical ? pickG(['rule', 'disc', 'ring', 'none']) : lead.solo ? pickG(['disc', 'ring', 'plate', 'none']) : pickG(['plate', 'disc', 'ring', 'rule', 'none']);
  const tl = lead.solo ? 0 : lead.u;                                          // the shape arrives with the lead word
  if (kind === 'plate') {
    const pad = lead.size * 0.12, v = rng.int(0, 2);
    if (lead.vertical) out.push({ type: 'plate', lens: true, x0: lb.x0 - pad, x1: lb.x1 + pad, y0: -BIG, y1: lb.y1 + pad, from: 't', tu: tl, lead: -0.06, dur: 0.5 });
    else if (v === 0) out.push({ type: 'plate', lens: true, x0: -BIG, x1: lb.x1 + pad * 1.6, y0: lb.y0 - pad * 0.3, y1: lb.y1 + pad * 0.3, from: 'l', tu: tl, lead: -0.06, dur: 0.5 });      // a band in from the left edge
    else if (v === 1) out.push({ type: 'plate', lens: true, x0: lb.x0 + lead.w * rng.range(0.3, 0.6), x1: BIG, y0: -BIG, y1: BIG, from: 'r', tu: tl, lead: -0.04, dur: 0.6 });                 // a field that cuts the word
    else out.push({ type: 'plate', lens: true, x0: -BIG, x1: BIG, y0: lead.y + lead.size * rng.range(-0.12, 0.1), y1: BIG, from: 'b', tu: tl, lead: -0.04, dur: 0.6 });                        // the lower half of the page
  } else if (kind === 'disc') {
    const r = clamp(Math.max(lead.h, Math.min(lead.w, lead.h * 2.4)) * rng.range(0.5, 0.72), U * 0.16, U * 0.46);
    const ex = rng.pick([-1, 1]) * (lead.w / 2) * rng.range(0.35, 0.95), ey = rng.range(-0.25, 0.25) * lead.h;
    out.push({ type: 'disc', lens: true, cx: lead.x + ex, cy: lead.y + ey, r, tu: tl, lead: -0.05, dur: 0.6, ph: rng.range(0, TAU) });
  } else if (kind === 'rule') {
    const lw = Math.max(1.5, U * 0.0028);
    if (comp.vertical) { const x = lb.x0 - lead.size * 0.16; out.push({ type: 'rule', x0: x, y0: -BIG, x1: x, y1: lb.y1, len: c.H, lw, t: 0, dur: 0.8 }); }
    else { const y = lb.y1 + lead.size * 0.06; out.push({ type: 'rule', x0: lb.x0, y0: y, x1: BIG, y1: y, len: c.W, lw, t: 0, dur: 0.8 }); }
  } else if (kind === 'ring') {
    const r = clamp(Math.max(lead.w, lead.h) * rng.range(0.42, 0.6), U * 0.2, U * 0.52);
    out.push({ type: 'ring', cx: lead.x + rng.range(-0.2, 0.2) * lead.w, cy: lead.y + rng.range(-0.1, 0.1) * lead.h, r, lw: Math.max(1.5, U * 0.0028), a0: rng.range(0, 360), dir: rng.pick([1, -1]), t: 0, dur: 1.1 });
  }
  return out;
}

/* ------------------------------------------------------------------ shots */
const stages = new WeakMap();
function stageOf(plan) {
  let S = stages.get(plan);
  if (S && S.gen === gen) return S;
  S = { gen, shots: plan.cuts.map((cut, i) => ({ cut, i, comp: null })) };
  const P = plan.style.stage || {};
  // the step from each page to the next: travel, direction, relative scale and turn
  let dirI = 0;
  S.shots.forEach((sh, i) => {
    const c = sh.cut, v = (c.params && c.params.st) || {}, prev = i > 0 ? S.shots[i - 1] : null;
    const rng = J.rng(J.h(c.seed | 0, i, 977));
    let travel = v.travel || rng.wpick(Object.entries(P.travel || { pan: 1 }));
    const lvl = c.level ?? 1, plv = prev ? prev.cut.level ?? 1 : lvl;
    if (!prev || (lvl >= 2 && !v.travel)) travel = 'cut';
    sh.travel = travel;
    const dur = Math.max(0.2, c.dur), pd = prev ? Math.max(0.2, prev.cut.dur) : 1;
    sh.T = travel === 'cut' ? 0 : clamp(Math.min(dur, pd) * 0.55, 0.3, 0.62) * (P.moveDur || 1);
    sh.pre = sh.T * 0.3;
    if (prev && Math.abs(prev.cut.end - c.start) > 0.08) sh.pre = Math.min(sh.pre, Math.max(0, c.start - prev.cut.end));
    const W = plan.W, H = plan.H;
    let rel = { x: 0, y: 0, rot: 0, s: 1 };
    if (travel === 'pan' || travel === 'turn') {
      const dirs = P.dirs || [[1, 0], [0, 1], [1, 0], [0, -1]], d = dirs[(dirI++) % dirs.length];
      const rot = travel === 'turn' ? (rng.chance(0.5) ? 90 : -90) : 0;
      const s = rng.pick(P.scales || [1]);
      const cr = Math.cos(-rot * DEG), sr = Math.sin(-rot * DEG), dx = d[0] * cr - d[1] * sr, dy = d[0] * sr + d[1] * cr;
      const ext = Math.abs(d[0]) * W / 2 + Math.abs(d[1]) * H / 2 + (Math.abs(dx) * W / 2 + Math.abs(dy) * H / 2) * s;
      rel = { x: d[0] * ext, y: d[1] * ext, rot, s };
    } else if (travel === 'dolly') {
      rel = { x: rng.range(-0.22, 0.22) * W, y: rng.range(-0.2, 0.2) * H, rot: rng.pick(P.tilts || [0]), s: P.dollyScale || 0.12 };
    }
    sh.rel = rel;
    // the previous page seen from this one
    const a = -rel.rot * DEG, ix = -(rel.x * Math.cos(a) - rel.y * Math.sin(a)) / rel.s, iy = -(rel.x * Math.sin(a) + rel.y * Math.cos(a)) / rel.s;
    sh.inv = { x: ix, y: iy, rot: -rel.rot, s: 1 / rel.s };
    const next = plan.cuts[i + 1];
    sh.lyric = c.layout !== 'interlude' && !!String(c.text || '').trim();
    const nextLyric = next && next.layout !== 'interlude' && String(next.text || '').trim() && Math.abs(next.start - c.end) < 0.3;
    const nl = next ? next.level ?? 1 : lvl, bl = K.beatLen({ plan }, c.end);
    // タメ: before a jump of two levels the frame empties for most of a beat
    sh.exitAt = !nextLyric ? Math.max(0.2, dur - 0.36) : nl - lvl >= 2 && dur > bl * 2.2 ? dur - bl * 0.8 : null;
  });
  stages.set(plan, S);
  return S;
}
function compose(plan, sh) {
  if (sh.comp && sh.compGen === gen) return sh.comp;
  const c = sh.cut, st = plan.style, P = st.stage || {}, W = plan.W, H = plan.H, U = Math.min(W, H);
  const v = Object.assign({ side: -1, r: 0.5, enter: null, sub: null, seed: c.seed | 0 }, (c.params && c.params.st) || {});
  const rng = J.rng(J.h(c.seed | 0, 31, 7));
  const text = strip(c.text);
  let units = K.unitsOf(c, 8).map(strip).filter(Boolean);
  if (!units.length) units = [text];
  const ctx = {
    W, H, U, m: U * 0.085, port: H > W * 1.08, text, units, cut: c, plan, rng, v,
    fd: J.fontsOf(st, ['display'])[0], fb: J.fontsOf(st, ['body'])[0],
    merge: n => K.unitsOf(c, Math.max(1, n)).map(strip).filter(Boolean),
  };
  const key = COMPOSE[c.layout] ? c.layout : 'stStack';
  let comp;
  try { comp = COMPOSE[key](ctx); } catch (e) { comp = null; }
  if (!comp || !comp.blocks.length) comp = { blocks: [block(text, ctx.fd, fit(text, ctx.fd, W - 2 * ctx.m, H * 0.3), 0, 0, { lead: true })], n: 1, lead: 0 };
  comp.geo = geometry(ctx, comp, P.geo || {});
  // word onsets on the beat grid, shape onsets tied to them
  const fake = { cut: c, plan };
  comp.ts = K.onsets(fake, comp.n);
  const L = plan.lines && plan.lines[c.line], em = (L && L.emph) || [];
  for (const b of comp.blocks) {
    b.t = comp.ts[Math.min(b.u, comp.ts.length - 1)] || 0;
    b.tNext = b.solo && b.u + 1 < comp.ts.length ? comp.ts[b.u + 1] : null;
    if (em.length && em.some(e => b.text.includes(e)) && comp.blocks.length > 1) b.col = 'accent';
    const pool = b.lead ? (P.enter && P.enter.lead) || { rise: 1 } : (P.enter && P.enter.sub) || { rise: 1 };
    b.enter = b.vertical ? (pool.drop ? 'drop' : pool.focus ? 'focus' : 'drop') : rng.wpick(Object.entries(pool));
    if (b.solo && b.u > 0 && pool.slam) b.enter = 'slam';
  }
  for (const g of comp.geo) g.t0 = (g.tu != null ? comp.ts[Math.min(g.tu, comp.ts.length - 1)] || 0 : g.t || 0) + (g.lead || 0);
  // words waiting to be sung: all of them as hairline outlines (true), only the lead as an outline ('lead') or as a
  // faint fill ('dim') — so the page has its composition from the first moment and the lead is anticipated
  comp.ghost = P.ghost && comp.blocks.length > 1 && !comp.blocks.some(b => b.solo) ? P.ghost : null;
  sh.comp = comp; sh.compGen = gen;
  return comp;
}

/* ------------------------------------------------------------------ drawing a shot (page space, origin = page centre) */
function geoPath(ctx, g, lt, beatK, U) {
  const q = clamp((lt - g.t0) / g.dur), e = OUT(q);
  if (q <= 0) return false;
  if (g.type === 'plate') {
    let { x0, x1, y0, y1 } = g;
    const LIM = U * 6;                                        // "infinite" sides wipe in over a finite distance
    const w = Math.min(x1 - x0, LIM * 2), h = Math.min(y1 - y0, LIM * 2);
    if (g.from === 'l') x1 = x0 > -LIM ? x0 + (x1 - x0) * e : x1 - (1 - e) * Math.min(w, U * 2.2);
    else if (g.from === 'r') x0 = x1 < LIM ? x1 - (x1 - x0) * e : x0 + (1 - e) * Math.min(w, U * 2.2);
    else if (g.from === 't') y1 = y0 > -LIM ? y0 + (y1 - y0) * e : y1 - (1 - e) * Math.min(h, U * 2.2);
    else y0 = y1 < LIM ? y1 - (y1 - y0) * e : y0 + (1 - e) * Math.min(h, U * 2.2);
    if (x1 - x0 < 0.5 || y1 - y0 < 0.5) return false;
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    return true;
  }
  if (g.type === 'disc') {
    const r = g.r * e * (1 + 0.035 * beatK);
    if (r < 0.5) return false;
    ctx.arc(g.cx + Math.sin(lt * 0.5 + g.ph) * U * 0.012, g.cy + Math.cos(lt * 0.4 + g.ph) * U * 0.009, r, 0, TAU);
    return true;
  }
  return false;
}
function drawStrokes(ctx, comp, lt, pal, beatK, U, out) {
  for (const g of comp.geo) {
    if (g.type !== 'ring' && g.type !== 'rule') continue;
    const q = clamp((lt - g.t0) / g.dur); if (q <= 0) continue;
    const e = SOFT(q);
    ctx.save(); ctx.globalAlpha = out; ctx.strokeStyle = pal.accent; ctx.lineWidth = g.lw; ctx.lineCap = 'butt'; ctx.beginPath();
    if (g.type === 'ring') { const a0 = (g.a0 + g.dir * lt * 6) * DEG; ctx.arc(g.cx, g.cy, g.r * (1 + 0.012 * beatK), a0, a0 + g.dir * TAU * e, g.dir < 0); }
    else { const dx = g.x1 - g.x0, dy = g.y1 - g.y0, d = Math.hypot(dx, dy) || 1, len = Math.min(d, g.len * 1.6) * e; ctx.moveTo(g.x0, g.y0); ctx.lineTo(g.x0 + dx / d * len, g.y0 + dy / d * len); }
    ctx.stroke(); ctx.restore();
  }
}
function drawBlocks(env, comp, lt, pal, sh, U) {
  const ctx = env.ctx, exitAt = sh.exitAt;
  for (let bi = 0; bi < comp.blocks.length; bi++) {
    const b = comp.blocks[bi];
    const dt = lt - b.t;
    const col = b.col === 'accent' && !KEYG ? pal.accent : pal.fg;          // グリーンバック: white on the key
    const n = Math.max(1, glyphs(b.text).length);
    // not sung yet: nothing, or (ghost presets) the word waiting as a hairline outline
    if (dt < 0) {
      if (comp.ghost === true || (comp.ghost && b.lead)) {
        const a = SOFT(clamp((lt + 0.02 - bi * 0.03) / 0.35)) * (exitAt != null ? 1 - clamp((lt - exitAt) / 0.2) : 1);
        const g = { text: b.text, font: b.font, size: b.size, x: b.x, y: b.y, track: b.track, vertical: b.vertical, lead: b.lh, color: pal.fg };
        if (a > 0.01) J.drawItem(env, comp.ghost === 'dim' ? Object.assign(g, { alpha: a * 0.09 }) : Object.assign(g, { fill: false, stroke: Math.max(1.2, b.size * 0.011), strokeColor: pal.fg, alpha: a * (comp.ghost === true ? 0.5 : 0.38) }));
      }
      continue;
    }
    const it = { text: b.text, font: b.font, size: b.size, x: 0, y: 0, track: b.track, vertical: b.vertical, lead: b.lh, color: col, alpha: 1 };
    let mask = false, fns = [];
    // ---- entrance
    const kind = b.enter;
    if (kind === 'rise') {
      const D = 0.5, stg = Math.min(0.028, 0.16 / n);
      if (dt < D + stg * n) { mask = true; fns.push((i) => { const q = clamp((dt - i * stg) / D); return q >= 1 ? null : { dy: (1 - OUT(q)) * b.size * 1.08 }; }); }
    } else if (kind === 'slam') {
      const q = clamp(dt / 0.26);
      if (q < 1) { const e = OUT(q); it.sx = it.sy = 1 + 0.42 * (1 - e); it.alpha = Math.min(1, q * 5); }
    } else if (kind === 'track') {
      const q = clamp(dt / 0.9);
      if (q < 1) { const e = OUT(q); it.alpha = SOFT(clamp(q * 1.6)); fns.push((i, g) => ({ dx: g.x * 0.5 * (1 - e) })); }
    } else if (kind === 'drop') {
      const D = 0.42, stg = Math.min(0.05, 0.3 / n);
      if (dt < D + stg * n) fns.push((i) => { const q = clamp((dt - i * stg) / D); return q >= 1 ? null : q <= 0 ? { hide: true } : { dy: -(1 - OUT(q)) * b.size * 0.5, a: Math.min(1, q * 3.2) }; });
    } else if (kind === 'focus') {
      const q = clamp(dt / 0.6);
      if (q < 1) { const e = OUT(q); it.blur = (1 - e) * b.size * 0.22; it.alpha = SOFT(clamp(q * 1.8)); it.sx = it.sy = 1 + 0.06 * (1 - e); }
    } else if (kind === 'slide') {
      const D = 0.5;
      if (dt < D) { mask = true; const e = OUT(clamp(dt / D)); it.x -= (1 - e) * (b.w + b.size * 0.3) * (b.x > 0 ? -1 : 1); }
    }
    // ---- a solo word is replaced by the next one
    if (b.tNext != null && lt >= b.tNext - 0.02) {
      const q = clamp((lt - (b.tNext - 0.02)) / 0.12);
      if (q >= 1) continue;
      mask = true; fns.push(() => ({ dy: -IN(q) * b.size * 1.1 }));
    }
    // ---- the page empties (nothing follows directly)
    if (exitAt != null && lt > exitAt + bi * 0.03) {
      const q = clamp((lt - exitAt - bi * 0.03) / 0.26);
      if (q >= 1) continue;
      if (b.vertical || kind === 'focus' || kind === 'track') it.alpha *= 1 - SOFT(q);
      else { mask = true; fns.push(() => ({ dy: IN(q) * b.size * 1.1 })); }
    }
    if (fns.length) it.charFn = fns.length === 1 ? fns[0] : (i, g, N) => { let o = null; for (const f of fns) { const r = f(i, g, N); if (!r) continue; if (r.hide) return r; if (!o) o = { dx: 0, dy: 0, a: 1 }; o.dx += r.dx || 0; o.dy += r.dy || 0; o.a *= r.a ?? 1; } return o; };
    const drift = (b.lead ? 1 : -0.7) * Math.max(0, lt) * U * 0.007;
    ctx.save(); ctx.translate(b.x + (b.vertical ? 0 : drift), b.y + (b.vertical ? drift : 0));
    if (mask) { const px = b.size * 0.6, py = b.size * 0.09; ctx.beginPath(); ctx.rect(-b.w / 2 - px, -b.h / 2 - py, b.w + px * 2, b.h + py * 2); ctx.clip(); }
    J.drawItem(env, it);
    ctx.restore();
  }
}
/* interlude: one quiet abstract figure keeping time */
function drawIdle(ctx, plan, sh, lt, pal, beat, U) {
  const P = plan.style.stage || {}, kind = P.idle || 'ring', c = sh.cut;
  const a = SOFT(clamp(lt / 0.5)) * (1 - SOFT(clamp((lt - (c.dur - 0.45)) / 0.4)));
  if (a <= 0.01) return;
  const bk = beat ? Math.exp(-beat.since * 6) : 0, bi = beat ? beat.index : Math.floor(lt * 2);
  ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = pal.accent; ctx.fillStyle = pal.accent; ctx.lineWidth = Math.max(1.5, U * 0.003);
  if (kind === 'ring') {
    ctx.beginPath(); ctx.arc(0, 0, U * (0.12 + 0.02 * bk), 0, TAU); ctx.stroke();
  } else if (kind === 'disc') {
    ctx.beginPath(); ctx.arc(0, 0, U * (0.05 + 0.035 * bk), 0, TAU); ctx.fill();
  } else if (kind === 'bars') {
    const n = 4, w = U * 0.014, gap = U * 0.05;
    for (let i = 0; i < n; i++) { const on = (bi % n) === i ? bk : 0, h = U * (0.05 + 0.16 * on); ctx.fillRect((i - (n - 1) / 2) * gap - w / 2, -h / 2, w, h); }
  } else {
    const half = U * (0.1 + 0.32 * (beat ? OUT(clamp(beat.since / Math.max(0.2, beat.len))) : 0.5));
    ctx.beginPath(); ctx.moveTo(-half, 0); ctx.lineTo(half, 0); ctx.stroke();
  }
  ctx.restore();
}
/* ------------------------------------------------------------------ kinetic scenes
   Each is a different grammar, not a different arrangement: the director (below) gives every cut a level 0–3 from the
   song and picks the scene from it, so a quiet line and a chorus line do not look like the same page.
     0  stWhisper  tiny type in a large empty frame, letters appearing one at a time, the spacing slowly opening
     1  stStream   the line as one long row larger than the frame; the frame travels along it and each word fills as sung
     1  stPush     every word arrives from below and pushes the earlier ones up and smaller
     2  stHit      one word a beat, bigger than the frame, each at its own angle and place; the ground changes colour
     2  stWall     the line repeated in rows that fill the frame and run against each other; one row lit, moving on the beat
     2  stSlice    the line cut in horizontal bands that slide in from both sides and are knocked loose again on the beat
     3  stZoom     the glyphs of the key word fly through the camera one after another, then the whole line slams in */
const T = (env, o) => J.drawItem(env, o);
const BIGN = 1e5;
function base(plan, sh) {
  if (sh.kx && sh.kxGen === gen) return sh.kx;
  const c = sh.cut, st = plan.style, W = plan.W, H = plan.H, text = strip(c.text);
  const merge = n => { const u = K.unitsOf(c, Math.max(1, n)).map(strip).filter(Boolean); return u.length ? u : [text]; };
  sh.kx = { c, plan, W, H, U: Math.min(W, H), port: H > W * 1.08, text, merge, jp: isJP(text), seed: c.seed | 0, d: {},
    fd: J.fontsOf(st, ['display'])[0], fb: J.fontsOf(st, ['body'])[0], ons: n => K.onsets({ cut: c, plan }, n) };
  sh.kxGen = gen;
  return sh.kx;
}
const outOf = (sh, lt, d = 0.26) => (sh.exitAt != null ? 1 - SOFT(clamp((lt - sh.exitAt) / d)) : 1);
const ground = (ctx, col) => { if (FLAT) return; ctx.fillStyle = col; ctx.fillRect(-BIGN, -BIGN, BIGN * 2, BIGN * 2); };
const twoLines = (x, maxG) => { const g = glyphs(x.text).length; return x.jp ? (g > maxG ? J.splitLines(x.text, Math.ceil(g / Math.min(3, Math.ceil(g / maxG)))) : x.text) : (x.text.length > maxG * 1.6 && /\s/.test(x.text) ? J.splitLines(x.text, Math.ceil(x.text.length / Math.min(3, Math.ceil(x.text.length / (maxG * 1.6))))) : x.text); };
const KIN = {
  stWhisper(env, sh, x, lt, pal) {
    const { W, H, U, c } = x;
    let d = x.d.w;
    if (!d) {
      const vert = x.jp && J.r(x.seed, 1) < 0.45;
      const size = clamp(J.fitSize(x.text, x.fb, vert ? BIGN : W * 0.62, vert ? H * 0.6 : BIGN, { vertical: vert, track: 0.34 }), U * 0.046, U * 0.07);
      const A = [[-0.22, -0.16], [0.2, 0.18], [-0.2, 0.2], [0.18, -0.2], [0, 0.03]][J.h(x.seed, 2) % 5];
      const units = x.merge(6), ts = x.ons(units.length), gt = [];
      units.forEach((u, i) => { const g = [...u], span = Math.min(0.55, ((ts[i + 1] ?? ts[i] + 0.7) - ts[i]) * 0.8); g.forEach((_, j) => gt.push(ts[i] + span * j / Math.max(1, g.length))); if (!x.jp) gt.push(ts[i]); });
      d = x.d.w = { vert, size, x: A[0] * W, y: A[1] * H, gt };
    }
    const k = clamp(lt / Math.max(1.5, c.dur));
    T(env, { text: x.text, font: x.fb, size: d.size, x: d.x, y: d.y, vertical: d.vert, track: 0.26 + 0.12 * k, color: pal.fg, alpha: outOf(sh, lt, 0.4),
      charFn: (i) => { const q = clamp((lt - (d.gt[Math.min(i, d.gt.length - 1)] || 0)) / 0.55); return q <= 0 ? { hide: true } : q >= 1 ? null : { a: SOFT(q), dy: d.vert ? 0 : (1 - OUT(q)) * d.size * 0.3, dx: d.vert ? (1 - OUT(q)) * d.size * 0.3 : 0 }; } });
  },
  stStream(env, sh, x, lt, pal) {
    const { W, H, c } = x, ctx = env.ctx;
    let d = x.d.s;
    if (!d) {
      const units = x.merge(6), ts = x.ons(units.length), S = x.port ? H * 0.15 : H * 0.34, gap = x.jp ? S * 0.05 : S * 0.3;
      let cx = 0;
      const bl = units.map((u, i) => { const w = J.measure({ text: u, font: x.fd, size: S, track: TRK.d }).w, b = { text: u, w, x: cx + w / 2, t: ts[i], t1: ts[i + 1] ?? Math.min(c.dur, ts[i] + 0.8) }; cx += w + gap; return b; });
      d = x.d.s = { bl, S, y: ((J.h(x.seed, 3) % 3) - 1) * H * 0.12 };
    }
    let fx = d.bl[0].x;
    for (let i = 1; i < d.bl.length; i++) fx += (d.bl[i].x - d.bl[i - 1].x) * SOFT(clamp((lt - d.bl[i].t + 0.1) / 0.36));
    const ox = -fx - W * 0.06 - lt * W * 0.014, a = outOf(sh, lt), lw = Math.max(1.5, d.S * 0.012);
    for (const b of d.bl) {
      const bx = b.x + ox;
      if (bx + b.w / 2 < -W * 0.8 || bx - b.w / 2 > W * 0.8) continue;
      const it = { text: b.text, font: x.fd, size: d.S, x: bx, y: d.y, track: TRK.d, color: pal.fg };
      const p = clamp((lt - b.t) / Math.max(0.12, Math.min(0.4, (b.t1 - b.t) * 0.7)));
      if (p < 1) T(env, Object.assign({}, it, { fill: false, stroke: lw, strokeColor: pal.fg, alpha: 0.45 * a * SOFT(clamp(lt / 0.3)) }));
      if (p > 0) { ctx.save(); ctx.beginPath(); ctx.rect(bx - b.w / 2 - d.S * 0.1, d.y - d.S, (b.w + d.S * 0.2) * p, d.S * 2); ctx.clip(); T(env, Object.assign(it, { alpha: a })); ctx.restore(); }
    }
  },
  stPush(env, sh, x, lt, pal) {
    const { W, H, U } = x;
    let d = x.d.p;
    if (!d) { const units = x.merge(5), ts = x.ons(units.length); d = x.d.p = { units, ts, S: units.map(u => fit(u, x.fd, W * 0.84, H * (x.port ? 0.15 : 0.3), { track: TRK.d })), side: J.h(x.seed, 4) % 3 ? -1 : 1 }; }
    const k = K.curIdx(d.ts, lt); if (k < 0) return;
    let y = H * 0.24 - lt * H * 0.006; const a0 = outOf(sh, lt);
    for (let i = k; i >= Math.max(0, k - 3); i--) {
      const e = OUT(clamp((lt - d.ts[i]) / 0.3)), old = i < k ? OUT(clamp((lt - d.ts[i + 1]) / 0.3)) : 0, age = k - i - 1 + old;
      const sc = i === k ? 1 : lerp(1, 0.4, clamp(age + (i === k - 1 ? 0 : 1)) * (i === k - 1 ? old : 1));
      const s = d.S[i] * sc, h = s * 1.06, w = J.measure({ text: d.units[i], font: x.fd, size: s, track: TRK.d }).w;
      const yy = y - h / 2 + (i === k ? (1 - e) * H * 0.6 : 0);
      T(env, { text: d.units[i], font: x.fd, size: s, x: d.side < 0 ? -W / 2 + U * 0.085 + w / 2 : W / 2 - U * 0.085 - w / 2, y: yy, track: TRK.d, color: pal.fg, alpha: a0 * (i === k ? 1 : lerp(1, 0.38, i === k - 1 ? old : 1) * (k - i >= 3 ? 1 - old : 1)) });
      y -= h * (i === k ? e : 1);
    }
  },
  stHit(env, sh, x, lt, pal, LP) {
    const { W, H, c } = x, ctx = env.ctx;
    let d = x.d.h;
    if (!d) {
      const units = x.merge(clamp(Math.floor(c.dur / 0.36), 1, 6)), ts = x.ons(units.length), col = []; let ci = 0, last = -9;
      units.forEach((_, i) => { if (i > 0 && ts[i] - last >= 0.34) { ci++; last = ts[i]; } col.push(ci % 3); });     // the ground never flips faster than 3 times a second
      d = x.d.h = { units, ts, col };
    }
    const k = Math.max(0, K.curIdx(d.ts, lt)), w = d.units[k], dt = lt - d.ts[k], g = glyphs(w).length, hv = J.h(x.seed, k, 9);
    let rot = [0, 0, -7, 6, 0, 90, -4, 0][hv % 8]; if (rot === 90 && (g > 3 || !x.jp)) rot = 0;
    const m100 = J.measure({ text: w, font: x.fd, size: 100, track: -0.04 }).w, span = rot === 90 ? H : W;
    const S = g <= 2 ? Math.min(H * 1.12, span * 1.7 / m100 * 100) : Math.min(H * 0.98, span * (1.14 + 0.26 * J.r(x.seed, k, 4)) / m100 * 100);
    const P3 = KEYG ? [0, pal.fg] : FLAT ? [[0, pal.fg], [0, LP.bg], [0, pal.bg]][d.col[k]] : [[pal.bg, pal.fg], [LP.bg, LP.fg], [pal.fg, pal.bg]][d.col[k]];
    if (d.col[k]) ground(ctx, P3[0]);
    const s = S * (1 + 0.3 * (1 - OUT(clamp(dt / 0.2)))) * (1 + 0.03 * dt);
    T(env, { text: w, font: x.fd, size: s, x: J.rs(x.seed, k, 5) * W * 0.05, y: J.rs(x.seed, k, 6) * H * 0.07, rot, track: -0.04, color: P3[1], alpha: outOf(sh, lt, 0.12) });
  },
  stWall(env, sh, x, lt, pal, LP) {
    const { W, H } = x, ctx = env.ctx;
    let d = x.d.wl;
    if (!d) {
      const rows = x.port ? 8 : 5, h = H / rows, S = h * 0.88, one = x.text + (x.jp ? '　' : '   ');
      const w1 = Math.max(S, J.measure({ text: one, font: x.fd, size: S, track: TRK.d }).w), reps = Math.min(12, Math.ceil(W * 1.4 / w1) + 2);
      d = x.d.wl = { rows, h, S, w1, line: one.repeat(reps), ts: x.ons(x.merge(4).length) };
    }
    const k = Math.max(0, K.curIdx(d.ts, lt)), live = (k * 2 + (x.seed & 7)) % d.rows, a0 = outOf(sh, lt, 0.14), lw = Math.max(1.5, d.S * 0.014);
    let kick = 0; for (const t of d.ts) if (lt >= t) kick += OUT(clamp((lt - t) / 0.28));
    ctx.save(); ctx.beginPath(); ctx.rect(-W / 2 - 2, -H / 2 - 2, W + 4, H + 4); ctx.clip();
    for (let r = 0; r < d.rows; r++) {
      const dir = r % 2 ? 1 : -1, sh0 = dir * (lt * W * 0.045 + kick * W * 0.05) + J.r(x.seed, r, 7) * d.w1;
      const x0 = -W / 2 - d.w1 * 1.5 + (((sh0 % d.w1) + d.w1) % d.w1), y = -H / 2 + (r + 0.5) * d.h, a = a0 * clamp((lt - r * 0.025) / 0.12);
      if (a <= 0) continue;
      if (r === live) {
        // the lit row: the type as it is, and — only where the band has already come in — in the band's own colour
        const q = OUT(clamp((lt - d.ts[k]) / 0.18)), it = { text: d.line, font: x.fd, size: d.S, x: x0, y, align: 'left', track: TRK.d, alpha: a };
        T(env, Object.assign({}, it, { color: pal.fg }));
        ctx.save(); ctx.beginPath(); ctx.rect(-W, y - d.h / 2 * q, W * 2, d.h * q); ctx.clip();
        ctx.fillStyle = LP.bg; ctx.globalAlpha = a; ctx.fillRect(-W, y - d.h / 2, W * 2, d.h); ctx.globalAlpha = 1;
        T(env, Object.assign(it, { color: LP.fg })); ctx.restore();
      }
      else T(env, { text: d.line, font: x.fd, size: d.S, x: x0, y, align: 'left', track: TRK.d, fill: false, stroke: lw, strokeColor: pal.fg, color: pal.fg, alpha: a * 0.5 });
    }
    ctx.restore();
  },
  stSlice(env, sh, x, lt, pal) {
    const { W, H } = x, ctx = env.ctx;
    let d = x.d.sl;
    if (!d) { const t = twoLines(x, x.port ? 4 : 8), S = fit(t, x.fd, W * 1.06, H * (x.port ? 0.5 : 0.78) / t.split('\n').length, { track: TRK.d, lead: 1.04 }), m = J.measure({ text: t, font: x.fd, size: S, track: TRK.d, lead: 1.04 }); d = x.d.sl = { t, S, hT: m.h + S * 0.16, N: x.port ? 9 : 7, ts: x.ons(x.merge(4).length) }; }
    const a = outOf(sh, lt, 0.14);
    for (let b = 0; b < d.N; b++) {
      const dir = b % 2 ? 1 : -1, e = OUT(clamp((lt - b * 0.03) / 0.4));
      // locked, so it reads; a wave keeps travelling down the bands, and every beat knocks them loose again
      const ph = b / d.N - ((lt * 0.8) % 1.5) + 0.25;
      let dx = dir * ((1 - e) * W * 1.15 + W * 0.07 * Math.exp(-ph * ph * 70));
      for (let j = 1; j < d.ts.length; j++) { const dt = lt - d.ts[j]; if (dt >= 0) dx += J.rs(x.seed, b, j) * W * 0.12 * Math.exp(-dt * 7); }
      if (sh.exitAt != null && lt > sh.exitAt) dx += -dir * IN(clamp((lt - sh.exitAt) / 0.22)) * W * 1.15;
      ctx.save(); ctx.beginPath(); ctx.rect(-BIGN, -d.hT / 2 + b * d.hT / d.N, BIGN * 2, d.hT / d.N + 0.6); ctx.clip();
      T(env, { text: d.t, font: x.fd, size: d.S, x: dx, y: 0, track: TRK.d, lead: 1.04, color: pal.fg, alpha: a });
      ctx.restore();
    }
  },
  stZoom(env, sh, x, lt, pal, LP, beat) {
    const { W, H, U, c } = x, ctx = env.ctx;
    let d = x.d.z;
    if (!d) {
      const units = x.merge(4), G = glyphs(units[leadOf(units, c, x.plan)]).slice(0, 6), step = clamp(c.dur * 0.4 / G.length, 0.085, 0.2);
      const t = twoLines(x, x.port ? 4 : 7);
      d = x.d.z = { G, step, T1: G.length * step, t, S: fit(t, x.fd, W * 1.02, H * (x.port ? 0.5 : 0.8) / t.split('\n').length, { track: TRK.d, lead: 1.04 }) };
    }
    if (lt < d.T1 + d.step * 0.6) d.G.forEach((ch, i) => {
      const q = (lt - i * d.step) / (d.step * 1.6); if (q < 0 || q >= 1) return;
      T(env, { text: ch, font: x.fd, size: H * 0.42 * Math.pow(9, q), x: 0, y: 0, color: i % 2 && !KEYG ? pal.accent : pal.fg, alpha: (1 - J.smooth(0.55, 1, q)) * Math.min(1, q * 6) });
    });
    const dt = lt - d.T1; if (dt < 0) return;
    ground(ctx, LP.bg);
    const sk = Math.exp(-dt * 9) * U * 0.014, st = Math.floor(lt * 24);
    T(env, { text: d.t, font: x.fd, size: d.S * (1 + 0.55 * (1 - OUT(clamp(dt / 0.22)))) * (1 + 0.04 * dt) * (1 + (beat && dt > 0.3 ? 0.05 * Math.exp(-beat.since * 8) : 0)), x: J.rs(st, 1) * sk, y: J.rs(st, 2) * sk, track: TRK.d, lead: 1.04, color: KEYG ? pal.fg : FLAT ? LP.bg : LP.fg, alpha: outOf(sh, lt, 0.12) });
  },
};
const isRed = c => { const h = J.toHsl(c); return (h[0] < 28 || h[0] > 335) && h[1] > 0.45; };
function lensPal(sc, g) {
  if (sc.lensFg) return { bg: sc.accent, fg: sc.lensFg, accent: sc.lensFg };         // グリーンバック: the third colour
  // a red disc on a light ground is a flag, not an abstract figure: there the disc takes the text colour
  if (g && g.type === 'disc' && J.lum(sc.bg) > 0.6 && isRed(sc.accent)) return { bg: sc.fg, fg: sc.bg, accent: sc.accent };
  const bg = sc.accent, a = J.contrast(sc.bg, bg), b = J.contrast(sc.fg, bg);
  const fg = a >= b ? sc.bg : sc.fg;
  return { bg, fg, accent: fg };
}
function drawShot(env, plan, sh, lt, beat) {
  const ctx = env.ctx, sc = env.sc, U = Math.min(plan.W, plan.H);
  const pal = { bg: sc.bg, fg: sc.fg, accent: KEYG ? sc.accent : J.contrast(sc.accent, sc.bg) >= 1.6 ? sc.accent : sc.fg };
  if (!sh.lyric) { drawIdle(ctx, plan, sh, lt, pal, beat, U); return; }
  if (KIN[sh.cut.layout]) { KIN[sh.cut.layout](env, sh, base(plan, sh), lt, pal, lensPal(sc, null), beat); return; }
  const comp = compose(plan, sh);
  const beatK = beat ? Math.exp(-beat.since * 7) : 0;
  const out = sh.exitAt != null ? 1 - SOFT(clamp((lt - sh.exitAt - 0.06) / 0.28)) : 1;
  if (out <= 0.005) return;
  // non-lens plates (bars) and strokes under the type
  for (const g of comp.geo) if (g.type === 'plate' && !g.lens) { ctx.save(); ctx.globalAlpha = out; ctx.beginPath(); if (geoPath(ctx, g, lt, beatK, U)) { ctx.fillStyle = pal.accent; ctx.fill(); } ctx.restore(); }
  drawStrokes(ctx, comp, lt, pal, beatK, U, out);
  drawBlocks(env, comp, lt, pal, sh, U);
  // lenses: the shape in the accent colour, and everything under it once more in the counter colour
  for (const g of comp.geo) {
    if (!g.lens) continue;
    const LP = lensPal(sc, g);
    ctx.save(); ctx.beginPath();
    if (geoPath(ctx, g, lt, beatK, U)) {
      ctx.clip();
      if (out < 1) ctx.globalAlpha = out;
      ctx.fillStyle = LP.bg; ctx.fillRect(-U * 20, -U * 20, U * 40, U * 40);
      ctx.globalAlpha = 1;
      if (out > 0.5) drawBlocks(env, comp, lt, LP, sh, U);
    }
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ the frame */
function shotAt(S, t) {
  const sh = S.shots; let lo = 0, hi = sh.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (sh[m].cut.start - sh[m].pre <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}
function beatAt(beats, t) {
  if (!beats || !beats.length) return null;
  let lo = 0, hi = beats.length - 1, i = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (beats[m] <= t) { i = m; lo = m + 1; } else hi = m - 1; }
  if (i < 0) return null;
  const len = i + 1 < beats.length ? beats[i + 1] - beats[i] : (i > 0 ? beats[i] - beats[i - 1] : 0.5);
  return { since: t - beats[i], len: Math.max(0.2, len), index: i };
}
const zoomOf = (P, sh, t) => 1 + (P.push ?? 0.035) * clamp((t - sh.cut.start) / Math.max(1.2, sh.cut.dur), 0, 1.4);
/* one sample of the world at time t, drawn into ctx (design space already scaled) */
function drawWorld(R, ctx, plan, t, o) {
  const S = stageOf(plan), st = plan.style, P = st.stage || {}, W = plan.W, H = plan.H;
  const i = shotAt(S, t);
  const schemeOf = sh => st.schemes[sh.cut.scheme % st.schemes.length] || st.schemes[0];
  if (i < 0) { if (!o.transparent) { ctx.fillStyle = KEYG ? J.KEY_BG.green : (st.schemes[0] || {}).bg || '#000'; ctx.fillRect(0, 0, W, H); } return; }
  const cur = S.shots[i], prev = i > 0 ? S.shots[i - 1] : null;
  const q = cur.T > 0 ? clamp((t - (cur.cut.start - cur.pre)) / cur.T) : 1, e = CAM(q), moving = prev && q < 1;
  const beat = beatAt(plan.beats, t), kick = beat ? (P.pulse || 0) * Math.exp(-beat.since * 9) : 0;
  // camera pose in the current page's frame
  let cam = { x: 0, y: 0, rot: 0, s: 1 };
  if (moving) {
    const iv = cur.inv, s = Math.exp(Math.log(iv.s) * (1 - e));
    if (cur.travel === 'dolly') { const k = Math.abs(iv.s - 1) < 1e-6 ? 1 - e : (s - 1) / (iv.s - 1); cam = { x: iv.x * k, y: iv.y * k, rot: iv.rot * (1 - e), s }; }
    else cam = { x: iv.x * (1 - e), y: iv.y * (1 - e), rot: iv.rot * (1 - e), s: s * (1 + (P.arc ?? 0.12) * Math.sin(Math.PI * e)) };
  }
  const zc = zoomOf(P, cur, t), zp = prev ? zoomOf(P, prev, t) : 1;
  const zoom = (moving ? Math.pow(zp, 1 - e) * Math.pow(zc, e) : zc) * (1 + kick);
  const scC = schemeOf(cur), scP = prev ? schemeOf(prev) : scC;
  const envOf = (sh, sc) => ({ ctx, W, H, sc, st, fx: plan.fx, fps: plan.fps, cut: sh.cut, plan, pass: 'main', scale: o.scale * zoom / cam.s, allowFilter: o.allowFilter, t, lt: t - sh.cut.start, ltb: t - sh.cut.start, step: 0, glyphLog: o.glyphLog || null });
  ctx.save();
  if (!o.transparent) { ctx.fillStyle = gnd(moving ? scP : scC); ctx.fillRect(0, 0, W, H); }
  ctx.translate(W / 2, H / 2); ctx.scale(zoom / cam.s, zoom / cam.s); ctx.rotate(-cam.rot * DEG); ctx.translate(-cam.x, -cam.y);
  if (moving) {
    // the page we are leaving (it fades as a dolly flies through it)
    const iv = cur.inv, fade = cur.travel === 'dolly' ? 1 - J.smooth(0.25, 0.7, e) : 1;
    if (fade > 0.01) {
      ctx.save(); ctx.translate(iv.x, iv.y); ctx.rotate(iv.rot * DEG); ctx.scale(iv.s, iv.s);
      if (fade < 1) ctx.globalAlpha = fade;
      const ev = envOf(prev, scP); ev.scale *= iv.s;
      if (fade >= 1) drawShot(ev, plan, prev, t - prev.cut.start, beat);
      else { const L = R.stLayer || (R.stLayer = mk(2, 2)); layered(ctx, L, o, (lx) => { lx.setTransform(ctx.getTransform()); ev.ctx = lx; drawShot(ev, plan, prev, t - prev.cut.start, beat); }, fade); }
      ctx.restore();
    }
    // the page we arrive on owns everything on its side of the shared edge (or, for a dolly, its own rectangle)
    const sameBg = KEYG || String(scC.bg).toLowerCase() === String(scP.bg).toLowerCase();
    ctx.beginPath();
    if (cur.travel === 'dolly') { if (sameBg) { const B = Math.max(W, H) * 40; ctx.rect(-B, -B, B * 2, B * 2); } else ctx.rect(-W / 2, -H / 2, W, H); }
    else {
      const d = Math.hypot(iv.x, iv.y) || 1, nx = iv.x / d, ny = iv.y / d, ext = Math.abs(nx) * W / 2 + Math.abs(ny) * H / 2, B = Math.max(W, H) * 40;
      const p = (a, b) => [a * nx - b * ny, a * ny + b * nx];
      const pts = [p(ext, -B), p(ext, B), p(-B, B), p(-B, -B)];
      ctx.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < 4; k++) ctx.lineTo(pts[k][0], pts[k][1]); ctx.closePath();
    }
    ctx.clip();
    if (cur.travel === 'dolly' && sameBg) { /* same ground: the next page simply lies further in */ }
    else if (!o.transparent) { ctx.fillStyle = gnd(scC); const B = Math.max(W, H) * 40; ctx.fillRect(-B, -B, B * 2, B * 2); }
    else if (cur.travel !== 'cut') { const B = Math.max(W, H) * 40; ctx.clearRect(-B, -B, B * 2, B * 2); }
  }
  drawShot(envOf(cur, scC), plan, cur, t - cur.cut.start, beat);
  ctx.restore();
}
/* draw through a layer so a group can fade as one */
function layered(ctx, L, o, fn, alpha) {
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  if (L.width !== cw || L.height !== ch) { L.width = cw; L.height = ch; }
  const lx = L.getContext('2d');
  lx.setTransform(1, 0, 0, 1, 0, 0); lx.globalAlpha = 1; lx.globalCompositeOperation = 'source-over'; lx.filter = 'none'; lx.clearRect(0, 0, cw, ch);
  lx.save(); fn(lx); lx.restore();
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha; ctx.drawImage(L, 0, 0); ctx.restore();
}
function stageFrame(R, ctx, plan, t, opt) {
  const W = plan.W, H = plan.H, scale = opt.scale || 1, cw = ctx.canvas.width, ch = ctx.canvas.height;
  const st = plan.style, P = st.stage || {}, fx = plan.fx;
  if (J.setLang) J.setLang(plan.lang || 'ja');
  if (J.setTypeset) J.setTypeset(!!plan.typeset);
  if (J.setLatin) J.setLatin(st.latin);
  const key = plan.keyBg && J.KEY_BG && J.KEY_BG[plan.keyBg] ? plan.keyBg : null;
  KEYG = key === 'green' && !!st.keyColour; FLAT = KEYG || !!opt.transparent;
  const o = { scale, transparent: !!opt.transparent, allowFilter: R.filterOK && !opt.fast, glyphLog: opt.glyphLog || null };
  if (o.transparent && opt.layer === 'back') { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cw, ch); ctx.restore(); return; }   // 前景／後景: the stage is one layer (front)
  const S = stageOf(plan), i = shotAt(S, t), cur = i >= 0 ? S.shots[i] : null;
  // motion blur: while the camera travels, the frame is the average of several moments inside the shutter
  const q = cur && cur.T > 0 ? (t - (cur.cut.start - cur.pre)) / cur.T : 1;
  const travelling = cur && i > 0 && q > 0 && q < 1 && cur.travel !== 'cut';
  const mb = (fx.motion ?? 0.7) > 0.05 && !opt.glyphLog ? (P.blur ?? 1) : 0;
  const N = travelling && mb > 0 ? (opt.fast ? 3 : Math.round(lerp(8, 14, clamp(mb)))) : 1;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.filter = 'none';
  ctx.clearRect(0, 0, cw, ch);
  if (N <= 1) { ctx.setTransform(scale, 0, 0, scale, 0, 0); drawWorld(R, ctx, plan, t, o); }
  else {
    const A = R.stA || (R.stA = mk(2, 2)); if (A.width !== cw || A.height !== ch) { A.width = cw; A.height = ch; }
    const ax = A.getContext('2d'), shutter = 0.5 / 24 * mb;
    // a running mean (sample k over the mean so far at 1/(k+1)): adding N samples at 1/N each drifts in 8 bits
    for (let k = 0; k < N; k++) {
      ax.setTransform(1, 0, 0, 1, 0, 0); ax.globalAlpha = 1; ax.globalCompositeOperation = 'source-over'; ax.clearRect(0, 0, cw, ch);
      ax.setTransform(scale, 0, 0, scale, 0, 0);
      drawWorld(R, ax, plan, t - shutter * (k / (N - 1) - 0.5), o);
      if (k === 0) { ctx.globalCompositeOperation = 'copy'; ctx.globalAlpha = 1; } else { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1 / (k + 1); }
      ctx.drawImage(A, 0, 0);
    }
  }
  ctx.restore();
  // finishing: fine grain only
  if (!opt.noPost && !o.transparent && !key) {
    const gr = (P.grain ?? 0.5) * (fx.texture ?? 0.6);
    if (gr > 0.02 && R.grain && R.grain.length) {
      const step = Math.floor(t * 24), pat = ctx.createPattern(R.grain[((step % 4) + 4) % 4], 'repeat'), k = Math.max(1, ch / 1080);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(k, k); ctx.translate(-J.r(step, 1) * 256, -J.r(step, 2) * 256);
      ctx.fillStyle = pat; ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = gr * 0.2; ctx.fillRect(0, 0, cw / k + 256, ch / k + 256);
      ctx.restore();
    }
    const vgA = (P.vignette || 0) * (cur ? 1 - J.smooth(0.25, 0.6, J.lum((st.schemes[cur.cut.scheme % st.schemes.length] || st.schemes[0]).bg)) : 1);   // dark grounds only: on a light page it reads as dirt
    if (vgA > 0.01) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      const vg = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.4, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.62);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${vgA.toFixed(3)})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, cw, ch); ctx.restore();
    }
  }
  if (key && !KEYG && !opt.noPost) R.keyFinish(ctx, key, opt);
  KEYG = FLAT = false;
}
J.stageFrame = stageFrame;
if (J.Renderer && !J.Renderer.prototype.stageHook) {
  const frame0 = J.Renderer.prototype.frame;
  J.Renderer.prototype.frame = function (ctx, plan, t, opt = {}) {
    if (plan && plan.style && plan.style.stage && !plan.centerFree) return stageFrame(this, ctx, plan, t, opt);
    return frame0.call(this, ctx, plan, t, opt);
  };
  J.Renderer.prototype.stageHook = true;
}

/* ------------------------------------------------------------------ the director
   Reads the song before anything is drawn and gives every lyric cut a level:
     0 quiet · 1 telling · 2 strong · 3 peak
   from the loudness of the song there (when a song is loaded), lines that come back (a chorus), impact / emphasis marks,
   how dense the line is, and where it stands (the first line, the line after a pause). The scene of a cut is drawn from
   its level (a style weights the scenes), never the same scene twice running; a jump of two levels up is prepared by a
   moment of empty frame and lands as a hard cut. Cuts set by hand keep their layout. */
const LEVELS = { stCross: [1], stSplit: [1, 2], stWhisper: [0], stColumn: [0, 1], stStream: [1], stPush: [1, 2], stStack: [1], stMono: [1, 2], stHit: [2, 3], stWall: [2, 3], stSlice: [2, 3], stZoom: [3] };
function direct(plan) {
  const st = plan.style, P = st.stage || {}, KW = P.kinds || {}, cuts = plan.cuts;
  const lyric = c => c.layout !== 'interlude' && !!String(c.text || '').trim();
  const norm = t => String(t || '').replace(/[\s\p{P}]/gu, '').toLowerCase(), cnt = new Map();
  for (const l of plan.lines || []) if (l && l.text) cnt.set(norm(l.text), (cnt.get(norm(l.text)) || 0) + 1);
  let eLo = 1, eHi = 0;
  const eAt = c => { if (!plan.energy || !plan.energyRate) return null; let s = 0, n = 0; for (let t = c.start; t < c.end; t += 0.1) { s += plan.energy[Math.min(plan.energy.length - 1, Math.max(0, Math.floor(t * plan.energyRate)))] || 0; n++; } return n ? s / n : null; };
  const L = cuts.filter(lyric), en = L.map(eAt);
  en.forEach(e => { if (e != null) { eLo = Math.min(eLo, e); eHi = Math.max(eHi, e); } });
  const score = L.map((c, i) => {
    const ln = (plan.lines || [])[c.line] || {}, g = glyphs(c.text).length;
    let s = en[i] != null && eHi - eLo > 0.08 ? 0.25 + 0.6 * (en[i] - eLo) / (eHi - eLo) : 0.5;
    if ((cnt.get(norm(ln.text)) || 0) >= 2) s += 0.32;
    if (ln.impact || /[!！]/.test(c.text)) s += 0.3;
    if (c.emph) s += 0.1;
    if (g / Math.max(0.3, c.dur) > 5) s += 0.08;
    if (i === 0) s -= 0.25; else if (ln.gapBefore && (cnt.get(norm(ln.text)) || 0) < 2) s -= 0.12;
    return s + J.rs(plan.seed | 0, i, 43) * 0.1;
  });
  // a block (lines without a pause between them) that holds a chorus or impact line is lifted as a whole
  { let a = 0; for (let i = 0; i <= L.length; i++) { const ln = i < L.length ? (plan.lines || [])[L[i].line] || {} : null; if (i === L.length || (i > a && ln.gapBefore && L[i].line !== L[i - 1].line)) { const hot = L.slice(a, i).some(c => { const l2 = (plan.lines || [])[c.line] || {}; return l2.impact || (cnt.get(norm(l2.text)) || 0) >= 2; }); if (hot) for (let j = a; j < i; j++) score[j] += 0.16; a = i; } } }
  const lv = score.map(s => (s < 0.36 ? 0 : s < 0.66 ? 1 : s < 0.95 ? 2 : 3));
  for (let i = 2; i < lv.length; i++) if (lv[i] === 0 && (lv[i - 1] === 0 || lv[i - 2] === 0)) lv[i] = 1;     // quiet is rare, or it stops being quiet
  if (L.length >= 5) {                                                   // a song has both ends of the range
    if (!lv.includes(0)) lv[score.indexOf(Math.min(...score))] = 0;
    if (!lv.includes(3)) lv[score.indexOf(Math.max(...score))] = 3;
    if (!lv.includes(2)) { const o = score.map((s, i) => [s, i]).filter(a => lv[a[1]] === 1).sort((a, b) => b[0] - a[0])[0]; if (o) lv[o[1]] = 2; }
  }
  // composed pages (set type, not kinetic): never more than two in a row, about a quarter of the song at most, never
  // at a peak (LEVELS) or on the cut right after a jump up
  const PAGE = new Set(['stStack', 'stCross', 'stSplit', 'stColumn']), budget = Math.max(1, Math.round(L.length * 0.25));
  let prevKind = null, pages = 0, run = 0;
  L.forEach((c, i) => {
    c.level = lv[i];
    if (!c.manual || !LEVELS[c.layout]) {
      const n = glyphs(c.text).length, jp = isJP(c.text), rng = J.rng(J.h(plan.seed | 0, i, 47));
      const ok = k => !(k === 'stColumn' && !jp) && !(k === 'stWall' && n > 14) && !(k === 'stSlice' && n > 16) && !(k === 'stZoom' && c.dur < 1.1) && !(k === 'stWhisper' && n > 22) && !(k === 'stStream' && c.dur < 0.9) && !(k === 'stPush' && K.unitsOf(c, 5).length < 2) && !(k === 'stCross' && (!jp || K.unitsOf(c, 4).length < 2 || n > 18))
        && !(PAGE.has(k) && (pages >= budget || run >= 2 || (i > 0 && lv[i] - lv[i - 1] >= 2)));
      let cand = Object.keys(LEVELS).filter(k => LEVELS[k].includes(lv[i]) && (KW[k] ?? 1) > 0 && ok(k) && k !== prevKind).map(k => [k, KW[k] ?? 1]);
      if (!cand.length) cand = [['stMono', 1]];
      c.layout = rng.wpick(cand);
      c.params = Object.assign({ font: J.fontsOf(st, ['display'])[0], body: J.fontsOf(st, ['body'])[0] }, { st: Object.assign({ side: rng.pick([-1, -1, 1]), r: +rng().toFixed(3) }, (c.params && c.params.st) || {}) });
    }
    prevKind = c.layout;
    if (PAGE.has(c.layout)) { pages++; run++; } else run = 0;
  });
  return plan;
}
if (!J.plan.stageHook) {
  const plan0 = J.plan;
  J.plan = (project, audio) => { const plan = plan0(project, audio); try { if (plan && plan.style && plan.style.stage && !plan.centerFree && !plan.calm) direct(plan); } catch (e) { console.warn('stage director', e); } return plan; };
  J.plan.stageHook = true;
}

/* ------------------------------------------------------------------ layouts (the scene of a cut; the director assigns them) */
const DEFS = {
  stStack: { name: '組み', en: 'Stack', ae: 'stack', w: 1.2, fits: n => n >= 1 && n <= 40, tags: ['graphic', 'pop', 'editorial', 'emotional'] },
  stMono: { name: '一語', en: 'One word', ae: 'huge', w: 1, emph: 2.2, fits: n => n >= 1 && n <= 40, tags: ['graphic', 'pop', 'glitch', 'emotional'] },
  stCross: { name: '交差', en: 'Cross', ae: 'mixed', w: 1, fits: n => n >= 1 && n <= 40, tags: ['graphic', 'editorial', 'pop'] },
  stSplit: { name: '分割', en: 'Split', ae: 'center', w: 1, fits: n => n >= 1 && n <= 40, tags: ['graphic', 'pop', 'editorial'] },
  stColumn: { name: '縦', en: 'Column', ae: 'vcols', w: 1, fits: n => n >= 1 && n <= 40, tags: ['editorial', 'calm', 'emotional'] },
  stWhisper: { name: '囁き', en: 'Whisper', ae: 'center', w: 1, fits: n => n >= 1 && n <= 40, tags: ['calm', 'emotional', 'editorial'] },
  stStream: { name: '流れ', en: 'Stream', ae: 'marquee', w: 1, fits: n => n >= 1 && n <= 40, tags: ['editorial', 'graphic', 'emotional', 'pop'] },
  stPush: { name: '積み', en: 'Push', ae: 'stack', w: 1, fits: n => n >= 1 && n <= 40, tags: ['graphic', 'pop', 'editorial'] },
  stHit: { name: '打ち', en: 'Hit', ae: 'huge', w: 1, emph: 2, fits: n => n >= 1 && n <= 40, tags: ['graphic', 'pop', 'glitch'] },
  stWall: { name: '壁', en: 'Wall', ae: 'tile', w: 1, fits: n => n >= 1 && n <= 40, tags: ['graphic', 'pop', 'glitch'] },
  stSlice: { name: '裂き', en: 'Slice', ae: 'huge', w: 1, fits: n => n >= 1 && n <= 40, tags: ['graphic', 'glitch', 'emotional'] },
  stZoom: { name: '貫き', en: 'Zoom-through', ae: 'huge', w: 1, emph: 2, fits: n => n >= 1 && n <= 40, tags: ['graphic', 'pop', 'glitch', 'emotional'] },
};
for (const [key, d] of Object.entries(DEFS)) {
  J.register('layout', key, Object.assign(d, {
    set: 'stage', poolOnly: true, treat: false,
    plan(rng, cut, st) {
      return { st: { side: rng.pick([-1, -1, 1, 0].slice(0, key === 'stStack' || key === 'stColumn' ? 3 : 4)), r: +rng().toFixed(3) }, font: J.fontsOf(st, ['display'])[0], body: J.fontsOf(st, ['body'])[0] };
    },
    // outside a stage frame (thumbnails, a line set by hand in another style): the page on its own
    render(env) {
      const plan = env.plan || { W: env.W, H: env.H, style: env.st, lines: [], beats: [], cuts: [env.cut], fx: env.fx };
      const sh = { cut: env.cut, i: 0, lyric: true, exitAt: env.cut.outDur > 0 ? Math.max(0.2, env.cut.dur - 0.36) : null, comp: null };
      if (env.pass !== 'main') return null;
      const ctx = env.ctx; ctx.save(); ctx.translate(env.W / 2, env.H / 2);
      const P2 = Object.assign({}, plan, { W: env.W, H: env.H });
      drawShot(Object.assign({}, env), P2, sh, env.lt, env.beat || null);
      ctx.restore();
      const c = sh.comp; if (!c) return null;
      let bb = null; for (const b of c.blocks) bb = J.unionBB(bb, { x0: env.W / 2 + b.x - b.w / 2, x1: env.W / 2 + b.x + b.w / 2, y0: env.H / 2 + b.y - b.h / 2, y1: env.H / 2 + b.y + b.h / 2, cx: env.W / 2 + b.x, cy: env.H / 2 + b.y, boxes: [] });
      return bb;
    },
  }), PACK);
}

/* ------------------------------------------------------------------ presets */
const scheme = (bg, fg, accent, o) => Object.assign({ bg, fg, accent, sub: J.mix(fg, bg, 0.4), accent2: fg, ink: fg, dim: J.mix(bg, fg, 0.08), ghostA: accent, ghostB: fg }, o || {});
const pool = (layout) => ({ layout, enter: { cut: 1 }, exit: { cut: 1 }, hold: { still: 1 }, treat: { none: 1 }, cam: { push: 1 }, trans: {}, fx: {}, decor: {}, bg: {} });
const ALL = () => ({ stWhisper: 1, stStream: 1, stPush: 1, stHit: 1, stWall: 1, stSlice: 1, stZoom: 1, stStack: 1, stMono: 1, stColumn: 1, stCross: 1, stSplit: 1 });
const STYLES = {
  /* 転回 — black, paper white, one signal red. Heavy Gothic. The frame turns a quarter on the cut. */
  stTurn: {
    name: '転回', en: 'Quarter Turn', desc: '黒・紙の白・一色の朱、極太ゴシック。静かな行は小さく、サビは画面からはみ出す一語と裂ける文字。画面は九十度まわる', moods: ['graphic', 'pop', 'glitch'],
    schemes: [scheme('#0B0B0C', '#F3F1EC', '#FF3B1F'), scheme('#F3F1EC', '#0B0B0C', '#FF3B1F'), scheme('#FF3B1F', '#0B0B0C', '#F3F1EC')],
    fonts: { display: ['mplus_black'], serif: ['shipm_xb'], body: ['mplus_med'], mono: ['mono'] },
    pool: pool(ALL()), oneCut: 0.9,
    stage: { kinds: { stWhisper: 1, stStream: 0.8, stPush: 1, stHit: 1.3, stWall: 0.8, stSlice: 1, stZoom: 1, stStack: 0.25, stMono: 0.8, stColumn: 0, stCross: 0.5, stSplit: 0.7 },  travel: { turn: 1.2, pan: 0.6, dolly: 0.35 }, dirs: [[1, 0], [0, 1], [1, 0], [0, -1]], scales: [1, 1, 0.72, 1.3], enter: { lead: { slam: 1, rise: 0.8 }, sub: { rise: 1, slide: 0.5 } },
      geo: { plate: 1.2, disc: 1, none: 0.5 }, ghost: 'lead', push: 0.04, pulse: 0.012, arc: 0.16, grain: 0.5, idle: 'bars', blur: 1 },
    adobeFonts: { display: ['ad_ryogo_ub'], body: ['ad_ryogo'] },
  },
  /* 余白 — warm paper and ink, Mincho, wide margins; hairlines and one small vermilion disc. Slow pans. */
  stYohaku: {
    name: '余白', en: 'Margin', desc: '生成りの紙に墨の明朝。小さな字と大きな余白から始まり、山場だけ画面いっぱいの明朝が流れ、裂ける', moods: ['calm', 'emotional', 'editorial'],
    schemes: [scheme('#EEEAE1', '#1B1A18', '#B8402A'), scheme('#1B1C1E', '#ECE7DC', '#C8A45A'), scheme('#D9D4C7', '#1B1A18', '#B8402A')],
    fonts: { display: ['shipm_xb'], serif: ['shipm_xb'], body: ['shipm_med'], mono: ['mono'] },
    pool: pool(ALL()), oneCut: 1,
    stage: { kinds: { stWhisper: 1.5, stStream: 1, stPush: 0.6, stHit: 0.6, stWall: 0.3, stSlice: 0.7, stZoom: 0.6, stStack: 0.25, stMono: 0.6, stColumn: 1.3, stCross: 0.8, stSplit: 0.2 },  travel: { pan: 1.4, dolly: 0.3 }, dirs: [[-1, 0], [-1, 0], [0, 1], [-1, 0], [0, -1]], scales: [1, 1, 0.8, 1.2], enter: { lead: { track: 1, focus: 0.7, drop: 1 }, sub: { track: 0.6, rise: 0.8, drop: 1 } },
      geo: { rule: 1, ring: 1, disc: 0.5, none: 0.8 }, ghost: 'dim', push: 0.05, pulse: 0, arc: 0.06, moveDur: 1.35, grain: 0.75, idle: 'ring', blur: 0.8 },
    adobeFonts: { display: ['ad_ryodisp_h'], body: ['ad_tsukua'] },
  },
  /* 色面 — colour fields. Every page has its own colour; the edge between two pages slides through the frame. */
  stField: {
    name: '色面', en: 'Colour Field', desc: 'コバルト・黄・白の色面。歌詞が壁になって画面を埋め、長い一行の上をカメラが走る。色の境界が画面を横切る', moods: ['graphic', 'pop', 'editorial'],
    schemes: [scheme('#1F3BFF', '#F6F5F1', '#FFE500'), scheme('#FFE500', '#0C0C0E', '#1F3BFF'), scheme('#F6F5F1', '#0C0C0E', '#1F3BFF'), scheme('#0C0C0E', '#F6F5F1', '#FFE500')],
    fonts: { display: ['zenkaku'], serif: ['shipm_xb'], body: ['zenkaku_b'], mono: ['mono'] },
    pool: pool(ALL()), oneCut: 0.9,
    stage: { kinds: { stWhisper: 0.8, stStream: 1.2, stPush: 1, stHit: 1, stWall: 1.4, stSlice: 0.8, stZoom: 0.7, stStack: 0.25, stMono: 0.7, stColumn: 0, stCross: 0.4, stSplit: 1.2 },  travel: { pan: 1.5, turn: 0.3 }, dirs: [[1, 0], [0, 1], [-1, 0], [0, 1]], scales: [1], enter: { lead: { rise: 1, slide: 0.8 }, sub: { slide: 1, rise: 0.6 } },
      geo: { plate: 1.3, disc: 0.6, none: 0.6 }, ghost: true, push: 0.03, pulse: 0.008, arc: 0.1, grain: 0.35, idle: 'ring', blur: 1 },
    adobeFonts: { display: ['ad_ryogo_h'], body: ['ad_ryogo_b'] },
  },
  /* 奥行 — near black, a cold white, one mint. The camera only moves forward: each page lies inside the last. */
  stDepth: {
    name: '奥行', en: 'Depth', desc: '黒に近い地、冷たい白、ミントの一点。カメラは前にだけ進み、山場では一字ずつがカメラを突き抜ける', moods: ['emotional', 'glitch', 'graphic', 'calm'],
    schemes: [scheme('#07080B', '#F2F3F1', '#5FE3C4'), scheme('#101319', '#F2F3F1', '#5FE3C4'), scheme('#E8EAEC', '#0A0C10', '#0E8F76')],
    fonts: { display: ['murecho_b'], serif: ['shipm_xb'], body: ['murecho_xl'], mono: ['mono'] },
    pool: pool(ALL()), oneCut: 0.9,
    stage: { kinds: { stWhisper: 1.2, stStream: 1, stPush: 0.6, stHit: 0.7, stWall: 0.5, stSlice: 0.9, stZoom: 1.4, stStack: 0.25, stMono: 1, stColumn: 0.5, stCross: 0.4, stSplit: 0.3 },  travel: { dolly: 1 }, tilts: [0, 0, -6, 6, 0, 90], dollyScale: 0.14, enter: { lead: { focus: 1.2, track: 0.6 }, sub: { focus: 1, rise: 0.5 } },
      geo: { rule: 0.7, ring: 1.2, disc: 0.7, none: 0.7 }, ghost: 'dim', push: 0.07, pulse: 0.006, moveDur: 1.25, grain: 0.6, vignette: 0.22, idle: 'ring', blur: 1 },
    adobeFonts: { display: ['ad_shs_b'], body: ['ad_shs_l'] },
  },
  /* 明滅 — black / white / acid. Hard cuts on the beat, one word a beat, the disc as the only figure. */
  stPulse: {
    name: '明滅', en: 'Pulse', desc: '黒・白・蛍光の黄緑。拍ごとに画面より大きい一語、地の色ごと切り替わる。静かな行との落差が大きい', moods: ['pop', 'glitch', 'graphic'],
    schemes: [scheme('#0A0A0A', '#F5F5F0', '#D4FF3A'), scheme('#D4FF3A', '#0A0A0A', '#0A0A0A'), scheme('#F5F5F0', '#0A0A0A', '#0A0A0A')],
    fonts: { display: ['dela'], serif: ['shipm_xb'], body: ['mplus_xb'], mono: ['mono'] },
    pool: pool(ALL()), oneCut: 0.9,
    stage: { kinds: { stWhisper: 0.7, stStream: 0.5, stPush: 0.8, stHit: 1.5, stWall: 1.1, stSlice: 1.1, stZoom: 1.2, stStack: 0.25, stMono: 0.8, stColumn: 0, stCross: 0, stSplit: 0.8 },  travel: { cut: 1.4, pan: 0.5, turn: 0.4 }, dirs: [[0, 1], [1, 0], [0, -1], [-1, 0]], scales: [1, 1.4, 0.7], enter: { lead: { slam: 1 }, sub: { slide: 1 } },
      geo: { disc: 1.4, plate: 0.6, none: 0.8 }, ghost: 'lead', push: 0.02, pulse: 0.02, arc: 0.2, moveDur: 0.8, grain: 0.4, idle: 'disc', blur: 1 },
    adobeFonts: { display: ['ad_ryogo_ub'], body: ['ad_ryogo_h'] },
  },
};
J.STAGE_STYLES = Object.keys(STYLES);
for (const [k, v] of Object.entries(STYLES)) {
  if (J.STYLES[k]) continue;
  J.STYLES[k] = Object.assign({ bias: {}, texture: { grain: 0, paper: 0, scan: 0 }, hud: false, glow: 0, decor: {}, ghost: 0, chorusHit: false }, v);
  if (!J.STYLE_ORDER.includes(k)) J.STYLE_ORDER.push(k);
}
})();
