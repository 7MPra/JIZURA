/* JIZURA pack: mojipv — three text-only styles after lyric videos people picked as references (2026-10-01):
   text only; shapes appear only as masks (a circle that opens on a glyph, stripes that reveal one), never drawn.
     回転文字   (mpSpin)    one colour field, a heavy round Gothic: words fly in at their own angles and pile up while the
                            whole picture keeps turning; one word so big the frame crops it
     明朝とルビ (mpRuby)    two inks on a paper colour, Mincho: one kanji huge with its reading (ルビ) beside it, dropped in
                            with a motion blur; the line set small around it; a line with its reflection
     楕円と字幕 (mpEllipse) a light Gothic on white: glyphs opening in circles, words gliding along an unseen tilted
                            ellipse, a big glyph revealed by stripes — and the whole line always small at the bottom
   ルビ: written in the lyrics as 漢字《かんじ》 / ｜base《reading》 (src/08_planner.js); without it there is no reading.
   All layouts here are poolOnly: only these styles use them, so every other style plans as before. */
(() => {
'use strict';
const clamp = J.clamp, K = J.beatKit, TAU = Math.PI * 2;
const bez = (x1, y1, x2, y2) => {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t, sy = t => ((ay * t + by) * t + cy) * t, dx = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => { if (x <= 0) return 0; if (x >= 1) return 1; let t = x; for (let i = 0; i < 8; i++) { const d = sx(t) - x, s = dx(t); if (Math.abs(d) < 1e-6 || !s) break; t = clamp(t - d / s); } return sy(t); };
};
const OUT = bez(0.16, 1, 0.3, 1), BACK = bez(0.3, 1.45, 0.5, 1), INOUT = bez(0.65, 0, 0.35, 1);
const own = it => Object.assign(it, { enter: 'cut', exit: 'cut', hold: 'still', mi: 0, noHold: true, plain: true });
const draw = (env, it) => J.mainDraw(env, own(it));
const lat = t => K.hasLatin(t);
const strip = t => (lat(t) ? String(t).trim() : K.strip(t));
const KAN = /[㐀-鿿豈-﫿々〆ヵヶ]/;
const reg = (key, def) => J.register('layout', key, Object.assign(def, { set: 'kinetic', poolOnly: true }), 'mojipv');
const font = (st, role) => J.fontsOf(st, [role])[0];
const lineOf = env => (env.plan && env.plan.lines || []).find(l => l.index === env.cut.line) || null;
// a fast move leaves a short trail behind it (a motion blur made of copies, in the text colour)
const trail = (vx, vy, k) => (k > 0.02 ? { n: 4, dx: -vx / 5, dy: -vy / 5, a: 0.45 * k } : null);

/* ================================================================== 回転文字 */
const ANGLES = [0, -24, 18, 90, -90, 32, -12, 0];
reg('mpPile', {
  name: '回転の山', tags: ['pop', 'graphic'], w: 1, ae: 'scatter', fits: n => n >= 1 && n <= 40,
  plan(rng, cut, st) { return { font: font(st, 'display'), spin: rng.pick([1, -1]) * rng.range(3, 6), rot0: rng.range(-12, 12), a0: rng.int(0, 7), push: rng.range(0.012, 0.025) }; },
  render(env) {
    const { W, H, sc } = env, c = env.cut, P = c.params, port = K.isPort(env);
    const words = K.unitsOf(c, 8).map(strip).filter(Boolean), n = words.length, ts = K.onsets(env, n);
    const U = Math.min(W, H);
    // sizes: the first word with kanji (or the longest) leads, the rest smaller
    let lead = words.findIndex(w => KAN.test(w)); if (lead < 0) lead = words.reduce((b, w, i) => (K.gcount(w) > K.gcount(words[b]) ? i : b), 0);
    const sizes = words.map((w, i) => Math.min(J.fitSize(w, P.font, (port ? W : W * 0.62) * (i === lead ? 1 : 0.6), U * (i === lead ? 0.42 : 0.24), { track: -0.02 }), U * (i === lead ? 0.42 : 0.22)));
    // angles: sideways (±90°) only for short words, which still read that way
    // (the lead word is never set sideways: it is sized for the width)
    const angOf = i => { let a = ANGLES[(i + P.a0) % ANGLES.length]; if (Math.abs(a) === 90 && (K.gcount(words[i]) > 4 || i === lead)) a = a > 0 ? 24 : -24; return a; };
    // positions: the lead word at the centre, the others placed around it where they do not cover each other
    // (each word as a circle the size of its longer side; tried in rings around the centre)
    const rad = words.map((w, i) => { const m = J.measure({ text: w, font: P.font, size: sizes[i], track: -0.02 }); return Math.max(m.w, m.h) * 0.46; });
    const pos = [], key = J.h(P.a0 | 0, n, 77);
    words.forEach((w, i) => {
      if (i === lead) { pos[i] = [0, 0]; return; }
      let best = null, bestHit = Infinity;
      for (let ring = 1; ring <= 6 && !best; ring++) for (let k = 0; k < 16; k++) {
        const a = (k / 16 + J.r(key, i, ring) ) * TAU, r = rad[lead] * 0.55 + ring * U * 0.08;
        const x = Math.cos(a) * r * (port ? 0.85 : 1.5), y = Math.sin(a) * r;
        let hit = 0; pos.forEach((p2, j) => { if (!p2) return; const d = Math.hypot(x - p2[0], y - p2[1]); hit += Math.max(0, rad[i] + rad[j] - d); });
        // and inside the frame (with room for the turn): a word past the edge counts as covered
        // and inside the frame however the picture has turned: within the ellipse the frame holds (its axes less the word)
        const ex = W * 0.44 - rad[i], ey = H * 0.42 - rad[i];
        hit += ex <= 0 || ey <= 0 ? 99 : Math.max(0, Math.hypot(x / ex, y / ey) - 1) * U;
        if (hit < 1e-6) { best = [x, y]; break; }
        if (hit < bestHit) { bestHit = hit; best = ring === 6 && k === 15 ? [x, y] : null; }
      }
      pos[i] = best || [0, (i % 2 ? 1 : -1) * U * 0.32];
    });
    const g = (P.rot0 + P.spin * env.lt) * J.DEG, zoom = 1 + P.push * env.lt, cg = Math.cos(g), sg = Math.sin(g);
    let bb = null;
    words.forEach((w, i) => {
      const dt = env.lt - ts[i]; if (dt < 0) return;
      const q = clamp(dt / 0.2), e = BACK(q), ang = angOf(i);
      const [px, py] = pos[i], x = W / 2 + (px * cg - py * sg) * zoom, y = H / 2 + (px * sg + py * cg) * zoom;
      const rot = ang + P.rot0 + P.spin * env.lt + (1 - e) * 55, s = sizes[i] * zoom * (1 + 0.5 * (1 - e));
      const k = 1 - OUT(q);
      bb = J.unionBB(bb, draw(env, { text: w, font: P.font, size: s, x, y, rot, color: sc.fg, track: -0.02, streak: trail(0, -s * 0.6 * k, k) }));
    });
    return bb;
  },
});
reg('mpGiant', {
  name: '見切れの巨大文字', tags: ['pop', 'graphic'], w: 1, ae: 'huge', fits: n => n >= 1 && n <= 9,
  plan(rng, cut, st) { return { font: font(st, 'display'), rot: rng.pick([0, -14, 12, 0, 90]), drift: rng.pick([1, -1]) * rng.range(0.03, 0.07), small: rng.pick(['corner', 'under']) }; },
  render(env) {
    const { W, H, sc } = env, c = env.cut, P = c.params;
    const words = K.unitsOf(c, 4).map(strip).filter(Boolean), ts = K.onsets(env, words.length), k = Math.max(0, K.curIdx(ts, env.lt));
    const w = words[k], dt = env.lt - ts[k], q = clamp(dt / 0.16), e = OUT(q);
    // one word at a time, bigger than the frame: it zooms in from far bigger and keeps drifting
    // about a quarter of the word goes past the frame: big, but it still reads (sideways only for 3 glyphs or fewer)
    const ng = Math.max(1, K.gcount(w)), vertical = Math.abs(P.rot) === 90 && ng <= 3;
    const base = Math.min(H * 1.15, (vertical ? H : W) * 1.25 / (ng * 0.95));
    const s = base * (1 + 1.6 * (1 - e)), dx = P.drift * W * env.lt;
    const r0 = vertical ? P.rot : Math.abs(P.rot) === 90 ? 0 : P.rot;
    let bb = draw(env, { text: w, font: P.font, size: s, x: W / 2 + dx, y: H / 2, rot: (vertical ? r0 : r0 * (0.6 + 0.4 * e)) + P.drift * 40 * env.lt, color: sc.fg, track: -0.04 });
    // the whole cut small, so the line still reads
    const line = strip(c.text), ss = Math.max(Math.min(W, H) * 0.045, Math.min(J.fitSize(line, P.font, W * 0.4, H * 0.06), H * 0.06));
    if (words.length > 1) bb = J.unionBB(bb, draw(env, { text: line, font: P.font, size: ss, x: P.small === 'corner' ? W * 0.08 : W / 2, y: P.small === 'corner' ? H * 0.9 : H * 0.88, align: P.small === 'corner' ? 'left' : 'center', color: sc.fg }));
    return bb;
  },
});

/* ================================================================== 明朝とルビ */
// the kanji the cut is about: the first one with a reading, else the first kanji
function keyKanji(env) {
  const c = env.cut, t = strip(c.text), ln = lineOf(env);
  for (const r of (ln && ln.ruby) || []) { const i = t.indexOf(r.base); if (i >= 0) return { ch: r.base, at: i, ruby: r.ruby }; }
  const m = [...t].findIndex(ch => KAN.test(ch));
  return m >= 0 ? { ch: [...t][m], at: m, ruby: null } : null;
}
reg('mpKanji', {
  name: '大きな一字とルビ', tags: ['editorial', 'emotional', 'calm'], w: 1, ae: 'center', fits: n => n >= 1 && n <= 30,
  plan(rng, cut, st) { return { font: font(st, 'display'), body: font(st, 'body'), side: rng.pick([1, -1, 0]), copies: rng.chance(0.4), from: rng.pick([-1, -1, 1]) }; },
  render(env) {
    const { W, H, sc } = env, c = env.cut, P = c.params, port = K.isPort(env);
    const key = keyKanji(env);
    if (!key) return J.LAYOUTS.mpLine.render(env);
    const t = strip(c.text), big = Math.min(H * (port ? 0.4 : 0.6) / Math.max(1, [...key.ch].length * (port ? 1 : 0.85)), W * (port ? 0.8 : 0.5));
    const cx = W / 2 + P.side * W * (port ? 0 : 0.16), cy = H * 0.44;
    const dt = env.lt, q = clamp(dt / 0.14), e = OUT(q), k = 1 - e;
    // the kanji drops in from above (or below) with a motion blur, and settles
    const dy = P.from * -1 * (1 - e) * H * 0.55;
    let bb = draw(env, { text: key.ch, font: P.font, size: big, x: cx, y: cy + dy, color: sc.fg, streak: trail(0, P.from * -H * 0.35 * k, k) });
    // its reading, a glyph at a time beside it (vertical on the right of the kanji)
    if (key.ruby) {
      const rs = Math.max(Math.min(W, H) * 0.04, big * 0.16), rr = [...key.ruby], step = Math.min(0.09, Math.max(0.05, c.dur * 0.25 / rr.length));
      const shown = rr.filter((_, i) => env.lt >= 0.12 + i * step).join('');
      if (shown) bb = J.unionBB(bb, draw(env, { text: shown, font: P.body, size: rs, x: cx + big * 0.5 * [...key.ch].length * 0.98 + rs * 0.8, y: cy - big * 0.42, vertical: true, align: 'left', color: sc.accent || sc.fg, track: 0.2 }));
    }
    // the rest of the line, small, under (or beside) the kanji
    const rest = t.length > key.ch.length ? t : '';
    if (rest) {
      const ss = Math.max(Math.min(W, H) * 0.045, Math.min(J.fitSize(rest, P.body, W * 0.5, H * 0.07, { track: 0.1 }), H * 0.06));
      const a = clamp((env.lt - 0.18) / 0.25);
      if (a > 0) bb = J.unionBB(bb, draw(env, { text: rest, font: P.body, size: ss, x: J.clamp(cx, W * 0.06 + J.measure({ text: rest, font: P.body, size: ss, track: 0.1 }).w / 2, W * 0.94 - J.measure({ text: rest, font: P.body, size: ss, track: 0.1 }).w / 2), y: Math.min(H * 0.92, cy + big * 0.55 + ss * 1.3), color: sc.fg, alpha: INOUT(a), track: 0.1 }));
    }
    // two smaller copies of the kanji slide in from the corners on the next beats, cropped by the frame
    if (P.copies) {
      const ts = K.onsets(env, 3);
      [1, 2].forEach(j => {
        const d2 = env.lt - ts[j]; if (d2 < 0 || ts[j] <= 0) return;
        const q2 = clamp(d2 / 0.16), e2 = OUT(q2), side = j === 1 ? -1 : 1;
        const sz = big * 0.62, x = W / 2 + side * (W * 0.46 + (1 - e2) * W * 0.3), y = j === 1 ? H * 0.2 : H * 0.86;
        bb = J.unionBB(bb, draw(env, { text: key.ch, font: P.font, size: sz, x, y, color: sc.fg, alpha: 0.9, streak: trail(side * W * 0.3 * (1 - e2), 0, 1 - e2) }));
      });
    }
    return bb;
  },
});
// a line set with its kanji bigger and its readings over them; the glyphs come in quickly one after another
reg('mpLine', {
  name: 'ルビの行', tags: ['editorial', 'calm', 'emotional'], w: 1, ae: 'center', fits: n => n >= 1 && n <= 30,
  plan(rng, cut, st) { return { font: font(st, 'display'), body: font(st, 'body'), mirror: rng.chance(0.35), y: rng.pick([0.5, 0.42, 0.58]) }; },
  render(env) {
    const { W, H, sc } = env, c = env.cut, P = c.params;
    const t = strip(c.text), chars = [...t], ln = lineOf(env);
    const size = Math.min(J.fitSize(t, P.font, W * 0.8, H * 0.24, { track: 0.04 }), H * 0.2);
    const yc = H * (P.mirror ? 0.42 : P.y);
    const step = Math.min(0.06, c.dur * 0.35 / Math.max(1, chars.length));
    const n = chars.filter((_, i) => env.lt >= i * step).length;
    if (!n) return null;
    // the glyphs that are in, each rising a little as it arrives
    const it = { text: t, font: P.font, size, x: W / 2, y: yc, track: 0.04, color: sc.fg };
    it.pre = (e2, x) => {
      const base = x.charFn;
      x.charFn = (i, g, nn) => {
        const d = env.lt - i * step; if (d < 0) return { hide: true };
        const q = clamp(d / 0.16), r = base ? base(i, g, nn) : null;
        const mine = { dy: (1 - OUT(q)) * size * 0.25, a: Math.min(1, q * 2.5) };
        return r ? Object.assign({}, r, { dy: (r.dy || 0) + mine.dy, a: (r.a ?? 1) * mine.a }) : mine;
      };
    };
    let bb = draw(env, it);
    // readings over their kanji
    if (ln && ln.ruby && bb) {
      const lay = J.measure({ text: t, font: P.font, size, track: 0.04 }), x0 = W / 2 - lay.w / 2;
      for (const r of ln.ruby) {
        const at = t.indexOf(r.base); if (at < 0 || at >= n) continue;
        const pre = J.measure({ text: t.slice(0, at), font: P.font, size, track: 0.04 }).w, bw = J.measure({ text: r.base, font: P.font, size, track: 0.04 }).w;
        const rs = Math.max(Math.min(W, H) * 0.035, size * 0.32);
        bb = J.unionBB(bb, draw(env, { text: r.ruby, font: P.body, size: rs, x: x0 + pre + bw / 2, y: yc - size * 0.72, color: sc.accent || sc.fg, track: 0.15, alpha: clamp((env.lt - at * step - 0.1) / 0.2) }));
      }
    }
    // the reflection: the line upside down under it, turning into place
    if (P.mirror) {
      const q = clamp((env.lt - 0.2) / 0.5), e = INOUT(q);
      if (q > 0) bb = J.unionBB(bb, draw(env, { text: t, font: P.font, size, x: W / 2, y: yc + size * 1.15, track: 0.04, sy: -1, rot: (1 - e) * 25, color: sc.accent || sc.fg, alpha: 0.55 * e }));
    }
    return bb;
  },
});

/* ================================================================== 楕円と字幕 */
// the whole line, small, at the bottom of every cut of this style
function caption(env, P) {
  const { W, H, sc } = env, t = strip(env.cut.lineText || env.cut.text), U = Math.min(W, H);
  // small, but never under the size テキストのみ still draws (3% of the frame)
  const size = Math.max(U * 0.031, Math.min(U * 0.036, J.fitSize(t, P.body, W * 0.84, U * 0.05, { track: 0.12 })));
  return draw(env, { text: t, font: P.body, size, x: W / 2, y: H * 0.93, color: sc.fg, alpha: 0.8 * clamp(env.lt / 0.2), track: 0.12 });
}
reg('mpDisc', {
  name: '円の窓', tags: ['editorial', 'calm', 'emotional'], w: 1, ae: 'center', fits: n => n >= 1 && n <= 24,
  plan(rng, cut, st) { return { font: font(st, 'display'), body: font(st, 'body'), seed: rng.int(0, 999), tilt: rng.range(-0.25, 0.25) }; },
  render(env) {
    const { W, H, sc } = env, c = env.cut, P = c.params;
    const chars = [...strip(c.text)].filter(ch => !/\s/.test(ch)), n = chars.length;
    if (!n) return caption(env, P);
    const span = Math.min(W * 0.78, n * H * 0.2), x0 = W / 2 - span / 2, ts = chars.map((_, i) => i * Math.min(0.12, c.dur * 0.5 / n));
    let bb = null;
    chars.forEach((ch, i) => {
      const dt = env.lt - ts[i]; if (dt < 0) return;
      const big = KAN.test(ch) ? 1 : 0.62, sz = Math.min(H * 0.26, span / n * 1.15) * big;
      const x = n > 1 ? x0 + span * i / (n - 1) : W / 2, y = H * 0.46 + (i - (n - 1) / 2) * H * P.tilt * 0.12 + Math.sin(i * 2.1 + P.seed) * H * 0.05;
      const fx = x + Math.sin(env.lt * 0.6 + i) * W * 0.004, fy = y + Math.cos(env.lt * 0.5 + i * 1.7) * H * 0.006;
      // a circle opens on the glyph (it is the mask, never drawn); some stay a little smaller than the glyph
      const q = clamp(dt / 0.32), r = sz * (J.r(P.seed, i, 3) < 0.12 ? 0.55 : 0.8) * OUT(q);
      const off = (J.r(P.seed, i, 4) - 0.5) * sz * 0.3;
      bb = J.unionBB(bb, draw(env, { text: ch, font: P.font, size: sz, x: fx, y: fy, color: sc.fg,
        clipFn: (ctx) => { ctx.arc(fx + off, fy, Math.max(0.5, r), 0, TAU); } }));
    });
    return J.unionBB(bb, caption(env, P));
  },
});
reg('mpArc', {
  name: '楕円の道', tags: ['editorial', 'calm', 'emotional'], w: 1, ae: 'circle', fits: n => n >= 2 && n <= 30,
  plan(rng, cut, st) { return { font: font(st, 'display'), body: font(st, 'body'), tilt: rng.range(-18, 18), spin: rng.pick([1, -1]) * rng.range(4, 9), ph: rng.range(0, 360) }; },
  render(env) {
    const { W, H, sc } = env, c = env.cut, P = c.params;
    const chars = [...strip(c.text)], n = chars.length;
    const rx = W * 0.4, ry = H * 0.26, tilt = P.tilt * 0.5 * J.DEG, size = Math.min(H * 0.2, (2 * rx * Math.sin(Math.min(144, 26 + n * 12) / 2 * J.DEG) * 1.1) / Math.max(2, n));
    const step = Math.min(0.07, c.dur * 0.4 / Math.max(1, n));
    let bb = null;
    // glyphs along the near half of an unseen tilted ellipse (a smile, read left to right): the ends — further away —
    // smaller and fainter; each glides along the curve into place, and the curve keeps sliding a little
    const items = chars.map((ch, i) => {
      const dt = env.lt - i * step; if (dt < 0) return null;
      const q = OUT(clamp(dt / 0.45)), u = n > 1 ? i / (n - 1) : 0.5;
      const span = Math.min(144, 26 + n * 12);                                        // a short cut uses the middle of the curve
      const a = (90 + (0.5 - u) * span + P.spin * 0.6 * Math.sin(env.lt * 0.7) + (1 - q) * 30) * J.DEG;
      const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry, depth = Math.sin(a);         // 1 = nearest
      const x = W / 2 + ex * Math.cos(tilt) - ey * Math.sin(tilt), y = H * 0.36 + ex * Math.sin(tilt) + ey * Math.cos(tilt);
      const tx = -Math.sin(a) * rx, ty = Math.cos(a) * ry;                              // tangent (a decreases left → right)
      const rot = clamp(Math.atan2(-(tx * Math.sin(tilt) + ty * Math.cos(tilt)), -(tx * Math.cos(tilt) - ty * Math.sin(tilt))) / J.DEG, -32, 32);
      return { i, x, y, depth, rot, a: (0.45 + 0.55 * depth) * Math.min(1, q * 2) };
    }).filter(Boolean);
    for (const g of items) bb = J.unionBB(bb, draw(env, { text: chars[g.i], font: P.font, size: size * (0.6 + 0.55 * g.depth), x: g.x, y: g.y, rot: g.rot, color: sc.fg, alpha: g.a }));
    return J.unionBB(bb, caption(env, P));
  },
});
reg('mpStripe', {
  name: '縞の大文字', tags: ['editorial', 'graphic', 'calm'], w: 1, ae: 'huge', fits: n => n >= 1 && n <= 12,
  plan(rng, cut, st) { return { font: font(st, 'display'), body: font(st, 'body'), bands: rng.pick([5, 6, 8]), dir: rng.pick([1, -1]) }; },
  render(env) {
    const { W, H, sc } = env, c = env.cut, P = c.params;
    const t = strip(c.text), chars = [...t];
    // a short cut is shown whole; a longer one by its first kanji (two at most), else its first two glyphs
    let word = t;
    if (chars.length > 3) { const ki = chars.findIndex(ch => KAN.test(ch)); word = ki >= 0 ? chars[ki] + (KAN.test(chars[ki + 1] || '') ? chars[ki + 1] : '') : chars.slice(0, 2).join(''); }
    const size = Math.min(J.fitSize(word, P.font, W * 0.86, H * 0.66, { track: -0.02 }), H * 0.66);
    const m = J.measure({ text: word, font: P.font, size, track: -0.02 }), x0 = W / 2 - m.w / 2 - size * 0.1, x1 = W / 2 + m.w / 2 + size * 0.1;
    const top = H * 0.46 - m.h * 0.62, bh = m.h * 1.24 / P.bands;
    // horizontal stripes (masks) reveal the glyph band by band, each sweeping across
    const bands = [];
    for (let b = 0; b < P.bands; b++) {
      const q = OUT(clamp((env.lt - b * 0.035) / 0.38)); if (q <= 0) continue;
      const w = (x1 - x0) * q, hh = bh * (0.82 + 0.18 * OUT(clamp((env.lt - 0.5 - b * 0.03) / 0.3)));   // the gaps close once it is in
      bands.push(P.dir > 0 ? [x0, top + b * bh, w, hh] : [x1 - w, top + b * bh, w, hh]);
    }
    let bb = null;
    if (bands.length) bb = draw(env, { text: word, font: P.font, size, x: W / 2, y: H * 0.46, track: -0.02, color: sc.fg, clipFn: (ctx) => { for (const r of bands) ctx.rect(r[0], r[1], r[2], r[3]); } });
    // the rest of the line, small, next to it
    if (t !== word) {
      const ss = Math.max(Math.min(W, H) * 0.045, Math.min(J.fitSize(t, P.body, W * 0.4, H * 0.06), H * 0.06)), a = clamp((env.lt - 0.35) / 0.3);
      if (a > 0) bb = J.unionBB(bb, draw(env, { text: t, font: P.body, size: ss, x: x1 + ss * 0.5, y: H * 0.46 + m.h * 0.42, align: 'left', color: sc.fg, alpha: INOUT(a), track: 0.1 }));
    }
    return J.unionBB(bb, caption(env, P));
  },
});

/* ---------------------------------------------------------------- styles */
const scheme = (bg, fg, accent) => ({ bg, fg, accent, sub: J.mix(fg, bg, 0.45), accent2: fg, ink: fg, dim: J.mix(bg, fg, 0.07), ghostA: accent, ghostB: fg });
const pool = (layout, o) => Object.assign({ layout, enter: { cut: 1 }, exit: { cut: 1 }, hold: { still: 1 }, treat: { none: 1 }, cam: { push: 1 }, trans: {}, fx: {}, decor: {}, bg: {} }, o || {});
const S = {
  mpSpin: {
    name: '回転文字', desc: '一色の地に太い丸ゴシック。語が角度をつけて飛び込み、絵ごと回り続ける。画面に入りきらない一語', moods: ['pop', 'graphic'],
    schemes: [scheme('#FF3E7F', '#FFFFFF', '#FFFFFF'), scheme('#1C2BF2', '#FFFFFF', '#FFFFFF'), scheme('#111111', '#F4F1EA', '#F4F1EA')],
    fonts: { display: ['round'], serif: ['round'], body: ['round'], mono: ['mono'] }, chorusHit: false, oneCut: 0.95,
    pool: pool({ mpPile: 1.6, mpGiant: 0.7 }),
    adobeFonts: { display: ['ad_logomaru'], serif: ['ad_logomaru'], body: ['ad_shs_b'], latin: 'futura-pt' },
  },
  mpRuby: {
    name: '明朝とルビ', desc: '生成りと二色の明朝。大きな一字にルビ、ぶれを残して落ちて止まる。行の映り込み（ルビは 漢字《かんじ》 と書く）', moods: ['editorial', 'emotional', 'calm'],
    schemes: [scheme('#F1EBDD', '#1E1A16', '#9C2F3F'), scheme('#25241C', '#EFE6CF', '#C9A86A'), scheme('#22364A', '#EDE6D3', '#E2B6A0')],
    fonts: { display: ['mincho_black'], serif: ['shippori'], body: ['mincho'], mono: ['mono'] }, chorusHit: false, oneCut: 0.6,
    pool: pool({ mpKanji: 1.3, mpLine: 1 }, { trans: { cover: 1, uncover: 1 } }),
    adobeFonts: { display: ['ad_ryodisp_h'], serif: ['ad_ten'], body: ['ad_tsukua'] },
  },
  mpEllipse: {
    name: '楕円と字幕', desc: '白地に細いゴシック。円の窓から字が開き、見えない楕円に沿って流れる。下にはいつも行の字幕', moods: ['editorial', 'calm', 'emotional'],
    schemes: [scheme('#FAFAFC', '#2B3A67', '#2B3A67'), scheme('#ECEDEF', '#1F2533', '#1F2533'), scheme('#11152A', '#E9ECF5', '#E9ECF5')],
    fonts: { display: ['gothic_light'], serif: ['mincho_light'], body: ['gothic_light'], mono: ['mono'] }, chorusHit: false, oneCut: 0.7,
    pool: pool({ mpDisc: 1.2, mpArc: 1.1, mpStripe: 0.8 }),
    adobeFonts: { display: ['ad_shs_l'], serif: ['ad_tsukua'], body: ['ad_shs_l'] },
  },
};
for (const [k, v] of Object.entries(S)) {
  if (J.STYLES[k]) continue;
  J.STYLES[k] = Object.assign({ bias: {}, texture: { grain: 0, paper: 0, scan: 0 }, hud: false, glow: 0, decor: {}, ghost: 0, textOnly: true }, v);
  if (!J.STYLE_ORDER.includes(k)) J.STYLE_ORDER.push(k);
}
})();
