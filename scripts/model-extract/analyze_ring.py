# -*- coding: utf-8 -*-
"""Analyze one ring: pins, triangles, connectivity -> solver-ready summary."""
import sys, io, json, math
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import rhino3dm as r3d

path, ring = sys.argv[1], sys.argv[2]
m = r3d.File3dm.Read(path)
idx2path = {l.Index: l.FullPath for l in m.Layers}

def collect(suffix):
    out = []
    for obj in m.Objects:
        lp = idx2path.get(obj.Attributes.LayerIndex, "")
        if ring in lp and lp.endswith(suffix):
            out.append(obj.Geometry)
    return out

def P(p): return (round(p.X, 3), round(p.Y, 3))

# --- pins ---
pins = [P(g.Location) for g in collect("销") if isinstance(g, r3d.Point)]

# --- triangles (polyline curves) ---
tris = []
others = []
for g in collect("杆三角"):
    if isinstance(g, r3d.PolylineCurve):
        pts = [P(g.Point(i)) for i in range(g.PointCount)]
        # closed polyline repeats first point
        if len(pts) > 1 and pts[0] == pts[-1]:
            pts = pts[:-1]
        tris.append(pts)
    elif isinstance(g, r3d.LineCurve):
        others.append(("Line", P(g.PointAtStart), P(g.PointAtEnd)))
    else:
        others.append((type(g).__name__,))

def d(a, b): return math.hypot(a[0]-b[0], a[1]-b[1])

print(f"ring {ring}: pins={len(pins)} triCurves={len(tris)} others={len(others)}")

# triangle census: vertex count + edge lengths
sig_count = defaultdict(list)
for t in tris:
    n = len(t)
    if n == 3:
        e = sorted([d(t[0],t[1]), d(t[1],t[2]), d(t[2],t[0])])
        sig = tuple(round(x,1) for x in e)
    else:
        e = [d(t[i], t[(i+1)%n]) for i in range(n)]
        sig = ("poly", n, tuple(round(x,1) for x in sorted(e)))
    sig_count[sig].append(t)

print("\nTRIANGLE/POLY classes:")
for sig, lst in sorted(sig_count.items(), key=lambda kv: -len(kv[1])):
    print(f"  x{len(lst)}  {sig}")

if others:
    print("\nOTHER curves:", others[:10])

# connectivity: which triangle vertices coincide with pins (tolerance)
def near(a, b, tol=0.35):
    return abs(a[0]-b[0]) <= tol and abs(a[1]-b[1]) <= tol

# unique joint set: cluster all triangle vertices
joints = []
def joint_id(p):
    for i, q in enumerate(joints):
        if near(p, q): return i
    joints.append(p); return len(joints)-1

tri_joint = []
for t in tris:
    tri_joint.append([joint_id(p) for p in t])

print(f"\nunique joints from tri vertices: {len(joints)}")
pin_hit = sum(1 for p in pins if any(near(p, q) for q in joints))
print(f"pins coinciding with a joint: {pin_hit}/{len(pins)}")

# joints on ground line y=0 (feet) and near axis x=0 (apex)
feet = [i for i, q in enumerate(joints) if abs(q[1]) < 0.35]
apex = [i for i, q in enumerate(joints) if abs(q[0]) < 0.35]
print("feet joints (y=0):", [(i, joints[i]) for i in feet])
print("axis joints (x=0):", [(i, joints[i]) for i in apex])

# shared-joint graph: triangles sharing >=1 joint
share = defaultdict(set)
for a in range(len(tris)):
    for b in range(a+1, len(tris)):
        common = set(tri_joint[a]) & set(tri_joint[b])
        if common:
            share[a].add(b); share[b].add(a)
deg = {a: len(v) for a, v in share.items()}
print("triangle adjacency degrees:", dict(sorted(deg.items())))

out = {
    "ring": ring, "pins": pins,
    "joints": joints,
    "triangles": [{"pts": tris[i], "joints": tri_joint[i]} for i in range(len(tris))],
}
fn = f"ring_{ring.split('_')[0]}.json"
with open(fn, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print("saved", fn)
