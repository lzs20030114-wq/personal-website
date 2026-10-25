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

from collections import Counter
print(Counter(p["cat"] for p in parts))
print("三角形总数", sum(len(p["t"]) for p in parts))
allv = np.vstack([p["v"] for p in parts])
print("整机包围盒", allv.min(0).round(1), allv.max(0).round(1), "尺寸", (allv.max(0)-allv.min(0)).round(1))
pickle.dump(dict(parts=parts, shell=shell, delta=D), open(out, "wb"))
