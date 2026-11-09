"""去掉访客、猫、小物的底图 + 人和猫在画面上的位置（给图版上叠各种画法的人用）。

blender -b 项目二_单元建模/猫咖效果图.blend --python scripts/unit-blender/cafe_base.py -- <out> <cafe.json> H4,H2,H1 1600 64
"""
import bpy, json, os, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
OUT, JS, SHOTS = argv[0], argv[1], argv[2].split(',')
WIDTH = int(argv[3]); SAMPLES = int(argv[4])
os.makedirs(OUT, exist_ok=True)
d = json.load(open(JS))
sc = bpy.context.scene
for c in bpy.data.collections:
    if c.name in ('访客', '猫', '布景·小物'):
        c.hide_render = True
cams = {o.name.split('·')[0]: o for o in bpy.data.objects if o.type == 'CAMERA'}
cut = [c for c in bpy.data.collections if '轴测图里隐去' in c.name]

def proj(M, w, h, p):
    v = M @ Vector((p[0], p[1], p[2], 1.0))
    return [round((v.x / v.w * 0.5 + 0.5) * w, 1), round((1 - (v.y / v.w * 0.5 + 0.5)) * h, 1), round(v.w, 3)]

for k in SHOTS:
    cam = cams[k]
    sc.camera = cam
    axon = cam.data.type == 'ORTHO'
    for c in cut:
        c.hide_render = axon
    rx = WIDTH; ry = int(WIDTH * (3 / 4 if axon else 9 / 16))
    sc.render.resolution_x, sc.render.resolution_y = rx, ry
    sc.cycles.samples = SAMPLES
    dg = bpy.context.evaluated_depsgraph_get()
    M = cam.calc_matrix_camera(dg, x=rx, y=ry, scale_x=1, scale_y=1) @ cam.matrix_world.inverted()
    P = lambda p: proj(M, rx, ry, p)
    people = []
    for p in d['people']:
        j = p['joints']
        foot = [p['x'], p['y'], 0.0]
        people.append(dict(
            k=p['k'], pose=p['pose'], seated=p['seated'], heading=p['heading'], gaze=p['gaze'],
            foot=P(foot), neck=P(j['neck']),
            head=P([j['neck'][0], j['neck'][1], j['neck'][2] + 0.17]),
            top=P([j['neck'][0], j['neck'][1], j['neck'][2] + 0.30]),
            hips=[P(l['hip']) for l in j['legs']], knees=[P(l['knee']) for l in j['legs']],
            ankles=[P(l['ankle']) for l in j['legs']],
            shoulders=[P(a['shoulder']) for a in j['arms']], elbows=[P(a['elbow']) for a in j['arms']],
            wrists=[P(a['wrist']) for a in j['arms']],
            # 1 m 竖线在这里有多长（px）：画法按它定比例
            m1=round(abs(P(foot)[1] - P([foot[0], foot[1], 1.0])[1]), 1),
        ))
    cats = []
    for c in d['cats']:
        base = [c['x'], c['y'], c['z']]
        cats.append(dict(k=c['k'], coat=c['coat'], pose=c['pose'], heading=c['heading'],
                         base=P(base), head=P(c['headPivot']),
                         m1=round(abs(P(base)[1] - P([base[0], base[1], base[2] + 1.0])[1]), 1)))
    json.dump(dict(name=cam.name, w=rx, h=ry, ortho=axon, people=people, cats=cats),
              open(os.path.join(OUT, k + '.json'), 'w'), ensure_ascii=False)
    sc.render.filepath = os.path.join(OUT, k + '.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', k, flush=True)
