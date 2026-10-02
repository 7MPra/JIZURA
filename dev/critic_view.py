"""Contact sheet of the cuts the critic flagged for one part: python3 dev/critic_view.py critic.json layout=kanjiFocus [flag] out.png"""
import asyncio, base64, io, json, sys, os
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
CHROME = os.environ.get('CHROME', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
from critic import LYRICS
async def main():
    rows = json.load(open(sys.argv[1])); g, k = sys.argv[2].split('='); flag = sys.argv[3] if len(sys.argv) > 4 else None; out = sys.argv[-1]
    sel = [r for r in rows if r[g] == k]
    def bad(r):
        return {'empty': r['cover'] < 0.004, 'collide': r['coll'] > 0, 'lowcontrast': r['lowC'] > 0, 'edge': r['edgeInk'] > 6, 'small': r['maxSize'] < 0.06}
    if flag: sel = [r for r in sel if bad(r)[flag]]
    sel = sel[:12]
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME); ctx = await b.new_context(ignore_https_errors=True); pg = await ctx.new_page()
        await pg.goto('http://localhost:8765/test.html', wait_until='domcontentloaded'); await pg.wait_for_timeout(1200)
        ims = []
        for r in sel:
            await pg.evaluate("p=>T.setup(p)", {'lyrics': LYRICS, 'style': r['style'], 'seed': r['seed'], 'aspect': r['aspect'], 'extra': True, 'timing': {'bpm': 150, 'offset': 0.4, 'snap': True, 'tail': 0.9, 'lineTimes': {}, 'lineScale': 1}, '__audio': {'beats': [0.4 + i * 0.4 for i in range(300)], 'duration': 60}})
            d = await pg.evaluate("t=>T.shot(t,0.2)", r['t']); im = Image.open(io.BytesIO(base64.b64decode(d.split(',')[1]))).convert('RGB')
            dr = ImageDraw.Draw(im); dr.text((3, 3), f"{r['style']} {r['seed']} {r['layout']}/{r['enter']}", fill=(255, 0, 255)); ims.append(im)
        await b.close()
    if not ims: print('none'); return
    w = max(i.size[0] for i in ims); h = max(i.size[1] for i in ims); cols = 4; rows_ = (len(ims) + cols - 1) // cols
    S = Image.new('RGB', (cols * (w + 3), rows_ * (h + 3)), (128, 128, 128))
    for i, im in enumerate(ims): S.paste(im, ((i % cols) * (w + 3), (i // cols) * (h + 3)))
    S.save(out); print(out, len(ims))
asyncio.run(main())
