"""切割文件：R12 DXF（只有闭合轮廓与圆，单位 mm）+ SVG（mm 画布），并逐张核对排版。"""

from __future__ import annotations

import numpy as np

import geom as G


def sheet_items(nest, catalog):
    for key, x, y, rot, mirror in nest:
        pts, holes = G.place(catalog[key], x, y, rot, mirror)
        yield key, pts, holes


def write_dxf(path, nest, catalog, sheet):
    H = sheet[1]
    out = ["0", "SECTION", "2", "HEADER",
           "9", "$ACADVER", "1", "AC1009",
           "9", "$EXTMIN", "10", "0.0", "20", "0.0",
           "9", "$EXTMAX", "10", f"{sheet[0]:.3f}", "20", f"{H:.3f}",
           "0", "ENDSEC",
           "0", "SECTION", "2", "TABLES",
           "0", "TABLE", "2", "LAYER", "70", "1",
           "0", "LAYER", "2", "CUT", "70", "0", "62", "1", "6", "CONTINUOUS",
           "0", "ENDTAB", "0", "ENDSEC",
           "0", "SECTION", "2", "ENTITIES"]
    for _, pts, holes in sheet_items(nest, catalog):
        out += ["0", "POLYLINE", "8", "CUT", "66", "1", "10", "0.0", "20", "0.0", "30", "0.0", "70", "1"]
        for px, py in pts:
            out += ["0", "VERTEX", "8", "CUT", "10", f"{px:.3f}", "20", f"{H - py:.3f}", "30", "0.0"]
        out += ["0", "SEQEND", "8", "CUT"]
        for cx, cy, d in holes:
            out += ["0", "CIRCLE", "8", "CUT", "10", f"{cx:.3f}", "20", f"{H - cy:.3f}", "30", "0.0", "40", f"{d / 2:.3f}"]
    out += ["0", "ENDSEC", "0", "EOF"]
    with open(path, "w", encoding="ascii", newline="\r\n") as f:
        f.write("\n".join(out) + "\n")


def write_svg(path, nest, catalog, sheet):
    w, h = sheet
    body = []
    for _, pts, holes in sheet_items(nest, catalog):
        d = "M " + " L ".join(f"{px:.3f},{py:.3f}" for px, py in pts) + " Z"
        body.append(f'<path d="{d}"/>')
        for cx, cy, dd in holes:
            body.append(f'<circle cx="{cx:.3f}" cy="{cy:.3f}" r="{dd / 2:.3f}"/>')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:g}mm" height="{h:g}mm" '
           f'viewBox="0 0 {w:g} {h:g}">\n'
           f'<g fill="none" stroke="#ff0000" stroke-width="0.1">\n' + "\n".join(body) + "\n</g>\n</svg>\n")
    with open(path, "w", encoding="utf-8") as f:
        f.write(svg)


# ---- 核对：读回 DXF，栅格化检查越界、重叠、零件间距 ---------------------------------
def read_dxf(path):
    tok = open(path, encoding="ascii").read().split("\n")
    tok = [t.strip() for t in tok]
    pairs = list(zip(tok[0::2], tok[1::2]))
    polys, circles, cur, i = [], [], None, 0
    while i < len(pairs):
        code, val = pairs[i]
        if code == "0" and val == "POLYLINE":
            cur = []
        elif code == "0" and val == "VERTEX":
            x = y = None
            j = i + 1
            while pairs[j][0] != "0":
                if pairs[j][0] == "10":
                    x = float(pairs[j][1])
                if pairs[j][0] == "20":
                    y = float(pairs[j][1])
                j += 1
            cur.append((x, y))
        elif code == "0" and val == "SEQEND":
            polys.append(cur)
            cur = None
        elif code == "0" and val == "CIRCLE":
            d = {}
            j = i + 1
            while pairs[j][0] != "0":
                if pairs[j][0] in ("10", "20", "40"):
                    d[pairs[j][0]] = float(pairs[j][1])
                j += 1
            circles.append((d["10"], d["20"], d["40"]))
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


def check_sheet(path, sheet, min_gap=4.0, res=0.5):
    polys, circles = read_dxf(path)
    w, h = sheet
    shape = (int(h / res), int(w / res))
    masks = [raster_poly(p, shape, res) for p in polys]
    allx = [x for p in polys for x, _ in p]
    ally = [y for p in polys for _, y in p]
    bounds_ok = min(allx) >= min_gap - 1e-6 and min(ally) >= min_gap - 1e-6 and \
        max(allx) <= w - min_gap + 1e-6 and max(ally) <= h - min_gap + 1e-6
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
    for cx, cy, r in circles:
        inside_any = any(m[int(cy / res), int(cx / res)] for m in masks)
        holes_in += inside_any
    return {"parts": len(polys), "holes": len(circles), "holes_inside_parts": holes_in,
            "bounds_ok": bounds_ok, "overlap_px": overlap, "gap_violation_px": worst,
            "extent": (round(min(allx), 2), round(min(ally), 2), round(max(allx), 2), round(max(ally), 2))}
