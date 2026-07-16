# -*- coding: utf-8 -*-
"""求解器结构演示.3dm 摊开骨架 S1–S5 -> src/lib/linkage/shell3d-data.ts

五环立体编排（2026-07-17 用户立项拍板：站距 85mm 等距 / 同相呼吸 / roll 按盘点 §7）。
坐标 = 环局部 mm，y 向上（图纸原样，不做 px 变换）；地线 y=0，轮心 (0,0)。
每环结构与 gen_arch.py 同构：刚性三角板（3 杆）+ 支撑节点 K4 + 曲柄→中央杆→拱顶 +
竖直导轨/脚槽超长杆近似（1e6 mm，±170mm 行程内直线偏差 ~0.015mm）。
用法：先把 3dm 拷成 ASCII 文件名（rhino3dm 中文路径 Read 失败），
  python gen_shell3d.py <demo.3dm 路径>
"""
import io
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import rhino3dm as r3d

GUIDE = 1_000_000.0
BRACE_OFFSET = 24.0  # mm（对标 2D 版 45px/1.9）
RINGS = [
    # (图层名, 站位 mm, roll°)
    # roll 全 0 = 用户纠偏 2026-07-17：「根本没有 roll，都是在同一平面上」——
    # 五环全部竖直、四脚共地。盘点 §7 的 roll 列不是装配侧倾（语义待用户澄清），
    # 首版误读为环面内旋转已回退。
    ("S1_M3x1.057", -170.0, 0.0),
    ("S2_M1x1.184", -85.0, 0.0),
    ("S3_M5x1.584", 0.0, 0.0),
    ("S4_M3x1.000", 85.0, 0.0),
    ("S5_M3x0.870", 170.0, 0.0),
]

path = sys.argv[1]
m = r3d.File3dm.Read(path)
idx2path = {l.Index: l.FullPath for l in m.Layers}


def collect(ring, suffix):
    out = []
    for obj in m.Objects:
        lp = idx2path.get(obj.Attributes.LayerIndex, "")
        if ring in lp and lp.endswith(suffix):
            out.append(obj.Geometry)
    return out


def P(p):
    return (round(p.X, 3), round(p.Y, 3))


def extract_ring(ring):
    pins = [P(g.Location) for g in collect(ring, "销") if isinstance(g, r3d.Point)]
    tris_raw = []
    for g in collect(ring, "杆三角"):
        if isinstance(g, r3d.PolylineCurve):
            pts = [P(g.Point(i)) for i in range(g.PointCount)]
            if len(pts) > 1 and pts[0] == pts[-1]:
                pts = pts[:-1]
            assert len(pts) == 3, (ring, pts)
            tris_raw.append(pts)
    # 驱动层：Point = 曲柄销 (0, R)
    drive_pts = [P(g.Location) for g in collect(ring, "驱动") if isinstance(g, r3d.Point)]
    assert len(drive_pts) == 1, (ring, drive_pts)
    pin_mm = drive_pts[0]
    crank_r = math.hypot(*pin_mm)

    # 顶点聚类成关节
    joints = []

    def joint_id(p, tol=0.35):
        for i, q in enumerate(joints):
            if abs(p[0] - q[0]) <= tol and abs(p[1] - q[1]) <= tol:
                return i
        joints.append(p)
        return len(joints) - 1

    tris = [[joint_id(p) for p in t] for t in tris_raw]
    feet = [i for i, q in enumerate(joints) if abs(q[1]) < 0.35]
    axis = [i for i, q in enumerate(joints) if abs(q[0]) < 0.35 and q[1] > 1]
    assert len(feet) == 4, (ring, feet, [joints[i] for i in feet])
    assert axis, (ring, "no apex joint on x=0")
    apex = max(axis, key=lambda i: joints[i][1])
    # 脚排序：左外、左内、右内、右外 → 按 x
    feet = sorted(feet, key=lambda i: joints[i][0])
    assert len(pins) == len(joints), (ring, len(pins), len(joints))

    nodes = [{"x": x, "y": y} for (x, y) in joints]
    PIN = len(nodes)
    nodes.append({"x": pin_mm[0], "y": pin_mm[1]})
    CENTER = len(nodes)
    nodes.append({"x": 0.0, "y": 0.0, "fixed": True})
    APEX_ANCHOR = len(nodes)
    nodes.append({"x": GUIDE, "y": joints[apex][1], "fixed": True})
    foot_anchors = []
    for f in feet:
        foot_anchors.append(len(nodes))
        nodes.append({"x": joints[f][0], "y": -GUIDE, "fixed": True})

    def dist(i, j):
        a, b = nodes[i], nodes[j]
        return math.hypot(a["x"] - b["x"], a["y"] - b["y"])

    bars, seen = [], set()

    def add_bar(a, b, tag):
        key = (min(a, b), max(a, b))
        if key in seen:
            return
        seen.add(key)
        bars.append({"a": a, "b": b, "rest": round(dist(a, b), 4)})

    for js in tris:
        for k in range(3):
            add_bar(js[k], js[(k + 1) % 3], "tri")

    braces = []
    for js in tris:
        pts = [(nodes[j]["x"], nodes[j]["y"]) for j in js]
        edges = [
            (math.hypot(pts[(k + 1) % 3][0] - pts[k][0], pts[(k + 1) % 3][1] - pts[k][1]), k)
            for k in range(3)
        ]
        _, kbase = max(edges)
        iA, iB = js[kbase], js[(kbase + 1) % 3]
        iC = js[(kbase + 2) % 3]
        ax, ay = nodes[iA]["x"], nodes[iA]["y"]
        bx, by = nodes[iB]["x"], nodes[iB]["y"]
        cx, cy = nodes[iC]["x"], nodes[iC]["y"]
        mx, my = (ax + bx) / 2, (ay + by) / 2
        ex, ey = bx - ax, by - ay
        el = math.hypot(ex, ey)
        nx, ny = -ey / el, ex / el
        if (cx - mx) * nx + (cy - my) * ny > 0:
            nx, ny = -nx, -ny
        si = len(nodes)
        nodes.append({"x": round(mx + nx * BRACE_OFFSET, 4), "y": round(my + ny * BRACE_OFFSET, 4)})
        braces.append(si)
        add_bar(si, iA, "brace")
        add_bar(si, iB, "brace")
        add_bar(si, iC, "brace")

    add_bar(CENTER, PIN, "crank")
    add_bar(PIN, apex, "rod")
    add_bar(apex, APEX_ANCHOR, "guide")
    for f, fa in zip(feet, foot_anchors):
        add_bar(f, fa, "guide")

    def tri_sign(js):
        (x0, y0), (x1, y1), (x2, y2) = [(nodes[j]["x"], nodes[j]["y"]) for j in js]
        return 1 if (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0) > 0 else -1

    return {
        "pin": PIN,
        "center": CENTER,
        "apex": apex,
        "feet": feet,
        "braces": braces,
        "crankR": round(crank_r, 4),
        "tris": tris,
        "signs": [tri_sign(js) for js in tris],
        "nodes": nodes,
        "bars": bars,
    }


out = io.StringIO()
out.write(
    """// shell3d-data.ts —— 轮回机器伏丘壳体 S1–S5 五环运动学骨架（立体编排用），机器生成。
// 来源：模型求解器参考/求解器结构演示.3dm 图层「摊开骨架::S1…S5」（2026-07-17 提取，
// 生成脚本 scripts/model-extract/gen_shell3d.py——手改无效，改脚本重生成）。
// 坐标 = 环局部 mm、y 向上（图纸原样）；地线 y=0、轮心 (0,0)、曲柄销图纸位 (0, R*)。
// 站位/roll = 用户拍板 2026-07-17：等距 85mm、roll 按 盘点 §7（绕体轴的环面内旋转）。
// 结构同 arch-data（刚性三角板 + 支撑节点 K4 + 曲柄→中央杆→拱顶 + 超长杆导轨/脚槽近似）。

import type { LinkageDef } from './types';

export interface ShellRingData {
  /** 环名（盘点 §7 行） */
  name: string;
  /** 沿体轴站位 mm */
  station: number;
  /** 绕体轴 roll（度，环面内旋转——脊线横向斜漂） */
  rollDeg: number;
  pin: number;
  center: number;
  apex: number;
  feet: ReadonlyArray<number>;
  braces: ReadonlyArray<number>;
  crankR: number;
  tris: ReadonlyArray<readonly [number, number, number]>;
  signs: ReadonlyArray<1 | -1>;
  def: LinkageDef;
}

"""
)

entries = []
for name, station, roll in RINGS:
    d = extract_ring(name)
    print(
        f"{name}: joints={len([n for n in d['nodes'] if 'fixed' not in n]) - len(d['braces']) - 1}"
        f" tris={len(d['tris'])} bars={len(d['bars'])} feet={[d['nodes'][f]['x'] for f in d['feet']]}"
        f" R*={d['crankR']} apexY={d['nodes'][d['apex']]['y']}"
    )
    lines = [f"  {{\n    name: '{name}',\n    station: {station},\n    rollDeg: {roll},"]
    lines.append(
        f"    pin: {d['pin']},\n    center: {d['center']},\n    apex: {d['apex']},"
    )
    lines.append(f"    feet: {json.dumps(d['feet'])},")
    lines.append(f"    braces: {json.dumps(d['braces'])},")
    lines.append(f"    crankR: {d['crankR']},")
    lines.append(f"    tris: {json.dumps(d['tris'])},")
    lines.append(f"    signs: {json.dumps(d['signs'])},")
    node_rows = []
    for n in d["nodes"]:
        fx = ", fixed: true" if n.get("fixed") else ""
        node_rows.append(f"        {{ x: {n['x']}, y: {n['y']}{fx} }},")
    bar_rows = [f"        {{ a: {b['a']}, b: {b['b']}, rest: {b['rest']} }}," for b in d["bars"]]
    lines.append("    def: {\n      nodes: [\n" + "\n".join(node_rows) + "\n      ],")
    lines.append("      bars: [\n" + "\n".join(bar_rows) + "\n      ],\n    },")
    lines.append("  },")
    entries.append("\n".join(lines))

out.write("export const SHELL_RINGS: ReadonlyArray<ShellRingData> = [\n")
out.write("\n".join(entries))
out.write("\n];\n")

dst = Path(__file__).resolve().parent.parent.parent / "src" / "lib" / "linkage" / "shell3d-data.ts"
dst.write_text(out.getvalue(), encoding="utf-8")
print("wrote", dst, len(out.getvalue()), "bytes")
