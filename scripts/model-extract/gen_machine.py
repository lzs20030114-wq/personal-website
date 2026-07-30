# -*- coding: utf-8 -*-
"""729新参考.3dm 整机装配 -> Lab.05 台架载荷（spec = 轮回机器_整机spec.md）

产物：
- src/lib/linkage/machine-shape.ts   分组元数据 + 绑定表 + 传动链参数
- src/demo/assets/machine-mesh.bin   逐组索引网格（Float32 顶点 + Uint16/32 索引）

**环的运动学不在这里生成**——五环销坐标与 shell3d-data.ts 逐位相同（差值 ≤0.001mm），
Lab.05 复用 shell3d 的解算（spec §3.1）。本脚本只出**形体**与**绑定**，绑定的板号
就是 shell3d-data 里 tris 的下标，销号就是 nodes 的下标。

绑定规则（spec §4.2）：
- 角化件 → 三角板：件的二维轮廓（环局部 u-v 凸包）完整包住某板三个销 ⇒ 绑该板。
  用质心落点判定是错的——杆三角是细长杆的三角化，质心法必然同时命中相邻板。
- 无板可绑的配件 → 最近销，只平移不转（S1 两件脚配件、S3 一件拱顶配件）。
- 单杆轮 → 绕轮心转 θ−θ₀；驱动杆 → 由曲柄销与拱顶两点定位姿；其余静件 → 世界系烘死。

坐标：环局部 (u, v, w)，u/v 与 shell3d-data 同系（地线 v=0、轮心 (0,0)），w = 沿体轴。
装配位换算（测绘 §4.4）：u = x_asm + 5488.623，v = z_asm + 40.250，w = y_asm − 环面 y。
世界系同 shell3d：x = station + w，y = u，z = v。

环境：见 requirements.txt。用法：
    python gen_machine.py 模型求解器参考/729新参考.3dm
"""
import io
import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import numpy as np  # noqa: E402
import rhino3dm as r3d  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SHELL_TS = ROOT / "src/lib/linkage/shell3d-data.ts"
OUT_TS = ROOT / "src/lib/linkage/machine-shape.ts"
OUT_BIN = ROOT / "src/demo/assets/machine-mesh.bin"

# 装配位 → 环局部（测绘 §4.4；轴心 z 取五环独立反推的一致值，不取实体包围盒中心）
X0 = -5488.623
Z0 = -40.250
PLANE0 = -1112.406
PITCH = 85.0
# 站位同 shell3d-data（居中）
STATION = [-170.0, -85.0, 0.0, 85.0, 170.0]
RING_NAMES = ["S1_M3x1.057", "S2_M1x1.184", "S3_M5x1.584", "S4_M3x1.000", "S5_M3x0.870"]

WELD = 0.05
MIN_AREA = 0.02
HULL_TOL = 0.6
# 触手是静态摆件（spec §1.2），却占原始三角的 62%（12.3 万 / 19.9 万）——
# 给它单独一档粗焊接降面。1.5mm 保留轮廓、降到 30%；机器本体（板/杆/轮/机架）
# 一律全分辨率，不降。
TENTACLE_WELD = 1.5

# 静件分两组，不合并：台架的「传动」开关要能连中间轴与电机一起切掉，
# 合成一组的话轴会跟着机架走，开关就名不副实了。
STATIC_GROUPS = [
    ("frame", ["滑轨架", "骨架"]),
    ("shaft", ["中间轴", "中间轴驱动"]),
]
# 大触手**不再烘成静件**：它就是 Lab.03 那条三肌腱触手（椎节间距逐位吻合），
# 改由 tentacle3d 的解算实时驱动（spec §3.4）。这里只测它的放置参数。
# 小触手 2026-07-30 起也不再烘死：用户给出机构说明（底座固定 + 舵机驱动大节绕
# 圆形轴心甩动 + 软性中间件连被动小块），按关节拆四组提取（见 smallarm_articulate）。
BLOCK_LAYERS = ["小触手"]
ARM_LAYER = "大触手"
SHAPE_TS = ROOT / "src/lib/linkage/tentacle3d-shape.ts"


# ---------------------------------------------------------------- shell3d-data

def parse_shell():
    """从 shell3d-data.ts 取每环的 nodes / tris / 关键索引。

    机器生成的文件、格式固定，正则可用；但必须自检（见下方 assert），
    格式一旦变动要当场炸掉而不是悄悄错绑。
    """
    src = SHELL_TS.read_text(encoding="utf-8")
    out = {}
    for blk in src.split("\n  {\n")[1:]:
        mn = re.search(r"name: '([^']+)'", blk)
        if not mn:
            continue
        name = mn.group(1)
        g = lambda k: int(re.search(rf"\b{k}: (\d+)", blk).group(1))  # noqa: E731
        tris = [
            tuple(int(v) for v in t.split(","))
            for t in re.findall(r"\[(\d+, \d+, \d+)\]", blk.split("tris:")[1].split("],\n")[0])
        ]
        nodes = [
            (float(x), float(y))
            for x, y in re.findall(r"\{ x: (-?[\d.]+), y: (-?[\d.]+)[ ,}]", blk)
        ]
        out[name] = {
            "pin": g("pin"),
            "center": g("center"),
            "apex": g("apex"),
            "crankR": float(re.search(r"crankR: ([\d.]+)", blk).group(1)),
            "tris": tris,
            "nodes": nodes,
        }
    assert len(out) == 5, f"shell3d-data 解析出 {len(out)} 环，应为 5——格式变了？"
    for name, d in out.items():
        assert d["tris"], f"{name} 没解析出 tris"
        assert len(d["nodes"]) > d["center"], f"{name} nodes 不足（{len(d['nodes'])}）"
        # 轮心必须在原点、曲柄销必须在 (0, R)
        cx, cy = d["nodes"][d["center"]]
        px, py = d["nodes"][d["pin"]]
        assert abs(cx) < 1e-6 and abs(cy) < 1e-6, f"{name} 轮心不在原点：{(cx, cy)}"
        assert abs(px) < 1e-3 and abs(py - d["crankR"]) < 1e-3, f"{name} 曲柄销位不符：{(px, py)}"
    return out


# ------------------------------------------------------------------ 网格提取

def xform_np(xf, pts):
    m = np.array(
        [
            [xf.M00, xf.M01, xf.M02, xf.M03],
            [xf.M10, xf.M11, xf.M12, xf.M13],
            [xf.M20, xf.M21, xf.M22, xf.M23],
        ]
    )
    return pts @ m[:, :3].T + m[:, 3]


def raw_mesh(geo):
    """一个 Brep/Extrusion 的焊接网格 (verts N×3 图纸世界系, tris M×3)。

    整体 GetMeshes 在这批文件里恒返回空，**必须逐面取**（gen_tentacle3d.py 同法）。
    """
    vs, ts, off = [], [], 0
    faces = []
    if isinstance(geo, r3d.Brep):
        for fi in range(len(geo.Faces)):
            try:
                faces.append(geo.Faces[fi].GetMesh(r3d.MeshType.Any))
            except Exception:
                pass
    else:
        try:
            faces.append(geo.GetMesh(r3d.MeshType.Any))
        except Exception:
            pass
    for msh in faces:
        if not msh:
            continue
        V = msh.Vertices
        pv = np.array([[V[j].X, V[j].Y, V[j].Z] for j in range(len(V))])
        for k in range(msh.Faces.Count):
            f = msh.Faces[k]
            ts.append([off + f[0], off + f[1], off + f[2]])
            if f[2] != f[3]:
                ts.append([off + f[0], off + f[2], off + f[3]])
        vs.append(pv)
        off += len(pv)
    if not vs:
        return None
    return weld(np.vstack(vs), np.array(ts, dtype=np.int64))


def weld(verts, tris):
    key = np.round(verts / WELD).astype(np.int64)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    verts = verts[first]
    tris = inv[tris.reshape(-1)].reshape(-1, 3)
    a = verts[tris[:, 1]] - verts[tris[:, 0]]
    b = verts[tris[:, 2]] - verts[tris[:, 0]]
    area = 0.5 * np.linalg.norm(np.cross(a, b), axis=1)
    tris = tris[area > MIN_AREA]
    used = np.unique(tris)
    remap = -np.ones(len(verts), dtype=np.int64)
    remap[used] = np.arange(len(used))
    return verts[used], remap[tris]


def xf_mat(xf):
    return np.array(
        [
            [xf.M00, xf.M01, xf.M02, xf.M03],
            [xf.M10, xf.M11, xf.M12, xf.M13],
            [xf.M20, xf.M21, xf.M22, xf.M23],
            [0.0, 0.0, 0.0, 1.0],
        ]
    )


def apply_mat(M, pts):
    return pts @ M[:3, :3].T + M[:3, 3]


def expand_instance(model, geo, acc, parent=None, depth=0):
    """递归展开图块引用，累积 (verts, tris) 到 acc（图纸世界系）。

    变换必须**逐层累积**：本文件的小触手图块内含 SG90 图块、SG90 自身又含子图块，
    嵌套 ≥3 层。首版只把上一层的 Xform 传下去，第三层起父变换丢失，
    零件掉回原点附近（表现为触手包围盒横跨 5647mm）。
    """
    if depth > 8:
        raise RuntimeError("图块嵌套超过 8 层——疑似循环引用")
    idef = model.InstanceDefinitions.FindId(geo.ParentIdefId)
    if idef is None:
        return
    M = xf_mat(geo.Xform)
    if parent is not None:
        M = parent @ M
    for oid in idef.GetObjectIds():
        ob = model.Objects.FindId(oid)
        if ob is None or ob.Geometry is None:
            continue
        g = ob.Geometry
        if g.ObjectType == r3d.ObjectType.InstanceReference:
            expand_instance(model, g, acc, M, depth + 1)
            continue
        if g.ObjectType not in (r3d.ObjectType.Brep, r3d.ObjectType.Extrusion):
            continue
        mesh = raw_mesh(g)
        if mesh is None:
            continue
        v, t = mesh
        acc.append((apply_mat(M, v), t))


def merge(parts):
    if not parts:
        return None
    vs, ts, off = [], [], 0
    for v, t in parts:
        vs.append(v)
        ts.append(t + off)
        off += len(v)
    return weld(np.vstack(vs), np.vstack(ts))


# --------------------------------------------------------------------- 几何

def hull2d(P):
    P = np.unique(np.round(P, 3), axis=0)
    P = P[np.lexsort((P[:, 1], P[:, 0]))]

    def half(pts):
        st = []
        for p in pts:
            while len(st) >= 2 and cross(st[-1] - st[-2], p - st[-2]) <= 0:
                st.pop()
            st.append(p)
        return st

    return np.array(half(P)[:-1] + half(P[::-1])[:-1])


def cross(a, b):
    return a[0] * b[1] - a[1] * b[0]


def in_hull(h, p, tol=HULL_TOL):
    n = len(h)
    for i in range(n):
        a, b = h[i], h[(i + 1) % n]
        e = b - a
        L = math.hypot(e[0], e[1])
        if L < 1e-9:
            continue
        if cross(e, p - a) < -tol * L:
            return False
    return True


def frame_axes(A, B):
    ex = np.array(B, dtype=float) - np.array(A, dtype=float)
    ex = ex / np.linalg.norm(ex)
    return ex, np.array([-ex[1], ex[0]])


def frame_local(verts, A, B):
    """三角板局部标架：原点 A，ex = 单位(B−A)，ey = ex 逆时针 90°。"""
    ex, ey = frame_axes(A, B)
    d = verts[:, :2] - np.array(A, dtype=float)
    return np.c_[d @ ex, d @ ey, verts[:, 2]]


def frame_world(loc, A, B):
    """frame_local 的逆——**运行时 machine.ts 要照这个写**。"""
    ex, ey = frame_axes(A, B)
    uv = np.array(A, dtype=float) + loc[:, [0]] * ex + loc[:, [1]] * ey
    return np.c_[uv, loc[:, 2]]


# ------------------------------------------------------------------- 小触手

def smallarm_articulate(model, by_layer):
    """小触手关节化提取（用户 2026-07-30 给出机构说明后由静件转正）。

    机构（用户原话的翻译）：底座固定在机架上；**大的一节由 SG90 舵机驱动，绕后端
    圆形轴心甩动**；一根细软杆（软性结构）连到下面的小块；小块无驱动，靠软杆
    传力 + 重力 + 惯性跟着甩——受迫大摆 + 柔性连接的被动小摆。

    分组（块局部坐标，按 z 中心分档；两实例共用同一块定义，网格只烘一份）：
      sa_mount  底座托架 + SG90（静件，跟实例位姿）
      sa_seg1   轴心圆盘 + 悬臂 + 大叉形件 + 上关节块（绕轴心转 θ）
      sa_soft   细软杆（双骨蒙皮，blend = 两关节块之间的裸露带）
      sa_seg2   下关节块 + 小叉形件（被动刚体，位姿由 2D 链解出）

    烘焙局部系（与运行时 machine-smallarm.ts 的标架约定必须一致——闸门在下面）：
      v_l = ( −(z−zJ), y, x−xJ )，J = 本组锚点（seg1 取轴心、soft 取上关节、
      seg2 取下关节、mount 也取轴心）。即局部 x̂ = 块内**向下**（悬垂方向），
      ŷ = 块 y，ẑ = 块 x——右手系，行列式 +1。
      为什么向下当 x̂：gl3d 的 bakeSkinned 按顶点 **x** 坐标算混合权重，
      软杆的弯曲方向必须躺在烘焙 x 轴上。

    返回 (groups, placements, shape, gate_residual)。
    """
    import numpy as _np

    # 找两实例（图纸世界系变换）与块定义
    refs = []
    for o in by_layer.get("小触手", []):
        g = o.Geometry
        if g is not None and g.ObjectType == r3d.ObjectType.InstanceReference:
            refs.append(g)
    if len(refs) != 2:
        sys.exit(f"小触手实例数 {len(refs)} ≠ 2——图纸变了，先核对再出表")
    idef = model.InstanceDefinitions.FindId(refs[0].ParentIdefId)
    if any(model.InstanceDefinitions.FindId(r.ParentIdefId).Id != idef.Id for r in refs):
        sys.exit("两条小触手引用了不同的块定义——提取假设失效")

    # 块局部逐件网格：直接成员逐件取，SG90 子块展开进 mount
    mount_parts, chain_parts = [], []
    for oid in idef.GetObjectIds():
        ob = model.Objects.FindId(oid)
        if ob is None or ob.Geometry is None:
            continue
        g = ob.Geometry
        if g.ObjectType == r3d.ObjectType.InstanceReference:
            acc = []
            expand_instance(model, g, acc)  # 停在块局部系（无实例变换）
            mount_parts += acc
            continue
        if g.ObjectType not in (r3d.ObjectType.Brep, r3d.ObjectType.Extrusion):
            continue
        m = raw_mesh(g)
        if m is None:
            continue
        bb_lo, bb_hi = m[0].min(0), m[0].max(0)
        size = bb_hi - bb_lo
        if size[0] > 50:  # 底座托架（84×44×50，唯一 x 跨度过 50 的件）
            mount_parts.append(m)
        else:
            chain_parts.append((m, bb_lo, bb_hi))

    # 轴心：薄圆盘（x 向 ≤3、y/z 跨度相等且 ≥30）
    discs = [
        (m, lo, hi) for m, lo, hi in chain_parts
        if hi[0] - lo[0] <= 3 and hi[1] - lo[1] >= 30 and abs((hi[1] - lo[1]) - (hi[2] - lo[2])) < 1
    ]
    if len(discs) != 1:
        sys.exit(f"轴心圆盘匹配到 {len(discs)} 件（应为 1）——识别规则需更新")
    dl, dh = discs[0][1], discs[0][2]
    pivot = _np.array([(dl[0] + dh[0]) / 2, (dl[1] + dh[1]) / 2, (dl[2] + dh[2]) / 2])

    # 两个关节块（8×8×7.5）：上 = 软杆顶端所在（属 seg1），下 = 小块顶端（属 seg2）
    knuckles = [
        (m, lo, hi) for m, lo, hi in chain_parts
        if abs((hi[0] - lo[0]) - 8) < 1 and abs((hi[1] - lo[1]) - 8) < 1 and abs((hi[2] - lo[2]) - 7.5) < 1
    ]
    if len(knuckles) != 2:
        sys.exit(f"关节块匹配到 {len(knuckles)} 件（应为 2）——识别规则需更新")
    knuckles.sort(key=lambda k: -(k[1][2] + k[2][2]))  # z 高的在前
    (ka_m, ka_lo, ka_hi), (kb_m, kb_lo, kb_hi) = knuckles
    jA = _np.array([(ka_lo[0] + ka_hi[0]) / 2, 0.0, (ka_lo[2] + ka_hi[2]) / 2])
    jB = _np.array([(kb_lo[0] + kb_hi[0]) / 2, 0.0, (kb_lo[2] + kb_hi[2]) / 2])

    # 分档：z 中心 > −95 → seg1；> −110 → soft；其余 seg2。
    # 阈值取关节块与软杆的实测间隙中点，块定义固定、不会漂。
    seg1_parts, soft_parts, seg2_parts = [], [], []
    zc_a, zc_b = jA[2], jB[2]
    t_hi = (zc_a + (zc_a + zc_b) / 2) / 2  # ≈ −95
    t_lo = (zc_b + (zc_a + zc_b) / 2) / 2  # ≈ −106.4
    for m, lo, hi in chain_parts:
        zc = (lo[2] + hi[2]) / 2
        if zc > t_hi:
            seg1_parts.append(m)
        elif zc > t_lo:
            soft_parts.append(m)
        else:
            seg2_parts.append(m)
    if len(soft_parts) != 1:
        sys.exit(f"软杆匹配到 {len(soft_parts)} 件（应为 1）——分档阈值需核对")

    # 软杆蒙皮混合带：上关节块下端面 → 下关节块上端面（局部 x_l = −(z−zA)）
    b0 = round(float(zc_a - ka_lo[2]), 2)   # −(ka_lo.z − zc_a)
    b1 = round(float(zc_a - kb_hi[2]), 2)
    tip_z = min(float(lo[2]) for _, lo, _hi in
                [(m, m[0].min(0), m[0].max(0)) for m in seg2_parts])

    def bake(parts, J):
        mm = merge(parts)
        v, t = mm
        v_l = _np.c_[-(v[:, 2] - J[2]), v[:, 1] - J[1], v[:, 0] - J[0]]
        return v_l, t

    groups = [
        ("sa_mount", *bake(mount_parts, pivot), None),
        ("sa_seg1", *bake(seg1_parts, pivot), None),
        ("sa_soft", *bake(soft_parts, jA), ("blend", [b0, b1])),
        ("sa_seg2", *bake(seg2_parts, jB), None),
    ]

    # 实例位姿 → 机器世界。图纸→世界线性部 L(dx,dy,dz) = (−dy, dx, dz)（to_world 同式）。
    def Lmap(d):
        return _np.array([-d[1], d[0], d[2]])

    def w_point(p_draw):
        return _np.array([
            STATION[0] - (p_draw[1] - PLANE0),
            p_draw[0] - X0,
            p_draw[2] - Z0,
        ])

    placements = []
    for g in refs:
        M = xf_mat(g.Xform)
        R, t = M[:3, :3], M[:3, 3]
        p_draw = R @ pivot + t
        axis = Lmap(R @ _np.array([1.0, 0, 0]))     # 块 x̂ = 摆轴
        hdir = Lmap(R @ _np.array([0, 1.0, 0]))     # 块 ŷ = 摆平面内水平向
        up = Lmap(R @ _np.array([0, 0, 1.0]))
        if abs(up[2] - 1) > 1e-6:
            sys.exit("小触手实例块 ẑ 未指向世界竖直——摆平面假设失效")
        det = float(_np.linalg.det(_np.c_[axis, hdir, up]))
        if abs(det - 1) > 1e-6:
            sys.exit(f"小触手位姿行列式 {det:.4f} ≠ +1——出现镜像")
        placements.append({
            "o": [round(float(x), 4) for x in w_point(p_draw)],
            "axis": [round(float(x), 4) for x in axis],
            "h": [round(float(x), 4) for x in hdir],
        })

    shape = {
        "L1": round(float(pivot[2] - jA[2]), 3),
        "LS": round(float(jA[2] - jB[2]), 3),
        "L2": round(float(jB[2] - tip_z), 3),
        "blend": [b0, b1],
    }

    # ---- 零位复原闸门：烘焙局部 → 绑定标架 → 世界，须与「原始件直接变换到世界」逐位一致。
    # 抓的是标架约定写反（局部轴排错 / 摆轴取错）——这类错运行时不报错，只画歪。
    worst = 0.0
    for g in refs:
        M = xf_mat(g.Xform)
        R, t = M[:3, :3], M[:3, 3]
        for name, v_l, _t, _x in groups:
            J = {"sa_mount": pivot, "sa_seg1": pivot, "sa_soft": jA, "sa_seg2": jB}[name]
            # 局部→块：v_b = (z_l + Jx, y_l + Jy, −x_l + Jz)
            v_b = _np.c_[v_l[:, 2] + J[0], v_l[:, 1] + J[1], -v_l[:, 0] + J[2]]
            direct = (R @ v_b.T).T + t
            direct_w = _np.c_[
                STATION[0] - (direct[:, 1] - PLANE0), direct[:, 0] - X0, direct[:, 2] - Z0
            ]
            # 绑定标架重建：u = 世界 −ẑ（零位悬垂）、e = axis×u、f = u×e，o = 轴心/关节世界点
            axis = Lmap(R @ _np.array([1.0, 0, 0]))
            u = _np.array([0.0, 0, -1])
            e = _np.cross(axis, u)
            f = _np.cross(u, e)
            o_w = w_point(R @ J + t)
            rebuilt = o_w + v_l[:, [0]] * u + v_l[:, [1]] * e + v_l[:, [2]] * f
            worst = max(worst, float(_np.abs(rebuilt - direct_w).max()))
    return groups, placements, shape, worst


# ------------------------------------------------------------------- 大触手

def parse_shape_arr(name):
    """从 tentacle3d-shape.ts 取一个数组常量（机器生成、格式固定）。"""
    src = SHAPE_TS.read_text(encoding="utf-8")
    mm = re.search(rf"export const {name}[^=]*= (\[.*?\]) as const;", src, re.S)
    if not mm:
        raise RuntimeError(f"tentacle3d-shape.ts 里找不到 {name}")
    return json.loads(mm.group(1))


def measure_arm(model, by_layer):
    """大触手在装配位的放置参数 + 滚转自检。

    实测结论（2026-07-29）：臂轴沿 +y；截面坐标系与装配系**不差旋转**（滚转 ≈ 0）。
    故 sim → 装配 是纯平移，再叠上整机的世界映射 ⇒ 总体 = 绕世界 z 轴 90° + 平移。

    滚转只能靠**离轴地标**定住——用梢端三根绑线柱的方位与 TIES 比对。
    椎节质心全部落在轴线上，定不出绕轴姿态，光看它们会漏掉滚转错误。
    """
    ties = parse_shape_arr("TIES")
    tie_ax = sum(t[1] for t in ties) / len(ties)

    acc = []
    for o in by_layer.get(ARM_LAYER, []):
        g = o.Geometry
        if g is None or g.ObjectType != r3d.ObjectType.InstanceReference:
            continue
        expand_instance(model, g, acc)
    if not acc:
        sys.exit("装配位没找到大触手图块")

    parts = [(v.mean(axis=0), v, t) for v, t in acc]
    V = np.vstack([p[1] for p in parts])
    _u, _s, vt = np.linalg.svd(V - V.mean(axis=0), full_matrices=False)
    axis = vt[0] / np.linalg.norm(vt[0])
    if abs(abs(axis[1]) - 1) > 1e-3:
        sys.exit(f"大触手主轴不沿 y（实测 {np.round(axis, 4)}）——放置假设不成立")

    parts.sort(key=lambda r: r[0][1])
    clusters = [[parts[0]]]
    for r in parts[1:]:
        if r[0][1] - clusters[-1][-1][0][1] > 12:
            clusters.append([r])
        else:
            clusters[-1].append(r)
    verts = [c for c in clusters if len(c) >= 17]
    if len(verts) < 5:
        sys.exit(f"大触手椎节簇只认出 {len(verts)} 个——分簇阈值或模型变了")
    cen = np.array([np.vstack([x[1] for x in c]).mean(axis=0) for c in verts])
    ax_x = float(cen[:, 0].mean())
    ax_z = float(cen[:, 2].mean())
    spread = float(max(cen[:, 0].std(), cen[:, 2].std()))
    if spread > 0.5:
        sys.exit(f"椎节质心不共线（散布 {spread:.2f}mm）——轴线拟合不可信")

    # ① 先用六个椎节质心把 ax 原点拟合出来——**这一步与滚转无关**，
    #    质心全在轴线上，只定得住沿臂位置。
    stations = parse_shape_arr("STATIONS")
    if len(stations) < len(cen):
        sys.exit(f"STATIONS 只有 {len(stations)} 站，少于实测椎节 {len(cen)}")
    offs = [cen[i][1] - stations[i][1] for i in range(len(cen))]
    y0 = sum(offs) / len(offs)
    scatter = max(abs(o - y0) for o in offs)
    if scatter > 1.0:
        sys.exit(f"椎节沿臂位置与 STATIONS 对不上（残差 {scatter:.2f}mm）——不是同一条触手")

    # ② 再按 ax = TIES 的沿臂位置去**定位**该取哪一组绑线柱。
    #    梢端有两组半径≈6 的三件（实测彼此差约 60°），按「最靠梢端」取会选错那组
    #    （首版即此错，滚转算出 61°）。用沿臂位置选，不用「最靠梢端」选。
    want_y = y0 + tie_ax
    cand = []
    for c, _v, _t in parts:
        rr = math.hypot(c[0] - ax_x, c[2] - ax_z)
        if 4.5 < rr < 8.5 and abs(c[1] - want_y) < 6.0:
            cand.append((c, rr, math.degrees(math.atan2(c[2] - ax_z, c[0] - ax_x))))
    if len(cand) < 3:
        sys.exit(f"ax≈{tie_ax:.1f} 处的绑线柱只找到 {len(cand)} 根——定不住滚转")
    cand.sort(key=lambda p: abs(p[0][1] - want_y))
    posts = cand[:3]
    print(
        f"  绑线柱取 ax≈{tie_ax:.1f}（y≈{want_y:.2f}）处三根，实测 y="
        f"{[round(p[0][1], 2) for p in posts]}"
    )

    tie_az = sorted(math.degrees(math.atan2(t[2], t[0])) % 360 for t in ties)
    post_az = sorted(p[2] % 360 for p in posts)
    roll = max(abs(((a - b + 180) % 360) - 180) for a, b in zip(post_az, tie_az))
    print(
        f"  大触手：轴线 x={ax_x:.3f} z={ax_z:.3f}（椎节 {len(verts)} 簇，散布 {spread:.3f}mm）"
        f" · ax0 在 y={y0:.3f} · 滚转残差 {roll:.2f}°"
    )
    if roll > 6.0:
        sys.exit(f"大触手滚转 {roll:.1f}° ≠ 0——放置需要绕臂轴旋转，当前实现未支持")
    return {"axis_x": ax_x, "axis_z": ax_z, "ax0_y": y0, "roll_deg": round(roll, 3)}


# --------------------------------------------------------------------- main

def main():
    path = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "模型求解器参考/729新参考.3dm")
    model = r3d.File3dm.Read(path)
    if model is None:
        sys.exit(f"READ FAILED: {path}")
    shell = parse_shell()
    layer = {l.Index: (l.FullPath if hasattr(l, "FullPath") else l.Name) for l in model.Layers}

    by_layer = defaultdict(list)
    for o in model.Objects:
        by_layer[layer.get(o.Attributes.LayerIndex, "?")].append(o)

    groups = []  # (name, verts, tris, meta)
    report = []
    # 验收用：逐组记下「图纸姿态下应该长在哪」（环局部 u,v,w），
    # 生成末尾按运行时的重建方式回算比对（spec M1 闸门）。
    expect = {}

    # ---- 每环：角化件 → 板；配件 → 销；单杆轮；驱动杆
    plates = [o for o in by_layer["实体_角化件"] if o.Geometry is not None]
    wheels = [o for o in by_layer["实体_单杆轮"] if o.Geometry is not None]
    rods = [o for o in by_layer["驱动杆"] if o.Geometry is not None]

    bind_plate, bind_aux, bind_wheel, bind_rod = [], [], [], []

    for ri, rname in enumerate(RING_NAMES):
        d = shell[rname]
        plane = PLANE0 - PITCH * ri
        tris = d["tris"]
        nodes = d["nodes"]
        claimed = {}

        def ring_local(v):
            # w = −(y_asm − 环面)：站位轴与图纸 y **反向**（S1 y=−1112.4 → 站位 −170，
            # S5 y=−1452.4 → +170）。取正号会把整机沿体轴镜像——板的两层左右对调，
            # 且映射行列式变 −1，烘出来的面法向朝里，打光一并出错。
            return np.c_[v[:, 0] - X0, v[:, 2] - Z0, -(v[:, 1] - plane)]

        # --- 角化件
        cand = []
        for o in plates:
            g = o.Geometry
            bb = g.GetBoundingBox()
            cy = (bb.Min.Y + bb.Max.Y) / 2
            if cy > -1000 or abs(cy - plane) > PITCH / 2:
                continue
            mesh = raw_mesh(g)
            if mesh is None:
                continue
            v, t = mesh
            cand.append((ring_local(v), t))

        for v, t in cand:
            h = hull2d(v[:, :2])
            hits = [
                k
                for k, tri in enumerate(tris)
                if all(in_hull(h, np.array(nodes[j])) for j in tri)
            ]
            if len(hits) == 1:
                k = hits[0]
                if k in claimed:
                    report.append(f"!! {rname} 板 {k} 被两件同时认领——绑定不唯一")
                claimed[k] = True
                A, B = nodes[tris[k][0]], nodes[tris[k][1]]
                nm = f"p{ri}_{k}"
                groups.append((nm, frame_local(v, A, B), t, None))
                expect[nm] = v
                bind_plate.append((ri, k))
            elif len(hits) == 0:
                # 配件：绑最近销（只平移）
                c = v[:, :2].mean(axis=0)
                j = min(
                    range(len(nodes)),
                    key=lambda i: (nodes[i][0] - c[0]) ** 2 + (nodes[i][1] - c[1]) ** 2,
                )
                loc = v.copy()
                loc[:, 0] -= nodes[j][0]
                loc[:, 1] -= nodes[j][1]
                nm = f"x{ri}_{j}"
                groups.append((nm, loc, t, None))
                expect[nm] = v
                bind_aux.append((ri, j))
                report.append(
                    f"   {rname} 配件 {len(t)} 三角 @ ({c[0]:.1f},{c[1]:.1f}) → 销 {j} "
                    f"({nodes[j][0]:.1f},{nodes[j][1]:.1f})，只平移不转"
                )
            else:
                report.append(f"!! {rname} 一件同时含住板 {hits}——判据失效，请查")
        missing = [k for k in range(len(tris)) if k not in claimed]
        if missing:
            report.append(f"!! {rname} 板 {missing} 没有对应实体")

        # --- 单杆轮（绕轮心转）
        for o in wheels:
            bb = o.Geometry.GetBoundingBox()
            cy = (bb.Min.Y + bb.Max.Y) / 2
            if cy > -1000 or abs(cy - plane) > PITCH / 2:
                continue
            mesh = raw_mesh(o.Geometry)
            if mesh is None:
                continue
            v, t = mesh
            lv = ring_local(v)
            groups.append((f"w{ri}", lv, t, None))
            expect[f"w{ri}"] = lv
            bind_wheel.append(ri)
            break

        # --- 驱动杆（曲柄销 → 拱顶 两点定位姿）
        for o in rods:
            bb = o.Geometry.GetBoundingBox()
            cy = (bb.Min.Y + bb.Max.Y) / 2
            if cy > -1000 or abs(cy - plane) > PITCH / 2:
                continue
            mesh = raw_mesh(o.Geometry)
            if mesh is None:
                continue
            v, t = mesh
            A = nodes[d["pin"]]
            B = nodes[d["apex"]]
            lv = ring_local(v)
            groups.append((f"r{ri}", frame_local(lv, A, B), t, None))
            expect[f"r{ri}"] = lv
            bind_rod.append(ri)
            break

    # ---- 静件：图纸世界系 → 台架世界系（x = station + w, y = u, z = v）
    def to_world(v):
        # 与 ring_local 同一个约定：站位轴反向（见那里的注释）
        u = v[:, 0] - X0
        vv = v[:, 2] - Z0
        return np.c_[STATION[0] - (v[:, 1] - PLANE0), u, vv]

    # 体轴方向自检：五副滑轨架各服务一个环，映射后的 x 应逐一落在五个站位上。
    # 首版 w 取了正号（整机沿体轴镜像），M1 的回算闸门查的是环局部往返、抓不到它；
    # 这一关专抓世界系映射的方向错。
    rail_x = []
    for o in by_layer.get("滑轨架", []):
        g = o.Geometry
        if g is None:
            continue
        bb = g.GetBoundingBox()
        cy = (bb.Min.Y + bb.Max.Y) / 2
        if cy > -1000:
            continue
        rail_x.append(STATION[0] - (cy - PLANE0))
    rail_x.sort()
    if len(rail_x) == len(STATION):
        # 滑轨架是 22.6 厚的板、贴在环面旁边，故整体有个**一致的**偏置（约半个板厚）。
        # 要查的是「去掉这个共同偏置之后还剩多少」——剩得多才说明方向或次序错了。
        off = [a - b for a, b in zip(rail_x, STATION)]
        bias = sum(off) / len(off)
        resid = max(abs(o - bias) for o in off)
        print(
            f"  体轴自检：滑轨架落位 {[round(v, 1) for v in rail_x]} vs 站位 {STATION}"
            f"  共同偏置 {bias:+.1f}mm（板厚偏置，正常）· 去偏残差 {resid:.2f}mm"
        )
        if resid > 1.0:
            sys.exit(f"体轴方向或次序错：去偏残差 {resid:.1f}mm——检查 w 的符号")
    else:
        report.append(f"!! 滑轨架 {len(rail_x)} 副，与五环对不上")

    for gname, layers in STATIC_GROUPS:
        static_parts = []
        for lay in layers:
            for o in by_layer.get(lay, []):
                g = o.Geometry
                if g is None or g.ObjectType not in (r3d.ObjectType.Brep, r3d.ObjectType.Extrusion):
                    continue
                bb = g.GetBoundingBox()
                if (bb.Min.X + bb.Max.X) / 2 > -1000:
                    continue
                mesh = raw_mesh(g)
                if mesh is not None:
                    static_parts.append((to_world(mesh[0]), mesh[1]))
        st = merge(static_parts)
        if st is None:
            report.append(f"!! 静件组 {gname} 空（图层 {layers}）")
            continue
        print(f"  静件 {gname}: {len(st[1]):,} 三角（图层 {'/'.join(layers)}）")
        groups.append((gname, st[0], st[1], None))

    tent_parts = []
    for lay in BLOCK_LAYERS:
        for o in by_layer.get(lay, []):
            g = o.Geometry
            if g is None or g.ObjectType != r3d.ObjectType.InstanceReference:
                continue
            acc = []
            expand_instance(model, g, acc)
            for v, t in acc:
                tent_parts.append((to_world(v), t))
    arm = measure_arm(model, by_layer)

    del tent_parts  # 静件路线已退役：小触手改关节化（见 smallarm_articulate）
    sa_groups, sa_places, sa_shape, sa_gate = smallarm_articulate(model, by_layer)
    print(f"  小触手关节化：{' · '.join(f'{n} {len(t):,}三角' for n, _v, t, _x in sa_groups)}")
    print(f"  小触手零位复原最大偏差 {sa_gate:.2e} mm")
    if sa_gate > 1e-3:
        sys.exit(f"小触手零位复原超差 {sa_gate:.4f}mm——标架约定有误，不出 TS")
    groups += sa_groups

    # ---- M1 验收闸门：按运行时的重建方式回算，比对图纸姿态原位
    # 这一关专抓标架约定写反（ey 取反 = 零件镜像，运行时才发现就晚了）。
    worst = 0.0
    worst_name = ""
    for name, loc, _t, _x in groups:
        exp = expect.get(name)
        if exp is None:
            continue
        ri = int(name[1])
        d = shell[RING_NAMES[ri]]
        nodes = d["nodes"]
        if name[0] == "p":
            k = int(name.split("_")[1])
            got = frame_world(loc, nodes[d["tris"][k][0]], nodes[d["tris"][k][1]])
        elif name[0] == "r":
            got = frame_world(loc, nodes[d["pin"]], nodes[d["apex"]])
        elif name[0] == "x":
            j = int(name.split("_")[1])
            got = loc.copy()
            got[:, 0] += nodes[j][0]
            got[:, 1] += nodes[j][1]
        else:  # w：图纸姿态 Δθ = 0
            got = loc
        e = float(np.abs(got - exp).max())
        if e > worst:
            worst, worst_name = e, name
    print(f"  绑定回算最大偏差 {worst:.2e} mm（{worst_name}）")
    if worst > 1e-3:
        sys.exit(f"绑定回算超差：{worst_name} {worst:.4f}mm——标架约定有误，不出 TS")

    # ---- 打包
    blob = b""
    meta = []
    for name, v, t, extra in groups:
        idx32 = len(v) > 65535
        v32 = np.round(v, 3).astype("<f4")
        idx = t.astype("<u4" if idx32 else "<u2")
        v_off = len(blob)
        blob += v32.tobytes()
        while len(blob) % 4:
            blob += b"\0"
        i_off = len(blob)
        blob += idx.tobytes()
        while len(blob) % 4:
            blob += b"\0"
        entry = {
            "name": name,
            "verts": int(len(v)),
            "tris": int(len(t)),
            "vOff": v_off,
            "iOff": i_off,
            "idx32": bool(idx32),
        }
        if isinstance(extra, tuple) and extra and extra[0] == "blend":
            entry["blend"] = extra[1]
        meta.append(entry)
    OUT_BIN.parent.mkdir(parents=True, exist_ok=True)
    OUT_BIN.write_bytes(blob)

    total_t = sum(m["tris"] for m in meta)
    print(f"组 {len(meta)}，三角合计 {total_t:,}，mesh.bin {len(blob):,} 字节")
    print(f"  板 {len(bind_plate)} · 配件 {len(bind_aux)} · 单杆轮 {len(bind_wheel)} · 驱动杆 {len(bind_rod)}")
    for line in report:
        print(line)
    if any(line.startswith("!!") for line in report):
        sys.exit("绑定有问题，见上面 !! 行——不出 TS")

    # ---- 传动链参数（校验用；l 取图纸标注，rod rest 由 shell3d 自己算）
    drive = []
    for ri, rname in enumerate(RING_NAMES):
        d = shell[rname]
        drive.append(
            {
                "ring": rname,
                "station": STATION[ri],
                "crankR": d["crankR"],
                "apex0": round(d["nodes"][d["apex"]][1], 4),
            }
        )

    arm_origin = [
        round(STATION[0] - (arm["ax0_y"] - PLANE0), 4),
        round(arm["axis_x"] - X0, 4),
        round(arm["axis_z"] - Z0, 4),
    ]
    arm_json = json.dumps({"origin": arm_origin, "rollDeg": arm["roll_deg"]}, ensure_ascii=False)
    sa_places_json = json.dumps(sa_places, ensure_ascii=False)
    sa_shape_json = json.dumps(sa_shape, ensure_ascii=False)
    print(f"  小触手位姿 {sa_places} 链 {sa_shape}")
    print(f"  大触手世界落位 origin={arm_origin}")

    ts = io.StringIO()
    ts.write(
        f"""// machine-shape.ts —— 轮回机器整机（Lab.05）形体分组与绑定表，机器生成。
// 来源：模型求解器参考/729新参考.3dm 装配位（2026-07-29 提取，生成脚本
// scripts/model-extract/gen_machine.py——手改无效，改脚本重生成）。
// spec = 轮回机器_整机spec.md；测绘 = 轮回机器_整机测绘.md。
//
// 运动学不在这里：五环销坐标与 shell3d-data.ts 逐位相同，Lab.05 复用 shell3d 解算。
// 本文件只管「哪块网格跟着谁动」：
//   p{{ring}}_{{tri}}  角化件 → shell3d-data 的 tris[tri]，按三销实时标架刚性变换
//   x{{ring}}_{{node}} 配件   → nodes[node]，只平移不转
//   w{{ring}}         单杆轮 → 绕轮心转 θ−θ₀
//   r{{ring}}         驱动杆 → 曲柄销与拱顶两点定位姿
//   frame / tentacle  静件（已烘到世界系，不动）
// 组内顶点坐标：p/r 为板局部 (a, b, w)；x 为相对销的 (du, dv, w)；w/静件为环局部/世界系。
// 世界系同 shell3d：x = station + w，y = u，z = v。

export interface MachineGroup {{
  name: string;
  verts: number;
  tris: number;
  vOff: number;
  iOff: number;
  idx32: boolean;
  /** 仅 sa_soft：双骨蒙皮混合带 [b0, b1]（组局部 x，= 沿链向下的距离） */
  blend?: readonly [number, number];
}}

export interface MachineDrive {{
  ring: string;
  station: number;
  crankR: number;
  /** 图纸姿态（θ₀ = 上死点 = 全开）的拱顶高度；行程下端 = apex0 − 2·crankR。 */
  apex0: number;
}}

/**
 * 大触手（= Lab.03 那条三肌腱触手，椎节间距逐位吻合）在整机世界系里的落位。
 * sim 坐标系：y = 沿臂，(x, z) = 截面。实测滚转 ≈ 0（梢端三绑线柱方位与 TIES
 * 逐一对上），故 sim → 世界 是**绕世界 z 轴 90° + 平移**，无绕臂轴旋转：
 *   world = ( ARM_ORIGIN.x − sy , ARM_ORIGIN.y + sx , ARM_ORIGIN.z + sz )
 * 方向向量同理去掉平移。滚转残差见 ARM_ROLL_DEG（生成期 >6° 直接拒绝出表）。
 */
export interface ArmPlacement {{
  origin: readonly [number, number, number];
  rollDeg: number;
}}
export const ARM_PLACEMENT: ArmPlacement = {arm_json};

/**
 * 小触手（两条，机身两侧镜像）在整机世界系的位姿与链几何——机构由用户 2026-07-30
 * 说明：底座固定、SG90 驱动大节绕圆形轴心甩动、软性中间件连被动小块。
 * o = 轴心世界点；axis = 摆轴（单位向量）；h = 摆平面内的水平方向（θ>0 摆向 +h）。
 * 2D 链在 (h, 世界 z) 平面内解算，L1/LS/L2 = 轴心→上关节 / 软杆 / 下关节→梢端 mm。
 */
export interface SmallArmPlacement {{
  o: readonly [number, number, number];
  axis: readonly [number, number, number];
  h: readonly [number, number, number];
}}
export const SMALLARM_PLACEMENTS: ReadonlyArray<SmallArmPlacement> = {sa_places_json};
export const SMALLARM_SHAPE = {sa_shape_json} as const;

export const MACHINE_MESH_URL = '/mesh/machine-mesh.bin';
export const MACHINE_TRIS = {total_t};
export const MACHINE_DRIVE: ReadonlyArray<MachineDrive> = {json.dumps(drive, ensure_ascii=False)};
export const MACHINE_GROUPS: ReadonlyArray<MachineGroup> = {json.dumps(meta, ensure_ascii=False)};
"""
    )
    OUT_TS.write_text(ts.getvalue(), encoding="utf-8")
    print(f"→ {OUT_TS.relative_to(ROOT)}")
    print(f"→ {OUT_BIN.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
