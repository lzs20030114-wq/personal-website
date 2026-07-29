# -*- coding: utf-8 -*-
"""729新参考.3dm 整机测绘 —— 图层普查 + 五环机构参数 + 装配变换校验。

只测量、不生成台架数据（生成脚本按机构另开，见 gen_arch.py / gen_shell3d.py 先例）。

用法（需要 rhino3dm，见 requirements.txt）：
    python measure_729.py ../../模型求解器参考/729新参考.3dm [-o machine_729.json]

测绘结论写在 轮回机器_整机测绘.md；那份文档的数字一律以本脚本输出为准，手改无效。
"""
import argparse
import io
import json
import math
import os
import sys
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import rhino3dm as r3d  # noqa: E402

# 五环图层名（基型 M1/M3/M5 + 相对 S4 的比例）
RINGS = [
    "S1_M3x1.057",
    "S2_M1x1.184",
    "S3_M5x1.584",
    "S4_M3x1.000",
    "S5_M3x0.870",
]
# 摊开位 / 装配位以 x 分簇：摊开位在原点附近，装配位在 x ≈ -5500
FLAT_X_CUTOFF = -1000.0


def load(path):
    m = r3d.File3dm.Read(path)
    if m is None:
        sys.exit(f"READ FAILED: {path}")
    idx2path = {}
    for l in m.Layers:
        try:
            idx2path[l.Index] = l.FullPath
        except Exception:
            idx2path[l.Index] = l.Name
    byl = defaultdict(list)
    for o in m.Objects:
        byl[idx2path.get(o.Attributes.LayerIndex, "?")].append(o)
    return m, byl


def points(byl, layer, flat=True):
    out = []
    for o in byl.get(layer, []):
        g = o.Geometry
        if g is None or g.ObjectType != r3d.ObjectType.Point:
            continue
        p = g.Location
        if (p.X > FLAT_X_CUTOFF) == flat:
            out.append(p)
    return out


def curves(byl, layer, flat=True):
    out = []
    for o in byl.get(layer, []):
        g = o.Geometry
        if g is None or g.ObjectType != r3d.ObjectType.Curve:
            continue
        if (g.PointAtStart.X > FLAT_X_CUTOFF) == flat:
            out.append(g)
    return out


def polyline_verts(g):
    try:
        pl = g.ToPolyline()
        return [(round(pl[i].X, 4), round(pl[i].Y, 4)) for i in range(len(pl))]
    except Exception:
        return None


def measure_ring(byl, ring):
    """一个环的曲柄滑块参数 + 桁架拓扑（摊开位，mm，地线 y=0，中线 x=0）。"""
    L = lambda sub: f"摊开骨架::{ring}::{sub}"
    pins = points(byl, L("销"))
    tris = [v for v in (polyline_verts(c) for c in curves(byl, L("杆三角"))) if v]
    # 三角形多段线首尾重合，去掉重复的收尾点
    tris = [v[:-1] if len(v) == 4 and v[0] == v[-1] else v for v in tris]

    crank_pt = points(byl, L("驱动"))
    r = crank_pt[0].Y if crank_pt else None
    rods = [
        c
        for c in curves(byl, L("驱动"))
        if not c.IsClosed
        and abs(c.PointAtStart.X) < 1e-6
        and abs(c.PointAtEnd.X) < 1e-6
    ]
    rod_len = abs(rods[0].PointAtEnd.Y - rods[0].PointAtStart.Y) if rods else None

    circles = [c for c in curves(byl, L("驱动")) if c.IsClosed]
    crank_circle_r = None
    if circles:
        bb = circles[0].GetBoundingBox()
        crank_circle_r = round((bb.Max.X - bb.Min.X) / 2, 4)

    rail = sorted(p.Y for p in points(byl, L("导轨")))
    rail_lo = rail[0] if len(rail) == 2 else None
    rail_hi = rail[-1] if rail else None

    asm_pins = points(byl, L("销"), flat=False)
    asm_crank = points(byl, L("驱动"), flat=False)
    asm_rail = sorted(
        (p.Z for p in points(byl, L("导轨"), flat=False)),
    )

    ground = sorted(round(p.X, 4) for p in pins if abs(p.Y) < 1e-6)
    return {
        "layer": ring,
        "base": ring.split("_")[1].split("x")[0],
        "scale": float(ring.split("x")[-1]),
        "pins": len(pins),
        "triangles": len(tris),
        "tri_verts": tris,
        "pin_xy": sorted((round(p.X, 4), round(p.Y, 4)) for p in pins),
        "crank_r": None if r is None else round(r, 4),
        "crank_circle_r": crank_circle_r,
        "rod_len": None if rod_len is None else round(rod_len, 4),
        "rail_lo": None if rail_lo is None else round(rail_lo, 4),
        "rail_hi": None if rail_hi is None else round(rail_hi, 4),
        "apex_y": round(max(p.Y for p in pins), 4),
        "half_span_x": round(max(abs(p.X) for p in pins), 4),
        "ground_x": ground,
        "assembly_plane_y": round(asm_pins[0].Y, 4) if asm_pins else None,
        "assembly_crank_pin_z": round(asm_crank[0].Z, 4) if asm_crank else None,
        "assembly_crank_pin_x": round(asm_crank[0].X, 4) if asm_crank else None,
        "assembly_rail_z": [round(z, 4) for z in asm_rail],
    }


def shaft_axis(byl):
    """中间轴的轴线（装配坐标）。"""
    objs = byl.get("中间轴", [])
    if not objs:
        return None
    bb = objs[0].Geometry.GetBoundingBox()
    return {
        "x": round((bb.Min.X + bb.Max.X) / 2, 4),
        "z": round((bb.Min.Z + bb.Max.Z) / 2, 4),
        "y_min": round(bb.Min.Y, 4),
        "y_max": round(bb.Max.Y, 4),
        "length": round(bb.Max.Y - bb.Min.Y, 4),
    }


def layer_census(m, byl):
    rows = []
    for k in sorted(byl):
        types = defaultdict(int)
        lo = [math.inf] * 3
        hi = [-math.inf] * 3
        for o in byl[k]:
            g = o.Geometry
            if g is None:
                continue
            types[str(g.ObjectType).replace("ObjectType.", "")] += 1
            bb = g.GetBoundingBox()
            for i, (a, b) in enumerate(
                zip([bb.Min.X, bb.Min.Y, bb.Min.Z], [bb.Max.X, bb.Max.Y, bb.Max.Z])
            ):
                lo[i] = min(lo[i], a)
                hi[i] = max(hi[i], b)
        rows.append(
            {
                "layer": k,
                "types": dict(types),
                "bbox": None
                if lo[0] == math.inf
                else [[round(v, 3) for v in lo], [round(v, 3) for v in hi]],
            }
        )
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("-o", "--out", default=None)
    a = ap.parse_args()

    m, byl = load(a.path)
    rings = [measure_ring(byl, r) for r in RINGS]
    axis = shaft_axis(byl)

    print("=" * 104)
    print(f"FILE : {os.path.basename(a.path)}  ({os.path.getsize(a.path) / 1e6:.1f} MB)")
    print(f"UNITS: {m.Settings.ModelUnitSystem}")
    print("=" * 104)
    print(
        "环   基型 比例   曲柄r    连杆l   导轨[下,上]           行程    拱顶y    半跨x   销 三角  装配面y"
    )
    for d in rings:
        lo = "   —   " if d["rail_lo"] is None else f"{d['rail_lo']:7.3f}"
        span = "   —   " if d["rail_lo"] is None else f"{d['rail_hi'] - d['rail_lo']:7.3f}"
        print(
            f"{d['layer'][:2]}  {d['base']:<3}{d['scale']:6.3f} {d['crank_r']:7.3f} {d['rod_len']:8.3f}"
            f"  [{lo},{d['rail_hi']:8.3f}] {span}"
            f" {d['apex_y']:8.3f} {d['half_span_x']:8.3f} {d['pins']:4d} {d['triangles']:4d}"
            f" {d['assembly_plane_y']:10.3f}"
        )

    print("\n### 校验 1 · 导轨端点 == 曲柄滑块极限 l ∓ r")
    for d in rings:
        r, l = d["crank_r"], d["rod_len"]
        hi_err = d["rail_hi"] - (l + r)
        lo_err = None if d["rail_lo"] is None else d["rail_lo"] - (l - r)
        lo_txt = "下端缺（图上只画了一端）" if lo_err is None else f"下端 Δ={lo_err:+.4f}"
        print(f"  {d['layer'][:2]}: 上端 Δ={hi_err:+.4f}   {lo_txt}   (l-r={l - r:.4f})")

    print("\n### 校验 2 · 曲柄圆半径 == 驱动点半径")
    for d in rings:
        print(
            f"  {d['layer'][:2]}: 圆 {d['crank_circle_r']}  点 {d['crank_r']}  Δ={d['crank_circle_r'] - d['crank_r']:+.4f}"
        )

    print("\n### 校验 3 · 装配位曲柄销 —— 是否同相 + 轴线高度")
    print(f"  中间轴 轴线 x={axis['x']} z={axis['z']} 长度 {axis['length']} (y {axis['y_min']}→{axis['y_max']})")
    xs = {d["assembly_crank_pin_x"] for d in rings}
    print(f"  五环曲柄销 x 全等？ {len(xs) == 1}  → {sorted(xs)}")
    print("  环   销z        推得轴z = 销z - r      与图纸轴线偏差")
    for d in rings:
        implied = d["assembly_crank_pin_z"] - d["crank_r"]
        print(
            f"  {d['layer'][:2]} {d['assembly_crank_pin_z']:9.3f} {implied:14.3f} {implied - axis['z']:+18.3f}"
        )

    print("\n### 校验 4 · 摊开位 → 装配位 变换（地线 y=0 落到 z = 轴线高）")
    for d in rings:
        if not d["assembly_rail_z"] or d["rail_lo"] is None:
            print(f"  {d['layer'][:2]}: 导轨端点不成对，跳过")
            continue
        dz = [
            round(d["rail_lo"] - d["assembly_rail_z"][0], 4),
            round(d["rail_hi"] - d["assembly_rail_z"][-1], 4),
        ]
        print(f"  {d['layer'][:2]}: y_flat - z_asm = {dz}  （应恒等于 -轴线z = {-axis['z']}）")

    ys = [d["assembly_plane_y"] for d in rings]
    print("\n### 校验 5 · 五环站距")
    print("  " + " ".join(f"{y:.3f}" for y in ys))
    print("  相邻间距 " + " ".join(f"{ys[i] - ys[i + 1]:.3f}" for i in range(len(ys) - 1)))

    if a.out:
        payload = {
            "source": os.path.basename(a.path),
            "units": "mm",
            "shaft_axis": axis,
            "rings": rings,
            "layers": layer_census(m, byl),
        }
        with open(a.out, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=1)
        print(f"\n→ 已写出 {a.out}")


if __name__ == "__main__":
    main()
