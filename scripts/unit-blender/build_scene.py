"""项目二单元的 Blender 模型与动画（2026-10-29）。

    blender -b --factory-startup --python scripts/unit-blender/build_scene.py -- <unit.json> <out.blend> [A,B,C]

输入是 export.mjs 导出的引擎录像（带子每一样的剖面 + 每颗键扣没扣），这里只做两件事：
  1. 给单元补上机构：天花机箱、伸缩吊杆、上夹环、伸缩的芯、下夹环、键（铰在布上的定长撑杆）、带间的膜；
  2. 把录像接成动画：带子与膜用绝对式形态键（每个样一个键，按时间线性插值），机构件按样逐个打关键帧。

机构的读法（建模假设，见 项目二_单元建模.md，待作者确认）：
  - 成形时吊杆放长、芯缩短同样的量 ⇒ 下夹环不动、上夹环往下走（= 引擎「注册在底端」的运动）；
  - 升降时吊杆与芯一起伸长，布在两个夹环之间由手风琴褶展开成直带子；
  - 键 = 一端铰在布上的定长撑杆，扣上时撑在两点之间（橙色，与台架的键线同色），松开时折回贴着布。
"""

import bpy
import bmesh
import mathutils
import json
import math
import sys
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SRC = argv[0] if len(argv) > 0 else 'unit.json'
OUT = argv[1] if len(argv) > 1 else 'unit.blend'
ONLY = set(argv[2].split(',')) if len(argv) > 2 else {'A', 'B', 'C'}
# 1 = 跨缝的键也画出来（取证用：看通道那张谱的键真做成撑杆会是什么样）
SHOW_SEAM = len(argv) > 3 and argv[3] == 'seam'

D = json.load(open(SRC))
META = D['meta']
FPS = META['fps']
ST_R = META['stationR']          # 带子站位半径（剖面 x = 0）
SEG = META['segM']               # 贴合段一节
CEIL = META['ceiling']           # 天花离地
BW = META['bandWidth']           # 带宽
NB = META['bandCount']           # 一台的带数（20）
DANG = 2 * math.pi / NB

# ------------------------------------------------------------------ 机构尺寸（米；建模假设，不是引擎量）
FAB_T = 0.002          # 布的半厚（布厚 4 mm）
HEM_B = 0.004          # 包边宽
HEM_T = 0.0036         # 包边处的半厚
PAD = dict(L=0.024, W=0.026, H=0.008)      # 键的底座（沿带 × 横向 × 高）
SLEEVE = dict(L=0.032, W=0.012, T=0.008)   # 伸缩撑杆的外套（没扣时就是键座上的一截短桩）
ROD = dict(W=0.006, T=0.0045)              # 伸缩撑杆的内杆（扣上时伸到对面键座，橙色）
CLAMP_N = 5            # 上下夹环各夹住带子端头几节（约 4 cm；2026-10-30 作者嫌两头笨重，由夹 22 / 15 节改成 5 节）
RING_TOP = 0.012       # 上夹环顶（辐条与中心套）高出带子第 0 节
RING_GAP = 0.004       # 夹环内外圈与布面之间的缝
RING_W = 0.004         # 夹环内外圈的壁厚
HUB = dict(r=0.034, h=0.03, flange=0.042, fh=0.008)   # 中心套：接吊杆 / 芯的那一节（上下夹环同一副）
SPOKES = 6             # 中心套到夹环的辐条数
PLATE_T = 0.02         # 天花方板厚
PLATE_HALF = 0.167     # 天花方板半边长（= (芯半径 + 11) × s，与台架同一副数）
HANGER = dict(n=6, d0=0.092, dd=0.008, L=0.62)   # 吊杆：节数、最粗一节直径、逐节收、每节长
CORE = dict(d0=0.040, dd=0.004, L=0.30)          # 芯：最粗一节直径、逐节收、每节长（节数按最长行程现算）
RI_IN = ST_R - RING_GAP - RING_W   # 夹环内圈：内半径
RO_OUT = ST_R + RING_GAP + RING_W  # 夹环外圈：外半径

C_BOND = (0.88, 0.42, 0.24)


# ------------------------------------------------------------------ 小工具
def srgb(c):
    """站内色值是 sRGB；Blender 的材质色是线性的"""
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


def link(ob, coll):
    coll.objects.link(ob)
    return ob


def new_coll(name, parent):
    c = bpy.data.collections.new(name)
    parent.children.link(c)
    return c


def mesh_obj(name, verts, faces, coll, mats=None, mat_idx=None, smooth=None, uvs=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate(clean_customdata=False)
    if mats:
        for m in mats:
            me.materials.append(m)
    if mat_idx is not None:
        me.polygons.foreach_set('material_index', np.asarray(mat_idx, dtype=np.int32))
    if smooth is not None:
        me.polygons.foreach_set('use_smooth', np.asarray(smooth, dtype=bool))
    if uvs is not None:
        uv = me.uv_layers.new(name='UVMap')
        vi = np.empty(len(me.loops), dtype=np.int32)
        me.loops.foreach_get('vertex_index', vi)
        uv.data.foreach_set('uv', np.asarray(uvs, dtype=np.float32)[vi].ravel())
    me.update()
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def bm_obj(name, bm, coll, mat=None, smooth=True, bevel=0.0):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if mat:
        me.materials.append(mat)
    me.polygons.foreach_set('use_smooth', np.full(len(me.polygons), smooth, dtype=bool))
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    if bevel > 0:
        md = ob.modifiers.new('倒角', 'BEVEL')
        md.width = bevel
        md.segments = 2
        md.limit_method = 'ANGLE'
        md.angle_limit = math.radians(40)
        md.harden_normals = False
    return ob


def bm_cyl(bm, r, h, z0=0.0, segs=32, x=0.0, y=0.0, r2=None):
    """竖直圆柱 / 圆台：底面在 z0、高 h"""
    res = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=h)
    bmesh.ops.translate(bm, verts=res['verts'], vec=(x, y, z0 + h / 2))
    return res['verts']


def bm_tube(bm, ro, ri, h, z0=0.0, segs=48):
    """竖直圆管（壁厚 ro − ri，两端封环）"""
    vs = []
    for k in range(segs):
        a = 2 * math.pi * k / segs
        c, s = math.cos(a), math.sin(a)
        vs.append([bm.verts.new((ro * c, ro * s, z0)), bm.verts.new((ro * c, ro * s, z0 + h)),
                   bm.verts.new((ri * c, ri * s, z0 + h)), bm.verts.new((ri * c, ri * s, z0))])
    for k in range(segs):
        a, b = vs[k], vs[(k + 1) % segs]
        for q in range(4):
            bm.faces.new((a[q], b[q], b[(q + 1) % 4], a[(q + 1) % 4]))
    return vs


def bm_box(bm, cx, cy, cz, hx, hy, hz, rot=0.0):
    c, s = math.cos(rot), math.sin(rot)
    pts = []
    for dz in (-hz, hz):
        for dx, dy in ((-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy)):
            pts.append(bm.verts.new((cx + dx * c - dy * s, cy + dx * s + dy * c, cz + dz)))
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    for q in f:
        bm.faces.new([pts[i] for i in q])
    return pts


def bm_bolt_ring(bm, r, z, count, rad=0.0045, h=0.004, phase=0.0, up=True):
    for k in range(count):
        a = phase + 2 * math.pi * k / count
        bm_cyl(bm, rad, h, z if up else z - h, segs=6, x=r * math.cos(a), y=r * math.sin(a))


def anim_fcurve(id_owner, path, frames, values, index=0):
    """按样打线性关键帧（批量写，不走 keyframe_insert）"""
    if id_owner.animation_data is None:
        id_owner.animation_data_create()
    ad = id_owner.animation_data
    if ad.action is None:
        ad.action = bpy.data.actions.new(f'{id_owner.name}·动作')
    act = ad.action
    fc = act.fcurves.find(path, index=index)
    if fc is None:
        fc = act.fcurves.new(path, index=index)
    if ad.action_slot is None and len(act.slots):
        ad.action_slot = act.slots[0]
    kp = fc.keyframe_points
    kp.add(len(frames))
    co = np.empty(2 * len(frames), dtype=np.float32)
    co[0::2] = frames
    co[1::2] = values
    kp.foreach_set('co', co)
    kp.foreach_set('interpolation', np.full(len(frames), bpy.types.Keyframe.bl_rna.properties['interpolation'].enum_items['LINEAR'].value, dtype=np.int32))
    fc.update()
    return fc


# ------------------------------------------------------------------ 材质
MATS = {}


def principled(name, color, metal=0.0, rough=0.5, alpha=1.0, sheen=0.0, emit=None, emit_k=0.0, coat=0.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*srgb(color), 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    p.inputs['Alpha'].default_value = alpha
    if sheen:
        p.inputs['Sheen Weight'].default_value = sheen
    if coat:
        p.inputs['Coat Weight'].default_value = coat
    if emit:
        p.inputs['Emission Color'].default_value = (*srgb(emit), 1)
        p.inputs['Emission Strength'].default_value = emit_k
    if alpha < 1:
        m.surface_render_method = 'BLENDED'
        m.use_transparency_overlap = True
    m.diffuse_color = (*srgb(color), alpha)
    MATS[name] = m
    return m


def fabric_mat():
    """布：两色条纹（台架的 A 绿 / B 灰纱，每 8 节一换），稍带绒光"""
    if '布·条纹' in MATS:
        return MATS['布·条纹']
    m = bpy.data.materials.new('布·条纹')
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    p.inputs['Roughness'].default_value = 0.82
    p.inputs['Sheen Weight'].default_value = 0.35
    uv = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    mod = nt.nodes.new('ShaderNodeMath')
    mod.operation = 'MODULO'
    mod.inputs[1].default_value = 2.0
    gt = nt.nodes.new('ShaderNodeMath')
    gt.operation = 'GREATER_THAN'
    gt.inputs[1].default_value = 1.0
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = (*srgb((0.42, 0.76, 0.58)), 1)
    mix.inputs['B'].default_value = (*srgb((0.62, 0.66, 0.63)), 1)
    nt.links.new(uv.outputs['UV'], sep.inputs[0])
    nt.links.new(sep.outputs['X'], mod.inputs[0])
    nt.links.new(mod.outputs[0], gt.inputs[0])
    nt.links.new(gt.outputs[0], mix.inputs['Factor'])
    nt.links.new(mix.outputs['Result'], p.inputs['Base Color'])
    m.diffuse_color = (*srgb((0.5, 0.7, 0.6)), 1)
    MATS['布·条纹'] = m
    return m


def materials():
    return dict(
        fabric=fabric_mat(),
        membrane=principled('膜·纱', (0.55, 0.72, 0.62), rough=0.7, alpha=0.32, sheen=0.4),
        alu=principled('铝·拉丝', (0.78, 0.79, 0.8), metal=1.0, rough=0.32),
        dark=principled('铝·深灰阳极', (0.1, 0.11, 0.12), metal=0.85, rough=0.38),
        steel=principled('钢·螺栓', (0.62, 0.63, 0.64), metal=1.0, rough=0.22),
        pad=principled('键座·石墨', (0.07, 0.075, 0.08), rough=0.45, coat=0.2),
        strut=principled('键·撑杆', C_BOND, metal=0.35, rough=0.32, coat=0.3),
        rubber=principled('橡胶', (0.03, 0.03, 0.035), rough=0.85),
        ceiling=principled('天花', (0.13, 0.145, 0.155), rough=0.9),
        floor=principled('地面', (0.085, 0.095, 0.1), rough=0.55),
        wall=principled('墙', (0.11, 0.12, 0.125), rough=0.9),
        pcb=principled('电路板', (0.05, 0.25, 0.16), rough=0.5),
        copper=principled('铜', (0.85, 0.55, 0.35), metal=1.0, rough=0.3),
        led=principled('指示灯', (0.4, 0.9, 0.6), emit=(0.45, 0.95, 0.65), emit_k=6.0),
        motor=principled('电机壳', (0.16, 0.17, 0.18), metal=0.6, rough=0.42),
        cable=principled('线缆', (0.05, 0.05, 0.055), rough=0.6),
        label=principled('名牌', (0.86, 0.9, 0.86), rough=0.5, emit=(0.86, 0.9, 0.86), emit_k=1.2),
        label_dim=principled('名牌·次', (0.62, 0.7, 0.66), rough=0.5, emit=(0.62, 0.7, 0.66), emit_k=0.9),
    )


# ------------------------------------------------------------------ 带子：一档一份网格（同档二十条带共用，形态键随之共用）
SECTION = None


def section():
    """带子截面（Y 横向, N 法向）：中间是 4 mm 的布，两边各一道 4 mm 宽的包边（稍鼓），共 10 点"""
    hw, b, t, tb = BW / 2, HEM_B, FAB_T, HEM_T
    return np.array([(-hw + b, t), (hw - b, t), (hw - b * 0.45, tb), (hw, 0.0), (hw - b * 0.45, -tb),
                     (hw - b, -t), (-hw + b, -t), (-hw + b * 0.45, -tb), (-hw, 0.0), (-hw + b * 0.45, tb)])


def frames_of(P):
    """剖面折线（n×2，(r, z)）的切向与法向：法向 = 切向转 −90°（直垂时朝外）"""
    T = np.zeros_like(P)
    T[1:-1] = P[2:] - P[:-2]
    T[0] = P[1] - P[0]
    T[-1] = P[-1] - P[-2]
    T /= np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-9)
    N = np.stack([-T[:, 1], T[:, 0]], axis=1)
    return T, N


class BandBuilder:
    """一档带子的网格：布 + 键座 + 撑杆。拓扑固定，逐样只换顶点。"""

    def __init__(self, n, bonds, samples_tier):
        self.n = n
        self.sec = section()
        self.ns = len(self.sec)
        self.bonds = [b for b in bonds if not b.get('allHidden')]
        # 键座朝哪一面：取这颗键扣着时，对方在本节点法向的哪一侧（从没扣过 = 朝外）
        self.side_i, self.side_j = [], []
        for bi, b in enumerate(self.bonds):
            si = sj = 1.0
            for st in samples_tier:
                if st['L'][b['_k']]:
                    P = np.stack([np.asarray(st['x']) + ST_R, np.asarray(st['z'])], axis=1)
                    T, N = frames_of(P)
                    d = P[b['j']] - P[b['i']]
                    si = 1.0 if np.dot(N[b['i']], d) >= 0 else -1.0
                    sj = 1.0 if np.dot(N[b['j']], -d) >= 0 else -1.0
                    break
            self.side_i.append(si)
            self.side_j.append(sj)
        self.faces, self.mat_idx, self.smooth, self.uv = self._topology()

    def _topology(self):
        n, ns = self.n, self.ns
        faces, mi, sm = [], [], []
        for i in range(n - 1):
            for k in range(ns):
                a, b = i * ns + k, i * ns + (k + 1) % ns
                faces.append((a, b, b + ns, a + ns))
                mi.append(0)
                sm.append(True)
        faces.append(tuple(range(ns - 1, -1, -1)))
        faces.append(tuple((n - 1) * ns + k for k in range(ns)))
        mi += [0, 0]
        sm += [False, False]
        base = n * ns
        cube = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        self.pad_base = base
        for _ in self.bonds:
            for q in range(4):  # 键座 i、键座 j、外套、内杆
                for f in cube:
                    faces.append(tuple(base + v for v in f))
                    mi.append(2 if q == 3 else 1)  # 内杆橙色，其余石墨
                    sm.append(False)
                base += 8
        self.nverts = base
        uv = np.zeros((base, 2), dtype=np.float32)
        for i in range(n):
            uv[i * ns:(i + 1) * ns, 0] = i / 8.0
            uv[i * ns:(i + 1) * ns, 1] = np.arange(ns) / ns
        return faces, mi, sm, uv

    @staticmethod
    def _box(o, ax_u, ax_v, ax_w, hu, hv, hw):
        """以 o 为中心、三根轴（三维单位向量）为边的长方体 8 点"""
        out = []
        for dw in (-hw, hw):
            for du, dv in ((-hu, -hv), (hu, -hv), (hu, hv), (-hu, hv)):
                out.append(o + du * ax_u + dv * ax_v + dw * ax_w)
        return out

    def verts(self, st):
        """一个样的全部顶点（带子本地系：径向 +X、横向 +Y、竖直 +Z）"""
        n, ns = self.n, self.ns
        P = np.stack([np.asarray(st['x']) + ST_R, np.asarray(st['z'])], axis=1)
        T, N = frames_of(P)
        V = np.zeros((self.nverts, 3))
        # 布：每节一圈截面
        Y = self.sec[:, 0]
        NN = self.sec[:, 1]
        V[:n * ns, 0] = (P[:, 0:1] + NN[None, :] * N[:, 0:1]).ravel()
        V[:n * ns, 1] = np.broadcast_to(Y[None, :], (n, ns)).ravel()
        V[:n * ns, 2] = (P[:, 1:2] + NN[None, :] * N[:, 1:2]).ravel()
        to3 = lambda v: np.array([v[0], 0.0, v[1]])
        ey = np.array([0.0, 1.0, 0.0])
        base = n * ns
        for bi, b in enumerate(self.bonds):
            i, j = b['i'], b['j']
            si, sj = self.side_i[bi], self.side_j[bi]
            Ti, Ni, Tj, Nj = to3(T[i]), to3(N[i]), to3(T[j]), to3(N[j])
            pi = to3(P[i]) + si * Ni * (FAB_T + PAD['H'] / 2)
            pj = to3(P[j]) + sj * Nj * (FAB_T + PAD['H'] / 2)
            V[base:base + 8] = self._box(pi, Ti, ey, si * Ni, PAD['L'] / 2, PAD['W'] / 2, PAD['H'] / 2)
            V[base + 8:base + 16] = self._box(pj, Tj, ey, sj * Nj, PAD['L'] / 2, PAD['W'] / 2, PAD['H'] / 2)
            # 伸缩撑杆：扣上 = 外套朝对面键座、内杆伸到对面键座顶面；没扣 = 内杆缩回外套，外套垂直于布立着
            hi = to3(P[i]) + si * Ni * (FAB_T + PAD['H'])
            if st['L'][b['_k']] and (SHOW_SEAM or st['p'] not in (b.get('hidden') or [])):
                hj = to3(P[j]) + sj * Nj * (FAB_T + PAD['H'])
                u = hj - hi
                L = np.linalg.norm(u)
                u = u / max(L, 1e-9)
            else:
                u = si * Ni
                L = SLEEVE['L'] - 0.004
                hj = hi + u * L
            w = np.cross(u, ey)
            ls = min(SLEEVE['L'], L)
            V[base + 16:base + 24] = self._box(hi + u * ls / 2, u, ey, w, ls / 2, SLEEVE['W'] / 2, SLEEVE['T'] / 2)
            r0 = hi + u * 0.004
            V[base + 24:base + 32] = self._box((r0 + hj) / 2, u, ey, w, np.linalg.norm(hj - r0) / 2, ROD['W'] / 2, ROD['T'] / 2)
            base += 32
        return V


def membrane_map(n, ma, mb, w):
    """膜的 B 边在 A 边第 i 节对面取 B 的哪个（小数）序号：两档结构中心对齐、中心两侧各 w 节逐节对位，其余分段线性
    摊到带顶 / 带底（与站上 cohabit-solid 的 membraneIndex 同一读法）。中心相同时恒等。"""
    i = np.arange(n, dtype=float)
    if ma == mb:
        return i
    return np.interp(i, [0, ma - w, ma + w, n - 1], [0, mb - w, mb + w, n - 1])


def membrane_verts(stA, stB, pair=None):
    """相邻两条带之间的膜：A 边 = 本条带 +Y 那条包边，B 边 = 下一条带 −Y 那条包边（转过一个角节距）。
    pair = (A 档结构中心, B 档结构中心, 半长)：两档结构中心序号不同时（方台结构贴底的排法），B 边按中心对位插值取点。"""
    xa = np.asarray(stA['x']) + ST_R
    za = np.asarray(stA['z'])
    xb = np.asarray(stB['x']) + ST_R
    zb = np.asarray(stB['z'])
    if pair is not None and pair[0] != pair[1]:
        t = membrane_map(len(xa), *pair)
        k = np.arange(len(xb), dtype=float)
        xb = np.interp(t, k, xb)
        zb = np.interp(t, k, zb)
    c, s = math.cos(DANG), math.sin(DANG)
    yb = -BW / 2
    A = np.stack([xa, np.full_like(xa, BW / 2), za], axis=1)
    B = np.stack([xb * c - yb * s, xb * s + yb * c, zb], axis=1)
    return np.concatenate([A, B])


def shape_keyed(name, coll, builder_verts, faces, samples_idx, mats, mat_idx=None, smooth=None, uvs=None, frames=None):
    """一份网格 + 每个样一个绝对式形态键 + eval_time 的线性关键帧"""
    V0 = builder_verts(samples_idx[0])
    ob = mesh_obj(name, V0, faces, coll, mats=mats, mat_idx=mat_idx, smooth=smooth, uvs=uvs)
    ob.shape_key_add(name='样0', from_mix=False)
    key = ob.data.shape_keys
    key.use_relative = False
    key.name = f'{name}·形态键'
    for k, st in enumerate(samples_idx[1:], start=1):
        kb = ob.shape_key_add(name=f'样{k}', from_mix=False)
        kb.interpolation = 'KEY_LINEAR'
        kb.data.foreach_set('co', builder_verts(st).astype(np.float32).ravel())
    key.key_blocks[0].interpolation = 'KEY_LINEAR'
    vals = [kb.frame for kb in key.key_blocks]
    anim_fcurve(key, 'eval_time', frames, vals)
    return ob


# ------------------------------------------------------------------ 机构件
def _clamp_ring(bm_parts, z0, h):
    """一圈夹带子的环：内圈 + 外圈（布从两圈之间穿过），z0 = 环底、高 h"""
    bm_tube(bm_parts, ST_R - RING_GAP, RI_IN, h, z0, segs=72)
    bm_tube(bm_parts, RO_OUT, ST_R + RING_GAP, h, z0, segs=72)


def _spokes(bm, z, t=0.006, w=0.012):
    """中心套到夹环内圈的辐条（扁条，竖放）：z = 辐条中心高"""
    r0, r1 = HUB['r'] - 0.002, RI_IN + 0.002
    for k in range(SPOKES):
        a = (k + 0.5) * 2 * math.pi / SPOKES
        rm = (r0 + r1) / 2
        bm_box(bm, rm * math.cos(a), rm * math.sin(a), z, (r1 - r0) / 2, t / 2, w / 2, rot=a)


def _band_screws(bm, z):
    """每条带一颗夹紧螺钉（外圈上，正对带子中线）"""
    for k in range(NB):
        a = k * DANG
        res = bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.0026, radius2=0.0026, depth=0.003)
        bmesh.ops.rotate(bm, verts=res['verts'], cent=(0, 0, 0), matrix=mathutils.Matrix.Rotation(math.pi / 2, 3, 'Y'))
        bmesh.ops.rotate(bm, verts=res['verts'], cent=(0, 0, 0), matrix=mathutils.Matrix.Rotation(a, 3, 'Z'))
        r = RO_OUT + 0.0015
        bmesh.ops.translate(bm, verts=res['verts'], vec=(r * math.cos(a), r * math.sin(a), z))


def build_carriage(coll, mats, lead):
    """上夹环（2026-10-30 改轻）：一圈窄的内外圈夹住带子前 CLAMP_N 节，六根扁辐条接到中心套，中心套上接吊杆、下挂芯。
    原来是 0.29 m 粗、0.2 m 高的整只鼓（外壳 + 实心内毂，夹 22 节），作者嫌笨重。"""
    n = min(lead, CLAMP_N)
    z0 = -(n - 1) * SEG - 0.006
    h = RING_TOP - z0
    bm = bmesh.new()
    _clamp_ring(bm, z0, h)
    ring = bm_obj('上夹环·夹圈', bm, coll, mats['alu'], bevel=0.0008)
    bm = bmesh.new()
    _spokes(bm, RING_TOP - 0.004)
    bm_tube(bm, RO_OUT, RI_IN, 0.003, RING_TOP - 0.003, segs=72)            # 顶上一道压圈，把内外圈连成一体
    spokes = bm_obj('上夹环·辐条', bm, coll, mats['dark'], smooth=False, bevel=0.0008)
    bm = bmesh.new()
    bm_cyl(bm, HUB['r'], HUB['h'], RING_TOP - HUB['h'], segs=40)             # 中心套
    bm_cyl(bm, HUB['flange'], HUB['fh'], RING_TOP, segs=40)                  # 接吊杆的法兰
    hub = bm_obj('上夹环·中心套', bm, coll, mats['dark'], bevel=0.0012)
    bm = bmesh.new()
    bm_bolt_ring(bm, HUB['flange'] - 0.008, RING_TOP + HUB['fh'], 6, rad=0.003)
    _band_screws(bm, z0 + h / 2)
    bolts = bm_obj('上夹环·螺钉', bm, coll, mats['steel'], smooth=False)
    bm = bmesh.new()
    bm_tube(bm, RO_OUT + 0.0006, RO_OUT - 0.0004, 0.003, z0 + 0.002, segs=72)   # 指示灯：外圈下沿一圈细光带
    led = bm_obj('上夹环·指示灯', bm, coll, mats['led'])
    return [ring, spokes, hub, bolts, led]


def build_foot(coll, mats, tail):
    """下夹环（2026-10-30 改轻）：同上夹环的夹圈，夹住带子末 CLAMP_N 节，辐条在下面接中心套（芯插在中心套里），
    夹圈下一道薄橡胶圈防撞。原来是夹 15 节的整只鼓 + 底盖，作者嫌笨重。"""
    n = min(tail, CLAMP_N)
    z0 = -0.008
    h = (n - 1) * SEG + 0.006 - z0
    bm = bmesh.new()
    _clamp_ring(bm, z0, h)
    ring = bm_obj('下夹环·夹圈', bm, coll, mats['alu'], bevel=0.0008)
    bm = bmesh.new()
    _spokes(bm, z0 + 0.004)
    bm_tube(bm, RO_OUT, RI_IN, 0.003, z0, segs=72)                          # 底下一道压圈
    spokes = bm_obj('下夹环·辐条', bm, coll, mats['dark'], smooth=False, bevel=0.0008)
    bm = bmesh.new()
    bm_cyl(bm, HUB['r'], HUB['h'], z0, segs=40)                              # 中心套（芯插在里面）
    bm_cyl(bm, HUB['r'] - 0.006, 0.006, z0 - 0.006, segs=40)                 # 中心套底的端盖
    hub = bm_obj('下夹环·中心套', bm, coll, mats['dark'], bevel=0.0012)
    bm = bmesh.new()
    bm_tube(bm, RO_OUT + 0.001, RI_IN - 0.001, 0.004, z0 - 0.004, segs=72)
    bump = bm_obj('下夹环·防撞圈', bm, coll, mats['rubber'])
    bm = bmesh.new()
    _band_screws(bm, z0 + h / 2)
    bolts = bm_obj('下夹环·螺钉', bm, coll, mats['steel'], smooth=False)
    return [ring, spokes, hub, bump, bolts]


def build_stage(coll, mats, name, d, L, mat, collar=True):
    """伸缩杆的一节：原点在这一节的下端，向上长 L；下端一道箍（限位环）"""
    bm = bmesh.new()
    bm_tube(bm, d / 2, d / 2 - 0.0025, L, 0.0, segs=40)
    ob = bm_obj(name, bm, coll, mat, bevel=0.0008)
    if collar:
        bm = bmesh.new()
        bm_tube(bm, d / 2 + 0.0045, d / 2 - 0.001, 0.016, 0.0, segs=40)
        bm_bolt_ring(bm, d / 2 + 0.0045, 0.008, 2, rad=0.0025, h=0.003)
        c = bm_obj(name + '·箍', bm, coll, mats['dark'], bevel=0.0008)
        c.parent = ob
    return ob


def build_plate(coll, mats, hole=0.06):
    """天花方板：边与房间轴对齐，中间开孔过吊杆，四角埋头螺钉"""
    bm = bmesh.new()
    # 方板 = 一块方板挖掉中孔：用环形扇区拼（方外框 + 圆内孔，64 段）
    segs = 64
    outer, inner = [], []
    for k in range(segs):
        a = 2 * math.pi * k / segs
        c, s = math.cos(a), math.sin(a)
        m = PLATE_HALF / max(abs(c), abs(s))
        outer.append((m * c, m * s))
        inner.append((hole * c, hole * s))
    for z0, z1 in ((CEIL - PLATE_T, CEIL),):
        vo0 = [bm.verts.new((x, y, z0)) for x, y in outer]
        vo1 = [bm.verts.new((x, y, z1)) for x, y in outer]
        vi0 = [bm.verts.new((x, y, z0)) for x, y in inner]
        vi1 = [bm.verts.new((x, y, z1)) for x, y in inner]
        for k in range(segs):
            l = (k + 1) % segs
            bm.faces.new((vo0[k], vo0[l], vi0[l], vi0[k]))
            bm.faces.new((vo1[l], vo1[k], vi1[k], vi1[l]))
            bm.faces.new((vo0[l], vo0[k], vo1[k], vo1[l]))
            bm.faces.new((vi0[k], vi0[l], vi1[l], vi1[k]))
    plate = bm_obj('天花方板', bm, coll, mats['ceiling'], smooth=False, bevel=0.002)
    bm = bmesh.new()
    for sx in (-1, 1):
        for sy in (-1, 1):
            bm_cyl(bm, 0.006, 0.002, CEIL - PLATE_T - 0.002, segs=12, x=sx * (PLATE_HALF - 0.02), y=sy * (PLATE_HALF - 0.02))
    screws = bm_obj('天花方板·螺钉', bm, coll, mats['steel'], smooth=False)
    bm = bmesh.new()
    bm_tube(bm, hole + 0.004, hole - 0.004, 0.006, CEIL - PLATE_T - 0.006, segs=48)
    lip = bm_obj('天花方板·孔圈', bm, coll, mats['dark'])
    return [plate, screws, lip]


def bm_rod(bm, p0, p1, r, segs=10):
    """两点之间的一根圆杆（钢缆、拉杆）"""
    p0, p1 = mathutils.Vector(p0), mathutils.Vector(p1)
    d = p1 - p0
    res = bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=d.length)
    q = mathutils.Vector((0, 0, 1)).rotation_difference(d.normalized())
    bmesh.ops.rotate(bm, verts=res['verts'], cent=(0, 0, 0), matrix=q.to_matrix())
    bmesh.ops.translate(bm, verts=res['verts'], vec=(p0 + p1) / 2)


def bm_xcyl(bm, r, x0, x1, y, z, segs=32):
    """沿 X 轴躺着的圆柱（电机、卷筒）"""
    res = bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=x1 - x0)
    bmesh.ops.rotate(bm, verts=res['verts'], cent=(0, 0, 0), matrix=mathutils.Matrix.Rotation(math.pi / 2, 3, 'Y'))
    bmesh.ops.translate(bm, verts=res['verts'], vec=((x0 + x1) / 2, y, z))


def build_housing(coll, mats):
    """天花机箱（天花板上方的设备层里）：两套电机 + 减速箱 + 卷筒（一套放吊杆、一套收放芯），
    钢缆经顶上两个滑轮转进杆心往下走；控制板（带散热片与指示灯）；给键供电的弹簧卷线器。
    外壳只画框，剖切图里看得见里面。中间一柱（半径 0.06）留给收起时缩进来的吊杆。"""
    z0 = CEIL + 0.06
    H = 0.66
    hw = 0.21
    parts = []
    bm = bmesh.new()
    for sx in (-1, 1):
        for sy in (-1, 1):
            bm_box(bm, sx * (hw - 0.01), sy * (hw - 0.01), z0 + H / 2, 0.01, 0.01, H / 2)
    for z in (z0 + 0.01, z0 + H - 0.01):
        for sx in (-1, 1):
            bm_box(bm, sx * (hw - 0.01), 0, z, 0.01, hw, 0.01)
            bm_box(bm, 0, sx * (hw - 0.01), z, hw, 0.01, 0.01)
    parts.append(bm_obj('天花机箱·框架', bm, coll, mats['dark'], smooth=False, bevel=0.002))
    bm = bmesh.new()
    for sy in (-1, 1):
        bm_box(bm, 0, sy * 0.13, z0 + 0.008, hw - 0.02, 0.07, 0.008)          # 两侧的底板（中间留给吊杆）
    bm_box(bm, 0, 0, z0 + H + 0.03, 0.42, 0.04, 0.025)                          # 吊挂横梁（接楼板）
    parts.append(bm_obj('天花机箱·底板与吊梁', bm, coll, mats['motor'], smooth=False, bevel=0.002))
    zc = z0 + 0.2
    for name, y in (('吊杆驱动', -0.13), ('芯驱动', 0.13)):
        bm = bmesh.new()
        bm_xcyl(bm, 0.04, -0.19, -0.07, y, zc)                                 # 电机
        bm_box(bm, -0.045, y, zc, 0.025, 0.05, 0.05)                           # 减速箱
        bm_box(bm, -0.045, y, zc - 0.07, 0.03, 0.06, 0.012)                    # 电机座
        parts.append(bm_obj(f'天花机箱·{name}·电机', bm, coll, mats['motor'], bevel=0.003))
        bm = bmesh.new()
        bm_xcyl(bm, 0.048, -0.018, -0.008, y, zc, segs=40)                     # 卷筒凸缘
        bm_xcyl(bm, 0.03, -0.008, 0.1, y, zc, segs=40)                         # 卷筒芯
        bm_xcyl(bm, 0.048, 0.1, 0.11, y, zc, segs=40)
        bm_box(bm, 0.125, y, zc - 0.035, 0.008, 0.035, 0.05)                   # 轴承座
        parts.append(bm_obj(f'天花机箱·{name}·卷筒', bm, coll, mats['alu'], bevel=0.0015))
        bm = bmesh.new()
        bm_xcyl(bm, 0.036, -0.006, 0.07, y, zc, segs=40)                       # 缠着的钢缆
        parts.append(bm_obj(f'天花机箱·{name}·钢缆', bm, coll, mats['steel']))
        bm = bmesh.new()
        sy = 1 if y > 0 else -1
        top = (0.04, y, zc + 0.036)
        sheave = (0.0, sy * 0.025, z0 + H - 0.09)
        bm_rod(bm, top, (sheave[0], sheave[1], sheave[2] + 0.02), 0.0018)
        bm_rod(bm, (0.0, sy * 0.005, sheave[2] - 0.0), (0.0, sy * 0.005, z0 - 0.02), 0.0018)
        parts.append(bm_obj(f'天花机箱·{name}·走线', bm, coll, mats['steel']))
        bm = bmesh.new()
        res = bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.022, radius2=0.022, depth=0.01)
        bmesh.ops.rotate(bm, verts=res['verts'], cent=(0, 0, 0), matrix=mathutils.Matrix.Rotation(math.pi / 2, 3, 'X'))
        bmesh.ops.translate(bm, verts=res['verts'], vec=sheave)
        bm_box(bm, 0.0, sy * 0.025, sheave[2] + 0.045, 0.012, 0.012, 0.035)    # 滑轮架
        parts.append(bm_obj(f'天花机箱·{name}·滑轮', bm, coll, mats['dark'], bevel=0.001))
    bm = bmesh.new()
    bm_box(bm, 0.13, 0.0, z0 + 0.5, 0.06, 0.09, 0.003)
    parts.append(bm_obj('天花机箱·控制板', bm, coll, mats['pcb'], smooth=False))
    bm = bmesh.new()
    for q in range(7):
        bm_box(bm, 0.09 + q * 0.012, -0.03, z0 + 0.518, 0.0018, 0.035, 0.015)
    parts.append(bm_obj('天花机箱·散热片', bm, coll, mats['alu'], smooth=False))
    bm = bmesh.new()
    for q in range(5):
        bm_box(bm, 0.1 + q * 0.016, 0.055, z0 + 0.507, 0.005, 0.008, 0.004)
    bm_box(bm, 0.175, 0.0, z0 + 0.512, 0.006, 0.04, 0.009)                     # 接线端子
    parts.append(bm_obj('天花机箱·元件', bm, coll, mats['motor'], smooth=False))
    bm = bmesh.new()
    bm_cyl(bm, 0.003, 0.004, z0 + 0.503, segs=12, x=0.08, y=0.075)
    parts.append(bm_obj('天花机箱·指示灯', bm, coll, mats['led']))
    bm = bmesh.new()
    bm_cyl(bm, 0.05, 0.03, z0 + 0.48, segs=40, x=-0.13, y=0.0)
    bm_rod(bm, (-0.13, 0.0, z0 + 0.48), (-0.03, 0.0, z0 + 0.05), 0.0025)
    parts.append(bm_obj('天花机箱·卷线器', bm, coll, mats['dark'], bevel=0.002))
    # 设备层里的检修灯（天花板挡着，只在剖切图里起作用）
    parts.append(area_light(coll, '天花机箱·检修灯', (0.3, -0.35, z0 + H + 0.12), look_rot((0.3, -0.35, z0 + H + 0.12), (0, 0, z0 + 0.25)), 0.4, 40, (1.0, 0.96, 0.9)))
    return parts


# ------------------------------------------------------------------ 一台单元
def sample_frames(samples):
    return np.array([round(s['t'] * FPS) for s in samples], dtype=np.float32)


def core_stage_count(unit):
    longest = max(s['tiers'][0]['z'][0] for s in unit['samples']) + RING_TOP - 2 * HUB['h']
    usable = CORE['L'] - 0.05
    return max(3, int(math.ceil(longest / usable)) + 1)


def build_unit(unit, parent_coll, mats, detail=True, housing=False):
    name = unit['name']
    coll = new_coll(f'单元·{name}', parent_coll)
    root = bpy.data.objects.new(f'{name}·根', None)
    root.empty_display_size = 0.2
    coll.objects.link(root)
    root.location = (unit['place'][0], unit['place'][1], 0.0)
    samples = unit['samples']
    frames = sample_frames(samples)
    foot = bpy.data.objects.new(f'{name}·下夹环位置', None)
    foot.empty_display_size = 0.15
    coll.objects.link(foot)
    foot.parent = root
    anim_fcurve(foot, 'location', frames, np.array([s['foot'] for s in samples], dtype=np.float32), index=2)

    # 带子：每档一份网格（同档的带共用 mesh 数据，形态键因此共用）
    bandc = new_coll(f'{name}·带子', coll)
    tier_mesh = []
    for ti, tier in enumerate(unit['tiers']):
        bonds = tier['bonds']
        for k, b in enumerate(bonds):
            b['_k'] = k
            b['allHidden'] = (not SHOW_SEAM) and bool(b.get('hidden')) and set(b['hidden']) >= set(b['programs'])
        tier_samples = [dict(s['tiers'][ti], p=s['p']) for s in samples]
        bb = BandBuilder(unit['n'], bonds, tier_samples)
        ob = shape_keyed(f'{name}·带·{tier["name"]}', bandc, bb.verts, bb.faces, tier_samples,
                         [mats['fabric'], mats['pad'], mats['strut']], bb.mat_idx, bb.smooth, bb.uv, frames)
        tier_mesh.append(ob.data)
        bandc.objects.unlink(ob)
        bpy.data.objects.remove(ob)
    order = unit['order']
    for j in range(NB):
        ob = bpy.data.objects.new(f'{name}·带{j:02d}', tier_mesh[order[j]])
        bandc.objects.link(ob)
        ob.parent = foot
        ob.rotation_euler = (0, 0, unit['angle0'] + j * DANG)

    # 带间的膜：每种相邻档位组合一份
    memc = new_coll(f'{name}·膜', coll)
    pair_mesh = {}
    for j in range(NB):
        a, b = order[j], order[(j + 1) % NB]
        if (a, b) not in pair_mesh:
            n = unit['n']
            faces = [(i, i + 1, n + i + 1, n + i) for i in range(n - 1)]
            sa = [s['tiers'][a] for s in samples]
            sb = [s['tiers'][b] for s in samples]
            idx = list(range(len(samples)))
            ta, tb = unit['tiers'][a], unit['tiers'][b]
            pair = (ta['mid'], tb['mid'], min(ta['midHalf'], tb['midHalf']))
            ob = shape_keyed(f'{name}·膜·{a}{b}', memc, lambda k: membrane_verts(sa[k], sb[k], pair), faces, idx,
                             [mats['membrane']], smooth=[True] * len(faces), frames=frames)
            pair_mesh[(a, b)] = ob.data
            memc.objects.unlink(ob)
            bpy.data.objects.remove(ob)
        ob = bpy.data.objects.new(f'{name}·膜{j:02d}', pair_mesh[(a, b)])
        memc.objects.link(ob)
        ob.parent = foot
        ob.rotation_euler = (0, 0, unit['angle0'] + j * DANG)

    # 下夹环（随下夹环位置走）
    mechc = new_coll(f'{name}·机构', coll)
    for ob in build_foot(mechc, mats, unit['tail']):
        ob.parent = foot
        ob.rotation_euler = (0, 0, unit['angle0'])
    # 上夹环：高度 = 下夹环 + 带子第 0 节的高度
    top_rel = np.array([s['tiers'][0]['z'][0] for s in samples], dtype=np.float32)
    foot_z = np.array([s['foot'] for s in samples], dtype=np.float32)
    carr = bpy.data.objects.new(f'{name}·上夹环位置', None)
    carr.empty_display_size = 0.15
    mechc.objects.link(carr)
    carr.parent = root
    anim_fcurve(carr, 'location', frames, foot_z + top_rel, index=2)
    for ob in build_carriage(mechc, mats, unit['lead']):
        ob.parent = carr
        ob.rotation_euler = (0, 0, unit['angle0'])
    # 吊杆：天花方板下沿到上夹环顶，节数固定，逐节等分伸出量
    plate_bot = CEIL - PLATE_T
    E = plate_bot - (foot_z + top_rel + RING_TOP + HUB['fh'])
    nh = HANGER['n']
    for k in range(nh):
        d = HANGER['d0'] - k * HANGER['dd']
        st = build_stage(mechc, mats, f'{name}·吊杆{k}', d, HANGER['L'], mats['alu'], collar=k > 0)
        st.parent = root
        bottom = plate_bot - E * k / (nh - 1) if k > 0 else np.full_like(E, plate_bot - 0.004)
        if k == nh - 1:
            bottom = plate_bot - E
        anim_fcurve(st, 'location', frames, bottom, index=2)
    # 芯：上夹环中心套底面到下夹环中心套顶面，最粗一节挂在上夹环下、往上缩进吊杆里
    carr_bot = foot_z + top_rel + RING_TOP - HUB['h']
    foot_top = foot_z - 0.008 + HUB['h']
    Lc = carr_bot - foot_top
    nc = core_stage_count(unit)
    for k in range(nc):
        d = CORE['d0'] - k * (CORE['d0'] - 0.016) / max(1, nc - 1)
        st = build_stage(mechc, mats, f'{name}·芯{k}', d, CORE['L'], mats['dark'] if k % 2 else mats['alu'], collar=k > 0)
        st.parent = root
        bottom = carr_bot - Lc * k / (nc - 1)
        anim_fcurve(st, 'location', frames, bottom.astype(np.float32), index=2)
    # 天花方板（静件）
    platec = new_coll(f'{name}·天花', coll)
    for ob in build_plate(platec, mats):
        ob.parent = root
    if housing:
        hc = new_coll(f'{name}·天花机箱', coll)
        for ob in build_housing(hc, mats):
            ob.parent = root
    return coll, root


# ------------------------------------------------------------------ 布景
def build_room(coll, mats, half=4.0, walls=True, grid=None):
    """地面 + 天花（下表面在 CEIL）+ 两面墙（相机在另一侧，墙只在远端露内表面）"""
    bm = bmesh.new()
    bm_box(bm, 0, 0, -0.05, half, half, 0.05)
    floor = bm_obj('地面', bm, coll, mats['floor'], smooth=False)
    bm = bmesh.new()
    bm_box(bm, 0, 0, CEIL + 0.03, half, half, 0.03)
    ceil = bm_obj('天花板', bm, coll, mats['ceiling'], smooth=False)
    out = [floor, ceil]
    if walls:
        bm = bmesh.new()
        bm_box(bm, -half - 0.05, 0, CEIL / 2, 0.05, half, CEIL / 2)
        bm_box(bm, 0, half + 0.05, CEIL / 2, half, 0.05, CEIL / 2)
        out.append(bm_obj('墙', bm, coll, mats['wall'], smooth=False))
    if grid:
        # 天花上其余格子的方板（收着的单元只露一块板，表示这是阵列中的一台）
        pitch, n = grid
        bm = bmesh.new()
        for r in range(n):
            for c in range(n):
                x = (c - (n - 1) / 2) * pitch
                y = (r - (n - 1) / 2) * pitch
                if abs(x) < 1e-6 and abs(y) < 1e-6:
                    continue
                bm_box(bm, x, y, CEIL - PLATE_T / 2, PLATE_HALF, PLATE_HALF, PLATE_T / 2)
        out.append(bm_obj('天花方板·其余格子', bm, coll, mats['ceiling'], smooth=False, bevel=0.002))
        # 格缝：一圈深色细线，读得出 0.83 m 的格子
        bm = bmesh.new()
        for k in range(n + 1):
            v = (k - n / 2) * pitch
            bm_box(bm, v, 0, CEIL - 0.001, 0.004, n * pitch / 2, 0.001)
            bm_box(bm, 0, v, CEIL - 0.001, n * pitch / 2, 0.004, 0.001)
        out.append(bm_obj('天花格缝', bm, coll, mats['dark'], smooth=False))
    return out


def build_figure(coll, parts, name, loc, look=(0.0, 0.0)):
    """人 / 猫（台架同一副方块模型）：原始朝向 = +Y，转到面朝 look 那一点"""
    rot = math.atan2(look[1] - loc[1], look[0] - loc[0]) - math.pi / 2
    obs = []
    for k, p in enumerate(parts):
        v = np.asarray(p['verts'], dtype=np.float64).reshape(-1, 3)
        idx = np.asarray(p['idx'], dtype=np.int64).reshape(-1, 3)
        mat = principled(f'{name}·{p["tone"]}', p['color'], rough=0.6)
        ob = mesh_obj(f'{name}·{p["tone"]}', v, idx, coll, mats=[mat])
        obs.append(ob)
    root = bpy.data.objects.new(f'{name}', None)
    coll.objects.link(root)
    for ob in obs:
        ob.parent = root
    root.location = loc
    root.rotation_euler = (0, 0, rot)
    return root


# ------------------------------------------------------------------ 名牌（文泉驿正黑，打包进 .blend）
FONT = None


def font():
    global FONT
    if FONT is None:
        for path in ('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',):
            try:
                FONT = bpy.data.fonts.load(path)
                FONT.pack()
                break
            except Exception as e:  # 没有中文字体就退回内置字体（中文会显示成方框）
                print('font', e)
        if FONT is None:
            FONT = bpy.data.fonts['Bfont Regular'] if 'Bfont Regular' in bpy.data.fonts else None
    return FONT


def text(coll, name, body, loc, size, mat, align='CENTER', rot=(math.pi / 2, 0, 0)):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body
    cu.size = size
    cu.align_x = align
    cu.align_y = 'BOTTOM'
    f = font()
    if f:
        cu.font = f
    cu.extrude = 0.0015
    ob = bpy.data.objects.new(name, cu)
    coll.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = rot
    cu.materials.append(mat)
    return ob


def plaque(coll, mats, label, loc, size=0.11):
    """地上立着的名牌：中文一行、英文一行（小一号）"""
    a = text(coll, f'名牌·{label["zh"]}', label['zh'], (loc[0], loc[1], loc[2] + size * 0.7), size, mats['label'])
    b = text(coll, f'名牌·{label["en"]}', label['en'], loc, size * 0.55, mats['label_dim'])
    return [a, b]


def face_camera(obs, cam):
    """名牌只绕竖轴转向相机（斜机位下不歪）"""
    for ob in obs:
        c = ob.constraints.new('LOCKED_TRACK')
        c.target = cam
        c.track_axis = 'TRACK_Z'
        c.lock_axis = 'LOCK_Y'


def hide_keys(ob, frames, visible):
    """按样打显隐（常量插值）"""
    for f, v in zip(frames, visible):
        ob.hide_render = not v
        ob.hide_viewport = not v
        ob.keyframe_insert('hide_render', frame=int(f))
        ob.keyframe_insert('hide_viewport', frame=int(f))
    for fc in ob.animation_data.action.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'CONSTANT'


# ------------------------------------------------------------------ 灯光、相机、渲染设置
def world(scene, color=(0.03, 0.045, 0.055), strength=1.0):
    w = bpy.data.worlds.new(f'{scene.name}·环境')
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (*srgb(color), 1)
    bg.inputs['Strength'].default_value = strength
    scene.world = w


def area_light(coll, name, loc, rot, size, power, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.size = size
    ld.energy = power
    ld.color = color
    ob = bpy.data.objects.new(name, ld)
    coll.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def look_rot(src, dst):
    import mathutils
    d = mathutils.Vector(dst) - mathutils.Vector(src)
    return d.to_track_quat('-Z', 'Y').to_euler()


def camera(coll, name, lens=35):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.clip_start = 0.05
    cd.clip_end = 100
    ob = bpy.data.objects.new(name, cd)
    coll.objects.link(ob)
    tgt = bpy.data.objects.new(name + '·注视点', None)
    coll.objects.link(tgt)
    c = ob.constraints.new('TRACK_TO')
    c.target = tgt
    c.track_axis = 'TRACK_NEGATIVE_Z'
    c.up_axis = 'UP_Y'
    return ob, tgt


def keypath(ob, keys, index_list=(0, 1, 2)):
    """keys = [(frame, (x, y, z)), …]：位置关键帧，贝塞尔自动缓动"""
    for f, p in keys:
        ob.location = p
        ob.keyframe_insert('location', frame=f)
    for fc in ob.animation_data.action.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'
            kp.handle_left_type = kp.handle_right_type = 'AUTO_CLAMPED'


def render_settings(scene, frame_end):
    scene.render.fps = FPS
    scene.frame_start = 1
    scene.frame_end = frame_end
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 5
    scene.cycles.glossy_bounces = 3
    scene.cycles.transmission_bounces = 3
    scene.cycles.transparent_max_bounces = 16
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.render.film_transparent = False


def new_scene(name):
    sc = bpy.data.scenes.new(name)
    sc.unit_settings.system = 'METRIC'
    return sc


# ------------------------------------------------------------------ 三个镜头
def scene_A(mats):
    sc = new_scene('A 方台 · 一个完整循环')
    unit = D['scenes'][0]['units'][0]
    top = sc.collection
    stage = new_coll('A·布景', top)
    build_room(stage, mats, half=3.32, walls=True, grid=(META['pitch'], 8))
    ucoll, root = build_unit(unit, top, mats, housing=True)
    figs = new_coll('A·比例参考', top)
    build_figure(figs, D['figures']['human'], '人', (1.45, 0.65, 0.0))
    build_figure(figs, D['figures']['catSit'], '猫', (1.05, 0.95, 0.0))
    lights = new_coll('A·灯光与相机', top)
    area_light(lights, '主光', (2.8, -2.4, 3.3), look_rot((2.8, -2.4, 3.3), (0, 0, 1.3)), 2.2, 650, (1.0, 0.97, 0.92))
    area_light(lights, '轮廓光', (-2.2, 2.6, 2.4), look_rot((-2.2, 2.6, 2.4), (0, 0, 1.5)), 1.6, 380, (0.75, 0.88, 1.0))
    area_light(lights, '顶光', (0, 0, CEIL - 0.08), (0, 0, 0), 3.0, 120, (0.9, 0.95, 1.0))
    world(sc)
    end = round(unit['samples'][-1]['t'] * FPS)
    cam, tgt = camera(lights, 'A·相机', lens=32)
    sc.camera = cam
    keypath(cam, [(1, (3.1, -3.6, 1.55)), (100, (2.9, -3.5, 1.7)), (190, (2.3, -2.6, 1.55)),
                  (330, (1.1, -2.6, 1.45)), (440, (-1.6, -2.5, 1.7)), (560, (-2.2, -3.0, 1.8)), (end, (-2.6, -3.6, 1.9))])
    keypath(tgt, [(1, (0, 0, 3.05)), (100, (0, 0, 2.2)), (190, (0, 0, 1.25)), (330, (0, 0, 1.05)),
                  (440, (0, 0, 1.1)), (560, (0, 0, 1.6)), (end, (0, 0, 2.9))])
    render_settings(sc, end)
    still_cam(lights, 'A·特写·键', (0.62, -0.78, 0.78), (0.18, -0.12, 0.99), lens=45)
    still_cam(lights, 'A·特写·上夹环', (0.5, -0.55, 1.52), (0.0, 0.0, 1.39), lens=50)
    still_cam(lights, 'A·特写·下夹环', (0.62, -0.7, 0.62), (0.0, 0.0, 0.84), lens=45)
    still_cam(lights, 'A·剖切·天花机箱', (0.75, -0.95, 3.35), (0.0, 0.0, 4.05), lens=28)
    still_cam(lights, 'A·收起', (1.3, -1.5, 2.4), (0.0, 0.0, 3.4), lens=40)
    return sc


def still_cam(coll, name, loc, look, lens=40):
    """静帧机位（不动）：render.py 用名字点它"""
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.clip_start = 0.02
    ob = bpy.data.objects.new(name, cd)
    coll.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = look_rot(loc, look)
    return ob


def scene_B(mats):
    sc = new_scene('B 四张键谱 · 同一套机构')
    units = D['scenes'][1]['units']
    top = sc.collection
    stage = new_coll('B·布景', top)
    build_room(stage, mats, half=4.2, walls=True, grid=None)
    labels = new_coll('B·名牌', top)
    plaques = []
    for u in units:
        build_unit(u, top, mats)
        plaques += plaque(labels, mats, u['label'], (u['place'][0], -0.75, 0.0))
    figs = new_coll('B·比例参考', top)
    build_figure(figs, D['figures']['human'], '人', (3.35, 0.95, 0.0))
    lights = new_coll('B·灯光与相机', top)
    area_light(lights, '主光', (3.0, -4.2, 3.4), look_rot((3.0, -4.2, 3.4), (0, 0, 1.4)), 3.0, 900, (1.0, 0.97, 0.92))
    area_light(lights, '轮廓光', (-3.0, 3.0, 2.6), look_rot((-3.0, 3.0, 2.6), (0, 0, 1.4)), 2.0, 450, (0.75, 0.88, 1.0))
    world(sc)
    end = round(units[0]['samples'][-1]['t'] * FPS)
    cam, tgt = camera(lights, 'B·相机', lens=30)
    sc.camera = cam
    face_camera(plaques, cam)
    keypath(cam, [(1, (2.2, -6.2, 1.8)), (120, (1.6, -5.6, 1.5)), (330, (0.4, -5.0, 1.25)), (450, (-1.0, -5.2, 1.5)), (end, (-1.8, -6.0, 2.1))])
    keypath(tgt, [(1, (0, 0, 2.6)), (120, (0, 0, 1.6)), (330, (0, 0, 1.15)), (450, (0, 0, 1.2)), (end, (0, 0, 2.6))])
    render_settings(sc, end)
    return sc


def scene_C(mats):
    sc = new_scene('C 同一条布换程序 · 平台 → 通道')
    unit = D['scenes'][2]['units'][0]
    top = sc.collection
    stage = new_coll('C·布景', top)
    build_room(stage, mats, half=3.32, walls=True, grid=(META['pitch'], 8))
    build_unit(unit, top, mats)
    labels = new_coll('C·名牌', top)
    frames = sample_frames(unit['samples'])
    plaques = []
    for k, lab in enumerate(unit['programLabels']):
        obs = plaque(labels, mats, lab, (0.0, -0.85, 0.0))
        plaques += obs
        vis = [s['p'] == k and s['phase'] not in ('stowed', 'lift') for s in unit['samples']]
        for ob in obs:
            hide_keys(ob, [1] + list(frames), [vis[0]] + vis)
    figs = new_coll('C·比例参考', top)
    build_figure(figs, D['figures']['human'], '人', (1.45, 0.65, 0.0))
    build_figure(figs, D['figures']['catSit'], '猫', (1.05, 0.95, 0.0))
    lights = new_coll('C·灯光与相机', top)
    area_light(lights, '主光', (2.8, -2.4, 3.3), look_rot((2.8, -2.4, 3.3), (0, 0, 1.3)), 2.2, 650, (1.0, 0.97, 0.92))
    area_light(lights, '轮廓光', (-2.2, 2.6, 2.4), look_rot((-2.2, 2.6, 2.4), (0, 0, 1.5)), 1.6, 380, (0.75, 0.88, 1.0))
    world(sc)
    end = round(unit['samples'][-1]['t'] * FPS)
    cam, tgt = camera(lights, 'C·相机', lens=30)
    sc.camera = cam
    face_camera(plaques, cam)
    keypath(cam, [(1, (3.4, -3.8, 1.7)), (140, (3.0, -3.4, 1.6)), (400, (2.2, -3.2, 1.2)), (700, (-0.6, -3.4, 1.1)), (1000, (-2.4, -3.2, 1.4)), (end, (-3.0, -3.6, 2.0))])
    keypath(tgt, [(1, (0, 0, 2.9)), (140, (0, 0, 2.2)), (400, (0, 0, 1.1)), (700, (0, 0, 0.95)), (1000, (0, 0, 1.0)), (end, (0, 0, 2.8))])
    render_settings(sc, end)
    return sc


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    default = bpy.context.scene
    mats = materials()
    made = []
    if 'A' in ONLY:
        made.append(scene_A(mats))
    if 'B' in ONLY:
        made.append(scene_B(mats))
    if 'C' in ONLY:
        made.append(scene_C(mats))
    # 打开文件时落在第一个镜头上：把默认场景的内容换成它（后台模式下没有窗口可切）
    first = made[0]
    default.name = '_' + first.name
    for c in list(first.collection.children):
        default.collection.children.link(c)
    for o in list(first.collection.objects):
        default.collection.objects.link(o)
    default.world = first.world
    default.camera = first.camera
    for attr in ('frame_start', 'frame_end'):
        setattr(default, attr, getattr(first, attr))
    copy_render(first, default)
    bpy.data.scenes.remove(first)
    default.name = default.name[1:]
    bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
    print('SAVED', OUT, [s.name for s in bpy.data.scenes])


def copy_render(src, dst):
    dst.render.fps = src.render.fps
    dst.render.resolution_x = src.render.resolution_x
    dst.render.resolution_y = src.render.resolution_y
    dst.render.engine = src.render.engine
    dst.cycles.samples = src.cycles.samples
    dst.cycles.use_denoising = src.cycles.use_denoising
    dst.cycles.max_bounces = src.cycles.max_bounces
    dst.cycles.transparent_max_bounces = src.cycles.transparent_max_bounces
    dst.view_settings.view_transform = src.view_settings.view_transform
    dst.view_settings.look = src.view_settings.look
    dst.unit_settings.system = 'METRIC'


main()
