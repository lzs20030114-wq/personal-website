"""面的上色不只平涂（试画第四轮，2026-11-20）：渐变、纹理、网点、叠印与错版、颜色随用途变。

作者看第三轮的配色：「两套合起来」这个做法可以，但颜色还是老套；要多出几套，并且不要只做平涂，
试渐变、纹理、颜色内的变化、混色。这里只管「面」——线、人、猫、剖切面的外形照旧由 cafe_line.py 画成矢量。

cafe_line.py 的配色里有 fx 这一项时走这里，没有时一行不变（前三轮的图逐字节相同）。
fx 里每一类面给一个「色」，色可以是：

  '#RRGGBB'                              平涂
  ('y', 上, 下[, 起, 止])                 屏幕上从上到下的渐变（起止是画面高度的几成，默认 0 → 1）
  ('x', 左, 右[, 起, 止])                 从左到右
  ('ang', 色0, 色1, 角度)                 任意方向，角度 0 = 从左到右，90 = 从下到上
  ('rad', 中心, 边, cx, cy, r)            屏幕上的圆形渐变（cx、cy、r 按画面宽的几成）
  ('z', 低, 高, z0, z1)                   按离地高度（米）：同一台单元从下往上变
  ('dist', 近, 远, d0, d1)                按离镜头的距离（米）
  ('cloud', 色0, 色1, 尺度)               大块的、慢慢起伏的颜色变化（尺度 = 一团多宽，按画面宽的几成）
  ('steps', 色, n)                        把里面那个渐变压成 n 档色阶
  ('stops', 走向, [色0, 色1, …])          多个颜色排成一条（走向写成上面任一种，两头的颜色写 None）
  ('ht', 墨, 底, 覆盖, 网格, 角度)          网点：「覆盖」是一个 0–1 的量（数或 ('y', a, b) 之类），网格 = 一格多少像素（终稿）

渐变一律在 OKLab 里插值，两头颜色之间不会发灰。

其余的键：
  grain   ：面上的油墨颗粒，0–1；paper_grain：纸的纤维起伏（整张图，叠在线上面，SVG 滤镜做）
  shade   ：单元朝上 / 朝下的面怎么区分：'tint'（朝上提亮、朝下压暗，默认）或 ('ht', 墨, 网格, 角度, 覆盖)（朝下的面加网点）
  unit_by ：{'table:sofa': 色, 'table:chair': 色, 'cat:flat': 色, 'cat:half': 色}，单元按用途换色
  plates  ：[{'what': 'unit'|'shadow'|'floor'|'ground'|..., 'ink': '#hex', 'cover': 0–1, 'shift': (dx, dy), 'ht': (网格, 角度) 或无}]
            叠印：每一版是一个半透明的墨，按正片叠底压在下面的颜色上，两版重叠的地方混出第三个颜色；
            shift 是这一版相对线稿错开的像素（终稿），就是孔版印刷对不准的那几毫米
  shadow  ：给了就不再画排线的影子，影子改由 plates 里 what='shadow' 那一版画
  cut     ：剖切面的色（同上的写法），用图案填进剖切面的外形
  pieces  ：拼贴式的渐变（2026-11-21）：每块东西当成从一张渐变纸上剪下来的，方向按块随机、和光无关，见 _piece_layer
"""
import base64, io, math
import numpy as np


# ---------------------------------------------------------------- 颜色
def hex3(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255.0


def _lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _gam(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


_M1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929], [0.2119034982, 0.6806995451, 0.1073969566], [0.0883024619, 0.2817188376, 0.6299787005]], np.float32)
_M2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468], [1.9779984951, -2.4285922050, 0.4505937099], [0.0259040371, 0.7827717662, -0.8086757660]], np.float32)
_M1i = np.linalg.inv(_M1).astype(np.float32)
_M2i = np.linalg.inv(_M2).astype(np.float32)


def to_lab(rgb):
    l = _lin(np.asarray(rgb, np.float32)) @ _M1.T
    return np.cbrt(l) @ _M2.T


def from_lab(lab):
    l = (np.asarray(lab, np.float32) @ _M2i.T) ** 3
    return _gam(l @ _M1i.T)


def mix(c0, c1, t):
    """两个颜色按 t（数组）在 OKLab 里插值 → (…, 3)"""
    a, b = to_lab(hex3(c0) if isinstance(c0, str) else c0), to_lab(hex3(c1) if isinstance(c1, str) else c1)
    t = np.clip(np.asarray(t, np.float32), 0, 1)[..., None]
    return from_lab(a + (b - a) * t)


# ---------------------------------------------------------------- 噪声
def value_noise(H, W, cell, seed, octaves=1):
    """平滑的值噪声，0–1。cell = 一个起伏多少像素"""
    rng = np.random.default_rng(seed)
    out = np.zeros((H, W), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        c = max(2.0, cell / (2 ** o))
        gh, gw = int(H / c) + 3, int(W / c) + 3
        g = rng.random((gh, gw)).astype(np.float32)
        ys, xs = np.arange(H) / c, np.arange(W) / c
        y0, x0 = ys.astype(int), xs.astype(int)
        fy, fx = (ys - y0)[:, None], (xs - x0)[None, :]
        fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
        a = g[y0][:, x0]; b = g[y0][:, x0 + 1]; cc = g[y0 + 1][:, x0]; d = g[y0 + 1][:, x0 + 1]
        out += amp * ((a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy)
        tot += amp
        amp *= 0.5
    return out / tot


def grain_field(H, W, seed, px=1.0):
    """细颗粒：高斯白噪声稍微糊一下，均值 0、方差约 1"""
    from scipy import ndimage
    rng = np.random.default_rng(seed)
    n = rng.standard_normal((H, W)).astype(np.float32)
    if px > 0.5:
        n = ndimage.gaussian_filter(n, px * 0.6)
        n /= max(n.std(), 1e-6)
    return n


def halftone(cover, cell, angle, X, Y):
    """网点：cover（0–1，逐像素）→ 每个像素被墨盖住的比例（带 1 像素的抗锯齿）。cell、X、Y 都是同一套像素"""
    a = math.radians(angle)
    u = (X * math.cos(a) + Y * math.sin(a)) / cell
    v = (-X * math.sin(a) + Y * math.cos(a)) / cell
    du, dv = u - np.round(u), v - np.round(v)
    d = np.sqrt(du * du + dv * dv) * cell                       # 到最近一格中心的距离（像素）
    c = np.clip(cover, 0, 1)
    r = cell * np.sqrt(c / math.pi)                             # 圆点面积 = 覆盖 × 一格面积
    # 覆盖过半以后圆点连成片：改成「白点变小」，两头都对得上
    r_in = cell * np.sqrt(np.clip(1 - c, 0, 1) / math.pi)
    dot = np.clip(r - d + 0.5, 0, 1)
    du2, dv2 = np.abs(du) - 0.5, np.abs(dv) - 0.5
    d2 = np.sqrt(du2 * du2 + dv2 * dv2) * cell                  # 到格角（白点的中心）的距离
    hole = np.clip(r_in - d2 + 0.5, 0, 1)
    return np.where(c < 0.5, dot, 1 - hole)


# ---------------------------------------------------------------- 画面上下文
class Ctx:
    """每个像素的屏幕坐标、世界坐标、离镜头距离（缓冲的分辨率，ss 倍）"""

    def __init__(self, buf):
        cam, ss = buf.cam, buf.ss
        self.buf, self.cam, self.ss = buf, cam, ss
        H, W = buf.ids.shape
        self.H, self.W = H, W
        Y, X = np.mgrid[0:H, 0:W].astype(np.float32)
        self.X, self.Y = X, Y
        self.u, self.v = (X + 0.5) / W, (Y + 0.5) / H          # 0–1
        px, py = (X + 0.5) / ss, (Y + 0.5) / ss
        key = buf.zk
        ok = np.isfinite(key)
        z = np.where(ok, cam.zof(np.where(ok, key, -1.0 if cam.persp else 0.0)), np.nan).astype(np.float32)
        if cam.persp:
            xc, yc = (px - cam.cx) * z / cam.k, (cam.cy - py) * z / cam.k
        else:
            xc, yc = (px - cam.cx) / cam.k, (cam.cy - py) / cam.k
        P = cam.eye[None, None, :] + cam.r[None, None, :] * xc[..., None] + cam.u[None, None, :] * yc[..., None] + cam.f[None, None, :] * z[..., None]
        self.P = P.astype(np.float32)
        self.dist = z

    def field(self, spec):
        """色 → (H, W, 3)。数（0–1）也可以，给网点的覆盖用 → (H, W)"""
        if isinstance(spec, (int, float)):
            return np.full((self.H, self.W), float(spec), np.float32)
        if isinstance(spec, str):
            return np.broadcast_to(hex3(spec), (self.H, self.W, 3)).copy()
        kind = spec[0]
        if kind == 'steps':
            inner, n = spec[1], spec[2]
            t = self.param(inner)
            t = np.floor(np.clip(t, 0, 0.9999) * n) / (n - 1)
            return self._ends(inner, t)
        if kind == 'stops':
            # 多个颜色排成一条：('stops', 走向, [色0, 色1, …])，走向的写法同上（两头的颜色写 None）
            t = np.clip(self.param(spec[1]), 0, 1)
            cols = spec[2]
            n = len(cols) - 1
            seg = np.minimum((t * n).astype(int), n - 1)
            f = t * n - seg
            labs = np.stack([to_lab(hex3(c)) for c in cols])
            a, b = labs[seg], labs[seg + 1]
            return from_lab(a + (b - a) * f[..., None])
        if kind == 'lines':
            # 平行线：('lines', 墨, 底, 间距, 角度, 线宽)，间距线宽是终稿像素
            ink, bg, pitch, ang, lw = spec[1:6]
            k = self.ss * getattr(self, 'kq', 1.0)
            return mix(bg, ink, _line_screen(self.X, self.Y, pitch * k, ang, lw * k))
        if kind == 'ht':
            ink, bg, cover, cell, ang = spec[1:6]
            cov = self.field(cover)
            if cov.ndim == 3:
                cov = cov.mean(-1)
            m = halftone(cov, cell * self.ss * getattr(self, 'kq', 1.0), ang, self.X, self.Y)
            return mix(bg, ink, m)
        t = self.param(spec)
        return self._ends(spec, t)

    def _ends(self, spec, t):
        c0, c1 = spec[1], spec[2]
        if isinstance(c0, (int, float)):
            return (c0 + (c1 - c0) * np.clip(t, 0, 1)).astype(np.float32)
        return mix(c0, c1, t)

    def param(self, spec):
        """渐变走到哪了：0–1"""
        kind = spec[0]
        if kind == 'y':
            a, b = (spec[3], spec[4]) if len(spec) > 4 else (0.0, 1.0)
            return (self.v - a) / (b - a)
        if kind == 'x':
            a, b = (spec[3], spec[4]) if len(spec) > 4 else (0.0, 1.0)
            return (self.u - a) / (b - a)
        if kind == 'ang':
            a = math.radians(spec[3])
            asp = self.H / self.W
            s = self.u * math.cos(a) - (self.v * asp) * math.sin(a)
            lo = min(0, math.cos(a)) - max(0, math.sin(a)) * asp
            hi = max(0, math.cos(a)) - min(0, math.sin(a)) * asp
            return (s - lo) / (hi - lo)
        if kind == 'rad':
            cx, cy, r = spec[3:6]
            asp = self.H / self.W
            d = np.sqrt((self.u - cx) ** 2 + ((self.v - cy) * asp) ** 2)
            return d / r
        if kind == 'z':
            z0, z1 = spec[3], spec[4]
            return (np.nan_to_num(self.P[..., 2], nan=z0) - z0) / (z1 - z0)
        if kind == 'dist':
            d0, d1 = spec[3], spec[4]
            return (np.nan_to_num(self.dist, nan=d1) - d0) / (d1 - d0)
        if kind == 'cloud':
            cell = spec[3] * self.W
            return value_noise(self.H, self.W, cell, seed=int(spec[4]) if len(spec) > 4 else 7, octaves=3) * 1.6 - 0.3
        if kind == 'steps':
            return self.param(spec[1])
        raise ValueError(f'不认得的色：{spec!r}')


# ---------------------------------------------------------------- 一整张底图
def paint(buf, cls_of, role_of, fx, pal, masks, seed=11, scene=None, kinds=None):
    """缓冲 → 一张不透明的 RGB 底图（终稿分辨率，PNG）+ 剖切面用的纹理图。

    cls_of：{编号: 类别}；role_of：{单元编号: 用途}；masks：额外的遮罩（缓冲分辨率）——
    'out' 房间以外、'sky' 窗洞里、'shadow' 影子（0–1）"""
    from PIL import Image
    ctx = Ctx(buf)
    H, W = ctx.H, ctx.W
    kq = buf.cam.W / 2400.0          # 网格、错开的像素都按终稿 2400 宽写，别的宽度按比例缩
    ctx.kq = kq
    ids, shade = buf.ids, buf.shade
    img = np.zeros((H, W, 3), np.float32)
    filled = np.zeros((H, W), bool)
    get = lambda k: fx.get(k, pal.get(k))

    def put(m, spec):
        if not m.any():
            return
        f = ctx.field(spec)
        img[m] = f[m]
        filled[m] = True

    # ---- 底：房间以外 + 窗洞
    put(masks['out'], get('ground') or pal['paper'])
    if 'sky' in masks:
        put(masks['sky'] & ~masks['out'], get('sky') or pal['sky'])
    # ---- 房间里的面
    by_cls = {}
    for oid, c in cls_of.items():
        by_cls.setdefault(c, []).append(oid)
    lut = np.full(int(max(ids.max(), max(cls_of) if cls_of else 0)) + 2, -1, np.int32)
    names = ['floor', 'wall', 'ceil', 'furn', 'unit', 'mech', 'stow']
    for k, c in enumerate(names):
        for oid in by_cls.get(c, []):
            lut[oid] = k
    cls_px = np.where((ids >= 0) & (ids < len(lut) - 1), lut[np.clip(ids, 0, len(lut) - 1)], -1)
    src = dict(floor='floor', wall='room', ceil='room', furn='furn', unit='unit', mech='mech', stow='room')   # 收着的单元与平涂时一样用房间的底色
    for k, c in enumerate(names):
        m = (cls_px == k) & ~masks['out']
        if c == 'unit':
            continue
        put(m, get(src[c]) or pal.get(src[c], pal['room']))
    # 人、猫的那块（矢量会盖住，这里只防漏边）
    put((ids >= 10000) & ~masks['out'], pal['fig'])

    # ---- 物体上的颜色跟着光走（light.py）：明暗缓冲里存的是压成整数的法向，朝上 / 朝下由法向现算
    lit = bool(fx.get('light') or fx.get('mat'))
    if lit:
        import light as LT
        nrm, nok = LT.decode_normals(shade)
        up_px, down_px = nok & (nrm[..., 2] > 0.5), nok & (nrm[..., 2] < -0.35)
    else:
        up_px, down_px = shade == 1, shade == 2

    # ---- 单元：按用途换色（没给就是 unit），再分朝上 / 朝下
    um = (cls_px == names.index('unit')) & ~masks['out']
    if um.any():
        uspec_default = get('unit') or pal['unit']
        by = fx.get('unit_by') or {}
        done = np.zeros_like(um)
        for oid in by_cls.get('unit', []):
            spec = by.get(role_of.get(oid), uspec_default)
            m = um & (ids == oid)
            if m.any():
                f = ctx.field(spec)
                img[m] = f[m]
                done |= m
        sh = fx.get('shade', 'flat' if lit else 'tint')
        top, under = um & up_px, um & down_px
        if sh == 'tint':
            img[top] = img[top] + (1 - img[top]) * 0.22
            img[under] = img[under] * 0.80
        elif isinstance(sh, tuple) and sh[0] == 'ht':
            ink, cell, ang, cov = sh[1], sh[2], sh[3], sh[4]
            img[top] = img[top] + (1 - img[top]) * 0.18
            dots = halftone(np.full((H, W), cov, np.float32), cell * ctx.ss * kq, ang, ctx.X, ctx.Y)
            ink3 = hex3(ink)
            mm = under
            img[mm] = img[mm] * (1 - dots[mm, None] * (1 - ink3))
        elif isinstance(sh, tuple) and sh[0] == 'top':
            # 只给台面上色（第五轮）：朝上的面换成这个颜色，其余的面保持单元的底色
            img[top] = hex3(sh[1])
        elif sh == 'flat':
            pass
        filled |= um

    # ---- 黑白的纹理（第五轮）：每一类（家具按种类）一层平的墨，正片叠底；和光、朝向无关
    if fx.get('tone'):
        img = _tone_layer(img, ctx, fx['tone'], cls_of, kinds or {}, masks, seed)

    if lit:
        img = _light_layer(img, ctx, fx, pal, cls_px, names, masks, nrm, nok, scene or {}, seed)
    if fx.get('pieces'):
        img = _piece_layer(img, ctx, fx, pal, cls_of, masks, seed)

    # ---- 油墨颗粒：只给上了颜色的面，颜色越深越看得出；纸色的墙和地面几乎不受影响
    g = float(fx.get('grain', 0))
    if g > 0:
        n = grain_field(H, W, seed, px=ctx.ss)
        lum = img @ np.array([0.2126, 0.7152, 0.0722], np.float32)
        w = np.clip((1.0 - lum) * 1.3, 0, 1) ** 1.2
        img = img * (1 + g * 0.07 * n[..., None] * w[..., None])
        # 孔版那种掉墨：深色的面上极少几点露出纸色（每一百个像素不到一个）
        sp = grain_field(H, W, seed + 1, px=ctx.ss * 0.7)
        drop = (np.clip((sp - (2.9 - 0.4 * g)) * 1.2, 0, 1) * w)[..., None]
        paper = hex3(pal.get('room', '#FFFFFF'))
        img = img * (1 - drop) + paper * drop

    # ---- 叠印的各版：正片叠底，按 shift 错开
    for p in fx.get('plates', []):
        what = p['what']
        if what == 'shadow':
            cov = masks.get('shadow', np.zeros((H, W), np.float32)).astype(np.float32)
        elif what == 'unit':
            cov = um.astype(np.float32)
        elif what == 'out':
            cov = masks['out'].astype(np.float32)
        else:
            k = names.index(what)
            cov = ((cls_px == k) & ~masks['out']).astype(np.float32)
        cov = cov * float(p.get('cover', 1.0))
        if p.get('ht'):
            cell, ang = p['ht']
            cov = halftone(cov, cell * ctx.ss * kq, ang, ctx.X, ctx.Y) * (cov > 0.01)
        dx, dy = p.get('shift', (0, 0))
        if dx or dy:
            cov = np.roll(np.roll(cov, int(round(dy * ctx.ss * kq)), 0), int(round(dx * ctx.ss * kq)), 1)
        if p.get('grain'):
            n = grain_field(H, W, seed + 5, px=ctx.ss)
            cov = np.clip(cov * (1 + p['grain'] * 0.18 * n), 0, 1)
        ink = hex3(p['ink'])
        img = img * (1 - cov[..., None] * (1 - ink))

    out = Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB').resize((buf.cam.W, buf.cam.H), Image.LANCZOS)
    cut_img = None
    if fx.get('cut') is not None:
        f = ctx.field(fx['cut'])
        if g > 0:
            n = grain_field(H, W, seed + 9, px=ctx.ss)
            f = f * (1 + g * 0.05 * n[..., None])
        cut_img = Image.fromarray((np.clip(f, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB').resize((buf.cam.W, buf.cam.H), Image.LANCZOS)
    return out, cut_img


def _line_screen(X, Y, pitch, ang, lw):
    a = math.radians(ang)
    u = (X * math.cos(a) + Y * math.sin(a)) / pitch
    d = np.abs(u - np.round(u)) * pitch
    return np.clip(lw / 2 - d + 0.5, 0, 1).astype(np.float32)


def _tone_layer(img, ctx, tone, cls_of, kinds, masks, seed):
    """tone = {类别 或 家具种类 或 'out': [做法, …]}，做法（像素都按终稿 2400 宽写）：
      ('flat', 色)                         平涂一层
      ('stipple', 墨, 密度, 半径)          随机的点：每个终稿像素落一个点的几率、点的半径
      ('dots', 墨, 格, 半径, 几率)         点画：一格一个点、在格里随机挪
      ('screen', 墨, 覆盖, 格, 角度)       网点
      ('lines', 墨, 间距, 角度, 线宽)      平行线
    都是画面上的平的纹理（不跟着朝向、光变），按墨的颜色正片叠底。"""
    from scipy import ndimage
    buf = ctx.buf
    ids = buf.ids
    H, W = ids.shape
    ss, kq = ctx.ss, getattr(ctx, 'kq', 1.0)
    out = masks['out']
    lut = {}
    for oid, c in cls_of.items():
        key = kinds.get(oid) if kinds.get(oid) in tone else c
        if key in tone:
            lut.setdefault(key, []).append(oid)
    regions = {}
    for key, oids in lut.items():
        regions[key] = np.isin(ids, oids) & ~out
    if 'out' in tone:
        regions['out'] = out
    if 'sky' in tone and 'sky' in masks:
        regions['sky'] = masks['sky'] & ~out
    img = img.copy()
    for n, (key, m) in enumerate(sorted(regions.items())):
        if not m.any():
            continue
        for j, spec in enumerate(tone[key]):
            kind = spec[0]
            if kind == 'flat':
                img[m] = hex3(spec[1])
                continue
            ink = hex3(spec[1])
            if kind == 'stipple':
                dens, r = float(spec[2]), float(spec[3])
                rng = np.random.default_rng(seed * 131 + n * 17 + j)
                Hf, Wf = H // ss + 1, W // ss + 1
                pts = rng.random((Hf, Wf)) < dens
                imp = np.zeros((H, W), np.float32)
                yy, xx = np.nonzero(pts)
                yy = np.clip(yy * ss + rng.integers(0, ss, len(yy)), 0, H - 1)
                xx = np.clip(xx * ss + rng.integers(0, ss, len(xx)), 0, W - 1)
                imp[yy, xx] = 1.0
                R = max(r * ss * kq, 0.5)
                g = int(math.ceil(R + 1))
                ky, kx = np.mgrid[-g:g + 1, -g:g + 1]
                ker = np.clip(R - np.sqrt(kx * kx + ky * ky) + 0.5, 0, 1).astype(np.float32)
                cov = np.clip(ndimage.convolve(imp, ker, mode='constant'), 0, 1)
            elif kind == 'dots':
                # 点画：一格一个点、在格里随机挪（比纯随机的点匀，像手点的），p = 这一格有没有点的几率
                cell, r, prob = float(spec[2]), float(spec[3]), float(spec[4]) if len(spec) > 4 else 1.0
                rng = np.random.default_rng(seed * 131 + n * 17 + j)
                c = cell * ss * kq
                ny, nx = int(H / c) + 2, int(W / c) + 2
                gy, gx = np.mgrid[0:ny, 0:nx].astype(np.float32)
                keep = rng.random((ny, nx)) < prob
                yy = ((gy + 0.1 + 0.8 * rng.random((ny, nx))) * c)[keep]
                xx = ((gx + 0.1 + 0.8 * rng.random((ny, nx))) * c)[keep]
                ok = (yy < H) & (xx < W)
                imp = np.zeros((H, W), np.float32)
                np.add.at(imp, (yy[ok].astype(int), xx[ok].astype(int)), 1.0)
                R = max(r * ss * kq, 0.5)
                g = int(math.ceil(R + 1))
                ky, kx = np.mgrid[-g:g + 1, -g:g + 1]
                ker = np.clip(R - np.sqrt(kx * kx + ky * ky) + 0.5, 0, 1).astype(np.float32)
                cov = np.clip(ndimage.convolve(imp, ker, mode='constant'), 0, 1)
            elif kind == 'screen':
                cov = halftone(np.full((H, W), float(spec[2]), np.float32), float(spec[3]) * ss * kq, float(spec[4]), ctx.X, ctx.Y)
            elif kind == 'lines':
                cov = _line_screen(ctx.X, ctx.Y, float(spec[2]) * ss * kq, float(spec[3]), float(spec[4]) * ss * kq)
            else:
                raise ValueError(f'不认得的纹理：{spec!r}')
            c = cov[m][:, None]
            img[m] = img[m] * (1 - c * (1 - ink))
    return img


def _light_layer(img, ctx, fx, pal, cls_px, names, masks, nrm, nok, scene, seed):
    """材质（只改明度）→ 冷暖两套颜色之间的明暗 + 太阳的光斑和影子 → 墙角压暗。见 light.py 的说明"""
    import light as LT
    lt = fx.get('light') or {}
    mt = fx.get('mat') or {}
    H, W = ctx.H, ctx.W
    cam = ctx.cam
    room = nok & ~masks['out'] & (cls_px >= 0)
    if not room.any():
        return img
    idx = np.nonzero(room)
    P, n = ctx.P[idx], nrm[idx]
    cls = cls_px[idx]
    ppm = (cam.k / np.maximum(ctx.dist[idx], 1e-3)) if cam.persp else np.full(len(P), cam.k, np.float32)
    rgb = img[idx]

    # ---- 材质：在 OKLab 的明度上加减
    amt = float(mt.get('amount', 1.0))
    if mt and amt > 0:
        lab = to_lab(rgb)
        dl = np.zeros(len(P), np.float32)
        ci = {c: names.index(c) for c in names}
        fl = mt.get('floor')
        m = (cls == ci['floor']) & (n[:, 2] > 0.5)          # 只贴在朝上的地面上（楼板的侧面不贴，不然纹理会被拉成竖条）
        if fl and m.any():
            if fl[0] == 'oak':
                along, pitch, off = scene.get('floor', ('x', 0.14, 0.0))
                dl[m] = LT.mat_oak(P[m], along, pitch, off, ppm[m])
            elif fl[0] == 'terrazzo':
                d, chip, hue = LT.mat_terrazzo(P[m], ppm[m])
                dl[m] = d
                chips = fl[1] if len(fl) > 1 else ['#C9BFAE', '#8E8577', '#E9E2D4', '#B8775A']
                cl = np.stack([to_lab(hex3(c)) for c in chips])
                k = np.minimum((hue * len(chips)).astype(int), len(chips) - 1)
                lab_m = lab[m]
                lab_m = lab_m + (cl[k] - lab_m) * (chip[:, None] * 0.85)
                lab[m] = lab_m
        for cname, key in (('wall', 'wall'), ('ceil', 'wall'), ('stow', None)):
            spec = mt.get(key) if key else None
            m = cls == ci[cname]
            if spec and m.any() and spec[0] == 'lime':
                dl[m] = LT.mat_lime(P[m], ppm[m])
        fu = mt.get('furn')
        m = cls == ci['furn']
        if fu and m.any():
            dl[m] = LT.mat_linen(P[m], n[m], ppm[m]) if fu[0] == 'linen' else LT.mat_boucle(P[m], ppm[m])
        un = mt.get('unit')
        m = cls == ci['unit']
        if un and m.any():
            if un[0] == 'rib':
                dl[m] = LT.mat_rib(P[m], n[m], ppm[m])
            elif un[0] == 'satin':
                # 缎面：没有纹理，朝向变一点颜色就亮一截（一条斜着的高光带），在下面打光时处理，这里只给一点很慢的起伏
                dl[m] = 0.012 * (LT.noise3(P[m], 0.3, 91) - 0.5)
        me = mt.get('mech')
        m = cls == ci['mech']
        if me and m.any():
            dl[m] = LT.mat_brushed(P[m], n[m], ppm[m])
        lab[:, 0] += amt * dl
        rgb = from_lab(lab)

    # ---- 明暗（每一层都能单独关掉，见 light.py 的说明）
    if lt:
        cool = hex3(lt.get('cool', pal.get('far', '#7F8FC4')))
        warm = hex3(lt.get('warm', '#FFE2B8'))
        mul = lambda c, k: c * (1 - np.clip(k, 0, 1)[:, None] * (1 - cool))            # 压一层冷色的墨（正片叠底）
        scr = lambda c, k: 1 - (1 - c) * (1 - np.clip(k, 0, 1)[:, None] * warm)        # 罩一层暖光（滤色）
        F = np.asarray(lt.get('fill', (-0.45, -0.75, 0.55)), np.float32); F /= np.linalg.norm(F)
        # ① 朝向：朝着天光来的方向（窗户、上方）的面偏暖偏亮，背着的面偏冷偏暗——中间朝向的面就是配色给的颜色
        fc, fw = lt.get('face', (0.0, 0.0))
        if fc or fw:
            av = 0.5 + 0.5 * (n @ F)
            rgb = mul(rgb, fc * np.clip((0.62 - av) / 0.62, 0, 1) ** 0.9)
            rgb = scr(rgb, fw * np.clip((av - 0.62) / 0.38, 0, 1))
        # ② 面里的渐变：墙和家具竖着的面越往下越深（贴地的地方暗），房间离窗户越远越暗
        gk = float(lt.get('ground', 0))
        if gk:
            vert = np.abs(n[:, 2]) < 0.5
            zr = np.where(cls == names.index('furn'), 0.85, 1.6)
            g = (1 - np.clip(P[:, 2] / zr, 0, 1)) ** 1.6
            rgb = mul(rgb, gk * g * vert * np.isin(cls, [names.index('wall'), names.index('furn')]))
        wk = float(lt.get('window', 0))
        if wk:
            h = scene.get('half', 3.32)
            dwin = np.minimum(P[:, 1] + h, P[:, 0] + h)            # 到 −Y、−X 两面有窗的墙的距离
            wl = np.exp(-np.clip(dwin, 0, None) / float(lt.get('window_m', 2.4)))
            rgb = scr(rgb, wk * 0.55 * wl)
            rgb = mul(rgb, wk * 0.6 * (1 - wl))
        # ③ 太阳：从窗户斜着照进来的光斑（暖），光斑里有单元、家具、人、猫的影子；光斑以外稍微压暗一点，光斑才跳出来
        sk = float(lt.get('sun_k', 0))
        if sk and lt.get('sun') is not None:
            Ls = np.asarray(lt['sun'], np.float32); Ls /= np.linalg.norm(Ls)
            sund = np.clip(n @ Ls, 0, 1)
            if scene.get('meshes'):
                # occlude='room'：墙和天花也挡光，只有窗户里进来的几块光斑；'objects'：只有单元、家具、人、猫挡光（轴测图常用的那种日照）
                meshes = list(scene['meshes'] if lt.get('occlude', 'room') == 'room' else scene.get('objects', scene['meshes']))
                meshes += list(scene.get('figs', [])) if lt.get('figs', True) else []
                vis = LT.shadow_vis(P, n, meshes, Ls, scene['LW'], soft=float(lt.get('soft', 0.05)),
                                    center=scene.get('center', (0, 0, 1.5)), span=scene.get('span', 11.0))
            else:
                vis = np.ones(len(P), np.float32)
            sun = vis * np.clip((sund - 0.02) / 0.25, 0, 1)
            sun = sun * sun * (3 - 2 * sun)
            rgb = mul(rgb, float(lt.get('sun_dim', 0.18)) * (1 - sun))
            rgb = scr(rgb, sk * sun * (0.55 + 0.45 * sund))
        else:
            Ls = np.asarray(lt.get('sun', F), np.float32); Ls /= np.linalg.norm(Ls)
            vis = np.ones(len(P), np.float32)
        # 缎面的单元：朝光与朝镜头之间的那个方向上亮一条
        if (mt.get('unit') or (None,))[0] == 'satin':
            m = cls == names.index('unit')
            if m.any():
                Vd = (cam.eye[None, :] - P[m]) if cam.persp else np.broadcast_to(-cam.f, P[m].shape)
                Vd = Vd / np.linalg.norm(Vd, axis=1, keepdims=True)
                Hh = Vd + Ls[None, :]; Hh /= np.linalg.norm(Hh, axis=1, keepdims=True)
                spec = np.clip((n[m] * Hh).sum(1), 0, 1) ** 14 * (0.4 + 0.6 * vis[m])
                rgb[m] = rgb[m] + (1 - rgb[m]) * (0.5 * spec[:, None])
        # ④ 墙角、物体贴地处压暗（同一层冷色墨）
        ak = float(lt.get('ao', 0.0))
        if ak > 0:
            keepd = ctx.buf.ids < 10000
            dist = np.where(keepd, ctx.dist, np.nan)
            ao = _ao(dist, keepd & ~masks['out'], float(lt.get('ao_px', 22)) * ctx.ss * getattr(ctx, 'kq', 1.0))
            rgb = mul(rgb, ak * ao[idx])
    img = img.copy()
    img[idx] = np.clip(rgb, 0, 1)
    return img


def _h(oid, k, seed):
    """每一块、每一项一个固定的随机数（0–1），同一张图每次出来都一样"""
    x = (int(oid) * 2654435761 + int(k) * 40503 + int(seed) * 97) & 0xFFFFFFFF
    x ^= x >> 15; x = (x * 2246822519) & 0xFFFFFFFF; x ^= x >> 13; x = (x * 3266489917) & 0xFFFFFFFF; x ^= x >> 16
    return x / 4294967295.0


def _ramp(stops, t):
    """几个颜色等距排成一条，t 0–1 → 颜色（OKLab 里插值，同 mix）"""
    n = len(stops) - 1
    if n < 1:
        return mix(stops[0], stops[0], t)
    tt = np.clip(t, 0, 1) * n
    k = np.minimum(np.floor(tt).astype(int), n - 1)
    out = None
    for i in range(n):
        ci = mix(stops[i], stops[i + 1], tt - i)
        out = ci if out is None else np.where((k == i)[..., None], ci, out)
    return out


def _piece_layer(img, ctx, fx, pal, cls_of, masks, seed):
    """拼贴式的渐变（第四轮之三，2026-11-21）：每个物体当成从一张渐变纸上剪下来的一块。

    渐变是这张纸自己的颜色，和光、朝向、体积都没有关系：一块里所有的面同一道渐变（不分朝上朝侧），
    方向按块随机，只取渐变纸上的一段；同一类东西可以从同一张大纸上剪（sheet）。没有影子。
    fx['pieces'] = {类别: dict(pairs=[(色0, 色1), …], ang=[角度…], span=最短取多长 0–1, sheet=False,
                               grain=颗粒 0–1, steps=色带档数, tex=None|'ht'|'mottle', shift=错开多少像素（终稿）, edge=纸边宽（终稿像素）)}
    类别：floor / wall / ceil / furn / unit / mech / stow。纸边和错开露出的缝用 fx['gap']（默认房间的纸色）。"""
    from scipy import ndimage
    spec_all = fx['pieces']
    buf = ctx.buf
    ids = buf.ids
    H, W = ids.shape
    ss, kq = ctx.ss, getattr(ctx, 'kq', 1.0)
    paper = hex3(fx.get('gap') or pal.get('room', '#FFFFFF'))
    out = masks['out']
    lab = np.where((ids >= 0) & (ids < 10000), ids + 1, 0)
    sl = ndimage.find_objects(lab)
    items = []
    for oid, c in cls_of.items():
        if c not in spec_all or oid >= len(sl) or sl[oid] is None:
            continue
        s = sl[oid]
        m = (ids[s] == oid) & ~out[s]
        if not m.any():
            continue
        d = ctx.dist[s][m]
        items.append((float(np.nanmean(d)) if np.isfinite(d).any() else 0.0, oid, c, s, m))
    if not items:
        return img
    img = img.copy()
    # 一张图共用的颗粒（终稿一个像素一粒）
    rng = np.random.default_rng(seed + 77)
    g0 = rng.random((H // ss + 2, W // ss + 2)).astype(np.float32)
    grain = np.repeat(np.repeat(g0, ss, 0), ss, 1)[:H, :W]
    # 同一张大纸剪的那几类：先求整类的外框
    sheet_box = {}
    for _, oid, c, s, m in items:
        if spec_all[c].get('sheet') == 'image':
            sheet_box[c] = (0, H, 0, W)                    # 整张图一张纸
        elif spec_all[c].get('sheet'):
            y0, y1, x0, x1 = s[0].start, s[0].stop, s[1].start, s[1].stop
            b = sheet_box.get(c)
            sheet_box[c] = (y0, y1, x0, x1) if b is None else (min(b[0], y0), max(b[1], y1), min(b[2], x0), max(b[3], x1))
    # 错开会露出底下的纸：先把这些块的位置铺成纸色
    for _, oid, c, s, m in items:
        if spec_all[c].get('shift'):
            img[s][m] = paper
    # 远的先贴、近的后贴：错开以后近的盖在远的上面
    for d, oid, c, s, m in sorted(items, key=lambda t: -t[0]):
        sp = spec_all[c]
        pairs = sp.get('pairs') or [(pal.get(c, '#888888'),) * 2]
        k = int(_h(oid, 1, seed) * len(pairs)) % len(pairs)
        c0, c1 = pairs[k]
        angs = sp.get('ang')
        if sp.get('sheet'):
            ang = (angs or [30])[0]
        elif angs:
            ang = angs[int(_h(oid, 2, seed) * len(angs)) % len(angs)]
        else:
            ang = _h(oid, 2, seed) * 360
        sh = float(sp.get('shift', 0)) * ss * kq
        dx = int(round((_h(oid, 3, seed) * 2 - 1) * sh)); dy = int(round((_h(oid, 4, seed) * 2 - 1) * sh))
        pad = max(abs(dx), abs(dy)) + 2
        y0, y1, x0, x1 = s[0].start, s[0].stop, s[1].start, s[1].stop
        Y0, Y1, X0, X1 = max(0, y0 + dy), min(H, y1 + dy), max(0, x0 + dx), min(W, x1 + dx)
        if Y1 <= Y0 or X1 <= X0:
            continue
        mm = m[(Y0 - dy - y0):(Y1 - dy - y0), (X0 - dx - x0):(X1 - dx - x0)]
        win = (slice(Y0, Y1), slice(X0, X1))
        Yg, Xg = np.mgrid[Y0:Y1, X0:X1].astype(np.float32)
        if sp.get('sheet'):
            by0, by1, bx0, bx1 = sheet_box[c]
            by0 += dy; by1 += dy; bx0 += dx; bx1 += dx
        else:
            by0, by1, bx0, bx1 = y0 + dy, y1 + dy, x0 + dx, x1 + dx
        a = math.radians(ang)
        ca, sa = math.cos(a), -math.sin(a)                # 角度 0 = 从左到右，90 = 从下到上
        proj = (Xg - bx0) * ca + (Yg - by0) * sa
        corners = [(0, 0), (bx1 - bx0, 0), (0, by1 - by0), (bx1 - bx0, by1 - by0)]
        cp = [cx * ca + cy * sa for cx, cy in corners]
        t = (proj - min(cp)) / max(max(cp) - min(cp), 1.0)
        pos = sp.get('pos')
        if pos:
            # 颜色跟着物体在房间里的位置走（第四轮之四，2026-11-23）：沿房间里的一条轴，从 lo 到 hi 取 0–1。
            # 'piece' = 一块按自己的中心取一个数，块里再叠一点同一个方向的渐变（inner）；'pixel' = 每个像素按自己的位置取
            ax, ay = pos.get('axis', (1.0, -1.0))
            nrm = math.hypot(ax, ay) or 1.0
            ax, ay = ax / nrm, ay / nrm
            lo_, hi_ = pos.get('range', (-4.0, 4.0))
            inner = float(pos.get('inner', 0.0))
            if pos.get('mode', 'piece') == 'pixel':
                src = (slice(Y0 - dy, Y1 - dy), slice(X0 - dx, X1 - dx))
                Pw = ctx.P[src]
                tw = (Pw[..., 0] * ax + Pw[..., 1] * ay - lo_) / (hi_ - lo_)
                tw = np.where(np.isfinite(tw), tw, 0.5)
            else:
                Pm = ctx.P[s][m]
                cw = np.nanmean(Pm[:, 0]) * ax + np.nanmean(Pm[:, 1]) * ay if np.isfinite(Pm[:, :2]).any() else 0.5 * (lo_ + hi_)
                tw = (cw - lo_) / (hi_ - lo_)
            t = np.clip(tw, 0, 1) + inner * (t - 0.5)
        span = float(sp.get('span', 1.0))
        if span < 1.0 and not sp.get('sheet') and not pos:
            L = span + (1 - span) * _h(oid, 5, seed)
            lo = (1 - L) * _h(oid, 6, seed)
            t = lo + t * L
        if sp.get('flip') and _h(oid, 7, seed) < 0.5:
            t = 1 - t
        g = float(sp.get('grain', 0))
        if g > 0:
            t = t + (grain[win] - 0.5) * g
            if sp.get('stretch', not pos):
                t = (t - 0.5) * (1 + 3 * g) + 0.5
        t = np.clip(t, 0, 1)
        n = int(sp.get('steps', 0))
        if n > 1:
            t = np.floor(np.clip(t, 0, 0.9999) * n) / (n - 1)
        tex = sp.get('tex')
        if tex == 'ht':
            cell, hang = sp.get('ht', (4.0, 45))
            dots = halftone(t, cell * ss * kq, hang, Xg, Yg)
            col = mix(c0, c1, dots)
        elif sp.get('stops'):
            col = _ramp(sp['stops'], t)                    # 不止两色：沿着 t 排成一条
        else:
            col = mix(c0, c1, t)
        if tex == 'mottle':
            cl = value_noise(Y1 - Y0, X1 - X0, 0.06 * W, seed=int(_h(oid, 8, seed) * 9999), octaves=3)
            lab_ = to_lab(col)
            lab_[..., 0] += float(sp.get('mottle', 0.05)) * (cl - 0.5)
            col = from_lab(lab_)
        e = float(sp.get('edge', 0)) * ss * kq
        if e >= 0.5:
            inner = ndimage.binary_erosion(mm, iterations=max(1, int(round(e))))
            col = np.where((mm & ~inner)[..., None], paper[None, None, :], col)
        sub = img[win]
        sub[mm] = col[mm]
    return img


def _ao(dist, keep, sigma):
    """深度缓冲的反锐化（Luft 等 2006）：人和猫那几块平面形状不算在深度里（不然它们周围会出一圈暗边）"""
    from scipy import ndimage
    ok = np.isfinite(dist)
    far = np.nanmax(np.where(ok, dist, np.nan)) * 1.15 if ok.any() else 1.0
    d = np.where(ok, dist, 0).astype(np.float32)
    w = ok.astype(np.float32)
    g = ndimage.gaussian_filter(d, sigma, mode='nearest') / np.maximum(ndimage.gaussian_filter(w, sigma, mode='nearest'), 1e-4)
    rel = (g - np.where(ok, dist, far)) / np.maximum(np.where(ok, dist, far), 1e-3)
    dark = np.clip(-rel * 10.0, 0, 1) ** 0.75
    return np.where(keep & ok, dark, 0).astype(np.float32)


def data_uri(im, fmt='PNG'):
    bio = io.BytesIO()
    if fmt == 'PNG':
        im.save(bio, 'PNG', optimize=True)
        mt = 'png'
    else:
        im.save(bio, 'JPEG', quality=93)
        mt = 'jpeg'
    return f'data:image/{mt};base64,{base64.b64encode(bio.getvalue()).decode()}'


def paper_grain_filter(W, H, amount, seed=3):
    """整张图（线也在内）上叠一层纸纹：SVG 的分形噪声，正片叠底"""
    if amount <= 0:
        return ''
    a = 0.07 * amount
    # 噪声的 R 通道在 0.5 上下：alpha = 2a·(R − 0.5)，低于 0.5 的地方不压，高于的地方压一点黑
    return (f'<filter id="pg" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">'
            f'<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="{seed}" result="n"/>'
            f'<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  {a * 2:.3f} 0 0 0 {-a:.3f}"/>'
            f'</filter><rect width="{W}" height="{H}" filter="url(#pg)" style="mix-blend-mode:multiply"/>')
