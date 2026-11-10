"""矢量线稿的底层：相机、深度缓冲、从网格里找线、判断每一段看不看得见、它是外轮廓还是里面的线、写 SVG。

第一、二轮的线是「渲染通道 → 像素上找边」得来的：哪里有物体编号或深度的跳变哪里就是线，粗细只能事后按像素猜。
这里反过来，线先在三维里一根一根有名有姓（谁的、哪一类），再按机位判断可见性，所以每根线的粗细由它是什么决定：

  1. 实体（三角网格 + 物体编号）先画一张深度缓冲和一张编号缓冲（光栅化核心复用 scripts/handover/raster.c）；
  2. 线的来源有三种：网格的特征边（轮廓边、折边、开口边，由 features() 按机位找出来）、
     人为加的线（外皮上的缝、地板缝、排线，本来就是三维里的折线）、剖切面（剖到的实体的截面）；
  3. 每根线沿着屏幕每隔半个像素取一个点，和深度缓冲比，取出看得见的那几段；
  4. 每一段再看线的两侧各是谁：两侧都是自己 = 物体里面的线；有一侧是别的东西 = 外轮廓。

坐标：世界系 X、Y 是平面，Z 向上，单位米。
"""
import ctypes, math, os, subprocess, base64, io
from pathlib import Path
import numpy as np

_src = Path(__file__).resolve().parents[2] / 'handover' / 'raster.c'
_so = os.environ.get('RASTER_SO') or str(_src.with_name('raster.so'))
if not os.path.exists(_so):  # 首次运行现编译（raster.so 不进仓库）
    subprocess.run(['cc', '-O2', '-shared', '-fPIC', str(_src), '-o', _so], check=True)
_lib = ctypes.CDLL(_so)
_lib.raster.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p]


# ---------------------------------------------------------------- 相机
class Cam:
    """透视（给 fov：水平视角，度）或正交（给 width：画面宽对应多少米）。cy = 视平线在画面高度的几成处（一点透视里把地平线放低用）"""

    def __init__(self, eye, look, W, H, fov=None, width=None, up=(0, 0, 1), cy=0.5, cx=0.5):
        self.eye = np.asarray(eye, float)
        f = np.asarray(look, float) - self.eye
        f /= np.linalg.norm(f)
        r = np.cross(f, np.asarray(up, float)); r /= np.linalg.norm(r)
        self.r, self.u, self.f = r, np.cross(r, f), f
        self.W, self.H = W, H
        self.persp = fov is not None
        self.k = (W / 2) / math.tan(math.radians(fov) / 2) if self.persp else W / width
        self.cx, self.cy = W * cx, H * cy

    def cam(self, P):
        Q = np.asarray(P, float) - self.eye
        return Q @ self.r, Q @ self.u, Q @ self.f

    def px(self, P):
        x, y, z = self.cam(P)
        if self.persp:
            zz = np.maximum(z, 1e-4)
            return self.cx + self.k * x / zz, self.cy - self.k * y / zz, z
        return self.cx + self.k * x, self.cy - self.k * y, z

    def key(self, z):
        """深度缓冲里存的量：在屏幕上线性（透视取 −1/z），越小越近"""
        return -1.0 / np.maximum(z, 1e-4) if self.persp else z

    def zof(self, key):
        return -1.0 / key if self.persp else key

    def ppm(self, z):
        """这个深度上一米多少像素"""
        return self.k / z if self.persp else self.k + 0 * np.asarray(z, float)

    def toward(self, P):
        if self.persp:
            d = self.eye - np.asarray(P, float)
            return d / np.linalg.norm(d)
        return -self.f

    def near_plane(self, near=0.15):
        return self.f, float(self.f @ self.eye) + near


# ---------------------------------------------------------------- 网格
BOX_T = np.array([[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]])


def box(x0, x1, y0, y1, z0, z1):
    V = np.array([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], float)
    return V, BOX_T.copy()


def obox(c, h, rot=None):
    """带朝向的长方体（cafe-export 的 furnBoxes）：c = 中心，h = 半尺寸（块自身 x、平面进深、高），
    rot = (c, s)：块自身 (lx, ly) → 世界 (cx + lx·c + ly·s, cy − lx·s + ly·c)"""
    V, T = box(-h[0], h[0], -h[1], h[1], -h[2], h[2])
    if rot is not None:
        co, si = rot
        x, y = V[:, 0].copy(), V[:, 1].copy()
        V[:, 0] = x * co + y * si
        V[:, 1] = -x * si + y * co
    return V + np.asarray(c, float), T


def prism(cx, cy, z0, z1, r, n=24, r1=None):
    """竖着的圆柱（n 边棱柱，带上下盖）；r1 = 上口半径（缺省同 r）"""
    a = np.linspace(0, 2 * math.pi, n, endpoint=False)
    r1 = r if r1 is None else r1
    lo = np.c_[cx + r * np.cos(a), cy + r * np.sin(a), np.full(n, z0)]
    hi = np.c_[cx + r1 * np.cos(a), cy + r1 * np.sin(a), np.full(n, z1)]
    V = np.vstack([lo, hi, [[cx, cy, z0]], [[cx, cy, z1]]])
    T = []
    for i in range(n):
        j = (i + 1) % n
        T += [[i, j, n + j], [i, n + j, n + i], [2 * n, j, i], [2 * n + 1, n + i, n + j]]
    return V, np.array(T)


def merge(meshes):
    Vs, Ts, off = [], [], 0
    for V, T in meshes:
        Vs.append(V); Ts.append(T + off); off += len(V)
    return np.vstack(Vs), np.vstack(Ts)


def weld(V, T, tol=1e-3):
    """把位置相同的顶点并成一个（外皮的每条带、每道缝是各自一份顶点，并起来才知道谁挨着谁）"""
    q = np.round(V / tol).astype(np.int64)
    _, first, inv = np.unique(q, axis=0, return_index=True, return_inverse=True)
    T2 = inv.reshape(-1)[T]
    ok = (T2[:, 0] != T2[:, 1]) & (T2[:, 1] != T2[:, 2]) & (T2[:, 0] != T2[:, 2])
    return V[first], T2[ok]


def clip_mesh(V, T, n, d):
    """只留 n·p ≥ d 那一侧（剖切、相机近平面）。跨在面上的三角形切开"""
    n = np.asarray(n, float)
    s = V @ n - d
    inside = s >= 0
    cnt = inside[T].sum(1)
    out_T = [T[cnt == 3]]
    V2 = [V]
    nv = len(V)
    cut = np.where((cnt == 1) | (cnt == 2))[0]
    new_pts = []
    extra = []
    for ti in cut:
        tri = T[ti]
        ins = inside[tri]
        # 把里面的顶点转到最前
        if ins.sum() == 1:
            k = int(np.argmax(ins))
            a, b, c = tri[k], tri[(k + 1) % 3], tri[(k + 2) % 3]
            pb = V[a] + (V[b] - V[a]) * (s[a] / (s[a] - s[b]))
            pc = V[a] + (V[c] - V[a]) * (s[a] / (s[a] - s[c]))
            new_pts += [pb, pc]
            extra.append([a, nv, nv + 1]); nv += 2
        else:
            k = int(np.argmin(ins))
            a, b, c = tri[k], tri[(k + 1) % 3], tri[(k + 2) % 3]     # a 在外
            pb = V[b] + (V[a] - V[b]) * (s[b] / (s[b] - s[a]))
            pc = V[c] + (V[a] - V[c]) * (s[c] / (s[c] - s[a]))
            new_pts += [pb, pc]
            extra += [[nv, b, c], [nv, c, nv + 1]]; nv += 2
    if new_pts:
        V2.append(np.array(new_pts)); out_T.append(np.array(extra))
    Vn, Tn = np.vstack(V2), np.vstack(out_T)
    if len(Tn) == 0:
        return Vn, np.zeros((0, 3), int)
    return weld(Vn, Tn, 1e-5)      # 切出来的新顶点每个三角形各有一份，并起来，免得切口两侧的边被当成开口边


def clip_segs(S, n, d):
    """线段只留 n·p ≥ d 那一侧。S：(K, 2, 3)"""
    if len(S) == 0:
        return S, np.zeros(0, int)
    n = np.asarray(n, float)
    sa, sb = S[:, 0] @ n - d, S[:, 1] @ n - d
    keep = (sa >= 0) | (sb >= 0)
    S = S[keep].copy(); sa, sb = sa[keep], sb[keep]
    m = sa < 0
    t = sa[m] / (sa[m] - sb[m])
    S[m, 0] = S[m, 0] + (S[m, 1] - S[m, 0]) * t[:, None]
    m = sb < 0
    t = sb[m] / (sb[m] - sa[m])
    S[m, 1] = S[m, 1] + (S[m, 0] - S[m, 1]) * t[:, None]
    return S, np.where(keep)[0]


def section_caps(V, T, n, d):
    """实体被平面切到的截面：平面与每个三角形的交线段，首尾接成圈。返回 [圈上的点 (N, 3)]"""
    n = np.asarray(n, float)
    s = V @ n - d
    segs = []
    for tri in T:
        ss = s[tri]
        if (ss >= 0).all() or (ss < 0).all():
            continue
        pts = []
        for i in range(3):
            a, b = tri[i], tri[(i + 1) % 3]
            if (s[a] >= 0) != (s[b] >= 0):
                pts.append(V[a] + (V[b] - V[a]) * (s[a] / (s[a] - s[b])))
        if len(pts) == 2:
            segs.append((pts[0], pts[1]))
    # 接成圈
    loops = []
    key = lambda p: tuple(np.round(p, 5))
    left = list(segs)
    while left:
        a, b = left.pop()
        loop = [a, b]
        grown = True
        while grown:
            grown = False
            for i, (c, e) in enumerate(left):
                if key(c) == key(loop[-1]):
                    loop.append(e); left.pop(i); grown = True; break
                if key(e) == key(loop[-1]):
                    loop.append(c); left.pop(i); grown = True; break
                if key(c) == key(loop[0]):
                    loop.insert(0, e); left.pop(i); grown = True; break
                if key(e) == key(loop[0]):
                    loop.insert(0, c); left.pop(i); grown = True; break
        loops.append(np.array(loop))
    return loops


# ---------------------------------------------------------------- 深度缓冲
class Buffers:
    def __init__(self, cam, ss=2):
        self.cam, self.ss = cam, ss
        self.W, self.H = cam.W * ss, cam.H * ss
        self.z = np.full(self.W * self.H, np.inf, np.float32)
        self.i = np.full(self.W * self.H, -1, np.int32)
        # 第二份：同样的遮挡，但每个三角形记的是「明暗档」（给面的平涂分朝上、朝侧、朝下用），不参与找线
        self.z2 = np.full(self.W * self.H, np.inf, np.float32)
        self.s = np.zeros(self.W * self.H, np.int32)

    def add(self, V, T, oid, shade=None):
        if len(T) == 0:
            return
        x, y, z = self.cam.px(V)
        q = np.c_[x * self.ss, y * self.ss, self.cam.key(z)].astype(np.float32)
        tri = np.ascontiguousarray(q[T].reshape(-1, 9), np.float32)
        ids = np.full(len(tri), oid, np.int32)
        _lib.raster(self.W, self.H, len(tri), tri.ctypes.data, ids.ctypes.data, self.z.ctypes.data, self.i.ctypes.data)
        sh = np.ascontiguousarray(np.zeros(len(tri), np.int32) if shade is None else np.asarray(shade, np.int32))
        _lib.raster(self.W, self.H, len(tri), tri.ctypes.data, sh.ctypes.data, self.z2.ctypes.data, self.s.ctypes.data)

    def add_flat(self, geom, z, oid):
        """屏幕上的一块形状（shapely，终稿像素坐标）按深度 z（米）压进缓冲。返回 (这块形状的遮罩, 遮罩左上角)"""
        from PIL import Image, ImageDraw
        from shapely.geometry import box as sbox
        g = geom.intersection(sbox(0, 0, self.cam.W, self.cam.H))
        if g.is_empty:
            return None
        ss = self.ss
        x0, y0, x1, y1 = g.bounds
        X0, Y0 = max(0, int(math.floor(x0 * ss)) - 1), max(0, int(math.floor(y0 * ss)) - 1)
        X1, Y1 = min(self.W, int(math.ceil(x1 * ss)) + 1), min(self.H, int(math.ceil(y1 * ss)) + 1)
        if X1 <= X0 or Y1 <= Y0:
            return None
        im = Image.new('L', (X1 - X0, Y1 - Y0), 0)
        dr = ImageDraw.Draw(im)
        polys = [g] if g.geom_type == 'Polygon' else [q for q in getattr(g, 'geoms', []) if q.geom_type == 'Polygon']
        for pg in polys:
            dr.polygon([((x * ss - X0), (y * ss - Y0)) for x, y in pg.exterior.coords], fill=255)
            for hole in pg.interiors:
                dr.polygon([((x * ss - X0), (y * ss - Y0)) for x, y in hole.coords], fill=0)
        m = np.asarray(im) > 0
        key = float(self.cam.key(z))
        zv = self.z.reshape(self.H, self.W)[Y0:Y1, X0:X1]
        iv = self.i.reshape(self.H, self.W)[Y0:Y1, X0:X1]
        w = m & (key < zv)
        zv[w] = key; iv[w] = oid
        self.z2.reshape(self.H, self.W)[Y0:Y1, X0:X1][w] = key
        self.s.reshape(self.H, self.W)[Y0:Y1, X0:X1][w] = 0
        return m, X0, Y0, key

    def done(self):
        from scipy import ndimage
        self.zk = self.z.reshape(self.H, self.W)
        self.ids = self.i.reshape(self.H, self.W)
        self.shade = self.s.reshape(self.H, self.W)
        # 每个像素周围 3×3 里最远的深度：线贴着物体边缘时不被邻格的近处挡掉
        self.zfar = ndimage.maximum_filter(self.zk, size=3, mode='nearest')
        return self


# ---------------------------------------------------------------- 网格的特征边
def features(V, T, cam, crease_deg=38.0):
    """返回 (线段 (K, 2, 3), 类别)：0 = 轮廓边（两侧的面一个朝着相机一个背着）、1 = 折边、2 = 开口边。
    轮廓边的判法不依赖三角形的绕向：一条边两侧的第三个顶点投到屏幕上落在这条边的同一侧，它就是轮廓"""
    if len(T) == 0:
        return np.zeros((0, 2, 3)), np.zeros(0, int)
    N = len(V)
    e = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]])
    opp = np.concatenate([T[:, 2], T[:, 0], T[:, 1]])
    face = np.tile(np.arange(len(T)), 3)
    lo, hi = e.min(1), e.max(1)
    fwd = e[:, 0] < e[:, 1]
    k = lo.astype(np.int64) * N + hi
    order = np.argsort(k, kind='stable')
    ks = k[order]
    uniq, start, cnt = np.unique(ks, return_index=True, return_counts=True)
    fn = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]])
    ln = np.linalg.norm(fn, axis=1, keepdims=True); ln[ln == 0] = 1
    fn = fn / ln
    x, y, _ = cam.px(V)
    P2 = np.c_[x, y]
    segs, kinds = [], []
    # 开口边
    b = order[start[cnt == 1]]
    segs.append(np.stack([V[lo[b]], V[hi[b]]], 1)); kinds.append(np.full(len(b), 2))
    # 成对的边
    p = start[cnt == 2]
    i1, i2 = order[p], order[p + 1]
    a2, b2 = P2[lo[i1]], P2[hi[i1]]
    d = b2 - a2
    c1, c2 = P2[opp[i1]] - a2, P2[opp[i2]] - a2
    s1 = d[:, 0] * c1[:, 1] - d[:, 1] * c1[:, 0]
    s2 = d[:, 0] * c2[:, 1] - d[:, 1] * c2[:, 0]
    sil = s1 * s2 > 0
    n1 = fn[face[i1]]
    n2 = fn[face[i2]] * np.where(fwd[i1] != fwd[i2], 1.0, -1.0)[:, None]
    crease = (np.einsum('ij,ij->i', n1, n2) < math.cos(math.radians(crease_deg))) & ~sil
    for m, kind in ((sil, 0), (crease, 1)):
        segs.append(np.stack([V[lo[i1[m]]], V[hi[i1[m]]]], 1)); kinds.append(np.full(int(m.sum()), kind))
    return np.vstack(segs), np.concatenate(kinds)


# ---------------------------------------------------------------- 可见性
def trace(buf, S, own=None, by_id=False, tol=0.02, step=1.0, side=1.6, min_px=1.5, poly=None):
    """线段 S (K, 2, 3) → 看得见的那几段。
    own：这根线属于哪个编号（判断「线的两侧是不是自己」；by_id=True 时只在自己露出来的地方画，用于贴在面上的线：地板缝、外皮的缝）。
    返回 dict：xy (M, 4) 终稿像素坐标的线段、prof (M,) 这一段是不是外轮廓、seg (M,) 来自第几根、z (M,) 深度（米）、
    gap (M,) 轮廓线背后的东西比它远多少米"""
    cam, ss = buf.cam, buf.ss
    out = dict(xy=np.zeros((0, 4)), prof=np.zeros(0, bool), seg=np.zeros(0, int), z=np.zeros(0), gap=np.zeros(0), jump=np.zeros(0), t=np.zeros((0, 2)))
    if len(S) == 0:
        return out
    if cam.persp:
        S, kept = clip_segs(S, *cam.near_plane())
    else:
        kept = np.arange(len(S))
    if len(S) == 0:
        return out
    ax, ay, az = cam.px(S[:, 0]); bx, by, bz = cam.px(S[:, 1])
    ka, kb = cam.key(az), cam.key(bz)
    L = np.hypot(bx - ax, by - ay) * ss
    n = np.maximum(2, np.ceil(L / step).astype(int) + 1)
    n = np.minimum(n, 20000)
    idx = np.repeat(np.arange(len(S)), n)
    start = np.cumsum(n) - n
    j = np.arange(int(n.sum())) - np.repeat(start, n)
    t = j / np.repeat(n - 1, n)
    x = (ax[idx] + (bx - ax)[idx] * t) * ss
    y = (ay[idx] + (by - ay)[idx] * t) * ss
    k = ka[idx] + (kb - ka)[idx] * t
    xi = np.floor(x).astype(int); yi = np.floor(y).astype(int)
    inside = (xi >= 0) & (xi < buf.W) & (yi >= 0) & (yi < buf.H)
    xc = np.clip(xi, 0, buf.W - 1); yc = np.clip(yi, 0, buf.H - 1)
    zs = cam.zof(k)
    tolk = tol / (zs * zs) if cam.persp else tol
    vis = inside & (k <= buf.zfar[yc, xc] + tolk)
    # 线的两侧各是谁
    dx, dy = (bx - ax)[idx], (by - ay)[idx]
    ln = np.maximum(np.hypot(dx, dy), 1e-9)
    nx, ny = -dy / ln * side * ss, dx / ln * side * ss
    def at(ox, oy):
        u = np.clip(np.floor(x + ox).astype(int), 0, buf.W - 1); w = np.clip(np.floor(y + oy).astype(int), 0, buf.H - 1)
        return buf.ids[w, u], buf.zk[w, u]
    idL, zL = at(nx, ny); idR, zR = at(-nx, -ny)
    if own is None:
        own_arr = buf.ids[yc, xc]
    else:
        own_arr = np.full(len(x), own) if np.isscalar(own) else np.asarray(own)[kept][idx]
    if by_id:
        near_own = (buf.ids[yc, xc] == own_arr) | (idL == own_arr) | (idR == own_arr)
        vis &= near_own
    prof = (idL != own_arr) | (idR != own_arr)
    far = np.where(idL != own_arr, zL, -np.inf); far = np.maximum(far, np.where(idR != own_arr, zR, -np.inf))
    gap = np.where(prof & np.isfinite(far), cam.zof(np.minimum(far, -1e-6) if cam.persp else far) - zs, 0.0)
    gap = np.where(prof & ~np.isfinite(far), 99.0, gap)     # 背后什么都没有（画面外的空白）
    # 线两侧比线本身远多少（不管是不是同一个物体）：同一个物体里前面压后面的地方也有这个落差
    zl = cam.zof(np.where(np.isfinite(zL), zL, -1e-6 if cam.persp else 1e6)); zr = cam.zof(np.where(np.isfinite(zR), zR, -1e-6 if cam.persp else 1e6))
    jump = np.maximum(zl, zr) - zs
    state = np.where(vis, 1 + prof.astype(int), 0)
    # 沿每根线把状态相同的连续采样并成一段
    brk = np.ones(len(state), bool)
    brk[1:] = (state[1:] != state[:-1]) | (idx[1:] != idx[:-1])
    rs = np.where(brk)[0]
    re = np.append(rs[1:], len(state)) - 1
    keep = (state[rs] > 0)
    rs, re = rs[keep], re[keep]
    if len(rs) == 0:
        return out
    half = 0.5 / np.maximum(n[idx[rs]] - 1, 1)
    t0 = np.clip(t[rs] - half, 0, 1); t1 = np.clip(t[re] + half, 0, 1)
    si = idx[rs]
    X0 = ax[si] + (bx - ax)[si] * t0; Y0 = ay[si] + (by - ay)[si] * t0
    X1 = ax[si] + (bx - ax)[si] * t1; Y1 = ay[si] + (by - ay)[si] * t1
    long_enough = np.hypot(X1 - X0, Y1 - Y0) >= min_px
    # 一根很短的线整段可见时也要留（密的折线每段都很短）
    whole = (t0 <= 1e-9) & (t1 >= 1 - 1e-9)
    ok = long_enough | whole
    def mean_of(q):
        cs = np.concatenate([[0], np.cumsum(q)])
        return (cs[re + 1] - cs[rs]) / (re - rs + 1)
    out = dict(xy=np.c_[X0, Y0, X1, Y1][ok], prof=(state[rs] == 2)[ok], seg=kept[si][ok], z=zs[rs][ok], gap=mean_of(gap)[ok],
               jump=mean_of(np.clip(jump, 0, 50))[ok], t=np.c_[t0, t1][ok])
    return out


# ---------------------------------------------------------------- SVG
def path_of(xy, order=None):
    """线段 → path 的 d。首尾相接的相邻线段接成一笔（折线上的线是按顺序给的）"""
    if len(xy) == 0:
        return ''
    d = []
    last = None
    for x0, y0, x1, y1 in xy:
        if last is not None and abs(x0 - last[0]) < 0.06 and abs(y0 - last[1]) < 0.06:
            d.append(f'L{x1:.2f},{y1:.2f}')
        else:
            d.append(f'M{x0:.2f},{y0:.2f}L{x1:.2f},{y1:.2f}')
        last = (x1, y1)
    return ''.join(d)


def stroke(xy, color, width, dash=None, opacity=None, cap='round'):
    d = path_of(xy)
    if not d:
        return ''
    extra = (f' stroke-dasharray="{dash}"' if dash else '') + (f' opacity="{opacity}"' if opacity is not None else '')
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width:.2f}" stroke-linecap="{cap}" stroke-linejoin="round"{extra}/>'


def polygon(pts, fill, stroke_=None, width=0, opacity=None):
    d = 'M' + 'L'.join(f'{x:.2f},{y:.2f}' for x, y in pts) + 'Z'
    s = f' stroke="{stroke_}" stroke-width="{width:.2f}" stroke-linejoin="round"' if stroke_ else ''
    o = f' opacity="{opacity}"' if opacity is not None else ''
    return f'<path d="{d}" fill="{fill}"{s}{o}/>'


def fill_image(buf, colors, default=None, shades=None):
    """编号缓冲 → 一张平涂的底图（PNG，data URI）。colors：{编号: (r, g, b[, a])}，没列的透明；
    shades：{(编号, 明暗档): 颜色}，给某个物体朝上 / 朝下的面换一档颜色"""
    from PIL import Image
    n = int(buf.ids.max()) + 2
    lut = np.zeros((n, 4), np.uint8)
    for i, c in colors.items():
        if 0 <= i < n - 1:
            lut[i] = (list(c) + [255])[:4]
    if default is not None:
        lut[-1] = (list(default) + [255])[:4]
    ids = np.where(buf.ids < 0, n - 1, buf.ids)
    img = lut[ids]
    for (i, sh), c in (shades or {}).items():
        m = (buf.ids == i) & (buf.shade == sh)
        img[m] = (list(c) + [255])[:4]
    im = Image.fromarray(img, 'RGBA').resize((buf.cam.W, buf.cam.H), Image.LANCZOS)
    bio = io.BytesIO(); im.save(bio, 'PNG', optimize=True)
    return f'<image x="0" y="0" width="{buf.cam.W}" height="{buf.cam.H}" href="data:image/png;base64,{base64.b64encode(bio.getvalue()).decode()}"/>'


def mask_poly(m, X0, Y0, ss):
    """一小块遮罩 → shapely 形（每一行的连续段是一个小矩形，并起来），终稿像素坐标"""
    from shapely.geometry import box as sbox
    from shapely.ops import unary_union
    polys = []
    for r in range(m.shape[0]):
        row = m[r]
        if not row.any():
            continue
        d = np.diff(np.concatenate([[0], row.astype(np.int8), [0]]))
        for a, b in zip(np.where(d == 1)[0], np.where(d == -1)[0]):
            polys.append(sbox((X0 + a) / ss, (Y0 + r) / ss, (X0 + b) / ss, (Y0 + r + 1) / ss))
    return unary_union(polys) if polys else None


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
