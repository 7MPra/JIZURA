"""Collect the built browser editions (index.html, en/, zh-hant/, zh-hans/, ko/, id/, vi/) into worker-assets/ for `wrangler deploy`.
usage: python3 build.py && python3 tools/build_worker.py"""
import os, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import i18n
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
OUT = 'worker-assets'
shutil.rmtree(OUT, ignore_errors=True)
for code, folder, _, _ in i18n.EDITIONS:
    src = (folder + '/' if folder else '') + 'index.html'
    if not os.path.exists(src): print('skip', src); continue
    dst = os.path.join(OUT, src)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(src, dst)
    print(dst, os.path.getsize(dst), 'bytes')
