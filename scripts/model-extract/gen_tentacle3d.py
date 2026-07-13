"""触手提取 v4：11.3dm → 完整渲染网格 + TPU 连接件蒙皮分组（榫卯插接修正）

产物：
- src/lib/linkage/tentacle3d-shape.ts   站位/孔链/半径 + 网格分组元数据（含 blend）
- src/demo/assets/tentacle3d-mesh.bin   逐组索引网格（Float32 顶点 + Uint16/32 索引）
结构：7 方盒椎节（x 46.9→404.7）+ 根部/节间 TPU 盘轴联接（jr/j0..j5）+
基座舵机总成。
v4（用户纠偏 2026-07-11）：连接件与两侧方盒是**榫卯插接**——刚性方盒 + TPU 软
连接件，弯曲全部发生在连接件裸露段，插接不分离。故跨越节间边界的零件按**零件级
x 范围**判定为连接件、单独成组（j 组），blend = 两侧方盒端面之间的裸露带；渲染层
对 j 组做双骨蒙皮（插接段权重恒 0/1 = 随盒刚动，裸露段平滑过渡）。
v3 的按质心整箱分桶会把连接件塞进单侧盒里，弯曲时从对侧插槽拔出（用户否决）。
坐标：站局部系 [沿臂 ax, 腱1 方向 u, 副法向 w]；单位 mm。
环境：CPython 3.13 + scripts/model-extract/requirements.txt（版本锁定，避免重生成漂移）
用法：python3 -m pip install -r scripts/model-extract/requirements.txt
      python3 scripts/model-extract/gen_tentacle3d.py
"""
import rhino3dm as r
import json, math
import numpy as np

M = r.File3dm.Read('模型求解器参考/11.3dm')
AXIS_Y, AXIS_Z = 0.1, 6.9
SX = [46.9, 119.1, 186.0, 247.9, 304.9, 357.4, 404.7]
HOLE_R = [10.3, 9.3, 8.3, 7.3, 6.5, 5.7, 4.9]
AZ = [30.0, 150.0, 270.0]
BOUNDS = [25.0] + [(SX[i] + SX[i + 1]) / 2 for i in range(len(SX) - 1)] + [430.0]
GAP_M = BOUNDS[1:-1]          # 6 个内部边界（节间缝隙中点）
MARGIN = 1.5                  # 零件越界超过此量（两侧都超）→ 判为连接件
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

class Acc:
    """一个网格组的累加器（局部系顶点 + 全局索引偏移 + 真机 x 范围）"""
    def __init__(self):
        self.v = []
        self.t = []
        self.off = 0
        self.n = 0
        self.x0 = 1e9
        self.x1 = -1e9
        self.ball_r = 0.0   # 轴上零件（中央球体导件）的最大径向半径
    def add(self, verts_local, tris, xmin, xmax, on_axis_r=None):
        self.v.append(verts_local)
        self.t.append(tris + self.off)
        self.off += len(verts_local)
        self.n += 1
        self.x0 = min(self.x0, xmin)
        self.x1 = max(self.x1, xmax)
        if on_axis_r is not None:
            self.ball_r = max(self.ball_r, on_axis_r)
    def packed(self):
        if not self.v:
            return np.zeros((0, 3)), np.zeros((0, 3), dtype=np.int64)
        return np.vstack(self.v), np.vstack(self.t)

# —— 触手区单遍收集（零件级分类）
cells = [Acc() for _ in SX]
joints = [Acc() for _ in GAP_M]
tie_posts = []  # 梢节绑线柱：(方位角°, sim坐标质心)
for o in M.Objects:
    try:
        bb = o.Geometry.GetBoundingBox()
    except Exception:
        continue
    ocx = (bb.Min.X + bb.Max.X) / 2
    if not (BOUNDS[0] <= ocx < BOUNDS[-1]):
        continue  # 基座区另收
    for brep, xf in expand(o):
        pm = part_mesh(brep, xf)
        if pm is None:
            continue
        verts, tris = pm
        vmin = verts.min(0)
        vmax = verts.max(0)
        pcy = (vmin[1] + vmax[1]) / 2
        pcz = (vmin[2] + vmax[2]) / 2
        if not (abs(pcy) < 120.0 and -60.0 < pcz < 50.0):
            continue
        g = next((k for k, mx in enumerate(GAP_M)
                  if vmin[0] < mx - MARGIN and vmax[0] > mx + MARGIN), None)
        if g is not None:
            joints[g].add(local_np(verts, SX[g]), tris, vmin[0], vmax[0])
        else:
            pcx = (vmin[0] + vmax[0]) / 2
            i = max(0, min(len(SX) - 1, int(np.searchsorted(BOUNDS, pcx, side='right')) - 1))
            # 中央球体导件（肌腱绕行其背面）：质心贴轴 + x 中心贴站心
            # （排除同样贴轴对称、但位于节两端的端板与轴销）
            pcy2 = (vmin[1] + vmax[1]) / 2 - AXIS_Y
            pcz2 = (vmin[2] + vmax[2]) / 2 - AXIS_Z
            on_axis_r = None
            if math.hypot(pcy2, pcz2) < 4.0 and abs(pcx - SX[i]) < 8.0:
                rr = np.hypot(verts[:, 1] - AXIS_Y, verts[:, 2] - AXIS_Z)
                on_axis_r = float(rr.max())
            # 梢节绑线柱（肌腱终点，用户圈定 2026-07-11）：梢节内三根短柱，
            # 偏轴 ≈6mm、x 跨度 ~7.5mm、方位 ≈ 腱孔族——肌腱不穿梢节中间，
            # 分别绑在各自柱上
            if i == len(SX) - 1 and 4.0 < (vmax[0] - vmin[0]) < 12.0 and 3.0 < math.hypot(pcy2, pcz2) < 9.0:
                tie_posts.append((math.degrees(math.atan2(pcz2, pcy2)) % 360.0,
                                  [round(pcy2, 2), round(pcx - SX[0], 2), round(pcz2, 2)]))
            cells[i].add(local_np(verts, SX[i]), tris, vmin[0], vmax[0], on_axis_r)

# —— 基座收集（先于组装配——导线盘要并入节 0）。
# 导线盘 = **节 0 的近端板**（节 0 杆件插在盘上；用户实测「碎了」根因：盘被
# 错钉在基座静止渲染）——归 c0 随节 0 刚动；其三个腱孔（网格顶点环实测）=
# 缆线进入本体的过孔。缆线固定端 = 基座舵机锚（三件，方位恰 = 腱孔族）。
# 根部长条连接件与后续节间连接件同材质、同弯曲方式，单独成组 jr 蒙皮；
# 它的近端插入蓝圈基座，远端插入节 0，绝不能并入固定 mnt。
mnt = Acc()
root_joint = Acc()
root_disc_ax = None
disc_x0 = None
disc_x1 = None
disc_hole_r = None
servos_raw = []
for o in M.Objects:
    try:
        bb = o.Geometry.GetBoundingBox()
    except Exception:
        continue
    ocx = (bb.Min.X + bb.Max.X) / 2
    if not (-300.0 <= ocx < BOUNDS[0]):
        continue
    for brep, xf in expand(o):
        pm = part_mesh(brep, xf)
        if pm is None:
            continue
        verts, tris = pm
        vmin = verts.min(0)
        vmax = verts.max(0)
        pcx = (vmin[0] + vmax[0]) / 2
        pcy2 = (vmin[1] + vmax[1]) / 2 - AXIS_Y
        pcz2 = (vmin[2] + vmax[2]) / 2 - AXIS_Z
        rr = np.hypot(verts[:, 1] - AXIS_Y, verts[:, 2] - AXIS_Z)
        # 根部长条：跨过蓝圈基座端面（x≈−3）并插入节 0 近端板（x≈19.6）。
        # 旧版把它整件并入 mnt，导致视觉上永远笔直固定。
        if vmin[0] < 0.0 and vmax[0] > 18.0 and math.hypot(pcy2, pcz2) < 3.0 and rr.max() < 7.0:
            root_joint.add(local_np(verts, SX[0]), tris, vmin[0], vmax[0])
            continue
        if 15.0 < pcx < 30.0 and math.hypot(pcy2, pcz2) < 4.0 and 17.0 < rr.max() < 23.0:
            root_disc_ax = round(pcx - SX[0], 2)
            disc_x0 = float(vmin[0])
            disc_x1 = float(vmax[0])
            azs = np.degrees(np.arctan2(verts[:, 2] - AXIS_Z, verts[:, 1] - AXIS_Y)) % 360
            radii = []
            for target in (90.0, 210.0, 330.0):
                d = np.minimum(np.abs(azs - target), 360 - np.abs(azs - target))
                sel = (d < 30) & (rr > 6) & (rr < 17)
                if sel.sum() >= 8:
                    radii.append(float(rr[sel].mean()))
            disc_hole_r = round(float(np.mean(radii)), 2) if radii else None
            # 三角腱孔板 = **节 0 的一体件**（用户十轮定版：红圈三角板随
            # 节 0 运动；固定的只有细轴/毂（蓝圈）+ 基座本体）→ 归 c0
            cells[0].add(local_np(verts, SX[0]), tris, vmin[0], vmax[0])
            continue
        # 位于三角板内部的轴端/套筒属于节 0 的刚性插接端，随红圈整体运动。
        if 15.0 < pcx < 30.0 and math.hypot(pcy2, pcz2) < 4.0 and rr.max() < 8.0:
            cells[0].add(local_np(verts, SX[0]), tris, vmin[0], vmax[0])
            continue
        if -8.0 <= pcx <= 1.0 and (vmax[0] - vmin[0]) < 8.0 and 8.0 < math.hypot(pcy2, pcz2) < 18.0:
            az = math.degrees(math.atan2(pcz2, pcy2)) % 360
            servos_raw.append((az, [round(pcy2, 2), round(pcx - SX[0], 2), round(pcz2, 2)]))
            mnt.add(local_np(verts, SX[0]), tris, vmin[0], vmax[0])
            continue
        mnt.add(local_np(verts, SX[0]), tris, vmin[0], vmax[0])
servos = []
for az_t in (90.0, 210.0, 330.0):
    best = min(servos_raw, key=lambda t: min(abs(t[0] - az_t), 360 - abs(t[0] - az_t)))
    servos.append(best[1])
print('导线盘（节0近端板）沿臂', root_disc_ax, '腱孔半径', disc_hole_r)
print('舵机锚（腱序）', servos)

groups = []
for i, acc in enumerate(cells):
    v, t = acc.packed()
    # 节 0 同样是**纯刚体**（用户否决根蒙皮：刚性材质不能弯——它作为
    # 刚体整体绕盘旋转，柔性只在关节本身，界面开合是真实铰链行为）
    groups.append((f'c{i}', v, t, None))
    print(f'站 {i} 零件 {acc.n} 顶点 {len(v)} 三角 {len(t)} x[{acc.x0:.1f},{acc.x1:.1f}]')
for g, acc in enumerate(joints):
    v, t = acc.packed()
    if acc.n == 0:
        print(f'缝 {g} 无连接件零件——跳过（检查 MARGIN/模型）')
        continue
    # 蒙皮混合带 = 两侧方盒端面之间的裸露段（真机坐标 → 站 g 局部 ax）
    b0m, b1m = cells[g].x1, cells[g + 1].x0
    if b1m - b0m < 2.0:  # 端面几乎贴合：兜底给 ±3mm 混合带
        mid = (b0m + b1m) / 2
        b0m, b1m = mid - 3.0, mid + 3.0
    blend = [round(b0m - SX[g], 2), round(b1m - SX[g], 2)]
    groups.append((f'j{g}', v, t, blend))
    print(f'缝 {g} 连接件 {acc.n} 顶点 {len(v)} 三角 {len(t)} '
          f'x[{acc.x0:.1f},{acc.x1:.1f}] 裸露带 x[{b0m:.1f},{b1m:.1f}] blend {blend}')

# 根部长条的 A 骨原点 = 蓝圈固定截面（舵机锚平均轴位），B 骨原点 = 节 0
# 站心；与 j0..j5 一样使用真实两端截面 + 真实节距。旧版仍把 jr 顶点存在
# 节 0 局部系、渲染时 dy=0，端点虽能数学对齐，中段螺旋却绕了错误的共同原点，
# 视觉上会读作蓝件与绿色节 0 分离。两端插接区保持刚性，中间连续弯曲。
v, t = root_joint.packed()
if root_joint.n == 0:
    raise RuntimeError('未识别到根部长条连接件 jr——检查根部零件阈值')
base_face = SX[0] + float(np.mean([s[1] for s in servos]))
cell0_face = cells[0].x0
# root_joint 此时仍在站 0 局部系；平移到蓝端 A 骨局部系。
root_ax0 = base_face - SX[0]
v[:, 0] -= root_ax0
root_blend = [0.0, round(cell0_face - base_face, 2)]
groups.append(('jr', v, t, root_blend))
print(f'根部连接件 {root_joint.n} 顶点 {len(v)} 三角 {len(t)} '
      f'x[{root_joint.x0:.1f},{root_joint.x1:.1f}] 裸露带 x[{base_face:.1f},{cell0_face:.1f}] '
      f'blend {root_blend}')

v, t = mnt.packed()
groups.append(('mnt', v, t, None))
print(f'基座 零件 {mnt.n} 顶点 {len(v)} 三角 {len(t)}')

# —— 二进制布局：逐组 [verts f4×3N | pad4 | idx u2/u4×3M | pad4]
blob = b''
meta = []
for name, v, t, blend in groups:
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
    m = {'name': name, 'verts': int(len(v)), 'tris': int(len(t)),
         'vOff': v_off, 'iOff': i_off, 'idx32': bool(idx32)}
    if blend is not None:
        m['blend'] = blend
    meta.append(m)
open('src/demo/assets/tentacle3d-mesh.bin', 'wb').write(blob)
total_t = sum(m['tris'] for m in meta)
print(f'mesh.bin {len(blob)} 字节，总三角 {total_t}')

stations = [sim(x, AXIS_Y, AXIS_Z, SX[0]) for x in SX]
# 端板沿臂位置（站局部 ax）：肌腱 v3 真实走线用——腱孔在两端板上，
# 缆线节内绕过中央球体背面、节间贴端板孔跨缝（用户剖面图 2026-07-11）
plates = [[round(acc.x0 - SX[i], 2), round(acc.x1 - SX[i], 2)] for i, acc in enumerate(cells)]
balls = [round(acc.ball_r, 2) for acc in cells]
# 梢节短、球体未建成曲面（检出 0）→ 按锥度几何外推
for i in range(len(balls)):
    if balls[i] <= 0 and i >= 2:
        balls[i] = round(balls[i - 1] * balls[i - 1] / balls[i - 2], 2)
print('中央球体半径', balls)
# 绑线柱按腱孔方位（90/210/330）排序对齐腱序号
TIE_AZ = [90.0, 210.0, 330.0]
ties = []
for az in TIE_AZ:
    best = min(tie_posts, key=lambda t: min(abs(t[0] - az), 360 - abs(t[0] - az)))
    ties.append(best[1])
print('绑线柱（腱序）', ties, '方位实测', [round(t[0], 1) for t in tie_posts])
chains = []
for az in AZ:
    a = math.radians(az)
    chains.append([sim(x, AXIS_Y + rr * math.cos(a), AXIS_Z + rr * math.sin(a), SX[0])
                   for x, rr in zip(SX, HOLE_R)])

ts = f"""// 由 scripts/model-extract/gen_tentacle3d.py 生成——不要手改。
// 数据源：模型求解器参考/11.3dm（干净版触手本体，用户提供 2026-07-10）。
// 结构：基座舵机总成（固定）+ 根部 TPU 长连接件（jr）+ 7 方盒椎节 +
// 节间 TPU 盘轴联接（j0..j5）+ 梢端盖。
// 网格：嵌入渲染网格全量导入（{total_t} 三角，0.05mm 焊接）——WebGL 直接吃。
// v4：连接件与方盒榫卯插接（刚盒 + TPU 软连接件）——j 组做双骨蒙皮，
// blend = 裸露带（站 g 局部 ax），插接段随盒刚动。载荷在 tentacle3d-mesh.bin。

export const STATIONS: ReadonlyArray<readonly [number, number, number]> = {json.dumps(stations)} as const;

export const CHAINS: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = {json.dumps(chains)} as const;

export const RADII: ReadonlyArray<number> = {json.dumps(HOLE_R)} as const;

/** 每节两端板的沿臂位置（站局部 ax，[近端, 远端]）——肌腱 v3 真实走线的腱孔所在 */
export const PLATES: ReadonlyArray<readonly [number, number]> = {json.dumps(plates)} as const;

/** 每节中央球体导件的径向半径（轴上零件实测顶点最大径）——肌腱绕行其背面。
 *  梢节（末位）无球体：肌腱终点绑在 TIES 柱上，不穿梢节中间。 */
export const BALLS: ReadonlyArray<number> = {json.dumps(balls)} as const;

/** 梢节绑线柱质心（sim 坐标，腱序 0/1/2 = 方位 90°/210°/330°）——肌腱终点锚 */
export const TIES: ReadonlyArray<readonly [number, number, number]> = {json.dumps(ties)} as const;

/** 导线盘沿臂位置（站 0 局部 ax）。盘 = **节 0 的近端板**（随节 0 刚动，
 *  节 0 杆件插在盘上）；缆线穿其三个腱孔进入本体（用户纠偏 2026-07-11） */
export const ROOT_DISC_AX = {json.dumps(root_disc_ax)};

/** 导线盘腱孔孔心半径（网格顶点环实测，三孔均值；方位 = 腱孔族） */
export const DISC_HOLE_R = {json.dumps(disc_hole_r)};

/** 基座舵机锚质心（sim 坐标，腱序）——缆线的固定端/抽线点（真正的不动锚） */
export const SERVOS: ReadonlyArray<readonly [number, number, number]> = {json.dumps(servos)} as const;

/** mesh.bin 分组布局：c0..c6 = 站元胞局部系（刚性）；jr/j0..j5 = 根部/节间
 *  TPU 连接件（blend = [b0,b1] 裸露带，双骨蒙皮）；mnt = 固定基座。 */
export interface MeshGroup {{
  name: string;
  verts: number;
  tris: number;
  vOff: number;
  iOff: number;
  idx32: boolean;
  blend?: readonly [number, number];
}}

export const MESH_GROUPS: ReadonlyArray<MeshGroup> = {json.dumps(meta)} as const;
"""
open('src/lib/linkage/tentacle3d-shape.ts', 'w', encoding='utf-8', newline='\n').write(ts)
print('生成 tentacle3d-shape.ts', len(ts), '字节')
