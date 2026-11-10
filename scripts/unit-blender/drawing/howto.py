"""线稿人是怎么搭出来的：同一个姿态分三步画出来（骨架 → 体块 → 线稿），给图版上讲方法用。

python3 howto.py <输出.svg> [姿态函数名 walk_cup] [机位 yaw 70]
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from ishi import Ortho
import linefig as LF
import poses

OUT = sys.argv[1]
POSE = sys.argv[2] if len(sys.argv) > 2 else 'walk_cup'
YAW = float(sys.argv[3]) if len(sys.argv) > 3 else 70
PAPER, INK, SOFT, TINT = '#F6F3EC', '#1D1B19', '#9C978D', '#F25A3C'
cw, ch, sc = 430, 560, 400
W, H = cw * 3, ch
out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}"><rect width="100%" height="100%" fill="{PAPER}"/>',
       '<style>text{font-family:Noto Sans SC,sans-serif;font-size:17px;fill:#5a534a}</style>']
b = getattr(poses, POSE)()
labels = ['① 骨架：关节按姿态摆好（手脚反解到目标位置）', '② 体块：每一块是几个球的凸包，衣服另一层', '③ 线稿：只画没被前面的区域盖住的外形线']
for i in range(3):
    ox, oy = i * cw + cw / 2, ch - 90
    proj = Ortho(yaw=YAW, elev=8, scale=sc, origin=(ox, oy))
    out.append(f'<line x1="{i*cw+50}" x2="{i*cw+cw-50}" y1="{oy}" y2="{oy}" stroke="#b9b0a2" stroke-width="1"/>')
    if i == 0:
        P = lambda p: proj(p)[:2]
        bones = [[b.pelvis, b.lumbar, b.chest, b.neckb, b.head_c], [b.sh[1], b.neckb, b.sh[-1]], [b.hipj[1], b.pelvis, b.hipj[-1]]]
        for s, A in b.arms.items():
            bones.append([A['sh'], A['elbow'], A['wrist'], A['tip']])
        for s, L in b.legs.items():
            bones.append([L['hip'], L['knee'], L['ankle'], L['toe']]); bones.append([L['ankle'], L['heel']])
        for bone in bones:
            d = 'M' + ' L'.join(f'{P(p)[0]:.1f},{P(p)[1]:.1f}' for p in bone)
            out.append(f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>')
            for p in bone:
                out.append(f'<circle cx="{P(p)[0]:.1f}" cy="{P(p)[1]:.1f}" r="3.4" fill="{PAPER}" stroke="{INK}" stroke-width="1.4"/>')
        x, y = P(b.head_c)
        out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{0.0625 * sc:.1f}" fill="none" stroke="{SOFT}" stroke-width="1.2" stroke-dasharray="4 4"/>')
    elif i == 1:
        R, vis, total, seams = LF.layout(b, proj, b.fit)
        for r in R:
            fill = INK if r.fill == 'ink' else TINT
            op = 0.55 if r.fill == 'ink' else 0.13
            out.append(f'<path d="{LF.path_d(r.poly)}" fill="{fill}" fill-opacity="{op}" stroke="{TINT if r.fill != "ink" else INK}" stroke-width="0.9" stroke-opacity="0.9"/>')
    else:
        out.append(LF.draw(b, proj, b.fit, ink=INK, paper=PAPER, w=2.1)[0])
    out.append(f'<text x="{i*cw+cw/2}" y="{ch-44}" text-anchor="middle">{labels[i]}</text>')
out.append('</svg>')
open(OUT, 'w').write(''.join(out))
