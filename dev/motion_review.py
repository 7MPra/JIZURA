"""Motion review: the おまかせ songs of omakase_review.py, followed glyph by glyph through time.
Every drawing step (the 'koma' clock) of every lyric cut is rendered with a glyph log; each glyph's centre, size and
alpha become a track, and the tracks are judged:
  unreadable  > 30% of the line's glyphs are never still long enough to read (0.15 s + 0.06 s per glyph on screen with
              them, at most 1 s or half the cut) — the copies an entrance makes for a moment are not the line
  slowsettle  a glyph takes long to come to rest after it appears (median > max(0.5 s, 40% of the cut))
  jump        a glyph moves / resizes in one step while the steps around it are still (a teleport, a glitch) — off the beat
  hardstop    a fast move that ends at full speed: constant velocity, then nothing (a linear tween, the cheap look)
  jitter      the direction of travel flips step after step (shaking that reads as noise, not as a hit)
  flicker     visible → gone → visible within a few steps, off the beat
  frozen      nothing at all moves, grows or fades for > 2.5 s (a slide, not a video)
Flags are counted per part (enter / exit / hold / cam / layout, by the phase of the cut they happen in), and the
worst cuts get a strip: frames across the cut with the glyph paths drawn over them.
usage: python3 dev/motion_review.py [runs=8] [first=1] [outdir=dev/review/motion]   (dev/www built and served on :8765)
       RUNS=… / ASPECT=… / PAGE=… / STYLE=… as in omakase_review.py; STRIPS=n strips (default 24); ONLY=run:cut,… strips of those cuts"""
import asyncio, json, math, os, sys, io, base64
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(__file__))
import omakase_review as OR

N = int(sys.argv[1]) if len(sys.argv) > 1 else 8
FIRST = int(sys.argv[2]) if len(sys.argv) > 2 else 1
OUT = sys.argv[3] if len(sys.argv) > 3 else 'dev/review/motion'
RUN_IDS = [int(x) for x in os.environ['RUNS'].split(',')] if os.environ.get('RUNS') else list(range(FIRST, FIRST + N))
STRIPS = int(os.environ.get('STRIPS', '24'))

JS = r"""
async (o) => {
  const rng = J.rng(o.seed * 7919 + 13), rnd = () => rng();
  let p = Object.assign(J.defaultProject(), { lyrics: o.lyrics, aspect: o.aspect, extra: true });
  p.timing = Object.assign(p.timing, { bpm: o.bpm, snap: true, offset: 0.4 });
  Object.assign(p, J.omakase(p, rnd));
  if (o.style && J.STYLES[o.style]) p.style = o.style;
  const bl = 60 / o.bpm, beats = Array.from({ length: 900 }, (_, i) => 0.4 + i * bl);
  const plan0 = J.plan(p, { beats, duration: 400 });
  const hookLines = new Set(plan0.lines.filter(l => /!|叫|回れ|踊れ|すき|離さ|壊|鼓動|透明|笑って|連れて/.test(l.text)).map(l => l.index));
  const energy = Array.from({ length: 4000 }, (_, i) => { const t = i / 10, l = plan0.lines.find(x => t >= x.start && t < x.end); return l && hookLines.has(l.index) ? 0.85 : 0.45; });
  const plan = J.plan(p, { beats, duration: plan0.duration + 1, energy, energyRate: 10 });
  const r = new J.Renderer(), S = 0.1;
  window.__mot = { plan, r };
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
  cv.width = Math.round(plan.W * S); cv.height = Math.round(plan.H * S);
  // which cut each glyph belongs to: drawCut tags the log
  let cur = -1; const core = r.drawCut.bind(r);
  r.drawCut = env => { const was = cur; cur = env.cut.index; try { return core(env); } finally { cur = was; } };
  const step = J.stepDur(plan.fx, plan.fps), U = Math.min(plan.W, plan.H) * S;
  const frames = [];
  for (let k = Math.ceil(0.2 / step); k * step < plan.duration; k++) {
    const t = k * step + 1e-4, g = [];
    const log = { push: q => { if (q.a > 0.02) g.push([cur, q.ch, +(q.m[4] / U).toFixed(4), +(q.m[5] / U).toFixed(4), +(Math.hypot(q.m[0], q.m[1]) * q.px / U).toFixed(4), +q.a.toFixed(3)]); } };
    r.frame(ctx, plan, t, { scale: S, glyphLog: log, noTrans: true });
    const c = J.cutAt(plan, t);
    frames.push([+t.toFixed(4), c ? c.index : -1, g]);
  }
  const cuts = plan.cuts.map(c => ({ i: c.index, start: c.start, end: c.end, inDur: c.inDur || 0, outDur: c.outDur || 0, text: c.text, layout: c.layout,
    enter: c.enter, exit: c.exit, hold: c.hold, cam: c.cam || 'push', manual: !!c.manual, lyric: c.layout !== 'interlude' && c.line >= 0 && !!String(c.text || '').trim() }));
  return { style: p.style, styleName: plan.style.name, mood: p.mood, koma: J.komaOf(plan.fx), step, aspect: o.aspect, W: plan.W, H: plan.H,
           beats: beats.filter(b => b < plan.duration), cuts, frames };
}
"""

STRIP_JS = r"""
([ts, S]) => { const { plan, r } = window.__mot, cv = document.createElement('canvas');
  cv.width = Math.round(plan.W * S); cv.height = Math.round(plan.H * S);
  return ts.map(t => { r.frame(cv.getContext('2d'), plan, t, { scale: S }); return cv.toDataURL('image/jpeg', 0.82); }); }
"""

def tracks_of(frames, ci):
    """glyph tracks of cut ci: each glyph is matched to the nearest live track of the same character in the previous
    steps (greedy, closest pairs first) — draw order is not stable enough to pair repeated letters by their order"""
    T, live, nid = {}, {}, 0          # live: key → (t, x, y)
    for t, _, g in frames:
        gl = [q for q in g if q[0] == ci]
        pairs = []
        for gi, (_, ch, x, y, s, a) in enumerate(gl):
            for key, (tl, xl, yl) in live.items():
                if key[0] == ch and t - tl < 0.4:
                    d = math.hypot(x - xl, y - yl)
                    if d < 0.8: pairs.append((d, gi, key))
        pairs.sort(key=lambda p: p[0])
        used_g, used_k = set(), set()
        for d, gi, key in pairs:
            if gi in used_g or key in used_k: continue
            used_g.add(gi); used_k.add(key)
            _, ch, x, y, s, a = gl[gi]; T[key][t] = (x, y, s, a); live[key] = (t, x, y)
        for gi, (_, ch, x, y, s, a) in enumerate(gl):
            if gi in used_g: continue
            key = (ch, nid); nid += 1; T[key] = {t: (x, y, s, a)}; live[key] = (t, x, y)
    return T

def near_beat(t, beats, tol):
    lo, hi = 0, len(beats)
    while lo < hi:
        m = (lo + hi) // 2
        if beats[m] < t: lo = m + 1
        else: hi = m
    best = min((abs(beats[j] - t) for j in (lo - 1, lo) if 0 <= j < len(beats)), default=9)
    if len(beats) > 1:   # half beats count too
        bl = beats[1] - beats[0]
        best = min(best, min((abs(beats[j] + bl / 2 - t) for j in (lo - 2, lo - 1, lo) if 0 <= j < len(beats)), default=9))
    return best <= tol

def analyse(res):
    step, beats, frames = res['step'], res['beats'], res['frames']
    times = [f[0] for f in frames]
    out = []
    for c in res['cuts']:
        if not c['lyric']: continue
        ts = [t for t in times if c['start'] <= t < c['end']]
        if len(ts) < 4: continue
        dur = c['end'] - c['start']
        T = tracks_of([f for f in frames if c['start'] <= f[0] < c['end']], c['i'])
        if not T: out.append(dict(c, dur=dur, flags=['empty'], ev=[], readT=0, tRead=None)); continue
        def phase(t):
            lt = t - c['start']
            if lt < c['inDur'] + 0.06: return 'enter'
            if lt > dur - c['outDur'] - 0.06: return 'exit'
            return 'hold'
        ev = []            # (kind, t, phase)
        # per step: how many glyphs visible, how many of those still
        moving = {t: 0 for t in ts}
        G = {}             # per track: visible steps, still steps (times)
        for key, tr in T.items():
            seq = [(t, tr.get(t)) for t in ts]
            V = []                                     # (t, dist/step, dlogscale, vx, vy) between consecutive present samples
            for (t0, p0), (t1, p1) in zip(seq, seq[1:]):
                if p0 and p1 and p0[3] > 0.5 and p1[3] > 0.5:
                    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
                    V.append((t1, math.hypot(dx, dy), abs(math.log(max(1e-4, p1[2]) / max(1e-4, p0[2]))), dx, dy))
                else: V.append((t1, None, None, 0, 0))
            gv = [t for t, p in seq if p and p[3] > 0.5]; gs = []
            size = {t: p[2] for t, p in seq if p}
            for j, (t, d, ds, _, _) in enumerate(V):
                if d is None: continue
                sp, sr = d / step, ds / step
                if sp < max(0.12, 0.8 * size.get(t, 0)) and sr < 1.5: gs += [seq[j][0], t]   # still enough to read: slower than 0.8 of its own size a second, a pulse under ~12% per koma
                if sp > 0.02 or sr > 0.02: moving[t] += 1
            gs = sorted(set(gs))                       # the samples at either end of a still step
            G[key] = (gv, gs)
            # jump: a big step between two quiet ones
            for j in range(1, len(V) - 1):
                d, ds = V[j][1], V[j][2]
                if d is None or V[j - 1][1] is None or V[j + 1][1] is None: continue
                big = d > 0.12 and V[j - 1][1] < 0.25 * d and V[j + 1][1] < 0.25 * d
                bigS = ds > 0.25 and V[j - 1][2] < 0.25 * ds and V[j + 1][2] < 0.25 * ds
                if (big or bigS) and not near_beat(V[j][0], beats, step * 1.01): ev.append(('jump', V[j][0], phase(V[j][0]), key[0]))
            # hardstop: a run of motion (≥3 steps) whose last moving step is still near its peak speed
            run = []
            for t, d, ds, _, _ in V + [(None, None, None, 0, 0)]:
                if d is not None and d / step > 0.05: run.append((t, d / step)); continue
                if len(run) >= 3 and d is not None:
                    peak = max(v for _, v in run)
                    if peak > 0.8 and run[-1][1] > 0.6 * peak and run[-2][1] > 0.6 * peak: ev.append(('hardstop', run[-1][0], phase(run[-1][0]), key[0]))
                run = []
            # jitter: direction flips with real speed
            flips = 0
            for a, b in zip(V, V[1:]):
                if a[1] is None or b[1] is None or a[1] / step < 0.4 or b[1] / step < 0.4: continue
                if a[3] * b[3] + a[4] * b[4] < -0.3 * a[1] * b[1]: flips += 1; fl_t = b[0]
            if flips >= 3 and flips / max(0.5, dur) > 1.5: ev.append(('jitter', fl_t, phase(fl_t), key[0]))
            # flicker: present-gone-present within 3 steps, off the beat
            on = [bool(p and p[3] > 0.5) for _, p in seq]
            for j in range(1, len(on) - 1):
                if on[j - 1] and not on[j]:
                    k2 = next((k for k in range(j + 1, min(len(on), j + 4)) if on[k]), None)
                    if k2 is not None and not near_beat(seq[j][0], beats, step * 1.01): ev.append(('flicker', seq[j][0], phase(seq[j][0]), key[0]))
        # readable: each glyph of the line (not the short-lived copies an entrance makes) must sit still and visible
        # long enough to be read with the glyphs around it: 0.15 s + 0.06 s per glyph on screen with it (≤ 1 s, ≤ half the cut)
        # the line = tracks not born in the exit (slice / shatter pieces), not gone before the entrance ends (entrance copies),
        # and not small secondary type (a caption, a companion column) next to the lyric
        tEx, tIn = c['end'] - c['outDur'] - 0.06, c['start'] + c['inDur'] + 0.06
        msize = {k: sorted(T[k][t][2] for t in v[0])[len(v[0]) // 2] for k, v in G.items() if v[0]}
        big = max(msize.values(), default=0)
        main = {k: v for k, v in G.items() if len(v[0]) >= 2 and v[0][0] < tEx and v[0][-1] > tIn and msize[k] >= 0.3 * big}
        cov = {}
        for gv, _ in main.values():
            for t in gv: cov[t] = cov.get(t, 0) + 1
        fails, rts, settles = 0, [], []
        for gv, gs in main.values():
            co = sorted(cov[t] for t in gv)[len(gv) // 2]
            need = min(1.0, 0.5 * dur, 0.15 + 0.06 * co)
            rt = len(gs) * step; rts.append(rt)
            if rt + 1e-6 < need: fails += 1
            settles.append((gs[0] - gv[0]) if gs else dur)
        readT = sorted(rts)[len(rts) // 2] if rts else 0
        tRead = sorted(settles)[len(settles) // 2] if settles else None
        flags = set(k for k, *_ in ev)
        if dur >= 0.8 and main and fails > 0.3 * len(main): flags.add('unreadable')
        if tRead is not None and tRead > max(0.5, 0.4 * dur): flags.add('slowsettle')
        # frozen: the longest stretch with nothing changing at all
        best = cur = 0.0
        for t in ts:
            cur = cur + step if moving[t] == 0 else 0.0
            best = max(best, cur)
        if best > 2.5: flags.add('frozen')
        # counts of glyph-level events are folded to one per (kind, phase) for the part tables
        out.append(dict(c, dur=round(dur, 2), flags=sorted(flags), ev=ev, readT=round(readT, 2), tRead=None if tRead is None else round(tRead, 2), frozenT=round(best, 2)))
    return out

def parts_of(c, kind, ph):
    if kind in ('unreadable', 'slowsettle', 'frozen', 'empty'): return ['layout:' + c['layout'], 'hold:' + c['hold'], 'cam:' + c['cam']] + (['enter:' + c['enter']] if kind == 'slowsettle' else [])
    if ph == 'enter': return ['enter:' + c['enter'], 'layout:' + c['layout']]
    if ph == 'exit': return ['exit:' + c['exit'], 'layout:' + c['layout']]
    return ['hold:' + c['hold'], 'cam:' + c['cam'], 'layout:' + c['layout']]

async def strip(pg, c, res, path):
    n = 8; dur = c['end'] - c['start']
    ts = [c['start'] + dur * (k + 0.5) / n for k in range(n)]
    imgs = await pg.evaluate(STRIP_JS, [ts, 0.18])
    ims = [Image.open(io.BytesIO(base64.b64decode(d.split(',')[1]))).convert('RGB') for d in imgs]
    w, h = ims[0].size
    sheet = Image.new('RGB', (n * (w + 2), h + 70), (36, 36, 40)); dr = ImageDraw.Draw(sheet)
    fnt = ImageFont.load_default()
    for k, im in enumerate(ims):
        sheet.paste(im, (k * (w + 2), 0)); dr.text((k * (w + 2) + 3, h + 2), '%.2fs' % (ts[k] - c['start']), fill=(200, 200, 210), font=fnt)
    # glyph paths, drawn over the first frame's slot scale (U units → px)
    U = min(res['W'], res['H']) * 0.18
    T = tracks_of([f for f in res['frames'] if c['start'] <= f[0] < c['end']], c['i'])
    trail = Image.new('RGB', (w, h), (20, 20, 24)); td = ImageDraw.Draw(trail)
    for key, tr in list(T.items())[:40]:
        pts = [(p[0] * U, p[1] * U) for t, p in sorted(tr.items()) if p[3] > 0.3]
        if len(pts) > 1: td.line(pts, fill=(255, 200, 80), width=1)
        for q in pts: td.point(q, fill=(255, 255, 255))
    big = Image.new('RGB', (sheet.width, sheet.height + h + 4), (36, 36, 40)); big.paste(sheet, (0, 0)); big.paste(trail, (0, sheet.height + 2))
    d2 = ImageDraw.Draw(big)
    d2.text((4, h + 16), f"{c['layout']} / {c['enter']} > {c['hold']} > {c['exit']} / cam {c['cam']}   dur {c['dur']}s readT {c['readT']}s tRead {c['tRead']}", fill=(255, 220, 120), font=fnt)
    d2.text((4, h + 32), 'flags: ' + ' '.join(c['flags']) + '   ' + ' '.join(sorted({f'{k}@{ph}' for k, _, ph, _ in c['ev']})), fill=(255, 110, 110), font=fnt)
    d2.text((4, h + 48), c['text'][:60], fill=(220, 220, 230), font=fnt)
    big.save(path)

async def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.png'): os.remove(os.path.join(OUT, f))
    allc = []; worst = []
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=OR.CHROME)
        pg = await (await b.new_context()).new_page()
        await pg.goto('http://localhost:8765/%s.html' % os.environ.get('PAGE', 'test'), wait_until='domcontentloaded')
        await pg.wait_for_function('window.J')
        for run in RUN_IDS:
            lyrics, bpm = OR.song(run)
            res = await pg.evaluate(JS, {'seed': run, 'lyrics': lyrics, 'bpm': bpm, 'aspect': os.environ.get('ASPECT', '16:9'), 'style': os.environ.get('STYLE', '')})
            cuts = analyse(res)
            for c in cuts: c['run'] = run; c['style'] = res['style']
            allc += cuts
            fl = {}
            for c in cuts:
                for f in c['flags']: fl[f] = fl.get(f, 0) + 1
            print(f"run {run:3d} {res['style']:10s} koma {res['koma']:2d} cuts {len(cuts):3d} flags {fl}", flush=True)
            # strips for this run's worst cuts (the page still holds its plan)
            if STRIPS:
                bad = sorted([c for c in cuts if c['flags']], key=lambda c: -len(c['flags']) - len(c['ev']) * 0.05)[:max(1, STRIPS // max(1, len(RUN_IDS)))]
                if os.environ.get('ONLY'): bad = [c for c in cuts if f"{run}:{c['i']}" in os.environ['ONLY'].split(',')]
                if os.environ.get('FONTS'): await OR.load_fonts(pg, lyrics)
                for c in bad:
                    pth = f"{OUT}/r{run:03d}_c{c['i']:03d}.png"; await strip(pg, c, res, pth); worst.append(pth)
        await b.close()
    # part table: share of the part's cuts that show each flag
    parts = {}
    for c in allc:
        used = {'enter:' + c['enter'], 'exit:' + c['exit'], 'hold:' + c['hold'], 'cam:' + c['cam'], 'layout:' + c['layout']}
        for u in used: parts.setdefault(u, {'n': 0})['n'] += 1
        seen = set()
        for k in c['flags']:
            phs = {ph for kk, _, ph, _ in c['ev'] if kk == k} or {'hold'}
            for ph in phs:
                for pt in parts_of(c, k, ph):
                    if (pt, k) in seen: continue
                    seen.add((pt, k)); P = parts.setdefault(pt, {'n': 0}); P[k] = P.get(k, 0) + 1
    rows = []
    for pt, P in parts.items():
        bad = sum(v for k, v in P.items() if k != 'n')
        rows.append((bad / P['n'], pt, P))
    rows.sort(reverse=True)
    print('\nworst parts (flags per cut that used the part, n ≥ 3):')
    for sc, pt, P in rows:
        if P['n'] >= 3 and sc > 0: print(f"  {sc:4.2f} {pt:28s} n={P['n']:3d} " + ' '.join(f'{k}={v}' for k, v in sorted(P.items()) if k != 'n'))
    tot = {}
    for c in allc:
        for f in c['flags']: tot[f] = tot.get(f, 0) + 1
    print('\nTOTAL cuts', len(allc), 'flags', tot, 'flagged share', round(sum(1 for c in allc if c['flags']) / max(1, len(allc)), 3))
    print('mean readT share', round(sum(c['readT'] / max(0.1, c['dur']) for c in allc) / max(1, len(allc)), 3))
    for c in allc: c.pop('ev', None)
    json.dump({'cuts': allc, 'parts': {pt: P for _, pt, P in rows}}, open(f'{OUT}/motion.json', 'w'), ensure_ascii=False, indent=1)
    print('strips:', len(worst))

if __name__ == '__main__':
    asyncio.run(main())
