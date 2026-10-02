"""Regression checks in the real app page (fixes of 2026-10-01): line start times typed as m:ss.cc, moving lines and
interludes past each other, seeking / looping inside an interlude, the preview range, 落ち着いた演出, and that projects
without the new fields load and plan as before.
usage: python3 dev/ui_check.py [base=http://localhost:8766/]   (needs `python3 build.py`, the repo root served on :8766)"""
import asyncio, json, sys
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8766/'
CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
LYRICS = '一行目の歌詞\n二行目の歌詞\n[間奏 8]\nああそうか\n最後の行'
PROJECT = {'version': 1, 'lyrics': LYRICS, 'style': 'noir', 'seed': 5,
           'timing': {'bpm': 120, 'offset': 0.5, 'snap': True, 'tail': 0.9, 'lineTimes': {}, 'lineScale': 1, 'tempo': []}}
fails = []
def check(ok, what):
    print(('ok   ' if ok else 'FAIL ') + what)
    if not ok: fails.append(what)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME)
        ctx = await b.new_context(viewport={'width': 1500, 'height': 950})
        await ctx.add_init_script("""(() => { if (sessionStorage.getItem('jz-test-seeded')) return; sessionStorage.setItem('jz-test-seeded', '1');
          localStorage.setItem('jizura.tourDone', '1'); localStorage.setItem('jizura.mode', 'pro');
          localStorage.setItem('jizura.project.v1', %s); })()""" % json.dumps(json.dumps(PROJECT)))
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE, wait_until='domcontentloaded')
        await pg.wait_for_function('window.J && J.ui && J.ui.plan && document.querySelectorAll("#lineList li").length >= 5', timeout=30000)
        await pg.wait_for_timeout(500)
        st = lambda: pg.evaluate("() => ({ lt: J.ui.project.timing.lineTimes, lines: J.ui.plan.lines.map(l => [l.index, +l.start.toFixed(2), +l.end.toFixed(2)]), t: J.ui.t, dur: J.ui.plan.duration, playing: J.ui.playing })")
        async def type_time(i, v):
            el = pg.locator('#lineList li').nth(i).locator('input.time')
            await el.fill(v); await el.dispatch_event('change'); await pg.wait_for_timeout(150)

        # ---- 2. line start typed as m.ss.cc / m:ss.cc / seconds, across an interlude
        for v in ['3.22.44', '3:22.44', '03:22.44', '202.44']:
            await type_time(3, ''); await type_time(3, v)
            s = await st()
            check(abs(float(s['lt'].get('3', -1)) - 202.44) < 1e-6 and s['lines'][3][1] == 202.44, f'typed {v} → line 4 starts at 202.44 (got {s["lines"][3]})')
        s = await st()
        check(s['lines'][2][1] < 10 and abs(s['lines'][2][2] - 202.44) < 0.01, f'the interlude runs up to the line (interlude {s["lines"][2]})')
        check(s['lines'][4][1] > 202.44, f'the line after follows it ({s["lines"][4]})')
        await type_time(3, 'abc')
        s = await st(); check(abs(float(s['lt'].get('3', -1)) - 202.44) < 1e-6, 'an unreadable time keeps the hand-set time (it used to clear it)')
        val = await pg.locator('#lineList li').nth(3).locator('input.time').input_value()
        check(val == '03:22.44', f'the box shows m:ss.cc like the transport ({val})')
        await type_time(3, '')
        s = await st(); check('3' not in s['lt'] and s['lines'][3][1] < 20, 'empty → back to automatic')
        # a later hand-set line is pushed along instead of blocking
        await type_time(4, '20'); await type_time(3, '3:22.44')
        s = await st(); check(s['lines'][3][1] == 202.44 and s['lines'][4][1] >= 202.64 - 1e-6, f'a later fixed line is pushed after it ({s["lines"][3]}, {s["lines"][4]})')
        await type_time(3, ''); await type_time(4, '')

        # ---- 2. drag the interlude handle past the next line on the timeline
        await pg.evaluate("() => { document.getElementById('tlFit').click(); }")
        s = await st()
        box = await pg.locator('#timeline').bounding_box()
        X = lambda t: box['x'] + t / s['dur'] * box['width']
        hx = X(s['lines'][2][1]); target = s['lines'][3][1] + 1.0
        await pg.mouse.move(hx, box['y'] + 3); await pg.mouse.down(); await pg.mouse.move(X(target), box['y'] + 3, steps=6)
        await pg.keyboard.down('Shift'); await pg.mouse.move(X(target) + 1, box['y'] + 3); await pg.keyboard.up('Shift')
        await pg.mouse.up(); await pg.wait_for_timeout(300)
        s2 = await st()
        check(s2['lines'][2][1] > s['lines'][3][1], f'the interlude can be dragged past the next line ({s["lines"][2]} → {s2["lines"][2]})')
        check(s2['lines'][3][1] > s2['lines'][2][1] and s2['lines'][4][1] > s2['lines'][3][1], f'the lines after it are pushed and stay in order ({s2["lines"][2:]})')
        await pg.evaluate("() => { J.ui.project.timing.lineTimes = {}; }")
        await type_time(0, '')                                              # replan through the UI

        # ---- 2. seek into the interlude and play there in line / cut loop
        s = await st(); mid = (s['lines'][2][1] + s['lines'][2][2]) / 2
        await pg.mouse.click(X(mid), box['y'] + box['height'] * 0.8); await pg.wait_for_timeout(150)
        s = await st(); check(abs(s['t'] - mid) < 0.3, f'the playhead can be put in the interlude (t={s["t"]:.2f}, wanted {mid:.2f})')
        for mode in ['line', 'cut']:
            await pg.evaluate(f"m => {{ while (J.ui.loop !== m) document.getElementById('btnLoop').click(); }}", mode)
            await pg.mouse.click(X(mid), box['y'] + box['height'] * 0.8)
            await pg.evaluate("() => document.getElementById('btnPlay').click()"); await pg.wait_for_timeout(900)
            s = await st(); await pg.evaluate("() => { if (J.ui.playing) document.getElementById('btnPlay').click(); }")
            check(s['lines'][2][1] <= s['t'] <= s['lines'][2][2], f'{mode} loop: playback stays in the interlude (t={s["t"]:.2f})')
        # a pause between lines (no cut there) in cut loop
        gap = await pg.evaluate("""() => { const P = J.ui.project; P.timing.lineTimes = { 4: J.ui.plan.lines[3].end + 3 }; return true; }""")
        await type_time(1, ''); s = await st()
        g0 = await pg.evaluate("() => { const c = J.ui.plan.cuts; for (let i = 1; i < c.length; i++) if (c[i].start - c[i - 1].end > 0.5) return [c[i - 1].end, c[i].start]; return null; }")
        if g0:
            gm = (g0[0] + g0[1]) / 2
            await pg.evaluate("t => { J.ui.t = t; }", gm)
            await pg.mouse.click(X(gm) if gm < s['dur'] else X(s['dur'] - 0.1), box['y'] + box['height'] * 0.8)
            await pg.evaluate("() => document.getElementById('btnPlay').click()"); await pg.wait_for_timeout(500)
            s = await st(); await pg.evaluate("() => { if (J.ui.playing) document.getElementById('btnPlay').click(); }")
            check(g0[0] - 0.05 <= s['t'] <= g0[1] + 0.05, f'cut loop in a pause without a cut stays in the pause (t={s["t"]:.2f}, pause {g0})')
        await pg.evaluate("() => { J.ui.project.timing.lineTimes = {}; while (J.ui.loop !== false) document.getElementById('btnLoop').click(); }")
        await type_time(0, '')

        # ---- 3. preview range: stops at the end, loops in the range, rejects bad ranges
        async def set_pv(start, end):
            for sel, v in (('#pvIn', start), ('#pvOut', end)):
                await pg.fill(sel, v); await pg.dispatch_event(sel, 'change')
            await pg.wait_for_timeout(100)
        await set_pv('0:01', '0:02.5')
        pv = await pg.evaluate("() => J.ui.project.preview")
        check(pv == {'start': 1, 'end': 2.5}, f'preview range is stored ({pv})')
        await pg.evaluate("() => { J.ui.t = 0; document.getElementById('btnPlay').click(); }"); await pg.wait_for_timeout(2300)
        s = await st()
        check(not s['playing'] and abs(s['t'] - 2.5) < 0.06, f'loop off: playback stops at the end of the range (t={s["t"]:.2f}, playing={s["playing"]})')
        await pg.evaluate("() => { while (J.ui.loop !== 'all') document.getElementById('btnLoop').click(); J.ui.t = 1.2; document.getElementById('btnPlay').click(); }")
        await pg.wait_for_timeout(1800)
        s = await st(); await pg.evaluate("() => { if (J.ui.playing) document.getElementById('btnPlay').click(); }")
        check(s['playing'] and 1.0 - 0.05 <= s['t'] <= 2.5 + 0.05, f'loop all: playback loops inside the range (t={s["t"]:.2f})')
        await set_pv('0:01', '0:00.5')
        pv = await pg.evaluate("() => J.ui.project.preview")
        check(pv == {'start': 1, 'end': 2.5}, f'an end before the start is refused ({pv})')
        await pg.fill('#pvOut', '99:00'); await pg.dispatch_event('#pvOut', 'change'); await pg.wait_for_timeout(100)
        pv = await pg.evaluate("() => J.ui.project.preview")
        check(pv == {'start': 1, 'end': 2.5}, f'an end after the song is refused ({pv})')
        await pg.evaluate("() => { J.ui.t = 1.7; }"); await pg.keyboard.press('Escape'); await pg.locator('#timeline').focus()
        await pg.evaluate("() => document.activeElement.blur()"); await pg.keyboard.press('KeyO')
        pv = await pg.evaluate("() => J.ui.project.preview")
        check(pv and abs(pv['end'] - 1.7) < 1e-6, f'key O sets the end at the playhead ({pv})')
        await pg.click('#pvClear')
        check(await pg.evaluate("() => J.ui.project.preview") is None, 'clear: the whole song again')

        # ---- 4. 落ち着いた演出: on → one motion, no effects; off → exactly the plan before
        sig = "() => JSON.stringify([J.ui.plan.cuts.map(c => [c.layout, c.enter, c.exit, c.hold, c.cam, c.trans, c.treat, c.start.toFixed(3)]), J.ui.plan.events.map(e => e.type)])"
        await pg.evaluate("() => { J.ui.project.style = 'hrNightRec'; }"); await type_time(0, '')        # a style without the text-only staging
        before = await pg.evaluate(sig)
        await pg.evaluate("() => { document.querySelector('.tabs button[data-tab=fx]').click(); }")
        await pg.check('#calmOn'); await pg.wait_for_timeout(200)
        info = await pg.evaluate("() => ({ calm: J.ui.plan.calm, ev: J.ui.plan.events.length, cuts: J.ui.plan.cuts.filter(c => c.layout !== 'interlude' && !c.staged).map(c => [c.enter, c.exit, c.trans, c.treat]) })")
        check(bool(info['calm']) and info['ev'] == 0, f'calm: no screen effects ({info["ev"]} events)')
        check(all(c[0] in ('calmFade', 'cut') and c[2] is None and c[3] == 'none' for c in info['cuts']), f'calm: every cut fades in, no transitions or treatments ({info["cuts"][:4]})')
        await pg.select_option('#calmMotion', 'wipe'); await pg.wait_for_timeout(150)
        en = await pg.evaluate("() => [...new Set(J.ui.plan.cuts.filter(c => c.layout !== 'interlude' && !c.staged).map(c => c.enter))]")
        check(en == ['wipe'], f'calm motion can be chosen ({en})')
        await pg.uncheck('#calmOn'); await pg.wait_for_timeout(200)
        check(await pg.evaluate(sig) == before, 'calm off: the plan is exactly what it was')

        # ---- save / reload keeps the new fields; an old project (no fields) loads with them off
        await pg.check('#calmOn'); await set_pv('0:01', '0:03')
        await pg.evaluate("() => { document.getElementById('btnPlay').click(); document.getElementById('btnPlay').click(); }")
        await pg.reload(wait_until='domcontentloaded')
        await pg.wait_for_function('window.J && J.ui && J.ui.plan', timeout=30000)
        got = await pg.evaluate("() => ({ calm: J.ui.project.calm, preview: J.ui.project.preview })")
        check(got['calm'] and got['calm']['on'] and got['preview'] == {'start': 1, 'end': 3}, f'reload keeps calm and the preview range ({got})')
        async def load_stored(proj_js):                      # the app saves its project when the page goes away: store from another page
            await pg.goto(BASE + 'sitemap.xml', wait_until='domcontentloaded')
            await pg.evaluate("p => localStorage.setItem('jizura.project.v1', p)", proj_js)
            await pg.goto(BASE, wait_until='domcontentloaded')
        await load_stored(json.dumps(PROJECT))
        await pg.wait_for_function('window.J && J.ui && J.ui.plan', timeout=30000)
        got = await pg.evaluate("() => ({ calm: J.ui.project.calm, preview: J.ui.project.preview, plan: !J.ui.plan.calm })")
        check(got['calm'] is None and got['preview'] is None and got['plan'], f'an older project loads with neither ({got})')
        await load_stored(json.dumps(dict(PROJECT, preview={'start': 'x', 'end': -3}, calm={'on': 'yes', 'motion': '<b>'})))
        await pg.wait_for_function('window.J && J.ui && J.ui.plan', timeout=30000)
        got = await pg.evaluate("() => ({ calm: J.ui.project.calm, preview: J.ui.project.preview })")
        check(got['calm'] is None and got['preview'] is None, f'malformed values in a project file are dropped ({got})')

        # ---- 1. editing the lyrics box keeps hand-set times on their lines (they were kept by line number)
        P2 = {'version': 1, 'lyrics': '一行目\n二行目\n三行目\n四行目', 'style': 'noir', 'seed': 5,
              'timing': {'bpm': 0, 'offset': 0.5, 'snap': False, 'tail': 0.9, 'lineTimes': {'0': 1, '1': 5, '2': 9, '3': 13}, 'lineScale': 1, 'tempo': []},
              'overrides': {'2': {'layout': 'vcols'}}}
        await load_stored(json.dumps(P2))
        await pg.wait_for_function('window.J && J.ui && J.ui.plan', timeout=30000)
        shown = "() => [1.5, 5.5, 9.5, 13.5].map(t => { const c = J.cutAt(J.ui.plan, t); return c ? c.lineText : '-'; })"
        async def edit_box(fn):
            await pg.evaluate("f => { const el = document.getElementById('lyrics'); el.value = (new Function('v', f))(el.value); el.dispatchEvent(new Event('input')); }", fn)
            await pg.wait_for_timeout(500)
        await edit_box("return '新しい行\\n' + v")
        got = await pg.evaluate(shown)
        check(got == ['一行目', '二行目', '三行目', '四行目'], f'a line inserted above: every line still at its time ({got})')
        ov = await pg.evaluate("() => J.ui.project.overrides")
        check(ov.get('3', {}).get('layout') == 'vcols' and '2' not in ov, f'per-line settings follow their line ({ov})')
        await edit_box("return v.replace('二行目\\n', '')")
        got = await pg.evaluate(shown)
        check(got[0] == '一行目' and got[2:] == ['三行目', '四行目'], f'a line removed: the others keep their times ({got})')
        await edit_box("return v.replace('三行目', '三行め')")
        got = await pg.evaluate(shown)
        check(got[2:] == ['三行め', '四行目'], f'a line changed in place keeps its time ({got})')
        await edit_box("return v.replace('三行め', '[間奏 4]\\n三行め')")
        got = await pg.evaluate(shown)
        check(got[2:] == ['三行め', '四行目'], f'an interlude added: the lines keep their times ({got})')

        # ---- pure helpers
        cases = await pg.evaluate("""() => [['202.44', J.parseTime('202.44')], ['3:22.44', J.parseTime('3:22.44')], ['3.22.44', J.parseTime('3.22.44')],
          ['03:22:44', J.parseTime('03:22:44')], ['１：０５', J.parseTime('１：０５')], ['1:03:22.5', J.parseTime('1:03:22.5')], ['3:75', J.parseTime('3:75')],
          ['abc', J.parseTime('abc')], ['', J.parseTime('')], ['fmtClock 202.44', J.fmtClock(202.44)]]""")
        want = {'202.44': 202.44, '3:22.44': 202.44, '3.22.44': 202.44, '03:22:44': 202.44, '１：０５': 65, '1:03:22.5': 3802.5, '3:75': None, 'abc': None, '': None, 'fmtClock 202.44': '03:22.44'}
        for k, v in cases:
            w = want[k]
            nan = v is None or (isinstance(v, float) and v != v)
            ok = nan if w is None else (v == w if isinstance(w, str) else not nan and abs(v - w) < 1e-9)
            check(ok, f'parseTime/fmtClock {k!r} → {v!r}')
        maps = await pg.evaluate("""() => [J.lineIndexMap('a\\nb\\nc', 'x\\na\\nb\\nc'), J.lineIndexMap('a\\nb\\nc', 'a\\nc'), J.lineIndexMap('a\\nb\\nc', 'a\\nB\\nc'),
          J.lineIndexMap('サビ\\nA\\nサビ', 'サビ\\nA\\nB\\nサビ'), J.lineIndexMap('a\\nb', 'a\\nb')]""")
        check(maps == [[1, 2, 3], [0, -1, 1], [0, 1, 2], [0, 1, 3], None], f'lineIndexMap {maps}')

        check(not errs, f'no page errors {errs[:3]}')
        await b.close()
    print('fails', len(fails))
    sys.exit(1 if fails else 0)

if __name__ == '__main__':
    asyncio.run(main())
