/* JIZURA pack: type2 — more text-only variations: typographic layouts timed on the beat, and styles with their own
   type personality (face, palette and the handful of parts they draw from).
   Layouts (text only; random picks use them only in text-only styles — see J.TEXT_POOL and the styles below)
     tyStackJustify  積層ワード      the words stacked one per beat, each set to the full measure: a justified block
     tyCropSlide     見切れスライド  one word bigger than the frame, stepping across it on the beat
     tyGridFill      升目充填        the words dropped into a 2×2 / 3×2 grid, one cell per beat
   Styles: 明朝の余白 / ストリート / 手書きの歌 / 昭和ポスター / 白い余白 */
(() => {
'use strict';
const E = J.E, clamp = J.clamp;
const K = J.beatKit;
const reg = (key, def) => J.register('layout', key, Object.assign(def, { set: 'kinetic', poolOnly: true }), 'type2');
const miAt = (env, t) => Math.max(0, t) / Math.max(0.005, env.cut.stagger || 0.04);
const upper = t => (K.hasLatin(t) ? String(t).toUpperCase() : t);

/* ================================================================== tyStackJustify — 積層ワード */
reg('tyStackJustify', {
  name: '積層ワード', tags: ['graphic', 'editorial', 'pop'], w: 0.8, ae: 'center', fits: n => n >= 3 && n <= 30,
  enterBias: { cut: 4 },
  plan(rng, cut, st) {
    return { font: rng.pick(J.fontsOf(st, ['display'])), from: rng.pick(['side', 'side', 'below']), accent: rng.pick(['last', 'none', 'first']), lead: rng.range(0.9, 1.02) };
  },
  render(env) {
    const { W, H, sc } = env, c = env.cut, Pm = c.params, port = K.isPort(env);
    const units = K.unitsOf(c, port ? 6 : 5).map(upper), n = units.length;
    const ts = K.onsets(env, n), k = K.curIdx(ts, env.lt);
    if (k < 0) return null;
    const mw = W * (port ? 0.86 : 0.7);
    let sizes = units.map(u => Math.min(J.fitSize(u, Pm.font, mw, H * 0.3, { track: 0 }), H * (port ? 0.2 : 0.3)));
    const lead = Pm.lead || 0.96;
    let tot = sizes.reduce((a, s) => a + s * lead, 0);
    const maxH = H * 0.86;
    if (tot > maxH) { const f = maxH / tot; sizes = sizes.map(s => s * f); tot = maxH; }
    let y = H / 2 - tot / 2, bb = null;
    const m = K.motionK(env);
    units.forEach((u, i) => {
      const s = sizes[i], yc = y + s * lead / 2; y += s * lead;
      if (i > k) return;
      const dt = env.lt - ts[i], e = E.outExpo(clamp(dt / 0.22)), side = i % 2 ? 1 : -1;
      const dx = Pm.from === 'side' ? side * W * 0.18 * (1 - e) * m : 0, dy = Pm.from === 'below' ? H * 0.06 * (1 - e) * m : 0;
      const acc = (Pm.accent === 'last' && i === n - 1) || (Pm.accent === 'first' && i === 0);
      bb = J.unionBB(bb, J.mainDraw(env, { text: u, font: Pm.font, size: s * (1 + 0.06 * K.kick(dt, 16) * m), x: W / 2 + dx, y: yc + dy, track: 0, color: acc ? K.accOn(sc) : sc.fg, alpha: clamp(dt / 0.06), mi: miAt(env, ts[i]) }));
    });
    return bb;
  },
});

/* ================================================================== tyCropSlide — 見切れスライド */
reg('tyCropSlide', {
  name: '見切れスライド', tags: ['graphic', 'pop', 'editorial'], w: 0.7, ae: 'huge', fits: n => n >= 2 && n <= 10,
  enterBias: { cut: 4 },
  plan(rng, cut, st) {
    return { font: rng.pick(J.fontsOf(st, ['display'])), dir: rng.pick([1, -1]), y: rng.pick([0.5, 0.5, 0.42, 0.6]), steps: rng.pick([true, true, false]) };
  },
  render(env) {
    const { W, H, sc } = env, c = env.cut, Pm = c.params, port = K.isPort(env);
    const text = upper(K.hasLatin(c.text) ? String(c.text).trim() : K.strip(c.text));
    const size = H * (port ? 0.42 : 0.78);
    const w = J.measure({ text, font: Pm.font, size, track: -0.02 }).w;
    const travel = Math.max(W * 0.3, w - W * 0.6);                  // the word crosses at least a third of the frame
    // progress: stepped on the beat (each beat a quick shove), or one continuous glide
    let p;
    if (Pm.steps) {
      const bl = K.beatLen(env, c.start), nB = Math.max(1, Math.round(c.dur / bl)), i = Math.min(nB - 1, Math.floor(env.lt / bl));
      p = (i + E.outExpo(clamp((env.lt - i * bl) / Math.min(0.2, bl * 0.6)))) / nB;
    } else p = E.inOutSine(clamp(env.lt / c.dur));
    const x = W / 2 + Pm.dir * (travel / 2 - travel * p);
    return J.mainDraw(env, { text, font: Pm.font, size, x, y: H * (Pm.y || 0.5), track: -0.02, color: sc.fg, mi: 0 });
  },
});

/* ================================================================== tyGridFill — 升目充填 */
reg('tyGridFill', {
  name: '升目充填', tags: ['graphic', 'editorial', 'pop'], w: 0.7, ae: 'center', fits: n => n >= 3 && n <= 24,
  enterBias: { cut: 4 },
  plan(rng, cut, st) {
    return { font: rng.pick(J.fontsOf(st, ['display'])), order: rng.pick(['z', 'z', 'n']), accent: rng.int(0, 5), gap: rng.range(0.02, 0.05) };
  },
  render(env) {
    const { W, H, sc } = env, c = env.cut, Pm = c.params, port = K.isPort(env);
    const units = K.unitsOf(c, 6).map(upper), n = units.length;
    const cols = n <= 2 ? n : port ? 2 : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
    const ts = K.onsets(env, n), k = K.curIdx(ts, env.lt);
    if (k < 0) return null;
    const gw = W * 0.88, gh = H * 0.82, g = Math.min(W, H) * (Pm.gap || 0.03);
    const cw = (gw - g * (cols - 1)) / cols, ch = (gh - g * (rows - 1)) / rows;
    const sizes = units.map(u => Math.min(J.fitSize(u, Pm.font, cw * 0.92, ch * 0.8, { track: 0 }), ch * 0.8));
    const s0 = Math.min(...sizes) * 1.25;                     // similar sizes read as one grid
    let bb = null;
    const m = K.motionK(env);
    for (let i = 0; i <= Math.min(k, n - 1); i++) {
      const r = Math.floor(i / cols), cc0 = i % cols, cc = Pm.order === 'n' && r % 2 ? cols - 1 - cc0 : cc0;
      const cx = W / 2 - gw / 2 + cc * (cw + g) + cw / 2, cy = H / 2 - gh / 2 + r * (ch + g) + ch / 2;
      const dt = env.lt - ts[i];
      const s = Math.min(sizes[i], s0) * (1 + 0.12 * K.kick(dt, 15) * m);
      bb = J.unionBB(bb, J.mainDraw(env, { text: units[i], font: Pm.font, size: s, x: cx, y: cy, track: 0, color: i === Pm.accent % n ? K.accOn(sc) : sc.fg, mi: miAt(env, ts[i]) }));
    }
    return bb;
  },
});

/* ---------------------------------------------------------------- styles */
const scheme = (bg, fg, accent) => ({ bg, fg, accent, sub: J.mix(fg, bg, 0.45), accent2: fg, ink: fg, dim: J.mix(bg, fg, 0.07), ghostA: accent, ghostB: fg });
const pool = (o) => Object.assign({ decor: {}, bg: { bigChar: 1 } }, o);
const S = {
  edMincho: {
    name: '明朝の余白', desc: '生成り・墨・朱の明朝体。縦組みと大きな一字、余白で見せる', moods: ['editorial', 'calm', 'emotional'],
    schemes: [scheme('#F2EEE6', '#16130F', '#B8321F'), scheme('#16130F', '#F2EEE6', '#E0553A'), scheme('#B8321F', '#F7F1E6', '#16130F')],
    fonts: { display: ['mincho_black'], serif: ['shippori'], body: ['mincho'], mono: ['mono'] }, chorusHit: false, oneCut: 0.45,
    pool: pool({
      layout: { vcols: 1.4, tyCropGiant: 1.3, kanjiFocus: 1.2, columnsBig: 1, tyStackJustify: 0.9, tyMargin: 0.8, headlineDeck: 0.7, tyCropSlide: 0.6, center: 0.6 },
      enter: { riseMask: 1.2, fadeStagger: 1.2, trackIn: 1, cut: 1, blurStagger: 0.8, tyKeyFirst: 0.8, wipe: 0.6 },
      exit: { riseOut: 1, blur: 1, cut: 1.2, trackOutWide: 0.8, sinkMask: 0.8 },
      hold: { still: 1.2, zoomSlow: 1, drift: 0.8, trackBreathe: 0.5 },
      treat: { none: 3, tyHeadBig: 1 },
      cam: { push: 1.2, dollyIn: 1, pullOut: 0.8, stepZoom: 0.6 },
      trans: { pushSlide: 1, cover: 0.8, uncover: 0.8 },
      fx: { defocus: 1, whiteFrame: 0.5 },
    }),
  },
  street: {
    name: 'ストリート', desc: '黄・黒・赤の極太ゴシック。語を叩きつけ、見切れ、升目に詰める', moods: ['pop', 'graphic', 'glitch'],
    schemes: [scheme('#FFD400', '#0B0B0B', '#E8202A'), scheme('#0B0B0B', '#FFD400', '#FFFFFF'), scheme('#E8202A', '#FFFFFF', '#0B0B0B')],
    fonts: { display: ['dela'], serif: ['gothic_black'], body: ['gothic_bold'], mono: ['mono'] }, chorusHit: true, oneCut: 0.6,
    pool: pool({
      layout: { bsBeatWord: 1.5, tyCropSlide: 1.3, tyGridFill: 1.2, tyStackJustify: 1.2, tyCropGiant: 1, knRhythmCuts: 1, huge: 0.8, knZoomDive: 0.6 },
      enter: { cut: 2, knWordSlam: 1.4, zoom: 0.8, stretch: 0.6, slice: 0.5 },
      exit: { cut: 2.5, knJumpCutOut: 1, zoomThrough: 0.8, knLaunch: 0.6 },
      hold: { knWordPulse: 1, knTickShift: 1, still: 0.8, stretchPulse: 0.5 },
      treat: { none: 2, knWordScale: 1, alternate: 0.5 },
      cam: { beatPunch: 1.4, stepZoom: 1, knJumpCut: 1, crashZoom: 0.6 },
      trans: { knStutterCut: 1, whipPan: 0.8, knStripSlam: 0.6 },
      fx: { zoomPunch: 1, zoomStutter: 0.8, blackFrame: 0.5 },
    }),
  },
  tegaki: {
    name: '手書きの歌', desc: '紙と墨の手書き書体。一字ずつ書き出し、ゆっくり漂う', moods: ['calm', 'emotional'],
    schemes: [scheme('#F4EFE4', '#2E2A26', '#C0563B'), scheme('#2E3A33', '#EFE9DC', '#E3B86B'), scheme('#E9DCC8', '#3A2E28', '#7A4B8C')],
    fonts: { display: ['klee'], serif: ['brush'], body: ['klee'], mono: ['mono'] }, chorusHit: false, oneCut: 0.55, glitchBoost: 0.01,
    pool: pool({
      layout: { bsTypeBeat: 1.6, center: 1, vcols: 1, kanjiFocus: 0.7, tyMargin: 0.7, corners: 0.5 },
      enter: { fadeStagger: 1.4, type: 1, blurStagger: 1, riseMask: 0.8, cut: 0.6 },
      exit: { blur: 1.2, blurOutStagger: 1, riseOut: 0.8, cut: 0.6 },
      hold: { drift: 1, still: 1, zoomSlow: 0.8 },
      treat: { none: 3, fadeChars: 0.8 },
      cam: { push: 1.2, driftDiag: 1, pullOut: 0.6 },
      trans: {},
      fx: {},
    }),
  },
  showa: {
    name: '昭和ポスター', desc: 'クリーム・紺・朱の太い明朝。縦横を組み替える昭和の宣伝ポスター', moods: ['pop', 'editorial', 'graphic'],
    schemes: [scheme('#EFE3C8', '#1D2A5B', '#D23A2A'), scheme('#D23A2A', '#F6ECD3', '#1D2A5B'), scheme('#1D2A5B', '#EFE3C8', '#E8B23A')],
    fonts: { display: ['tokumin'], serif: ['mincho_black'], body: ['mincho_bold'], mono: ['mono'] }, chorusHit: true, oneCut: 0.5,
    pool: pool({
      layout: { halfVertical: 1.3, tyStackJustify: 1.2, columnsBig: 1.1, poster: 1, tyScaleSteps: 1, sideways: 0.8, tyGridFill: 0.8, kanjiFocus: 0.7, vcols: 0.7 },
      enter: { cut: 1.4, wipe: 1, dropMask: 1, riseMask: 0.8, knWordSlam: 0.8, zoomOut: 0.6 },
      exit: { cut: 1.6, wipe: 1, sinkMask: 0.8, riseOut: 0.6 },
      hold: { still: 1.2, knWordPulse: 0.8, zoomSlow: 0.6 },
      treat: { none: 2, tyHeadBig: 1, knWordScale: 0.8 },
      cam: { stepZoom: 1, push: 1, beatPunch: 0.8 },
      trans: { pushSlide: 1, cover: 0.8, knStutterCut: 0.5 },
      fx: { zoomPunch: 0.8, whiteFrame: 0.5 },
    }),
  },
  minimal: {
    name: '白い余白', desc: '白地に細いゴシックと大きな一語。余白と大小の差だけで見せる', moods: ['calm', 'editorial', 'graphic'],
    schemes: [scheme('#FAFAF8', '#111111', '#111111'), scheme('#111111', '#FAFAF8', '#FAFAF8'), scheme('#E9E7E2', '#111111', '#111111')],
    fonts: { display: ['gothic_black'], serif: ['gothic_light'], body: ['gothic_light'], mono: ['mono'] }, chorusHit: true, oneCut: 0.55,
    pool: pool({
      layout: { bsScaleLine: 1.4, tyMargin: 1.2, corners: 1, tyCropGiant: 1, bsBeatWord: 0.9, tyCropSlide: 0.8, center: 0.7, dropCap: 0.6 },
      enter: { cut: 1.6, trackIn: 1, riseMask: 0.8, fadeStagger: 0.8, wipe: 0.6 },
      exit: { cut: 1.8, trackOutWide: 1, blur: 0.6, riseOut: 0.6 },
      hold: { still: 1.4, zoomSlow: 0.8, trackBreathe: 0.6 },
      treat: { none: 3, knWordScale: 1 },
      cam: { push: 1, stepZoom: 1, beatPunch: 0.6, pullOut: 0.6 },
      trans: { cover: 1, uncover: 1, pushSlide: 0.6 },
      fx: { zoomPunch: 0.6, whiteFrame: 0.5, blackFrame: 0.5 },
    }),
  },
};
for (const [k, v] of Object.entries(S)) {
  if (J.STYLES[k]) continue;
  J.STYLES[k] = Object.assign({ bias: {}, texture: { grain: 0, paper: 0, scan: 0 }, hud: false, glow: 0, decor: {}, ghost: 0, textOnly: true }, v);
  if (!J.STYLE_ORDER.includes(k)) J.STYLE_ORDER.push(k);
}
// the older text-only styles draw from these too
if (J.TEXT_POOL) Object.assign(J.TEXT_POOL.layout, { tyStackJustify: 0.9, tyCropSlide: 0.6, tyGridFill: 0.6 });
})();
