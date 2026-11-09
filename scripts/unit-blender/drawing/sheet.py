"""姿态表：石上纯也式黑色小人 + 铅笔猫（互动的那几张带猫）+ 布景细线"""
import sys, math
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from ishi import Ortho, figure_svg
from props import props_svg
import poses, cats as C
PAPER = '#F3EEE4'; INK = '#1d1a17'
CATSTYLE = sys.argv[2] if len(sys.argv) > 2 else 'pencil'
# 每张图配的猫：(画法, 在人的局部系里的落点 x,y,z（单位 H）, 朝向 ±1, 花色)
CAT = {
    # 平台上的：人的局部系里的落点；其余：相对这一格地面中点的像素偏移 (dx, 离地 dy)
    '站着低头看猫': (C.walk, ('px', 62, 0), -1, 'tabby'),
    '举手机拍猫': (C.sit_front, ('local', 0.0, 0.62, 0.62), 1, 'cow'),
    '蹲下摸猫': (C.lie_side, ('px', 108, 0), -1, 'tabby'),
    '单膝跪地伸手': (C.walk, ('px', 128, 0), -1, 'black'),
    '盘腿坐地上': (C.curl, ('px', 4, 22), 1, 'cow'),
    '趴着撑肘': (C.sit_front, ('px', 150, 0), 1, 'black'),
    '小孩踮脚够猫': (C.sit_side, ('local', 0.0, 1.30, 0.30), -1, 'tabby'),
    '弯腰撑膝看猫': (C.sit_front, ('local', 0.0, 0.54, 0.42), 1, 'tabby'),
    '拿逗猫棒': (C.paw_up, ('px', 150, 0), -1, 'tabby'),
    '抱着猫': (C.loaf, ('px', 6, 196), 1, 'cow'),
}
cols, cw, ch = 4, 380, 470
items = poses.ALL
rows = math.ceil(len(items) / cols)
W, Hh = cols * cw, rows * ch + 40
out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{Hh}" viewBox="0 0 {W} {Hh}"><rect width="100%" height="100%" fill="{PAPER}"/>',
       '<style>text{font-family:Noto Sans SC,sans-serif;font-size:15px;fill:#5a534a}</style>']
for i, (name, fn, yaw, pl) in enumerate(items):
    cx, cy = (i % cols) * cw, (i // cols) * ch
    b = fn()
    child = b.P['HEAD'] > 0.14
    sc = 330 * (0.62 if child else 1.0)
    proj = Ortho(yaw=yaw, elev=8, scale=sc, origin=(cx + cw / 2, cy + ch - 70))
    out.append(f'<line x1="{cx+40}" x2="{cx+cw-40}" y1="{cy+ch-70}" y2="{cy+ch-70}" stroke="#b9b0a2" stroke-width="1"/>')
    out.append(props_svg(pl, proj, proj.R))
    catsvg, catz = '', None
    if name in CAT:
        cfn, pos, face, coat = CAT[name]
        c = cfn()
        hpx = sc / (1.0 if not child else 0.62)  # 每 H（成人）多少像素
        px_cm = (sc / (1.15 if child else 1.70)) / 100
        if pos[0] == 'local':
            bx, by, bz, _ = proj(np.array(pos[1:], float))
            a = proj(np.array(pos[1:], float) + np.array([0.1, 0, 0]))
            flip = face if a[0] > bx else -face
        else:
            bx, by, bz = cx + cw / 2 + pos[1], cy + ch - 70 - pos[2], (-1e9 if pos[2] > 0 else 1e9)
            flip = face
        ol = c.outline(); cxm = (ol.bounds[0] + ol.bounds[2]) / 2
        T = lambda x, y, bx=bx, by=by, f=flip, cxm=cxm: (bx + f * (x - cxm) * px_cm, by - y * px_cm * 0.98)
        catsvg = C.cat_svg(c, T, px_cm, style=CATSTYLE, coat=coat, seed=i, uid=f's{i}', ink=INK)
        catz = bz
    fig = figure_svg(b, proj, fill=INK, halo=None)
    # 猫在人前面就后画
    body_z = proj(b.chest)[2]
    if catz is not None and catz > body_z:
        out.append(catsvg); out.append(fig)
    else:
        out.append(fig); out.append(catsvg)
    out.append(f'<text x="{cx+cw/2}" y="{cy+ch-38}" text-anchor="middle">{i+1:02d} {name}</text>')
out.append('</svg>')
open(sys.argv[1], 'w').write(''.join(out))
