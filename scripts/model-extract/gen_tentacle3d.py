"""从 tentacle_stations.json + vertebra_{big,small}.json 生成 tentacle3d-shape.ts。
坐标映射：真机臂轴 X → 模拟 +y（向下）；真机 (Y,Z) 盘面 → 模拟 (x,z)。
物理节点 = 真实站心/孔位；轮廓 = 代表件线框，按站半径缩放。
用法：python3 scripts/model-extract/gen_tentacle3d.py
"""
import json, math

st = json.load(open('scripts/model-extract/tentacle_stations.json'))
big = json.load(open('scripts/model-extract/vertebra_big.json'))
small = json.load(open('scripts/model-extract/vertebra_small.json'))

S = st['stations']; chains = st['chains']; radii = st['radii']
base = S[0]
def sim(p):  # 真机 (x,y,z) → 模拟 (x,z 盘面, y 沿臂)
    return [round(p[1]-base[1], 2), round(p[0]-base[0], 2), round(p[2]-base[2], 2)]

stations = [sim(p) for p in S]
chains_sim = [[sim(p) for p in c] for c in chains]
# 家族与缩放（大/小交替；S0 大）：参考半径 = 各家族首件
fam = ['big' if i % 2 == 0 else 'small' for i in range(len(S))]
rref = {'big': None, 'small': None}
for i, f in enumerate(fam):
    if rref[f] is None: rref[f] = radii[i]
scales = [round(radii[i]/rref[fam[i]], 4) for i in range(len(S))]

def fmt_polys(polys):
    return '[\n' + ',\n'.join(
        '  [' + ','.join(f'[{p[0]},{p[1]},{p[2]}]' for p in poly) + ']' for poly in polys
    ) + '\n]'

ts = f"""// 由 scripts/model-extract/gen_tentacle3d.py 生成——不要手改。
// 数据源：模型求解器参考/触手模拟1.3dm + 触手模拟1.ghx（引用 GUID 提取）。
// 坐标：模拟系（臂轴 +y 向下，盘面 x-z），单位 mm；站 0 心为原点。
// 站位交替大/小两类椎节（真机咬合结构），半径/间距向梢部收锥。

/** 15 站脊柱心（真实站位，间距非均匀） */
export const STATIONS: ReadonlyArray<readonly [number, number, number]> = {json.dumps(stations)} as const;

/** 三腱孔位链（真实孔坐标；腱 k 第 i 站）方位 ≈ {', '.join(f"{a:.1f}°" for a in st['azimuths'])} */
export const CHAINS: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = {json.dumps(chains_sim)} as const;

/** 每站孔半径（大/小交替 + 收锥） */
export const RADII: ReadonlyArray<number> = {json.dumps([round(r,2) for r in radii])} as const;

/** 每站家族与相对代表件的缩放 */
export const FAMILY: ReadonlyArray<'big' | 'small'> = {json.dumps(fam)} as const;
export const SCALES: ReadonlyArray<number> = {json.dumps(scales)} as const;

/** 代表件线框（局部系：[沿臂 ax, 腱1 方向 u, 副法向 w]，mm）。 */
export const OUTLINE_BIG: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = {fmt_polys(big)} as const;

export const OUTLINE_SMALL: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = {fmt_polys(small)} as const;
"""
open('src/lib/linkage/tentacle3d-shape.ts', 'w').write(ts)
print('生成 src/lib/linkage/tentacle3d-shape.ts',
      f'站 {len(stations)} 链 {len(chains_sim)}×{len(chains_sim[0])} 大件边 {len(big)} 小件边 {len(small)}')
