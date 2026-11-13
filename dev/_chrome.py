"""Which Chromium the dev scripts launch: $CHROME (a path), $JIZURA_BROWSER when it is a path, else the newest
/opt/pw-browsers/chromium-*/chrome-linux*/chrome, else None (Playwright's own default)."""
import glob, os, re
def _ver(p):
    m = re.search(r'chromium-(\d+)', p); return int(m.group(1)) if m else 0
def find():
    for v in (os.environ.get('CHROME'), os.environ.get('JIZURA_BROWSER')):
        if v and os.path.exists(v): return v
    c = sorted(glob.glob('/opt/pw-browsers/chromium-*/chrome-linux*/chrome'), key=_ver)
    return c[-1] if c else None
CHROME = find()

def launch_args():
    """keyword arguments for playwright's chromium.launch: a browser path when one is known, else $JIZURA_BROWSER as a channel name"""
    if CHROME: return {'executable_path': CHROME}
    ch = os.environ.get('JIZURA_BROWSER')
    return {'channel': ch} if ch else {}
