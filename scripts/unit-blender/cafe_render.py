"""Lab 2-15 效果图的渲染（2026-11-08）。

    blender -b <cafe.blend> --python scripts/unit-blender/cafe_render.py -- <输出目录> <机位 H1,H2,…|all> [宽 2400] [采样 256]

轴测图（H4）隐去近处两面墙与天花板；其余机位照原样。宽度给定后高度按 16:9（H4 为 4:3）。
"""

import bpy
import os
import sys

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'renders'
SHOTS = argv[1] if len(argv) > 1 else 'all'
WIDTH = int(argv[2]) if len(argv) > 2 else 2400
SAMPLES = int(argv[3]) if len(argv) > 3 else 256

os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene
cams = {o.name.split('·')[0]: o for o in bpy.data.objects if o.type == 'CAMERA'}
names = sorted(cams) if SHOTS == 'all' else SHOTS.split(',')
cut = [c for c in bpy.data.collections if '轴测图里隐去' in c.name]
for k in names:
    cam = cams[k]
    sc.camera = cam
    axon = cam.data.type == 'ORTHO'
    for c in cut:
        c.hide_render = axon
    sc.render.resolution_x = WIDTH
    sc.render.resolution_y = int(WIDTH * (3 / 4 if axon else 9 / 16))
    sc.cycles.samples = SAMPLES
    sc.render.filepath = os.path.join(OUT, cam.name + '.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', sc.render.filepath, flush=True)
for c in cut:
    c.hide_render = False
