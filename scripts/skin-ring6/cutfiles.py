"""切割文件：R12 DXF（单位 mm）+ SVG（mm 画布），并逐张读回核对排版。

颜色约定（按切割店的要求）：白线切穿，红线雕刻。
- DXF：图层 CUT 颜色 7（白），图层 ENGRAVE 颜色 1（红），每个图元也写上颜色。
  有的看图软件在白底上把颜色 7 显示成黑色，文件里仍是 7。
- SVG：切割 stroke #FFFFFF，雕刻 stroke #FF0000，画布背景设成黑色只为看得见白线。
"""

from __future__ import annotations

import numpy as np

import geom as G

LAYERS = {"CUT": 7, "ENGRAVE": 1}
SVG_STROKE = {"CUT": "#FFFFFF", "ENGRAVE": "#FF0000"}


def sheet_items(nest, catalog):
    for key, x, y, rot, mirror in nest:
        pts, holes = G.place(catalog[key], x, y, rot, mirror)
        yield key, pts, holes, G.place_engrave(catalog[key], x, y, rot, mirror)


def _dxf_poly(out, pts, H, layer, closed):
    out += ["0", "POLYLINE", "8", layer, "62", str(LAYERS[layer]), "66", "1",
            "10", "0.0", "20", "0.0", "30", "0.0", "70", "1" if closed else "0"]
    for px, py in pts:
        out += ["0", "VERTEX", "8", layer, "10", f"{px:.3f}", "20", f"{H - py:.3f}", "30", "0.0"]
    out += ["0", "SEQEND", "8", layer]


def write_dxf(path, nest, catalog, sheet):
    H = sheet[1]
    out = ["0", "SECTION", "2", "HEADER",
           "9", "$ACADVER", "1", "AC1009",
           "9", "$EXTMIN", "10", "0.0", "20", "0.0",
           "9", "$EXTMAX", "10", f"{sheet[0]:.3f}", "20", f"{H:.3f}",
           "0", "ENDSEC",
           "0", "SECTION", "2", "TABLES",
           "0", "TABLE", "2", "LAYER", "70", str(len(LAYERS))]
    for name, col in LAYERS.items():
        out += ["0", "LAYER", "2", name, "70", "0", "62", str(col), "6", "CONTINUOUS"]
    out += ["0", "ENDTAB", "0", "ENDSEC",
            "0", "SECTION", "2", "ENTITIES"]
    for _, pts, holes, eng in sheet_items(nest, catalog):
        _dxf_poly(out, pts, H, "CUT", True)
        for cx, cy, d in holes:
            out += ["0", "CIRCLE", "8", "CUT", "62", str(LAYERS["CUT"]),
                    "10", f"{cx:.3f}", "20", f"{H - cy:.3f}", "30", "0.0", "40", f"{d / 2:.3f}"]
        for ln in eng:
            _dxf_poly(out, ln, H, "ENGRAVE", False)
    out += ["0", "ENDSEC", "0", "EOF"]
    with open(path, "w", encoding="ascii", newline="\r\n") as f:
        f.write("\n".join(out) + "\n")


def write_svg(path, nest, catalog, sheet):
    w, h = sheet
    cut, eng = [], []
    for _, pts, holes, lines in sheet_items(nest, catalog):
        d = "M " + " L ".join(f"{px:.3f},{py:.3f}" for px, py in pts) + " Z"
        cut.append(f'<path d="{d}"/>')
        for cx, cy, dd in holes:
            cut.append(f'<circle cx="{cx:.3f}" cy="{cy:.3f}" r="{dd / 2:.3f}"/>')
        for ln in lines:
            eng.append('<path d="M ' + " L ".join(f"{px:.3f},{py:.3f}" for px, py in ln) + '"/>')
    groups = [("cut", "CUT", cut)] + ([("engrave", "ENGRAVE", eng)] if eng else [])
    body = "".join(f'<g id="{gid}" fill="none" stroke="{SVG_STROKE[layer]}" stroke-width="0.1">\n'
                   + "\n".join(items) + "\n</g>\n" for gid, layer, items in groups)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:g}mm" height="{h:g}mm" '
           f'viewBox="0 0 {w:g} {h:g}" style="background-color:#000000">\n' + body + "</svg>\n")
    with open(path, "w", encoding="utf-8") as f:
        f.write(svg)


# ---- 核对：读回 DXF，栅格化检查越界、重叠、零件间距、刻线落在零件里 ---------------------
def read_dxf(path):
    """返回 {"CUT": [(点列, 闭合)], "ENGRAVE": [...]} 与圆 [(cx, cy, r, 图层)]。"""
    tok = open(path, encoding="ascii").read().split("\n")
    tok = [t.strip() for t in tok]
    pairs = list(zip(tok[0::2], tok[1::2]))
    polys = {name: [] for name in LAYERS}
    circles, cur, i = [], None, 0

    def fields(j):
        d = {}
        while pairs[j][0] != "0":
            d.setdefault(pairs[j][0], pairs[j][1])
            j += 1
        return d

    while i < len(pairs):
        code, val = pairs[i]
        if code == "0" and val == "POLYLINE":
            f = fields(i + 1)
            cur = (f["8"], f.get("70", "0") == "1", [])
        elif code == "0" and val == "VERTEX":
            f = fields(i + 1)
            cur[2].append((float(f["10"]), float(f["20"])))
        elif code == "0" and val == "SEQEND":
            polys[cur[0]].append((cur[2], cur[1]))
            cur = None
        elif code == "0" and val == "CIRCLE":
            f = fields(i + 1)
            circles.append((float(f["10"]), float(f["20"]), float(f["40"]), f["8"]))
        i += 1
    return polys, circles


def raster_poly(poly, shape, res):
    """偶奇规则填充，返回布尔栅格（y 向上）。"""
    hgt, wid = shape
    ys = (np.arange(hgt) + 0.5) * res
    xs = (np.arange(wid) + 0.5) * res
    X, Y = np.meshgrid(xs, ys)
    inside = np.zeros(shape, bool)
    n = len(poly)
    for k in range(n):
        x0, y0 = poly[k]
        x1, y1 = poly[(k + 1) % n]
        if y0 == y1:
            continue
        cond = (Y >= min(y0, y1)) & (Y < max(y0, y1))
        xint = x0 + (Y - y0) * (x1 - x0) / (y1 - y0)
        inside ^= cond & (X < xint)
    return inside


def check_sheet(path, sheet, min_gap=4.0, margin=4.0, res=0.5):
    """切割线（CUT）必须都闭合、不越出 margin、零件之间 ≥ min_gap；
    刻线（ENGRAVE）的每个点都在某个零件里，并离切割线 ≥ G.ENGRAVE_MIN。"""
    layers, circles = read_dxf(path)
    polys = [p for p, closed in layers["CUT"]]
    all_closed = all(closed for _, closed in layers["CUT"])
    w, h = sheet
    shape = (int(h / res), int(w / res))
    masks = [raster_poly(p, shape, res) for p in polys]
    allx = [x for p in polys for x, _ in p]
    ally = [y for p in polys for _, y in p]
    bounds_ok = min(allx) >= margin - 1e-6 and min(ally) >= margin - 1e-6 and \
        max(allx) <= w - margin + 1e-6 and max(ally) <= h - margin + 1e-6
    # 每个零件膨胀 (min_gap - 半格) 后不得碰到别的零件
    k = int(round((min_gap - res) / res))

    def dilate(m):
        out = m.copy()
        for d in range(1, k + 1):
            out[d:, :] |= m[:-d, :]
            out[:-d, :] |= m[d:, :]
        m2 = out.copy()
        for d in range(1, k + 1):
            out[:, d:] |= m2[:, :-d]
            out[:, :-d] |= m2[:, d:]
        return out

    count = np.sum(masks, axis=0)
    overlap = int((count > 1).sum())
    worst = 0
    for mi in masks:
        others = (count - mi) > 0
        worst = max(worst, int((dilate(mi) & others).sum()))
    holes_in = 0
    for cx, cy, r, _ in circles:
        inside_any = any(m[int(cy / res), int(cx / res)] for m in masks)
        holes_in += inside_any
    # 刻线：点和相邻点之间的中点，连同周围 ENGRAVE_MIN 一圈，都要落在同一个零件里
    dd = G.ENGRAVE_MIN
    offs = [(0, 0)] + [(dd * a, dd * b) for a in (-1, 0, 1) for b in (-1, 0, 1) if a or b]
    eng_out = 0
    eng_pts = 0
    for ln, _ in layers["ENGRAVE"]:
        pts = list(ln) + [((ln[j][0] + ln[j + 1][0]) / 2, (ln[j][1] + ln[j + 1][1]) / 2)
                          for j in range(len(ln) - 1)]
        for x, y in pts:
            eng_pts += 1
            ok = any(all(m[int((y + oy) / res), int((x + ox) / res)] for ox, oy in offs) for m in masks)
            eng_out += not ok
    return {"parts": len(polys), "closed": all_closed, "holes": len(circles), "holes_inside_parts": holes_in,
            "engrave_lines": len(layers["ENGRAVE"]), "engrave_points": eng_pts, "engrave_outside": eng_out,
            "bounds_ok": bounds_ok, "overlap_px": overlap, "gap_violation_px": worst,
            "extent": (round(min(allx), 2), round(min(ally), 2), round(max(allx), 2), round(max(ally), 2))}
