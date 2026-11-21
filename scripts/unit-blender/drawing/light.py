"""物体上的颜色（试画第四轮之二，2026-11-21）：面上的颜色跟着光走，再加材质。

作者看第四轮：「不光背景上有渐变，还包括图板内部，就是物体上的颜色，也可以研究怎么渐变、加纹理、加肌理，做得有格调一些。」
第四轮的渐变是按画面、按高度、按距离给的，和物体朝哪、光从哪来没有关系。这里改成：

  1. 每个像素知道自己那个面朝哪（cafe_line.py 把每个三角形的法向压成一个整数写进明暗缓冲，见 encode_normals）；
  2. 一个斜着的方向光当作下午的太阳（从 −Y 那面墙的窗户那边来）：用同一个光栅化核心从太阳那边画一张深度图，
     每个像素查一下自己被不被挡（影子贴图），人和猫也按台架那副方块的形状挡光（只进影子图，不进画面）。
     默认只有单元、吊杆、家具、人、猫挡光（轴测图常用的那种日照）；也可以让墙和天花挡光，只剩窗户里照进来的光斑；
  3. 上色是两套颜色之间的插值，不是加黑：朝窗户、朝上的面偏暖偏亮，背光的面偏冷（一层半透明的冷色墨，正片叠底），
     太阳照到的地方罩一层暖光（滤色）。手绘技术图里「冷到暖」的画法（Gooch 等 1998）就是这个意思：
     明暗只在中间调里走，黑线和高光仍然最显眼；
  4. 墙角、物体贴地的地方压暗一点：深度图减去它自己的模糊（Luft 等 2006 的「深度缓冲的反锐化」），凹进去的地方变暗；
  5. 材质贴在三维里（不是贴在画面上），跟着透视走：地板一块一块的木板（每块深浅不同、带木纹），墙是石灰的云纹，
     沙发是亚麻的经纬，单元的外皮是针织的横纹，也可以换水磨石。材质只改明度，幅度很小，颜色仍由配色定。

配色里这样写（都在 fx 里，没有这两项的配色一行不变）：
  light = dict(fill=(x, y, z) 天光主要从哪来, cool='#…' 背光那层墨, warm='#…' 暖光,
               face=(冷, 暖)            ① 朝向的冷暖
               ground=0–1, window=0–1  ② 面里的渐变（竖面贴地处暗、离窗远处暗）
               sun=(x, y, z), sun_k, sun_dim, soft=米, occlude='objects'|'room', figs=True   ③ 太阳和影子
               ao=0–1, ao_px=终稿像素   ④ 墙角压暗)
  mat = {'floor': ('oak',) | ('terrazzo', [石子色…]), 'wall': ('lime',), 'furn': ('linen',) | ('boucle',),
         'unit': ('rib',) | ('satin',), 'mech': ('brushed',), 'amount': 整体强度}
实际的上色在 paint.py 的 _light_layer；这里放法向编码、噪声、材质和影子贴图。
"""
import math
import numpy as np


# ---------------------------------------------------------------- 法向压成整数
NZ, NA = 255, 512


def encode_normals(n):
    """(K, 3) 单位法向 → 整数（1 起；0 留给「没有法向」：人、猫那几块平面形状）"""
    nz = np.clip(n[:, 2], -1, 1)
    iz = np.round((nz + 1) / 2 * NZ).astype(np.int64)
    a = np.arctan2(n[:, 1], n[:, 0]) % (2 * math.pi)
    ia = np.round(a / (2 * math.pi) * NA).astype(np.int64) % NA
    return (1 + iz * NA + ia).astype(np.int32)


def decode_normals(code):
    """整数 → (H, W, 3) 法向 + 有没有法向"""
    ok = code > 0
    c = np.where(ok, code - 1, 0)
    iz, ia = c // NA, c % NA
    nz = iz / NZ * 2 - 1
    a = ia / NA * 2 * math.pi
    r = np.sqrt(np.clip(1 - nz * nz, 0, 1))
    n = np.stack([r * np.cos(a), r * np.sin(a), nz], -1).astype(np.float32)
    return n, ok


# ---------------------------------------------------------------- 三维的值噪声（材质贴在世界坐标上）
def _hash(ix, iy, iz, seed):
    h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 2654435761)
    h = (h ^ (h >> 13)) * 1274126177
    h = h ^ (h >> 16)
    return (h & 0xFFFFFF).astype(np.float32) / float(0xFFFFFF)


def noise3(P, scale, seed=0, octaves=1, stretch=(1.0, 1.0, 1.0)):
    """P (K, 3) 米 → (K,) 0–1。scale = 一个起伏多少米；stretch 给三个轴各自再缩放（木纹顺着一个方向拉长用）"""
    out = np.zeros(len(P), np.float32)
    amp, tot = 1.0, 0.0
    S = np.asarray(stretch, np.float64)
    for o in range(octaves):
        Q = P.astype(np.float64) / (scale / 2 ** o) / S + 17.3 * o
        I = np.floor(Q).astype(np.int64)
        F = Q - I
        F = F * F * (3 - 2 * F)
        acc = np.zeros(len(P), np.float32)
        for dx in (0, 1):
            wx = F[:, 0] if dx else 1 - F[:, 0]
            for dy in (0, 1):
                wy = F[:, 1] if dy else 1 - F[:, 1]
                for dz in (0, 1):
                    wz = F[:, 2] if dz else 1 - F[:, 2]
                    acc += (wx * wy * wz).astype(np.float32) * _hash(I[:, 0] + dx, I[:, 1] + dy, I[:, 2] + dz, seed + o)
        out += amp * acc
        tot += amp
        amp *= 0.5
    return out / tot


def _cellrand(i, j, seed):
    return _hash(i.astype(np.int64), j.astype(np.int64), np.zeros_like(i, np.int64), seed)


def tangent_frame(n):
    """法向 → 两个切向（竖直的面：一个水平、一个竖直；水平的面：x、y）"""
    t1 = np.cross(n, np.array([0, 0, 1.0], np.float32))
    l = np.linalg.norm(t1, axis=1, keepdims=True)
    flat = l[:, 0] < 0.3
    t1 = np.where(flat[:, None], np.array([1.0, 0, 0], np.float32), t1 / np.maximum(l, 1e-6))
    t2 = np.cross(n, t1)
    return t1.astype(np.float32), t2.astype(np.float32)


# ---------------------------------------------------------------- 材质：都只返回明度的增减（OKLab 的 L，±0.0x）
def mat_oak(P, along, pitch, off, ppm, seed=21):
    """木地板：板顺着 along（'x' 或 'y'）铺，板宽 pitch，板缝在 off + k·pitch（与画的板缝线对齐）。
    每块板一个深浅；板顺着长边再断成 0.9–2.1 m 的几段，错缝；板面上是顺着长边拉长的木纹"""
    a = P[:, 0] if along == 'x' else P[:, 1]
    c = P[:, 1] if along == 'x' else P[:, 0]
    row = np.floor((c - off) / pitch).astype(np.int64)
    # 每一排板从一个随机的地方开始断，段长 0.9–2.1 m
    start = _cellrand(row, row * 0 + 3, seed) * 2.0
    seg_len = 0.9 + 1.2 * _cellrand(row, row * 0 + 5, seed)
    piece = np.floor((a + start) / seg_len).astype(np.int64)
    tone = _cellrand(row, piece, seed + 1) - 0.5                          # 每块板 ±0.5
    tone2 = _cellrand(row, piece, seed + 2)
    # 木纹：沿板长方向拉长 60 倍的噪声，再加一层细的；板与板的纹理互不相连（把 row、piece 混进坐标）
    Q = np.stack([a + piece * 7.1, c * 1.0 + row * 3.3, row * 0.0], 1).astype(np.float32)
    g = noise3(Q, 0.010, seed + 3, octaves=2, stretch=(40.0, 1.0, 1.0))
    fine = noise3(Q, 0.0035, seed + 4, octaves=1, stretch=(25.0, 1.0, 1.0))
    # 画面上太细的纹理淡掉（免得缩小以后变成摩尔纹）：木纹的一道不到 1.5 像素就不画
    vis = np.clip((ppm * 0.010 - 1.5) / 2.0, 0, 1)
    end = np.abs(((a + start) / seg_len) - np.round((a + start) / seg_len)) * seg_len    # 到板头的距离（米）
    joint = np.clip(1 - end / 0.004, 0, 1) * np.clip((ppm * 0.004 - 0.6), 0, 1)        # 板头的接缝：一条很淡的线
    return (0.055 * tone + 0.014 * (tone2 - 0.5)) + vis * (0.040 * (g - 0.5) + 0.018 * (fine - 0.5)) - 0.06 * joint


def mat_terrazzo(P, ppm, seed=31):
    """水磨石：底子很细的颗粒 + 大小不一的石子（每 4 cm 一格，一格至多一颗，位置、大小、深浅都随机）。返回 (ΔL, 石子遮罩, 石子的色号 0–1)"""
    base = noise3(P, 0.004, seed, octaves=1) - 0.5
    dl = 0.012 * base
    chip = np.zeros(len(P), np.float32)
    hue = np.zeros(len(P), np.float32)
    for layer, (cell, rmax, p) in enumerate(((0.045, 0.011, 0.55), (0.022, 0.005, 0.6))):
        gx, gy = np.floor(P[:, 0] / cell), np.floor(P[:, 1] / cell)
        ox = _cellrand(gx, gy, seed + 10 + layer) * 0.7 + 0.15
        oy = _cellrand(gx, gy, seed + 20 + layer) * 0.7 + 0.15
        r = rmax * (0.45 + 0.55 * _cellrand(gx, gy, seed + 30 + layer))
        on = _cellrand(gx, gy, seed + 40 + layer) < p
        dx, dy = P[:, 0] - (gx + ox) * cell, P[:, 1] - (gy + oy) * cell
        # 石子不是圆的：半径随角度起伏
        ang = np.arctan2(dy, dx)
        wob = 1 + 0.28 * np.sin(3 * ang + 6.28 * _cellrand(gx, gy, seed + 50 + layer)) + 0.12 * np.sin(5 * ang)
        d = np.sqrt(dx * dx + dy * dy) / (r * wob)
        m = np.clip((1 - d) * r * ppm * 1.5, 0, 1) * on
        chip = np.maximum(chip, m)
        hue = np.where(m > 0.01, _cellrand(gx, gy, seed + 60 + layer), hue)
    return dl, chip, hue


def mat_lime(P, ppm, seed=41):
    """石灰墙：大块的云纹（半米）+ 中等的抹痕（十几厘米，横着拉长一点）+ 很细的砂粒"""
    big = noise3(P, 0.55, seed, octaves=2) - 0.5
    mid = noise3(P, 0.12, seed + 1, octaves=2, stretch=(1.0, 1.0, 0.55)) - 0.5
    sand = noise3(P, 0.0035, seed + 2, octaves=1) - 0.5
    vis = np.clip((ppm * 0.0035 - 1.0) / 2.0, 0, 1)
    return 0.045 * big + 0.022 * mid + vis * 0.012 * sand


def mat_linen(P, n, ppm, seed=51):
    """亚麻：经纬两向的细条（一格 6 mm），条的粗细不匀（竹节），再加一点颜色的起伏"""
    t1, t2 = tangent_frame(n)
    u, v = (P * t1).sum(1), (P * t2).sum(1)
    lam = 0.012
    slub_u = noise3(np.stack([u * 0, v, u * 0.05], 1), 0.02, seed, stretch=(1, 1, 1)) - 0.5
    slub_v = noise3(np.stack([u, v * 0, v * 0.05], 1), 0.02, seed + 1) - 0.5
    wu = np.cos(2 * math.pi * (u / lam + 0.6 * slub_u))
    wv = np.cos(2 * math.pi * (v / lam + 0.6 * slub_v))
    weave = 0.5 * (wu * (wv > 0) + wv * (wv <= 0))
    vis = np.clip((ppm * lam - 2.0) / 2.0, 0, 1)                     # 一格不到 2 像素时淡掉
    tone = noise3(P, 0.25, seed + 2, octaves=2) - 0.5
    return vis * 0.030 * weave + 0.022 * tone + vis * 0.016 * (slub_u + slub_v)


def mat_boucle(P, ppm, seed=61):
    """圈绒（bouclé）：一团一团的小圈，比亚麻粗、没有方向"""
    a = noise3(P, 0.012, seed, octaves=2) - 0.5
    b = noise3(P, 0.04, seed + 1, octaves=1) - 0.5
    vis = np.clip((ppm * 0.012 - 1.6) / 2.0, 0, 1)
    return vis * 0.07 * a + 0.025 * b


def mat_rib(P, n, ppm, seed=71):
    """针织横纹：单元外皮上一道一道的横棱（按离地高度，1.5 cm 一道），棱的明暗随朝向变（朝上的面看不出横纹，改成细颗粒）"""
    lam = 0.015
    up = np.abs(n[:, 2])
    wob = noise3(P, 0.05, seed, octaves=1) - 0.5
    rib = np.cos(2 * math.pi * (P[:, 2] / lam + 0.5 * wob))
    rib = np.sign(rib) * np.abs(rib) ** 0.6
    knit = noise3(P, 0.006, seed + 1, octaves=1) - 0.5
    vis = np.clip((ppm * lam - 2.0) / 2.0, 0, 1)
    return vis * (1 - up) * 0.055 * rib + vis * up * 0.035 * knit + 0.014 * (noise3(P, 0.3, seed + 2) - 0.5)


def mat_brushed(P, n, ppm, seed=81):
    """拉丝金属：顺着竖直方向的细丝"""
    s = noise3(P, 0.002, seed, octaves=1, stretch=(1.0, 1.0, 40.0)) - 0.5
    vis = np.clip((ppm * 0.002 - 0.8) / 1.5, 0, 1)
    return vis * 0.05 * s


# ---------------------------------------------------------------- 影子贴图
def shadow_vis(P, n, meshes, L, LW, res=2048, soft=0.03, center=(0, 0, 1.5), span=11.0, bias=0.012, nsamp=16):
    """P (K, 3)、n (K, 3) → (K,) 0–1：1 = 太阳照得到，0 = 被挡住。meshes = [(V, T)]，世界坐标。
    soft = 影子边缘的软度（米，按太阳那边的深度图采样一圈取平均）"""
    L = np.asarray(L, float); L /= np.linalg.norm(L)
    c = np.asarray(center, float)
    cam = LW.Cam(eye=c + L * 40.0, look=c, W=res, H=res, width=span)
    buf = LW.Buffers(cam, ss=1)
    for V, T in meshes:
        if len(T):
            buf.add(np.asarray(V, float), np.asarray(T), 0, None)
    zmap = buf.z.reshape(res, res)
    Q = P + n * 0.012 + L * 0.004
    x, y, z = cam.px(Q)
    r_px = soft / (span / res)
    # 一圈泊松盘一样的采样点（黄金角螺线）
    ga = math.pi * (3 - math.sqrt(5))
    acc = np.zeros(len(P), np.float32)
    for s in range(nsamp):
        rr = math.sqrt((s + 0.5) / nsamp) * r_px
        dx, dy = rr * math.cos(s * ga), rr * math.sin(s * ga)
        xi = np.clip(np.round(x + dx).astype(np.int64), 0, res - 1)
        yi = np.clip(np.round(y + dy).astype(np.int64), 0, res - 1)
        acc += (z <= zmap[yi, xi] + bias).astype(np.float32)
    return acc / nsamp
