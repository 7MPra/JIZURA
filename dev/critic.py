"""Automatic critic for the text-only look: renders every text-only style (seeds x aspects) and flags cuts that
are empty, clipped at the frame edge by accident, colliding, low-contrast or too small, then ranks the parts.
usage: python3 dev/critic.py [styles=all] [out.json]   (needs dev/www built: python3 build.py --dev, served on :8765)"""
import asyncio, json, sys, os
from playwright.async_api import async_playwright
CHROME = os.environ.get('CHROME', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
LYRICS = """夜明けの色を覚えてる
ほどけた声が遠くで鳴った
ねえ、まだ間に合うかな
透明なままじゃ終われない!
Hello, can you hear me now

何度だって言うよ君がすき
回れ回れ世界ごと回れ
止まらない鼓動が今を叩いて

何度だって言うよ君がすき
さよならの代わりに笑ってみせた"""
JS = r"""
async (o) => {
  const out = [];
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
  const r = new J.Renderer();
  // text items drawn in the main pass of the current frame (design-space bboxes)
  let log = null;
  const core = J.drawItem;
  J.drawItem = (env, it) => { const bb = core(env, it); if (log && bb && env.pass === 'main' && !env.inLayer && !env.bgOnly) log.push({ bb, size: it.size, text: String(it.text).slice(0, 12), color: it.color, alpha: it.alpha ?? 1 }); return bb; };
  const hex = c => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  for (const style of o.styles) for (const seed of o.seeds) for (const aspect of o.aspects) {
    const p = Object.assign(J.defaultProject(), { style, seed, aspect, extra: true, lyrics: o.lyrics });
    p.timing = Object.assign(p.timing, { bpm: 150, snap: true });
    const beats = Array.from({ length: 300 }, (_, i) => 0.4 + i * 0.4);
    const plan = J.plan(p, { beats, duration: 60 });
    const W = plan.W, H = plan.H, S = 0.16; cv.width = Math.round(W * S); cv.height = Math.round(H * S);
    const cuts = plan.cuts.filter(c => c.line >= 0 && c.layout !== 'interlude');
    for (const c of cuts) {
      const tIn = c.start + Math.min(c.dur * 0.5, c.inDur + (c.dur - c.inDur - c.outDur) * 0.5);
      log = [];
      r.frame(ctx, plan, tIn, { scale: S, noGhost: true, noTrans: true, noPost: true });
      const items = log; log = null;
      const sc = plan.style.schemes[c.scheme % plan.style.schemes.length];
      // ink: pixels far from the ground colour
      const bg = hex(sc.bg) || [0, 0, 0], d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      let ink = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, edge = 0;
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
        const i = (y * cv.width + x) * 4, dd = Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]);
        if (dd > 90) { ink++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (x <= 1 || y <= 1 || x >= cv.width - 2 || y >= cv.height - 2) edge++; }
      }
      const area = cv.width * cv.height, cover = ink / area;
      const bbArea = x1 >= 0 ? (x1 - x0 + 1) * (y1 - y0 + 1) / area : 0;
      // collisions between different items (main pass), overlap / smaller area
      let coll = 0;
      const B = items.filter(q => q.bb && q.alpha > 0.4 && q.size > Math.min(W, H) * 0.035 && q.size < Math.min(W, H) * 0.45).map(q => q.bb);   // giant backdrop type sits behind on purpose
      for (let a = 0; a < B.length; a++) for (let b = a + 1; b < B.length; b++) {
        const A = B[a], C = B[b];
        const ow = Math.min(A.x1, C.x1) - Math.max(A.x0, C.x0), oh = Math.min(A.y1, C.y1) - Math.max(A.y0, C.y0);
        if (ow <= 0 || oh <= 0) continue;
        const sm = Math.min((A.x1 - A.x0) * (A.y1 - A.y0), (C.x1 - C.x0) * (C.y1 - C.y0));
        if (sm > 0 && ow * oh / sm > 0.35) coll++;
      }
      const maxSize = items.reduce((m, q) => Math.max(m, q.size || 0), 0) / Math.min(W, H);
      // contrast of the main colours against the ground
      let lowC = 0; for (const q of items) { const f = hex(q.color); if (f && q.alpha > 0.6 && q.size < Math.min(W, H) * 0.4 && J.contrast(q.color, sc.bg) < 2.2) lowC++; }   // giant backdrop type may be faint
      out.push({ style, seed, aspect, t: +tIn.toFixed(2), text: c.text.slice(0, 14), layout: c.layout, enter: c.enter, exit: c.exit, hold: c.hold, cam: c.cam, treat: c.treat,
        n: items.length, cover: +cover.toFixed(4), bbArea: +bbArea.toFixed(3), edgeInk: edge, coll, maxSize: +maxSize.toFixed(3), lowC });
    }
  }
  J.drawItem = core;
  return out;
}
"""
async def main():
    styles = sys.argv[1].split(',') if len(sys.argv) > 1 and sys.argv[1] != 'all' else None
    outp = sys.argv[2] if len(sys.argv) > 2 else 'dev/www/critic.json'
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME)
        ctx = await b.new_context(ignore_https_errors=True); pg = await ctx.new_page()
        await pg.goto('http://localhost:8765/test.html', wait_until='domcontentloaded'); await pg.wait_for_timeout(1500)
        if not styles: styles = await pg.evaluate("() => J.STYLE_ORDER.filter(k => J.STYLES[k].textOnly)")
        await pg.evaluate("(t) => J.ensureFonts(t, null)", LYRICS); await pg.wait_for_timeout(1500)
        rows = await pg.evaluate(JS, { 'styles': styles, 'seeds': [3, 11, 29], 'aspects': ['16:9', '9:16'], 'lyrics': LYRICS })
        await b.close()
    json.dump(rows, open(outp, 'w'), ensure_ascii=False)
    # flags
    def flags(r):
        f = []
        if r['cover'] < 0.004: f.append('empty')
        if r['maxSize'] < 0.06: f.append('small')
        if r['coll'] > 0: f.append('collide')
        if r['lowC'] > 0: f.append('lowcontrast')
        if r['edgeInk'] > 6 and r['layout'] not in ('tyCropGiant', 'huge', 'knZoomDive', 'bsRefrain', 'splitHalves'): f.append('edge')
        return f
    from collections import defaultdict
    by = defaultdict(lambda: defaultdict(int)); tot = defaultdict(int); allf = defaultdict(int)
    for r in rows:
        tot[r['layout']] += 1
        for f in flags(r): by[r['layout']][f] += 1; allf[f] += 1
    print('cuts', len(rows), 'flags', dict(allf))
    bad = sorted(tot, key=lambda k: -sum(by[k].values()) / tot[k])
    for k in bad[:25]:
        s = sum(by[k].values())
        if s: print(f'{k:16s} n={tot[k]:3d} bad={s/tot[k]:.2f}', dict(by[k]))
if __name__ == "__main__":
    asyncio.run(main())
