# -*- coding: utf-8 -*-
"""Dump layer tree / object census of a Rhino .3dm file."""
import sys, os, io
from collections import Counter

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import rhino3dm as r3d

path = sys.argv[1]
m = r3d.File3dm.Read(path)
if m is None:
    print("READ FAILED:", path); sys.exit(1)

print("=" * 70)
print("FILE :", os.path.basename(path), f"({os.path.getsize(path)/1e6:.1f} MB)")
try:
    print("UNITS:", m.Settings.ModelUnitSystem)
except Exception as e:
    print("UNITS: ?", e)

layers = list(m.Layers)
print(f"LAYERS ({len(layers)}):")
for l in layers:
    try:
        fp = l.FullPath
    except Exception:
        fp = l.Name
    print(f"  [{l.Index:>3}] {fp}")

per_layer = Counter()
per_type = Counter()
named = []
for obj in m.Objects:
    li = obj.Attributes.LayerIndex
    ot = str(obj.Geometry.ObjectType).replace("ObjectType.", "") if obj.Geometry else "None"
    per_layer[(li, ot)] += 1
    per_type[ot] += 1
    nm = obj.Attributes.Name
    if nm:
        named.append((li, ot, nm))

print(f"\nOBJECTS total={sum(per_type.values())}  by type: {dict(per_type)}")
print("\nPER-LAYER census:")
idx2path = {}
for l in layers:
    try:
        idx2path[l.Index] = l.FullPath
    except Exception:
        idx2path[l.Index] = l.Name
for (li, ot), n in sorted(per_layer.items()):
    print(f"  {idx2path.get(li, li)!s:<50} {ot:<14} x{n}")

if named:
    print(f"\nNAMED OBJECTS ({len(named)}), first 40:")
    for li, ot, nm in named[:40]:
        print(f"  {nm}  ({ot} @ {idx2path.get(li, li)})")

idefs = list(m.InstanceDefinitions)
if idefs:
    print(f"\nINSTANCE DEFS ({len(idefs)}), first 20:")
    for d in idefs[:20]:
        print(f"  {d.Name}")
