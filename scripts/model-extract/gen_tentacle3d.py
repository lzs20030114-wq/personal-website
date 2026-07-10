"""触手提取 v3：11.3dm → 完整渲染网格（WebGL 全量导入，用户拍板 2026-07-10）

产物：
- src/lib/linkage/tentacle3d-shape.ts   站位/孔链/半径 + 网格分组元数据
- src/demo/assets/tentacle3d-mesh.bin   逐组索引网格（Float32 顶点 + Uint16/32 索引）
结构：7 方盒椎节（x 46.9→404.7）+ 基座舵机总成（干净文件全量，仅剔除远处遗留块）。
网格：模型嵌入渲染网格全量导入，逐零件 0.05mm 焊接去重，剔除零面积三角。
坐标：站局部系 [沿臂 ax, 腱1 方向 u, 副法向 w]；单位 mm。
用法：python3 scripts/model-extract/gen_tentacle3d.py
"""
import rhino3dm as r
import json, math, struct
import numpy as np

M = r.File3dm.Read('模型求解器参考/11.3dm')
AXIS_Y, AXIS_Z = 0.1, 6.9
SX = [46.9, 119.1, 186.0, 247.9, 304.9, 357.4, 404.7]
HOLE_R = [10.3, 9.3, 8.3, 7.3, 6.5, 5.7, 4.9]
AZ = [30.0, 150.0, 270.0]
BOUNDS = [25.0] + [(SX[i] + SX[i + 1]) / 2 for i in range(len(SX) - 1)] + [430.0]
a1 = math.radians(AZ[0])

def sim(x, y, z, x0):
    return [round(y - AXIS_Y, 2), round(x - x0, 2), round(z - AXIS_Z, 2)]

def local_np(pts, x0):
    """N×3 真机坐标 → 站局部系"""
    ax = pts[:, 0] - x0
    dy = pts[:, 1] - AXIS_Y
    dz = pts[:, 2] - AXIS_Z
    u = dy * math.cos(-a1) - dz * math.sin(-a1)
    w = dy * math.sin(-a1) + dz * math.cos(-a1)
    return np.stack([ax, u, w], axis=1)

IDEFS = {str(M.InstanceDefinitions[i].Id): M.InstanceDefinitions[i]
         for i in range(len(M.InstanceDefinitions))}
BYID = {str(o.Attributes.Id): o for o in M.Objects}

def expand(o):
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

def xform_np(xf, pts):
    if xf is None:
        return pts
    m = np.array([[xf.M00, xf.M01, xf.M02, xf.M03],
                  [xf.M10, xf.M11, xf.M12, xf.M13],
                  [xf.M20, xf.M21, xf.M22, xf.M23]])
    return pts @ m[:, :3].T + m[:, 3]

def part_mesh(brep, xf):
    """一个零件的焊接网格 (verts N×3 真机坐标, tris M×3)"""
    vs = []
    ts = []
    off = 0
    for fi in range(len(brep.Faces)):
        try:
            mesh = brep.Faces[fi].GetMesh(r.MeshType.Any)
        except Exception:
            continue
        if not mesh:
            continue
        V = mesh.Vertices
        pv = np.array([[V[j].X, V[j].Y, V[j].Z] for j in range(len(V))])
        for k in range(mesh.Faces.Count):
            f = mesh.Faces[k]
            if f[2] == f[3]:
                ts.append([off + f[0], off + f[1], off + f[2]])
            else:
                ts.append([off + f[0], off + f[1], off + f[2]])
                ts.append([off + f[0], off + f[2], off + f[3]])
        vs.append(pv)
        off += len(pv)
    if not vs:
        return None
    verts = xform_np(xf, np.vstack(vs))
    tris = np.array(ts, dtype=np.int64)
    # 焊接（0.05mm）+ 去零面积
    key = np.round(verts / 0.05).astype(np.int64)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    verts = verts[first]
    tris = inv[tris]
    a = verts[tris[:, 1]] - verts[tris[:, 0]]
    b = verts[tris[:, 2]] - verts[tris[:, 0]]
    area = 0.5 * np.linalg.norm(np.cross(a, b), axis=1)
    tris = tris[area > 0.02]
    if len(tris) == 0:
        return None
    return verts, tris

def collect_group(xmin, xmax, x0, ylim, zlim):
    gv = []
    gt = []
    off = 0
    nparts = 0
    for o in M.Objects:
        try:
            bb = o.Geometry.GetBoundingBox()
        except Exception:
            continue
        cx = (bb.Min.X + bb.Max.X) / 2
        cy = (bb.Min.Y + bb.Max.Y) / 2
        cz = (bb.Min.Z + bb.Max.Z) / 2
        if not (xmin <= cx < xmax and abs(cy) < ylim and zlim[0] < cz < zlim[1]):
            continue
        for brep, xf in expand(o):
            pm = part_mesh(brep, xf)
            if pm is None:
                continue
            verts, tris = pm
            gv.append(local_np(verts, x0))
            gt.append(tris + off)
            off += len(verts)
            nparts += 1
    if not gv:
        return np.zeros((0, 3)), np.zeros((0, 3), dtype=np.int64), 0
    return np.vstack(gv), np.vstack(gt), nparts

groups = []
for i in range(len(SX)):
    v, t, nparts = collect_group(BOUNDS[i], BOUNDS[i + 1], SX[i], 120.0, (-60.0, 50.0))
    groups.append((f'c{i}', v, t))
    print(f'站 {i} [{BOUNDS[i]:.0f},{BOUNDS[i+1]:.0f}) 零件 {nparts} 顶点 {len(v)} 三角 {len(t)}')
# 基座：干净文件全量（x<25 一侧），仅剔除 x<-300 的遗留块
v, t, npar = collect_group(-300.0, 25.0, SX[0], 500.0, (-500.0, 500.0))
groups.append(('mnt', v, t))
print(f'基座 零件 {npar} 顶点 {len(v)} 三角 {len(t)}')

# —— 二进制布局：逐组 [verts f4×3N | pad4 | idx u2/u4×3M | pad4]
blob = b''
meta = []
for name, v, t in groups:
    idx32 = len(v) > 65535
    v32 = np.round(v, 3).astype('<f4')
    idx = t.astype('<u4' if idx32 else '<u2')
    v_off = len(blob)
    blob += v32.tobytes()
    while len(blob) % 4:
        blob += b'\0'
    i_off = len(blob)
    blob += idx.tobytes()
    while len(blob) % 4:
        blob += b'\0'
    meta.append({'name': name, 'verts': int(len(v)), 'tris': int(len(t)),
                 'vOff': v_off, 'iOff': i_off, 'idx32': bool(idx32)})
open('src/demo/assets/tentacle3d-mesh.bin', 'wb').write(blob)
total_t = sum(m['tris'] for m in meta)
print(f'mesh.bin {len(blob)} 字节，总三角 {total_t}')

stations = [sim(x, AXIS_Y, AXIS_Z, SX[0]) for x in SX]
chains = []
for az in AZ:
    a = math.radians(az)
    chains.append([sim(x, AXIS_Y + rr * math.cos(a), AXIS_Z + rr * math.sin(a), SX[0])
                   for x, rr in zip(SX, HOLE_R)])

ts = f"""// 由 scripts/model-extract/gen_tentacle3d.py 生成——不要手改。
// 数据源：模型求解器参考/11.3dm（干净版触手本体，用户提供 2026-07-10）。
// 结构：基座舵机总成（全量）+ 7 方盒椎节 + 节间盘轴联接 + 梢端盖。
// 网格：嵌入渲染网格全量导入（{total_t} 三角，0.05mm 焊接）——WebGL 直接吃，
// 细节不再做凸包减量（用户拍板「直接导入」）。载荷在 tentacle3d-mesh.bin。

export const STATIONS: ReadonlyArray<readonly [number, number, number]> = {json.dumps(stations)} as const;

export const CHAINS: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = {json.dumps(chains)} as const;

export const RADII: ReadonlyArray<number> = {json.dumps(HOLE_R)} as const;

/** mesh.bin 分组布局（c0..c6 = 站元胞局部系，mnt = 基座挂站 0 刚架） */
export interface MeshGroup {{
  name: string;
  verts: number;
  tris: number;
  vOff: number;
  iOff: number;
  idx32: boolean;
}}

export const MESH_GROUPS: ReadonlyArray<MeshGroup> = {json.dumps(meta)} as const;
"""
open('src/lib/linkage/tentacle3d-shape.ts', 'w').write(ts)
print('生成 tentacle3d-shape.ts', len(ts), '字节')
