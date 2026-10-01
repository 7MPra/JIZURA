"""おまかせ review loop: random lyrics → J.omakase (seeded) → plan → one frame per cut → contact sheet + per-cut flags.
Each run is reproducible from its number. The flags are the critic's (empty / collide / edge / small / lowcontrast) plus
"offpool": a cut drawn with a layout that is not in its style's own pool (the style lost its look).
usage: python3 dev/omakase_review.py [runs=6] [first=1] [outdir=dev/review]   (dev/www built and served on :8765)
       RUNS=1,7,9 picks run numbers; ASPECT=9:16 changes the frame"""
import asyncio, json, os, random, sys
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw, ImageFont

CHROME = os.environ.get('CHROME', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
N = int(sys.argv[1]) if len(sys.argv) > 1 else 6
FIRST = int(sys.argv[2]) if len(sys.argv) > 2 else 1
OUT = sys.argv[3] if len(sys.argv) > 3 else 'dev/review'
RUN_IDS = [int(x) for x in os.environ['RUNS'].split(',')] if os.environ.get('RUNS') else list(range(FIRST, FIRST + N))

# a bank of original lines (verses, hooks, English, lines with readings)
VERSE = ['夜明けの色を覚えてる', 'ほどけた声が遠くで鳴った', 'ねえ、まだ間に合うかな', '誰かの言葉を借りたまま', '歩いてきた道を振り返る',
         '改札を抜けたら風が変わった', '冷めたコーヒーの底に映る', '知らない街で目を覚ました', '最後の電車が走り出す', 'ポケットの中で鳴らない電話',
         '窓の外は今日も灰色', '言いかけた言葉を飲み込んだ', '君の影だけ長く伸びて', '数えきれない嘘を抱いて', '信号が変わるまでの永遠',
         '指先で描いた星座の名前', '遠回りしても辿り着けない', '笑ったふりが上手くなった', '空っぽの部屋に光が差す', 'あの日の約束 まだ持ってる',
         '｜夜明け《よあけ》の匂いがした', '泣《な》き顔のままで歩いた', '眩《まぶ》しすぎた夏の終わり', '嘘《うそ》をついた僕の声']
HOOK = ['透明なままじゃ終われない!', '絶叫したいくらいの夜に', '回れ回れ世界ごと回れ', '何度だって言うよ君がすき', '止まらない鼓動が今を叩いて',
        'さよならの代わりに笑ってみせた', '踊れ 踊れ 夜が明けるまで', '全部ぜんぶ壊して!', '今だけは離さないで', '叫べ 叫べ 声が枯れるまで',
        '心《こころ》ごと連れていって']
EN = ['Hello, can you hear me now', 'Never let me go tonight', 'Dancing in the neon rain', 'We are the broken stars', 'Say my name one more time']

def song(seed):
    r = random.Random(seed)
    v = r.sample(VERSE, 8)
    hook = r.sample(HOOK, r.choice([2, 3]))
    if r.random() < 0.35: hook.append(r.choice(EN))
    parts = [v[:r.choice([3, 4])], hook]
    if r.random() < 0.5: parts.append(['[間奏 %d]' % r.choice([4, 6, 8])])
    parts += [v[4:4 + r.choice([2, 3, 4])], hook]
    if r.random() < 0.4: parts.append([r.choice(EN)])
    return '\n\n'.join('\n'.join(p) for p in parts), r.choice([88, 100, 118, 128, 140, 150, 165, 172])

JS = r"""
async (o) => {
  const rng = J.rng(o.seed * 7919 + 13), rnd = () => rng();
  let p = Object.assign(J.defaultProject(), { lyrics: o.lyrics, aspect: o.aspect, extra: true });
  p.timing = Object.assign(p.timing, { bpm: o.bpm, snap: true, offset: 0.4 });
  Object.assign(p, J.omakase(p, rnd));
  if (o.style && J.STYLES[o.style]) p.style = o.style;          // STYLE=…: the same style on every build (a fair comparison)
  // the song: a beat grid, louder in the hook lines
  const bl = 60 / o.bpm, beats = Array.from({ length: 900 }, (_, i) => 0.4 + i * bl);
  const plan0 = J.plan(p, { beats, duration: 400 });
  const hookLines = new Set(plan0.lines.filter(l => /!|叫|回れ|踊れ|すき|離さ|壊|鼓動|透明|笑って|連れて/.test(l.text)).map(l => l.index));
  const energy = Array.from({ length: 4000 }, (_, i) => { const t = i / 10, l = plan0.lines.find(x => t >= x.start && t < x.end); return l && hookLines.has(l.index) ? 0.85 : 0.45; });
  const plan = J.plan(p, { beats, duration: plan0.duration + 1, energy, energyRate: 10 });
  const st = plan.style, poolL = st.pool && st.pool.layout ? Object.keys(st.pool.layout) : null;
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
  const r = new J.Renderer(), S = o.scale; cv.width = Math.round(plan.W * S); cv.height = Math.round(plan.H * S);
  let log = null; const core = J.drawItem;
  J.drawItem = (env, it) => { const bb = core(env, it); if (log && bb && env.pass === 'main' && !env.inLayer && !env.bgOnly) log.push({ bb, size: it.size, alpha: it.alpha ?? 1 }); return bb; };
  const hex = c => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const U = Math.min(plan.W, plan.H), cuts = [];
  for (const c of plan.cuts) {
    if (c.layout === 'interlude' || !String(c.text || '').trim()) continue;
    const t = c.start + Math.min(c.dur * 0.62, Math.max(c.inDur + 0.05, c.dur * 0.5));
    log = [];
    r.frame(ctx, plan, t, { scale: S, noTrans: true });
    const items = log; log = null;
    const sc = st.schemes[c.scheme % st.schemes.length], bg = hex(sc.bg) || [0, 0, 0], d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let ink = 0, edge = 0;
    for (let y = 0; y < cv.height; y += 2) for (let x = 0; x < cv.width; x += 2) {
      const i = (y * cv.width + x) * 4, dd = Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]);
      if (dd > 90) { ink++; if (x <= 2 || y <= 2 || x >= cv.width - 3 || y >= cv.height - 3) edge++; }
    }
    const area = cv.width * cv.height / 4;
    const B = items.filter(q => q.bb && q.alpha > 0.4 && q.size > U * 0.035 && q.size < U * 0.45).map(q => q.bb);
    let coll = 0;
    for (let a = 0; a < B.length; a++) for (let b = a + 1; b < B.length; b++) {
      const A = B[a], C = B[b], ow = Math.min(A.x1, C.x1) - Math.max(A.x0, C.x0), oh = Math.min(A.y1, C.y1) - Math.max(A.y0, C.y0);
      if (ow > 0 && oh > 0) { const sm = Math.min((A.x1 - A.x0) * (A.y1 - A.y0), (C.x1 - C.x0) * (C.y1 - C.y0)); if (sm > 0 && ow * oh / sm > 0.35) coll++; }
    }
    const maxSize = items.reduce((m, q) => Math.max(m, q.alpha > 0.3 ? q.size : 0), 0);
    const flags = [];
    if (ink / area < 0.004) flags.push('empty');
    if (coll) flags.push('collide');
    if (edge > 6 && maxSize < U * 0.5) flags.push('edge');
    if (maxSize > 0 && maxSize < U * 0.06) flags.push('small');
    if (J.contrast && J.contrast(sc.fg, sc.bg) < 3) flags.push('lowcontrast');
    if (poolL && !c.manual && !poolL.includes(c.layout)) flags.push('offpool');
    cuts.push({ t: +t.toFixed(2), text: c.text, layout: c.layout, enter: c.enter, exit: c.exit, cam: c.cam, trans: c.trans || '', flags, img: cv.toDataURL('image/jpeg', 0.8) });
  }
  J.drawItem = core;
  const font = p.fonts && p.fonts.display ? p.fonts.display : '';
  return { style: p.style, styleName: st.name, mood: p.mood, font, fx: plan.fx, duration: plan.duration, nCuts: cuts.length, cuts, colors: !!(p.colors && p.colors.accentOn) };
}
"""

# web fonts: the browser here cannot reach Google Fonts' stylesheets through the proxy, so the faces are fetched in Python —
# only the glyphs the song uses (css2 ?text=) — and handed to the page as FontFaces (otherwise everything is a fallback face)
import base64 as _b64, re as _re, urllib.parse as _up, urllib.request as _ur
_FONT_CACHE = {}
def _fetch(url, ua=True):
    req = _ur.Request(url, headers={'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36'} if ua else {})
    return _ur.urlopen(req, timeout=30).read()
async def load_fonts(pg, text):
    specs = await pg.evaluate("() => Object.values(J.FONTS).filter(f => f.gf).map(f => [f.family.replace(/\"/g, ''), f.weight, f.gf])")
    chars = ''.join(sorted(set(text + 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789,.!?\'')))
    n = 0
    for fam, wt, gf in specs:
        key = (fam, wt, chars)
        if key not in _FONT_CACHE:
            try:
                fam_q = gf.split(':')[0]
                css = _fetch('https://fonts.googleapis.com/css2?family=%s:wght@%d&text=%s' % (fam_q, wt, _up.quote(chars))).decode()
                url = _re.search(r'url\((https://[^)]+)\)', css)
                if not url:   # a family with one weight only
                    css = _fetch('https://fonts.googleapis.com/css2?family=%s&text=%s' % (fam_q, _up.quote(chars))).decode()
                    url = _re.search(r'url\((https://[^)]+)\)', css)
                _FONT_CACHE[key] = _b64.b64encode(_fetch(url.group(1))).decode() if url else None
            except Exception as e:
                _FONT_CACHE[key] = None
        if _FONT_CACHE[key]:
            n += await pg.evaluate("""async ([fam, wt, b64]) => { try { const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
              const f = new FontFace(fam, bin, { weight: String(wt) }); await f.load(); document.fonts.add(f); return 1; } catch (e) { return 0; } }""", [fam, wt, _FONT_CACHE[key]])
    await pg.evaluate("() => { J.glyphs.clear(); J.metrics.clear(); }")
    return n

async def main():
    os.makedirs(OUT, exist_ok=True)
    summary = []
    async with async_playwright() as pw:
        # web fonts come from Google: in an environment behind a proxy the browser needs it too, or every face falls back
        px = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
        b = await pw.chromium.launch(executable_path=CHROME, proxy={'server': px, 'bypass': 'localhost,127.0.0.1'} if px else None)
        pg = await (await b.new_context(ignore_https_errors=True)).new_page()
        await pg.goto('http://localhost:8765/%s.html' % os.environ.get('PAGE', 'test'), wait_until='domcontentloaded')
        await pg.wait_for_function('window.J')
        for run in RUN_IDS:
            lyrics, bpm = song(run)
            nf = await load_fonts(pg, lyrics)
            if run == RUN_IDS[0]: print('web font faces loaded:', nf)
            res = await pg.evaluate(JS, {'seed': run, 'lyrics': lyrics, 'bpm': bpm, 'aspect': os.environ.get('ASPECT', '16:9'), 'scale': 0.2, 'style': os.environ.get('STYLE', '')})
            # contact sheet: one frame per cut, captioned
            import base64, io
            ims = [Image.open(io.BytesIO(base64.b64decode(c['img'].split(',')[1]))).convert('RGB') for c in res['cuts']]
            if not ims: continue
            w, h = ims[0].size; cols = 6; cap = 26; rows = (len(ims) + cols - 1) // cols
            sheet = Image.new('RGB', (cols * (w + 3), rows * (h + cap + 3) + 30), (40, 40, 44))
            dr = ImageDraw.Draw(sheet)
            try: fnt = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 11)
            except Exception: fnt = ImageFont.load_default()
            dr.text((6, 6), f"run {run}  {res['styleName']} ({res['style']}) × {res['mood']}  bpm {bpm}  font {res['font'] or '-'}  cuts {res['nCuts']}", fill=(255, 220, 120), font=fnt)
            for i, (im, c) in enumerate(zip(ims, res['cuts'])):
                x, y = (i % cols) * (w + 3), 30 + (i // cols) * (h + cap + 3)
                sheet.paste(im, (x, y))
                dr.text((x + 2, y + h + 1), f"{c['t']}s {c['layout']}/{c['enter']}/{c['exit']}", fill=(200, 200, 210), font=fnt)
                if c['flags']: dr.text((x + 2, y + h + 13), ' '.join(c['flags']), fill=(255, 90, 90), font=fnt)
            sheet.save(f'{OUT}/run{run:03d}.png')
            for c in res['cuts']: del c['img']
            flags = {}
            for c in res['cuts']:
                for f in c['flags']: flags[f] = flags.get(f, 0) + 1
            summary.append({'run': run, 'style': res['style'], 'mood': res['mood'], 'font': res['font'], 'bpm': bpm, 'cuts': res['nCuts'], 'flags': flags,
                            'layouts': sorted({c['layout'] for c in res['cuts']})})
            print(f"run {run:3d} {res['style']:10s} {res['mood']:10s} cuts {res['nCuts']:3d} flags {flags} layouts {len(summary[-1]['layouts'])}")
            json.dump(res, open(f'{OUT}/run{run:03d}.json', 'w'), ensure_ascii=False, indent=1)
        await b.close()
    tot = {}
    for s in summary:
        for k, v in s['flags'].items(): tot[k] = tot.get(k, 0) + v
    cuts = sum(s['cuts'] for s in summary)
    print('TOTAL cuts', cuts, 'flags', tot, 'flagged share', round(sum(tot.values()) / max(1, cuts), 3))
    json.dump(summary, open(f'{OUT}/summary.json', 'w'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    asyncio.run(main())
