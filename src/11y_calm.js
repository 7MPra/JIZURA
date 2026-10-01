/* JIZURA — 落ち着いた演出 (calm): one switch that takes the busy parts out and gives every line the same gentle motion.
   project.calm = { on: true, motion: 'fade' | 'chars' | 'wipe' | 'cut', layouts: true }   (absent or on:false = off;
   older projects have no calm and plan exactly as before)
     · screen effects (flash, zoom hits, shake, colour flips …), cut-to-cut transitions, morphs, text treatments and
       decorations are off; the camera only drifts in slowly
     · every cut enters and leaves with the chosen motion and holds still
     · layouts: anything but the plain ones (centred, vertical columns, big, stacked) — many of them move the words
       around by themselves — is swapped for a plain one, unless layouts:false
     · the text-only styles keep their staging (src/11x_system.js) with the words fading in instead of popping
   Lines (and cuts) set by hand in the line list or the cut picker keep what was set, and so do locked lines.
   The motions registered here are `special`: random picks never choose them, so plans without calm do not change. */
(() => {
'use strict';
const clamp = J.clamp;
const ease = x => 0.5 - 0.5 * Math.cos(Math.PI * clamp(x));

J.register('enter', 'calmFade', { name: 'フェード', special: true, tags: ['calm'], w: 0, ae: 'blur',
  apply(env, it, p) { const e = ease(p); it.alpha = (it.alpha ?? 1) * e; it.y += (1 - e) * it.size * 0.05; } });
J.register('exit', 'calmFadeOut', { name: 'フェードアウト', special: true, tags: ['calm'], w: 0, ae: 'blur',
  apply(env, it, p) { it.alpha = (it.alpha ?? 1) * (1 - ease(p)); } });

const MOTIONS = {
  fade: { enter: 'calmFade', exit: 'calmFadeOut', name: 'フェード' },
  chars: { enter: 'fadeStagger', exit: 'calmFadeOut', name: '一字ずつフェード' },
  wipe: { enter: 'wipe', exit: 'wipe', name: 'ワイプ' },
  cut: { enter: 'cut', exit: 'cut', name: '動きなし' },
};
J.CALM_MOTIONS = MOTIONS;
// plain layouts a calm piece may use (kinetic layouts animate the words themselves)
const PLAIN = ['center', 'vcols', 'huge', 'stack'];

J.calmOf = project => {
  const C = project && project.calm;
  if (!C || C.on !== true) return null;
  return { motion: MOTIONS[C.motion] ? C.motion : 'fade', layouts: C.layouts !== false };
};

J.calmPass = (plan, project, st) => {
  const C = J.calmOf(project);
  if (!C) return;
  plan.calm = C;
  const M = MOTIONS[C.motion], en = J.ENTER[M.enter] ? M.enter : 'cut', ex = J.EXIT[M.exit] ? M.exit : 'cut';
  for (const c of plan.cuts) {
    if (c.manual) continue;                                  // set by hand: keep
    if (c.layout === 'interlude' || !String(c.text || '').trim()) { c.trans = null; c.transDur = 0; delete c.morph; continue; }
    Object.assign(c, { trans: null, transP: {}, transDur: 0, treat: 'none', treatP: {}, decor: [], weightGrow: false });
    delete c.morph;
    if (c.staged) {                                          // text-only staging: it owns its motion (fades in calm mode)
      // the lively chorus stagings (a word a beat, scattered words, split kanji) become the big vertical columns
      if (C.layouts && ['bsBeatWord', 'sysScatter', 'sysSplit'].includes(c.layout) && J.LAYOUTS.sysGiant) { c.layout = 'sysGiant'; c.params = J.LAYOUTS.sysGiant.plan(J.rng(J.h(c.seed, 63)), c, st); }
      continue;
    }
    if (C.layouts && !PLAIN.includes(c.layout) && !c.companion) {     // (中央を空ける keeps its pair of layouts)
      const n = [...String(c.text).replace(/\s+/g, '')].length;
      const opts = PLAIN.filter(k => J.LAYOUTS[k] && J.LAYOUTS[k].fits(n));
      const k = opts.length ? opts[J.h(c.seed, 61) % opts.length] : 'center';
      c.layout = k;
      c.params = J.LAYOUTS[k].plan(J.rng(J.h(c.seed, 62)), { text: c.text, n, W: plan.W, H: plan.H, dur: c.dur }, st);
    }
    const dur = c.end - c.start;
    c.enter = en; c.exit = dur > 1.1 ? ex : 'cut'; c.hold = 'still';
    c.inDur = en === 'cut' ? 0.05 : clamp(dur * 0.3, 0.2, 0.6);
    c.outDur = c.exit === 'cut' ? 0 : clamp(dur * 0.18, 0.15, 0.4);
    if (c.cam !== 'hold') { c.cam = 'push'; c.camP = {}; }
    if (c.companion) Object.assign(c.companion, { enter: c.enter, exit: c.exit, hold: 'still', inDur: c.inDur, outDur: c.outDur, trans: null, treat: 'none', decor: [], cam: c.cam, camP: {} });   // 中央を空ける: its twin
  }
  // no screen effects at all (flashes, zoom hits, shakes, colour flips …) except on cuts set by hand
  const hand = plan.cuts.filter(c => c.manual);
  plan.events = plan.events.filter(e => hand.some(c => e.t >= c.start - 0.05 && e.t < c.end));
};
})();
