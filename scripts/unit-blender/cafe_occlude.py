"""前景层：底图里挡在人和猫前面的那部分（带透明），叠在图版上画的人上面。

blender -b 项目二_单元建模/猫咖效果图.blend --python scripts/unit-blender/cafe_occlude.py -- <base 目录> <cafe.json> H4,H2,H1 1600
先渲深度（去掉人猫小物，1 采样），按每个人 / 猫最近一点的深度判断：
人身边一圈范围里，比他更近 10 cm 以上的表面算前景。
输出 <机位>_fg.npy（布尔遮罩）；再用 PIL 把底图按遮罩抠成带透明的图（项目二_单元建模.md §15.2）。
"""
import bpy, json, os, sys
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
OUT, JS, SHOTS, WIDTH = argv[0], argv[1], argv[2].split(','), int(argv[3])
d = json.load(open(JS))
sc = bpy.context.scene
for c in bpy.data.collections:
    if c.name in ('访客', '猫', '布景·小物'):
        c.hide_render = True
cams = {o.name.split('·')[0]: o for o in bpy.data.objects if o.type == 'CAMERA'}
cut = [c for c in bpy.data.collections if '轴测图里隐去' in c.name]

# 深度走合成器：Render Layers 的 Depth → Composite，存 32 位 EXR
bpy.context.view_layer.use_pass_z = True
sc.use_nodes = True
tree = sc.node_tree
for n in list(tree.nodes):
    tree.nodes.remove(n)
rl = tree.nodes.new('CompositorNodeRLayers')
comp = tree.nodes.new('CompositorNodeComposite')
tree.links.new(rl.outputs['Depth'], comp.inputs['Image'])
sc.render.use_compositing = True
sc.render.image_settings.file_format = 'OPEN_EXR'
sc.render.image_settings.color_depth = '32'
sc.cycles.samples = 1
sc.cycles.use_denoising = False
sc.render.filter_size = 0.01


def load(path):
    im = bpy.data.images.load(path)
    w, h = im.size
    a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
    bpy.data.images.remove(im)
    return a


for k in SHOTS:
    cam = cams[k]
    sc.camera = cam
    axon = cam.data.type == 'ORTHO'
    for c in cut:
        c.hide_render = axon
    rx = WIDTH; ry = int(WIDTH * (3 / 4 if axon else 9 / 16))
    sc.render.resolution_x, sc.render.resolution_y = rx, ry
    zp = os.path.join(OUT, k + '_z.exr')
    sc.render.filepath = zp
    bpy.ops.render.render(write_still=True)
    Z = load(zp)[:, :, 0]
    dg = bpy.context.evaluated_depsgraph_get()
    M = cam.calc_matrix_camera(dg, x=rx, y=ry, scale_x=1, scale_y=1) @ cam.matrix_world.inverted()
    V = cam.matrix_world.inverted()

    def scr(p):
        v = M @ Vector((p[0], p[1], p[2], 1.0))
        return (v.x / v.w * 0.5 + 0.5) * rx, (1 - (v.y / v.w * 0.5 + 0.5)) * ry

    def planar(p):
        return -(V @ Vector(p)).z

    def radial(p):
        return (V @ Vector(p)).length

    # 深度是平面距离还是到相机的直线距离：拿人脚下的地面点对一下
    errs = {'planar': [], 'radial': []}
    for p in d['people']:
        g = (p['x'], p['y'], 0.0)
        x, y = scr(g)
        if 0 <= int(x) < rx and 0 <= int(y) < ry:
            z = Z[int(y), int(x)]
            errs['planar'].append(abs(z - planar(g)))
            errs['radial'].append(abs(z - radial(g)))
    model = 'radial' if (not axon and np.median(errs['radial']) < np.median(errs['planar'])) else 'planar'
    dep = radial if model == 'radial' else planar
    print('DEPTH', k, model, {m: round(float(np.median(e)), 3) for m, e in errs.items() if e}, flush=True)

    fg = np.zeros((ry, rx), bool)
    yy, xx = np.mgrid[0:ry, 0:rx]

    def mark(pts3, m1, margin):
        sp = [scr(p) for p in pts3]
        near = min(dep(p) for p in pts3)
        xs = [s[0] for s in sp]; ys = [s[1] for s in sp]
        x0, x1 = min(xs) - 0.28 * m1, max(xs) + 0.28 * m1
        y0, y1 = min(ys) - 0.20 * m1, max(ys) + 0.14 * m1
        x0, y0 = max(int(x0), 0), max(int(y0), 0)
        x1, y1 = min(int(x1) + 1, rx), min(int(y1) + 1, ry)
        if x1 <= x0 or y1 <= y0:
            return
        sub = Z[y0:y1, x0:x1] < near - margin
        fg[y0:y1, x0:x1] |= sub

    def m1_at(p):
        a = scr(p); b = scr((p[0], p[1], p[2] + 1.0))
        return abs(a[1] - b[1])

    for p in d['people']:
        j = p['joints']
        pts = [j['neck'], (j['neck'][0], j['neck'][1], j['neck'][2] + 0.30), (p['x'], p['y'], 0.0)]
        for leg in j['legs']:
            pts += [leg['hip'], leg['knee'], leg['ankle']]
        for arm in j['arms']:
            pts += [arm['shoulder'], arm['elbow'], arm['wrist']]
        mark(pts, m1_at((p['x'], p['y'], 0.0)), 0.10)
    for c in d['cats']:
        import math
        hx, hy = math.cos(c['heading']), math.sin(c['heading'])
        b = (c['x'], c['y'], c['z'])
        pts = [b, tuple(c['headPivot'])]
        for s in (-0.22, 0.22):
            pts.append((b[0] + hx * s, b[1] + hy * s, b[2] + 0.12))
        for s in (-0.09, 0.09):
            pts.append((b[0] - hy * s, b[1] + hx * s, b[2] + 0.12))
        mark(pts, m1_at(b), 0.10)

    np.save(os.path.join(OUT, k + '_fg.npy'), fg)
    print('FG', k, int(fg.sum()), flush=True)
