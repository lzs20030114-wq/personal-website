"""项目二 · Lab 2-15 效果图的场景（2026-11-08）。

    blender -b --factory-startup --python scripts/unit-blender/cafe_scene.py -- <cafe.json> <out.blend>

输入 = cafe-export.mjs 导出的一刻（与台架同一套仿真跑到第 T 秒）。哪些是仿真给的、哪些是效果图的布景：
  仿真给的（逐位照搬）：64 台单元各在什么高度、成什么形（平台 / 当桌子 / 两层）、每条带取哪一帧、外皮的几何（台架同一套
    shellCoverVerts / shellGoreVerts）、上下夹环与芯的位置；家具的位置与朝向（人体工学那一套）；每个人的位置、姿态（坐 / 站 / 走）、
    坐姿的关节、看着哪只猫；猫的位置、朝向、头转、姿态、台上绕立杆弯的半径。
  布景（效果图加的，不是仿真的输出）：房间的窗、门、地板与灯；人画成风格化的模型小人（无五官、不画衣服，每人一种低饱和的单色，作者 11-08 定）；
    三个手势（摸茶几上的猫、举手机拍、拿逗猫棒逗有顶台里的猫，那只猫的头因此转向羽毛）；桌上的杯碟、植物、猫碗。
机构件（天花方板、上下夹环、伸缩吊杆、芯）与单元建模 A 镜头同一套（import build_scene），只换了材质。
"""

import bpy
import bmesh
import math
import mathutils
import os
import sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_scene as bs  # noqa: E402  模块顶层按 argv[0] 读入 cafe.json（meta 里有同样的尺寸量）
import cafe_figures as cf  # noqa: E402
import cafe_cats as cc  # noqa: E402

V = mathutils.Vector
D = bs.D
OUT = bs.OUT
HALF = D['meta']['roomM'] / 2
CEIL = D['meta']['ceiling']
PITCH = D['meta']['pitch']
srgb = bs.srgb
WALL_T = 0.2


# ---------------------------------------------------------------- 材质
def _nodes(m):
    m.use_nodes = True
    return m.node_tree, m.node_tree.nodes['Principled BSDF']


def _link(nt, a, b):
    nt.links.new(a, b)


def mat_oak():
    m = bpy.data.materials.new('地面·橡木地板')
    nt, p = _nodes(m)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Rotation'].default_value = (0, 0, math.pi / 2)
    _link(nt, tc.outputs['Object'], mp.inputs['Vector'])
    br = nt.nodes.new('ShaderNodeTexBrick')
    br.offset = 0.37
    br.offset_frequency = 1
    br.squash = 1.0
    br.inputs['Scale'].default_value = 1.0
    br.inputs['Brick Width'].default_value = 1.35
    br.inputs['Row Height'].default_value = 0.16
    br.inputs['Mortar Size'].default_value = 0.0015
    br.inputs['Mortar Smooth'].default_value = 0.3
    br.inputs['Bias'].default_value = 0.0
    br.inputs['Color1'].default_value = (*srgb((0.62, 0.47, 0.33)), 1)
    br.inputs['Color2'].default_value = (*srgb((0.55, 0.4, 0.27)), 1)
    br.inputs['Mortar'].default_value = (*srgb((0.3, 0.22, 0.15)), 1)
    _link(nt, mp.outputs['Vector'], br.inputs['Vector'])
    # 木纹：沿板长方向拉长的噪波
    mp2 = nt.nodes.new('ShaderNodeMapping')
    mp2.inputs['Scale'].default_value = (1.0, 28.0, 1.0)
    _link(nt, mp.outputs['Vector'], mp2.inputs['Vector'])
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 6.0
    nz.inputs['Detail'].default_value = 8.0
    nz.inputs['Distortion'].default_value = 0.6
    _link(nt, mp2.outputs['Vector'], nz.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 0.35
    _link(nt, br.outputs['Color'], mix.inputs['A'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.62, 0.55, 0.48, 1)
    ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    _link(nt, nz.outputs['Fac'], ramp.inputs['Fac'])
    _link(nt, ramp.outputs['Color'], mix.inputs['B'])
    _link(nt, mix.outputs['Result'], p.inputs['Base Color'])
    rr = nt.nodes.new('ShaderNodeMapRange')
    rr.inputs['To Min'].default_value = 0.28
    rr.inputs['To Max'].default_value = 0.45
    _link(nt, nz.outputs['Fac'], rr.inputs['Value'])
    _link(nt, rr.outputs['Result'], p.inputs['Roughness'])
    bp = nt.nodes.new('ShaderNodeBump')
    bp.inputs['Strength'].default_value = 0.25
    bp.inputs['Distance'].default_value = 0.002
    _link(nt, br.outputs['Fac'], bp.inputs['Height'])
    _link(nt, bp.outputs['Normal'], p.inputs['Normal'])
    p.inputs['Coat Weight'].default_value = 0.15
    p.inputs['Coat Roughness'].default_value = 0.2
    return m


def mat_plain(name, color, rough=0.6, bump=0.0, bump_scale=200.0, metal=0.0, sheen=0.0, coat=0.0, spec=0.5):
    m = bpy.data.materials.new(name)
    nt, p = _nodes(m)
    p.inputs['Base Color'].default_value = (*srgb(color), 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    p.inputs['Specular IOR Level'].default_value = spec
    if sheen:
        p.inputs['Sheen Weight'].default_value = sheen
        p.inputs['Sheen Roughness'].default_value = 0.45
    if coat:
        p.inputs['Coat Weight'].default_value = coat
        p.inputs['Coat Roughness'].default_value = 0.08
    if bump:
        tc = nt.nodes.new('ShaderNodeTexCoord')
        nz = nt.nodes.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = bump_scale
        nz.inputs['Detail'].default_value = 4.0
        bp = nt.nodes.new('ShaderNodeBump')
        bp.inputs['Strength'].default_value = bump
        bp.inputs['Distance'].default_value = 0.001
        _link(nt, tc.outputs['Object'], nz.inputs['Vector'])
        _link(nt, nz.outputs['Fac'], bp.inputs['Height'])
        _link(nt, bp.outputs['Normal'], p.inputs['Normal'])
    m.diffuse_color = (*srgb(color), 1)
    return m


def mat_textile(name, color, scale=1400.0, sheen=0.5, rough=0.82, strength=0.35):
    """织物：两组交叉的条纹波做出经纬向的细纹（凹凸），带绒光"""
    m = bpy.data.materials.new(name)
    nt, p = _nodes(m)
    p.inputs['Base Color'].default_value = (*srgb(color), 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Sheen Weight'].default_value = sheen
    p.inputs['Sheen Roughness'].default_value = 0.4
    tc = nt.nodes.new('ShaderNodeTexCoord')
    w1 = nt.nodes.new('ShaderNodeTexWave')
    w1.wave_type = 'BANDS'
    w1.bands_direction = 'X'
    w1.inputs['Scale'].default_value = scale
    w2 = nt.nodes.new('ShaderNodeTexWave')
    w2.wave_type = 'BANDS'
    w2.bands_direction = 'Z'
    w2.inputs['Scale'].default_value = scale
    for w in (w1, w2):
        w.inputs['Distortion'].default_value = 0.4
        _link(nt, tc.outputs['Object'], w.inputs['Vector'])
    ad = nt.nodes.new('ShaderNodeMath')
    ad.operation = 'MULTIPLY'
    _link(nt, w1.outputs['Fac'], ad.inputs[0])
    _link(nt, w2.outputs['Fac'], ad.inputs[1])
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 40.0
    _link(nt, tc.outputs['Object'], nz.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 0.12
    mix.inputs['A'].default_value = (*srgb(color), 1)
    _link(nt, nz.outputs['Color'], mix.inputs['B'])
    _link(nt, mix.outputs['Result'], p.inputs['Base Color'])
    bp = nt.nodes.new('ShaderNodeBump')
    bp.inputs['Strength'].default_value = strength
    bp.inputs['Distance'].default_value = 0.0006
    _link(nt, ad.outputs['Value'], bp.inputs['Height'])
    _link(nt, bp.outputs['Normal'], p.inputs['Normal'])
    m.diffuse_color = (*srgb(color), 1)
    return m


def mat_glass():
    """窗玻璃：阴影光线直接穿过（否则日光进不了屋），相机看到的是薄玻璃的反射"""
    m = bpy.data.materials.new('窗·玻璃')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    lp = nt.nodes.new('ShaderNodeLightPath')
    gl = nt.nodes.new('ShaderNodeBsdfGlass')
    gl.inputs['Roughness'].default_value = 0.0
    gl.inputs['IOR'].default_value = 1.05
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    tr.inputs['Color'].default_value = (0.95, 0.97, 0.97, 1)
    mx = nt.nodes.new('ShaderNodeMixShader')
    add = nt.nodes.new('ShaderNodeMath')
    add.operation = 'MAXIMUM'
    _link(nt, lp.outputs['Is Shadow Ray'], add.inputs[0])
    _link(nt, lp.outputs['Is Diffuse Ray'], add.inputs[1])
    _link(nt, add.outputs['Value'], mx.inputs['Fac'])
    _link(nt, gl.outputs[0], mx.inputs[1])
    _link(nt, tr.outputs[0], mx.inputs[2])
    _link(nt, mx.outputs[0], nt.nodes['Material Output'].inputs[0])
    return m


def mat_emit(name, color, k):
    m = bpy.data.materials.new(name)
    nt, p = _nodes(m)
    p.inputs['Base Color'].default_value = (*srgb(color), 1)
    p.inputs['Emission Color'].default_value = (*srgb(color), 1)
    p.inputs['Emission Strength'].default_value = k
    return m


def materials():
    M = bs.materials()
    M.update(
        floor=mat_oak(),
        plaster=mat_plain('墙·暖白涂料', (0.86, 0.84, 0.8), rough=0.92, bump=0.05, bump_scale=300),
        ceil=mat_plain('天花·浅灰', (0.8, 0.79, 0.76), rough=0.95, bump=0.04, bump_scale=200),
        frame=mat_plain('窗框·古铜', (0.13, 0.115, 0.1), rough=0.35, metal=0.85),
        glass=mat_glass(),
        skirt=mat_plain('踢脚', (0.2, 0.19, 0.18), rough=0.5),
        door=mat_plain('门·胡桃木', (0.34, 0.23, 0.15), rough=0.45, bump=0.08, bump_scale=60),
        shell=mat_textile('单元·外皮', (0.74, 0.695, 0.625), scale=900, sheen=0.3, rough=0.7, strength=0.25),
        seam=mat_textile('单元·接缝', (0.64, 0.6, 0.54), scale=900, sheen=0.3, rough=0.72, strength=0.25),
        plate=mat_plain('天花方板·阳极铝', (0.72, 0.72, 0.7), rough=0.38, metal=0.7),
        sofa_a=mat_textile('沙发·燕麦色', (0.78, 0.73, 0.65), scale=500, sheen=0.6, strength=0.5),
        sofa_b=mat_textile('沙发·鼠尾草绿', (0.53, 0.58, 0.5), scale=500, sheen=0.6, strength=0.5),
        pillow_a=mat_textile('靠垫·赭', (0.72, 0.45, 0.28), scale=600, sheen=0.6),
        pillow_b=mat_textile('靠垫·芥黄', (0.82, 0.66, 0.32), scale=600, sheen=0.6),
        pillow_c=mat_textile('靠垫·米白', (0.9, 0.87, 0.8), scale=600, sheen=0.6),
        wood=mat_plain('木·胡桃', (0.36, 0.24, 0.16), rough=0.42, bump=0.06, bump_scale=80, coat=0.1),
        leg=mat_plain('沙发脚·深木', (0.16, 0.11, 0.08), rough=0.4),
        seat=mat_textile('椅垫·陶土', (0.66, 0.42, 0.32), scale=600, sheen=0.5),
        ceramic=mat_plain('陶瓷·白釉', (0.93, 0.92, 0.88), rough=0.12, coat=0.6),
        ceramic2=mat_plain('陶瓷·灰蓝釉', (0.46, 0.56, 0.62), rough=0.15, coat=0.6),
        coffee=mat_plain('咖啡', (0.12, 0.06, 0.03), rough=0.08),
        pot=mat_plain('花盆·陶', (0.68, 0.45, 0.33), rough=0.75, bump=0.1, bump_scale=60),
        pot2=mat_plain('花盆·水泥', (0.6, 0.6, 0.58), rough=0.85, bump=0.15, bump_scale=90),
        leaf=mat_plain('叶', (0.17, 0.3, 0.14), rough=0.45, sheen=0.2),
        leaf2=mat_plain('叶·浅', (0.3, 0.42, 0.2), rough=0.45, sheen=0.2),
        soil=mat_plain('土', (0.12, 0.09, 0.07), rough=0.95),
        steel_bowl=mat_plain('碗·不锈钢', (0.8, 0.8, 0.8), rough=0.18, metal=1.0),
        water=mat_plain('水', (0.7, 0.8, 0.85), rough=0.02, spec=0.6),
        toy=mat_plain('玩具·粉', (0.9, 0.45, 0.5), rough=0.6),
        toy2=mat_plain('玩具·蓝', (0.35, 0.5, 0.75), rough=0.6),
        stick=mat_plain('逗猫棒', (0.85, 0.82, 0.75), rough=0.4),
        feather=mat_plain('羽毛', (0.92, 0.5, 0.35), rough=0.7, sheen=0.8),
        string=mat_plain('线', (0.9, 0.9, 0.88), rough=0.6),
        strip=mat_emit('天花·线形灯', (1.0, 0.86, 0.68), 6.0),
        ground=mat_plain('室外·铺地', (0.55, 0.54, 0.52), rough=0.9, bump=0.1, bump_scale=8),
        tree=mat_plain('室外·树冠', (0.2, 0.32, 0.14), rough=0.8),
        trunk=mat_plain('室外·树干', (0.25, 0.2, 0.16), rough=0.8),
        facade=mat_plain('室外·对面楼', (0.78, 0.74, 0.68), rough=0.9),
        phone=mat_plain('手机', (0.05, 0.05, 0.06), rough=0.15, coat=0.8),
    )
    dk = M['dark'].node_tree.nodes['Principled BSDF']
    dk.inputs['Base Color'].default_value = (*srgb((0.3, 0.31, 0.32)), 1)
    # 机构件换成白天室内看得舒服的明度（单元建模 A 镜头是深色背景，这里是明亮的咖啡馆）
    M['ceiling'] = M['plate']
    led = M['led'].node_tree.nodes['Principled BSDF']
    led.inputs['Emission Color'].default_value = (*srgb((1.0, 0.92, 0.8)), 1)
    led.inputs['Base Color'].default_value = (*srgb((1.0, 0.92, 0.8)), 1)
    led.inputs['Emission Strength'].default_value = 3.0
    return M


# ---------------------------------------------------------------- 小工具
def box(bm, x0, x1, y0, y1, z0, z1):
    bs.bm_box(bm, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, abs(x1 - x0) / 2, abs(y1 - y0) / 2, abs(z1 - z0) / 2)


def obj(name, bm, coll, mat, smooth=False, bevel=0.0, segs=2, sub=0):
    ob = bs.bm_obj(name, bm, coll, mat, smooth=smooth, bevel=0.0)
    if bevel > 0:
        md = ob.modifiers.new('倒角', 'BEVEL')
        md.width = bevel
        md.segments = segs
        md.limit_method = 'ANGLE'
        md.angle_limit = math.radians(30)
    if sub:
        md = ob.modifiers.new('细分', 'SUBSURF')
        md.levels = 1
        md.render_levels = sub
    return ob


def rounded(name, center, half, coll, mat, r=0.03, sub=2, rot=0.0):
    """软的块（坐垫、靠垫）：方块 + 倒角 + 细分"""
    bm = bmesh.new()
    bs.bm_box(bm, center[0], center[1], center[2], half[0], half[1], half[2], rot=rot)
    ob = bs.bm_obj(name, bm, coll, mat, smooth=True)
    md = ob.modifiers.new('倒角', 'BEVEL')
    md.width = r
    md.segments = 3
    md = ob.modifiers.new('细分', 'SUBSURF')
    md.levels = 1
    md.render_levels = sub
    return ob


# ---------------------------------------------------------------- 房间
def wall_x(bm_wall, bm_frame, bm_glass, x, openings):
    """沿 y 的一面墙（墙心在 x）：openings = [(s0, s1, z0, z1, 'window'|'door')]，在墙上挖洞（剩下的墙段拼起来）"""
    _wall(bm_wall, bm_frame, bm_glass, openings, lambda s0, s1, z0, z1, t0, t1: box(bm_wall, x + t0, x + t1, s0, s1, z0, z1),
          lambda s0, s1, z0, z1, t0, t1, bmx: box(bmx, x + t0, x + t1, s0, s1, z0, z1))


def wall_y(bm_wall, bm_frame, bm_glass, y, openings):
    _wall(bm_wall, bm_frame, bm_glass, openings, lambda s0, s1, z0, z1, t0, t1: box(bm_wall, s0, s1, y + t0, y + t1, z0, z1),
          lambda s0, s1, z0, z1, t0, t1, bmx: box(bmx, s0, s1, y + t0, y + t1, z0, z1))


def _wall(bm_wall, bm_frame, bm_glass, openings, put, put2):
    L = HALF + WALL_T
    t0, t1 = -WALL_T / 2, WALL_T / 2
    H = CEIL + 0.12
    ops = sorted(openings)
    s = -L
    for (a, b, z0, z1, kind) in ops:
        if a > s:
            put(s, a, 0, H, t0, t1)
        if z0 > 0:
            put(a, b, 0, z0, t0, t1)
        put(a, b, z1, H, t0, t1)
        # 窗框：一圈 5 cm 的框 + 竖梃（每 0.9 m 一道）+ 一道横档
        fw, fd = 0.05, 0.08
        put2(a, a + fw, z0, z1, -fd / 2, fd / 2, bm_frame)
        put2(b - fw, b, z0, z1, -fd / 2, fd / 2, bm_frame)
        put2(a, b, z0, z0 + fw, -fd / 2, fd / 2, bm_frame)
        put2(a, b, z1 - fw, z1, -fd / 2, fd / 2, bm_frame)
        if kind == 'window':
            n = max(1, round((b - a) / 0.9))
            for k in range(1, n):
                m = a + (b - a) * k / n
                put2(m - 0.02, m + 0.02, z0, z1, -fd / 2, fd / 2, bm_frame)
            zt = z0 + (z1 - z0) * 0.78
            put2(a, b, zt - 0.02, zt + 0.02, -fd / 2, fd / 2, bm_frame)
            put2(a, b, z0 - 0.04, z0, -WALL_T / 2 - 0.03, WALL_T / 2 + 0.03, bm_frame)     # 窗台
        else:
            put2(a + (b - a) / 2 - 0.02, a + (b - a) / 2 + 0.02, z0, z1, -fd / 2, fd / 2, bm_frame)
            put2(a, b, 1.05 - 0.02, 1.05 + 0.02, -fd / 2, fd / 2, bm_frame)
        put2(a, b, z0, z1, -0.004, 0.004, bm_glass)
        s = b
    if s < L:
        put(s, L, 0, H, t0, t1)


def build_room(top, M):
    room = bs.new_coll('房间', top)
    near = bs.new_coll('房间·近墙（轴测图里隐去）', top)
    ceil_c = bs.new_coll('房间·天花（轴测图里隐去）', top)
    out = bs.new_coll('室外', top)
    bm = bmesh.new()
    box(bm, -HALF - WALL_T, HALF + WALL_T, -HALF - WALL_T, HALF + WALL_T, -0.05, 0.0)
    fl = obj('地面', bm, room, M['floor'])
    # 地板的贴图坐标按物体系：地面物体原点在房间中心
    # −Y 墙：三扇落地大窗（窗台 0.45 m）
    win = [(-2.95, -1.05, 0.45, 3.25, 'window'), (-0.95, 0.95, 0.45, 3.25, 'window'), (1.05, 2.95, 0.45, 3.25, 'window')]
    bw, bf, bg = bmesh.new(), bmesh.new(), bmesh.new()
    wall_y(bw, bf, bg, -HALF - WALL_T / 2, win)
    # −X 墙：门（玻璃门）在 y = 0，两侧各一扇窗
    door = [(-2.9, -1.0, 0.45, 3.25, 'window'), (-0.55, 0.55, 0.0, 2.35, 'door'), (1.0, 2.9, 0.45, 3.25, 'window')]
    wall_x(bw, bf, bg, -HALF - WALL_T / 2, door)
    obj('墙·窗墙', bw, room, M['plaster'])
    obj('窗框', bf, room, M['frame'], bevel=0.003)
    obj('窗玻璃', bg, room, M['glass'])
    # 近处两面墙（+X 有门、+Y 实墙）
    bw, bf, bg = bmesh.new(), bmesh.new(), bmesh.new()
    wall_x(bw, bf, bg, HALF + WALL_T / 2, [(-0.55, 0.55, 0.0, 2.35, 'door')])
    wall_y(bw, bf, bg, HALF + WALL_T / 2, [])
    obj('墙·近墙', bw, near, M['plaster'])
    obj('门框', bf, near, M['frame'], bevel=0.003)
    bmd = bmesh.new()
    box(bmd, HALF - 0.01, HALF + 0.03, -0.53, 0.53, 0.0, 2.33)
    obj('门·胡桃木', bmd, near, M['door'], bevel=0.004)
    # 踢脚线
    bm = bmesh.new()
    for (x0, x1, y0, y1) in ((-HALF, HALF, -HALF, -HALF + 0.012), (-HALF, -HALF + 0.012, -HALF, HALF)):
        box(bm, x0, x1, y0, y1, 0.0, 0.08)
    obj('踢脚线', bm, room, M['skirt'])
    bm = bmesh.new()
    for (x0, x1, y0, y1) in ((-HALF, HALF, HALF - 0.012, HALF), (HALF - 0.012, HALF, -HALF, HALF)):
        box(bm, x0, x1, y0, y1, 0.0, 0.08)
    obj('踢脚线·近', bm, near, M['skirt'])
    # 天花板（下表面在 CEIL，单元的天花方板贴在它下面）+ 格缝里的线形灯（沿 y，每两列之间一道）
    bm = bmesh.new()
    box(bm, -HALF - WALL_T, HALF + WALL_T, -HALF - WALL_T, HALF + WALL_T, CEIL, CEIL + 0.14)
    obj('天花板', bm, ceil_c, M['ceil'])
    bm = bmesh.new()
    for k in range(1, 8):
        if k % 2:
            continue
        x = -HALF + k * PITCH
        box(bm, x - 0.012, x + 0.012, -HALF + 0.3, HALF - 0.3, CEIL - 0.004, CEIL)
    obj('天花·线形灯', bm, ceil_c, M['strip'])
    # 室外：地坪、对面一排矮楼与几棵树（只为窗外不空）
    bm = bmesh.new()
    box(bm, -40, 40, -40, 40, -0.12, -0.06)
    obj('室外·地坪', bm, out, M['ground'])
    bm = bmesh.new()
    box(bm, -30, 30, -44, -36, 0, 7)
    box(bm, -50, -40, -30, 30, 0, 7)
    obj('室外·对面的楼', bm, out, M['facade'])
    return room, near, ceil_c, out


# ---------------------------------------------------------------- 家具
def furniture(top, M):
    coll = bs.new_coll('家具', top)
    pillows = [M['pillow_a'], M['pillow_b'], M['pillow_c']]
    for f in D['furniture']:
        fx, fy = f['face']
        facesY = abs(fy) > abs(fx)
        w = (f['x1'] - f['x0']) if facesY else (f['y1'] - f['y0'])
        d = (f['y1'] - f['y0']) if facesY else (f['x1'] - f['x0'])
        tx, ty = -fy, fx                       # 宽向
        def P(u, v, z):
            """家具局部（u 沿宽从一侧量、v 从靠背边往前、z 离地）→ 世界"""
            uc, vc = u - w / 2, v - d / 2
            return (f['cx'] + tx * uc + fx * vc, f['cy'] + ty * uc + fy * vc, z)
        yaw = math.atan2(fy, fx) - math.pi / 2
        def blk(name, u0, u1, v0, v1, z0, z1, mat, r=0.02, soft=False, tilt=0.0):
            c = P((u0 + u1) / 2, (v0 + v1) / 2, (z0 + z1) / 2)
            half = ((u1 - u0) / 2, (v1 - v0) / 2, (z1 - z0) / 2)
            bm = bmesh.new()
            bs.bm_box(bm, 0, 0, 0, *half)
            if tilt:
                bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=mathutils.Matrix.Rotation(tilt, 3, 'X'))
            bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=mathutils.Matrix.Rotation(yaw, 3, 'Z'))
            bmesh.ops.translate(bm, verts=bm.verts, vec=c)
            ob = bs.bm_obj(name, bm, coll, mat, smooth=soft)
            md = ob.modifiers.new('倒角', 'BEVEL')
            md.width = r
            md.segments = 3 if soft else 2
            if soft:
                s = ob.modifiers.new('细分', 'SUBSURF')
                s.levels = 1
                s.render_levels = 2
            return ob
        if f['kind'] == 'sofa':
            S = {'seatH': 0.43, 'cushionT': 0.13, 'backT': 0.2, 'backH': 0.8, 'armW': 0.12, 'armH': 0.62, 'kick': 0.05}
            mat = M['sofa_a'] if fy > 0 else M['sofa_b']
            leg_h = 0.06
            base_top = S['seatH'] - S['cushionT']
            blk('沙发·底座', S['armW'], w - S['armW'], S['backT'] - 0.02, d - S['kick'], leg_h, base_top, mat, r=0.015)
            blk('沙发·靠背框', 0.0, w, 0.0, S['backT'], leg_h, S['backH'] - 0.12, mat, r=0.03)
            for side in (0, 1):
                u0 = 0.0 if side == 0 else w - S['armW']
                blk('沙发·扶手', u0, u0 + S['armW'], 0.0, d, leg_h, S['armH'], mat, r=0.035, soft=True)
            half_w = (w - 2 * S['armW']) / 2
            for k in range(2):
                u0 = S['armW'] + k * half_w
                blk('沙发·坐垫', u0 + 0.004, u0 + half_w - 0.004, S['backT'] - 0.02, d + 0.01, base_top, S['seatH'] + 0.01, mat, r=0.045, soft=True)
                blk('沙发·靠垫', u0 + 0.006, u0 + half_w - 0.006, 0.03, S['backT'] + 0.06, S['seatH'] - 0.02, S['backH'] + 0.02, mat, r=0.05, soft=True, tilt=-0.12)
            # 抱枕：靠在扶手边
            for k, u in enumerate((S['armW'] + 0.14, w - S['armW'] - 0.14)):
                pm = pillows[(f['i'] + k) % 3]
                blk('沙发·抱枕', u - 0.2, u + 0.2, S['backT'] + 0.04, S['backT'] + 0.16, S['seatH'] + 0.02, S['seatH'] + 0.4, pm, r=0.06, soft=True, tilt=-0.3)
            bm = bmesh.new()
            for u in (0.06, w - 0.06):
                for v in (0.06, d - 0.06):
                    c = P(u, v, 0)
                    bs.bm_cyl(bm, 0.02, leg_h, 0.0, segs=16, x=c[0], y=c[1], r2=0.016)
            obj('沙发·脚', bm, coll, M['leg'], smooth=True)
        else:
            C = {'seatH': 0.45, 'seatT': 0.05, 'backT': 0.04, 'backH': 0.85, 'legW': 0.04, 'legIn': 0.02}
            under = C['seatH'] - C['seatT']
            bm = bmesh.new()
            for u in (C['legIn'] + 0.02, w - C['legIn'] - 0.02):
                for v in (C['legIn'] + 0.02, d - C['legIn'] - 0.02):
                    c = P(u, v, 0)
                    bs.bm_cyl(bm, 0.017, under, 0.0, segs=14, x=c[0], y=c[1], r2=0.014)
            for u in (C['legIn'] + 0.02, w - C['legIn'] - 0.02):
                c = P(u, 0.03, 0)
                bs.bm_cyl(bm, 0.014, C['backH'] - under, under, segs=14, x=c[0], y=c[1])
            obj('餐椅·腿', bm, coll, M['wood'], smooth=True)
            blk('餐椅·座板', 0.0, w, 0.0, d, under, under + 0.02, M['wood'], r=0.008)
            blk('餐椅·坐垫', 0.02, w - 0.02, 0.04, d - 0.02, under + 0.02, C['seatH'] + 0.012, M['seat'], r=0.02, soft=True)
            blk('餐椅·靠背', 0.0, w, 0.005, 0.03, C['backH'] - 0.2, C['backH'], M['wood'], r=0.008, tilt=-0.08)
    return coll


# ---------------------------------------------------------------- 单元
def shell_mesh(name, u, coll, M):
    """外皮：盖片与接缝片（台架同一套几何，世界坐标）焊成一张面，薄薄加厚"""
    vs, fs, mi = [], [], []
    for part, k in (('cover', 0), ('gore', 1)):
        v = np.asarray(u[part], dtype=np.float64).reshape(-1, 3)
        idx = np.asarray(u[part + 'Idx'], dtype=np.int64).reshape(-1, 3)
        base = sum(len(x) for x in vs)
        vs.append(v)
        fs.append(idx + base)
        mi.append(np.full(len(idx), k))
    V_ = np.concatenate(vs)
    F_ = np.concatenate(fs)
    MI = np.concatenate(mi)
    me = bpy.data.meshes.new(name)
    me.from_pydata(V_.tolist(), [], F_.tolist())
    me.materials.append(M['shell'])
    me.materials.append(M['seam'])
    me.polygons.foreach_set('material_index', MI.astype(np.int32))
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0006)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), dtype=bool))
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    so = ob.modifiers.new('厚度', 'SOLIDIFY')
    so.thickness = 0.0025
    so.offset = 0.0
    ob.modifiers.new('按角度平滑', 'WEIGHTED_NORMAL')
    try:
        bpy.context.view_layer.objects.active = ob
        with bpy.context.temp_override(object=ob, active_object=ob, selected_editable_objects=[ob]):
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(38))
    except Exception:
        pass
    return ob


def clone(ob, coll, parent=None):
    c = ob.copy()
    coll.objects.link(c)
    c.parent = parent
    for ch in ob.children:
        clone(ch, coll, c)
    return c


def build_units(top, M):
    tmpl = bs.new_coll('模板', top)
    plate_t = bs.build_plate(tmpl, M)
    carr_t = bs.build_carriage(tmpl, M, bs.CLAMP_N)
    foot_t = bs.build_foot(tmpl, M, bs.CLAMP_N)
    cache = {}

    def stage_t(d, L, mk, collar):
        key = (round(d, 4), L, mk, collar)
        if key not in cache:
            cache[key] = bs.build_stage(tmpl, M, f'节·{key}', d, L, M[mk], collar=collar)
        return cache[key]
    plate_bot = CEIL - bs.PLATE_T
    a0 = math.pi / D['meta']['bandCount']
    root = bs.new_coll('单元', top)

    def seen(ob, x, y, bottom, L):
        vis = min(L, plate_bot - bottom)
        if vis <= 0.006:
            for ch in list(ob.children):
                bpy.data.objects.remove(ch)
            bpy.data.objects.remove(ob)
            return
        ob.location = (x, y, bottom)
        ob.scale = (1.0, 1.0, vis / L)
    for u in D['units']:
        tag = f"单元{u['i']:02d}"
        if u['role']:
            tag += '·' + u['role'].replace(':', '·')
        uc = bs.new_coll(tag, root)
        x, y = u['x'], u['y']
        for ob in plate_t:
            c = clone(ob, uc)
            c.location = (x, y, 0.0)
        shell_mesh(f'{tag}·外皮', u, uc, M)
        cz, fz = u['carriage'], u['foot']
        for ob in carr_t:
            c = clone(ob, uc)
            c.location = (x, y, cz)
            c.rotation_euler = (0, 0, a0)
        for ob in foot_t:
            c = clone(ob, uc)
            c.location = (x, y, fz)
            c.rotation_euler = (0, 0, a0)
        E = plate_bot - (cz + bs.RING_TOP + bs.HUB['fh'])
        nh = bs.HANGER['n']
        for k in range(1, nh):
            d = bs.HANGER['d0'] - k * bs.HANGER['dd']
            seen(clone(stage_t(d, bs.HANGER['L'], 'alu', True), uc), x, y, plate_bot - E * k / (nh - 1), bs.HANGER['L'])
        carr_bot = cz + bs.RING_TOP - bs.HUB['h']
        foot_top = fz - 0.008 + bs.HUB['h']
        Lc = max(0.0, carr_bot - foot_top)
        nc = max(2, int(math.ceil(Lc / (bs.CORE['L'] - 0.05))) + 1)
        for k in range(nc):
            d = bs.CORE['d0'] - k * (bs.CORE['d0'] - 0.016) / max(1, nc - 1)
            seen(clone(stage_t(d, bs.CORE['L'], 'dark' if k % 2 else 'alu', k > 0), uc), x, y, carr_bot - Lc * k / (nc - 1), bs.CORE['L'])
    for ob in list(tmpl.objects):
        bpy.data.objects.remove(ob)
    bpy.data.collections.remove(tmpl)
    return root


# ---------------------------------------------------------------- 人、猫与手势（布景）
def cat_head(c):
    """猫头大概在哪（世界，米）：手势与视线对着它"""
    h = c['heading']
    lift = {'sit': 0.31, 'stand': 0.27, 'walk': 0.27, 'lie': 0.19, 'curl': 0.08}[c['pose']]
    fwd = {'sit': 0.06, 'stand': 0.19, 'walk': 0.19, 'lie': 0.17, 'curl': 0.05}[c['pose']]
    return V((c['x'] + math.cos(h) * fwd, c['y'] + math.sin(h) * fwd, c['z'] + lift))


GESTURES = {}


def stage_gestures():
    """手势（布景，见头注），按这一刻谁在看哪只猫、离多近自动挑人：
      摸：坐着、正看着一只在沙发前茶几上（台面 < 0.6 m）的猫、1.3 m 内的人，伸手到猫头前上方；
      拍：站着、离一只台上的猫 1.4 m 内的人，双手把手机举在胸前对着猫；
      逗：正看着一只在两层台（下台 0.9 m）里的猫、2.2 m 内的人（坐着的优先），拿逗猫棒，羽毛垂在猫眼前，那只猫的头转向羽毛。
    每只猫只给一个手势，每个人只做一件事。"""
    cats = D['cats']
    people = D['people']
    used_p, used_c = set(), set()
    out = {}

    def dist(p, c):
        return math.hypot(p['x'] - c['x'], p['y'] - c['y'])

    def right_of(p):
        h = p['heading']
        return V((math.sin(h), -math.cos(h), 0))
    # 摸
    for ci, c in enumerate(cats):
        if not c['onPlatform'] or c['z'] > 0.6:
            continue
        cand = [p for p in people if p['pose'] == 'sit' and p['watchCat'] == ci and dist(p, c) < 1.3 and p['k'] not in used_p]
        if not cand:
            continue
        p = min(cand, key=lambda p: dist(p, c))
        hd = cat_head(c)
        to_p = V((p['x'] - hd.x, p['y'] - hd.y, 0)).normalized()
        wrist = hd + to_p * 0.07 + V((0, 0, 0.03))
        right = right_of(p)
        side = 'R' if V((c['x'] - p['x'], c['y'] - p['y'], 0)).dot(right) > 0 else 'L'
        elbow = V((p['x'], p['y'], 0.6)) + (hd - V((p['x'], p['y'], 0))) * 0.4 + right * (0.2 if side == 'R' else -0.2)
        hand = (hd - wrist).normalized() + V((0, 0, -0.7))
        out[p['k']] = {f'wrist.{side}': tuple(wrist), f'elbow.{side}': tuple(elbow), f'hand.{side}': tuple(hand), 'kind': 'pet', 'cat': ci}
        used_p.add(p['k'])
        used_c.add(ci)
    # 拍
    for ci, c in enumerate(cats):
        if not c['onPlatform']:
            continue
        cand = [p for p in people if p['pose'] == 'stand' and dist(p, c) < 1.4 and p['k'] not in used_p]
        if not cand:
            continue
        p = min(cand, key=lambda p: dist(p, c))
        hd = cat_head(c)
        base = V((p['x'], p['y'], 0))
        d = V((hd.x - p['x'], hd.y - p['y'], 0)).normalized()
        right = V((d.y, -d.x, 0))
        mid = base + d * 0.3 + V((0, 0, 1.18))
        aim = (hd - mid).normalized()
        out[p['k']] = {'wrist.R': tuple(mid + right * 0.055 - d * 0.02), 'elbow.R': tuple(base + right * 0.22 + d * 0.05 + V((0, 0, 1.0))),
                       'hand.R': tuple(aim), 'wrist.L': tuple(mid - right * 0.055 - d * 0.02), 'elbow.L': tuple(base - right * 0.22 + d * 0.05 + V((0, 0, 1.0))),
                       'hand.L': tuple(aim), 'kind': 'phone', 'cat': ci, 'phone': (tuple(mid + aim * 0.03), tuple(aim)), 'lookAt': tuple(mid + aim * 0.02 - V((0, 0, 0.0)))}
        # 拍照的人看手机屏幕，不是看猫
        used_p.add(p['k'])
    # 逗（整间房只给一根逗猫棒：取最近的一对）
    pairs = []
    for ci, c in enumerate(cats):
        if ci in used_c or not c['onPlatform'] or c['z'] < 0.6 or c['roofToward'] is None:
            continue
        pairs += [(p['pose'] != 'sit', dist(p, c), p['k'], ci) for p in people if p['watchCat'] == ci and dist(p, c) < 2.2 and p['k'] not in used_p]
    for _, _, pk, ci in sorted(pairs)[:1]:
        c = cats[ci]
        p = people[pk]
        hd = cat_head(c)
        base = V((p['x'], p['y'], 0))
        d = V((hd.x - p['x'], hd.y - p['y'], 0))
        d.normalize()
        right = right_of(p)
        sg = 1.0 if d.dot(right) > 0 else -1.0
        side = 'R' if sg > 0 else 'L'
        right = right * sg
        sit = p['pose'] == 'sit'
        sh_z = 1.02 if sit else 1.4
        wrist = base + d * (0.34 if sit else 0.38) + right * 0.12 + V((0, 0, sh_z - 0.12))
        elbow = base + d * 0.12 + right * 0.24 + V((0, 0, sh_z - 0.32))
        # 羽毛：在猫眼前（朝人那一侧）15 cm、略低于眼
        feather = hd - d * 0.16 + V((0, 0, -0.04))
        tip = feather + V((0, 0, 0.3)) - d * 0.05
        out[p['k']] = {f'wrist.{side}': tuple(wrist), f'elbow.{side}': tuple(elbow), f'hand.{side}': tuple((tip - wrist).normalized()),
                       'wand': (tuple(wrist), tuple(tip), tuple(feather)), 'kind': 'wand', 'cat': ci}
        GESTURES[f'look{ci}'] = tuple(feather)
        used_p.add(p['k'])
        used_c.add(ci)
    GESTURES.update(out)
    for k, g in out.items():
        print('手势', k, g['kind'], '→ 猫', g['cat'])
    return out


def phone(coll, M, center, aim):
    """手机：7.5 × 15 × 0.8 cm，背面朝猫"""
    c = V(center)
    n = V(aim).normalized()
    up = V((0, 0, 1))
    side = n.cross(up).normalized()
    up2 = side.cross(n).normalized()
    R = mathutils.Matrix((side, up2, n)).transposed()
    bm = bmesh.new()
    bs.bm_box(bm, 0, 0, 0, 0.075, 0.0375, 0.004)
    for v in bm.verts:
        v.co = c + R @ V((v.co.y, v.co.x, v.co.z))
    ob = obj('手机', bm, coll, M['phone'], bevel=0.003)
    return ob


def wand(coll, M, wrist, tip, feather):
    """逗猫棒：一根细杆 + 垂下的线 + 一簇羽毛"""
    bm = bmesh.new()
    bs.bm_rod(bm, wrist, tip, 0.0045, segs=10)
    obj('逗猫棒·杆', bm, coll, M['stick'], smooth=True)
    bm = bmesh.new()
    # 线：从棒尖垂到羽毛，略带弧
    pts = [V(tip).lerp(V(feather), t) + V((0.0, 0.0, -0.05 * math.sin(math.pi * t))) for t in np.linspace(0, 1, 9)]
    for a, b in zip(pts[:-1], pts[1:]):
        bs.bm_rod(bm, a, b, 0.0009, segs=6)
    obj('逗猫棒·线', bm, coll, M['string'], smooth=True)
    bm = bmesh.new()
    f = V(feather)
    rng = np.random.default_rng(3)
    for k in range(7):
        a = 2 * math.pi * k / 7
        dirv = V((math.cos(a) * 0.5, math.sin(a) * 0.5, -1.0)).normalized()
        q = V((0, 0, 1)).rotation_difference(dirv)
        res = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=1.0)
        for v in res['verts']:
            v.co = q @ V((v.co.x * 0.008, v.co.y * 0.002, v.co.z * 0.045 + 0.04)) + f
    obj('逗猫棒·羽毛', bm, coll, M['feather'], smooth=True)


def build_people(top):
    """人：风格化的模型小人（cafe_figures），姿态照仿真的骨架，三个手势照 stage_gestures"""
    coll = bs.new_coll('访客', top)
    ges = stage_gestures()
    for P in D['people']:
        if P['watchCat'] is not None and P['watchCat'] >= 0:
            P['lookAt'] = tuple(cat_head(D['cats'][P['watchCat']]))
        g = ges.get(P['k'])
        if g and 'lookAt' in g:
            P['lookAt'] = g['lookAt']
        cf.make_figure(P, coll, f"访客{P['k'] + 1:02d}·{P['pose']}", gesture=g)
    return coll


def build_cats(top):
    coll = bs.new_coll('猫', top)
    for k, c in enumerate(D['cats']):
        c = dict(c)
        if f'look{k}' in GESTURES:
            fx, fy, _ = GESTURES[f'look{k}']
            want = math.atan2(fy - c['y'], fx - c['x'])
            rel = math.atan2(math.sin(want - c['heading']), math.cos(want - c['heading']))
            c['headTurn'] = max(-1.5, min(1.5, rel))
        center = None
        if c['onPlatform'] and c['support']:
            center = (c['support'][0]['x'], c['support'][0]['y'], 0)
            c['z'] = c['z'] + 0.006
        cc.make_cat(c, coll, f"猫{k + 1}·{c['coat']}", unit_center=center, detail=1.3)
    return coll


# ---------------------------------------------------------------- 桌上与地上的小东西（布景）
def cup(bm_c, bm_s, bm_k, x, y, z, rot=0.0):
    """咖啡杯 + 碟：杯 Ø8 cm、高 7 cm，碟 Ø14 cm"""
    bs.bm_cyl(bm_s, 0.07, 0.008, z, segs=40, x=x, y=y, r2=0.062)
    vs = bs.bm_tube(bm_c, 0.04, 0.036, 0.07, z + 0.008, segs=40)
    bmesh.ops.translate(bm_c, verts=[v for ring in vs for v in ring], vec=(x, y, 0))
    bs.bm_cyl(bm_c, 0.036, 0.006, z + 0.008, segs=40, x=x, y=y)
    # 把手
    hx, hy = x + 0.046 * math.cos(rot), y + 0.046 * math.sin(rot)
    res = bmesh.ops.create_cone(bm_c, cap_ends=True, segments=12, radius1=0.006, radius2=0.006, depth=0.035)
    bmesh.ops.translate(bm_c, verts=res['verts'], vec=(hx, hy, z + 0.045))
    bs.bm_cyl(bm_k, 0.0355, 0.004, z + 0.058, segs=40, x=x, y=y)


def props(top, M):
    coll = bs.new_coll('布景·小物', top)
    bm_c, bm_s, bm_k = bmesh.new(), bmesh.new(), bmesh.new()
    cats_on = {c['support'][0]['i']: c for c in D['cats'] if c['onPlatform'] and c['support']}
    seated_at = {}
    for st in D['seats']:
        if st['occupied'] and st['table'] is not None:
            seated_at.setdefault(st['table'], []).append(st)
    for u in D['units']:
        if not u['role'].startswith('table') or u['drop'] < 0.99 or u['deg'] < 0.999:
            continue
        for st in seated_at.get(u['i'], []):
            # 杯子放在台面上朝这个座位那一侧、离芯 0.24 m，躲开台上的猫
            a = math.atan2(st['y'] - u['y'], st['x'] - u['x'])
            c = cats_on.get(u['i'])
            if c:
                ac = math.atan2(c['y'] - u['y'], c['x'] - u['x'])
                if abs(math.atan2(math.sin(a - ac), math.cos(a - ac))) < 0.9:
                    a = ac + (1.1 if math.sin(a - ac) > 0 else -1.1)
            r = 0.24
            cup(bm_c, bm_s, bm_k, u['x'] + r * math.cos(a), u['y'] + r * math.sin(a), u['table'] + 0.004, rot=a + 1.2)
    obj('杯', bm_c, coll, M['ceramic'], smooth=True)
    obj('碟', bm_s, coll, M['ceramic2'], smooth=True)
    obj('咖啡', bm_k, coll, M['coffee'], smooth=True)
    # 猫碗与水碗：+X 墙边，门的一侧
    bm_b, bm_w = bmesh.new(), bmesh.new()
    for k, y in enumerate((1.4, 1.62)):
        vs = bs.bm_tube(bm_b, 0.085, 0.078, 0.045, 0.0, segs=40)
        bmesh.ops.translate(bm_b, verts=[v for ring in vs for v in ring], vec=(HALF - 0.16, y, 0))
        bs.bm_cyl(bm_b, 0.078, 0.004, 0.0, segs=40, x=HALF - 0.16, y=y)
        if k == 1:
            bs.bm_cyl(bm_w, 0.077, 0.03, 0.004, segs=40, x=HALF - 0.16, y=y)
    obj('猫碗', bm_b, coll, M['steel_bowl'], smooth=True)
    obj('水', bm_w, coll, M['water'], smooth=True)
    # 地上两颗毛线球
    bm = bmesh.new()
    for (x, y, r) in ((0.25, -0.45, 0.032), (-2.2, 0.55, 0.028)):
        res = bmesh.ops.create_icosphere(bm, subdivisions=3, radius=r)
        bmesh.ops.translate(bm, verts=res['verts'], vec=(x, y, r))
    obj('毛线球', bm, coll, M['toy'], smooth=True)
    # 角落的大盆栽（窗墙的两个角；离单元的落点远）
    rng = np.random.default_rng(11)
    for (x, y, pm, hgt) in ((-HALF + 0.32, -HALF + 0.32, M['pot'], 1.7), (HALF - 0.34, -HALF + 0.34, M['pot2'], 1.35), (-HALF + 0.3, HALF - 0.3, M['pot2'], 1.5)):
        bm = bmesh.new()
        bs.bm_cyl(bm, 0.2, 0.42, 0.0, segs=40, x=x, y=y, r2=0.23)
        obj('盆', bm, coll, pm, smooth=True, bevel=0.006)
        bm = bmesh.new()
        bs.bm_cyl(bm, 0.215, 0.01, 0.39, segs=40, x=x, y=y)
        obj('土', bm, coll, M['soil'], smooth=True)
        bm_st, bm_l, bm_l2 = bmesh.new(), bmesh.new(), bmesh.new()
        for k in range(22):
            a = rng.uniform(0, 2 * math.pi)
            lean = rng.uniform(0.1, 0.75)
            L = rng.uniform(0.45, 1.0) * hgt
            p_prev = V((x + rng.uniform(-0.05, 0.05), y + rng.uniform(-0.05, 0.05), 0.4))
            pts = []
            for t in np.linspace(0, 1, 7):
                bend = lean * (0.4 + 0.8 * t)
                pts.append(V((x + math.cos(a) * math.sin(bend) * L * t, y + math.sin(a) * math.sin(bend) * L * t, 0.4 + math.cos(bend) * L * t * 0.95)))
            for p0, p1 in zip(pts[:-1], pts[1:]):
                bs.bm_rod(bm_st, p0, p1, 0.005, segs=6)
            # 叶：沿茎的后半段长 3–5 片，叶面宽、带一道中脉的折，叶尖下垂
            for j in range(int(rng.integers(3, 6))):
                t = rng.uniform(0.45, 1.0)
                i = min(5, int(t * 6))
                c = pts[i].lerp(pts[i + 1], t * 6 - i)
                ln = rng.uniform(0.16, 0.26)
                aa = a + rng.uniform(-1.2, 1.2)
                outd = V((math.cos(aa), math.sin(aa), rng.uniform(-0.1, 0.5))).normalized()
                side = outd.cross(V((0, 0, 1))).normalized()
                up = side.cross(outd).normalized()
                target = bm_l if (k + j) % 3 else bm_l2
                rows = []
                for r in range(9):
                    v_ = r / 8
                    wdt = math.sin(math.pi * min(1, v_ * 1.05)) * ln * 0.36
                    row = []
                    for q in (-1, 0, 1):
                        lat = q * wdt
                        z = -0.5 * (v_ ** 2) * ln * 0.5 + (0.012 if q == 0 else 0.0)
                        row.append(target.verts.new(c + outd * (v_ * ln) + side * lat + up * z))
                    rows.append(row)
                for r in range(8):
                    for q in range(2):
                        target.faces.new((rows[r][q], rows[r][q + 1], rows[r + 1][q + 1], rows[r + 1][q]))
        obj('茎', bm_st, coll, M['trunk'], smooth=True)
        for b, m in ((bm_l, M['leaf']), (bm_l2, M['leaf2'])):
            ob = obj('叶', b, coll, m, smooth=True)
            so = ob.modifiers.new('厚', 'SOLIDIFY')
            so.thickness = 0.002
    for k, g in GESTURES.items():
        if isinstance(g, dict) and 'wand' in g:
            wand(coll, M, *g['wand'])
        if isinstance(g, dict) and 'phone' in g:
            phone(coll, M, *g['phone'])
    return coll


# ---------------------------------------------------------------- 光、相机、渲染设置
SUN = dict(elev=math.radians(24), azim=math.radians(-118))   # 太阳在 −X −Y 那一侧（窗墙外），光朝 +X +Y 打进屋


def lights(top, sc):
    coll = bs.new_coll('灯光与机位', top)
    w = bpy.data.worlds.new('天空')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes['Background']
    sky = nt.nodes.new('ShaderNodeTexSky')
    sky.sky_type = 'NISHITA'
    sky.sun_disc = False
    sky.sun_elevation = SUN['elev']
    sky.sun_rotation = SUN['azim'] + math.pi / 2
    sky.altitude = 50
    sky.air_density = 1.2
    sky.dust_density = 2.5
    nt.links.new(sky.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.22
    sun = bpy.data.lights.new('太阳', 'SUN')
    sun.energy = 5.0
    sun.angle = math.radians(0.8)
    sun.color = (1.0, 0.86, 0.7)
    so = bpy.data.objects.new('太阳', sun)
    coll.objects.link(so)
    d = V((math.cos(SUN['azim']) * math.cos(SUN['elev']), math.sin(SUN['azim']) * math.cos(SUN['elev']), math.sin(SUN['elev'])))
    so.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    # 窗口补光：每扇窗外一盏面光（天光从窗进来的漫射，Cycles 里靠天空球要很多样本才干净）
    for (cx, cy, rx, ry, rot) in ((-2.0, -HALF - 0.3, 1.9, 2.8, (math.pi / 2, 0, 0)), (0.0, -HALF - 0.3, 1.9, 2.8, (math.pi / 2, 0, 0)),
                                  (2.0, -HALF - 0.3, 1.9, 2.8, (math.pi / 2, 0, 0)), (-HALF - 0.3, -1.95, 1.9, 2.8, (math.pi / 2, 0, -math.pi / 2)),
                                  (-HALF - 0.3, 1.95, 1.9, 2.8, (math.pi / 2, 0, -math.pi / 2))):
        L = bpy.data.lights.new('窗·天光', 'AREA')
        L.shape = 'RECTANGLE'
        L.size, L.size_y = rx, ry
        L.energy = 55
        L.color = (0.82, 0.9, 1.0)
        L.spread = math.radians(120)
        lo = bpy.data.objects.new('窗·天光', L)
        coll.objects.link(lo)
        lo.location = (cx, cy, 1.85)
        lo.rotation_euler = rot
        lo.visible_camera = False
        lo.visible_glossy = False
    return coll


def cam(coll, name, loc, look, lens=24, shift=(0.0, 0.0), level=True, ortho=None):
    c = bpy.data.cameras.new(name)
    c.lens = lens
    c.sensor_width = 36
    c.shift_x, c.shift_y = shift
    c.clip_start = 0.05
    c.clip_end = 200
    o = bpy.data.objects.new(name, c)
    coll.objects.link(o)
    o.location = loc
    d = V(look) - V(loc)
    if level:
        d.z = 0
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    if ortho:
        c.type = 'ORTHO'
        c.ortho_scale = ortho
    return o


def _dof(c, focus, fstop):
    c.data.dof.use_dof = True
    c.data.dof.aperture_fstop = fstop
    c.data.dof.focus_distance = (V(focus) - c.location).length


def cameras(coll):
    """机位按种子 14 · 第 158 秒这一刻定（换一刻要重看取景）"""
    out = {}
    c = cam(coll, 'H1·一点透视·窗前的沙发与猫', (-0.12, 3.1, 1.95), (-0.12, -3.0, 1.95), lens=20, shift=(0.0, -0.05))
    _dof(c, (-0.3, -1.4, 0.8), 8.0)
    out['H1'] = c
    c = cam(coll, 'H2·两点透视·整间房', (3.1, 1.95, 1.62), (-1.45, -1.55, 1.62), lens=19, shift=(0.0, 0.02))
    _dof(c, (0.0, -1.0, 0.9), 8.0)
    out['H2'] = c
    c = cam(coll, 'H3·过肩·看有顶台里的黑猫', (-0.5, 3.12, 1.62), (-1.98, 1.12, 0.92), lens=34, level=False)
    _dof(c, (-1.95, 1.1, 1.18), 4.0)
    out['H3'] = c
    az, el = math.radians(45), math.radians(52)
    dvec = V((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
    out['H4'] = cam(coll, 'H4·轴测剖切·整间房', tuple(V((0, 0, 1.4)) + dvec * 30), (0, 0, 1.4), lens=50, level=False, ortho=11.2)
    c = cam(coll, 'H5·摸奶牛猫与拍照', (-0.25, 0.05, 1.86), (1.15, -1.62, 0.92), lens=26, level=False)
    _dof(c, (1.02, -1.3, 0.72), 4.5)
    out['H5'] = c
    c = cam(coll, 'H6·逗窗边有顶台里的狸花', (-0.12, -3.05, 1.42), (-2.15, -2.12, 0.98), lens=28, level=False)
    _dof(c, (-2.2, -2.2, 1.18), 4.5)
    out['H6'] = c
    return out


def render_settings(sc):
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 160
    sc.cycles.adaptive_threshold = 0.025
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    sc.cycles.max_bounces = 8
    sc.cycles.diffuse_bounces = 4
    sc.cycles.glossy_bounces = 4
    sc.cycles.transmission_bounces = 8
    sc.cycles.transparent_max_bounces = 16
    sc.cycles.sample_clamp_indirect = 8.0
    sc.cycles.blur_glossy = 1.0
    sc.render.resolution_x = 1920
    sc.render.resolution_y = 1080
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.view_settings.exposure = 0.35
    sc.render.image_settings.file_format = 'PNG'
    sc.unit_settings.system = 'METRIC'


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.name = 'Lab 2-15 效果图'
    top = sc.collection
    M = materials()
    room, near, ceil_c, out = build_room(top, M)
    furniture(top, M)
    build_units(top, M)
    build_people(top)
    build_cats(top)
    props(top, M)
    lc = lights(top, sc)
    cams = cameras(lc)
    sc.camera = cams['H1']
    render_settings(sc)
    sc['scene_info'] = str(D['scene'])
    bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
    print('SAVED', OUT)


if __name__ == '__main__':
    main()
