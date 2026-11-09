"""猫的对照表：八种姿态 × 五种画法（铅笔狸花 / 铅笔奶牛 / 铅笔黑猫 / 线稿 / 黑剪影）。
python3 catsheet.py <输出.svg> [每 cm 多少像素，缺省 5]，再用 svg2png.mjs 出图。
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sys
from cats import ALL, cat_svg
PAPER = '#F3EEE4'
cols = [('pencil', 'tabby', '铅笔 · 狸花'), ('pencil', 'cow', '铅笔 · 奶牛'), ('pencil', 'black', '铅笔 · 黑猫'), ('line', None, '线稿'), ('silhouette', None, '黑剪影')]
sc = float(sys.argv[2]) if len(sys.argv) > 2 else 5.0
cw, ch = int(60 * sc), int(52 * sc)
W, H = 160 + cw * len(cols), 50 + ch * len(ALL)
o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}"><rect width="100%" height="100%" fill="{PAPER}"/><style>text{{font-family:Noto Sans SC,sans-serif;font-size:14px;fill:#5a534a}}</style>']
for j, (_, _, t) in enumerate(cols):
    o.append(f'<text x="{160 + j*cw + cw/2}" y="30" text-anchor="middle">{t}</text>')
for i, fn in enumerate(ALL):
    c = fn()
    o.append(f'<text x="20" y="{50 + i*ch + ch/2}">{c.name}</text>')
    minx, miny, maxx, maxy = c.outline().bounds
    for j, (style, coat, _) in enumerate(cols):
        ox = 160 + j * cw + cw / 2 - (minx + maxx) / 2 * sc
        oy = 50 + i * ch + ch - 18
        T = lambda x, y, ox=ox, oy=oy: (ox + x * sc, oy - y * sc)
        o.append(cat_svg(c, T, sc, style=style, coat=coat or 'tabby', seed=i * 10 + j, uid=f'{i}_{j}'))
o.append('</svg>')
open(sys.argv[1], 'w').write(''.join(o))
