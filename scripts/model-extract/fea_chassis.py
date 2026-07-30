# -*- coding: utf-8 -*-
"""底盘梯形桁架（骨架层 2 件）有限元：空间梁单元刚架。

用法（同 measure_729.py 的环境，见 requirements.txt）：
    python fea_chassis.py [../../模型求解器参考/729新参考.3dm]

结论与判读写在 轮回机器_底盘桁架FEA.md；那份文档的数字一律以本脚本输出为准，手改无效。

方法：
  · 构件布局与截面从 729新参考.3dm 的渲染网格实测（高度场像素积分，不做理想化假设）；
  · 载荷 = 全机各层实体体积 × 密度 + 非打印件（电机/轴/舵机/紧固件）批注值，
    按 x 杠杆法分到左右两副桁架、按 y 就近分到五个站位；
  · 工况：C1 展示支承（两端简支，长期）· C2 单侧搬运（一副桁架承全重×2 动载）· C3 面内推挤（斜撑作用检验）；
  · 候选减薄设计逐一复算，输出 应力安全系数 / 挠度 / 相邻站位差沉 / 质量。

单位：mm, N, MPa。梁 = 12 自由度 Euler-Bernoulli 空间梁单元。
"""
import argparse
import io, sys, math
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import numpy as np
import rhino3dm as r3d
from collections import defaultdict

_ap = argparse.ArgumentParser()
_ap.add_argument("path", nargs="?", default="../../模型求解器参考/729新参考.3dm")
_ap.add_argument("--json", default=None, help="把出图用的结果数据写成 JSON")
_args = _ap.parse_args()
PATH = _args.path

# ---------------- 材料假设（结论对材料不敏感，报告里给敏感性） ----------------
E_PLA = 2300.0        # MPa，短期弹性模量（FDM PLA 实测常见 2.0–2.6 GPa）
E_LONG = 1150.0       # 长期蠕变折减 ~1/2（展示常载工况的挠度用它）
SIGMA_Y = 50.0        # PLA 屈服/强度（XY 向）
ALLOW_LONG = 12.0     # 长期许用（蠕变+层间+缺口折减）
ALLOW_SHORT = 20.0    # 短期许用（搬运）
RHO_PRINT = 1.24e-3   # g/mm3 PLA 实心
RHO_STEEL = 7.85e-3

# ---------------- 读文件 ----------------
m = r3d.File3dm.Read(PATH)
idx2path = {l.Index: l.FullPath for l in m.Layers}
byl = defaultdict(list)
for o in m.Objects:
    byl[idx2path.get(o.Attributes.LayerIndex, "?")].append(o)

def tri_mesh(geo):
    t = str(geo.ObjectType).replace("ObjectType.", "")
    fm = []
    if t == "Brep":
        for fi in range(len(geo.Faces)):
            msh = geo.Faces[fi].GetMesh(r3d.MeshType.Any)
            if msh is not None:
                fm.append(msh)
    else:
        msh = geo.GetMesh(r3d.MeshType.Any)
        if msh is not None:
            fm.append(msh)
    V_all, F_all, off = [], [], 0
    for msh in fm:
        Vs = msh.Vertices
        V = np.array([[Vs[i].X, Vs[i].Y, Vs[i].Z] for i in range(len(Vs))])
        F = []
        for k in range(msh.Faces.Count):
            f = msh.Faces[k]
            a, b, c, d = f[0], f[1], f[2], f[3]
            F.append([a, b, c])
            if c != d:
                F.append([a, c, d])
        V_all.append(V); F_all.append(np.array(F, int) + off); off += len(V)
    return np.vstack(V_all), np.vstack(F_all)

def signed_volume(V, F):
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    return np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6.0

def solid_volume(geo):
    return abs(signed_volume(*tri_mesh(geo)))

def block_volume_and_centroid(iref):
    """块实例：带符号体积求和后取绝对值（嵌套壳有反向面，逐件取绝对值会重复计数），
    质心 = 带符号体积矩 / 带符号体积。"""
    vol = 0.0; mom = np.zeros(3)
    for V, F in block_meshes(iref):
        a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
        sv6 = np.einsum("ij,ij->i", a, np.cross(b, c))
        vol += sv6.sum() / 6.0
        mom += ((a + b + c) / 4 * sv6[:, None]).sum(0) / 6.0
    if abs(vol) < 1e-9:
        return 0.0, np.zeros(3)
    return abs(vol), mom / vol

def block_meshes(iref, parent_xf=None):
    out = []
    X = iref.Xform
    xf_this = np.array([[X.M00, X.M01, X.M02, X.M03], [X.M10, X.M11, X.M12, X.M13],
                        [X.M20, X.M21, X.M22, X.M23], [0, 0, 0, 1]])
    xf = xf_this if parent_xf is None else parent_xf @ xf_this
    idef = m.InstanceDefinitions.FindId(iref.ParentIdefId)
    for oid in idef.GetObjectIds():
        obj = m.Objects.FindId(oid)
        if obj is None:
            continue
        g = obj.Geometry
        if str(g.ObjectType).replace("ObjectType.", "") == "InstanceReference":
            out.extend(block_meshes(g, xf))
        else:
            try:
                V, F = tri_mesh(g)
            except Exception:
                continue
            Vh = np.hstack([V, np.ones((len(V), 1))])
            out.append(((xf @ Vh.T).T[:, :3], F))
    return out

# ---------------- 1. 桁架实测（骨架[0]，两件镜像对称） ----------------
RES = 0.25
truss_geo = byl["骨架"][0].Geometry
V, F = tri_mesh(truss_geo)
x0g, x1g = V[:, 0].min(), V[:, 0].max()
y0g, y1g = V[:, 1].min(), V[:, 1].max()
nx, ny = int((x1g - x0g) / RES) + 2, int((y1g - y0g) / RES) + 2
ztop = np.full((ny, nx), -np.inf)
zbot = np.full((ny, nx), np.inf)
for f in F:
    tri = V[f]
    lo, hi = tri[:, :2].min(0), tri[:, :2].max(0)
    ix0, ix1 = int((lo[0]-x0g)/RES), int((hi[0]-x0g)/RES)+1
    iy0, iy1 = int((lo[1]-y0g)/RES), int((hi[1]-y0g)/RES)+1
    xs = x0g + (np.arange(ix0, ix1)+0.5)*RES
    ys = y0g + (np.arange(iy0, iy1)+0.5)*RES
    if not len(xs) or not len(ys):
        continue
    PX, PY = np.meshgrid(xs, ys)
    (ax, ay, az), (bx, by, bz), (cx, cy, cz) = tri
    d = (by-cy)*(ax-cx) + (cx-bx)*(ay-cy)
    if abs(d) < 1e-12:
        continue
    w1 = ((by-cy)*(PX-cx) + (cx-bx)*(PY-cy)) / d
    w2 = ((cy-ay)*(PX-cx) + (ax-cx)*(PY-cy)) / d
    w3 = 1 - w1 - w2
    inside = (w1 >= -1e-6) & (w2 >= -1e-6) & (w3 >= -1e-6)
    PZ = w1*az + w2*bz + w3*cz
    st = ztop[iy0:iy1, ix0:ix1]; sb = zbot[iy0:iy1, ix0:ix1]
    np.maximum(st, np.where(inside, PZ, -np.inf), out=st)
    np.minimum(sb, np.where(inside, PZ, np.inf), out=sb)
occ = np.isfinite(ztop) & np.isfinite(zbot)
xs_g = x0g + (np.arange(nx) + 0.5) * RES
ys_g = y0g + (np.arange(ny) + 0.5) * RES

# 弦杆 x 范围：横切端部得两段各 16.2
row_end = occ[10]
runs, s = [], None
for i, v in enumerate(row_end):
    if v and s is None: s = i
    if not v and s is not None: runs.append((i0 := s, i)); s = None
if s is not None: runs.append((s, len(row_end)))
chordL_ix = range(runs[0][0], runs[0][1])
chordR_ix = range(runs[-1][0], runs[-1][1])
web_ix = range(runs[0][1], runs[-1][0])
xL = xs_g[list(chordL_ix)].mean(); xR = xs_g[list(chordR_ix)].mean()

def section_props(cols_ix, rows_ix):
    """对给定像素窗做截面积分（绕水平轴的竖弯 I、绕竖轴的侧弯 I、面积、形心）。
    截面取 x 向窗口（弦杆）在某干净 y 行的 (x,z) 分布。"""
    j = rows_ix
    A = Iy = 0.0
    z1m = []; sx = 0.0
    pts = []
    for i in cols_ix:
        if not occ[j, i]:
            continue
        t = ztop[j, i] - zbot[j, i]
        A += RES * t
        pts.append((xs_g[i], zbot[j, i], ztop[j, i]))
    if A == 0:
        return None
    zbar = sum(RES*(zt**2-zb**2)/2 for _, zb, zt in pts) / A
    xbar = sum(RES*(zt-zb)*x for x, zb, zt in pts) / A
    Ivert = sum(RES*((zt-zbar)**3 - (zb-zbar)**3)/3 for _, zb, zt in pts)
    Ilat = sum(RES*(zt-zb)*((x-xbar)**2) + RES**3*(zt-zb)/12 for x, zb, zt in pts)
    return dict(A=A, Ivert=Ivert, Ilat=Ilat, zbar=zbar, xbar=xbar)

# 干净 y 行（避开横撑）：找 web 空隙行（无腹板占用）
webocc_rows = occ[:, list(web_ix)].sum(1)
clean_j = int(np.argmin(webocc_rows[50:-50])) + 50
chordL = section_props(chordL_ix, clean_j)
chordR = section_props(chordR_ix, clean_j)

# 横撑检测：腹板区占用率 ≥0.85 的行
web_frac = occ[:, list(web_ix)].mean(1)
rung_rows = web_frac >= 0.85
rungs = []
s = None
for j, v in enumerate(rung_rows):
    if v and s is None: s = j
    if not v and s is not None:
        rungs.append((ys_g[s], ys_g[j-1], ys_g[s:j].mean(), (j-s)*RES)); s = None
if s is not None:
    rungs.append((ys_g[s], ys_g[-1], ys_g[s:].mean(), (len(rung_rows)-s)*RES))
# 横撑厚度：腹板区的 ztop-zbot 中位数
webthick = np.nanmedian((ztop - zbot)[np.ix_(np.where(rung_rows)[0], list(web_ix))][occ[np.ix_(np.where(rung_rows)[0], list(web_ix))]])
# 斜撑：腹板像素中不属于横撑行的
brace_mask = occ[:, list(web_ix)].copy()
brace_mask[rung_rows, :] = False
brace_area = brace_mask.sum() * RES * RES
truss_len = y1g - y0g
gap_w = xs_g[runs[-1][0]] - xs_g[runs[0][1]]

print("=" * 96)
print("§1 桁架实测（骨架[0]；[1] 镜像相同）")
print("=" * 96)
print(f"总长 {truss_len:.1f} × 总宽 {x1g-x0g:.1f} mm，弦杆中心距 {xR-xL:.1f}，腹板净距 {gap_w:.1f}")
print(f"弦杆截面（y={ys_g[clean_j]:.1f} 干净行）: A={chordL['A']:.1f} mm²  I竖弯={chordL['Ivert']:.0f} mm⁴  I侧弯={chordL['Ilat']:.0f} mm⁴")
print(f"  （右弦 A={chordR['A']:.1f}, I竖={chordR['Ivert']:.0f} —— 对称性自检）")
print(f"横撑 {len(rungs)} 道: " + "  ".join(f"y={r[2]:.0f}(宽{r[3]:.0f})" for r in rungs))
print(f"腹层厚度中位 {webthick:.2f} mm；斜撑投影面积 {brace_area/100:.1f} cm²")
vol_truss = np.nansum(np.where(occ, ztop - zbot, 0)) * RES * RES
print(f"单件体积 {vol_truss/1000:.1f} cm³ → 质量 {vol_truss*RHO_PRINT:.0f} g (PLA 实心)")

# ---------------- 2. 载荷普查 ----------------
print("\n" + "=" * 96)
print("§2 载荷（装配簇实体体积×密度 + 非打印件批注；x 杠杆分左右桁架，y 就近分站位）")
print("=" * 96)
STATION_Y = []   # 五个站位 = 滑轨架 y 中心
rail_info = []
RAIL_RING = {0: "S2", 1: "S5", 2: "S4", 3: "S3", 4: "S1"}
for i, o in enumerate(byl["滑轨架"]):
    bb = o.Geometry.GetBoundingBox()
    rail_info.append((RAIL_RING[i], (bb.Min.Y+bb.Max.Y)/2, solid_volume(o.Geometry)))
rail_info.sort(key=lambda r: -r[1])  # S1 (y 最大) → S5
STATION_Y = [r[1] for r in rail_info]

ASM_X = -1000.0
xLg, xRg = -5596.2, -5381.1  # 两桁架中心线（左=骨架[1]，右=骨架[0]）
# 骨架[1] bbox x [-5646.5,-5545.9] → 中心 -5596.2；骨架[0] [-5431.4,-5330.8] → -5381.1

loads = []  # (名称, 质量g, x, y, 备注)
def add(name, mass_g, x, y, note=""):
    loads.append((name, mass_g, x, y, note))

def bbc(o):
    bb = o.Geometry.GetBoundingBox()
    return (bb.Min.X+bb.Max.X)/2, (bb.Min.Y+bb.Max.Y)/2, bb

for layer, rho, extra in [("实体_角化件", RHO_PRINT, "环身板"),
                          ("滑轨架", RHO_PRINT, "滑轨架"),
                          ("实体_单杆轮", RHO_PRINT, "曲柄轮"),
                          ("驱动杆", RHO_PRINT, "连杆")]:
    for o in byl[layer]:
        x, y, bb = bbc(o)
        if bb.Max.X > ASM_X:
            continue
        vol = solid_volume(o.Geometry)
        add(extra, vol * rho, x, y)

# 中间轴：按站位均分（钢轴假设——比打印件重 6 倍，取重的）
vol_shaft = solid_volume(byl["中间轴"][0].Geometry)
for yS in STATION_Y:
    add("中间轴(钢)", vol_shaft * RHO_STEEL / 5, -5488.6, yS)

# 电机总成：NEMA17 ≈350g + 打印座
for o in byl["中间轴驱动"]:
    x, y, bb = bbc(o)
    vol = solid_volume(o.Geometry)
    add("电机座(打印)", vol * RHO_PRINT, x, y)
add("NEMA17 电机", 350.0, -5592.3, -1426.3, "42 机身+GT2")

# 触手（块实例）：体积展开；大触手质心在底盘前缘之外 → 前伸悬臂
for name, layer, servo_g in [("大触手", "大触手", 50.0), ("小触手", "小触手", 9.0)]:
    for o in byl[layer]:
        g = o.Geometry
        x, y, bb = bbc(o)
        vol, cg = block_volume_and_centroid(g)
        add(name + "(打印)", vol * RHO_PRINT, cg[0], cg[1], f"质心 y={cg[1]:.0f}")
        add(name + " 舵机", servo_g, cg[0], min(max(cg[1], y0g), y1g))

# 副框（纵梁横梁）+ 电子件 + 紧固蒙皮杂项
for i in (2, 3, 4, 5, 6, 7):
    o = byl["骨架"][i]
    x, y, bb = bbc(o)
    vol = solid_volume(o.Geometry)
    add("副框", vol * RHO_PRINT, x, y)
add("电子件(ESP32/驱动板/线)", 120.0, -5488.6, -1290.0, "批注值")
add("紧固件+轴承", 80.0, -5488.6, -1290.0, "批注值")
add("织物蒙皮", 30.0, -5488.6, -1290.0, "批注值")

tot_g = sum(l[1] for l in loads)
print(f"上部载荷合计 {tot_g:.0f} g（不含桁架自重；自重单件 {vol_truss*RHO_PRINT:.0f} g 在模型里另算）")

# 分配：x 杠杆 → 左右桁架份额；y → 最近站位（大触手质心越界 → 记弯矩）
G = 9.81e-3  # N/g
def split_LR(x):
    lam = (x - xLg) / (xRg - xLg)
    lam = min(max(lam, 0.0), 1.0)
    return 1 - lam, lam

station_load = {"L": np.zeros(5), "R": np.zeros(5)}   # N（竖直向下）
overhang = {"L": [], "R": []}  # (P N, y_质心, y_挂载) 前伸质量 → 挂载站位力 + 弯矩
ARM_MOUNT_Y = -1180.0  # 大触手基座舵机总成 y（滑轨架间实测）
agg = defaultdict(float)
for name, mass_g, x, y, note in loads:
    P = mass_g * G
    fL, fR = split_LR(x)
    agg[name] += mass_g
    for side, f in (("L", fL), ("R", fR)):
        if f < 1e-9:
            continue
        if y > y1g + 5:   # 质心在底盘前缘之外（只有大触手）→ 挂载点力 + 弯矩
            overhang[side].append((P * f, y, ARM_MOUNT_Y))
        else:
            j = int(np.argmin([abs(y - yS) for yS in STATION_Y]))
            station_load[side][j] += P * f

print("\n质量分组（g）：")
for k in sorted(agg, key=lambda k: -agg[k]):
    print(f"   {k:<22} {agg[k]:8.0f}")
print("\n站位竖载（N，S1→S5）：")
for side in ("L", "R"):
    print(f"   {side}: " + "  ".join(f"{p:5.2f}" for p in station_load[side])
          + f"   越界悬臂: {[(round(p,2), round(yc,0), round(ym,0)) for p, yc, ym in overhang[side]]}")

# ---------------- 3. 空间梁 FEA ----------------
def beam_k(E, Gm, A, Iy, Iz, J, L):
    k = np.zeros((12, 12))
    a = E * A / L
    ty, tz = 12*E*Iz/L**3, 12*E*Iy/L**3
    sy, sz = 6*E*Iz/L**2, 6*E*Iy/L**2
    gy, gz = 4*E*Iz/L, 4*E*Iy/L
    hy, hz = 2*E*Iz/L, 2*E*Iy/L
    t = Gm * J / L
    k[0,0]=k[6,6]=a; k[0,6]=k[6,0]=-a
    k[3,3]=k[9,9]=t; k[3,9]=k[9,3]=-t
    k[1,1]=k[7,7]=ty; k[1,7]=k[7,1]=-ty
    k[1,5]=k[5,1]=k[1,11]=k[11,1]=sy
    k[7,5]=k[5,7]=k[7,11]=k[11,7]=-sy
    k[5,5]=k[11,11]=gy; k[5,11]=k[11,5]=hy
    k[2,2]=k[8,8]=tz; k[2,8]=k[8,2]=-tz
    k[2,4]=k[4,2]=k[2,10]=k[10,2]=-sz
    k[8,4]=k[4,8]=k[8,10]=k[10,8]=sz
    k[4,4]=k[10,10]=gz; k[4,10]=k[10,4]=hz
    return k

def rect_J(a, b):
    a, b = max(a, b), min(a, b)
    return a * b**3 * (1/3 - 0.21*(b/a)*(1 - b**4/(12*a**4)))

class Frame:
    def __init__(self, E):
        self.E = E; self.G = E / 2.6
        self.nodes = []; self.elems = []
    def node(self, x, y, z):
        self.nodes.append((x, y, z)); return len(self.nodes) - 1
    def beam(self, i, j, A, Ivert, Ilat, J, tag=""):
        self.elems.append((i, j, A, Ivert, Ilat, J, tag))
    def solve(self, fixed, forces, moments=None):
        n = len(self.nodes); K = np.zeros((6*n, 6*n)); Fv = np.zeros(6*n)
        for i, j, A, Ivert, Ilat, J, tag in self.elems:
            pi, pj = np.array(self.nodes[i]), np.array(self.nodes[j])
            L = np.linalg.norm(pj - pi)
            ex = (pj - pi) / L
            up = np.array([0, 0, 1.0]) if abs(ex[2]) < 0.9 else np.array([1.0, 0, 0])
            ez = np.cross(ex, np.cross(up, ex)); ez /= np.linalg.norm(ez)
            ey = np.cross(ez, ex)
            # 局部: 弯绕 ey (竖弯用 Ivert), 弯绕 ez (侧弯用 Ilat)
            k = beam_k(self.E, self.G, A, Ivert, Ilat, J, L)
            R = np.vstack([ex, ey, ez])
            T = np.zeros((12, 12))
            for b in range(4):
                T[3*b:3*b+3, 3*b:3*b+3] = R
            kg = T.T @ k @ T
            dof = np.r_[6*i:6*i+6, 6*j:6*j+6]
            K[np.ix_(dof, dof)] += kg
        for nd, vec in forces.items():
            Fv[6*nd:6*nd+3] += vec
        if moments:
            for nd, vec in moments.items():
                Fv[6*nd+3:6*nd+6] += vec
        free = np.ones(6*n, bool)
        for nd, dofs in fixed.items():
            for d in dofs:
                free[6*nd+d] = False
        u = np.zeros(6*n)
        u[free] = np.linalg.solve(K[np.ix_(free, free)], Fv[free])
        # 单元最大弯应力
        stresses = []
        for i, j, A, Ivert, Ilat, J, tag in self.elems:
            pi, pj = np.array(self.nodes[i]), np.array(self.nodes[j])
            L = np.linalg.norm(pj - pi)
            ex = (pj - pi) / L
            up = np.array([0, 0, 1.0]) if abs(ex[2]) < 0.9 else np.array([1.0, 0, 0])
            ez = np.cross(ex, np.cross(up, ex)); ez /= np.linalg.norm(ez)
            ey = np.cross(ez, ex)
            k = beam_k(self.E, self.G, A, Ivert, Ilat, J, L)
            R = np.vstack([ex, ey, ez]); T = np.zeros((12, 12))
            for b in range(4):
                T[3*b:3*b+3, 3*b:3*b+3] = R
            dof = np.r_[6*i:6*i+6, 6*j:6*j+6]
            fl = k @ (T @ u[dof])
            # 端弯矩：dof 4/10 绕 ey（竖弯）、5/11 绕 ez（侧弯）；轴力 dof0
            cv = self._cv; cl = self._cl
            sig = 0.0
            for end in (0, 1):
                Mv = abs(fl[4 + 6*end]); Ml = abs(fl[5 + 6*end]); N = abs(fl[0])
                sig = max(sig, Mv * cv[tag] / Ivert + Ml * cl[tag] / Ilat + N / A)
            stresses.append((tag, sig))
        return u, stresses

def build_truss(chord_A, chord_Iv, chord_Il, chord_cv, chord_cl,
                rung_w, rung_t, brace_w, brace_t, use_braces, E,
                rung_ys, stations, span=None):
    """梯子模型：弦杆沿 y，节点在横撑与站位处。返回 Frame + 各站位中点节点。"""
    fr = Frame(E)
    fr._cv = {"chord": chord_cv, "rung": rung_t/2, "brace": brace_t/2}
    fr._cl = {"chord": chord_cl, "rung": rung_w/2, "brace": brace_w/2}
    yy = sorted(set([y0g, y1g] + list(rung_ys) + list(stations)), reverse=True)
    ndL = {y: fr.node(xL, y, 0) for y in yy}
    ndR = {y: fr.node(xR, y, 0) for y in yy}
    for nd in (ndL, ndR):
        ys = sorted(nd, reverse=True)
        for a, b in zip(ys, ys[1:]):
            fr.beam(nd[a], nd[b], chord_A, chord_Iv, chord_Il,
                    rect_J(chord_A/8, 8), "chord")   # J 近似矩形
    rA = rung_w * rung_t
    rIv = rung_w * rung_t**3 / 12
    rIl = rung_t * rung_w**3 / 12
    mid_nodes = {}
    for y in rung_ys:
        mid = fr.node((xL+xR)/2, y, 0)
        fr.beam(ndL[y], mid, rA, rIv, rIl, rect_J(rung_w, rung_t), "rung")
        fr.beam(mid, ndR[y], rA, rIv, rIl, rect_J(rung_w, rung_t), "rung")
        mid_nodes[y] = mid
    if use_braces:
        bA = brace_w * brace_t
        bIv = brace_w * brace_t**3/12; bIl = brace_t * brace_w**3/12
        ys = sorted(rung_ys, reverse=True)
        for a, b in zip(ys, ys[1:]):
            fr.beam(ndL[a], ndR[b], bA, bIv, bIl, rect_J(brace_w, brace_t), "brace")
            fr.beam(ndR[a], ndL[b], bA, bIv, bIl, rect_J(brace_w, brace_t), "brace")
    return fr, ndL, ndR, mid_nodes

# 实测横撑 y 与宽度
rung_ys = [r[2] for r in rungs] + [-1118.9]  # 末项=默认值层的 S1 站位散横撑（右梯实测）
rung_w_meas = float(np.mean([r[3] for r in rungs]))
# 斜撑等效宽度：面积 /(2 条 × 平均斜长 × 撑数量估计) —— 用测得投影面积反推
bay_pairs = list(zip(sorted(rung_ys, reverse=True), sorted(rung_ys, reverse=True)[1:]))
diag_len_tot = sum(2 * math.hypot(xR-xL, a-b) for a, b in bay_pairs)
brace_w_meas = brace_area / max(diag_len_tot, 1)
print(f"\n横撑均宽 {rung_w_meas:.1f}，斜撑等效宽 {brace_w_meas:.1f}（厚均 {webthick:.2f}）")

# 站位载荷进横撑中点：站位对应最近横撑
def nearest_rung(yS):
    return min(rung_ys, key=lambda y: abs(y - yS))

def run_case(design, side_loads, overh, E, scale=1.0, name="", support="corner"):
    (cA, cIv, cIl, ccv, ccl, rw, rt, bw, bt, braces) = design
    fr, ndL, ndR, midn = build_truss(cA, cIv, cIl, ccv, ccl, rw, rt, bw, bt, braces,
                                     E, rung_ys, STATION_Y)
    yy_sorted = sorted(ndL, reverse=True)
    yF, yB = yy_sorted[0], yy_sorted[-1]   # 前端(S1 侧) / 后端
    fixed = {ndL[yF]: [0,1,2], ndR[yF]: [1,2], ndL[yB]: [2], ndR[yB]: [2]}
    if support in ("mid", "rungs"):
        extra = rung_ys if support == "rungs" else [min(yy_sorted, key=lambda y: abs(y - (y0g+y1g)/2))]
        for y in extra:
            yn = min(yy_sorted, key=lambda yy: abs(yy - y))
            for nd in (ndL[yn], ndR[yn]):
                fixed.setdefault(nd, [])
                if 2 not in fixed[nd]:
                    fixed[nd] = sorted(set(fixed[nd]) | {2})
    forces = {}; moments = {}
    def addF(nd, fz):
        forces.setdefault(nd, np.zeros(3))[2] += fz
    # 站位载荷 → 跨骑该站位的两道横撑中点（滑轨架榫脚搭在成对横撑上），y 杠杆分配
    for j, P in enumerate(side_loads):
        below = [y for y in rung_ys if y <= STATION_Y[j]]
        above = [y for y in rung_ys if y > STATION_Y[j]]
        if below and above:
            ya, yb = max(below), min(above)
            lam = (STATION_Y[j] - ya) / (yb - ya)
            addF(midn[ya], -P * scale * (1 - lam))
            addF(midn[yb], -P * scale * lam)
        else:
            addF(midn[nearest_rung(STATION_Y[j])], -P * scale)
    # 前伸质量（大触手）→ 挂载站位弦节点加力 + 绕 x 弯矩（基座板跨接双弦）
    for P, yc, ym in overh:
        yn = min(yy_sorted, key=lambda y: abs(y - ym))
        addF(ndL[yn], -P*scale/2); addF(ndR[yn], -P*scale/2)
        Mx = -P * scale * (yc - ym)
        moments.setdefault(ndL[yn], np.zeros(3))[0] += Mx/2
        moments.setdefault(ndR[yn], np.zeros(3))[0] += Mx/2
    # 自重（弦+横撑近似均布 → 节点集中）
    self_w = vol_truss * RHO_PRINT * G * scale
    for y in yy_sorted:
        addF(ndL[y], -self_w/2/len(yy_sorted)); addF(ndR[y], -self_w/2/len(yy_sorted))
    u, stresses = fr.solve(fixed, forces, moments)
    dz = {y: (u[6*ndL[y]+2] + u[6*ndR[y]+2])/2 for y in yy_sorted}
    st_dz = [dz[min(yy_sorted, key=lambda y: abs(y-yS))] for yS in STATION_Y]
    ddz = max(abs(st_dz[k+1]-st_dz[k]) for k in range(4))
    dz_ext = max(dz.values(), key=abs)
    smax = defaultdict(float)
    for tag, s in stresses:
        smax[tag] = max(smax[tag], s)
    return dict(dz_max=abs(dz_ext), station_dz=st_dz, ddz_adj=ddz, smax=dict(smax),
                profile=sorted((float(y), float(v)) for y, v in dz.items()))

# 现状设计（实测截面）
c = chordL
cv = max(abs(-48.3 - c['zbar']), abs(-56.7 - c['zbar']))  # 距上/下缘
cl = 16.2 / 2
D0 = (c['A'], c['Ivert'], c['Ilat'], cv, cl, rung_w_meas, webthick, brace_w_meas, webthick, True)

print("\n" + "=" * 96)
print("§3 工况结果")
print("=" * 96)
for side in ("L", "R"):
    r = run_case(D0, station_load[side], overhang[side], E_LONG, 1.0)
    print(f"\nC1 展示支承·长期蠕变模量 E={E_LONG:.0f} · {side} 桁架:")
    print(f"   最大挠度 {r['dz_max']:.4f} mm   相邻站位差沉 {r['ddz_adj']:.4f} mm")
    print(f"   峰值应力 { {k: round(v,3) for k,v in r['smax'].items()} } MPa  "
          f"→ 长期许用 {ALLOW_LONG} MPa 下安全系数 {ALLOW_LONG/max(r['smax'].values()):.0f}")

# C2 搬运：单桁架承全重×2
all_load = station_load["L"] + station_load["R"]
all_over = overhang["L"] + overhang["R"]
r = run_case(D0, all_load, all_over, E_PLA, 2.0)
print(f"\nC2 单侧搬运（全机重 ×2 动载全压一副桁架, E={E_PLA:.0f}）:")
print(f"   最大挠度 {r['dz_max']:.4f} mm   峰值应力 { {k: round(v,2) for k,v in r['smax'].items()} } MPa")
print(f"   → 短期许用 {ALLOW_SHORT} MPa 安全系数 {ALLOW_SHORT/max(r['smax'].values()):.1f}，"
      f"对屈服 {SIGMA_Y} MPa 安全系数 {SIGMA_Y/max(r['smax'].values()):.1f}")

# 敏感性：大触手打印质量 ×1.5（块体积计数的不确定度）
arm_extra = [(p*0.5, yc, ym) for p, yc, ym in all_over]
r = run_case(D0, all_load, all_over + arm_extra, E_PLA, 2.0)
print(f"   敏感性·大触手质量×1.5: 峰值应力 {max(r['smax'].values()):.2f} MPa")

# C3 面内推挤：10N 沿 y 推一根弦杆（检验斜撑）
def racking(design, use_braces):
    d = list(design); d[9] = use_braces
    fr, ndL, ndR, midn = build_truss(*d[:10], E_PLA, rung_ys, STATION_Y)
    yy_sorted = sorted(ndL, reverse=True)
    yF, yB = yy_sorted[0], yy_sorted[-1]
    fixed = {ndL[yB]: [0,1,2,3,4,5], ndR[yB]: [0,1,2,3,4,5]}
    forces = {ndL[yF]: np.array([0.0, 10.0, 0.0])}
    u, stresses = fr.solve(fixed, forces)
    dy = u[6*ndL[yF]+1]
    smax = max(s for t, s in stresses)
    return dy, smax
dy_b, s_b = racking(D0, True)
dy_nb, s_nb = racking(D0, False)
print(f"\nC3 面内推挤 10N（一端固定另一端推 y）:")
print(f"   带斜撑: 位移 {dy_b:.4f} mm, 峰值应力 {s_b:.3f} MPa")
print(f"   去斜撑: 位移 {dy_nb:.4f} mm, 峰值应力 {s_nb:.3f} MPa")

# ---------------- 4. 候选减薄设计 ----------------
print("\n" + "=" * 96)
print("§4 候选减薄设计（同一载荷/工况重算；弦杆改矩形 w×t）")
print("=" * 96)

def rect_chord(w, t):
    A = w * t
    return (A, w*t**3/12, t*w**3/12, t/2, w/2)

def truss_mass(w, t, rw, rt, bw, bt, braces):
    m_ch = 2 * w * t * truss_len
    m_r = len(rung_ys) * rw * rt * gap_w
    m_b = braces * diag_len_tot * bw * bt
    return (m_ch + m_r + m_b) * RHO_PRINT

CANDS = [
    ("D0 现状(实测)",        None),
    ("R1 弦10×8 斜撑2.5",   (10.0, 8.0, rung_w_meas, 3.9, 6.0, 2.5, True)),
    ("R1b 弦10×8 无斜撑",   (10.0, 8.0, rung_w_meas, 3.9, 0.0, 0.0, False)),
    ("R2 弦12×5 斜撑2.5",   (12.0, 5.0, rung_w_meas, 3.0, 6.0, 2.5, True)),
    ("R3 弦8×4 无斜撑",     (8.0, 4.0, 6.0, 3.0, 0.0, 0.0, False)),
]
hdr = (f"{'设计':<20}{'质量g':>6} | {'四角挠度':>9}{'加中点':>8}{'满托':>8} | "
       f"{'差沉(角/中)':>12} | {'C1σ':>7}{'C2σ':>7}{'C2屈服SF':>9}")
print(hdr)
for name, spec in CANDS:
    if spec is None:
        D = D0; mass = vol_truss * RHO_PRINT
    else:
        w, t, rw, rt, bw, bt, br = spec
        cAx, cIv, cIl, ccv, ccl = rect_chord(w, t)
        D = (cAx, cIv, cIl, ccv, ccl, rw, rt, bw or 1.0, bt or 1.0, br)
        mass = truss_mass(w, t, rw, rt, bw, bt, br)
    res = {}
    for sup in ("corner", "mid", "rungs"):
        worst = None
        for side in ("L", "R"):
            r1 = run_case(D, station_load[side], overhang[side], E_LONG, 1.0, support=sup)
            if worst is None or r1['dz_max'] > worst['dz_max']:
                worst = r1
        res[sup] = worst
    r2 = run_case(D, all_load, all_over, E_PLA, 2.0)
    s1 = max(res['corner']['smax'].values()); s2 = max(r2['smax'].values())
    print(f"{name:<20}{mass:6.0f} | {res['corner']['dz_max']:9.3f}{res['mid']['dz_max']:8.3f}"
          f"{res['rungs']['dz_max']:8.4f} | {res['corner']['ddz_adj']:6.3f}/{res['mid']['ddz_adj']:5.3f} | "
          f"{s1:7.2f}{s2:7.2f}{SIGMA_Y/s2:9.1f}")

print("\n（C1 = 展示支承长期；C2 = 单侧搬运×2 动载；SF = 许用/峰值。差沉 = 相邻站位挠度差，")
print("  对中预算 ≈ 0.56 mm —— 配隙 0.15 × 站距 85 / 孔长 22.55，超过即开始别轴。）")


# ---------------- 5. 出图数据（--json） ----------------
if _args.json:
    import json as _json
    viz = {"station_y": [float(y) for y in STATION_Y],
           "rung_y": [float(y) for y in rung_ys],
           "truss": {"y0": float(y0g), "y1": float(y1g), "len": float(truss_len)},
           "budget_mm": 0.56,
           "d0_profiles": {}, "cands": [], "racking": {"braced": float(dy_b), "unbraced": float(dy_nb)}}
    for sup in ("corner", "mid", "rungs"):
        best = None
        for side in ("L", "R"):
            r = run_case(D0, station_load[side], overhang[side], E_LONG, 1.0, support=sup)
            if best is None or r["dz_max"] > best[1]["dz_max"]:
                best = (side, r)
        side, r = best
        viz["d0_profiles"][sup] = {"profile": r["profile"], "dz_max": r["dz_max"],
                                   "ddz": r["ddz_adj"], "side": side}
    for name, spec in CANDS:
        if spec is None:
            D = D0; mass = vol_truss * RHO_PRINT
        else:
            w, t, rw, rt, bw, bt, br = spec
            cAx, cIv, cIl, ccv, ccl = rect_chord(w, t)
            D = (cAx, cIv, cIl, ccv, ccl, rw, rt, bw or 1.0, bt or 1.0, br)
            mass = truss_mass(w, t, rw, rt, bw, bt, br)
        row = {"name": name, "mass": float(mass), "ddz": {}, "dzmax": {}}
        for sup in ("corner", "mid", "rungs"):
            worst = None
            for side in ("L", "R"):
                r1 = run_case(D, station_load[side], overhang[side], E_LONG, 1.0, support=sup)
                if worst is None or r1["dz_max"] > worst["dz_max"]:
                    worst = r1
            row["ddz"][sup] = float(worst["ddz_adj"]); row["dzmax"][sup] = float(worst["dz_max"])
        r2 = run_case(D, all_load, all_over, E_PLA, 2.0)
        row["c2_sigma"] = float(max(r2["smax"].values()))
        row["c2_sf_yield"] = float(SIGMA_Y / max(r2["smax"].values()))
        viz["cands"].append(row)
    with open(_args.json, "w", encoding="utf-8") as f:
        _json.dump(viz, f, ensure_ascii=False, indent=1)
    print(f"\n→ 出图数据已写 {_args.json}")
