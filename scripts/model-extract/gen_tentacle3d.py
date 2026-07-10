"""触手 v2（迭代版）提取：求解器结构演示.3dm → tentacle3d-shape.ts
结构：基座（舵机总成，x −90..102）+ 5 方盒椎节（x 119/186/248/305/357，
孔方位 30/150/270°、半径 9.3→5.7 收锥）+ 节间盘轴联接 + 梢端盖（→417）。
坐标映射：真机臂轴 X → 模拟 +y；真机 (Y,Z) → 模拟 (x,z)；站 0 心为原点。
用法：python3 scripts/model-extract/gen_tentacle3d.py
"""
import rhino3dm as r
import json, math

M = r.File3dm.Read('模型求解器参考/求解器结构演示.3dm')
AXIS_Y, AXIS_Z = 0.1, 6.9           # 链轴心 (y,z)
SX = [119.1, 186.0, 247.9, 304.9, 357.4]  # 椎节站位 x
HOLE_R = [9.3, 8.3, 7.3, 6.5, 5.7]
AZ = [30.0, 150.0, 270.0]            # 肌腱方位（度）
# 站元胞边界（中点切分；S0 向基座侧到 102，S4 含梢端盖到 418）
BOUNDS = [102.0] + [(SX[i]+SX[i+1])/2 for i in range(4)] + [418.0]
MOUNT = (-95.0, 102.0)

def sim(x, y, z, x0):
    return [round(y-AXIS_Y, 2), round(x-x0, 2), round(z-AXIS_Z, 2)]

a1 = math.radians(AZ[0])
def local(x, y, z, x0):
    """站局部系：[沿臂 ax, 腱1 方向 u, 副法向 w]（与运行时刚架约定一致）"""
    ax = x - x0
    dy = y - AXIS_Y; dz = z - AXIS_Z
    u = dy*math.cos(-a1) - dz*math.sin(-a1)
    w = dy*math.sin(-a1) + dz*math.cos(-a1)
    return [round(ax,2), round(u,2), round(w,2)]

def sample_cell(xmin, xmax, x0, cap, min_len=2.0):
    polys = []
    budget = []
    for o in M.Objects:
        g = o.Geometry
        if type(g).__name__ not in ('Brep', 'Extrusion'): continue
        try: bb = g.GetBoundingBox()
        except Exception: continue
        cx=(bb.Min.X+bb.Max.X)/2; cy=(bb.Min.Y+bb.Max.Y)/2; cz=(bb.Min.Z+bb.Max.Z)/2
        if not (xmin <= cx < xmax and abs(cy) < 130 and -130 < cz < 130): continue
        brep = g.ToBrep(True) if type(g).__name__ == 'Extrusion' else g
        if brep is None: continue
        edges = brep.Edges
        for i in range(len(edges)):
            e = edges[i]
            try:
                dom = e.Domain
                probe = [e.PointAt(dom.T0 + (dom.T1-dom.T0)*t/4) for t in range(5)]
                L = sum(math.dist((probe[j].X,probe[j].Y,probe[j].Z),(probe[j+1].X,probe[j+1].Y,probe[j+1].Z)) for j in range(4))
                if L < min_len: continue
                n = max(2, min(6, int(L/6)))
                pts = []
                for t in range(n+1):
                    p = e.PointAt(dom.T0 + (dom.T1-dom.T0)*t/n)
                    pts.append(local(p.X, p.Y, p.Z, x0))
                budget.append((L, pts))
            except Exception:
                pass
    budget.sort(key=lambda lp: -lp[0])  # 长边优先，预算内截断
    total = 0
    for L, pts in budget:
        if total + len(pts) > cap: continue
        polys.append(pts); total += len(pts)
    return polys, total

cells = []
for i in range(5):
    polys, n = sample_cell(BOUNDS[i], BOUNDS[i+1], SX[i], 520)
    cells.append(polys)
    print(f'站 {i} 元胞 [{BOUNDS[i]:.0f},{BOUNDS[i+1]:.0f}) 边 {len(polys)} 点 {n}')
mount_polys, n = sample_cell(MOUNT[0], MOUNT[1], SX[0], 520, min_len=8.0)
print(f'基座 边 {len(mount_polys)} 点 {n}')

stations = [sim(x, AXIS_Y, AXIS_Z, SX[0]) for x in SX]
chains = []
for az in AZ:
    a = math.radians(az)
    chains.append([sim(x, AXIS_Y + rr*math.cos(a), AXIS_Z + rr*math.sin(a), SX[0])
                   for x, rr in zip(SX, HOLE_R)])

def fmt(polys):
    return '[\n' + ',\n'.join('  [' + ','.join(f'[{p[0]},{p[1]},{p[2]}]' for p in poly) + ']' for poly in polys) + '\n]'

ts = f"""// 由 scripts/model-extract/gen_tentacle3d.py 生成——不要手改。
// 数据源：模型求解器参考/求解器结构演示.3dm（迭代版触手本体，用户指定 2026-07-10）。
// 结构：基座舵机总成 + 5 方盒椎节（节距 67→52、孔半径 9.3→5.7 收锥，
// 三腱方位 30°/150°/270°）+ 节间盘轴联接 + 梢端盖。单位 mm；站 0 心为原点。

export const STATIONS: ReadonlyArray<readonly [number, number, number]> = {json.dumps(stations)} as const;

export const CHAINS: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = {json.dumps(chains)} as const;

export const RADII: ReadonlyArray<number> = {json.dumps(HOLE_R)} as const;

/** 每站元胞真轮廓（局部系 [沿臂 ax, 腱1 方向 u, 副法向 w]），含节间联接与梢端盖 */
export const CELL_OUTLINES: ReadonlyArray<ReadonlyArray<ReadonlyArray<readonly [number, number, number]>>> = [
{','.join(fmt(c) for c in cells)}
] as const;

/** 基座（舵机总成）轮廓：站 0 局部系，静态锚定 */
export const MOUNT_OUTLINE: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = {fmt(mount_polys)} as const;
"""
open('src/lib/linkage/tentacle3d-shape.ts', 'w').write(ts)
print('生成 tentacle3d-shape.ts', len(ts), '字节')
