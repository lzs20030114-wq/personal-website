"""线稿图版的「通道」：每个物体的编号、表面朝向、深度（2 倍分辨率、1 采样、不抗锯齿），可选一张照常渲染的底图。
排线、点画、描线都在 cafe_npr.py 里按这些通道画；人和猫不在这里（图版上另画），所以先隐去。

blender -b 项目二_单元建模/猫咖效果图.blend --python scripts/unit-blender/cafe_passes.py -- <输出目录> <机位 H4,S2,H2> <终稿宽> [底图采样数，0 = 不渲底图]

S2 是这里新建的剖透视：剖切线 y = 1.24（穿过 41 / 42 / 43 / 45 那一排落下来的单元），相机在 +y 那侧往 −y 看，
剖切线朝相机那侧的东西不画，跨在剖切线上的物体切掉朝相机那半（切的是副本）。
"""
import bpy, bmesh, json, math, os, sys
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
OUT, SHOTS, WIDTH = argv[0], argv[1].split(','), int(argv[2])
SAMPLES = int(argv[3]) if len(argv) > 3 else 0
SS = 2  # 通道按终稿的 2 倍出，线在 numpy 里画完再缩回来（等于抗锯齿）
os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene
SEC_Y = 1.24

# ---------------------------------------------------------------- 分类
CAT = dict(bg=0, floor=1, wall=2, frame=3, door=4, ceiling=5, light=6,
           sofa=10, sofa_leg=11, chair=12, chair_pad=13,
           shell=20, mech=21, plate=22, shell_up=23, mech_up=24, plate_up=25,
           prop=30, leaf=31, pot=32, soil=33, liquid=34)
SMALL = ('螺钉', '指示灯', '孔圈')


def category(ob):
    name = ob.name
    for c in ob.users_collection:
        cn = c.name
        if cn.startswith('单元'):
            if any(s in name for s in SMALL):
                return None
            down = '·' in cn
            if '天花方板' in name:
                return 'plate' if down else 'plate_up'
            if '外皮' in name:
                return 'shell' if down else 'shell_up'
            return 'mech' if down else 'mech_up'
        if cn == '家具':
            if name.startswith('沙发·脚'):
                return 'sofa_leg'
            if name.startswith('沙发'):
                return 'sofa'
            if name.startswith('餐椅·坐垫'):
                return 'chair_pad'
            return 'chair'
        if cn.startswith('房间'):
            if '玻璃' in name:
                return None
            if name == '地面':
                return 'floor'
            if '窗框' in name or '门框' in name:
                return 'frame'
            if name.startswith('门'):
                return 'door'
            if '线形灯' in name:
                return 'light'
            if '天花' in name:
                return 'ceiling'
            return 'wall'
        if cn == '布景·小物':
            for k, v in (('叶', 'leaf'), ('茎', 'leaf'), ('盆', 'pot'), ('土', 'soil'), ('咖啡', 'liquid'), ('水', 'liquid')):
                if name.startswith(k):
                    return v
            return 'prop'
        if cn in ('室外', '访客', '猫'):
            return None
    return None


objs = {}
serial = 0
for ob in bpy.data.objects:
    if ob.type != 'MESH':
        continue
    c = category(ob)
    if c is None:
        ob.hide_render = True
        continue
    serial += 1
    ob.pass_index = serial
    objs[ob.name] = (serial, c)
idmap = {str(i): CAT[c] for i, c in objs.values()}
# 单元编号（哪一个单元）：给图版标注用
unit_of = {}
for name, (i, c) in objs.items():
    ob = bpy.data.objects[name]
    for col in ob.users_collection:
        if col.name.startswith('单元'):
            unit_of[str(i)] = int(col.name[2:4])

for c in bpy.data.collections:
    if c.name in ('访客', '猫', '室外'):
        c.hide_render = True

cams = {o.name.split('·')[0]: o for o in bpy.data.objects if o.type == 'CAMERA'}
near_cut = [c for c in bpy.data.collections if '轴测图里隐去' in c.name]


def section_camera():
    name = 'S2·剖透视·y 1.24 往 −y 看'
    if name in bpy.data.objects:
        return bpy.data.objects[name]
    cd = bpy.data.cameras.new(name)
    cd.lens = 30
    cd.clip_start = 0.1
    cd.clip_end = 60
    ob = bpy.data.objects.new(name, cd)
    ob.location = (0, SEC_Y + 7.4, 1.82)
    ob.rotation_euler = (math.pi / 2, 0, math.pi)
    bpy.data.collections['灯光与机位'].objects.link(ob)
    return ob


def axo_zoom_camera(k):
    """A1：H4 同一个轴测角度，只框 y < 0 那半间房（四台落下的单元、两只猫、四个人）"""
    name = 'A1·轴测·半间房'
    if name in bpy.data.objects:
        return bpy.data.objects[name]
    src = cams['H4']
    cd = bpy.data.cameras.new(name)
    cd.type = 'ORTHO'
    cd.ortho_scale = 6.3
    cd.clip_start = 0.1
    cd.clip_end = 200
    ob = bpy.data.objects.new(name, cd)
    ob.rotation_euler = src.rotation_euler
    bpy.data.collections['灯光与机位'].objects.link(ob)
    bpy.context.view_layer.update()
    fwd = -(src.matrix_world.to_3x3() @ Vector((0, 0, 1)))
    target = Vector((-0.45, -1.5, 0.55))
    ob.location = target - fwd.normalized() * 40
    return ob


def section_prep(y0):
    """朝相机那侧（y > y0）整个在外的不画，跨线的切掉 y > y0 那半"""
    saved = []
    for name in objs:
        ob = bpy.data.objects[name]
        if ob.hide_render:
            continue
        bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
        ymin, ymax = min(v.y for v in bb), max(v.y for v in bb)
        saved.append((ob, ob.data, ob.hide_render))
        if ymin > y0:
            ob.hide_render = True
            continue
        if ymax <= y0:
            continue
        me = ob.data.copy()
        bm = bmesh.new()
        bm.from_mesh(me)
        mw = ob.matrix_world
        co = mw.inverted() @ Vector((0, y0, 0))
        no = (mw.to_3x3().transposed() @ Vector((0, 1, 0))).normalized()
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no, clear_outer=True)
        bm.to_mesh(me)
        bm.free()
        ob.data = me
    return saved


def restore(saved):
    for ob, data, hide in saved:
        if ob.data is not data:
            tmp = ob.data
            ob.data = data
            bpy.data.meshes.remove(tmp)
        ob.hide_render = hide


def load(path):
    im = bpy.data.images.load(path)
    w, h = im.size
    a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
    bpy.data.images.remove(im)
    return a


# 通道：一次渲染，File Output 节点把深度 / 法向 / 物体编号各存一张 EXR
vl = bpy.context.view_layer
vl.use_pass_z = True
vl.use_pass_normal = True
vl.use_pass_object_index = True


def pass_tree(prefix):
    sc.use_nodes = True
    tree = sc.node_tree
    for n in list(tree.nodes):
        tree.nodes.remove(n)
    rl = tree.nodes.new('CompositorNodeRLayers')
    comp = tree.nodes.new('CompositorNodeComposite')
    tree.links.new(rl.outputs['Image'], comp.inputs['Image'])
    fo = tree.nodes.new('CompositorNodeOutputFile')
    fo.base_path = OUT
    fo.format.file_format = 'OPEN_EXR'
    fo.format.color_depth = '32'
    fo.file_slots.clear()
    for k in ('Depth', 'Normal', 'IndexOB'):
        fo.file_slots.new(f'{prefix}_{k}_')
        tree.links.new(rl.outputs[k], fo.inputs[-1])
    sc.render.use_compositing = True


def plain_tree():
    sc.use_nodes = False


for k in SHOTS:
    cam = section_camera() if k == 'S2' else (axo_zoom_camera(k) if k == 'A1' else cams[k])
    sc.camera = cam
    axon = cam.data.type == 'ORTHO'
    for c in near_cut:
        c.hide_render = axon
    # 收着的单元：轴测图里不画（图版上只在地面标落脚格），透视与剖面里画
    for name, (i, c) in objs.items():
        if c in ('shell_up', 'mech_up', 'plate_up'):
            bpy.data.objects[name].hide_render = axon
    saved = section_prep(SEC_Y) if k == 'S2' else []
    rx = WIDTH; ry = int(round(WIDTH * (3 / 4 if axon else 9 / 16)))
    dg = bpy.context.evaluated_depsgraph_get()
    P = cam.calc_matrix_camera(dg, x=rx, y=ry, scale_x=1, scale_y=1)
    meta = dict(name=cam.name, w=rx, h=ry, ss=SS, ortho=axon, P=[list(r) for r in P],
                world=[list(r) for r in cam.matrix_world], M=[list(r) for r in (P @ cam.matrix_world.inverted())],
                ids=idmap, unit_of=unit_of, cat=CAT, sec_y=SEC_Y if k == 'S2' else None)
    json.dump(meta, open(os.path.join(OUT, f'{k}_cam.json'), 'w'), ensure_ascii=False)

    # 1) 通道
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 1
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 0
    sc.render.filter_size = 0.01
    sc.render.resolution_x, sc.render.resolution_y = rx * SS, ry * SS
    sc.render.resolution_percentage = 100
    pass_tree(k)
    sc.render.filepath = os.path.join(OUT, f'{k}_tmp.png')
    bpy.ops.render.render(write_still=True)
    for key, fn in (('Depth', 'z'), ('Normal', 'n'), ('IndexOB', 'idx')):
        exr = [f for f in os.listdir(OUT) if f.startswith(f'{k}_{key}_') and f.endswith('.exr')][0]
        a = load(os.path.join(OUT, exr))
        if fn == 'z':
            np.save(os.path.join(OUT, f'{k}_z.npy'), a[:, :, 0].astype(np.float32))
        elif fn == 'n':
            np.save(os.path.join(OUT, f'{k}_n.npy'), a[:, :, :3].astype(np.float16))
        else:
            np.save(os.path.join(OUT, f'{k}_idx.npy'), np.rint(a[:, :, 0]).astype(np.int32))
        os.remove(os.path.join(OUT, exr))
    print('PASSES', k, flush=True)

    # 2) 照常渲染的底图（单元的外皮按渲染保留时用）
    if SAMPLES:
        plain_tree()
        sc.cycles.samples = SAMPLES
        sc.cycles.use_denoising = True
        sc.cycles.max_bounces = 8
        sc.render.filter_size = 1.5
        sc.render.resolution_x, sc.render.resolution_y = rx, ry
        sc.render.image_settings.file_format = 'PNG'
        sc.render.filepath = os.path.join(OUT, f'{k}_beauty.png')
        bpy.ops.render.render(write_still=True)
        print('BEAUTY', k, flush=True)
    restore(saved)
