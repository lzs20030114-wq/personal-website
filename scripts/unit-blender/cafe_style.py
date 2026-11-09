"""Lab 2-15 效果图的图纸风（2026-11-09，作者「真实的场景营造出一种只是做了个家具的感觉……从线稿风、竞赛图纸那种感觉研究一套新的视觉语言，
更加风格化、信息有取舍」）。

    blender -b <猫咖效果图.blend> --python scripts/unit-blender/cafe_style.py -- <输出目录> <风格 line,clay,flat|all> <机位 H4,H1|all> [宽 1600]

不另建模型：打开 cafe_scene.py 搭好的那个 .blend（同一刻、同一套几何），只换「画法」——
  取舍：室外、玻璃、植物、螺钉 / 指示灯这类小件不画；材质、木纹、贴图一律不要。
  分层（同一套规则用在三种风格上）：
    主角 = 落下来的单元（外皮 + 夹环 + 吊杆）：项目二的紫（站上「颜色只表示项目」那一份，PROJECT_GROUPS 的 accent-2 = P700），线最粗；
    收在天花下的单元：同一个紫的浅档，细线，读成「还没被叫下来」；
    行为者 = 人和猫：台架那副方块人、方块猫，去掉五官以外的颜色，按风格画成白 / 灰 / 深色剪影；
    背景 = 房间、家具：只留轮廓与转折，细灰线。
  三种风格（底子不同，分层规则相同）：
    line = 纸上线稿（平涂纸色，全靠线）；
    clay = 白模（工作台引擎的棚拍光 + 太阳方向的投影 + 凹角加暗），单元浅紫；
    flat = 平涂色块（无光照，几档灰 + 紫），人是浅灰剪影、猫是深色剪影（先试过中灰的人，透视里压过了单元）。
渲染用工作台引擎（Workbench）+ Freestyle 描线：比 Cycles 快两个数量级。容器里没有显卡，要先装 Mesa 的 EGL（libegl1 libegl-mesa0 libgl1-mesa-dri）。
"""

import bpy
import math
import os
import sys
import time

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'style'
STYLES = argv[1] if len(argv) > 1 else 'all'
SHOTS = argv[2] if len(argv) > 2 else 'H4,H1'
WIDTH = int(argv[3]) if len(argv) > 3 else 1600
os.makedirs(OUT, exist_ok=True)


def lin(hexs):
    """#RRGGBB（sRGB）→ 场景线性 RGBA"""
    c = [int(hexs[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c) + (1.0,)


# 站上的 token（app/globals.css，OKLCH 换成 sRGB）
PAL = dict(
    paper='#F3F4ED', ink='#0F2125',
    n100='#EEF0EA', n200='#E0E2DD', n300='#C8CCC6', n400='#A0A7A1', n500='#76807B', n600='#5E6966', n700='#485252',
    p100='#F1EBFD', p200='#E1D8FC', p300='#C9BFF4', p400='#A197D9', p500='#786FB5', p600='#5E5A9A', p700='#46467D',
    white='#FFFFFF',
)

# ---------------------------------------------------------------- 分层：每个物体归到哪一层
SMALL = ('螺钉', '指示灯', '孔圈')
HIDE_PROPS = ('叶', '茎', '土', '盆')


def tier_of(ob):
    cols = [c.name for c in ob.users_collection]
    name = ob.name
    for c in cols:
        if c.startswith('单元'):
            if any(s in name for s in SMALL):
                return None
            down = '·' in c  # 落下来的那几台，集合名带着用途（table·sofa / cat·half …）
            if not down and '天花方板' in name:
                return 'unit.up.plate'
            part = 'shell' if '外皮' in name else 'mech'
            return f'unit.{"down" if down else "up"}.{part}'
        if c == '访客':
            return 'person'
        if c == '猫':
            return 'cat'
        if c == '家具':
            return 'furniture'
        if c.startswith('房间'):
            if '玻璃' in name:
                return None
            return 'room.ceiling' if '天花' in c else ('room.floor' if name == '地面' else 'room')
        if c == '布景·小物':
            if any(name.startswith(h) for h in HIDE_PROPS):
                return None
            return 'prop'
        if c == '室外':
            return None
    return 'other'


# 三种风格：每层的填色 + 线（粗细按 1600 px 宽给，别的宽度等比）
STYLE = {
    'line': dict(
        light='FLAT', shadow=False, cavity=False,
        fill={'unit.down.shell': 'p100', 'unit.down.mech': 'paper', 'unit.up.shell': 'paper', 'unit.up.mech': 'paper', 'unit.up.plate': 'paper',
              'person': 'paper', 'cat': 'paper', 'furniture': 'paper', 'room': 'paper', 'room.floor': 'paper',
              'room.ceiling': 'paper', 'prop': 'paper', 'other': 'paper'},
        lines={'units.down': ('p700', 1.7), 'units.up': ('p400', 0.7), 'actors': ('ink', 1.2), 'context': ('n500', 0.75)},
    ),
    'clay': dict(
        # 工作台自带的几种棚拍光里只有 paint.sl 能把白模打成白的（Default / basic / studio 偏灰，outdoor 偏青），曝光 +0.5
        light='STUDIO', studio='paint.sl', exposure=0.5, shadow=True, shadow_int=0.45, cavity=True,
        fill={'unit.down.shell': 'p200', 'unit.down.mech': 'n200', 'unit.up.shell': 'n100', 'unit.up.mech': 'n100', 'unit.up.plate': 'n100',
              'person': 'white', 'cat': 'white', 'furniture': 'n100', 'room': 'white', 'room.floor': 'n100',
              'room.ceiling': 'white', 'prop': 'white', 'other': 'white'},
        lines={'units.down': ('p600', 1.2), 'units.up': ('n400', 0.5), 'actors': ('n700', 0.8), 'context': ('n400', 0.5)},
    ),
    'flat': dict(
        light='FLAT', shadow=False, cavity=False,
        fill={'unit.down.shell': 'p300', 'unit.down.mech': 'p500', 'unit.up.shell': 'p100', 'unit.up.mech': 'p200', 'unit.up.plate': 'p100',
              'person': 'n300', 'cat': 'ink', 'furniture': 'n200', 'room': 'n100', 'room.floor': 'n200',
              'room.ceiling': 'n100', 'prop': 'n400', 'other': 'n200'},
        lines={'units.down': ('p700', 1.1), 'units.up': ('p300', 0.5), 'actors': ('n700', 0.7), 'context': ('n500', 0.5)},
    ),
}

GROUP = {  # 线的分组 → 哪些层
    'units.down': ('unit.down.shell', 'unit.down.mech'),
    'units.up': ('unit.up.shell', 'unit.up.mech', 'unit.up.plate'),
    'actors': ('person', 'cat', 'prop'),
    'context': ('furniture', 'room', 'room.floor', 'room.ceiling', 'other'),
}

sc = bpy.context.scene
vl = sc.view_layers[0]

# 线分组用的集合（物体可以同时属于几个集合，原来的集合结构不动）
tiers = {}
for ob in list(bpy.data.objects):
    if ob.type != 'MESH':
        continue
    t = tier_of(ob)
    if t is None:
        ob.hide_render = True
        continue
    tiers[ob.name] = t
    # 去掉倒角：Freestyle 认转折靠二面角，倒角把 90° 的角拆成几道 150° 的小角，线就没了
    for m in list(ob.modifiers):
        if m.type == 'BEVEL':
            ob.modifiers.remove(m)

ls_coll = {}
for g, members in GROUP.items():
    c = bpy.data.collections.new(f'描线·{g}')
    sc.collection.children.link(c)
    c.hide_render = False
    ls_coll[g] = c
    for name, t in tiers.items():
        if t in members:
            c.objects.link(bpy.data.objects[name])
# 描线用的集合只拿来选线，不要重复渲染：排除掉不行（排除后 Freestyle 也选不到），所以让它们只是额外的链接，渲染本来就只算一次

# 平涂的颜色走物体颜色（工作台引擎的 OBJECT 着色）
def paint(style):
    for name, t in tiers.items():
        bpy.data.objects[name].color = lin(PAL[STYLE[style]['fill'][t]])


def setup_lines(style):
    fs = vl.freestyle_settings
    for ls in list(fs.linesets):
        fs.linesets.remove(ls)
    fs.crease_angle = math.radians(140)
    fs.use_culling = False
    sc.render.use_freestyle = True
    sc.render.line_thickness_mode = 'ABSOLUTE'
    k = WIDTH / 1600
    for g, (col, w) in STYLE[style]['lines'].items():
        ls = fs.linesets.new(f'{style}·{g}')
        ls.select_by_visibility = True
        ls.visibility = 'VISIBLE'
        ls.select_by_edge_types = True
        ls.select_silhouette = True
        ls.select_border = True
        # 收在天花下的单元只描外轮廓（56 台的转折线全画出来会压过落下来的那几台）
        ls.select_crease = g != 'units.up'
        ls.select_material_boundary = False
        ls.select_by_collection = True
        ls.collection = ls_coll[g]
        st = ls.linestyle
        st.color = lin(PAL[col])[:3]
        st.thickness = w * k
        st.thickness_position = 'CENTER'
        st.caps = 'ROUND'
        st.chaining = 'PLAIN'
        st.use_same_object = True


def setup_engine(style):
    S = STYLE[style]
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.render_aa = '16'
    sh = sc.display.shading
    sh.light = S['light']
    if S['light'] == 'STUDIO':
        sh.studio_light = S.get('studio', 'Default')
    sh.color_type = 'OBJECT'
    sh.show_shadows = S['shadow']
    sh.shadow_intensity = S.get('shadow_int', 0.42)
    sh.show_cavity = S['cavity']
    sh.cavity_type = 'BOTH'
    sh.cavity_ridge_factor = 0.6
    sh.cavity_valley_factor = 1.0
    sh.curvature_ridge_factor = 0.4
    sh.curvature_valley_factor = 0.6
    sh.show_object_outline = False
    sh.show_specular_highlight = False
    # 投影方向 ≈ 场景里太阳照进来的方向
    sun = bpy.data.objects.get('太阳')
    if sun:
        d = sun.matrix_world.to_3x3() @ __import__('mathutils').Vector((0, 0, 1))
        sc.display.light_direction = (d.x, d.y, d.z)
    sc.display.shadow_shift = 0.05
    sc.display.shadow_focus = 0.6
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = S.get('exposure', 0.0)
    sc.view_settings.gamma = 1.0
    sc.render.film_transparent = False
    if sc.world is None:
        sc.world = bpy.data.worlds.new('纸')
    sc.world.color = lin(PAL['paper'])[:3]
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'


PLAN_CUT = 1.9  # 平面图的剖切高度（m）：比站着的人头顶高、比收在天花下的单元低


def plan_camera():
    """平面图：正上方往下看的正交机位，近裁剪面放在离地 PLAN_CUT 处 ⇒ 这个高度以上的东西（收着的单元、吊杆上半截、天花）全切掉"""
    name = 'P1·平面·剖切 1.9 m'
    if name in bpy.data.objects:
        return bpy.data.objects[name]
    room = max(abs(v) for ob in bpy.data.collections['房间'].objects if ob.type == 'MESH' and ob.name == '地面'
               for v in (ob.matrix_world @ __import__('mathutils').Vector(c) for c in ob.bound_box) for v in (v.x, v.y))
    cd = bpy.data.cameras.new(name)
    cd.type = 'ORTHO'
    # 4:3 横幅：房间两侧各留约 2 m 给标注栏，下面多留一截给图例（机位往 −y 挪 0.26 m，房间在画面里偏上）
    cd.ortho_scale = 2 * room + 4.2
    H = 10.0
    cd.clip_start = H - PLAN_CUT
    cd.clip_end = H + 1.0
    ob = bpy.data.objects.new(name, cd)
    ob.location = (0, -0.26, H)
    ob.rotation_euler = (0, 0, 0)
    bpy.data.collections['灯光与机位'].objects.link(ob)
    return ob


SEC_Y = 1.24  # 剖面的剖切线（世界 y，m）：穿过 41 / 42 / 43 / 45 那一排落下来的单元的中心（两层给猫 · 茶几 · 餐桌 · 茶几）


def section_camera():
    """剖面：从 −y 往 +y 看的正交机位（16:9）。剖切线前面的东西不画，跨在剖切线上的单元、墙、家具按剖切线切开"""
    name = 'S1·剖面·穿过 y = 1.24 那一排'
    if name in bpy.data.objects:
        return bpy.data.objects[name]
    cd = bpy.data.cameras.new(name)
    cd.type = 'ORTHO'
    # 地面线下面留出约 1.3 m 给用途名、比例尺和图例
    cd.ortho_scale = 10.4
    cd.clip_start = 0.1
    cd.clip_end = 40
    ob = bpy.data.objects.new(name, cd)
    ob.location = (0, -14.0, 1.55)
    ob.rotation_euler = (math.pi / 2, 0, 0)
    bpy.data.collections['灯光与机位'].objects.link(ob)
    return ob


def section_prep(y0):
    """剖切：整个在剖切线前面的物体不画；跨在剖切线上的单元 / 房间 / 家具用 bisect 切掉前半（切的是副本，渲完换回原网格）；
    人和猫不切（图纸里人是配景），身子中心在剖切线前面的不画。返回复原用的清单"""
    import bmesh
    from mathutils import Vector
    saved = []
    for name, t in tiers.items():
        ob = bpy.data.objects[name]
        if ob.hide_render:
            continue
        bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
        ymin, ymax = min(v.y for v in bb), max(v.y for v in bb)
        saved.append((ob, ob.data, ob.hide_render))
        if ymax < y0:
            ob.hide_render = True
            continue
        if ymin >= y0:
            continue
        if t in ('person', 'cat', 'prop'):
            # 人中心在剖切线前 0.15 m 以内的照画；猫小、又是这张图要看的，坐在被切开的那台里的也画（放宽到 0.4 m）
            if (ymin + ymax) / 2 < y0 - (0.4 if t == 'cat' else 0.15):
                ob.hide_render = True
            continue
        me = ob.data.copy()
        bm = bmesh.new()
        bm.from_mesh(me)
        mw = ob.matrix_world
        co = mw.inverted() @ Vector((0, y0, 0))
        no = (mw.to_3x3().transposed() @ Vector((0, 1, 0))).normalized()
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no, clear_inner=True)
        bm.to_mesh(me)
        bm.free()
        ob.data = me
    return saved


def section_restore(saved):
    for ob, data, hide in saved:
        if ob.data is not data:
            tmp = ob.data
            ob.data = data
            bpy.data.meshes.remove(tmp)
        ob.hide_render = hide


def save_camera(cam, path, extra=None):
    """机位的投影（给标注层用）：世界 → 像素 = 视口变换 × 投影矩阵 → NDC → 像素；平面 / 剖面另记剖切位置"""
    import json
    dg = bpy.context.evaluated_depsgraph_get()
    rx, ry = sc.render.resolution_x, sc.render.resolution_y
    P = cam.calc_matrix_camera(dg, x=rx, y=ry, scale_x=sc.render.pixel_aspect_x, scale_y=sc.render.pixel_aspect_y)
    Vw = cam.matrix_world.inverted()
    M = P @ Vw
    json.dump({'name': cam.name, 'w': rx, 'h': ry, 'ortho': cam.data.type == 'ORTHO',
               'M': [list(r) for r in M], **(extra or {})}, open(path, 'w'))


cams = {o.name.split('·')[0]: o for o in bpy.data.objects if o.type == 'CAMERA'}
cut = [c for c in bpy.data.collections if '轴测图里隐去' in c.name]
styles = list(STYLE) if STYLES == 'all' else STYLES.split(',')
shots = sorted(cams) if SHOTS == 'all' else SHOTS.split(',')
if 'P1' in shots:
    cams['P1'] = plan_camera()
if 'S1' in shots:
    cams['S1'] = section_camera()
for style in styles:
    paint(style)
    setup_lines(style)
    setup_engine(style)
    for k in shots:
        cam = cams[k]
        sc.camera = cam
        plan, section = k == 'P1', k == 'S1'
        axon = cam.data.type == 'ORTHO' and not section  # 从上往下看的两种：轴测、平面
        # 物体同时挂在描线集合上，只隐集合藏不住：近墙与天花逐个物体藏
        for c in cut:
            for ob in c.objects:
                if ob.name in tiers:
                    ob.hide_render = axon and not plan  # 平面图要四面墙（天花在剖切高度以上，本来就切掉）
        # 收在天花下的单元：从上往下看（轴测、平面）不画——整台画出来会浮在人和落下的单元上面，读不清；轴测把天花拿掉了，
        # 连天花方板都浮在半空，一并不画（落脚的格子由标注层画在地面上）；平面图在 1.9 m 剖切，本来就切掉。
        # 人眼高度的透视与剖面里才画整台：吊在头顶上方，是这个系统「随时可以落下来」的那一半
        for name, t in tiers.items():
            if t in ('unit.up.shell', 'unit.up.mech', 'unit.up.plate'):
                bpy.data.objects[name].hide_render = axon
        # 白模的投影只给从上往下看的两种图：透视里天花还在，整间房落在天花的影子里，一片灰褐；剖面里太阳从窗洞斜进来，墙上一块白楔子，读成别的东西
        sc.display.shading.show_shadows = STYLE[style]['shadow'] and axon
        # 白模的棚拍光也按图分：paint.sl 从上往下看是白的，但它的下半球偏红，透视里朝下的天花、朝侧面的墙一片粉褐；
        # 透视与剖面换 studio.sl（曝光 +0.9），墙白、天花浅灰
        if style == 'clay':
            sc.display.shading.studio_light = 'paint.sl' if axon else 'studio.sl'
            sc.view_settings.exposure = STYLE[style]['exposure'] if axon else 0.9
        saved = section_prep(SEC_Y) if section else None
        sc.render.resolution_x = WIDTH
        sc.render.resolution_y = int(WIDTH * (3 / 4 if axon else 9 / 16))
        sc.render.filepath = os.path.join(OUT, f'{style}·{cam.name}.png')
        t = time.time()
        bpy.ops.render.render(write_still=True)
        save_camera(cam, sc.render.filepath[:-4] + '.cam.json', {'planCut': PLAN_CUT} if plan else {'sectionY': SEC_Y} if section else None)
        if saved:
            section_restore(saved)
        print('RENDERED', sc.render.filepath, f'{time.time() - t:.1f}s', flush=True)
