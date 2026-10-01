/* JIZURA — テキストのみの節度 (text-only restraint)
   What made the text-only output look machine-made: a red / blue colour split on every word, a different gimmick in
   every cut (text on arcs, circles, stickers, balloons…), glitch hits at every cut, tiny filler copies of the lyric,
   stepped echo copies, and a new face in nearly every cut. For styles with `textOnly`:
     • random picks draw from a typographic set only — J.TEXT_POOL, per group; a style's own bias still weights it
       (a style that lists its own `pool` keeps it). A per-line / per-cut choice can still use anything. The set leans
       on energy made of type and rhythm — giant / cropped type, words cut on the beat, beat camera hits, colour-field
       flips on emphasis (08_planner.js), the lyric's first character huge behind it (bg bigChar) — not on gimmicks.
     • no chromatic ghost passes; the colour-split / slice / block / mosaic accents and random inverts are dropped
       (flash on impact lines, zoom and shake on emphasis, and the one-beat chorus invert stay)
     • one face per font role (the first of each list), so a song reads in one or two faces
     • text smaller than 3% of the frame and stepped echo copies are not drawn (src/03_text.js, src/06_layouts.js)
   ============================================================ */
(() => {
'use strict';
const W = (keys, w = 1) => Object.fromEntries(keys.map(k => [k, w]));
J.TEXT_POOL = {
  // compositions with a point of view: giant / cropped type, words cut on the beat, scale jumps — weighted up;
  // quieter settings stay in for contrast
  layout: Object.assign(
    W(['tyCropGiant', 'huge', 'knRhythmCuts', 'bsBeatWord'], 1.6),
    W(['knTypeSlam', 'tyKeySplit', 'knZoomDive', 'columnsBig', 'tyScaleSteps', 'bsScaleLine', 'knQuarterTurn', 'center', 'vcols'], 1.1),
    W(['poster', 'swissGrid', 'headlineDeck', 'tyMargin', 'knSwapCenter', 'knFlowSnap', 'knCollide', 'knReflow', 'mixed', 'kanjiFocus', 'dropCap',
      'tyCross', 'tyFullTrack', 'tySquare', 'tyLineFocus', 'sideways', 'halfVertical'], 0.6)),
  enter: Object.assign(
    W(['knWordSlam'], 1.5), W(['cut'], 0.8),
    W(['zoom', 'stretch', 'slice', 'whip', 'knTypeToSlam', 'riseMask', 'dropMask', 'wipe', 'trackIn', 'blurStagger', 'tyKeyFirst', 'zoomOut', 'splitJoin'], 0.9),
    W(['fadeStagger', 'type', 'tyLineWipe', 'blur', 'slideL', 'slideR', 'slideWhole', 'vSlice', 'outlineFill', 'skewIn', 'stamp',
      'knReplaceIn', 'knPushIn', 'knInertia', 'knDiveIn', 'knStretchOut', 'tyUnderLift', 'tyRetype'], 0.5)),
  exit: Object.assign(
    W(['cut'], 1.1),
    W(['zoomThrough', 'knJumpCutOut', 'knLaunch', 'whipOut', 'slice', 'riseOut', 'wipe', 'trackOutWide'], 0.9),
    W(['sinkMask', 'blur', 'blurOutStagger', 'tyLineFeed', 'slideOutL', 'slideOutR', 'zoomFar', 'splitApart', 'backspace', 'shrink', 'stretch',
      'knWordKick', 'knPushOut', 'knCloseGap', 'knWordBlink', 'tyStrike', 'tyUnderSink', 'tyKeyLast'], 0.5)),
  // the text keeps moving with the music while it is on screen
  hold: Object.assign(W(['knWordPulse', 'knTickShift', 'still'], 1), W(['zoomSlow', 'stretchPulse', 'beatHop', 'knBeatLean', 'trackBreathe', 'drift', 'knGapBreath', 'tyTrackStep'], 0.5)),
  treat: Object.assign(W(['none'], 3), W(['knWordScale', 'tyHeadBig'], 1), W(['outline', 'alternate', 'tall', 'wide', 'fauxBold', 'fadeChars'], 0.4)),
  // camera: hits and cuts on the beat rather than a drift under everything
  cam: Object.assign(W(['beatPunch', 'stepZoom', 'push'], 1), W(['knJumpCut', 'crashZoom', 'whipIn', 'dollyIn', 'pullOut'], 0.6),
    W(['snapPan', 'knRushIn', 'knTiltKick', 'knShearKick', 'driftDiag', 'panL', 'panR', 'knReadPan'], 0.35)),
  trans: Object.assign(W(['knStutterCut', 'whipPan', 'zoomThrough', 'pushSlide'], 1), W(['knStripSlam', 'sliceShift', 'cover', 'uncover', 'wipe', 'flashCross', 'knCornerSwing'], 0.5)),
  fx: Object.assign(W(['zoomPunch', 'zoomStutter', 'whipBlur'], 1), W(['blackFrame', 'whiteFrame', 'squash', 'rotateSnap', 'strobe', 'defocus'], 0.4)),
  decor: {},
  bg: { bigChar: 1 },                         // the lyric's own first character, huge and faint behind it
};
// the horror styles keep their own few text-only tricks
const HORROR = {
  layout: W(['hrWrongOne', 'hrRisingDark'], 0.8), enter: W(['hrUneasy', 'hrManifest', 'hrBlinkCreep'], 0.8),
  exit: W(['hrLookBack', 'hrTurnAway', 'hrShiver', 'hrFlickerDie'], 0.8), hold: W(['hrLagOne', 'hrStare'], 0.6),
};
J.textPool = (st) => {
  const P = JSON.parse(JSON.stringify(J.TEXT_POOL));
  if (st.set === 'horror') for (const g of Object.keys(HORROR)) Object.assign(P[g], HORROR[g]);
  return P;
};
if (J.BG && J.BG.bigChar) J.BG.bigChar.lyricType = true;
/* a song's own vocabulary: from the style's pool, a handful per group — drawn by weight, leaning towards the parts
   whose mood tags match the style's moods — so a song reads as one piece and two styles (or two seeds) differ */
const VOCAB = { layout: 7, enter: 7, exit: 6, hold: 4, cam: 5, trans: 3, fx: 3, treat: 3 };
const KEEP = { enter: 'cut', exit: 'cut', treat: 'none' };
J.songVocab = (st, seed, styleKey) => {
  if (!st || !st.pool) return st;
  const moods = st.moods || [];
  Object.keys(VOCAB).forEach((g, gi) => {
    const P = st.pool[g]; if (!P) return;
    const reg = J.registry(g) || {}, keys = Object.keys(P).filter(k => reg[k] || k === KEEP[g]);
    if (keys.length <= VOCAB[g]) return;
    const rng = J.rng(J.h(seed | 0, J.sid(String(styleKey || '')), gi + 1, 61));
    const w = k => { const d = reg[k] || {}, tags = d.tags || []; return P[k] * (1 + 0.8 * tags.filter(t => moods.includes(t)).length) * ((st.bias && st.bias[g] && st.bias[g][k]) || 1); };
    const cand = keys.filter(k => k !== KEEP[g]).map(k => [k, w(k)]), out = {};
    if (KEEP[g] && P[KEEP[g]] != null) out[KEEP[g]] = P[KEEP[g]];
    while (Object.keys(out).length < VOCAB[g] && cand.length) {
      const k = rng.wpick(cand); out[k] = P[k]; cand.splice(cand.findIndex(c => c[0] === k), 1);
    }
    st.pool[g] = out;
  });
  return st;
};
/* screen accents a text-only plan keeps (the rest were the machine-made glitch look) */
J.TEXT_EVENT_DROP = ['chroma', 'slice', 'block', 'mosaic'];
J.restrainStyle = (st) => {
  if (!st || !st.textOnly) return st;
  if (!st.pool) st.pool = J.textPool(st);
  st.ghost = 0;
  // words thrown to the corners of the frame (the middle left empty) read as an unfinished frame in text only
  if (st.pool && st.pool.layout) for (const k of ['corners', 'type']) delete st.pool.layout[k];
  for (const role of Object.keys(st.fonts || {})) if (Array.isArray(st.fonts[role]) && st.fonts[role].length > 1) st.fonts[role] = st.fonts[role].slice(0, 1);
  return st;
};
})();
