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
def paint(buf, cls_of, role_of, fx, pal, masks, seed=11):
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
        sh = fx.get('shade', 'tint')
        top, under = um & (shade == 1), um & (shade == 2)
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
        elif sh == 'flat':
            pass
        filled |= um

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
