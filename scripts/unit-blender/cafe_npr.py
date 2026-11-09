"""把 cafe_passes.py 出的通道画成线稿图版的底图（E1 的密排线 + E11 的点缀色，暖色调）。

python3 scripts/unit-blender/cafe_npr.py <通道目录> <机位> <单元画法 render|accent> <输出.png> [调色 warm]

单元画法：
  render  单元外皮用照常渲染的那张底图（作者 11-09：单元外皮的渲染效果挺好），其余全是线；
  accent  单元也画成线，外皮涂点缀色（落下来的那几台是全图唯一的颜色块）。
同时写出 <输出>_z.npy（终稿分辨率的深度，取 2×2 里最近的）给叠人和猫时判断遮挡。
"""
import json, math, sys
import numpy as np
from PIL import Image

D, K, UNIT, OUT = sys.argv[1:5]
meta = json.load(open(f'{D}/{K}_cam.json'))
idx = np.load(f'{D}/{K}_idx.npy')
N = np.load(f'{D}/{K}_n.npy').astype(np.float32)
Z = np.load(f'{D}/{K}_z.npy')
H2, W2 = idx.shape
SS = meta['ss']
C = meta['cat']
lut = np.zeros(max(idx.max(), max(int(i) for i in meta['ids'])) + 1, np.int32)
for i, c in meta['ids'].items():
    lut[int(i)] = c
cat = lut[np.clip(idx, 0, len(lut) - 1)]
bg = (cat == 0) | (Z > 1e5)
cat[bg] = 0

def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255

PAL = dict(
    paper=hexc('#F4EEE3'), ink=hexc('#2A231F'), ctx=hexc('#4A3F37'), soft=hexc('#9C8F80'), faint=hexc('#C9BCA9'),
    poche=hexc('#55291F'), coral=hexc('#E07A5F'), coral_d=hexc('#B5523B'), coral_l=hexc('#F0BFAE'),
    sand=hexc('#ECE1CE'), sky=hexc('#E4A893'), unit=hexc('#D96F50'), unit_l=hexc('#F3CDBE'),
)

# ---------------------------------------------------------------- 世界坐标（由深度反推）
P = np.array(meta['P']); Wm = np.array(meta['world'])
yy, xx = np.mgrid[0:H2, 0:W2].astype(np.float32)
nx = (xx + 0.5) / W2 * 2 - 1
ny = 1 - (yy + 0.5) / H2 * 2
zc = -np.where(bg, 50.0, Z)
if meta['ortho']:
    xc = (nx - P[0, 2] * zc - P[0, 3]) / P[0, 0]
    yc = (ny - P[1, 2] * zc - P[1, 3]) / P[1, 1]
else:
    d = -zc
    xc = (nx * d - P[0, 2] * zc - P[0, 3]) / P[0, 0]
    yc = (ny * d - P[1, 2] * zc - P[1, 3]) / P[1, 1]
WX = Wm[0, 0] * xc + Wm[0, 1] * yc + Wm[0, 2] * zc + Wm[0, 3]
WY = Wm[1, 0] * xc + Wm[1, 1] * yc + Wm[1, 2] * zc + Wm[1, 3]
WZ = Wm[2, 0] * xc + Wm[2, 1] * yc + Wm[2, 2] * zc + Wm[2, 3]
cam_pos = Wm[:3, 3]

# 几何法向：由世界坐标的差分求（不用渲染器的法向——那里面带着材质的凹凸贴图，沙发和外皮会出一圈圈的假转折）
def geo_normals():
    Pw = np.stack([WX, WY, WZ], -1)
    def diff(axis):
        f = np.roll(Pw, -1, axis) - Pw
        b = Pw - np.roll(Pw, 1, axis)
        same_f = np.roll(idx, -1, axis) == idx
        same_b = np.roll(idx, 1, axis) == idx
        out = np.where(same_f[..., None], f, b)
        out[~same_f & ~same_b] = 0
        return out
    tx, ty = diff(1), diff(0)
    n = np.cross(ty, tx)
    l = np.linalg.norm(n, axis=-1, keepdims=True)
    n = n / np.maximum(l, 1e-9)
    view = np.array(Wm[:3, 2])  # 相机的 +z（朝相机外）
    if meta['ortho']:
        to_cam = np.broadcast_to(view, n.shape)
    else:
        to_cam = cam_pos - Pw
    flip = (n * to_cam).sum(-1) < 0
    n[flip] *= -1
    bad = (l[..., 0] < 1e-12)
    n[bad] = N[bad]
    return n

N = geo_normals().astype(np.float32)

def shift(a, dy, dx, fill=0):
    out = np.full_like(a, fill)
    ys = slice(max(dy, 0), H2 + min(dy, 0)); yd = slice(max(-dy, 0), H2 + min(-dy, 0))
    xs = slice(max(dx, 0), W2 + min(dx, 0)); xd = slice(max(-dx, 0), W2 + min(-dx, 0))
    out[yd, xd] = a[ys, xs]
    return out

def dilate(m, r):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r + r:
                out |= shift(m, dy, dx, False)
    return out

# ---------------------------------------------------------------- 边
def edges():
    e_id = np.zeros((H2, W2), bool); e_dep = np.zeros_like(e_id); e_cr = np.zeros_like(e_id)
    for dy, dx in ((0, 1), (1, 0)):
        i2 = shift(idx, dy, dx, -1); z2 = shift(Z, dy, dx, 1e10); n2 = shift(N, dy, dx, 0)
        nearer = Z <= z2
        diff_id = (i2 != idx) & (i2 >= 0)
        dz = np.abs(Z - z2)
        tol = 0.025 + 0.012 * np.minimum(Z, z2) if not meta['ortho'] else 0.03
        jump = (dz > tol) & ~(bg & shift(bg, dy, dx, True))
        cos = (N * n2).sum(2)
        crease = (~diff_id) & (cos < math.cos(math.radians(32))) & ~bg
        # 线落在近的那一侧（贴着前面物体的外形）
        for m, src in ((e_id, diff_id), (e_dep, jump), (e_cr, crease)):
            a = src & nearer
            b = shift(src & ~nearer, -dy, -dx, False)
            m |= a | b
    return e_id, e_dep, e_cr

e_id, e_dep, e_cr = edges()
sil = e_dep | (e_id & (shift(cat, 0, 1) != cat))

# ---------------------------------------------------------------- 纹理
rng = np.random.default_rng(7)

def hatch(angle_deg, spacing, width, phase=0.0):
    a = math.radians(angle_deg)
    t = (xx * math.cos(a) + yy * math.sin(a)) / spacing + phase
    dist = np.abs(t - np.round(t)) * spacing
    return np.clip(width / 2 + 0.5 - dist, 0, 1)

def world_lines(coord, period, width_px):
    g = np.hypot(*np.gradient(coord))  # 每像素多少米
    g = np.maximum(g, 1e-6)
    t = coord / period
    dist = np.abs(t - np.round(t)) * period / g
    return np.clip(width_px / 2 + 0.5 - dist, 0, 1)

def stipple(density, spacing=5, radius=1.15):
    """抖动网格上的圆点：每格一个候选点，密度高于它的随机阈值就点上"""
    gy, gx = np.mgrid[0:H2 // spacing + 1, 0:W2 // spacing + 1]
    cy = (gy * spacing + rng.uniform(0, spacing, gy.shape)).astype(int)
    cx = (gx * spacing + rng.uniform(0, spacing, gx.shape)).astype(int)
    ok = (cy < H2) & (cx < W2)
    cy, cx = cy[ok], cx[ok]
    th = rng.uniform(0, 1, cy.shape)
    on = th < density[cy, cx]
    cy, cx = cy[on], cx[on]
    out = np.zeros((H2, W2), np.float32)
    r = int(math.ceil(radius))
    for dy in range(-r - 1, r + 2):
        for dx in range(-r - 1, r + 2):
            a = np.clip(radius + 0.5 - math.hypot(dy, dx), 0, 1)
            if a <= 0:
                continue
            y2, x2 = np.clip(cy + dy, 0, H2 - 1), np.clip(cx + dx, 0, W2 - 1)
            np.maximum.at(out, (y2, x2), a)
    return out

def dashes(density, spacing=7, length=7):
    """短竖线（E1 里草地那种）"""
    gy, gx = np.mgrid[0:H2 // spacing + 1, 0:W2 // spacing + 1]
    cy = (gy * spacing + rng.uniform(0, spacing, gy.shape)).astype(int)
    cx = (gx * spacing + rng.uniform(0, spacing, gx.shape)).astype(int)
    ok = (cy < H2) & (cx < W2); cy, cx = cy[ok], cx[ok]
    on = rng.uniform(0, 1, cy.shape) < density[cy, cx]
    cy, cx = cy[on], cx[on]
    out = np.zeros((H2, W2), np.float32)
    for k in range(length):
        np.maximum.at(out, (np.clip(cy + k, 0, H2 - 1), cx), 1.0)
    return out

# 「光」：只用来定哪一面排得密（不是真的光影）
L = np.array([-0.55, -0.35, 0.76]); L /= np.linalg.norm(L)
lam = np.clip((N * L).sum(2), -1, 1)
dark = np.clip(0.55 - 0.65 * lam, 0, 1)   # 0 = 迎光的面，1 = 背光
up = N[:, :, 2]
is_ = lambda *names: np.isin(cat, [C[n] for n in names])

# ---------------------------------------------------------------- 画
img = np.ones((H2, W2, 3), np.float32) * PAL['paper']

def paint(mask, color, alpha=1.0):
    a = (mask.astype(np.float32) * alpha)[..., None]
    img[:] = img * (1 - a) + color * a

floor = is_('floor')
wall = is_('wall')
unit_shell = is_('shell')
unit_mech = is_('mech', 'plate')
up_units = is_('shell_up', 'mech_up', 'plate_up')
leaf = is_('leaf')
# 植物的茎穿出了墙（建模时没管），墙外那截不画
stray = leaf & ((np.abs(WX) > 3.33) | (np.abs(WY) > 3.33))
img[stray] = PAL['paper']; leaf &= ~stray; cat[stray] = 0; bg |= stray

# 地面：木板缝（沿世界 x）+ 很淡的砂色底
paint(floor, PAL['sand'], 0.55)
boards = world_lines(WY, 0.16, 1.1) * floor
paint(boards > 0, PAL['soft'], 1.0)
img[:] = img * (1 - (boards * 0.0)[..., None])
paint(floor, PAL['soft'], 0)  # 占位，保持顺序清楚
# 地面上的点画：越靠墙越密（墙根一圈暗）
if True:
    half = 3.319
    wd = np.minimum(half - np.abs(WX), half - np.abs(WY))
    dens = np.clip(0.42 - wd * 0.42, 0, 0.42) * floor
    paint(stipple(dens, 5, 1.05) > 0.5, PAL['ctx'])

# 墙：背光的面排竖线；切到的墙顶涂实
wall_top = wall & (up > 0.8) & (WZ > 3.0)
wall_face = wall & ~wall_top
vh = hatch(0, 9, 1.2) * (wall_face & (dark > 0.35))
paint(vh > 0.3, PAL['soft'])
paint(wall_top, PAL['poche'])
paint(is_('frame'), PAL['ink'])
door = is_('door')
paint(door & (hatch(90, 6, 1.2) > 0.3), PAL['ctx'])

# 窗洞里：天空排横线（E11 那种）；房间外面（轴测图的四周）留纸色
inside = (np.abs(WX) < 3.6) & (np.abs(WY) < 3.6)
if meta['ortho']:
    sky = np.zeros_like(bg)
else:
    sky = bg
paint(sky & (hatch(90, 7, 1.3) > 0.3), PAL['sky'])

# 天花（透视、剖面）：留白，线形灯涂实
paint(is_('light'), PAL['ink'])

# 沙发布面：点画，背光面密；顶面很疏
sofa = is_('sofa', 'chair_pad')
sd = np.where(up > 0.7, 0.10, 0.18 + 0.5 * dark) * sofa
paint(stipple(sd.astype(np.float32), 5, 1.1) > 0.5, PAL['ctx'])
paint(is_('sofa_leg'), PAL['ink'])
chair = is_('chair')
paint(chair & (hatch(45, 6, 1.3) > 0.3) & (dark > 0.25), PAL['ctx'])

# 小物：植物用点缀色
if UNIT == 'render':
    paint(leaf, PAL['coral'], 0.85)
    paint(leaf & (dark > 0.45), PAL['coral_d'], 0.6)
else:
    paint(leaf & (hatch(60, 5, 1.1) > 0.3), PAL['ctx'])
paint(is_('soil') & (stipple(np.full((H2, W2), 0.6, np.float32), 4, 1.0) > 0.5), PAL['ink'])
paint(is_('pot') & (hatch(0, 5, 1.2) > 0.3), PAL['ctx'])
paint(is_('liquid'), PAL['ctx'])

# 收着的单元（透视 / 剖面里才有）：只描很淡的线，不填
# 落下来的单元
if UNIT == 'render':
    beauty = np.asarray(Image.open(f'{D}/{K}_beauty.png').convert('RGB'), np.float32) / 255
    beauty = np.repeat(np.repeat(beauty, SS, 0), SS, 1)[:H2, :W2]
    m = (unit_shell | unit_mech)[..., None]
    img[:] = np.where(m, beauty, img)
else:
    tone = np.clip(0.15 + 0.85 * (1 - np.clip(lam, 0, 1)), 0, 1)
    col = PAL['unit_l'][None, None] * (1 - tone[..., None]) + PAL['unit'][None, None] * tone[..., None]
    img[:] = np.where(unit_shell[..., None], col, img)
    paint(unit_mech, PAL['faint'], 0.6)

# ---------------------------------------------------------------- 线
def draw_lines(mask, color, r):
    m = dilate(mask, r) if r > 0 else mask
    paint(m, color)

ctx_cat = ~(unit_shell | unit_mech | up_units | leaf) & ~bg
# 轮廓（前后遮挡）比转折重一档；单元最重
draw_lines((e_cr | e_id) & ctx_cat & ~sil, PAL['ctx'], 0)
draw_lines(sil & ctx_cat, PAL['ink'], 1)
draw_lines((e_id | e_cr | e_dep) & up_units, PAL['faint'], 0)
draw_lines((e_id | e_cr | e_dep) & leaf, PAL['coral_d'] if UNIT == 'render' else PAL['ctx'], 0)
if UNIT == 'render':
    draw_lines(sil & (unit_shell | unit_mech), PAL['ink'], 1)
else:
    draw_lines((e_cr | e_id) & (unit_shell | unit_mech) & ~sil, PAL['coral_d'], 0)
    draw_lines(sil & (unit_shell | unit_mech), PAL['ink'], 1)

# ---------------------------------------------------------------- 缩回终稿分辨率
im = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
im = im.resize((W2 // SS, H2 // SS), Image.LANCZOS)
im.save(OUT)
zf = np.where(bg, 1e10, Z).reshape(H2 // SS, SS, W2 // SS, SS).min(axis=(1, 3))
np.save(OUT.replace('.png', '_z.npy'), zf.astype(np.float32))
cf = cat.reshape(H2 // SS, SS, W2 // SS, SS)[:, 0, :, 0]
np.save(OUT.replace('.png', '_cat.npy'), cf.astype(np.int16))
print('NPR', K, UNIT, im.size)
