/* JIZURA — テキストのみの節度 (text-only restraint)
   What made the text-only output look machine-made: a red / blue colour split on every word, a different gimmick in
   every cut (text on arcs, circles, stickers, balloons…), glitch hits at every cut, tiny filler copies of the lyric,
   stepped echo copies, and a new face in nearly every cut. For styles with `textOnly`:
     • random picks draw from a typographic set only — J.TEXT_POOL, per group; a style's own bias still weights it
       (a style that lists its own `pool` keeps it). A per-line / per-cut choice can still use anything.
     • no chromatic ghost passes; the colour-split / slice / block / mosaic accents and random inverts are dropped
       (flash on impact lines, zoom and shake on emphasis, and the one-beat chorus invert stay)
     • one face per font role (the first of each list), so a song reads in one or two faces
     • text smaller than 3% of the frame and stepped echo copies are not drawn (src/03_text.js, src/06_layouts.js)
   ============================================================ */
(() => {
'use strict';
const W = (keys, w = 1) => Object.fromEntries(keys.map(k => [k, w]));
J.TEXT_POOL = {
  layout: Object.assign(
    W(['center', 'huge', 'vcols', 'hanging', 'columnsBig', 'poster', 'swissGrid', 'headlineDeck', 'tyCropGiant', 'tyKeySplit', 'tyScaleSteps', 'tyMargin', 'knRhythmCuts', 'knTypeSlam'], 1.2),
    W(['kanjiFocus', 'dropCap', 'type', 'corners', 'sideways', 'halfVertical', 'splitHalves', 'typeSpecimen', 'credits',
      'tyCross', 'tyBaseline', 'tyJustify', 'tySplitType', 'tyFullTrack', 'tySquare', 'tyLineFocus', 'knQuarterTurn', 'knSwapCenter', 'knZoomDive', 'knFlowSnap', 'knReflow'], 0.7)),
  enter: Object.assign(
    W(['cut', 'wipe', 'riseMask', 'dropMask', 'fadeStagger', 'blurStagger', 'trackIn', 'type', 'knWordSlam', 'tyKeyFirst', 'tyLineWipe'], 1.2),
    W(['blur', 'slideL', 'slideR', 'slideWhole', 'zoomOut', 'splitJoin', 'vSlice', 'outlineFill', 'whip', 'skewIn', 'slice', 'zoom',
      'knTypeToSlam', 'knReplaceIn', 'knPushIn', 'knInertia', 'knDiveIn', 'knStretchOut', 'tyUnderLift', 'tyRetype'], 0.6)),
  exit: Object.assign(
    W(['cut', 'wipe', 'riseOut', 'sinkMask', 'blur', 'blurOutStagger', 'trackOutWide', 'knJumpCutOut', 'tyLineFeed'], 1.2),
    W(['slideOutL', 'slideOutR', 'zoomFar', 'zoomThrough', 'splitApart', 'backspace', 'whipOut', 'shrink',
      'knWordKick', 'knPushOut', 'knCloseGap', 'knWordBlink', 'knLaunch', 'tyStrike', 'tyUnderSink', 'tyKeyLast'], 0.6)),
  hold: Object.assign(W(['still'], 3), W(['drift', 'zoomSlow', 'trackBreathe', 'breathe', 'knWordPulse', 'knTickShift', 'knGapBreath', 'tyTrackStep'], 0.5)),
  treat: Object.assign(W(['none'], 6), W(['tall', 'wide', 'tyHeadBig', 'knWordScale', 'fadeChars'], 0.5)),
  cam: Object.assign(W(['push'], 3), W(['pullOut', 'dollyIn', 'driftDiag', 'panL', 'panR', 'stepZoom', 'knReadPan'], 0.6), W(['beatPunch', 'knJumpCut'], 0.4)),
  trans: W(['wipe', 'pushSlide', 'cover', 'uncover', 'whipPan', 'knStutterCut'], 1),
  fx: Object.assign(W(['zoomPunch'], 1), W(['whipBlur', 'blackFrame', 'whiteFrame', 'defocus'], 0.5)),
  decor: {}, bg: {},
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
/* screen accents a text-only plan keeps (the rest were the machine-made glitch look) */
J.TEXT_EVENT_DROP = ['chroma', 'slice', 'block', 'mosaic'];
J.restrainStyle = (st) => {
  if (!st || !st.textOnly) return st;
  if (!st.pool) st.pool = J.textPool(st);
  st.ghost = 0;
  for (const role of Object.keys(st.fonts || {})) if (Array.isArray(st.fonts[role]) && st.fonts[role].length > 1) st.fonts[role] = st.fonts[role].slice(0, 1);
  return st;
};
})();
