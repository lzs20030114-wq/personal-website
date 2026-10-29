"""六单元环的线稿 + 平涂渲染（numpy z-buffer，正交投影）。"""

from __future__ import annotations

import math

import numpy as np
from PIL import Image

import geom as G

COL = {
    "wood": (0.91, 0.85, 0.74),
    "core": (0.85, 0.77, 0.62),
    "skinA": (0.66, 0.76, 0.81),
    "skinB": (0.72, 0.83, 0.77),
    "hoop": (0.24, 0.42, 0.48),
    "tie": (0.12, 0.17, 0.21),
    "bond": (0.88, 0.47, 0.20),
}
LINE = np.array([0.11, 0.17, 0.21])


# ---- 网格 --------------------------------------------------------------------------
class Mesh:
    def __init__(self):
        self.tris, self.cols, self.ids = [], [], []
        self.next_id = 1

    def face(self, poly3, col):
        """平面多边形（凸或经耳切），一个 id。"""
        fid = self.next_id
        self.next_id += 1
        for a, b, c in triangulate3(poly3):
            self.tris.append((a, b, c))
            self.cols.append(col)
            self.ids.append(fid)

    def prism(self, poly2, frame, z0, z1, col):
        """平面多边形 poly2 (u, v) 沿第三轴 [z0, z1] 拉伸；frame(u, v, w) → 世界点。"""
        bot = [frame(u, v, z0) for u, v in poly2]
        top = [frame(u, v, z1) for u, v in poly2]
        self.face(bot[::-1], col)
        self.face(top, col)
        n = len(poly2)
        for i in range(n):
            j = (i + 1) % n
            self.face([bot[i], bot[j], top[j], top[i]], col)


def _area2(poly):
    return sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
               for i in range(len(poly)))


def ear_clip(poly2):
    pts = list(range(len(poly2)))
    P = poly2
    if _area2(P) < 0:
        pts.reverse()
    out = []

    def inside(p, a, b, c):
        def cr(o, x, y):
            return (x[0] - o[0]) * (y[1] - o[1]) - (x[1] - o[1]) * (y[0] - o[0])
        return cr(a, b, p) > 1e-12 and cr(b, c, p) > 1e-12 and cr(c, a, p) > 1e-12

    guard = 0
    while len(pts) > 3 and guard < 10000:
        guard += 1
        for k in range(len(pts)):
            ia, ib, ic = pts[k - 1], pts[k], pts[(k + 1) % len(pts)]
            a, b, c = P[ia], P[ib], P[ic]
            if (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 1e-12:
                continue
            if any(inside(P[m], a, b, c) for m in pts if m not in (ia, ib, ic)):
                continue
            out.append((ia, ib, ic))
            pts.pop(k)
            break
        else:
            break
    if len(pts) == 3:
        out.append(tuple(pts))
    return out


def triangulate3(poly3):
    poly3 = [np.asarray(p, float) for p in poly3]
    if len(poly3) == 3:
        return [tuple(poly3)]
    n = np.cross(poly3[1] - poly3[0], poly3[2] - poly3[0])
    k = 2
    while np.linalg.norm(n) < 1e-9 and k + 1 < len(poly3):
        n = np.cross(poly3[1] - poly3[0], poly3[k + 1] - poly3[0])
        k += 1
    ax = int(np.argmax(np.abs(n)))
    keep = [i for i in range(3) if i != ax]
    p2 = [(p[keep[0]], p[keep[1]]) for p in poly3]
    tri = ear_clip(p2)
    return [(poly3[a], poly3[b], poly3[c]) for a, b, c in tri]


# ---- 环的模型 ----------------------------------------------------------------------
def unit_frame(k):
    a = k * math.pi / 3
    n = np.array([math.cos(a), math.sin(a), 0.0])
    t = np.array([-math.sin(a), math.cos(a), 0.0])

    def f(r, s, w):
        return r * n + w * t + np.array([0, 0, G.UNIT_H - s])
    return f


def _bar(m, f, p, q, w, half, col):
    """剖面里 p→q 的一根细线（截面 half×2 见方），放在切向 w 处。"""
    (r0, s0), (r1, s1) = p, q
    L = math.hypot(r1 - r0, s1 - s0)
    ur, us = (r1 - r0) / L, (s1 - s0) / L
    nr, ns = -us * half, ur * half
    poly = [(r0 + nr, s0 + ns), (r1 + nr, s1 + ns), (r1 - nr, s1 - ns), (r0 - nr, s0 - ns)]
    m.prism(poly, f, w - half, w + half, col)


def build_ring(units=range(G.N_UNITS), core=True, hoops=True, ties=True, bd=False):
    m = Mesh()
    hw = G.W / 2
    for k in units:
        f = unit_frame(k)
        for name, (r0, r1, s0, s1) in G.BOARDS_FOLDED.items():
            m.prism([(r0, s0), (r1, s0), (r1, s1), (r0, s1)], f, -hw, hw, COL["wood"])
        for name, rects in G.SKIN_FOLDED.items():
            col = COL["skinA"] if name.startswith("A") else COL["skinB"]
            for r0, r1, s0, s1 in rects:
                m.prism([(r0, s0), (r1, s0), (r1, s1), (r0, s1)], f, -hw, hw, col)
        if ties:
            # 键：箱子里的斜线
            for y in G.BOND_Y:
                w = y - hw
                _bar(m, f, *G.BOND_AC, w, 0.45, COL["bond"])
                if bd:
                    _bar(m, f, *G.BOND_BD, w, 0.45, COL["bond"])
            # 露在外面的针脚：端板上一竖针、台面与底面上一横针
            for sc in G.STITCH_S:
                rr = G.OUTER_WALL
                m.prism([(rr, sc - G.STITCH_DS), (rr + 0.5, sc - G.STITCH_DS),
                         (rr + 0.5, sc + G.STITCH_DS), (rr, sc + G.STITCH_DS)], f, -0.6, 0.6, COL["tie"])
            (ra, _), (rc, _) = G.BOND_AC
            for y in G.BOND_Y:
                w = y - hw
                ss = G.PLATFORM_TOP_S
                m.prism([(ra - 0.6, ss - 0.5), (ra + 0.6, ss - 0.5), (ra + 0.6, ss), (ra - 0.6, ss)],
                        f, w - G.BOND_DY, w + G.BOND_DY, COL["tie"])
                ss = G.PLATFORM_BOT_S
                m.prism([(rc - 0.6, ss), (rc + 0.6, ss), (rc + 0.6, ss + 0.5), (rc - 0.6, ss + 0.5)],
                        f, w - G.BOND_DY, w + G.BOND_DY, COL["tie"])
    if core:
        ident = lambda u, v, w: np.array([u, v, w])
        for sp in G.PLATE_S:
            z0 = G.UNIT_H - sp - G.T_BOARD / 2
            m.prism(G.plate_outline(0.0), ident, z0, z0 + G.T_BOARD, COL["core"])
        rd = G.DOWEL_D / 2
        circ = [(rd * math.cos(2 * math.pi * i / 20), rd * math.sin(2 * math.pi * i / 20)) for i in range(20)]
        m.prism(circ, ident, 0.0, G.UNIT_H, COL["core"])
    if hoops:
        pts = G.HOOP["pts"]
        for sp in G.HOOP_S:
            zc = G.UNIT_H - sp
            n = len(pts)
            for i in range(n):
                p, q = np.array(pts[i]), np.array(pts[(i + 1) % n])
                d = q - p
                L = np.linalg.norm(d)
                d /= L
                out = np.array([d[1], -d[0]])
                if np.dot(out, (p + q) / 2) < 0:
                    out = -out
                o = p - out * 0.5
                poly = [(0, -0.5), (L, -0.5), (L, 0.5), (0, 0.5)]

                def fr(u, v, w, o=o, d=d, out=out, zc=zc):
                    xy = o + d * u + out * (v + 0.5)
                    return np.array([xy[0], xy[1], zc + w])
                m.prism(poly, fr, -G.HOOP_W / 2, G.HOOP_W / 2, COL["hoop"])
    return m


# ---- 光栅化 -----------------------------------------------------------------------
def camera(az_deg, el_deg):
    az, el = math.radians(az_deg), math.radians(el_deg)
    fwd = -np.array([math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)])
    right = np.cross(fwd, [0, 0, 1.0])
    right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    return right, up, fwd


def render(mesh, az=-28.0, el=24.0, px_per_mm=5.0, ss=2, pad=12, light=(-0.45, -0.75, 0.9)):
    right, up, fwd = camera(az, el)
    T = np.array(mesh.tris)                     # (n, 3, 3)
    X = T @ right
    Y = T @ up
    Z = T @ fwd                                 # 越大越远
    s = px_per_mm * ss
    x0, y1 = X.min() - pad, Y.max() + pad
    W = int(math.ceil((X.max() + pad - x0) * s))
    H = int(math.ceil((y1 - (Y.min() - pad)) * s))
    PX = (X - x0) * s
    PY = (y1 - Y) * s
    zbuf = np.full((H, W), np.inf)
    ibuf = np.zeros((H, W), np.int32)
    cbuf = np.ones((H, W, 3))
    L = np.array(light, float)
    L /= np.linalg.norm(L)
    for k in range(len(T)):
        xs, ys, zs = PX[k], PY[k], Z[k]
        nrm = np.cross(T[k][1] - T[k][0], T[k][2] - T[k][0])
        nn = np.linalg.norm(nrm)
        if nn < 1e-12:
            continue
        nrm /= nn
        if np.dot(nrm, fwd) > 0:
            nrm = -nrm
        shade = 0.62 + 0.38 * max(0.0, float(np.dot(nrm, L)))
        col = np.clip(np.array(mesh.cols[k]) * shade, 0, 1)
        bx0, bx1 = int(max(0, math.floor(xs.min()))), int(min(W - 1, math.ceil(xs.max())))
        by0, by1 = int(max(0, math.floor(ys.min()))), int(min(H - 1, math.ceil(ys.max())))
        if bx1 < bx0 or by1 < by0:
            continue
        gx, gy = np.meshgrid(np.arange(bx0, bx1 + 1) + 0.5, np.arange(by0, by1 + 1) + 0.5)
        (ax, ay), (bxx, byy), (cx, cy) = zip(xs, ys)
        den = (byy - cy) * (ax - cx) + (cx - bxx) * (ay - cy)
        if abs(den) < 1e-12:
            continue
        w0 = ((byy - cy) * (gx - cx) + (cx - bxx) * (gy - cy)) / den
        w1 = ((cy - ay) * (gx - cx) + (ax - cx) * (gy - cy)) / den
        w2 = 1 - w0 - w1
        inside = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
        if not inside.any():
            continue
        z = w0 * zs[0] + w1 * zs[1] + w2 * zs[2]
        sub = zbuf[by0:by1 + 1, bx0:bx1 + 1]
        upd = inside & (z < sub - 1e-6)
        sub[upd] = z[upd]
        ibuf[by0:by1 + 1, bx0:bx1 + 1][upd] = mesh.ids[k]
        cbuf[by0:by1 + 1, bx0:bx1 + 1][upd] = col
    # 线：面 id 变化处
    e = np.zeros((H, W), bool)
    e[:, 1:] |= ibuf[:, 1:] != ibuf[:, :-1]
    e[1:, :] |= ibuf[1:, :] != ibuf[:-1, :]
    ed = e.copy()
    ed[:, 1:] |= e[:, :-1]
    ed[1:, :] |= e[:-1, :]
    img = cbuf.copy()
    img[ed] = LINE
    im = Image.fromarray((img * 255).astype(np.uint8))
    im = im.resize((W // ss, H // ss), Image.LANCZOS)
    return im, {"mm_per_px": 1 / px_per_mm, "size": (W // ss, H // ss)}


if __name__ == "__main__":
    import sys
    out = sys.argv[1]
    im, info = render(build_ring())
    im.save(out)
    print(info)
