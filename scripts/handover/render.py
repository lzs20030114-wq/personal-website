# -*- coding: utf-8 -*-
"""交接文档出图：正交投影 + z-buffer + 线稿（轮廓 / 折痕 / 深度跳变）+ 淡色平涂。

纯 numpy + 一个 C 光栅化核心（raster.c）。不依赖 OpenGL。
相机：世界 z 朝上；az = 从 +x 轴逆时针的方位角（相机所在方向），el = 仰角。
"""
import ctypes, math, os
from pathlib import Path
import numpy as np
from PIL import Image

_SO = os.environ.get("RASTER_SO") or str(Path(__file__).with_name("raster.so"))
if not os.path.exists(_SO):  # 首次运行现编译（raster.so 不进仓库）
    import subprocess
    subprocess.run(["cc", "-O2", "-shared", "-fPIC", str(Path(__file__).with_name("raster.c")), "-o", _SO], check=True)
_lib = ctypes.CDLL(_SO)
_lib.raster.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_int,
                        ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p]

INK = np.array([28, 30, 32], np.float32)

def view_basis(az, el):
    az, el = math.radians(az), math.radians(el)
    eye = np.array([math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)])
    fwd = -eye
    up0 = np.array([0, 0, 1.0]) if abs(el) < math.radians(89) else np.array([-math.cos(az), -math.sin(az), 0.0])
    right = np.cross(fwd, up0); right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    return right, up, fwd

class Cam:
    def __init__(self, az, el, W, H, scale, center):
        self.r, self.u, self.f = view_basis(az, el)
        self.W, self.H, self.s = W, H, scale
        self.c = np.asarray(center, float)
    def proj(self, P):
        P = np.asarray(P, float) - self.c
        x = P @ self.r * self.s + self.W / 2
        y = -(P @ self.u) * self.s + self.H / 2
        z = P @ self.f
        return np.c_[x, y, z]

def fit_cam(verts, az, el, W, H, margin=0.06, pad_px=None):
    r, u, f = view_basis(az, el)
    sx, sy = verts @ r, verts @ u
    w, h = sx.max() - sx.min(), sy.max() - sy.min()
    s = min(W * (1 - 2 * margin) / w, H * (1 - 2 * margin) / h)
    cx, cy = (sx.max() + sx.min()) / 2, (sy.max() + sy.min()) / 2
    # 中心点：屏幕中心对应的世界点（深度方向任意，取包围盒中心深度）
    cz = (verts @ f).mean()
    center = cx * r + cy * u + cz * f
    return Cam(az, el, W, H, s, center)

def render(items, cam, ss=2, crease_deg=32, light=(0.35, -0.55, 0.75), bg=(255, 255, 255),
           line_w=1.0, shade=True):
    """items: [(verts N×3, tris M×3, fill RGB, part_key[, ink RGB])]。返回 PIL.Image（RGB）。"""
    W, H = cam.W * ss, cam.H * ss
    sc = Cam.__new__(Cam); sc.__dict__.update(cam.__dict__); sc.W, sc.H, sc.s = W, H, cam.s * ss
    tri_xyz, face_n, face_part, fills, inks = [], [], [], [], []
    for pi, it in enumerate(items):
        v, t, fill = it[0], it[1], it[2]
        inks.append(it[4] if len(it) > 4 and it[4] is not None else tuple(INK))
        q = sc.proj(v).astype(np.float32)
        tri_xyz.append(q[t].reshape(-1, 9))
        a = v[t[:, 1]] - v[t[:, 0]]; b = v[t[:, 2]] - v[t[:, 0]]
        n = np.cross(a, b); ln = np.linalg.norm(n, axis=1, keepdims=True); ln[ln == 0] = 1
        face_n.append(n / ln)
        face_part.append(np.full(len(t), pi, np.int32))
        fills.append(fill)
    tri_xyz = np.ascontiguousarray(np.vstack(tri_xyz), np.float32)
    face_n = np.vstack(face_n); face_part = np.concatenate(face_part)
    ids = np.arange(len(tri_xyz), dtype=np.int32)
    zb = np.full(W * H, np.inf, np.float32); ib = np.full(W * H, -1, np.int32)
    _lib.raster(W, H, len(tri_xyz), tri_xyz.ctypes.data, ids.ctypes.data, zb.ctypes.data, ib.ctypes.data)
    zb = zb.reshape(H, W); ib = ib.reshape(H, W)
    hit = ib >= 0
    fid = np.where(hit, ib, 0)
    part = np.where(hit, face_part[fid], -1)
    n = face_n[fid]
    # 法向朝向相机（双面）
    vdir = -sc.f
    nd = n @ vdir
    n = np.where((nd < 0)[..., None], -n, n)
    L = np.array(light, float); L /= np.linalg.norm(L)
    lam = np.clip(n @ L, 0, 1)
    col = np.array(fills, np.float32)[np.where(hit, part, 0)]
    if shade:
        k = (0.78 + 0.22 * lam)[..., None]
        img = col * k
    else:
        img = col
    img = np.where(hit[..., None], img, np.array(bg, np.float32))
    # ---- 线
    def nb(a, dy, dx, fillv):
        out = np.full_like(a, fillv)
        ys = slice(max(dy, 0), H + min(dy, 0)); yd = slice(max(-dy, 0), H + min(-dy, 0))
        xs = slice(max(dx, 0), W + min(dx, 0)); xd = slice(max(-dx, 0), W + min(-dx, 0))
        out[yd, xd] = a[ys, xs]
        return out
    zf = np.where(hit, zb, 1e9)
    edge = np.zeros((H, W), bool); crease = np.zeros((H, W), bool)
    cosc = math.cos(math.radians(crease_deg))
    depth_tol = 2.5  # mm：同一件内的遮挡跳变
    for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
        p2 = nb(part, dy, dx, -1); z2 = nb(zf, dy, dx, 1e9); n2 = nb(n, dy, dx, 0.0)
        diff_part = (p2 != part)
        e = diff_part & (hit | (p2 >= 0))
        jump = (~diff_part) & hit & (np.abs(z2 - zf) > depth_tol)
        dot = np.sum(n * n2, axis=-1)
        cr = (~diff_part) & hit & (dot < cosc) & ~jump
        edge |= e | jump
        crease |= cr
    if line_w > 1:
        from PIL import ImageFilter
        em = Image.fromarray((edge * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
        edge = np.array(em) > 0
    # 线色取该像素所属件的墨色；背景像素上的轮廓取邻件（向右/下取一格）
    ink_tab = np.array(inks + [tuple(INK)], np.float32)
    pidx = np.where(part >= 0, part, len(inks))
    alt = nb(pidx, 0, 1, len(inks))
    pidx = np.where(pidx == len(inks), alt, pidx)
    ink = ink_tab[pidx]
    img = np.where(edge[..., None], ink, img)
    img = np.where((crease & ~edge)[..., None], img * 0.45 + ink * 0.55, img)
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    if ss > 1:
        im = im.resize((cam.W, cam.H), Image.LANCZOS)
    return im
