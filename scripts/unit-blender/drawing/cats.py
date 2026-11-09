"""猫：用几块基本形（椭圆、两头圆的条、三角）搭出姿态，并成一个外形；三种画法：铅笔 / 线稿 / 黑剪影。

坐标：猫的局部系，单位 cm，x 向猫的前方（脸朝右），y 向上，地面 y = 0。
每块基本形带一个「毛的走向」，铅笔画的短线沿它排；花色由 tone() 决定。
"""
import math, random
import numpy as np
from shapely.geometry import Point, Polygon, LineString, MultiPoint
from shapely.ops import unary_union
from shapely import affinity


class Prim:
    def __init__(self, shape, axis, kind, center, z=0):
        self.shape, self.axis, self.kind, self.center, self.z = shape, axis, kind, center, z


def ell(cx, cy, rx, ry, rot=0):
    g = affinity.scale(Point(0, 0).buffer(1, 32), rx, ry)
    g = affinity.rotate(g, rot, origin=(0, 0))
    return affinity.translate(g, cx, cy)


def cap(a, b, r1, r2=None):
    r2 = r1 if r2 is None else r2
    return unary_union([Point(a).buffer(r1, 16), Point(b).buffer(r2, 16)]).convex_hull


def chain(pts, radii):
    return unary_union([cap(pts[i], pts[i + 1], radii[i], radii[i + 1]) for i in range(len(pts) - 1)])


def bez(p0, p1, p2, p3, n=16):
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2, p3 = map(np.array, (p0, p1, p2, p3))
    return list(map(tuple, (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3))


def unit(a, b):
    d = np.array(b, float) - np.array(a, float)
    return d / (np.linalg.norm(d) + 1e-9)


class Cat:
    def __init__(self, name):
        self.name = name
        self.prims = []      # Prim
        self.lines = []      # 内部线 [(点列, 粗细系数)]
        self.dark = []       # 实心小件：眼、鼻 [(shape)]
        self.coat = 'tabby'

    def add(self, shape, axis, kind='body', center=None, z=0):
        if kind == 'ear':
            pts = list(shape.exterior.coords)[:3]
            base = ((pts[0][0] + pts[2][0]) / 2, (pts[0][1] + pts[2][1]) / 2)
            tip = pts[1]
            tip = (base[0] + (tip[0] - base[0]) * 0.74, base[1] + (tip[1] - base[1]) * 0.74)
            a = (base[0] + (pts[0][0] - base[0]) * 1.12, base[1] + (pts[0][1] - base[1]) * 1.12)
            b = (base[0] + (pts[2][0] - base[0]) * 1.12, base[1] + (pts[2][1] - base[1]) * 1.12)
            shape = Polygon([a, tip, b])
        c = center if center is not None else shape.centroid.coords[0]
        self.prims.append(Prim(shape, unit((0, 0), axis), kind, c, z))
        return shape

    def line(self, pts, w=1.0):
        self.lines.append((pts, w))

    def outline(self, close=0.9):
        g = unary_union([p.shape for p in self.prims])
        g = g.buffer(close, 16).buffer(-close, 16)
        if g.geom_type == 'MultiPolygon':
            g = max(g.geoms, key=lambda q: q.area)
        return Polygon(g.exterior)

    def head_eye(self, hx, hy, r, facing=1.0, look=(1, 0), two=False, closed=False):
        """在头上点眼睛、鼻子。facing：头转向观者的程度（0 = 正侧面，1 = 正对）"""
        lx, ly = look
        if two:
            sep = r * 0.42 * (0.4 + 0.6 * facing)
            cx = hx + r * 0.15 * lx
            eyes = [(cx - sep, hy + r * 0.12), (cx + sep, hy + r * 0.12)]
        else:
            eyes = [(hx + r * 0.42, hy + r * 0.15)]
        for ex, ey in eyes:
            if closed:
                self.line(bez((ex - r * 0.2, ey), (ex - r * 0.08, ey - r * 0.1), (ex + r * 0.08, ey - r * 0.1), (ex + r * 0.2, ey), 8), 0.8)
            else:
                self.dark.append(ell(ex, ey, r * 0.12, r * 0.15))
        return eyes


# ------------------------------------------------------------------ 姿态
def sit_side(look_up=0.0):
    """侧面坐着，尾巴绕到前爪"""
    c = Cat('坐着（侧面）')
    c.add(ell(-1, 9, 10.5, 9.2, 0), (1, 0.6), 'body')                       # 臀
    c.add(ell(6.5, 16.5, 6.2, 10.5, -18), (0.3, 1), 'body')                   # 胸
    c.add(cap((7.5, 23), (10, 28.5), 4.6, 4.2), (0.4, 1), 'body')              # 颈
    hx, hy = 11.5, 30 + look_up * 1.5
    c.add(ell(hx, hy, 5.6, 5.0, 8 + look_up * 18), (-1, 0), 'head', center=(hx + 4, hy - 1))
    c.add(ell(hx + 4.6, hy - 1.6 + look_up * 1.2, 2.6, 2.2, 10 + look_up * 20), (-1, 0), 'head', center=(hx + 6, hy - 1.5))
    c.add(Polygon([(hx - 3.8, hy + 2.6), (hx - 2.4, hy + 8.6), (hx + 0.2, hy + 4.2)]), (0, 1), 'ear')
    c.add(Polygon([(hx + 0.6, hy + 4.4), (hx + 2.8, hy + 9.4), (hx + 4.4, hy + 3.4)]), (0, 1), 'ear')
    c.add(cap((10.2, 13.5), (11.4, 1.6), 2.4, 1.7), (0, -1), 'leg', z=1)        # 前腿
    c.add(ell(12.4, 1.15, 2.5, 1.15), (1, 0), 'leg', z=1)
    c.add(cap((7.8, 12), (8.4, 1.8), 2.0, 1.6), (0, -1), 'leg', z=-1)
    c.add(ell(9.2, 1.1, 2.3, 1.1), (1, 0), 'leg', z=-1)
    c.add(ell(1.5, 1.1, 4.6, 1.15), (1, 0), 'leg', z=1)                          # 后脚掌
    tail = bez((-10, 3.2), (-13, 0.8), (-2, -0.2), (13.5, 1.0), 14)
    c.add(chain(tail, np.linspace(2.0, 1.5, len(tail))), (1, 0), 'tail', z=2)
    c.line(bez((-1, 15.5), (5, 13.5), (6.5, 7), (4.5, 1.5), 10), 0.9)          # 大腿
    c.line(bez((9, 14.5), (8.6, 10), (8.8, 5), (9.6, 1.8), 8), 0.8)            # 前腿内侧
    c.line([(hx - 2.6, hy + 4.2), (hx - 1.8, hy + 7.0)], 0.6)
    c.line([(hx + 1.6, hy + 4.6), (hx + 2.8, hy + 7.6)], 0.6)
    c.head_eye(hx + 0.6, hy + 0.2, 5.0)
    c.dark.append(ell(hx + 7.0, hy - 0.4 + look_up, 0.6, 0.45))
    c.line(bez((hx + 6.5, hy - 2.6 + look_up), (hx + 5.5, hy - 3.2), (hx + 4.6, hy - 3.0), (hx + 4.0, hy - 2.6), 6), 0.6)
    for k in (-1, 0, 1):
        c.line([(hx + 5.2, hy - 1.6 + k * 0.6), (hx + 10.5, hy - 1.0 + k * 1.4)], 0.35)
    return c


def sit_front():
    """正面偏一点坐着，看着你（台上的猫多半这样）"""
    c = Cat('坐着（正面）')
    c.add(ell(0, 9.5, 10.5, 9.5, 0), (0, 1), 'body')
    c.add(ell(0.6, 18, 7.4, 10.5, 0), (0, 1), 'body')
    hx, hy = 0.8, 30.5
    c.add(ell(hx, hy, 6.6, 5.6, 0), (0, 1), 'head', center=(hx, hy - 2))
    c.add(ell(hx + 0.2, hy - 2.6, 3.2, 2.2), (0, -1), 'head', center=(hx, hy - 3))
    c.add(Polygon([(hx - 6.2, hy + 1.8), (hx - 5.6, hy + 9.0), (hx - 1.6, hy + 4.8)]), (0, 1), 'ear')
    c.add(Polygon([(hx + 6.4, hy + 1.8), (hx + 5.9, hy + 9.0), (hx + 1.8, hy + 4.8)]), (0, 1), 'ear')
    for s in (-1, 1):
        c.add(cap((s * 2.6, 14), (s * 2.4, 1.6), 2.3, 1.8), (0, -1), 'leg', z=1)
        c.add(ell(s * 2.6, 1.15, 2.3, 1.15), (0, -1), 'leg', z=1)
        c.add(ell(s * 7.6, 1.2, 3.2, 1.2), (s, 0), 'leg', z=0)
        c.line([(s * 1.9, 0.3), (s * 1.9, 1.3)], 0.4); c.line([(s * 3.2, 0.3), (s * 3.2, 1.3)], 0.4)
    tail = bez((8.5, 2.5), (13, 3.5), (13, -0.3), (6.5, 0.6), 10)
    c.add(chain(tail, np.linspace(2.0, 1.4, len(tail))), (0, -1), 'tail', z=2)
    c.line(bez((-7.5, 13), (-5.4, 9), (-5.6, 4), (-6.2, 1.6), 8), 0.8)
    c.line(bez((8.0, 13), (6.0, 9), (6.2, 4), (6.8, 1.6), 8), 0.8)
    c.line(bez((-0.2, 14), (0, 9), (0, 5), (0.1, 1.6), 8), 0.7)
    c.line([(hx - 5.0, hy + 3.6), (hx - 4.8, hy + 6.8)], 0.6)
    c.line([(hx + 5.2, hy + 3.6), (hx + 5.0, hy + 6.8)], 0.6)
    c.head_eye(hx, hy + 0.4, 5.6, facing=1, two=True)
    c.dark.append(Polygon([(hx - 0.7, hy - 1.6), (hx + 0.9, hy - 1.6), (hx + 0.1, hy - 2.5)]))
    c.line(bez((hx + 0.1, hy - 2.5), (hx + 0.1, hy - 3.2), (hx - 1.0, hy - 3.6), (hx - 1.8, hy - 3.2), 6), 0.6)
    c.line(bez((hx + 0.1, hy - 2.5), (hx + 0.1, hy - 3.2), (hx + 1.2, hy - 3.6), (hx + 2.0, hy - 3.2), 6), 0.6)
    for s in (-1, 1):
        for k in (-1, 0, 1):
            c.line([(hx + s * 3.0, hy - 2.4 + k * 0.5), (hx + s * 9.5, hy - 1.8 + k * 1.5)], 0.35)
    return c


def loaf():
    """揣着手趴着"""
    c = Cat('揣手趴着')
    c.add(ell(0, 7.2, 15, 7.4, 0), (1, 0), 'body')
    c.add(ell(9, 6.2, 7.5, 6.6, 0), (1, 0.2), 'body')
    hx, hy = 15.5, 13.2
    c.add(ell(hx, hy, 5.5, 4.9, 5), (-1, 0), 'head', center=(hx + 3, hy))
    c.add(ell(hx + 4.6, hy - 1.6, 2.5, 2.1, 8), (-1, 0), 'head', center=(hx + 5, hy - 1.5))
    c.add(Polygon([(hx - 3.6, hy + 2.6), (hx - 2.6, hy + 8.2), (hx + 0.3, hy + 4.2)]), (0, 1), 'ear')
    c.add(Polygon([(hx + 0.6, hy + 4.3), (hx + 2.6, hy + 9.0), (hx + 4.2, hy + 3.4)]), (0, 1), 'ear')
    c.add(ell(15.5, 1.6, 3.6, 1.7), (1, 0), 'leg', z=1)
    tail = bez((-14, 4), (-17, 1.5), (-8, 0.4), (2, 1.2), 12)
    c.add(chain(tail, np.linspace(2.0, 1.5, len(tail))), (1, 0), 'tail', z=2)
    c.line(bez((-6, 9.5), (-1.5, 9), (1, 4.5), (-1, 1.0), 10), 0.8)
    c.line([(hx - 2.4, hy + 4.0), (hx - 1.8, hy + 6.6)], 0.6)
    c.line([(hx + 1.6, hy + 4.4), (hx + 2.6, hy + 7.2)], 0.6)
    c.head_eye(hx + 0.6, hy + 0.2, 5.0, closed=True)
    c.dark.append(ell(hx + 7.0, hy - 0.5, 0.6, 0.45))
    for k in (-1, 0, 1):
        c.line([(hx + 5.0, hy - 1.6 + k * 0.6), (hx + 10, hy - 1.2 + k * 1.3)], 0.35)
    return c


def walk():
    """走着，尾巴竖起来"""
    c = Cat('走着')
    c.add(ell(0, 17, 13, 6.6, 2), (1, 0), 'body')
    c.add(ell(9, 17.5, 6.5, 7.0, -10), (1, 0), 'body')
    c.add(ell(-8, 17.5, 6.2, 6.8, 5), (1, 0), 'body')
    c.add(cap((13, 20), (17, 23.5), 4.2, 3.8), (1, 0.4), 'body')
    hx, hy = 19.5, 24.5
    c.add(ell(hx, hy, 5.4, 4.8, -5), (-1, 0), 'head', center=(hx + 3, hy))
    c.add(ell(hx + 4.6, hy - 2.0, 2.5, 2.1, -4), (-1, 0), 'head', center=(hx + 5, hy - 2))
    c.add(Polygon([(hx - 3.8, hy + 2.2), (hx - 3.2, hy + 8.0), (hx - 0.2, hy + 4.0)]), (0, 1), 'ear')
    c.add(Polygon([(hx + 0.4, hy + 4.3), (hx + 2.0, hy + 9.2), (hx + 3.8, hy + 3.6)]), (0, 1), 'ear')
    # 腿：近侧前腿往前、远侧前腿往后；后腿反过来
    c.add(chain([(11, 14), (12.5, 7), (14.5, 1.2)], [2.4, 1.9, 1.6]), (0, -1), 'leg', z=1)
    c.add(ell(15.6, 0.9, 2.2, 0.9), (1, 0), 'leg', z=1)
    c.add(chain([(7, 13), (6.8, 6.5), (5.8, 1.6)], [2.2, 1.8, 1.5]), (0, -1), 'leg', z=-1)
    c.add(ell(6.6, 0.9, 2.1, 0.9), (1, 0), 'leg', z=-1)
    c.add(chain([(-9, 14), (-4.8, 8.5), (-8.5, 4.5), (-7.6, 1.4)], [4.4, 2.2, 1.8, 1.5]), (0, -1), 'leg', z=1)
    c.add(ell(-6.6, 0.9, 2.3, 0.9), (1, 0), 'leg', z=1)
    c.add(chain([(-11, 14), (-10, 8.5), (-14, 4.6), (-15.2, 1.5)], [3.6, 2.0, 1.6, 1.4]), (0, -1), 'leg', z=-1)
    c.add(ell(-14.4, 0.9, 2.2, 0.9), (1, 0), 'leg', z=-1)
    tail = bez((-12.5, 20), (-17, 25), (-18, 33), (-14.5, 38), 12)
    c.add(chain(tail, np.linspace(2.1, 1.5, len(tail))), (0, 1), 'tail')
    c.line(bez((-12, 13), (-6.5, 15), (-4.5, 11), (-5.5, 8.8), 8), 0.8)
    c.line([(hx - 2.6, hy + 4.0), (hx - 2.2, hy + 6.6)], 0.6)
    c.head_eye(hx + 0.6, hy + 0.1, 5.0)
    c.dark.append(ell(hx + 7.0, hy - 1.0, 0.6, 0.45))
    for k in (-1, 0, 1):
        c.line([(hx + 5.0, hy - 2.1 + k * 0.6), (hx + 10, hy - 1.8 + k * 1.3)], 0.35)
    return c


def stretch():
    """伸懒腰：前腿往前伸、屁股撅起来"""
    c = Cat('伸懒腰')
    c.add(ell(-5, 14, 12, 6.8, -16), (1, -0.3), 'body')
    c.add(ell(-13, 17, 6.4, 6.6, 0), (1, 0), 'body')
    c.add(ell(5, 9.5, 6.5, 5.5, -22), (1, -0.3), 'body')
    hx, hy = 13.5, 9.0
    c.add(ell(hx, hy, 5.4, 4.8, -10), (-1, 0), 'head', center=(hx + 3, hy))
    c.add(ell(hx + 4.6, hy - 2.4, 2.4, 2.0, -12), (-1, 0), 'head', center=(hx + 5, hy - 2))
    c.add(Polygon([(hx - 4.4, hy + 1.6), (hx - 4.2, hy + 7.4), (hx - 1.0, hy + 3.8)]), (0, 1), 'ear')
    c.add(Polygon([(hx - 0.2, hy + 4.2), (hx + 1.2, hy + 9.0), (hx + 3.2, hy + 3.4)]), (0, 1), 'ear')
    c.add(chain([(6, 6), (14, 2.5), (22, 1.3)], [2.4, 1.9, 1.6]), (1, 0), 'leg', z=1)
    c.add(ell(23, 1.0, 2.3, 1.0), (1, 0), 'leg', z=1)
    c.add(chain([(4, 5.5), (11, 2.2), (18.5, 1.2)], [2.2, 1.8, 1.5]), (1, 0), 'leg', z=-1)
    c.add(chain([(-13, 14), (-10.5, 8), (-14, 4.6), (-13.5, 1.4)], [4.6, 2.2, 1.8, 1.5]), (0, -1), 'leg', z=1)
    c.add(ell(-12.6, 0.9, 2.3, 0.9), (1, 0), 'leg', z=1)
    c.add(chain([(-15, 14), (-16, 8.5), (-19, 4.6), (-19.6, 1.5)], [3.8, 2.0, 1.6, 1.4]), (0, -1), 'leg', z=-1)
    tail = bez((-18, 20), (-22, 26), (-29, 26), (-31, 21), 12)
    c.add(chain(tail, np.linspace(2.0, 1.4, len(tail))), (-1, 0), 'tail')
    c.line(bez((-18, 12), (-12, 16), (-9, 11), (-10.5, 8.5), 8), 0.8)
    c.head_eye(hx + 0.6, hy + 0.1, 5.0, closed=True)
    c.dark.append(ell(hx + 6.8, hy - 1.6, 0.6, 0.45))
    return c


def curl():
    """蜷成一团睡（略带俯视）"""
    c = Cat('蜷着睡')
    c.add(ell(0, 7.0, 13.5, 7.2, 0), (1, 0.3), 'body')
    c.add(ell(-4, 8.5, 9, 6, 10), (1, 0.3), 'body')
    hx, hy = 8.0, 7.6
    c.add(ell(hx, hy, 5.4, 4.6, -18), (1, 0.5), 'head', center=(hx, hy))
    c.add(Polygon([(hx - 2.2, hy + 3.4), (hx - 0.2, hy + 8.6), (hx + 1.8, hy + 3.8)]), (0, 1), 'ear')
    c.add(Polygon([(hx + 2.6, hy + 2.6), (hx + 6.0, hy + 6.8), (hx + 5.6, hy + 1.2)]), (0, 1), 'ear')
    tail = bez((-12, 4), (-11, -0.5), (2, -0.6), (12.5, 2.6), 14)
    c.add(chain(tail, np.linspace(2.2, 1.7, len(tail))), (1, 0), 'tail', z=2)
    c.add(ell(12.0, 4.0, 2.6, 1.6, 30), (1, 0), 'leg', z=1)
    c.line(bez((-11.5, 10), (-6, 13.6), (2, 12.5), (3.5, 9.5), 10), 0.8)
    c.head_eye(hx + 1.2, hy - 0.6, 4.6, closed=True)
    c.dark.append(ell(hx + 4.2, hy - 2.8, 0.55, 0.45))
    return c


def paw_up():
    """坐着抬起一只前爪去够逗猫棒"""
    c = sit_side(look_up=1.0)
    c.name = '抬爪够逗猫棒'
    # 去掉近侧前腿，换成抬起来的
    c.prims = [p for p in c.prims if not (p.kind == 'leg' and p.z == 1 and p.center[0] > 9.5)]
    c.add(chain([(10.2, 18), (16.5, 20.5), (21.5, 24.5)], [2.4, 1.9, 1.6]), (1, 0.6), 'leg', z=1)
    c.add(ell(22.4, 25.4, 1.9, 1.6, 40), (1, 0.6), 'leg', z=1)
    c.lines = [l for l in c.lines if not (abs(l[0][0][0] - 9) < 0.01)]
    return c


def lie_side():
    """侧躺，肚皮朝外（被摸的时候）"""
    c = Cat('侧躺')
    c.add(ell(0, 5.8, 14.5, 5.8, 0), (1, 0), 'body')
    c.add(ell(8, 6.5, 7, 6.2, 0), (1, 0), 'body')
    hx, hy = 16.5, 7.5
    c.add(ell(hx, hy, 5.2, 4.8, -60), (-1, 0), 'head', center=(hx + 2, hy))
    c.add(ell(hx + 2.6, hy - 3.6, 2.4, 2.0, -60), (-1, 0), 'head', center=(hx + 2, hy - 3))
    c.add(Polygon([(hx - 3.6, hy + 2.6), (hx - 3.0, hy + 8.0), (hx + 0.2, hy + 4.4)]), (0, 1), 'ear')
    c.add(Polygon([(hx + 1.4, hy + 3.6), (hx + 4.2, hy + 8.4), (hx + 5.0, hy + 2.4)]), (0, 1), 'ear')
    c.add(chain([(9, 4), (14, 8), (17, 13)], [2.2, 1.8, 1.6]), (1, 1), 'leg', z=1)
    c.add(chain([(8, 3), (14, 2.5), (19.5, 4.2)], [2.1, 1.7, 1.5]), (1, 0), 'leg', z=-1)
    c.add(chain([(-8, 6), (-3, 10), (-6.5, 14.5)], [4.4, 2.0, 1.6]), (0, 1), 'leg', z=1)
    c.add(chain([(-9, 3.5), (-13, 2.4), (-20, 2.6)], [3.6, 1.9, 1.5]), (-1, 0), 'leg', z=-1)
    tail = bez((-13.5, 5), (-19, 7), (-24, 5), (-27, 8.5), 12)
    c.add(chain(tail, np.linspace(2.0, 1.4, len(tail))), (-1, 0), 'tail')
    c.line(bez((-12, 8.5), (-6, 11.5), (-3.5, 7.5), (-6, 3.0), 10), 0.8)
    c.head_eye(hx + 1.4, hy - 0.4, 4.6, closed=False)
    return c


ALL = [sit_front, sit_side, loaf, walk, stretch, curl, paw_up, lie_side]


# ------------------------------------------------------------------ 花色
def tone_fn(cat, coat, outline, seed=0):
    rng = random.Random(seed)
    minx, miny, maxx, maxy = outline.bounds
    patches = [(rng.uniform(minx, maxx), rng.uniform(miny, maxy), rng.uniform(3, 7)) for _ in range(6)]

    def tone(x, y, prim):
        h = (y - miny) / max(maxy - miny, 1e-6)
        shade = 0.22 * (1 - h) ** 1.5                     # 下半身暗一点
        if prim.z < 0:
            shade += 0.18                                    # 远侧的腿
        ax = prim.axis
        u = (x - prim.center[0]) * ax[0] + (y - prim.center[1]) * ax[1]
        w = -(x - prim.center[0]) * ax[1] + (y - prim.center[1]) * ax[0]
        if coat == 'white':
            base = 0.06
        elif coat == 'black':
            base = 0.97 - 0.3 * max(0, h - 0.65)
        elif coat == 'tabby':
            base = 0.28
            period = 3.6 if prim.kind in ('body', 'head') else 2.6
            stripe = math.sin(u * 2 * math.pi / period + 0.6 * math.sin(w * 0.35)) if prim.kind != 'head' else math.sin(w * 2 * math.pi / 2.2)
            if stripe > 0.3:
                base += 0.5
            if prim.kind == 'head' and h > 0.75:
                base -= 0.1
        elif coat == 'cow':
            base = 0.05
            for px, py, pr in patches:
                if (x - px) ** 2 + (y - py) ** 2 < pr ** 2:
                    base = 0.97
            if prim.kind == 'head' and abs(x - prim.center[0]) < 1.6 and y < prim.center[1] + 2:
                base = 0.05
        elif coat == 'tux':
            base = 0.82
            if (prim.kind == 'leg' and y < 2.6) or (prim.kind == 'body' and y < 22 and x > 4 and prim.axis[1] > 0.5):
                base = 0.05
        return min(1.0, base + shade)
    return tone


def prim_at(cat, x, y):
    best = None
    for p in sorted(cat.prims, key=lambda q: -q.z):
        if p.shape.contains(Point(x, y)):
            return p
        d = p.shape.distance(Point(x, y))
        if best is None or d < best[0]:
            best = (d, p)
    return best[1]


# ------------------------------------------------------------------ 画
def jitter_path(pts, amp, rng, freq=0.35):
    """沿线加低频抖动（铅笔线不完全落在一条线上）"""
    pts = np.array(pts, float)
    out = []
    ph = rng.uniform(0, 6.28)
    acc = 0
    for i, p in enumerate(pts):
        if i:
            acc += np.linalg.norm(p - pts[i - 1])
        nrm = np.array([0.0, 0.0])
        if 0 < i < len(pts) - 1:
            d = pts[i + 1] - pts[i - 1]
            nrm = np.array([-d[1], d[0]]) / (np.linalg.norm(d) + 1e-9)
        out.append(p + nrm * amp * math.sin(acc * freq + ph))
    return out


def resample(coords, step):
    ls = LineString(coords)
    n = max(2, int(ls.length / step))
    return [ls.interpolate(i / n, normalized=True).coords[0] for i in range(n + 1)]


def to_screen(T, pts):
    return [T(x, y) for x, y in pts]


def d_of(pts):
    return 'M' + ' L'.join(f'{x:.2f},{y:.2f}' for x, y in pts)


def cat_svg(cat, T, sc, style='pencil', coat='tabby', ink='#2b2723', seed=1, uid='c'):
    """T(x, y) → 屏幕坐标；sc = 每 cm 多少像素"""
    rng = random.Random(seed)
    ol = cat.outline()
    outer = list(ol.exterior.coords)
    out = []
    if style == 'silhouette':
        out.append(f'<path d="{d_of(to_screen(T, outer))}Z" fill="{ink}"/>')
        return ''.join(out)
    if style == 'line':
        fill = '#fbf8f2'
        out.append(f'<path d="{d_of(to_screen(T, outer))}Z" fill="{fill}" stroke="{ink}" stroke-width="{max(0.9, 0.11 * sc):.2f}" stroke-linejoin="round"/>')
        for pts, w in cat.lines:
            if w < 0.5:
                continue
            seg = [p for p in pts]
            out.append(f'<path d="{d_of(to_screen(T, seg))}" fill="none" stroke="{ink}" stroke-width="{max(0.6, 0.075 * sc * w):.2f}" stroke-linecap="round"/>')
        for g in cat.dark:
            out.append(f'<path d="{d_of(to_screen(T, list(g.exterior.coords)))}Z" fill="{ink}"/>')
        return ''.join(out)
    # 铅笔：裁在外形里的短线（顺毛）+ 两三遍略微错开的外形线
    graphite = '#35312c'
    clip = f'clip{uid}'
    out.append(f'<clipPath id="{clip}"><path d="{d_of(to_screen(T, outer))}Z"/></clipPath>')
    under = {'black': 0.62, 'tabby': 0.10, 'tux': 0.4}.get(coat, 0.0)
    if under:
        out.append(f'<path d="{d_of(to_screen(T, outer))}Z" fill="{graphite}" fill-opacity="{under}"/>')
    tone = tone_fn(cat, coat, ol, seed)
    minx, miny, maxx, maxy = ol.bounds
    area = ol.area
    n = int(area * 5.5)
    strokes = []
    for _ in range(n):
        x, y = rng.uniform(minx, maxx), rng.uniform(miny, maxy)
        if not ol.contains(Point(x, y)):
            continue
        p = prim_at(cat, x, y)
        t = tone(x, y, p)
        # 贴着外形的一圈多给一点线，白猫也有体积
        edge = max(0.0, 1.0 - ol.exterior.distance(Point(x, y)) / 1.6)
        t2 = min(1.0, t + 0.22 * edge)
        if rng.random() > t2 * 0.9 + 0.02:
            continue
        ax = p.axis
        a = math.atan2(ax[1], ax[0]) + rng.gauss(0, 0.2)
        if p.kind == 'head':
            a = math.atan2(y - p.center[1], x - p.center[0]) + math.pi + rng.gauss(0, 0.3)
        L = rng.uniform(0.8, 1.9) * (1.0 + 0.6 * t)
        x2, y2 = x + math.cos(a) * L, y + math.sin(a) * L
        op = 0.22 + 0.7 * t2
        strokes.append(((x, y), (x2, y2), op))
    sw = max(0.4, 0.06 * sc)
    for a, b, op in strokes:
        (x1, y1), (x2, y2) = T(*a), T(*b)
        out.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{graphite}" stroke-opacity="{op:.2f}" stroke-width="{sw:.2f}" stroke-linecap="round" clip-path="url(#{clip})"/>')
    # 外形线：两遍，抖一点、断几处
    for k in range(2):
        pts = resample(outer, 0.8)
        pts = jitter_path(pts, 0.18 + 0.1 * k, rng, 0.5)
        # 断开：每 25–40 点断一个小口
        i = 0
        while i < len(pts) - 2:
            j = min(len(pts) - 1, i + rng.randint(18, 40))
            seg = to_screen(T, pts[i:j + 1])
            out.append(f'<path d="{d_of(seg)}" fill="none" stroke="{graphite}" stroke-opacity="{0.75 - 0.25 * k:.2f}" stroke-width="{max(0.5, 0.075 * sc):.2f}" stroke-linecap="round"/>')
            i = j + (1 if rng.random() < 0.7 else 2)
    for pts, w in cat.lines:
        pts2 = jitter_path(resample(pts, 0.6), 0.12, rng, 0.6)
        out.append(f'<path d="{d_of(to_screen(T, pts2))}" fill="none" stroke="{graphite}" stroke-opacity="{0.55 if w > 0.5 else 0.35:.2f}" stroke-width="{max(0.4, 0.06 * sc * w):.2f}" stroke-linecap="round"/>')
    for g in cat.dark:
        out.append(f'<path d="{d_of(to_screen(T, list(g.exterior.coords)))}Z" fill="{graphite}" fill-opacity="0.85"/>')
    return ''.join(out)
