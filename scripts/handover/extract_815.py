# -*- coding: utf-8 -*-
"""815.3dm → 交接文档用的分件网格（pickle）。复用 gen_machine 的分类，不另写一份。

用法：python extract_815.py <815.3dm> <out.pkl>
坐标：输出统一换到「环局部 / 台架世界系」（x = 体轴站位，y = 横向 u，z = 高 v；
中间轴轴线 = y=0,z=0 的那条 x 向直线；S1 在 x=−170，S5 在 x=+170）。
"""
import sys, pickle, math
from pathlib import Path
import numpy as np
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "model-extract"))
import gen_machine as gm  # noqa: E402
import rhino3dm as r3d  # noqa: E402

src, out = sys.argv[1], sys.argv[2]
model = r3d.File3dm.Read(src)
shell = gm.parse_shell()
A = gm.load_assembly(model, shell)
D = A["delta"]

# 815 装配坐标 → 旧图纸系（+D）→ 台架世界系（gen_machine.main 的 to_world 同式）
def to_world(v):
    v = v + D
    x_asm, y_asm, z_asm = v[:, 0], v[:, 1], v[:, 2]
    u = x_asm - gm.X0
    w_plane = gm.PLANE0 - gm.PITCH * 2          # S3 环面 = 站位 0
    x = -(y_asm - w_plane)                       # 体轴：S1 在 −170（图纸 y 大 → 站位小）
    return np.c_[x, u, z_asm - gm.Z0]

def mesh_of(o):
    g = o.Geometry
    if g.ObjectType == r3d.ObjectType.InstanceReference:
        acc = []
        gm.expand_instance(model, g, acc)
        m = gm.merge(acc)
    else:
        m = gm.raw_mesh(g)
    if m is None:
        return None
    v, t = m
    return to_world(v).astype(np.float32), t.astype(np.int32)

parts = []
def add(cat, o, ring=None, extra=None):
    m = mesh_of(o)
    if m is None:
        print("  !! 空网格", cat, ring); return
    v, t = m
    lo, hi = v.min(0), v.max(0)
    parts.append(dict(cat=cat, ring=ring, v=v, t=t, lo=lo, hi=hi,
                      name=o.Attributes.Name or "", id=str(o.Attributes.Id), **(extra or {})))

def ring_of_x(x):
    return int(min(range(5), key=lambda i: abs(x - gm.STATION[i])))

for o in A["plates"]:
    m = mesh_of(o)
    if m is None: continue
    v, t = m
    c = (v.min(0) + v.max(0)) / 2
    parts.append(dict(cat="plate", ring=ring_of_x(c[0]), v=v, t=t, lo=v.min(0), hi=v.max(0), name="", id=str(o.Attributes.Id)))
for o in A["wheels"]:
    m = mesh_of(o); v, t = m
    c = (v.min(0) + v.max(0)) / 2
    parts.append(dict(cat="wheel", ring=ring_of_x(c[0]), v=v, t=t, lo=v.min(0), hi=v.max(0), name="", id=str(o.Attributes.Id)))
for i, lst in A["rods"].items():
    for o in lst: add("rod", o, i)
shaft_ids = {str(o.Attributes.Id) for o in A["shaft"]}
for o in A["shaft"]:
    g = o.Geometry; bb = g.GetBoundingBox()
    dx, dy, dz = bb.Max.X-bb.Min.X, bb.Max.Y-bb.Min.Y, bb.Max.Z-bb.Min.Z
    kind = "shaft" if dy > 300 else ("motor" if dx > 80 else "axpart")
    add(kind, o)
rail_ids = {str(o.Attributes.Id) for o in A["rails"]}
for o in A["frame"]:
    if str(o.Attributes.Id) in rail_ids:
        bb = o.Geometry.GetBoundingBox()
        add("rail", o)
    else:
        add("chassis", o)
for o in A["arm"]: add("arm", o)
for o in A["small"]: add("small", o)
for p in parts:
    if p["cat"] == "rail":
        p["ring"] = ring_of_x((p["lo"][0] + p["hi"][0]) / 2)

# ---- 大触手：块局部坐标 → 世界的变换 + 肌腱路径实测（端板窗口、中央导块槽口、根部腱孔、梢端绑柱）
def arm_route():
    ref = A["arm"][0].Geometry
    idef = model.InstanceDefinitions.FindId(ref.ParentIdefId)
    loc, curves = [], []
    for oid in idef.GetObjectIds():
        o = model.Objects.FindId(oid); g = o.Geometry
        if g.ObjectType == r3d.ObjectType.Curve:
            dom = g.Domain
            curves.append(np.array([[p.X, p.Y, p.Z] for p in (g.PointAt(dom.T0 + (dom.T1 - dom.T0) * k / 40) for k in range(41))]))
            continue
        m = gm.raw_mesh(g)
        if m is not None:
            loc.append((np.asarray(m[0], float), np.asarray(m[1], int)))
    acc = []
    gm.expand_instance(model, ref, acc)
    L = np.vstack([v for v, _ in loc]); W = to_world(np.vstack([np.asarray(v, float) for v, _ in acc]))
    assert len(L) == len(W), "块局部与世界网格顶点数不一致"
    X = np.c_[L, np.ones(len(L))]
    M = np.linalg.lstsq(X, W, rcond=None)[0]
    assert np.abs(X @ M - W).max() < 1e-6
    # 轴线：节间脊柱杆的中心（块局部 y, z）
    ax_y, ax_z = 0.1, 6.9
    def zcross(v, t, x0, y0):
        T = v[t]; s = T[:, :, 0] - x0; out = []
        for tri, ss in zip(T, s):
            pos = ss > 0
            if pos.all() or (~pos).all(): continue
            pts = []
            for a, b in ((0, 1), (1, 2), (2, 0)):
                if (ss[a] > 0) != (ss[b] > 0):
                    u = ss[a] / (ss[a] - ss[b]); pts.append(tri[a] + (tri[b] - tri[a]) * u)
            if len(pts) == 2:
                p, q = pts
                if (p[1] - y0) * (q[1] - y0) < 0:
                    u = (y0 - p[1]) / (q[1] - p[1]); out.append(p[2] + u * (q[2] - p[2]))
        return sorted(out)
    plates = []
    for v, t in loc:
        lo, hi = v.min(0), v.max(0); s = hi - lo
        if s[0] < 9 and s[1] > 12 and s[2] > 12 and lo[0] > 0:
            zs = zcross(v, t, (lo[0] + hi[0]) / 2, ax_y)
            plates.append(((lo[0] + hi[0]) / 2, round(zs[1] - ax_z, 2)))   # 窗口底（V 尖）离轴
    plates.sort()
    grooves = []   # 中央导块的三道槽口：每站三段短弧，取 270°（正下方）那段的离轴距离
    for c in curves:
        if len(c) and np.ptp(c[:, 0]) < 0.5 and abs(c[:, 1].mean() - ax_y) < 0.5 and c[:, 2].mean() < ax_z - 3 and c[0, 0] > 30:
            grooves.append((c[:, 0].mean(), round(ax_z - c[:, 2].mean(), 2)))
    grooves.sort()
    return dict(l2w=M.tolist(), axis=(ax_y, ax_z), plates=plates, grooves=grooves)
ARM = arm_route()
print("大触手端板", len(ARM["plates"]), "槽口", len(ARM["grooves"]))

from collections import Counter
print(Counter(p["cat"] for p in parts))
print("三角形总数", sum(len(p["t"]) for p in parts))
allv = np.vstack([p["v"] for p in parts])
print("整机包围盒", allv.min(0).round(1), allv.max(0).round(1), "尺寸", (allv.max(0)-allv.min(0)).round(1))
pickle.dump(dict(parts=parts, shell=shell, delta=D, arm=ARM), open(out, "wb"))
