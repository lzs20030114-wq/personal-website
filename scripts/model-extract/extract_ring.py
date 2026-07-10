# -*- coding: utf-8 -*-
"""Extract kinematic geometry of one ring (S1..S5) from struct_demo.3dm."""
import sys, io, json, math

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import rhino3dm as r3d

path, ring = sys.argv[1], sys.argv[2]   # e.g. struct_demo.3dm S4
m = r3d.File3dm.Read(path)

idx2path = {}
for l in m.Layers:
    idx2path[l.Index] = l.FullPath

def sub(layer_path):
    """objects on layers whose full path contains ring and endswith given sublayer"""
    out = []
    for obj in m.Objects:
        lp = idx2path.get(obj.Attributes.LayerIndex, "")
        if ring in lp and lp.endswith(layer_path):
            out.append(obj)
    return out

def pt(p):
    return [round(p.X, 4), round(p.Y, 4), round(p.Z, 4)]

def curve_info(geo):
    t = type(geo).__name__
    info = {"type": t}
    try:
        if isinstance(geo, r3d.LineCurve):
            info["pts"] = [pt(geo.PointAtStart), pt(geo.PointAtEnd)]
        elif isinstance(geo, r3d.PolylineCurve):
            n = geo.PointCount
            info["pts"] = [pt(geo.Point(i)) for i in range(n)]
        elif isinstance(geo, r3d.ArcCurve):
            arc = geo.Arc
            c = arc.Center
            info["center"] = pt(c)
            info["radius"] = round(arc.Radius, 4)
            info["isCircle"] = geo.IsCompleteCircle
            info["pts"] = [pt(geo.PointAtStart), pt(geo.PointAtEnd)]
        elif isinstance(geo, r3d.NurbsCurve):
            n = geo.Points.Count
            info["ctrl"] = [pt(geo.Points[i].Location) for i in range(n)]
            info["degree"] = geo.Degree
            # try circle recognition
            try:
                ok, arc = geo.TryGetArc()
                if ok:
                    info["asArc"] = {"center": pt(arc.Center), "radius": round(arc.Radius, 4)}
            except Exception:
                pass
        else:
            info["pts"] = [pt(geo.PointAtStart), pt(geo.PointAtEnd)]
    except Exception as e:
        info["err"] = str(e)
    return info

result = {"ring": ring}
for sl in ["导轨", "驱动", "销", "杆三角"]:
    objs = sub(sl)
    items = []
    for o in objs:
        g = o.Geometry
        if isinstance(g, r3d.Point):
            items.append({"type": "Point", "pt": pt(g.Location)})
        elif isinstance(g, r3d.Curve):
            items.append(curve_info(g))
        else:
            items.append({"type": type(g).__name__})
    result[sl] = items

print(json.dumps(result, ensure_ascii=False, indent=1))
