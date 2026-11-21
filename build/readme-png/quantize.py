# -*- coding: utf-8 -*-
"""index.html が out/ に落とした PNG を64色に減色して、拡張2本の docs/ に配る。

実行: python3 build/readme-png/quantize.py
"""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
# リポジトリが並ぶディレクトリを上へ辿って探す（sync-engine.sh と同じ考え方）
root = HERE
while root != os.path.dirname(root) and not os.path.isfile(
        os.path.join(root, 'swimlane-diagram', 'swimlane.js')):
    root = os.path.dirname(root)
if not os.path.isfile(os.path.join(root, 'swimlane-diagram', 'swimlane.js')):
    raise SystemExit('swimlane-diagram/ が見つかりません')

# 同じ画像を2つの名前で配っている（拡張ごとに README の書き方が違うだけ）
JOBS = [
    ('example-ja.png', ['swimlane-diagram-preview/docs/example-ja.png',
                        'swimlane-gui-studio/docs/example.png']),
    ('example-en.png', ['swimlane-diagram-preview/docs/example-en.png',
                        'swimlane-gui-studio/docs/example.en.png']),
]

for name, dests in JOBS:
    src = os.path.join(HERE, 'out', name)
    if not os.path.isfile(src):
        raise SystemExit(src + ' がありません。先に index.html をブラウザで開くこと')
    im = Image.open(src).convert('RGB')
    # ディザは文字をざらつかせるので使わない
    im = im.quantize(colors=64, dither=Image.Dither.NONE)
    for d in dests:
        p = os.path.join(root, d)
        im.save(p, optimize=True)
        print('%-46s %sx%s %d bytes' % (d, im.size[0], im.size[1], os.path.getsize(p)))
