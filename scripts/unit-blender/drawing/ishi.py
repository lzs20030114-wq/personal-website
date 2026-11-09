"""石上纯也式黑色小人：3D 骨架 + IK 摆姿态，投影后把各段身体并成一个剪影。

坐标（人的局部系，单位 = 身高 H）：x 向人的左边，y 向上，z 向前（面朝 +z）。
比例取 Drillis & Contini（站上 figure.ts 同一份），再按石上纯也模型里那种细长的人收窄：头小、肩窄、四肢细。
"""
import math
import numpy as np
from shapely.geometry import Point, Polygon, MultiPoint, LineString
from shapely.ops import unary_union

# ---------------------------------------------------------------- 向量
def v(*a):
    return np.array(a, dtype=float)

def norm(a):
    n = np.linalg.norm(a)
    return a / n if n > 1e-12 else a

def rx(d):
    t = math.radians(d); c, s = math.cos(t), math.sin(t)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])  # +y → +z

def ry(d):
    t = math.radians(d); c, s = math.cos(t), math.sin(t)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])  # +z → +x

def rz(d):
    t = math.radians(d); c, s = math.cos(t), math.sin(t)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])  # +x → +y

def ortho_to(p, d):
    p = p - d * np.dot(p, d)
    return norm(p)

def ik2(a, t, l1, l2, pole):
    d0 = t - a
    dist = np.linalg.norm(d0)
    dr = d0 / max(dist, 1e-9)
    d = min(max(dist, abs(l1 - l2) + 1e-6), l1 + l2 - 1e-6)
    x = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(0.0, l1 * l1 - x * x))
    j = a + dr * x + ortho_to(np.asarray(pole, float), dr) * h
    end = j + norm(t - j) * l2
    return j, end

# ---------------------------------------------------------------- 比例
ADULT = dict(
    UA=0.180, FA=0.152, HAND=0.048, TH=0.258, SH=0.258, ANK=0.036, FOOT=0.115, HEEL=0.024,
    HIPX=0.042, SHX=0.080, HEAD=0.104, HEADW=0.068, NECK=0.026,
    # 剪影半径（占 H）：比真人细一截，石上纯也模型里那种细长的人
    r_ua=(0.0155, 0.0115), r_fa=(0.0115, 0.0078), r_hand=(0.0085, 0.0065),
    r_th=(0.027, 0.0165), r_sh=(0.0155, 0.0085), r_foot=(0.0085, 0.0055),
    r_neck=0.0155,
    hip=(0.064, 0.046), waist=(0.047, 0.037), chest=(0.062, 0.043), shoulder=(0.066, 0.030),
)

CHILD = dict(ADULT)
CHILD.update(
    UA=0.165, FA=0.135, HAND=0.050, TH=0.215, SH=0.215, FOOT=0.115,
    HIPX=0.045, SHX=0.082, HEAD=0.160, HEADW=0.115, NECK=0.03,
    r_ua=(0.019, 0.015), r_fa=(0.0145, 0.011), r_th=(0.032, 0.022), r_sh=(0.021, 0.013), r_neck=0.017,
    hip=(0.072, 0.052), waist=(0.064, 0.048), chest=(0.072, 0.05), shoulder=(0.076, 0.04),
)


class Body:
    """一个摆好姿态的人：只存关节点和附件，形状在 silhouette() 里生成。"""

    def __init__(self, P=ADULT):
        self.P = P
        self.pelvis = v(0, 0.54, 0)
        self.Rp = np.eye(3)
        self.Rc = np.eye(3)
        self.Rh = np.eye(3)
        self.extra = []      # 额外零件：('cap', a, b, r1, r2) / ('poly3', pts) / ('line', pts, w)
        self.clothes = {}
        self.hair = 'short'
        self.hat = None

    # 躯干：pelvis 位置 + 骨盆朝向（yaw 转身, tilt 侧倾, pitch 前倾），胸相对骨盆（bend 前弯, side 侧弯, twist 扭）
    def trunk(self, pelvis=None, yaw=0, tilt=0, pitch=0, bend=0, side=0, twist=0, nod=0, htilt=0, turn=0):
        if pelvis is not None:
            self.pelvis = v(*pelvis)
        self.Rp = ry(yaw) @ rz(tilt) @ rx(pitch)
        self.Rl = self.Rp @ ry(twist * 0.4) @ rz(side * 0.5) @ rx(bend * 0.45)
        self.Rc = self.Rp @ ry(twist) @ rz(side) @ rx(bend)
        self.Rh = self.Rc @ ry(turn) @ rz(htilt) @ rx(nod)
        P = self.P
        self.lumbar = self.pelvis + self.Rp @ v(0, 0.075, 0)
        self.chest = self.lumbar + self.Rl @ v(0, 0.12, 0)
        self.neckb = self.chest + self.Rc @ v(0, 0.125, 0.0)
        self.sh = {s: self.chest + self.Rc @ v(s * P['SHX'], 0.092, -0.004) for s in (1, -1)}
        self.hipj = {s: self.pelvis + self.Rp @ v(s * P['HIPX'], -0.012, 0) for s in (1, -1)}
        self.head_c = self.neckb + self.Rc @ v(0, 0.02, 0.0) + self.Rh @ v(0, P['NECK'] + P['HEAD'] * 0.42, 0.012)
        return self

    def leg(self, s, ankle, knee_pole=(0, 0, 1), foot=None, toe_pitch=0):
        """ankle：踝目标（局部系）；foot：脚尖方向（水平向量，缺省 = 骨盆前方）；toe_pitch：脚尖朝下的角度（踮脚为正）"""
        P = self.P
        knee, ank = ik2(self.hipj[s], v(*ankle), P['TH'], P['SH'], self.Rp @ v(*knee_pole) if knee_pole is not None else v(0, 0, 1))
        if foot is None:
            f = self.Rp @ v(0, 0, 1)
            f = norm(v(f[0], 0, f[2]) + v(s * 0.12, 0, 0))
        else:
            f = norm(v(*foot))
        t = math.radians(toe_pitch)
        fd = norm(f * math.cos(t) + v(0, -math.sin(t), 0))
        toe = ank + fd * P['FOOT'] + v(0, -0.018 * math.cos(t), 0)
        heel = ank - fd * P['HEEL'] + v(0, -0.02, 0)
        if not hasattr(self, 'legs'):
            self.legs = {}
        self.legs[s] = dict(hip=self.hipj[s], knee=knee, ankle=ank, toe=toe, heel=heel)
        return self

    def leg_fk(self, s, knee, ankle, **kw):
        """直接给膝、踝（坐姿用：仿真已经解好了）"""
        P = self.P
        knee = v(*knee); ank = v(*ankle)
        f = kw.get('foot')
        f = norm(v(*f)) if f is not None else norm(v((ank - knee)[0], 0, (ank - knee)[2]) + self.Rp @ v(0, 0, 0.6))
        t = math.radians(kw.get('toe_pitch', 0))
        fd = norm(f * math.cos(t) + v(0, -math.sin(t), 0))
        toe = ank + fd * P['FOOT'] + v(0, -0.018 * math.cos(t), 0)
        heel = ank - fd * P['HEEL'] + v(0, -0.02, 0)
        if not hasattr(self, 'legs'):
            self.legs = {}
        self.legs[s] = dict(hip=self.hipj[s], knee=knee, ankle=ank, toe=toe, heel=heel)
        return self

    def arm(self, s, wrist, elbow_pole=(0, -1, -0.3), hand=None, rel='body'):
        """wrist：腕目标（rel='body' 局部系 / 'chest' 胸的系里相对肩）；hand：手指方向（缺省沿前臂，稍下垂）"""
        P = self.P
        S = self.sh[s]
        w = v(*wrist)
        if rel == 'chest':
            w = S + self.Rc @ w
        pole = self.Rc @ v(*elbow_pole)
        elbow, wr = ik2(S, w, P['UA'], P['FA'], pole)
        hd = norm(v(*hand)) if hand is not None else norm(norm(wr - elbow) + v(0, -0.25, 0))
        if not hasattr(self, 'arms'):
            self.arms = {}
        self.arms[s] = dict(sh=S, elbow=elbow, wrist=wr, tip=wr + hd * P['HAND'])
        return self

    # 附件
    def cap(self, a, b, r1, r2=None):
        self.extra.append(('cap', v(*a), v(*b), r1, r1 if r2 is None else r2))
        return self

    def line(self, pts, w):
        self.extra.append(('line', [v(*p) for p in pts], w))
        return self

    def blob(self, c, r):
        self.extra.append(('cap', v(*c), v(*c), r, r))
        return self


# ---------------------------------------------------------------- 投影与剪影
class Ortho:
    """正交视图：先把人转 yaw（绕竖轴），再从上方 elev 度俯看。返回 (屏幕 x, 屏幕 y 向下, 深度, 每 H 多少像素)"""

    def __init__(self, yaw=30, elev=8, scale=300.0, origin=(0, 0)):
        self.R = rx(elev) @ ry(yaw)
        self.s = scale
        self.o = origin

    def __call__(self, p):
        q = self.R @ p
        return self.o[0] + q[0] * self.s, self.o[1] - q[1] * self.s, -q[2], self.s


def ring(c, R, hw, hd, n=14):
    return [c + R @ v(hw * math.cos(t), 0, hd * math.sin(t)) for t in np.linspace(0, 2 * math.pi, n, endpoint=False)]


def hull2(proj, pts3):
    pts = [proj(p)[:2] for p in pts3]
    return MultiPoint(pts).convex_hull


def capsule2(proj, a, b, r1, r2):
    pa = proj(a); pb = proj(b)
    c1 = Point(pa[0], pa[1]).buffer(r1 * pa[3], 12)
    c2 = Point(pb[0], pb[1]).buffer(r2 * pb[3], 12)
    return unary_union([c1, c2]).convex_hull


def ellipsoid2(proj, c, R, rx_, ry_, rz_, n=10):
    pts = []
    for i in range(n):
        th = math.pi * (i + 0.5) / n
        for j in range(2 * n):
            ph = 2 * math.pi * j / (2 * n)
            pts.append(c + R @ v(rx_ * math.sin(th) * math.cos(ph), ry_ * math.cos(th), rz_ * math.sin(th) * math.sin(ph)))
    return hull2(proj, pts)


def parts(b: Body, proj):
    """返回 [(组名, 深度, shapely 形)]；组 = 远侧胳膊 / 远侧腿 / 身子 / 近侧腿 / 近侧胳膊 / 附件"""
    P = b.P
    out = []
    # 躯干：骨盆 → 腰 → 胸 → 肩，相邻两圈取凸包
    Rw = b.Rl
    rings = [
        ring(b.pelvis + b.Rp @ v(0, -0.02, 0), b.Rp, *P['hip']),
        ring(b.lumbar + Rw @ v(0, 0.03, 0), Rw, *P['waist']),
        ring(b.chest + b.Rc @ v(0, 0.04, 0.004), b.Rc, *P['chest']),
        ring(b.chest + b.Rc @ v(0, 0.075, -0.004), b.Rc, *P['shoulder']),
    ]
    torso = [hull2(proj, rings[i] + rings[i + 1]) for i in range(3)]
    neck = capsule2(proj, b.neckb, b.head_c - b.Rh @ v(0, P['HEAD'] * 0.35, 0), P['r_neck'], P['r_neck'] * 0.9)
    head = ellipsoid2(proj, b.head_c, b.Rh, P['HEADW'] / 2, P['HEAD'] / 2, P['HEADW'] / 2 * 1.08)
    # 斜方肌：颈根到肩关节，肩是斜的，不是衣架
    trap = [capsule2(proj, b.neckb + b.Rc @ v(0, -0.005, -0.004), b.sh[s] + b.Rc @ v(-s * 0.004, -0.004, 0), P['r_neck'] * 1.25, P['r_ua'][0] * 0.95) for s in (1, -1)]
    body_shapes = torso + trap + [neck, head]
    body_shapes += hair_shapes(b, proj)
    body_shapes += clothes_shapes(b, proj)
    dz = lambda p: proj(p)[2]
    out.append(('body', dz(b.chest), unary_union(body_shapes)))
    for s, L in getattr(b, 'legs', {}).items():
        shp = [capsule2(proj, L['hip'], L['knee'], *P['r_th']), capsule2(proj, L['knee'], L['ankle'], *P['r_sh']),
               capsule2(proj, L['heel'], L['toe'], *P['r_foot']),
               capsule2(proj, L['ankle'], L['heel'] * 0.5 + L['toe'] * 0.5, P['r_sh'][1], P['r_foot'][0])]
        if b.clothes.get('wide'):
            shp.append(capsule2(proj, L['knee'], L['ankle'] + v(0, 0.03, 0), P['r_sh'][0] * 1.25, P['r_sh'][0] * 1.5))
        out.append((f'leg{s}', dz(L['knee']) * 0.5 + dz(L['hip']) * 0.5, unary_union(shp)))
    for s, A in getattr(b, 'arms', {}).items():
        shp = [capsule2(proj, A['sh'], A['elbow'], *P['r_ua']), capsule2(proj, A['elbow'], A['wrist'], *P['r_fa']),
               capsule2(proj, A['wrist'], A['tip'], *P['r_hand'])]
        if b.clothes.get('sleeve'):
            shp.append(capsule2(proj, A['elbow'], A['elbow'] * 0.25 + A['wrist'] * 0.75, P['r_fa'][0] * 1.35, P['r_fa'][0] * 1.6))
        out.append((f'arm{s}', dz(A['elbow']) * 0.6 + dz(A['wrist']) * 0.4, unary_union(shp)))
    ex = []
    for e in b.extra:
        if e[0] == 'cap':
            ex.append(capsule2(proj, e[1], e[2], e[3], e[4]))
        elif e[0] == 'line':
            pts = [proj(p) for p in e[1]]
            ex.append(LineString([q[:2] for q in pts]).buffer(e[2] * pts[0][3], 6))
    if ex:
        out.append(('extra', 1e9, unary_union(ex)))
    return out


def hair_shapes(b, proj):
    P = b.P
    hc, Rh, H = b.head_c, b.Rh, P['HEAD']
    W = P['HEADW']
    sh = []
    k = b.hair
    if k == 'bob':
        sh.append(ellipsoid2(proj, hc + Rh @ v(0, -0.012, -0.006), Rh, W * 0.62, H * 0.5, W * 0.62))
    elif k == 'bun':
        sh.append(ellipsoid2(proj, hc + Rh @ v(0, 0.058, -0.03), Rh, 0.022, 0.02, 0.022))
    elif k == 'long':
        sh.append(capsule2(proj, hc + Rh @ v(0, 0.01, -0.025), hc + Rh @ v(0, -0.15, -0.045), 0.042, 0.036))
    elif k == 'pony':
        sh.append(capsule2(proj, hc + Rh @ v(0, 0.03, -0.045), hc + Rh @ v(0, -0.09, -0.075), 0.014, 0.008))
    elif k == 'curly':
        sh.append(ellipsoid2(proj, hc + Rh @ v(0, 0.012, -0.004), Rh, W * 0.66, H * 0.48, W * 0.66))
    if b.hat == 'bowler':
        sh.append(ellipsoid2(proj, hc + Rh @ v(0, 0.045, 0), Rh, 0.055, 0.008, 0.055))
        sh.append(ellipsoid2(proj, hc + Rh @ v(0, 0.06, 0), Rh, 0.036, 0.03, 0.038))
    elif b.hat == 'beanie':
        sh.append(ellipsoid2(proj, hc + Rh @ v(0, 0.035, -0.004), Rh, 0.042, 0.04, 0.044))
    elif b.hat == 'tall':
        sh.append(ellipsoid2(proj, hc + Rh @ v(0, 0.045, 0), Rh, 0.06, 0.006, 0.06))
        sh.append(capsule2(proj, hc + Rh @ v(0, 0.05, 0), hc + Rh @ v(0, 0.11, 0), 0.034, 0.032))
    elif b.hat == 'cap':
        sh.append(ellipsoid2(proj, hc + Rh @ v(0, 0.03, -0.004), Rh, 0.04, 0.03, 0.042))
        sh.append(ellipsoid2(proj, hc + Rh @ v(0, 0.022, 0.045), Rh, 0.03, 0.004, 0.028))
    return sh


def clothes_shapes(b, proj):
    """裙子 / 大衣 / 连衣裙：从腰围到下摆两圈取凸包。下摆中心取两腿在下摆高度处的中点，半径盖住两腿再放一点。"""
    c = b.clothes
    out = []
    kind = c.get('lower')
    if kind in ('skirt', 'dress', 'coat') and hasattr(b, 'legs'):
        frac = dict(skirt=0.62, dress=0.85, coat=0.75)[kind] * c.get('len', 1.0)
        L1, L2 = b.legs[1], b.legs[-1]

        def along(L, f):  # 沿大腿到小腿走 f（0 = 髋，1 = 膝，>1 进小腿）
            if f <= 1:
                return L['hip'] + (L['knee'] - L['hip']) * f
            return L['knee'] + (L['ankle'] - L['knee']) * (f - 1)

        f = frac * 1.6
        a, bb = along(L1, f), along(L2, f)
        mid = (a + bb) / 2
        half = np.linalg.norm(a - bb) / 2
        flare = c.get('flare', 0.045)
        Rw = b.Rp
        top = ring(b.pelvis + b.Rp @ v(0, 0.02, 0), Rw, b.P['hip'][0] * 1.02, b.P['hip'][1] * 1.02)
        # 下摆：沿两腿连线方向的椭圆
        ax = norm(a - bb) if half > 1e-4 else Rw @ v(1, 0, 0)
        up = v(0, 1, 0)
        side = norm(np.cross(ax, up)) if abs(np.dot(ax, up)) < 0.95 else Rw @ v(0, 0, 1)
        hem = [mid + ax * ((half + flare) * math.cos(t)) + side * ((flare + 0.02) * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 18, endpoint=False)]
        out.append(hull2(proj, top + hem))
        if kind == 'coat':
            out.append(hull2(proj, ring(b.chest + b.Rc @ v(0, 0.05, 0), b.Rc, b.P['chest'][0] * 1.04, b.P['chest'][1] * 1.1)
                             + ring(b.lumbar, b.Rl, b.P['waist'][0] * 1.12, b.P['waist'][1] * 1.15)))
    return out


def silhouette(b: Body, proj, close=0.006):
    ps = parts(b, proj)
    shape = unary_union([p[2] for p in ps])
    k = close * proj(b.chest)[3]
    if k > 0:
        shape = shape.buffer(k, 8).buffer(-k, 8)
    return shape, ps


def svg_path(g):
    def ring_d(coords):
        pts = list(coords)
        return 'M' + ' L'.join(f'{x:.2f},{y:.2f}' for x, y in pts[:-1]) + 'Z'
    polys = [g] if g.geom_type == 'Polygon' else list(getattr(g, 'geoms', []))
    d = []
    for p in polys:
        if p.geom_type != 'Polygon' or p.is_empty:
            continue
        d.append(ring_d(p.exterior.coords))
        for i in p.interiors:
            d.append(ring_d(i.coords))
    return ' '.join(d)


def figure_svg(b: Body, proj, fill='#1d1a17', halo=None, close=0.006):
    """halo：给交叠的近侧四肢描一圈纸色细边（像素宽），分开叠在一起的腿和胳膊"""
    shape, ps = silhouette(b, proj, close)
    if not halo:
        return f'<path d="{svg_path(shape)}" fill="{fill}" fill-rule="evenodd"/>'
    # 远 → 近：先整体剪影打底，再把近侧胳膊 / 腿按深度带一圈纸色边重画
    s = [f'<path d="{svg_path(shape)}" fill="{fill}" fill-rule="evenodd"/>']
    body_z = [p for p in ps if p[0] == 'body'][0][1]
    near = sorted([p for p in ps if p[0] != 'body' and p[0] != 'extra' and p[1] < body_z - 0.004], key=lambda p: -p[1])
    for name, z, g in near:
        k = close * proj(b.chest)[3]
        gg = g.buffer(k * 0.6, 6).buffer(-k * 0.6, 6)
        s.append(f'<path d="{svg_path(gg)}" fill="{fill}" stroke="{halo[0]}" stroke-width="{halo[1]}" stroke-linejoin="round"/>')
        # 根部（肩、髋）不要白线：在根部画回一块黑，剪在整个剪影以内
        if name.startswith('arm'):
            root = b.arms[int(name[3:])]['sh']; r = b.P['r_ua'][0] * 2.6
        else:
            root = b.legs[int(name[3:])]['hip']; r = b.P['r_th'][0] * 2.2
        pr = proj(root)
        patch = Point(pr[0], pr[1]).buffer(r * pr[3], 16).intersection(shape)
        if not patch.is_empty:
            s.append(f'<path d="{svg_path(patch)}" fill="{fill}"/>')
    return ''.join(s)
