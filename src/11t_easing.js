/* JIZURA — easing calibration for the shared entrances / exits.
   Many recipes run a steep curve (outExpo, inCubic …) over 0.12–0.6 s. At 24 fps (12 drawings on twos) that puts most of an
   entrance into its very first drawing — a jump followed by a slow creep — and most of an exit into its last one — a stall,
   then a jump. Each part listed here gets a time warp on its progress p before its recipe runs (J.mainDraw):
     entrance  p → p^w          a softer first drawing; the curve's own shape and end point stay
     exit      p → 1-(1-p)^w    it starts moving sooner and leaves less for the last drawing
   Values were measured per part (how far into the move half of it is done) and aim for about a quarter of the entrance /
   about 60% of the exit. Parts that move their own pieces or words on their own clock, and physics-like ones (bounces,
   hinges, count-ins) are left as designed. A part can set its own `warp` to override. */
(() => {
'use strict';
const WARP = {
  enter: {
    stretch: 1.36, blur: 1.32, zoom: 1.57, slideWhole: 1.51, splitJoin: 1.19, iris: 1.32, whip: 1.6, trackIn: 1.51, trackOut: 1.27,
    zoomOut: 1.51, stamp: 1.16, fanOpen: 1.41, zipper: 1.6, tiltUp: 1.9, tornJoin: 1.6, splitFlap: 1.19, overexpose: 1.8,
    filmFeed: 1.5, backlight: 1.6, heatHaze: 1.6, matrixRain: 1.32, quarters: 1.6, printRegister: 1.41,
  },
  exit: {
    slice: 2.2, shrink: 2.2, blur: 1.35, stretch: 2.07, sinkMask: 1.51, riseOut: 1.35, foldOut: 2.08, trackOutWide: 1.24,
    collapse: 1.65, twist: 2.2, melt: 1.47, whipOut: 1.65, burn: 1.77, crumpleOut: 2.07, tearOut: 1.76, overexposeOut: 1.21,
    scanOut: 2.2, clapShut: 2.2, slashOut: 1.77, scribbleOut: 1.49, tyStrike: 1.87, tyLineFeed: 2.2, tyUnderSink: 1.67,
  },
};
for (const [g, R] of [['enter', J.ENTER], ['exit', J.EXIT]])
  for (const [k, w] of Object.entries(WARP[g])) if (R[k] && R[k].warp == null) R[k].warp = w;
J.EASE_WARP = WARP;
J.warpIn = (def, p) => (def && def.warp > 1 && p > 0 && p < 1 ? Math.pow(p, def.warp) : p);
J.warpOut = (def, p) => (def && def.warp > 1 && p > 0 && p < 1 ? 1 - Math.pow(1 - p, def.warp) : p);
})();
