"""线稿底图上叠人和猫：人是石上纯也式的黑色小人（3D 骨架按仿真的位置、朝向、坐姿摆，按同一个机位投影），
猫是二维的画（铅笔 / 线稿 / 黑剪影），按台面上的落点和机位缩放；挡在人猫前面的东西按深度盖回来。
轴测图另在地面上用点线标出收着的单元的落脚格。

python3 scripts/unit-blender/cafe_compose.py <通道目录> <机位> <底图.png> <cafe.json> <猫的画法 pencil|line|silhouette> <输出.png> [v1|v2]

v2（第二轮）：只有在跟猫打交道的人（摸猫、拍猫、逗猫）画实的剪影，颜色是暖深棕不是纯黑；其余坐着的人画成白底线描剪影，
走路、站着说话的人不画——画面上的人少了一大半，单元重新成为主角。
（人与猫的画法模块在 scripts/unit-blender/drawing/）
"""
import json, math, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'drawing'))
from ishi import Body, ADULT, v, norm, parts, silhouette  # noqa: E402
import poses  # noqa: E402
import cats as catlib  # noqa: E402

D, K, BASE, JS, CATSTYLE, OUT = sys.argv[1:7]
STYLE = sys.argv[7] if len(sys.argv) > 7 else 'v1'
ROLE = {}  # 人 → 'key'（摸猫 / 拍猫 / 逗猫）
meta = json.load(open(f'{D}/{K}_cam.json'))
d = json.load(open(JS))
base = Image.open(BASE).convert('RGB')
W, H = base.size
zbase = np.load(BASE.replace('.png', '_z.npy'))
cbase = np.load(BASE.replace('.png', '_cat.npy'))
INK = (29, 25, 22)
HM = 1.70  # 身高（m）
SEC_Y = meta.get('sec_y')


class Cam:
    def __init__(self, m):
        self.M = np.array(m['M']); self.Wm = np.array(m['world']); self.V = np.linalg.inv(self.Wm)
        self.right = self.Wm[:3, 0]

    def __call__(self, p):
        q = self.M @ np.append(p, 1.0)
        x = (q[0] / q[3] * 0.5 + 0.5) * W
        y = (1 - (q[1] / q[3] * 0.5 + 0.5)) * H
        return x, y, -(self.V @ np.append(p, 1.0))[2]

    def scale(self, p):
        a = self(p); b = self(p + self.right * 0.05)
        return math.hypot(b[0] - a[0], b[1] - a[1]) / 0.05


cam = Cam(meta)


class Placed:
    """人的局部系（单位 H：x 向左、y 向上、z 向前）→ 世界 → 屏幕"""

    def __init__(self, x, y, heading, hm=HM):
        self.o = np.array([x, y, 0.0]); self.hm = hm
        self.f = np.array([math.cos(heading), math.sin(heading), 0.0])
        self.l = np.array([-math.sin(heading), math.cos(heading), 0.0])

    def world(self, p):
        return self.o + self.hm * (p[0] * self.l + p[1] * np.array([0, 0, 1.0]) + p[2] * self.f)

    def local(self, w):
        r = (np.asarray(w, float) - self.o) / self.hm
        return v(r @ self.l, r[2], r @ self.f)

    def __call__(self, p):
        w = self.world(p)
        x, y, dd = cam(w)
        return x, y, dd, cam.scale(w) * self.hm


class Billboard:
    """轴测图里的人：像石上纯也模型里的剪影片一样立着——形状按「人自己朝向下的侧面 / 四分之三」画（略带俯视），
    贴在仿真给的那一点上，竖向按 KV 压一点（真实的轴测压缩是 sin 38° ≈ 0.62，全按它压人会显得矮胖）；
    深度仍按真实 3D 位置算（遮挡照真的来）。"""
    KV = 0.82

    def __init__(self, pl, anchor_local, elev=16):
        self.pl = pl
        r = cam.right.copy(); r[2] = 0; r /= np.linalg.norm(r)
        rl = (r @ pl.l, r @ pl.f)  # 屏幕右方在人的局部系里（x 左、z 前）
        th = math.atan2(rl[1], rl[0])
        from ishi import rx, ry
        self.R = rx(elev) @ ry(math.degrees(th))
        self.a = np.asarray(anchor_local, float)
        ax, ay, _ = cam(pl.world(self.a))
        self.ax, self.ay = ax, ay
        self.s = cam.scale(pl.world(self.a)) * pl.hm

    def __call__(self, p):
        q = self.R @ (np.asarray(p, float) - self.a)
        _, _, dd = cam(self.pl.world(p))
        return self.ax + q[0] * self.s, self.ay - q[1] * self.s * self.KV, dd, self.s


# ---------------------------------------------------------------- 人：这一刻每个人做什么（布景，照 cafe_scene.stage_gestures 的挑法）
cats = d['cats']


def cat_head(c):
    return np.array(c['headPivot'])


def seated_body(p, lean, look=None):
    pl = Placed(p['x'], p['y'], p['heading'])
    j = p['joints']
    b = Body()
    legs = [(pl.local(L['hip']), pl.local(L['knee']), pl.local(L['ankle'])) for L in j['legs']]
    hip_mid = (legs[0][0] + legs[1][0]) / 2
    b.trunk(pelvis=hip_mid + v(0, 0.014, 0.0), pitch=(12 if lean else -10), bend=(14 if lean else -4),
            side=0, nod=(18 if lean else 6))
    for hip, knee, ank in legs:
        s = 1 if hip[0] > hip_mid[0] else -1
        b.leg_fk(s, knee=knee, ankle=ank)
    return b, pl


def turn_head(b, pl, target_w):
    """头转向某一点（世界坐标），限 ±70°"""
    t = pl.local(target_w)
    ang = math.degrees(math.atan2(t[0], t[2]))
    yaw = max(-70, min(70, ang))
    b.trunk(pelvis=b.pelvis, pitch=b._pitch, bend=b._bend, side=b._side, twist=b._twist, yaw=b._yaw, tilt=b._tilt,
            nod=b._nod, turn=yaw)


# 给 Body.trunk 记下参数（转头时重算要用）
_orig_trunk = Body.trunk


def _trunk(self, pelvis=None, yaw=0, tilt=0, pitch=0, bend=0, side=0, twist=0, nod=0, htilt=0, turn=0):
    self._yaw, self._tilt, self._pitch, self._bend, self._side, self._twist, self._nod = yaw, tilt, pitch, bend, side, twist, nod
    return _orig_trunk(self, pelvis, yaw, tilt, pitch, bend, side, twist, nod, htilt, turn)


Body.trunk = _trunk


def stage():
    people = d['people']
    out = []
    used = set()
    dist = lambda p, c: math.hypot(p['x'] - c['x'], p['y'] - c['y'])
    # 摸：坐着、看着茶几上的猫、1.3 m 内
    pet = {}
    for ci, c in enumerate(cats):
        if c['onPlatform'] and c['z'] < 0.6:
            cand = [p for p in people if p['pose'] == 'sit' and p['watchCat'] == ci and dist(p, c) < 1.3]
            if cand:
                pet[min(cand, key=lambda p: dist(p, c))['k']] = ci
    # 拍：站着、1.4 m 内
    photo = {}
    for ci, c in enumerate(cats):
        cand = [p for p in people if p['pose'] == 'stand' and dist(p, c) < 1.4 and p['k'] not in pet]
        if cand:
            photo[min(cand, key=lambda p: dist(p, c))['k']] = ci
    # 逗：看着两层台里的猫、2.2 m 内，最近的一对
    pairs = sorted((p['pose'] != 'sit', dist(p, c), p['k'], ci) for ci, c in enumerate(cats) if c['z'] > 0.6
                   for p in people if p['watchCat'] == ci and dist(p, c) < 2.2 and p['k'] not in pet and p['k'] not in photo)
    wand = {pairs[0][2]: pairs[0][3]} if pairs else {}
    for kk in list(pet) + list(photo) + list(wand):
        ROLE[kk] = 'key'
    hair = ['short', 'long', 'bun', 'bob', 'pony', 'curly']
    for p in people:
        k = p['k']
        o = p['outfit'] if isinstance(p['outfit'], dict) else {}
        lower = 'dress' if '连衣裙' in str(o) else ('skirt' if '裙' in str(o) else None)
        if p['pose'] == 'sit':
            b, pl = seated_body(p, p.get('lean', False))
            hip_y = b.pelvis[1]
            if k in pet:
                c = cats[pet[k]]
                hd = cat_head(c) + np.array([0, 0, 0.05])
                t = pl.local(hd)
                s = 1 if t[0] > 0 else -1
                b.arm(s, t + v(-s * 0.01, 0.02, -0.03), elbow_pole=(s, -0.6, 0.2), hand=(0, -0.6, 1))
                b.arm(-s, b.legs[-s]['knee'] + v(0, 0.03, -0.02), elbow_pole=(-s, -0.3, -0.4), hand=(0, -1, 0.5))
                turn_head(b, pl, cat_head(c))
            elif k in wand:
                c = cats[wand[k]]
                hd = cat_head(c)
                t = pl.local(hd)
                s = 1 if t[0] > 0 else -1
                b.arm(s, v(s * 0.10, hip_y + 0.30, 0.22), elbow_pole=(s, -0.4, -0.3), hand=(s * 0.4, 0.5, 0.8))
                tip = b.arms[s]['tip']
                feather = pl.local(hd + np.array([0, 0, -0.05]))
                rod_end = tip + (feather - tip) * 0.75 + v(0, 0.20, 0)
                b.line([tip, rod_end], 0.0035)
                b.line([rod_end, feather], 0.0012)
                b.blob(feather, 0.014)
                b.arm(-s, b.legs[-s]['knee'] + v(0, 0.03, -0.03), elbow_pole=(-s, -0.3, -0.4), hand=(0, -1, 0.5))
                turn_head(b, pl, hd)
            else:
                # 其余坐着的：一手搭膝、一手捧杯或搭在扶手上（按 k 轮着换）
                if k % 3 == 0:
                    c0 = v(0.0, hip_y + 0.17, 0.22)
                    for s in (1, -1):
                        b.arm(s, c0 + v(s * 0.03, 0, 0), elbow_pole=(s, -1, 0), hand=(-s * 0.6, 0.4, 0.4))
                    b.cap(c0 + v(0, 0.01, 0.025), c0 + v(0, 0.05, 0.025), 0.018, 0.021)
                elif k % 3 == 1:
                    b.arm(1, b.legs[1]['knee'] + v(0, 0.03, -0.02), elbow_pole=(1, -0.3, -0.4), hand=(0, -1, 0.5))
                    b.arm(-1, v(-0.04, hip_y + 0.05, 0.12), elbow_pole=(-1, -0.6, -0.3), hand=(0.6, -0.4, 0.4))
                else:
                    b.arm(1, v(0.22, hip_y + 0.14, -0.02), elbow_pole=(1, -0.2, -0.3), hand=(0.3, -0.8, 0.3))
                    b.arm(-1, b.legs[-1]['knee'] + v(0, 0.03, -0.02), elbow_pole=(-1, -0.3, -0.4), hand=(0, -1, 0.5))
                if p['watchCat'] is not None and p['watchCat'] >= 0:
                    turn_head(b, pl, cat_head(cats[p['watchCat']]))
            b.hair = hair[k % len(hair)]
            if lower:
                b.clothes = dict(lower=lower, flare=0.03)
        else:
            if k in photo:
                b = poses.phone_photo()
                c = cats[photo[k]]
                pl = Placed(p['x'], p['y'], math.atan2(c['y'] - p['y'], c['x'] - p['x']))
            elif p['pose'] == 'stand':
                b = poses.chat_gesture() if k % 2 else poses.stand_look_down()
                pl = Placed(p['x'], p['y'], p['heading'])
            else:
                b = poses.walk_cup() if k % 2 else poses.couple_walk()[k % 2]
                pl = Placed(p['x'], p['y'], p['heading'])
        out.append((k, b, pl))
    return out


# ---------------------------------------------------------------- 画
def poly_mask(geom, ss=3):
    """shapely 形 → 终稿分辨率上的灰度遮罩（3 倍超采样）；先裁到画面范围（近处的人投影会很大）"""
    from shapely.geometry import box
    geom = geom.intersection(box(-4, -4, W + 4, H + 4))
    if geom.is_empty:
        return np.zeros((1, 1), np.float32), 0, 0
    minx, miny, maxx, maxy = geom.bounds
    x0, y0 = int(math.floor(minx)) - 2, int(math.floor(miny)) - 2
    w, h = int(math.ceil(maxx)) - x0 + 3, int(math.ceil(maxy)) - y0 + 3
    im = Image.new('L', (w * ss, h * ss), 0)
    dr = ImageDraw.Draw(im)
    polys = [geom] if geom.geom_type == 'Polygon' else list(getattr(geom, 'geoms', []))
    for pg in polys:
        if pg.geom_type != 'Polygon' or pg.is_empty:
            continue
        dr.polygon([((x - x0) * ss, (y - y0) * ss) for x, y in pg.exterior.coords], fill=255)
    m = np.asarray(im.resize((w, h), Image.BOX), np.float32) / 255
    return m, x0, y0


def poly_outline(geom, width, ss=3):
    """shapely 形的外轮廓线 → 遮罩（与 poly_mask 同一套坐标）"""
    from shapely.geometry import box
    geom = geom.intersection(box(-4, -4, W + 4, H + 4))
    if geom.is_empty:
        return np.zeros((1, 1), np.float32), 0, 0
    minx, miny, maxx, maxy = geom.bounds
    x0, y0 = int(math.floor(minx)) - 3, int(math.floor(miny)) - 3
    w, h = int(math.ceil(maxx)) - x0 + 5, int(math.ceil(maxy)) - y0 + 5
    im = Image.new('L', (w * ss, h * ss), 0)
    dr = ImageDraw.Draw(im)
    polys = [geom] if geom.geom_type == 'Polygon' else list(getattr(geom, 'geoms', []))
    for pg in polys:
        if pg.geom_type != 'Polygon' or pg.is_empty:
            continue
        pts = [((x - x0) * ss, (y - y0) * ss) for x, y in pg.exterior.coords]
        dr.line(pts + [pts[0]], fill=255, width=max(1, int(round(width * ss))), joint='curve')
    return np.asarray(im.resize((w, h), Image.BOX), np.float32) / 255, x0, y0


V2C = dict(key=(58, 43, 35), ghost_fill=(245, 239, 228), ghost_line=(140, 120, 104), foot=(196, 178, 158))
canvas = np.asarray(base, np.float32).copy()


def put(mask, x0, y0, color, zfig, tol=0.07):
    h, w = mask.shape
    xa, ya = max(0, x0), max(0, y0)
    xb, yb = min(W, x0 + w), min(H, y0 + h)
    if xb <= xa or yb <= ya:
        return
    m = mask[ya - y0:yb - y0, xa - x0:xb - x0]
    if np.ndim(zfig):
        zf = zfig[ya - y0:yb - y0, xa - x0:xb - x0]
    else:
        zf = zfig
    zs = zbase[ya:yb, xa:xb]
    vis = ~(zs < zf - tol)
    a = (m * vis)[..., None]
    canvas[ya:yb, xa:xb] = canvas[ya:yb, xa:xb] * (1 - a) + np.array(color, np.float32) * a


# 1) 轴测图：收着的单元在地面上的落脚格（点线，剪在地面以内）
if meta['ortho']:
    ov = Image.new('L', (W * 2, H * 2), 0)
    dr = ImageDraw.Draw(ov)
    half = 0.345
    for u in d['units']:
        if u['drop']:
            continue
        cs = [(u['x'] - half, u['y'] - half), (u['x'] + half, u['y'] - half), (u['x'] + half, u['y'] + half), (u['x'] - half, u['y'] + half)]
        pts = [cam(np.array([x, y, 0.0])) for x, y in cs]
        for i in range(4):
            a, b = pts[i], pts[(i + 1) % 4]
            n = int(math.hypot(b[0] - a[0], b[1] - a[1]) / 5)
            for t in range(0, n, 2):
                p0 = (a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n)
                p1 = (a[0] + (b[0] - a[0]) * (t + 1) / n, a[1] + (b[1] - a[1]) * (t + 1) / n)
                dr.line([(p0[0] * 2, p0[1] * 2), (p1[0] * 2, p1[1] * 2)], fill=255, width=2)
    m = np.asarray(ov.resize((W, H), Image.BOX), np.float32) / 255 * (cbase == 1)
    a = (m * 0.75)[..., None]
    canvas[:] = canvas * (1 - a) + np.array(V2C['foot'] if STYLE == 'v2' else (150, 134, 118), np.float32) * a

# 1b) 剖透视：剖切面涂实（墙、地坪、天花、切到的单元外皮），地坪以下画地面
if SEC_Y is not None:
    POCHE = (85, 41, 31)
    y0 = SEC_Y
    half_in, half_out = 3.319, 3.52
    CEIL = d['meta']['ceiling']
    ss = 2
    ov = Image.new('RGBA', (W * ss, H * ss), (0, 0, 0, 0))
    dr = ImageDraw.Draw(ov)
    P2 = lambda x, z: (cam(np.array([x, y0, z]))[0] * ss, cam(np.array([x, y0, z]))[1] * ss)
    # 地面：板下面一条带点画的土
    gy = P2(0, -0.32)[1]
    rng = np.random.default_rng(3)
    base_np = np.asarray(base, np.float32)
    bgmask = zbase > 1e9
    rows = np.arange(H)[:, None] * ss >= gy
    ground = bgmask & rows
    canvas[ground] = np.array((244, 238, 227), np.float32)
    n = int(ground.sum() * 0.05)
    ys, xs = np.nonzero(ground)
    pick = rng.choice(len(ys), size=min(n, len(ys)), replace=False)
    for i in pick:
        canvas[ys[i], xs[i]] = (90, 76, 66)
    for _ in range(140):
        i = rng.integers(len(ys))
        cx, cy = xs[i] * ss, ys[i] * ss
        rx_, ry_ = rng.uniform(6, 16), rng.uniform(3, 7)
        dr.ellipse([cx - rx_, cy - ry_, cx + rx_, cy + ry_], outline=(90, 76, 66, 255), width=2)
    for xa, xb in ((-half_out, -half_in), (half_in, half_out)):
        dr.polygon([P2(xa, -0.32), P2(xb, -0.32), P2(xb, CEIL + 0.26), P2(xa, CEIL + 0.26)], fill=POCHE + (255,))
    dr.polygon([P2(-half_out, -0.32), P2(half_out, -0.32), P2(half_out, 0.0), P2(-half_out, 0.0)], fill=POCHE + (255,))
    dr.polygon([P2(-half_out, CEIL), P2(half_out, CEIL), P2(half_out, CEIL + 0.26), P2(-half_out, CEIL + 0.26)], fill=POCHE + (255,))
    # 切到的单元外皮：网格与剖切面的交线
    for u in d['units']:
        for key, ik in (('cover', 'coverIdx'), ('gore', 'goreIdx')):
            V3 = np.array(u[key]).reshape(-1, 3)
            if V3[:, 1].min() > y0 or V3[:, 1].max() < y0:
                continue
            T3 = np.array(u[ik]).reshape(-1, 3)
            sd = V3[:, 1] - y0
            for tri in T3:
                a = sd[tri]
                if (a > 0).all() or (a < 0).all():
                    continue
                pts = []
                for i0, i1 in ((0, 1), (1, 2), (2, 0)):
                    s0, s1 = a[i0], a[i1]
                    if (s0 > 0) != (s1 > 0):
                        t = s0 / (s0 - s1)
                        q = V3[tri[i0]] + (V3[tri[i1]] - V3[tri[i0]]) * t
                        pts.append(P2(q[0], q[2]))
                if len(pts) == 2:
                    dr.line(pts, fill=POCHE + (255,), width=7 if u['drop'] else 4)
    ov = ov.resize((W, H), Image.LANCZOS)
    o = np.asarray(ov, np.float32)
    a = (o[:, :, 3:] / 255)
    canvas[:] = canvas * (1 - a) + o[:, :, :3] * a

# 2) 人
people = stage()
# 远的先画、近的后画：两个实剪影叠在一起时，近的那个带着纸色细边压在远的上面
people.sort(key=lambda t: -cam(np.array([d['people'][t[0]]['x'], d['people'][t[0]]['y'], 1.0]))[2])
for k, b, pl in people:
    p = d['people'][k]
    if SEC_Y is not None and p['y'] > SEC_Y + 0.15:
        continue
    role = ROLE.get(k, 'sit' if p['pose'] == 'sit' else 'other')
    if STYLE == 'v2' and role == 'other':
        continue
    # 离相机不到 1.2 m 或在画面外的人不画（会被画框切掉大半个身子）
    fx_, fy_, fd_ = cam(np.array([p['x'], p['y'], 1.0]))
    if fd_ < 1.2 or not (-0.15 * W < fx_ < 1.15 * W and -0.3 * H < fy_ < 1.3 * H):
        continue
    if not meta['ortho'] and cam.scale(np.array([p['x'], p['y'], 1.0])) * HM > 0.75 * H:
        continue
    if meta['ortho']:
        # 坐着的人钉在髋上（坐在沙发上），站着走着的钉在脚下
        anchor = b.pelvis if p['pose'] == 'sit' else v(0, 0, 0)
        proj = Billboard(pl, anchor)
    else:
        proj = pl
    shape, ps = silhouette(b, proj)
    if shape.is_empty:
        continue
    # 被画框切掉一截的人不画（透视图前景里只剩半个身子的黑块）
    from shapely.geometry import box as _box
    if shape.intersection(_box(0, 0, W, H)).area < 0.8 * shape.area:
        continue
    # 透视前景里太大的人（超过画高一半）不画：整块黑会压住后面的单元
    if not meta['ortho'] and (shape.bounds[3] - shape.bounds[1]) > 0.5 * H:
        continue
    # 逐段深度：每段身体按它自己的深度挡
    m, x0, y0 = poly_mask(shape)
    zf = np.full(m.shape, 1e9, np.float32)
    for name, z, g in ps:
        if name == 'extra':
            z = ps[0][1]
        mm, a0, b0 = poly_mask(g.buffer(1.5), 1)
        hh, ww = mm.shape
        ys, xs = slice(max(0, b0 - y0), max(0, b0 - y0) + hh), slice(max(0, a0 - x0), max(0, a0 - x0) + ww)
        sub = zf[ys, xs]
        mm = mm[:sub.shape[0], :sub.shape[1]]
        sub[mm > 0] = np.minimum(sub[mm > 0], z)
    zf[zf > 1e8] = ps[0][1]
    if STYLE == 'v2' and role != 'key':
        # 白底线描剪影：像 E7 / E9 里的人，读得出在那儿坐着，但不压画面
        put(m, x0, y0, V2C['ghost_fill'], zf)
        om, ox, oy = poly_outline(shape, 1.15)
        zo = np.full(om.shape, ps[0][1], np.float32)
        put(om, ox, oy, V2C['ghost_line'], zo)
    else:
        if STYLE == 'v2':
            om, ox, oy = poly_outline(shape, 2.2)
            put(om, ox, oy, V2C['ghost_fill'], np.full(om.shape, ps[0][1], np.float32))
        put(m, x0, y0, V2C['key'] if STYLE == 'v2' else INK, zf)

# 3) 猫：二维画，按台面落点 + 机位缩放，朝向决定画正面还是侧面、要不要左右翻
# 这一刻：被逗的那只（狸花）抬爪，茶几上的揣手趴着或正面坐着，两层台里的侧面或正面坐着
svg_parts = []
for ci, c in enumerate(cats):
    if SEC_Y is not None and c['y'] > SEC_Y + 0.4:
        continue
    B = np.array([c['x'], c['y'], c['z']])
    fx, fy = math.cos(c['heading']), math.sin(c['heading'])
    b0 = cam(B); b1 = cam(B + np.array([fx, fy, 0]) * 0.2)
    up = cam(B + np.array([0, 0, 0.01]))
    sx = cam.scale(B) / 100.0              # 每 cm 多少像素（屏幕横向）
    vx, vy = (up[0] - b0[0]), (up[1] - b0[1])  # 每 cm 竖直方向在屏幕上的位移
    if meta['ortho']:
        vx, vy = 0.0, -sx * Billboard.KV       # 和人一样立着
    dx = b1[0] - b0[0]
    side = abs(dx) > 0.45 * math.hypot(b1[0] - b0[0], b1[1] - b0[1])
    if c['coat'] == 'tabby':
        cat = catlib.paw_up()
    elif c['z'] < 0.6:
        cat = catlib.loaf() if side else catlib.sit_front()
    else:
        cat = catlib.sit_side() if side else catlib.sit_front()
    flip = -1 if (side and dx < 0) else 1
    ol = cat.outline()
    cxm = (ol.bounds[0] + ol.bounds[2]) / 2
    T = lambda x, y, b0=b0, sx=sx, vx=vx, vy=vy, flip=flip, cxm=cxm: (b0[0] + flip * (x - cxm) * sx + y * vx, b0[1] + y * vy)
    coat = {'tabby': 'tabby', 'cow': 'cow', 'black': 'black'}.get(c['coat'], 'tabby')
    sc = max(sx, 0.4)
    svg = catlib.cat_svg(cat, T, sc, style=CATSTYLE, coat=coat, seed=ci + 3, uid=f'k{ci}', ink=('#4A372D' if STYLE == 'v2' else '#1d1916'))
    zc = cam(B + np.array([0, 0, 0.12]))[2]
    svg_parts.append((zc, svg))

if svg_parts:
    with tempfile.TemporaryDirectory() as tmp:
        files = []
        for i, (zc, svg) in enumerate(svg_parts):
            f = os.path.join(tmp, f'c{i}.svg')
            open(f, 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}">{svg}</svg>')
            files.append(f)
        subprocess.run(['node', os.path.join(HERE, 'drawing', 'rgba.mjs')] + files, check=True)
        for (zc, _), f in zip(svg_parts, files):
            im = np.asarray(Image.open(f.replace('.svg', '.png')).convert('RGBA'), np.float32) / 255
            a = im[:, :, 3]
            vis = ~(zbase < zc - 0.1)
            # 被台面挡住的那部分不藏掉，淡淡地透出来（图纸里画被遮挡物的惯例），猫是这张图要看的
            a = (a * np.where(vis, 1.0, 0.32))[..., None]
            canvas[:] = canvas * (1 - a) + im[:, :, :3] * 255 * a

# 局部图（A1）：画到四边自己淡出到纸色，不让画框把单元和人切成碎块
if os.environ.get('FADE'):
    yy_, xx_ = np.mgrid[0:H, 0:W].astype(np.float32)
    u = np.abs(xx_ - W / 2) / (W / 2); v_ = np.abs(yy_ - H / 2) / (H / 2)
    r = (u ** 4 + v_ ** 4) ** 0.25
    t = np.clip((r - 0.74) / 0.24, 0, 1)
    t = (t * t * (3 - 2 * t))[..., None]
    paper = np.array((245, 239, 228), np.float32)
    canvas[:] = canvas * (1 - t) + paper * t

Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8)).save(OUT)
print('COMPOSE', K, CATSTYLE, OUT)
