# -*- coding: utf-8 -*-
"""ring_S4.json -> src/lib/linkage/arch-data.ts
坐标变换：x_px = 350 + 1.9*x_mm ; y_px = 430 - 1.9*y_mm（SVG y 向下）。
驱动链：轮心(0,0)->pin(0,28.0965) 曲柄；pin->apex(joint6) 中央杆。
导轨/脚槽 = 超长杆到远锚点（半径 1e6 px 的圆局部近似直线，偏差 <0.01px）。

脚部边界以最初的「伸缩外壳1.3dm」为准：外侧两脚是地面固定铰，内侧两脚在
各 38mm 的水平槽内向心滑动。「求解器结构演示.3dm」驱动层的 -170.48…+170.48mm
是整段地线，不是两条脚槽的端点。
"""
import json, math, io, sys
from pathlib import Path
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

S, CX, GY = 1.9, 350.0, 430.0        # scale, center-x, ground-y (px)
GUIDE = 1_000_000.0                   # 导轨模拟半径
APEX_J = 6
FIXED_FEET_J = [16, 19]               # 最初设计：外侧地面固定铰
SLIDER_FEET_J = [18, 21]              # 最初设计：内侧两脚向心滑动
FEET_J = [16, 18, 19, 21]
SLOT_LENGTH_MM = 38.0                 # 伸缩外壳1.3dm 原始左/右槽长
PIN_MM = (0.0, 28.0965)               # 曲柄销（驱动层实测）
R_MM = 28.0965                        # 轮半径 = |pin - center|

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
d = json.load(open(HERE / "ring_S4.json", encoding="utf-8"))
joints = d["joints"]                  # 23 个 (x_mm, y_mm)

def px(p):
    return (round(CX + S * p[0], 4), round(GY - S * p[1], 4))

nodes = [{"x": x, "y": y} for (x, y) in (px(j) for j in joints)]
for f in FIXED_FEET_J:
    nodes[f]["fixed"] = True

PIN = len(nodes)                      # 23
nodes.append({"x": px(PIN_MM)[0], "y": px(PIN_MM)[1]})
CENTER = len(nodes)                   # 24
nodes.append({"x": CX, "y": GY, "fixed": True})

# 远锚点：apex 水平向 +x 远方；仅内侧滑脚用竖直向 +y 的远锚点
apex_px = px(joints[APEX_J])
APEX_ANCHOR = len(nodes)              # 25
nodes.append({"x": round(CX + GUIDE, 4), "y": apex_px[1], "fixed": True})
FOOT_ANCHORS = []
for f in SLIDER_FEET_J:
    fp = px(joints[f])
    FOOT_ANCHORS.append(len(nodes))
    nodes.append({"x": fp[0], "y": round(GY + GUIDE, 4), "fixed": True})

slot_px = round(SLOT_LENGTH_MM * S, 4)
SLOT_RANGES = []
for f in SLIDER_FEET_J:
    x = px(joints[f])[0]
    SLOT_RANGES.append([x, round(x + slot_px, 4)] if x < CX else [round(x - slot_px, 4), x])

def dist(i, j):
    a, b = nodes[i], nodes[j]
    return math.hypot(a["x"] - b["x"], a["y"] - b["y"])

BRACE_OFFSET = 45.0  # px；镜像隧穿势垒从板高(~10px)提到 ~45px（对标四杆板 73px）

bars, seen = [], set()
def add_bar(a, b, tag):
    key = (min(a, b), max(a, b))
    if key in seen:
        return False
    seen.add(key)
    bars.append({"a": a, "b": b, "rest": round(dist(a, b), 4), "tag": tag})
    return True

tris = []
dups = 0
for t in d["triangles"]:
    js = t["joints"]
    assert len(js) == 3, js
    tris.append(js)
    for k in range(3):
        if not add_bar(js[k], js[(k + 1) % 3], "tri"):
            dups += 1

# —— 支撑节点（brace）：每块角化板加 1 节点 + 3 杆成 K4 全连接刚体。
# 动机：角化板极扁（高 ~10px），高度对杆残差的放大率 ≈ arm/h ≈ 5.7——瞬态残差 1px
# 即可把板压过共线、镜像隧穿（实测折叠中段翻面）。支撑点把势垒提到 BRACE_OFFSET，
# 同时更贴近实体：真机角化件是有面积的板件，不是线段。
BRACES = []
for js in tris:
    pts = [(nodes[j]["x"], nodes[j]["y"]) for j in js]
    # 底边 = 最长边；其对角 = 剪式交叉销（两短臂的公共端）
    edges = [(math.hypot(pts[(k+1) % 3][0]-pts[k][0], pts[(k+1) % 3][1]-pts[k][1]), k) for k in range(3)]
    _, kbase = max(edges)
    iA, iB = js[kbase], js[(kbase + 1) % 3]
    iC = js[(kbase + 2) % 3]                      # 交叉销
    (ax, ay), (bx, by) = (nodes[iA]["x"], nodes[iA]["y"]), (nodes[iB]["x"], nodes[iB]["y"])
    (cx_, cy_) = (nodes[iC]["x"], nodes[iC]["y"])
    mx, my = (ax + bx) / 2, (ay + by) / 2
    ex, ey = bx - ax, by - ay
    el = math.hypot(ex, ey)
    nx, ny = -ey / el, ex / el                    # 底边法向
    # 指向交叉销的反侧（板外侧）
    if (cx_ - mx) * nx + (cy_ - my) * ny > 0:
        nx, ny = -nx, -ny
    si = len(nodes)
    nodes.append({"x": round(mx + nx * BRACE_OFFSET, 4), "y": round(my + ny * BRACE_OFFSET, 4)})
    BRACES.append(si)
    add_bar(si, iA, "brace")
    add_bar(si, iB, "brace")
    add_bar(si, iC, "brace")

add_bar(CENTER, PIN, "crank")
add_bar(PIN, APEX_J, "rod")
add_bar(APEX_J, APEX_ANCHOR, "guide")
for f, fa in zip(SLIDER_FEET_J, FOOT_ANCHORS):
    add_bar(f, fa, "guide")

# 三角朝向符号（初始解支不变量）
def tri_sign(js):
    (x0, y0), (x1, y1), (x2, y2) = [(nodes[j]["x"], nodes[j]["y"]) for j in js]
    return 1 if (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0) > 0 else -1

signs = [tri_sign(js) for js in tris]

print(f"nodes={len(nodes)} bars={len(bars)} tris={len(tris)} dupEdges={dups}")
print(f"crank rest={dist(CENTER,PIN):.4f} rod rest={dist(PIN,APEX_J):.4f}")
print(f"apex px={apex_px}  feet px={[px(joints[f]) for f in FEET_J]}")

def fmt_node(n):
    f = ', fixed: true' if n.get("fixed") else ''
    return f"  {{ x: {n['x']}, y: {n['y']}{f} }},"

def fmt_bar(b):
    return f"  {{ a: {b['a']}, b: {b['b']}, rest: {b['rest']} }}, // {b['tag']}"

ts = io.StringIO()
ts.write(
"""// arch-data.ts —— 轮回机器伏丘壳体 S4 环（M3 × 1.000）运动学骨架，机器生成。
// 来源：模型求解器参考/求解器结构演示.3dm 图层「摊开骨架::S4_M3x1.000」（2026-07-10 提取，
// 生成脚本 scripts/model-extract/gen_arch.py）。坐标 = viewBox px：x = 350 + 1.9·x_mm，y = 430 − 1.9·y_mm。
// 结构：14 块角化三角板（刚性三角 = 3 杆）+ 23 销关节 + 曲柄(R*=28.1mm)→中央杆(≈L*)→拱顶，
// 外侧两脚是地面固定铰；内侧两脚在各 38mm 的向心水平槽内滑动。顶部竖直导轨 + 两脚水平槽
// 用「超长杆到远锚点」模拟（半径 1e6px 的圆弧局部逼近直线，
// 行程内偏差 < 0.01px——Watt 直线机构同理；求解器内核零修改，范围锁死内）。
// 脚部边界取自「伸缩外壳1.3dm」；驱动层 ±170.48mm 整段地线不再误作脚槽。
// 手改无效——改 scripts/model-extract/gen_arch.py 重新生成（依赖 pip: rhino3dm；流程见该目录脚本头注）。

import type { LinkageDef } from './types';

""")
ts.write(f"export const ARCH_PIN = {PIN};\n")
ts.write(f"export const ARCH_CENTER = {CENTER};\n")
ts.write(f"export const ARCH_APEX = {APEX_J};\n")
ts.write(f"export const ARCH_FEET = {FEET_J} as const;\n")
ts.write(f"export const ARCH_FIXED_FEET = {FIXED_FEET_J} as const;\n")
ts.write(f"export const ARCH_SLIDER_FEET = {SLIDER_FEET_J} as const;\n")
ts.write(f"export const ARCH_SLOT_RANGES: ReadonlyArray<readonly [number, number]> = {json.dumps(SLOT_RANGES)};\n")
ts.write(f"export const ARCH_CRANK_RADIUS = {round(dist(CENTER, PIN), 4)};\n")
ts.write(f"export const GUIDE_REST = {GUIDE};\n")
ts.write(f"/** 支撑节点（渲染跳过；每板一个，K4 加固，见头注）。 */\n")
ts.write(f"export const ARCH_BRACES: ReadonlyArray<number> = {json.dumps(BRACES)};\n\n")
ts.write("/** 14 块角化三角板的关节索引（渲染板面 + 解支符号用）。 */\n")
ts.write(f"export const ARCH_TRIS: ReadonlyArray<readonly [number, number, number]> = {json.dumps(tris)};\n\n")
ts.write("/** 初始（图纸姿态）各板朝向符号——解支不变量（SPEC §2.3 同思路）。 */\n")
ts.write(f"export const ARCH_TRI_SIGNS: ReadonlyArray<1 | -1> = {json.dumps(signs)};\n\n")
ts.write("export const ARCH_DEF: LinkageDef = {\n nodes: [\n")
for n in nodes:
    ts.write(fmt_node(n) + "\n")
ts.write(" ],\n bars: [\n")
for b in bars:
    ts.write(fmt_bar(b) + "\n")
ts.write(" ],\n};\n")

out = ts.getvalue()
dest = ROOT / "src" / "lib" / "linkage" / "arch-data.ts"
dest.write_text(out, encoding="utf-8")
print("\nwrote", dest, len(out), "bytes")
