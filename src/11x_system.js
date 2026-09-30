/* JIZURA — 文字PVの組み方 (the text-only type system), from a frame-by-frame study of lyric videos that went viral
   (DECO*27「ヴァンパイア」, 柊マグネタイト「マーシャル・マキシマイザー」, 吉田夜世「オーバーライド」, Kanaria「KING」, and
   text-animation tips on X). What they share:
     · a word appears when it is sung — at once, or with a 2–3 frame pop. There are no long eases. Once there, the word
       holds perfectly still, and the whole picture is cut away on the phrase (no exit animation, no transition)
     · the picture is built up: the words of a phrase — often of several lines — pile up into one composition
     · sizes are mixed inside a phrase: the kanji of a word big, its kana small (強がってたって, 伸ばして登場)
     · the song's sections are staged differently: verses small and quiet (a column at the edge, a typeset block),
       choruses huge — vertical columns that fill the frame and are cropped by it, a word split to both edges
     · one typeface and one colour per song; a faint tone-on-tone copy of the word behind is the only "effect"
   Curves (J.EZ, cubic-bezier) are kept for the few moves there are: out 0.16,1,0.3,1 · in 0.7,0,0.84,0 ·
   inOut 0.65,0,0.35,1 · settle 0.34,1.3,0.64,1.
   Layouts (poolOnly — used by the director below, never drawn at random)
     sysBuild   積み上げ    the words of 1–3 lines pile up into one block: rows (a typeset poster) or stairs (a cascade)
     sysEdge    端の縦書き  small vertical columns at the edge of the frame, typed out as they are sung; lines accumulate
     sysGiant   巨大縦組    each word a vertical column as tall as the frame, cropped by it
     sysSplit   両端の大字  a two-kanji word split to the two edges, huge; the line small between them
     sysScatter 散らし      one word at a time, big, on alternating sides, with a faint giant copy behind
   J.systemDirect(plan) stages a song: it finds the sections, decides which are choruses (repeated lines, loudness),
   and gives verses and choruses their layouts — once per section, so a section reads as one idea. Cuts set by hand
   (per-line settings, locked lines) are left alone. */
(() => {
'use strict';
const clamp = J.clamp;
const K = J.beatKit;

/* ---------------------------------------------------------------- curves */
const bez = (x1, y1, x2, y2) => {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t, sy = t => ((ay * t + by) * t + cy) * t, dx = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const d = sx(t) - x, s = dx(t); if (Math.abs(d) < 1e-6 || !s) break; t = clamp(t - d / s); }
    return sy(t);
  };
};
J.bez = bez;
J.EZ = { out: bez(0.16, 1, 0.3, 1), in: bez(0.7, 0, 0.84, 0), inOut: bez(0.65, 0, 0.35, 1), settle: bez(0.34, 1.3, 0.64, 1) };
const EZ = J.EZ;

/* ---------------------------------------------------------------- shared */
const POP = 0.1;                                            // seconds: the appearance of a word (about 2 frames at 24 fps)
// scale of a word dt seconds after it appears (null = not yet): it lands slightly large and settles
const pop = (dt, amt = 0.12) => (dt < 0 ? null : 1 + amt * (1 - EZ.out(clamp(dt / POP))));
// items drawn with their own motion only (the cut's enter / exit / hold are not used)
const own = it => Object.assign(it, { enter: 'cut', exit: 'cut', hold: 'still', mi: 0, noHold: true, plain: true });
const draw = (env, it) => J.mainDraw(env, own(it));
const lat = t => K.hasLatin(t);
const tone = sc => J.mix(sc.bg, sc.fg, 0.13);             // a faint copy in the background's own hue
const song = (st, kinds) => J.fontsOf(st, kinds)[0];      // one face per song

/* the runs of a word: kanji runs, katakana, hiragana, Latin — the kanji are set big, the kana small */
const KAN = /[㐀-鿿豈-﫿々〆ヵヶ]/, KATA = /[゠-ヿ]/, PUN = /[、。，．！？!?,.…・「」『』（）()〜―\-]/;
function runs(word) {
  if (lat(word)) return word.split(/\s+/).filter(Boolean).map(w => ({ t: w, k: 'L' }));
  const out = [];
  for (const ch of [...word]) {
    const k = KAN.test(ch) ? 'K' : KATA.test(ch) ? 'T' : 'H';
    const last = out[out.length - 1];
    if (last && (last.k === k || PUN.test(ch) || (ch === 'ー' && last.k !== 'K'))) last.t += ch; else out.push({ t: ch, k });
  }
  return out;
}
// relative size of a run inside its word
function runScale(r, all) {
  const g = K.gcount(r.t);
  if (r.k === 'K') return 1;
  if (r.k === 'T') return g >= 3 ? 0.9 : 0.62;
  if (r.k === 'L') { const n = r.t.replace(/[^A-Za-z']/g, '').length; return n <= 3 ? 0.56 : n <= 5 ? 0.8 : 1; }   // short words small, long words big
  if (all.every(x => x.k === 'H')) return g <= 2 ? 0.6 : 0.8;             // a word that is all kana: one size
  return g <= 3 ? 0.5 : 0.6;
}
/* the runs of one word set at size u: [{t, s, w, x}] with x from the word's left edge */
function setWord(word, font, u) {
  const rs = runs(word), out = [];
  let x = 0;
  for (const r of rs) {
    const s = u * runScale(r, rs), w = J.measure({ text: r.t, font, size: s, track: 0 }).w;
    out.push({ t: r.t, s, w, x }); x += w + (r.k === 'L' ? u * 0.24 : s * 0.04);
  }
  const last = out[out.length - 1];
  out.w = last ? last.x + last.w : 0; out.h = Math.max(...out.map(r => r.s));
  return out;
}

/* ================================================================== sysBuild — 積み上げ */
// P.block = { id, texts: [the cut texts of the block, in order], slot: this cut's place in it }
const buildCache = new Map();
function buildLayout(env, P) {
  const { W, H } = env, B = P.block, key = [B.id, B.texts.length, W, H, P.font, P.arr, P.side, J.LATIN || ''].join('|');
  if (buildCache.has(key)) return buildCache.get(key);
  const port = K.isPort(env), M = Math.min(W, H) * 0.08, stairs = P.arr === 'stairs';
  const rw = W * (port ? 0.86 : stairs ? 0.8 : 0.7), rh = H * (port ? 0.72 : 0.84);
  // the words, grouped by lyric line (a line cut in several pieces is still one line): [[{w, e}]] (e = entry index)
  const lines = [];
  B.texts.forEach((t, e) => {
    const li = B.lines ? B.lines[e] : e, ws = K.unitsOf({ text: t, words: J.chunkText(t) }, 8).map(w => ({ w, e }));
    if (lines.length && lines[lines.length - 1].li === li) lines[lines.length - 1].push(...ws); else { ws.li = li; lines.push(ws); }
  });
  const lay = u => {
    const pieces = []; let y = 0, rowW = 0, row = [], maxW = 0;
    const flush = () => {
      if (!row.length) return;
      const h = Math.max(...row.map(p => p.set.h));
      row.forEach(p => { p.base = y + h; p.rw = rowW; });
      pieces.push(...row); maxW = Math.max(maxW, rowW); y += h * 1.1; row = []; rowW = 0;
    };
    lines.forEach(ws => {
      ws.forEach(({ w, e }) => {
        const set = setWord(w, P.font, u);
        if (stairs ? row.length > 0 : row.length && rowW + u * 0.14 + set.w > rw) flush();
        const g = row.length ? u * (lat(w) ? 0.28 : 0.14) : 0;
        row.push({ set, li: e, x: rowW + g }); rowW += g + set.w;
      });
      if (!stairs) flush();
    });
    flush();
    return { pieces, w: maxW, h: y };
  };
  // the largest size that fits the region
  let u = H * (port ? 0.2 : 0.34), L = lay(u);
  for (let i = 0; i < 30 && (L.w > rw || L.h > rh); i++) { u *= 0.93; L = lay(u); }
  const right = P.side > 0 && !port;
  if (stairs) {                                              // each word a step further across
    const n = L.pieces.length, span = Math.max(0, rw - Math.max(...L.pieces.map(p => p.set.w)));
    L.pieces.forEach((p, i) => { p.x = n > 1 ? span * i / (n - 1) : span / 2; p.rw = 0; });
    L.w = rw;
  }
  const x0 = port ? (W - L.w) / 2 : right ? W - M - L.w : M, y0 = (H - L.h) / 2;
  // rows set flush to the block's side
  L.pieces.forEach(p => { p.ax = x0 + (right && !stairs ? L.w - p.rw : 0) + p.x; p.ay = y0 + p.base; });
  if (buildCache.size > 80) buildCache.clear();
  buildCache.set(key, L);
  return L;
}

J.register('layout', 'sysBuild', {
  name: '積み上げ', tags: ['editorial', 'graphic', 'pop', 'emotional'], w: 1, ae: 'center', set: 'kinetic', poolOnly: true, fits: n => n >= 1 && n <= 40,
  plan(rng, cut, st) { return { font: song(st, ['display']), arr: rng.chance(0.5) ? 'rows' : 'stairs', side: rng.chance(0.5) ? 1 : -1, block: { id: cut.seed, texts: [cut.text], slot: 0 } }; },
  render(env) {
    const { sc } = env, c = env.cut, P = c.params, B = P.block && P.block.texts ? P.block : { id: c.seed, texts: [c.text], slot: 0 };
    const L = buildLayout(env, Object.assign({}, P, { block: B }));
    const mine = L.pieces.filter(p => p.li === B.slot), ts = K.onsets(env, mine.length);
    let bb = null;
    for (const p of L.pieces) {
      if (p.li > B.slot) continue;
      let s = 1;
      if (p.li === B.slot && !B.full) { s = pop(env.lt - ts[mine.indexOf(p)]); if (s == null) continue; }
      const cx = p.ax + p.set.w / 2;
      for (const r of p.set) {
        // every run sits on the row's baseline; the pop scales the word about its centre
        const x = cx + (p.ax + r.x + r.w / 2 - cx) * s, y = p.ay - r.s * s * 0.5;
        bb = J.unionBB(bb, draw(env, { text: r.t, font: P.font, size: r.s * s, x, y, color: sc.fg }));
      }
    }
    return bb;
  },
});

/* ================================================================== sysEdge — 端の縦書き */
J.register('layout', 'sysEdge', {
  name: '端の縦書き', tags: ['editorial', 'calm', 'emotional'], w: 1, ae: 'vcols', set: 'kinetic', poolOnly: true, fits: n => n >= 1 && n <= 40,
  plan(rng, cut, st) { return { font: song(st, ['serif', 'display']), side: rng.chance(0.6) ? 1 : -1, block: { id: cut.seed, texts: [cut.text], slot: 0 } }; },
  render(env) {
    const { W, H, sc } = env, c = env.cut, P = c.params, B = P.block && P.block.texts ? P.block : { texts: [c.text], slot: 0 };
    const texts = B.texts.map(t => (lat(t) ? String(t).trim() : K.strip(t))), anyLat = texts.some(lat);
    const M = Math.min(W, H) * 0.08, right = P.side > 0;
    const mine = K.unitsOf(c, 8), ts = K.onsets(env, mine.length);
    // this line is typed out as it is sung: each word from its onset, 50 ms a glyph
    const at = []; mine.forEach((w, i) => { const n = [...(lat(w) ? w.trim() + ' ' : K.strip(w))].length; for (let j = 0; j < n; j++) at.push(ts[i] + j * 0.05); });
    let shown = 0; for (const a of at) if (env.lt >= a) shown++;
    const vis = (t, i) => (i < B.slot || B.full ? t : [...t].slice(0, shown).join(''));
    let bb = null;
    if (anyLat) {                                              // Latin: small lines at the bottom edge
      const size = Math.min(...texts.map(t => J.fitSize(t, P.font, W * 0.6, H * 0.06, { track: 0.02 })), H * 0.05);
      texts.forEach((t, i) => {
        const v = i > B.slot ? '' : vis(t, i);
        if (v) bb = J.unionBB(bb, draw(env, { text: v, font: P.font, size, x: right ? W - M : M, y: H - M - (B.slot - i) * size * 1.5, align: right ? 'right' : 'left', track: 0.02, color: sc.fg }));
      });
      return bb;
    }
    // one column per lyric line (a line cut in several pieces still reads as one column)
    const cols = [];
    texts.forEach((t, i) => {
      if (i > B.slot) return;
      const li = B.lines ? B.lines[i] : i, last = cols[cols.length - 1], v = vis(t, i);
      if (last && last.li === li) last.t += v; else cols.push({ li, t: v });
    });
    const all = []; texts.forEach((t, i) => { const li = B.lines ? B.lines[i] : i; const last = all[all.length - 1]; if (last && last.li === li) last.n += [...t].length; else all.push({ li, n: [...t].length }); });
    // a long line goes on in a second column (at most 12 glyphs a column, so the type stays readable)
    const WRAP = 12, longest = Math.min(WRAP, Math.max(...all.map(x => x.n), 1));
    const wrapped = [];
    cols.forEach(cc => { const a = [...cc.t], n = (all.find(x => x.li === cc.li) || { n: a.length }).n, per = Math.ceil(n / Math.ceil(n / WRAP)); for (let k = 0; k * per < Math.max(1, a.length); k++) wrapped.push({ li: cc.li, t: a.slice(k * per, (k + 1) * per).join(''), cont: k > 0 }); });
    cols.length = 0; cols.push(...wrapped);
    const size = clamp(H * 0.74 / longest, Math.min(W, H) * 0.045, H * 0.08), col = size * 1.75;
    let xo = 0;
    cols.forEach((cc, i) => {
      if (i > 0) xo += cc.cont ? size * 1.3 : col;                  // a continued line sits closer than the next line
      if (!cc.t) return;
      const x = right ? W - M - size / 2 - xo : M + size / 2 + xo;
      bb = J.unionBB(bb, draw(env, { text: cc.t, font: P.font, size, x, y: M + H * 0.03, vertical: true, align: 'left', track: 0.06, color: sc.fg }));
    });
    return bb;
  },
});

/* ================================================================== sysGiant — 巨大縦組 */
J.register('layout', 'sysGiant', {
  name: '巨大縦組', tags: ['editorial', 'graphic', 'pop', 'calm', 'emotional'], w: 1, ae: 'vcols', set: 'kinetic', poolOnly: true, fits: n => n >= 1 && n <= 24,
  plan(rng, cut, st) { return { font: song(st, rng.chance(0.5) ? ['serif', 'display'] : ['display']), order: rng.chance(0.75) ? 1 : -1 }; },
  render(env) {
    const { W, H, sc } = env, c = env.cut, P = c.params, ord = (P.order ?? 1) > 0 ? 1 : -1, font = P.font || song(env.st, ['display']);
    // the words of the whole line (a chorus line in several cuts fills up across them); this cut's words on their onsets
    const B = P.block && P.block.texts ? P.block : { texts: [c.text], slot: 0 };
    const per = Math.max(1, Math.floor(5 / B.texts.length)), words = [], from = [];
    B.texts.forEach((t, i) => K.unitsOf({ text: t, words: J.chunkText(t) }, Math.min(4, per)).forEach(w => { w = lat(w) ? w.trim() : K.strip(w); if (w) { words.push(w); from.push(i); } }));
    const mineN = from.filter(i => i === B.slot).length, ts0 = K.onsets(env, Math.max(1, mineN)), n = words.length;
    const ts = from.map((i, j) => (i < B.slot || B.full ? -1 : i > B.slot ? 1e9 : ts0[j - from.indexOf(B.slot)]));
    let bb = null;
    if (lat(c.text)) {                                        // Latin: rows as wide as the frame
      const up = words.map(w => w.toUpperCase());
      const sizes = up.map(w => Math.min(J.fitSize(w, font, W * 1.02, H, { track: -0.02 }), H * 0.9 / n / 0.86));
      const tot = sizes.reduce((a, b) => a + b * 0.86, 0);
      let y = H / 2 - tot / 2;
      up.forEach((w, i) => {
        const s = pop(env.lt - ts[i], 0.06), sz = sizes[i];
        y += sz * 0.43;
        if (s != null) bb = J.unionBB(bb, draw(env, { text: w, font, size: sz * s, x: W / 2, y, track: -0.02, color: sc.fg }));
        y += sz * 0.43;
      });
      return bb;
    }
    // each column as tall as the frame (a little more: the frame crops it)
    let sizes = words.map(w => clamp(H * 1.04 / Math.max(1, [...w].length), H * 0.13, H * 0.62));
    const tw = sizes.reduce((a, b) => a + b * 1.04, 0);
    if (tw > W * 1.06) sizes = sizes.map(s => s * W * 1.06 / tw);
    const tot = sizes.reduce((a, b) => a + b * 1.04, 0), pad = Math.max(0, (W - tot) / (n + 1));
    let x = tot > W ? W / 2 + ord * tot / 2 : ord > 0 ? W - pad : pad;
    words.forEach((w, i) => {
      const sz = sizes[i], cx = x - ord * sz * 0.52;
      x -= ord * (sz * 1.04 + pad);
      const s = pop(env.lt - ts[i], 0.06);
      if (s != null) bb = J.unionBB(bb, draw(env, { text: w, font, size: sz * s, x: cx, y: H / 2, vertical: true, track: -0.02, color: sc.fg }));
    });
    return bb;
  },
});

/* ================================================================== sysSplit — 両端の大字 */
const splitKey = t => { if (lat(t)) return null; const m = K.strip(t).match(/[㐀-鿿々]{2}/); return m ? m[0] : null; };
J.register('layout', 'sysSplit', {
  name: '両端の大字', tags: ['graphic', 'pop', 'editorial'], w: 1, ae: 'center', set: 'kinetic', poolOnly: true, fits: n => n >= 2 && n <= 16,
  plan(rng, cut, st) { return { font: song(st, ['display']), small: song(st, ['body', 'display']) }; },
  render(env) {
    const { W, H, sc } = env, c = env.cut, P = c.params, key = splitKey(c.text);
    if (!key) return J.LAYOUTS.sysGiant.render(env);
    const port = K.isPort(env), ts = K.onsets(env, 3), [a, b] = [...key];
    const big = Math.min(H * (port ? 0.34 : 0.7), W * (port ? 0.42 : 0.3));
    const line = K.strip(c.text), ss = Math.min(J.fitSize(line, P.small, W - big * 2.3, H * 0.12, { track: 0.04 }), H * 0.07);
    const s0 = pop(env.lt - ts[0], 0.1), s1 = pop(env.lt - ts[1], 0.1), s2 = pop(env.lt - ts[2], 0.05), ex = W * 0.03 + big / 2;
    let bb = null;
    if (s0 != null) bb = J.unionBB(bb, draw(env, { text: a, font: P.font, size: big * s0, x: ex, y: H / 2, color: sc.fg }));
    if (s1 != null) bb = J.unionBB(bb, draw(env, { text: b, font: P.font, size: big * s1, x: W - ex, y: H / 2, color: sc.fg }));
    if (s2 != null) bb = J.unionBB(bb, draw(env, { text: line, font: P.small, size: ss * s2, x: W / 2, y: H / 2, track: 0.04, color: sc.fg }));
    return bb;
  },
});

/* ================================================================== sysScatter — 散らし */
const SPOTS = [[0.3, 0.38], [0.7, 0.62], [0.32, 0.68], [0.68, 0.34]];
// a word longer than four glyphs is shown in its sung pieces (透明 / なままじゃ); a piece is never a lone kana
const scatterPieces = c => {
  const out = [];
  for (let w of K.unitsOf(c, 6)) {
    w = lat(w) ? w.trim() : K.strip(w);
    if (!w) continue;
    if (lat(w) || K.gcount(w) <= 4) { out.push(w); continue; }
    const rs = runs(w).map(r => r.t);
    for (let i = 0; i < rs.length; i++) if (K.gcount(rs[i]) < 2 && rs.length > 1) { const j = i + 1 < rs.length ? i + 1 : i - 1; rs[Math.min(i, j)] = rs[Math.min(i, j)] + rs[Math.max(i, j)]; rs.splice(Math.max(i, j), 1); i = -1; }
    out.push(...rs);
  }
  return out.length ? out : [K.strip(c.text)];
};
J.register('layout', 'sysScatter', {
  name: '散らし', tags: ['pop', 'graphic', 'glitch'], w: 1, ae: 'center', set: 'kinetic', poolOnly: true, fits: n => n >= 2 && n <= 24,
  plan(rng, cut, st) { return { font: song(st, ['display']), o: rng.int(0, 3) }; },
  render(env) {
    const { W, H, sc } = env, c = env.cut, P = c.params, port = K.isPort(env);
    const words = scatterPieces(c), ts = K.onsets(env, words.length);
    const k = Math.max(0, K.curIdx(ts, env.lt)), w = words[k] || K.strip(c.text);
    const sp = SPOTS[(k + (P.o | 0)) % 4], op = SPOTS[(k + (P.o | 0) + 1) % 4], s = pop(env.lt - ts[k], 0.14) || 1;
    // the faint giant copy on the other side, cropped by the frame
    draw(env, { text: w, font: P.font, size: J.fitSize(w, P.font, W * 0.95, H * 0.95, { track: -0.02 }), x: W * op[0], y: H * op[1], track: -0.02, color: tone(sc) });
    const size = Math.min(J.fitSize(w, P.font, W * (port ? 0.9 : 0.58), H * (port ? 0.3 : 0.42), { track: -0.01 }), H * 0.38);
    // kept inside the frame's margin
    const m = J.measure({ text: w, font: P.font, size, track: -0.01 }), M = Math.min(W, H) * 0.06;
    const x = clamp(W * (port ? 0.5 : sp[0]), M + m.w / 2, W - M - m.w / 2), y = clamp(H * sp[1], M + m.h / 2, H - M - m.h / 2);
    return draw(env, { text: w, font: P.font, size: size * s, x, y, track: -0.01, color: sc.fg });
  },
});

/* a still camera: a block built over several cuts must not jump when the cut changes */
J.CAMERA.hold = { name: '固定', tags: [], w: 0, get: () => ({ s: 1 }) };

/* ================================================================== the director */
const norm = t => String(t || '').replace(/[\s、。，．,.!！?？…・「」『』（）()"'“”‘’~〜ー―-]/g, '');
const VERSE = {
  pop: [['sysBuild:stairs', 1.2], ['sysBuild:rows', 1]],
  calm: [['sysEdge', 1.3], ['sysBuild:rows', 1]],
  editorial: [['sysBuild:rows', 1.2], ['sysEdge', 1], ['sysBuild:stairs', 0.6]],
};
const CHORUS = {
  pop: [['sysGiant', 1], ['bsBeatWord', 1], ['sysScatter', 1]],
  calm: [['sysGiant', 1.3], ['sysBuild:rows', 0.8]],
  editorial: [['sysGiant', 1.2], ['sysScatter', 0.6], ['bsBeatWord', 0.6]],
};
const kindOf = st => { const m = st.moods || []; return m.includes('pop') || m.includes('glitch') ? 'pop' : m.includes('calm') || m.includes('emotional') ? 'calm' : 'editorial'; };
const wpick = (rng, list) => { const t = list.reduce((a, x) => a + x[1], 0); let r = rng() * t; for (const x of list) { r -= x[1]; if (r <= 0) return x[0]; } return list[0][0]; };
const hashText = t => [...norm(t)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7);

J.systemDirect = (plan, st) => {
  if (!st || !st.system) return;
  const lyric = c => c.layout !== 'interlude' && !c.manual && String(c.text || '').trim();
  // sections: a blank line in the lyrics, a pause, an interlude or a cut set by hand separates them
  const secs = []; let cur = null;
  for (const c of plan.cuts) {
    if (!lyric(c)) { cur = null; continue; }
    const prev = cur && cur[cur.length - 1];
    const ln = plan.lines.find(l => l.index === c.line);
    if (!cur || c.start - prev.end > 1.2 || (c.line !== prev.line && ln && ln.gapBefore)) { cur = []; secs.push(cur); }
    cur.push(c);
  }
  if (!secs.length) return;
  // choruses: lines that come back, sung louder than the middle of the song
  const count = new Map();
  plan.lines.forEach(l => { const k = norm(l.text); if (k.length > 1) count.set(k, (count.get(k) || 0) + 1); });
  const en = plan.energy, rate = plan.energyRate || 0;
  const loud = s => {
    if (!en || !rate) return 0;
    let a = 0, n = 0;
    for (const c of s) for (let t = c.start; t < c.end; t += 0.1) { const v = en[Math.floor(t * rate)]; if (v != null) { a += v; n++; } }
    return n ? a / n : 0;
  };
  const L = secs.map(loud), sorted = L.slice().sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)], q3 = sorted[Math.floor(sorted.length * 0.75)];
  const hasEn = !!(en && rate);
  const kind = kindOf(st), blocks = [], quiet = [];
  secs.forEach((s, si) => {
    const rep = s.filter(c => (count.get(norm(c.lineText)) || 0) >= 2).length / s.length;
    const chorus = hasEn ? (rep >= 0.5 && L[si] >= med * 0.95) || (secs.length > 2 && L[si] >= q3 && L[si] > med * 1.08) : rep >= 0.5;
    const rng = J.rng(J.h(s[0].seed, si, 991));
    if (chorus) {
      // a palette of two for the section; a line always gets the same one, so a repeated chorus looks the same
      const pal = [wpick(rng, CHORUS[kind])];
      for (let t = 0; pal.length < 2 && t < 8; t++) { const v = wpick(rng, CHORUS[kind]); if (!pal.includes(v)) pal.push(v); }
      // the layout follows the line (not the cut), so all of a line reads as one picture
      const lineBlk = new Map();
      s.forEach(c => {
        const r2 = J.rng(J.h(hashText(c.lineText || c.text), 17));
        let v = pal[Math.floor(r2() * pal.length)];
        if ((c.kime || c.emph) && !c.recap && splitKey(c.text) && J.rng(J.h(hashText(c.text), 18))() < 0.6) v = 'sysSplit';
        if (!J.LAYOUTS[v.split(':')[0]]) v = 'sysGiant';
        const [lay, arr] = v.split(':');
        if (lay !== 'sysBuild' && lay !== 'sysGiant') { setCut(c, lay, r2, st, null); return; }
        let blk = lineBlk.get(c.line + ':' + lay);
        if (!blk) { blk = { id: c.seed, texts: [], scheme: c.scheme }; lineBlk.set(c.line + ':' + lay, blk); }
        setCut(c, lay, r2, st, { arr: arr || 'rows', blk, recap: !!(c.recap && blk.texts.length) });
      });
      return;
    }
    // verse: one staging and one colour for the section, the lines built up in blocks
    let [lay, arr] = wpick(rng, VERSE[kind]).split(':');
    const scheme = s[0].scheme;
    if (arr === 'stairs' && s.some(c => lat(c.text))) arr = 'rows';      // English reads in rows, not a word a step
    let blk = null;
    s.forEach(c => {
      c.scheme = scheme; quiet.push(c);
      // the whole line again (the planner's recap cut): the block just stays
      if (c.recap && blk && blk.lastLine === c.line && blk.texts.length) { setCut(c, lay, rng, st, { arr, blk, recap: true }); return; }
      const g = lat(c.text) ? String(c.text).trim().split(/\s+/).length * 2.5 : K.gcount(c.text), maxLines = arr === 'stairs' ? 1 : lay === 'sysEdge' ? 3 : 2, maxG = lay === 'sysEdge' ? 44 : arr === 'stairs' ? 18 : 26;
      const newLine = !blk || c.line !== blk.lastLine;
      if (!blk || (newLine && blk.lines >= maxLines) || blk.g + g > maxG || c.end - blk.t0 > 11) { blk = { id: c.seed, texts: [], g: 0, lines: 0, lastLine: null, t0: c.start, scheme: c.scheme }; blocks.push(blk); }
      if (c.line !== blk.lastLine) { blk.lines++; blk.lastLine = c.line; }
      blk.g += g;
      setCut(c, lay, rng, st, { arr, blk });
    });
  });
  // no effects on the staged cuts (the references have none): a chorus keeps its colour flip and a zoom hit, a verse stays still
  const staged = plan.cuts.filter(c => c.staged);
  plan.events = plan.events.filter(e => e.chorus || !staged.some(c => e.t >= c.start - 0.05 && e.t < c.end && (e.type !== 'zoom' || quiet.includes(c))));
};
function setCut(c, lay, rng, st, o) {
  c.layout = lay;
  c.params = J.LAYOUTS[lay].plan(rng, c, st);
  if (o && o.blk) {
    if (!o.recap) { o.blk.texts.push(c.text); (o.blk.lines_ || (o.blk.lines_ = [])).push(c.line); }
    if (o.arr) c.params.arr = o.arr;
    // the cuts of a block share one list of texts, so the words of the earlier lines stay where they were
    c.params.block = { id: o.blk.id, texts: o.blk.texts, lines: o.blk.lines_, slot: o.blk.texts.length - 1, full: !!o.recap };
    c.params.side = J.h(o.blk.id, 5) % 2 ? 1 : -1;
    c.scheme = o.blk.scheme;
  }
  Object.assign(c, { enter: 'cut', exit: 'cut', hold: 'still', inDur: 0.05, outDur: 0, trans: null, transP: {}, transDur: 0, treat: 'none', treatP: {}, decor: [], cam: 'hold', camP: {}, bg: 'none', bgP: {} });
  delete c.morph; delete c.weightGrow;
  c.staged = true;
}

/* the text-only styles are staged by the director (horror keeps its own staging) */
for (const k of J.STYLE_ORDER) {
  const st = J.STYLES[k];
  if (st && st.textOnly && !(st.moods || []).includes('horror')) st.system = true;
}
})();
