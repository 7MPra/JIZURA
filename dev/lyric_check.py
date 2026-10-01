"""Regression check: at every moment the frame shows only lyric lines that belong there.
For each cut (several times inside it) the frame is drawn with a glyph log; every glyph drawn must come from a line of
the current section that has already started (the text-only director builds a picture from the lines of a block, so the
earlier lines of the section may stay). A glyph from a later line or from another section is a "wrong line" failure.
Also checks the planner's time → cut lookup (J.cutAt) against a linear scan.
usage: python3 dev/lyric_check.py [styles=all] [page=test]   (needs dev/www built and served on :8765)"""
import asyncio, json, sys
from playwright.async_api import async_playwright

STYLES = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] != 'all' else ''
PAGE = sys.argv[2] if len(sys.argv) > 2 else 'test'
CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

# verses that come back with a different second line (the shape that tripped the block cache), choruses, an interlude
LYRICS = [
  '夜明けの色を覚えてる\nほどけた声が遠くで鳴った\n\n透明なままじゃ終われない\n絶叫したいくらいの夜に\n\n夜明けの色を覚えてる\n知らない街で目を覚ました\n\n透明なままじゃ終われない\n絶叫したいくらいの夜に\n\n[間奏 6]\n夜明けの色を覚えてる\n最後の電車が走り出す',
  'I remember the colour of the dawn\nA broken voice was ringing far away\n\nI won\'t end up invisible\nA night that makes me want to scream\n\nI remember the colour of the dawn\nWaking up in a town I do not know',
]

JS = r"""
async ({ styles, lyrics }) => {
  const out = { fails: [], checked: 0, cutAt: 0 };
  const cv = document.createElement('canvas'); cv.width = 192; cv.height = 108; const ctx = cv.getContext('2d');
  const r = new J.Renderer();
  const flat = s => [...String(s || '').replace(/[\s、。，．,.!！?？…・「」『』（）()"'“”‘’~〜ー―\-]/g, '')];
  const list = styles ? styles.split(',') : J.STYLE_ORDER;
  // edits: the same project re-planned after a line is changed / a line is inserted above (caches must not keep the old words)
  const edits = [];
  for (const lyr of lyrics) {
    const ls = lyr.split('\n');
    edits.push(lyr, ls.map((l, i) => (i === 0 ? l.replace(/^(\S{2})/, 'あい') : l)).join('\n'), ['新しい一行目を足した', ''].concat(ls).join('\n'));
  }
  for (const style of list) for (const seed of [1, 7, 23]) for (const aspect of ['16:9', '9:16']) for (const [li, lyr] of edits.entries()) {
    const p = Object.assign(J.defaultProject(), { lyrics: lyr, style, seed, aspect,
      timing: { bpm: 150, offset: 0.4, snap: true, tail: 0.9, lineTimes: {}, lineScale: 1, tempo: [] } });
    const beats = Array.from({ length: 600 }, (_, i) => 0.4 + i * 0.4);
    const plan = J.plan(p, { beats, duration: 120, energy: Array.from({ length: 1200 }, (_, i) => 0.4 + 0.3 * Math.sin(i / 40)), energyRate: 10 });
    // sections of the lyric (blank lines / interludes) and when each line starts
    const lines = plan.lines.filter(l => l.text && !l.interlude);
    const secOf = new Map(); let sec = 0, prev = null;
    for (const l of plan.lines) { if (l.interlude || (prev && l.gapBefore)) sec++; if (l.text && !l.interlude) secOf.set(l.index, sec); prev = l; }
    const label = style + ' #' + li + ' s' + seed + ' ' + aspect;
    // J.cutAt against a scan
    for (let t = 0; t < plan.duration; t += 0.37) {
      const a = J.cutAt(plan, t), b = plan.cuts.filter(c => t >= c.start && t < c.end).pop() || null;
      out.cutAt++;
      if (a !== b && !(a && b && a.start === b.start)) { out.fails.push(label + ' cutAt ' + t.toFixed(2) + ' → ' + (a && a.text) + ' / scan ' + (b && b.text)); break; }
    }
    for (const c of plan.cuts) {
      if (c.layout === 'interlude' || !String(c.text || '').trim()) continue;
      if (c.enter === 'tyRetype') continue;            // 打ち直し: types a wrong glyph on purpose, then fixes it
      const cl = plan.lines.find(l => l.index === c.line); if (!cl) continue;
      for (const f of [0.35, 0.7, 0.97]) {
        const t = c.start + (c.end - c.start) * f;
        const log = [];
        r.frame(ctx, plan, t, { scale: 0.1, glyphLog: log, noTrans: true });
        out.checked++;
        // allowed: lines of this section that have started (the current line included)
        const allowed = new Map();
        for (const l of lines) if (secOf.get(l.index) === secOf.get(c.line) && l.start <= t + 0.05) for (const ch of flat(l.text)) allowed.set(ch, (allowed.get(ch) || 0) + 1);
        const drawn = new Map(); for (const g of log) for (const ch of flat(g.ch)) drawn.set(ch, (drawn.get(ch) || 0) + 1);
        // a faint copy of the word (散らし) or a repeated line may draw a glyph twice: only a glyph that is not allowed at all fails
        const bad = [...drawn.keys()].filter(ch => !allowed.has(ch) && !/[A-Za-z]/.test(ch) || /[A-Za-z]/.test(ch) && !allowed.has(ch) && !allowed.has(ch.toLowerCase()) && !allowed.has(ch.toUpperCase()));
        if (bad.length) { out.fails.push(label + ' @' + t.toFixed(2) + ' cut「' + c.text + '」(' + c.layout + ') drew ' + bad.join('')); break; }
      }
    }
  }
  return out;
}
"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME)
        pg = await b.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(f'http://localhost:8765/{PAGE}.html', wait_until='domcontentloaded')
        await pg.wait_for_function('window.J && window.T')
        r = await pg.evaluate(JS, {'styles': STYLES, 'lyrics': LYRICS})
        await b.close()
    print('frames checked', r['checked'], 'cutAt probes', r['cutAt'])
    for f in r['fails'][:40]: print('FAIL', f)
    print('fails', len(r['fails']), 'page errors', errs)
    sys.exit(1 if r['fails'] or errs else 0)

if __name__ == '__main__':
    asyncio.run(main())
