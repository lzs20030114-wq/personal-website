"""Lab 2-15 效果图里的猫（2026-11-08）。

仿真给的是 catPlacement 的摆法（cafe-export.mjs）：位置、朝向、头转多少、姿态（坐 / 卧 / 蜷 / 站 / 走）、尾巴、在台上时身子
绕立杆弯的半径、脚下台面高度。这里按姿态搭一副骨架，用融球（metaball）长出连续的身体与头（家猫的尺寸：肩高约 0.24 m、
体长约 0.46 m），转成网格后在台上的按弯曲半径绕着那台的芯弯过去；再加耳朵、眼睛、鼻子与一层短毛（粒子毛发）。
花色（台架同一套七种：figurePalette 的 COATS）按身体部位算出来，编码进 UV 的 U（毛发在 Cycles 里只读得到发根处身体的 UV），
毛与皮下的底色用同一张色带取色。
"""

import bpy
import bmesh
import math
import mathutils
import numpy as np

V = mathutils.Vector


def srgb(c):
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


# 花色类别 → U（色带上的常值段）
CLS = {'base': 0, 'patch': 1, 'patch2': 2, 'stripe': 3, 'white': 4}
NCLS = 5


def _u(c):
    return (CLS[c] + 0.5) / NCLS


# ---------------------------------------------------------------- 骨架（猫自身系：x 朝前、y 朝左、z 朝上，原点在身子正下方地面）
def _lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def skeleton(pose, phase=0.0, tail='relaxed'):
    """返回 dict：spine（尾根 → 颈，点 + 半径 (rx 前后, ry 左右, rz 上下)）、legs（每条 [肩/髋, 肘/膝, 腕/踝, 掌]）、
    tail（点列）、head（头心、朝向俯仰）"""
    S = {}
    if pose in ('stand', 'walk'):
        S['spine'] = [((-0.185, 0, 0.212), (0.03, 0.045, 0.048)), ((-0.13, 0, 0.215), (0.06, 0.058, 0.064)),
                      ((-0.05, 0, 0.208), (0.07, 0.057, 0.066)), ((0.03, 0, 0.205), (0.07, 0.061, 0.076)),
                      ((0.095, 0, 0.198), (0.055, 0.056, 0.074)), ((0.15, 0, 0.235), (0.035, 0.036, 0.042))]
        S['head'] = ((0.195, 0, 0.275), 0.12)
        sw = math.sin(2 * math.pi * phase) if pose == 'walk' else 0.0
        legs = []
        for side, sg in (('L', 1), ('R', -1)):
            # 前腿：对角步态，左前与右后同相
            ph_f = sw * sg
            ph_h = -sw * sg
            fx = 0.105 + 0.035 * ph_f
            legs.append(('front', sg, [(0.1, sg * 0.034, 0.175), (0.09 + 0.02 * ph_f, sg * 0.034, 0.105),
                                       (fx, sg * 0.032, 0.035 + 0.02 * max(0, ph_f)), (fx + 0.018, sg * 0.032, 0.011 + 0.02 * max(0, ph_f))]))
            hx = -0.155 + 0.035 * ph_h
            legs.append(('hind', sg, [(-0.14, sg * 0.04, 0.185), (-0.095 + 0.02 * ph_h, sg * 0.042, 0.12),
                                      (hx - 0.02, sg * 0.038, 0.06 + 0.02 * max(0, ph_h)), (hx + 0.005, sg * 0.036, 0.011 + 0.015 * max(0, ph_h))]))
        S['legs'] = legs
        t0 = (-0.2, 0, 0.21)
        if tail == 'up':
            S['tail'] = [t0, (-0.235, 0, 0.27), (-0.245, 0, 0.36), (-0.235, 0, 0.44), (-0.205, 0, 0.48)]
        else:
            S['tail'] = [t0, (-0.25, 0, 0.17), (-0.29, 0, 0.11), (-0.33, 0, 0.07), (-0.38, 0, 0.06)]
    elif pose == 'sit':
        S['spine'] = [((-0.1, 0, 0.065), (0.055, 0.072, 0.055)), ((-0.075, 0, 0.105), (0.068, 0.072, 0.068)),
                      ((-0.042, 0, 0.155), (0.06, 0.06, 0.066)), ((-0.005, 0, 0.198), (0.052, 0.052, 0.06)),
                      ((0.022, 0, 0.222), (0.046, 0.046, 0.05)), ((0.038, 0, 0.262), (0.034, 0.035, 0.04))]
        S['head'] = ((0.058, 0, 0.312), 0.05)
        S['legs'] = [
            ('front', 1, [(0.03, 0.03, 0.2), (0.045, 0.03, 0.12), (0.062, 0.03, 0.04), (0.082, 0.03, 0.011)]),
            ('front', -1, [(0.03, -0.03, 0.2), (0.045, -0.03, 0.12), (0.062, -0.03, 0.04), (0.082, -0.03, 0.011)]),
            # 后腿折起：大腿贴在身侧，后掌落在前掌旁边
            ('hind', 1, [(-0.07, 0.05, 0.09), (-0.01, 0.06, 0.06), (-0.075, 0.052, 0.025), (0.0, 0.05, 0.011)]),
            ('hind', -1, [(-0.07, -0.05, 0.09), (-0.01, -0.06, 0.06), (-0.075, -0.052, 0.025), (0.0, -0.05, 0.011)]),
        ]
        # 尾巴绕到身前、贴着地
        S['tail'] = [(-0.13, 0, 0.03), (-0.14, -0.06, 0.018), (-0.09, -0.11, 0.016), (-0.01, -0.12, 0.015), (0.06, -0.09, 0.015), (0.1, -0.055, 0.015)]
    elif pose == 'lie':
        # 揣手卧（「母鸡蹲」）：身子贴地、前爪收在胸下、头抬着
        S['spine'] = [((-0.175, 0, 0.075), (0.03, 0.05, 0.045)), ((-0.12, 0, 0.085), (0.065, 0.07, 0.07)),
                      ((-0.04, 0, 0.09), (0.075, 0.072, 0.075)), ((0.04, 0, 0.09), (0.07, 0.07, 0.075)),
                      ((0.1, 0, 0.1), (0.05, 0.058, 0.07)), ((0.14, 0, 0.15), (0.034, 0.036, 0.042))]
        S['head'] = ((0.17, 0, 0.19), 0.0)
        S['legs'] = [('front', sg, [(0.1, sg * 0.035, 0.07), (0.13, sg * 0.03, 0.035), (0.135, sg * 0.03, 0.02), (0.14, sg * 0.03, 0.015)]) for sg in (1, -1)]
        S['legs'] += [('hind', sg, [(-0.12, sg * 0.055, 0.07), (-0.08, sg * 0.07, 0.04), (-0.13, sg * 0.065, 0.02), (-0.09, sg * 0.06, 0.012)]) for sg in (1, -1)]
        S['tail'] = [(-0.19, 0, 0.05), (-0.2, -0.06, 0.02), (-0.14, -0.1, 0.016), (-0.05, -0.11, 0.015), (0.03, -0.1, 0.015)]
    elif pose == 'curl':
        # 蜷成一圈：脊柱沿半径 0.1 的圆弧，头埋向尾巴
        pts = []
        for k, a in enumerate(np.linspace(-0.2, 4.1, 7)):
            r = 0.1
            rad = (0.05, 0.065, 0.06) if 0 < k < 6 else (0.04, 0.045, 0.045)
            pts.append(((r * math.sin(a) - 0.02, -r * math.cos(a) + 0.02, 0.065 if 0 < k < 6 else 0.06), rad))
        S['spine'] = pts
        hx, hy, _ = pts[-1][0]
        S['head'] = ((hx + 0.03, hy + 0.035, 0.07), -0.25)
        S['legs'] = []
        S['tail'] = [(pts[0][0][0] - 0.02, pts[0][0][1] - 0.02, 0.04), (0.06, -0.11, 0.025), (0.12, -0.04, 0.02), (0.11, 0.05, 0.02), (0.06, 0.1, 0.02)]
    else:
        raise ValueError(pose)
    return S


# ---------------------------------------------------------------- 融球
# 融球的「影响半径」不是看得见的半径：阈值 0.6、硬度 2 时表面落在 0.575 R 处（场 = s·(1 − r²/R²)³ = t）。
# 下面的尺寸都写看得见的半径（米），建的时候换算；相邻元素的场叠加，身子会再胖一点，故椭球按 1.45 倍放。
MB_T, MB_S = 0.6, 2.0
VIS = math.sqrt(1 - (MB_T / MB_S) ** (1 / 3))
K_ELL = 1.45


def _ball(mb, co, r, kind='ELLIPSOID', rot=None):
    e = mb.elements.new(type=kind)
    e.co = co
    e.stiffness = MB_S
    if kind == 'ELLIPSOID':
        e.size_x, e.size_y, e.size_z = (r[0] * K_ELL, r[1] * K_ELL, r[2] * K_ELL)
        e.radius = 1.0
    elif kind == 'CAPSULE':
        e.size_x = r[0]
        e.radius = r[1] / VIS
    else:
        e.radius = r / VIS
    if rot is not None:
        e.rotation = rot
    return e


def _capsule(mb, a, b, r):
    a, b = V(a), V(b)
    d = b - a
    L = d.length
    q = V((1, 0, 0)).rotation_difference(d.normalized()) if L > 1e-6 else mathutils.Quaternion()
    _ball(mb, (a + b) / 2, (L / 2, r), kind='CAPSULE', rot=q)


def head_frame(S, head_turn):
    (hc, pitch) = S['head']
    R = mathutils.Matrix.Rotation(head_turn, 3, 'Z') @ mathutils.Matrix.Rotation(-pitch, 3, 'Y')
    return V(hc), R


def build_cat_mesh(name, S, head_turn, coll, res=0.0055):
    mbd = bpy.data.metaballs.new(name)
    mbd.resolution = res
    mbd.render_resolution = res
    mbd.threshold = MB_T
    ob = bpy.data.objects.new(name, mbd)
    coll.objects.link(ob)
    sp = S['spine']
    for k, (co, r) in enumerate(sp):
        a = V(sp[max(k - 1, 0)][0])
        b = V(sp[min(k + 1, len(sp) - 1)][0])
        q = V((1, 0, 0)).rotation_difference((b - a).normalized())
        _ball(mbd, co, r, rot=q)
    for k in range(len(sp) - 1):
        r0, r1 = sp[k][1], sp[k + 1][1]
        _capsule(mbd, sp[k][0], sp[k + 1][0], min(r0[1], r0[2], r1[1], r1[2]) * 0.9)
    for kind, sg, j in S['legs']:
        r_top = 0.026 if kind == 'hind' else 0.02
        _capsule(mbd, j[0], j[1], r_top)
        _capsule(mbd, j[1], j[2], 0.0135)
        _capsule(mbd, j[2], j[3], 0.012)
        _ball(mbd, _lerp(j[3], j[2], 0.15), (0.02, 0.0155, 0.011))
        if kind == 'hind':
            _ball(mbd, _lerp(j[0], j[1], 0.45), (0.04, 0.026, 0.036))
        else:
            _ball(mbd, _lerp(j[0], j[1], 0.3), (0.026, 0.02, 0.03))
    tl = S['tail']
    for k in range(len(tl) - 1):
        r = 0.0115 - 0.0045 * k / max(1, len(tl) - 2)
        _capsule(mbd, tl[k], tl[k + 1], r)
    hc, R = head_frame(S, head_turn)
    def H(p):
        return hc + R @ V(p)
    qh = R.to_quaternion()
    _ball(mbd, H((0, 0, 0.002)), (0.044, 0.043, 0.039), rot=qh)                  # 颅
    for sg in (1, -1):
        _ball(mbd, H((0.014, sg * 0.025, -0.017)), (0.029, 0.025, 0.022), rot=qh)  # 腮
    _ball(mbd, H((0.039, 0, -0.017)), (0.019, 0.021, 0.014), rot=qh)              # 吻
    _ball(mbd, H((0.03, 0, -0.03)), (0.015, 0.013, 0.008), rot=qh)                # 下巴
    _capsule(mbd, H((-0.02, 0, -0.01)), sp[-1][0], 0.026)                         # 颈
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    bpy.data.metaballs.remove(mbd)
    mo = bpy.data.objects.new(name, me)
    coll.objects.link(mo)
    me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), dtype=bool))
    return mo


# ---------------------------------------------------------------- 花色
def _hash(*a):
    s = 0.0
    for i, v in enumerate(a):
        s += math.sin(v * (12.9898 + 7.1 * i) + 78.233 * i)
    return (math.sin(s * 43758.5453) + 1) / 2


def _noise3(p, f):
    x, y, z = p.x * f, p.y * f, p.z * f
    return (math.sin(x * 1.7 + math.sin(y * 2.3)) + math.sin(y * 1.9 + math.sin(z * 2.1 + 1.3)) + math.sin(z * 1.3 + math.sin(x * 2.9 + 0.7))) / 3


def coat_class(coat, p, S, head_turn, seed):
    """一个顶点（猫自身系，弯曲之前）属于哪一类颜色"""
    hc, R = head_frame(S, head_turn)
    hl = R.transposed() @ (p - hc)                         # 头心系
    in_head = hl.length < 0.075
    # 离脊柱最近的点：脊柱参数 t、离中线的上下 / 左右
    sp = [V(c) for c, _ in S['spine']]
    best = (1e9, 0, 0.0)
    for k in range(len(sp) - 1):
        a, b = sp[k], sp[k + 1]
        ab = b - a
        t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
        d = (a + ab * t - p).length
        if d < best[0]:
            best = (d, k, t)
    d, k, t = best
    s = (k + t) / (len(sp) - 1)                             # 0 尾根 → 1 颈
    a, b = sp[k], sp[k + 1]
    axis = (b - a).normalized()
    near = a + (b - a) * t
    off = p - near
    up_axis = (V((0, 0, 1)) - axis * axis.z).normalized()
    below = -off.dot(up_axis)                               # 正 = 在脊柱下面（腹）
    is_leg = p.z < 0.12 and d > 0.06
    is_paw = p.z < 0.03
    # 尾巴参数
    tl = [V(c) for c in S['tail']]
    td, tt = 1e9, 0.0
    L = 0.0
    acc = []
    for i in range(len(tl) - 1):
        acc.append(L)
        L += (tl[i + 1] - tl[i]).length
    for i in range(len(tl) - 1):
        aa, bb = tl[i], tl[i + 1]
        ab = bb - aa
        u = max(0.0, min(1.0, (p - aa).dot(ab) / ab.length_squared))
        dd = (aa + ab * u - p).length
        if dd < td:
            td, tt = dd, (acc[i] + u * ab.length) / L
    in_tail = td < 0.03 and d > 0.04
    face_white = in_head and hl.x > 0.02 and hl.z < -0.004 and abs(hl.y) < 0.03
    chest_white = (not in_head) and s > 0.65 and below > 0.02 and not is_leg
    belly = (not in_head) and below > 0.035 and not is_leg
    n = _noise3(p + V((seed, seed * 0.7, seed * 1.3)), 22.0)
    n2 = _noise3(p + V((seed * 1.9, 3.1, seed)), 17.0)
    if coat == 'white':
        return 'base'
    if coat == 'black':
        return 'base'
    if coat == 'tuxedo':
        if face_white or chest_white or belly or is_paw:
            return 'white'
        return 'base'
    if coat == 'cow':
        if face_white or (belly and n < 0.4):
            return 'base'
        if in_tail:
            return 'patch' if tt > 0.55 else 'base'
        if in_head:
            return 'patch' if (hl.z > 0.0 and abs(hl.y) > 0.012 * (1 + n)) or hl.x < -0.01 else 'base'
        return 'patch' if n > 0.18 else 'base'
    if coat == 'calico':
        if face_white or belly or chest_white or is_paw:
            return 'base'
        if n > 0.25:
            return 'patch'
        if n2 > 0.12:
            return 'patch2'
        return 'base'
    if coat in ('tabby', 'ginger'):
        if face_white or (coat == 'tabby' and (chest_white or (belly and below > 0.045))):
            return 'white'
        if in_tail:
            return 'stripe' if math.sin(tt * 2 * math.pi * 6) > 0.3 else 'base'
        if in_head:
            # 额头上的「M」：几道竖纹
            if hl.z > 0.01 and hl.x > -0.01 and abs(math.sin(hl.y * 180)) > 0.8:
                return 'stripe'
            return 'base'
        if is_leg:
            return 'stripe' if math.sin(p.z * 150) > 0.72 else 'base'
        if below > 0.03:
            return 'base'
        side = math.atan2(off.dot(axis.cross(up_axis)), off.dot(up_axis))
        w = math.sin(s * 2 * math.pi * 7 + 1.4 * abs(side) + 0.6 * n)
        return 'stripe' if w > (0.5 if coat == 'tabby' else 0.62) else 'base'
    return 'base'


def paint(mo, coat, S, head_turn, seed=0.0):
    me = mo.data
    uv = me.uv_layers.new(name='UVMap')
    cls = [coat_class(coat, v.co, S, head_turn, seed) for v in me.vertices]
    # 按面取一类（面内各角同一个 U）：U 若在顶点之间插值，色带上会串出中间的类（虎斑与底色之间冒出黑、橙两道边）
    us = np.empty(len(me.loops), dtype=np.float32)
    for p in me.polygons:
        names = [cls[i] for i in p.vertices]
        u = _u(max(set(names), key=names.count))
        for li in p.loop_indices:
            us[li] = u
    data = np.stack([us, np.full(len(us), 0.5, np.float32)], axis=1)
    uv.data.foreach_set('uv', data.ravel())
    # 毛长：脸、掌短，身子长
    g = mo.vertex_groups.new(name='毛长')
    hc, R = head_frame(S, head_turn)
    for v in me.vertices:
        hl = R.transposed() @ (v.co - hc)
        w = 1.0
        if hl.length < 0.075:
            w = 0.35 if hl.x > 0.01 else 0.55
        if v.co.z < 0.03:
            w = 0.4
        g.add([v.index], w, 'REPLACE')
    return cls


# ---------------------------------------------------------------- 材质
_MATS = {}


def coat_ramp(nt, colors, coat, scale=1.0):
    uvn = nt.nodes.new('ShaderNodeUVMap')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(uvn.outputs['UV'], sep.inputs[0])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'CONSTANT'
    el = ramp.color_ramp.elements
    fur = colors['fur']
    lut = {
        'base': fur,
        'patch': colors['patch'],
        'patch2': colors['patch2'],
        'stripe': colors['stripe'] if coat in ('tabby', 'ginger') else colors['patch'],
        'white': colors['muzzle'],
    }
    if coat == 'ginger':
        lut['stripe'] = [c * 0.78 for c in fur]
    if coat == 'tabby':
        lut['stripe'] = [0.2, 0.16, 0.12]
    names = ['base', 'patch', 'patch2', 'stripe', 'white']
    while len(el) < NCLS:
        el.new(0.5)
    for i, nm in enumerate(names):
        el[i].position = i / NCLS
        c = [min(1.0, x * scale) for x in lut[nm]]
        el[i].color = (*srgb(c), 1)
    nt.links.new(sep.outputs['X'], ramp.inputs['Fac'])
    return ramp


def fur_material(name, colors, coat):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    ramp = coat_ramp(nt, colors, coat, 0.92)
    hb = nt.nodes.new('ShaderNodeBsdfHairPrincipled')
    hb.parametrization = 'COLOR'
    hb.inputs['Roughness'].default_value = 0.42
    hb.inputs['Radial Roughness'].default_value = 0.6
    hb.inputs['Coat'].default_value = 0.25
    nt.links.new(ramp.outputs['Color'], hb.inputs['Color'])
    nt.links.new(hb.outputs[0], nt.nodes['Material Output'].inputs[0])
    return m


def skin_material(name, colors, coat):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    ramp = coat_ramp(nt, colors, coat, 0.8)
    nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.7
    p.inputs['Sheen Weight'].default_value = 0.8
    p.inputs['Sheen Roughness'].default_value = 0.4
    return m


def _simple(name, color, rough=0.5, coat=0.0, emit=0.0):
    key = (name, tuple(color))
    if key in _MATS:
        return _MATS[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*srgb(color), 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Coat Weight'].default_value = coat
    if emit:
        p.inputs['Emission Color'].default_value = (*srgb(color), 1)
        p.inputs['Emission Strength'].default_value = emit
    _MATS[key] = m
    return m


def eye_material(name, iris):
    """猫眼：虹膜色，外面一层清漆（瞳孔是另一块深色的窄片，见 make_cat）"""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*srgb(iris), 1)
    p.inputs['Roughness'].default_value = 0.3
    p.inputs['Coat Weight'].default_value = 1.0
    p.inputs['Coat Roughness'].default_value = 0.02
    p.inputs['Emission Color'].default_value = (*srgb(iris), 1)
    p.inputs['Emission Strength'].default_value = 0.15
    return m


def _cone_ear(bm, base_c, out_dir, up_dir, w=0.034, h=0.042, t=0.008):
    """耳朵：扁的三角锥（前面稍凹），base_c 在头上"""
    f = up_dir.cross(out_dir).normalized()            # 耳朵面朝的方向
    a = base_c + out_dir * (w / 2)
    b = base_c - out_dir * (w / 2)
    c = base_c + up_dir * h + out_dir * 0.004
    back = -f * t
    vs = [bm.verts.new(x) for x in (a, b, c, a + back, b + back, c + back * 0.4, base_c + f * 0.003 + up_dir * h * 0.35)]
    A, B, C, A2, B2, C2, M = vs
    for k, face in enumerate(((A, M, C), (M, B, C), (A, B, M), (A2, C2, B2), (A, C, C2, A2), (B, B2, C2, C), (A, A2, B2, B))):
        try:
            f = bm.faces.new(face)
            f.material_index = 1 if k < 2 else 0
        except ValueError:
            pass


def make_cat(c, coll, name, unit_center=None, detail=1.0):
    """一只猫：c = 导出的摆法（世界坐标、米）。返回根物体"""
    coat = c['coat']
    colors = c['colors']
    pose = c['pose']
    S = skeleton(pose, 0.3 if pose == 'walk' else 0.0, c['tail'])
    ht = c['headTurn']
    body = build_cat_mesh(f'{name}·身体', S, ht, coll)
    paint(body, coat, S, ht, seed=hash(name) % 97 * 0.13)
    hc, R = head_frame(S, ht)
    # 耳朵、眼睛、鼻子（猫自身系，跟身子一起弯、一起摆）
    bm = bmesh.new()
    for sg in (1, -1):
        base = hc + R @ V((-0.006, sg * 0.026, 0.035))
        out = (R @ V((0.1, sg * 0.75, -0.25))).normalized()
        up = (R @ V((0.05, sg * 0.5, 1.0))).normalized()
        _cone_ear(bm, base, out, up, w=0.034, h=0.031, t=0.009)
    me = bpy.data.meshes.new(f'{name}·耳')
    bm.to_mesh(me)
    bm.free()
    ears = bpy.data.objects.new(f'{name}·耳', me)
    coll.objects.link(ears)
    ear_col = colors['patch'] if coat in ('cow', 'tuxedo', 'black', 'calico') else colors['fur']
    if coat == 'tabby':
        ear_col = [0.42, 0.35, 0.28]
    me.materials.append(_simple(f'猫耳·{coat}', [x * 0.85 for x in ear_col], rough=0.75))
    me.materials.append(_simple('猫耳·内', (0.86, 0.62, 0.6), rough=0.6))
    me.polygons.foreach_set('use_smooth', np.zeros(len(me.polygons), dtype=bool))
    sub = ears.modifiers.new('圆', 'SUBSURF')
    sub.levels = sub.render_levels = 2
    # 眼睛
    eyes = []
    for k, sg in enumerate((1, -1)):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=0.0088)
        for v in bm.verts:
            v.co = V((v.co.x * 0.55, v.co.y, v.co.z * 0.86))
        me = bpy.data.meshes.new(f'{name}·眼')
        bm.to_mesh(me)
        bm.free()
        iris = colors['iris2'] if (k == 1 and coat == 'white') else colors['iris']
        me.materials.append(eye_material(f'猫眼·{coat}{k}', iris))
        me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), dtype=bool))
        eo = bpy.data.objects.new(f'{name}·眼{k}', me)
        coll.objects.link(eo)
        Me = mathutils.Matrix.Translation(hc + R @ V((0.036, sg * 0.0195, 0.004))) @ (R @ mathutils.Matrix.Rotation(sg * 0.32, 3, 'Z')).to_4x4()
        eo.matrix_world = Me
        eyes.append(eo)
        # 瞳孔：竖的一道窄缝，贴在眼球正面
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=10, radius=1.0)
        for v in bm.verts:
            v.co = V((v.co.x * 0.001 + 0.0048, v.co.y * 0.0017, v.co.z * 0.0062))
        me = bpy.data.meshes.new(f'{name}·瞳')
        bm.to_mesh(me)
        bm.free()
        me.materials.append(_simple('猫瞳', (0.01, 0.01, 0.012), rough=0.2, coat=1.0))
        po = bpy.data.objects.new(f'{name}·瞳{k}', me)
        coll.objects.link(po)
        po.matrix_world = Me
        eyes.append(po)
    # 鼻子
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.0062)
    for v in bm.verts:
        v.co = V((v.co.x * 0.6, v.co.y, v.co.z * 0.55))
    me = bpy.data.meshes.new(f'{name}·鼻')
    bm.to_mesh(me)
    bm.free()
    me.materials.append(_simple(f'猫鼻·{coat}', colors['nose'], rough=0.35, coat=0.4))
    nose = bpy.data.objects.new(f'{name}·鼻', me)
    coll.objects.link(nose)
    nose.matrix_world = mathutils.Matrix.Translation(hc + R @ V((0.059, 0, -0.009))) @ R.to_4x4()
    # 弯（台上绕着立杆）+ 摆到世界里
    parts = [body, ears, *eyes, nose]
    place_cat(parts, c, unit_center)
    # 毛（弯完、摆好之后长：毛沿当下的法向）
    body.data.materials.append(skin_material(f'{name}·皮', colors, coat))
    body.data.materials.append(fur_material(f'{name}·毛', colors, coat))
    ps = body.modifiers.new('毛', 'PARTICLE_SYSTEM').particle_system
    st = ps.settings
    st.type = 'HAIR'
    st.count = int(3200 * detail)
    st.material = 2
    st.child_type = 'INTERPOLATED'
    st.child_percent = 8
    st.rendered_child_count = int(14 * detail)
    st.clump_factor = 0.18
    st.roughness_1 = 0.004
    st.roughness_2 = 0.002
    st.root_radius = 1.0
    st.tip_radius = 0.0
    st.radius_scale = 0.00055
    st.use_hair_bspline = True
    st.display_step = 3
    st.render_step = 3
    st.hair_length = 0.016
    ps.vertex_group_length = '毛长'
    ps.vertex_group_density = ''
    root = bpy.data.objects.new(name, None)
    coll.objects.link(root)
    for o in parts:
        o.parent = root
        o.matrix_parent_inverse = mathutils.Matrix()
    return root


def place_cat(parts, c, unit_center=None):
    """猫自身系 → 世界：直的就是转 + 平移；在台上（bend > 0）按弯曲半径绕那台的芯弯过去"""
    h = c['heading']
    f = V((math.cos(h), math.sin(h), 0))
    l = V((0, 0, 1)).cross(f)
    P0 = V((c['x'], c['y'], c['z']))
    bend = c.get('bend', 0) or 0
    C = V(unit_center) if (unit_center is not None and bend > 0) else None
    if C is not None:
        C = V((C.x, C.y, 0))
        rv = V((P0.x, P0.y, 0)) - C
        R0 = rv.length
        rhat = rv / R0
        th0 = math.atan2(rv.y, rv.x)
        sgn = 1.0 if rhat.cross(f).z > 0 else -1.0
        lr = l.dot(rhat)
    for o in parts:
        me = o.data
        M = o.matrix_world.copy()
        o.matrix_world = mathutils.Matrix()
        co = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        Mn = np.array(M)
        co = co @ Mn[:3, :3].T + Mn[:3, 3]
        if C is None:
            W = P0[0] + co[:, 0] * f.x + co[:, 1] * l.x, P0[1] + co[:, 0] * f.y + co[:, 1] * l.y
            out = np.stack([W[0], W[1], P0[2] + co[:, 2]], axis=1)
        else:
            r = R0 + co[:, 1] * lr
            th = th0 + sgn * co[:, 0] / R0
            out = np.stack([C.x + r * np.cos(th), C.y + r * np.sin(th), P0[2] + co[:, 2]], axis=1)
        me.vertices.foreach_set('co', out.ravel())
        me.update()
