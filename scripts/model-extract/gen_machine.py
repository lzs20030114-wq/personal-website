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

STATIC_LAYERS = ["滑轨架", "骨架", "中间轴", "中间轴驱动"]
BLOCK_LAYERS = ["大触手", "小触手"]


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
            return np.c_[v[:, 0] - X0, v[:, 2] - Z0, v[:, 1] - plane]

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
        u = v[:, 0] - X0
        vv = v[:, 2] - Z0
        w = v[:, 1] - PLANE0  # 相对 S1 环面
        return np.c_[STATION[0] + w, u, vv]

    static_parts = []
    for lay in STATIC_LAYERS:
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
    if st is not None:
        groups.append(("frame", st[0], st[1], None))

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
    tt = merge(tent_parts)
    if tt is not None:
        raw_t = len(tt[1])
        global WELD
        keep = WELD
        WELD = TENTACLE_WELD
        tt = weld(tt[0], tt[1])
        WELD = keep
        print(f"  触手降面 {raw_t:,} → {len(tt[1]):,} 三角（静态摆件，{TENTACLE_WELD}mm 顶点聚类）")
        groups.append(("tentacle", tt[0], tt[1], None))

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
        meta.append(
            {
                "name": name,
                "verts": int(len(v)),
                "tris": int(len(t)),
                "vOff": v_off,
                "iOff": i_off,
                "idx32": bool(idx32),
            }
        )
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
}}

export interface MachineDrive {{
  ring: string;
  station: number;
  crankR: number;
  /** 图纸姿态（θ₀ = 上死点 = 全开）的拱顶高度；行程下端 = apex0 − 2·crankR。 */
  apex0: number;
}}

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
