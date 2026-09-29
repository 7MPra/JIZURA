"""Critic over time: renders each text-only style through the song at 8 fps and measures, per layout, how much of
the time a lyric is due the frame shows (almost) nothing — dead air — and how often the reading area jumps.
usage: python3 dev/critic_time.py [styles=all]"""
import asyncio, json, sys, os
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
from critic import LYRICS, CHROME
JS = r"""
async (o) => {
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true }), r = new J.Renderer();
  const hex = c => { const n = parseInt(String(c).slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const out = {};
  for (const style of o.styles) for (const seed of o.seeds) {
    const p = Object.assign(J.defaultProject(), { style, seed, aspect: '16:9', extra: true, lyrics: o.lyrics });
    p.timing = Object.assign(p.timing, { bpm: 150, snap: true });
    const plan = J.plan(p, { beats: Array.from({ length: 300 }, (_, i) => 0.4 + i * 0.4), duration: 60 });
    cv.width = Math.round(plan.W * 0.1); cv.height = Math.round(plan.H * 0.1);
    for (const c of plan.cuts) {
      if (c.line < 0 || c.layout === 'interlude') continue;
      const key = c.layout, o2 = out[key] || (out[key] = { n: 0, dead: 0, frames: 0 });
      const sc = plan.style.schemes[c.scheme % plan.style.schemes.length], bg = hex(sc.bg);
      o2.n++;
      // skip the first 0.12 s (the entrance) and the exit
      for (let t = c.start + 0.12; t < c.end - Math.max(0.05, c.outDur); t += 1 / 8) {
        r.frame(ctx, plan, t, { scale: 0.1, noGhost: true, noTrans: true, noPost: true });
        const d = ctx.getImageData(0, 0, cv.width, cv.height).data; let ink = 0;
        for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 90) ink++;
        o2.frames++; if (ink / (cv.width * cv.height) < 0.006) o2.dead++;
      }
    }
  }
  return out;
}
"""
async def main():
    styles = sys.argv[1].split(',') if len(sys.argv) > 1 and sys.argv[1] != 'all' else None
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME); ctx = await b.new_context(ignore_https_errors=True); pg = await ctx.new_page()
        await pg.goto('http://localhost:8765/test.html', wait_until='domcontentloaded'); await pg.wait_for_timeout(1200)
        if not styles: styles = await pg.evaluate("() => J.STYLE_ORDER.filter(k => J.STYLES[k].textOnly)")
        await pg.evaluate("(t) => J.ensureFonts(t, null)", LYRICS)
        res = await pg.evaluate(JS, {'styles': styles, 'seeds': [3, 11, 29], 'lyrics': LYRICS})
        await b.close()
    rows = sorted(res.items(), key=lambda kv: -kv[1]['dead'] / max(1, kv[1]['frames']))
    tot = sum(v['dead'] for v in res.values()) / max(1, sum(v['frames'] for v in res.values()))
    print(f'dead air overall {tot:.3f}')
    for k, v in rows[:20]: print(f"{k:16s} cuts={v['n']:3d} dead={v['dead']/max(1,v['frames']):.2f}")
if __name__ == '__main__':
    asyncio.run(main())
