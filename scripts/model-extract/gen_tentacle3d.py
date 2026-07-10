"""触手迭代版提取：11.3dm（干净版，用户提供 2026-07-10）→ src/lib/linkage/tentacle3d-shape.ts

结构：基座舵机总成（x −115..25）+ 7 方盒椎节（x 46.9/119.1/186/247.9/304.9/357.4/404.7，
节距 72→47 收锥）+ 节间盘轴联接 + 梢端盖（→417）。
肌腱孔方位 30°/150°/270°、半径 10.3→4.9 收锥（站 1–5 实测于 求解器结构演示.3dm，
站 0 与站 6 按收锥外推——孔曲线未建模）；链轴心 (y,z)=(0.1,6.9)。
坐标映射：真机臂轴 X → 模拟 +y；真机 (Y,Z) → 模拟 (x,z)；站 0 心为原点。
用法：python3 scripts/model-extract/gen_tentacle3d.py
"""
import rhino3dm as r
import json, math
import numpy as np
from scipy.spatial import ConvexHull

M = r.File3dm.Read('模型求解器参考/11.3dm')
AXIS_Y, AXIS_Z = 0.1, 6.9
SX = [46.9, 119.1, 186.0, 247.9, 304.9, 357.4, 404.7]
HOLE_R = [10.3, 9.3, 8.3, 7.3, 6.5, 5.7, 4.9]
AZ = [30.0, 150.0, 270.0]
BOUNDS = [25.0] + [(SX[i] + SX[i + 1]) / 2 for i in range(len(SX) - 1)] + [430.0]
MOUNT_X = (-115.0, 25.0)
YLIM = 120.0
ZLIM = (-60.0, 50.0)

IDEFS = {str(M.InstanceDefinitions[i].Id): M.InstanceDefinitions[i]
         for i in range(len(M.InstanceDefinitions))}
BYID = {str(o.Attributes.Id): o for o in M.Objects}

a1 = math.radians(AZ[0])

def sim(x, y, z, x0):
    return [round(y - AXIS_Y, 2), round(x - x0, 2), round(z - AXIS_Z, 2)]

def local(x, y, z, x0):
    """站局部系 [沿臂 ax, 腱1 方向 u, 副法向 w]（与运行时刚架约定一致）"""
    ax = x - x0
    dy = y - AXIS_Y
    dz = z - AXIS_Z
    u = dy * math.cos(-a1) - dz * math.sin(-a1)
    w = dy * math.sin(-a1) + dz * math.cos(-a1)
    return [round(ax, 2), round(u, 2), round(w, 2)]

def xpt(xf, x, y, z):
    if xf is None:
        return (x, y, z)
    return (xf.M00 * x + xf.M01 * y + xf.M02 * z + xf.M03,
            xf.M10 * x + xf.M11 * y + xf.M12 * z + xf.M13,
            xf.M20 * x + xf.M21 * y + xf.M22 * z + xf.M23)

def expand(o):
    """对象 → [(brep, xform|None)]，块实例展开一层"""
    g = o.Geometry
    tn = type(g).__name__
    if tn in ('Brep', 'Extrusion'):
        b = g.ToBrep(True) if tn == 'Extrusion' else g
        return [(b, None)] if b else []
    if tn == 'InstanceReference':
        idef = IDEFS.get(str(g.ParentIdefId))
        if not idef:
            return []
        out = []
        for oid in idef.GetObjectIds():
            io = BYID.get(str(oid))
            if not io:
                continue
            ig = io.Geometry
            itn = type(ig).__name__
            if itn in ('Brep', 'Extrusion'):
                b = ig.ToBrep(True) if itn == 'Extrusion' else ig
                if b:
                    out.append((b, g.Xform))
        return out
    return []

def region_objects(xmin, xmax):
    for o in M.Objects:
        try:
            bb = o.Geometry.GetBoundingBox()
        except Exception:
            continue
        cx = (bb.Min.X + bb.Max.X) / 2
        cy = (bb.Min.Y + bb.Max.Y) / 2
        cz = (bb.Min.Z + bb.Max.Z) / 2
        if xmin <= cx < xmax and abs(cy) < YLIM and ZLIM[0] < cz < ZLIM[1]:
            yield o

def sample_edges(xmin, xmax, x0, cap, min_len=2.0):
    budget = []
    for o in region_objects(xmin, xmax):
        for brep, xf in expand(o):
            edges = brep.Edges
            for i in range(len(edges)):
                e = edges[i]
                try:
                    dom = e.Domain
                    probe = [e.PointAt(dom.T0 + (dom.T1 - dom.T0) * t / 4) for t in range(5)]
                    L = sum(math.dist((probe[j].X, probe[j].Y, probe[j].Z),
                                      (probe[j + 1].X, probe[j + 1].Y, probe[j + 1].Z)) for j in range(4))
                    if L < min_len:
                        continue
                    n = max(2, min(6, int(L / 6)))
                    pts = []
                    for t in range(n + 1):
                        p = e.PointAt(dom.T0 + (dom.T1 - dom.T0) * t / n)
                        pts.append(local(*xpt(xf, p.X, p.Y, p.Z), x0))
                    budget.append((L, pts))
                except Exception:
                    pass
    budget.sort(key=lambda lp: -lp[0])
    polys = []
    total = 0
    for L, pts in budget:
        if total + len(pts) > cap:
            continue
        polys.append(pts)
        total += len(pts)
    return polys, total

GRID = 1.0  # 凸包前顶点量化（mm）：细圆柱棱数锐减，形体误差 ≤0.5mm

def sample_parts(xmin, xmax, x0):
    """逐零件凸包（不透明哑光渲染的形体单元）：{v: 局部系顶点, t: 外向定向三角}"""
    parts = []
    for o in region_objects(xmin, xmax):
        for brep, xf in expand(o):
            pts = []
            for fi in range(len(brep.Faces)):
                try:
                    mesh = brep.Faces[fi].GetMesh(r.MeshType.Any)
                except Exception:
                    continue
                if not mesh:
                    continue
                V = mesh.Vertices
                for j in range(len(V)):
                    pts.append(xpt(xf, V[j].X, V[j].Y, V[j].Z))
            if len(pts) < 4:
                continue
            arr = np.unique(np.round(np.array(pts) / GRID) * GRID, axis=0)
            if len(arr) < 4:
                continue
            # 长零件切段（>30mm 沿主轴切 25mm 片，含 1mm 搭接）——单一深度的
            # 画家排序对互穿长件必错（用户实测），切段后深度跨度紧凑
            ext = arr.max(axis=0) - arr.min(axis=0)
            axis = int(np.argmax(ext))
            if ext[axis] > 30.0:
                nseg = int(math.ceil(ext[axis] / 25.0))
                lo = arr[:, axis].min()
                step = ext[axis] / nseg
                chunks = []
                for si in range(nseg):
                    m0 = lo + si * step - 1.0
                    m1 = lo + (si + 1) * step + 1.0
                    sub = arr[(arr[:, axis] >= m0) & (arr[:, axis] <= m1)]
                    # 切面补点：把跨越切面的贡献用边界平面上的极值近似（用包围盒角点）
                    if len(sub) >= 4:
                        chunks.append(sub)
                arrs = chunks if chunks else [arr]
            else:
                arrs = [arr]
            for sub in arrs:
                try:
                    h = ConvexHull(sub)
                except Exception:
                    try:
                        h = ConvexHull(sub, qhull_options='QJ')  # 退化输入（共面板件）兜底
                    except Exception:
                        continue
                vids = list(h.vertices)
                remap = {v: i for i, v in enumerate(vids)}
                verts = [local(*sub[v], x0) for v in vids]
                tris = []
                for si, simp in enumerate(h.simplices):
                    a, b, c = (sub[simp[0]], sub[simp[1]], sub[simp[2]])
                    n_geom = np.cross(b - a, c - a)
                    if np.dot(n_geom, h.equations[si][:3]) < 0:
                        simp = [simp[0], simp[2], simp[1]]  # 统一外向定向
                    tris.append([remap[simp[0]], remap[simp[1]], remap[simp[2]]])
                parts.append({'v': verts, 't': tris})
    return parts

tri_cells = []
for i in range(len(SX)):
    parts = sample_parts(BOUNDS[i], BOUNDS[i + 1], SX[i])
    tri_cells.append(parts)
    nt = sum(len(p['t']) for p in parts)
    print(f'站 {i} 元胞 [{BOUNDS[i]:.0f},{BOUNDS[i+1]:.0f}) 零件 {len(parts)} 三角 {nt}')
mount_parts = sample_parts(MOUNT_X[0], MOUNT_X[1], SX[0])
print(f'基座 零件 {len(mount_parts)} 三角 {sum(len(p["t"]) for p in mount_parts)}')

stations = [sim(x, AXIS_Y, AXIS_Z, SX[0]) for x in SX]
chains = []
for az in AZ:
    a = math.radians(az)
    chains.append([sim(x, AXIS_Y + rr * math.cos(a), AXIS_Z + rr * math.sin(a), SX[0])
                   for x, rr in zip(SX, HOLE_R)])

def fmt_parts(parts):
    out = []
    for p in parts:
        v = ','.join(f'[{q[0]},{q[1]},{q[2]}]' for q in p['v'])
        t = ','.join(f'[{a},{b},{c}]' for a, b, c in p['t'])
        out.append('  {v:[' + v + '],t:[' + t + ']}')
    return '[\n' + ',\n'.join(out) + '\n]'

ts = f"""// 由 scripts/model-extract/gen_tentacle3d.py 生成——不要手改。
// 数据源：模型求解器参考/11.3dm（干净版触手本体，用户提供 2026-07-10）。
// 结构：基座舵机总成 + 7 方盒椎节（节距 72→47 收锥，孔半径 10.3→4.9，
// 三腱方位 30°/150°/270°；站 0/6 孔按收锥外推）+ 节间盘轴联接 + 梢端盖。
// 渲染单元 = 逐零件凸包（顶点量化 {GRID}mm，三角外向定向）——不透明哑光着色。
// 单位 mm；站 0 心为原点。

export const STATIONS: ReadonlyArray<readonly [number, number, number]> = {json.dumps(stations)} as const;

export const CHAINS: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = {json.dumps(chains)} as const;

export const RADII: ReadonlyArray<number> = {json.dumps(HOLE_R)} as const;

export interface HullPart {{
  /** 局部系顶点 [沿臂 ax, 腱1 方向 u, 副法向 w] */
  v: ReadonlyArray<readonly [number, number, number]>;
  /** 外向定向三角（顶点下标） */
  t: ReadonlyArray<readonly [number, number, number]>;
}}

export const CELL_PARTS: ReadonlyArray<ReadonlyArray<HullPart>> = [
{','.join(fmt_parts(c) for c in tri_cells)}
] as const;

export const MOUNT_PARTS: ReadonlyArray<HullPart> = {fmt_parts(mount_parts)} as const;
"""
open('src/lib/linkage/tentacle3d-shape.ts', 'w').write(ts)
print('生成 tentacle3d-shape.ts', len(ts), '字节')
