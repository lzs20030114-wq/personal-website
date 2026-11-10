"""姿态表里的布景细线：沙发、椅子、墙、平台（局部系，单位 H），按同一个投影画。"""
import numpy as np
from ishi import v

LINE = '#8d8478'; FACE = '#ece5d8'

def box(x0, x1, y0, y1, z0, z1):
    c = [v(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    # 面：(顶点下标, 外法向)
    F = [((0, 1, 3, 2), v(-1, 0, 0)), ((4, 6, 7, 5), v(1, 0, 0)), ((0, 4, 5, 1), v(0, -1, 0)),
         ((2, 3, 7, 6), v(0, 1, 0)), ((0, 2, 6, 4), v(0, 0, -1)), ((1, 5, 7, 3), v(0, 0, 1))]
    return [([c[i] for i in f], n) for f, n in F]

def boxes(p):
    k = p[0]
    if k == 'sofa':
        # ('sofa',) 两边都有扶手；('sofa', 1) 只画 +x 那边的（近侧的扶手会挡住坐着的人，姿态表里去掉）
        out = box(-0.42, 0.42, 0.0, 0.25, -0.34, 0.13) + box(-0.42, 0.42, 0.25, 0.50, -0.42, -0.30) + box(0.36, 0.48, 0.0, 0.36, -0.42, 0.13)
        return out if len(p) > 1 else out + box(-0.48, -0.36, 0.0, 0.36, -0.42, 0.13)
    if k == 'chair':
        out = box(-0.15, 0.15, 0.245, 0.27, -0.17, 0.12) + box(-0.15, 0.15, 0.27, 0.52, -0.19, -0.17)
        for x in (-0.14, 0.13):
            for z in (-0.17, 0.11):
                out += box(x, x + 0.012, 0.0, 0.245, z, z + 0.012)
        return out
    if k == 'wall':
        z = p[1]
        return box(-0.45, 0.45, 0.0, 1.15, z - 0.04, z)
    if k == 'plate':
        cx, top, cz, s = p[1:]
        return box(cx - s / 2, cx + s / 2, top - 0.04, top, cz - s / 2, cz + s / 2) + box(cx - 0.012, cx + 0.012, top, top + 0.5, cz - 0.012, cz + 0.012)
    return []

def props_svg(plist, proj, R):
    """R：投影用的旋转（判断面朝不朝相机）；画家算法按面中心深度从远到近"""
    faces = []
    for p in plist:
        for pts, n in boxes(p):
            if (R @ n)[2] <= 1e-6:
                continue
            q = [proj(x) for x in pts]
            faces.append((np.mean([a[2] for a in q]), q))
    faces.sort(key=lambda f: -f[0])
    out = []
    for _, q in faces:
        d = 'M' + ' L'.join(f'{a[0]:.1f},{a[1]:.1f}' for a in q) + 'Z'
        out.append(f'<path d="{d}" fill="{FACE}" stroke="{LINE}" stroke-width="1" stroke-linejoin="round"/>')
    return ''.join(out)
