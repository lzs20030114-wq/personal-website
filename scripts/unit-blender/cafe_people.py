"""Lab 2-15 效果图里的人（2026-11-08）。

仿真给的是每个人的骨架（cafe-export.mjs：humanSkeleton 按座面解出来的坐姿、步态相位、看猫时前倾，加头的枢轴与视线），
这里把 Blender 官方的 CC0 人体基础网格（Human Base Meshes v1.4.1，写实男 / 女各一具）按这副骨架摆好：
  1. 在静止的网格上量出关节（按身高比例切片取截面中心；手臂按 A 字姿态拟合一条轴线）；
  2. 建一副骨架、自动权重（骨骼热度）；
  3. 腿、臂用两节解析 IK 落到仿真给的踝、腕上（极向量指向仿真的膝、肘），躯干按仿真的髋 → 肩连线前倾，头朝视线 / 看着的猫；
  4. 衣服、头发是从身体表面挑出来的面往外推一层、再磨平（不是布料模拟），颜色取台架同一套穿着表（figurePalette）。
骨架以外的手势（伸手逗猫、端杯子）由调用方另给，属于效果图的布景，不是仿真的输出。
"""

import bpy
import bmesh
import math
import mathutils
import numpy as np

V = mathutils.Vector
BUNDLE = '/opt/assets/hbm/human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend'
SRC = {'male': 'GEO-body_male_realistic', 'female': 'GEO-body_female_realistic'}
STATURE = {'male': 1.72, 'female': 1.63}


def srgb(c):
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


# ---------------------------------------------------------------- 模板：载入、归一、量关节、绑骨
def _load(name):
    with bpy.data.libraries.load(BUNDLE) as (src, dst):
        dst.objects = [name, name + '.eye.L', name + '.eye.R']
    return [o for o in dst.objects if o is not None]


def _verts_world(ob):
    me = ob.data
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    M = np.array(ob.matrix_world)
    return co @ M[:3, :3].T + M[:3, 3]


def _slice_center(P, z, tol, mask=None):
    sel = np.abs(P[:, 2] - z) < tol
    if mask is not None:
        sel &= mask
    Q = P[sel]
    return (Q.min(0) + Q.max(0)) / 2 if len(Q) else None


def measure(P, H):
    """静止网格（脚底 z = 0、面朝 −Y、身体中线 x = 0）上的关节（米）"""
    J = {}
    for side, sgn in (('L', 1), ('R', -1)):
        leg = (P[:, 0] * sgn > 0.004) & (np.abs(P[:, 0]) < 0.12 * H)
        hip = _slice_center(P, 0.44 * H, 0.012 * H, leg & (P[:, 2] < 0.47 * H))
        knee = _slice_center(P, 0.285 * H, 0.01 * H, leg)
        ank = _slice_center(P, 0.065 * H, 0.008 * H, leg)
        J[f'hip.{side}'] = V((hip[0] * 0.95, hip[1], 0.505 * H))
        J[f'knee.{side}'] = V((knee[0], knee[1] + 0.004 * H, 0.285 * H))
        J[f'ankle.{side}'] = V((ank[0], ank[1] + 0.006 * H, 0.042 * H))
        foot = P[(P[:, 0] * sgn > 0) & (P[:, 2] < 0.03 * H)]
        J[f'toe.{side}'] = V((foot[np.argmin(foot[:, 1])][0], foot[:, 1].min() + 0.02 * H, 0.012 * H))
        # 手臂：A 字姿态，躯干外侧（|x| > 0.13H）、肩下的点拟一条轴，手尖 = 沿轴最远的点
        arm = (P[:, 0] * sgn > 0.13 * H) & (P[:, 2] > 0.36 * H) & (P[:, 2] < 0.79 * H)
        A = P[arm]
        c = A.mean(0)
        u, s, vt = np.linalg.svd(A - c)
        d = vt[0]
        if d[2] > 0:
            d = -d                                   # 朝下（朝手）
        t = (A - c) @ d
        tip = c + d * t.max()
        Ltot = (0.186 + 0.146 + 0.108) * H
        sh = tip - d * Ltot
        # 肩关节在三角肌里：按测到的肩高修一下（Drillis 肩 0.818H）
        J[f'shoulder.{side}'] = V((sh[0], sh[1], 0.812 * H))
        dsh = V(tip) - J[f'shoulder.{side}']
        dsh.normalize()
        J[f'elbow.{side}'] = J[f'shoulder.{side}'] + dsh * 0.186 * H
        J[f'wrist.{side}'] = J[f'elbow.{side}'] + dsh * 0.146 * H
        J[f'hand.{side}'] = J[f'wrist.{side}'] + dsh * 0.095 * H
        J[f'clav.{side}'] = V((0.02 * H * sgn, J[f'shoulder.{side}'].y + 0.01, 0.80 * H))
    pel = _slice_center(P, 0.53 * H, 0.01 * H)
    J['pelvis'] = V((0, pel[1], 0.52 * H))
    J['spine'] = V((0, _slice_center(P, 0.62 * H, 0.01 * H)[1] + 0.01 * H, 0.62 * H))
    J['chest'] = V((0, _slice_center(P, 0.72 * H, 0.01 * H)[1], 0.72 * H))
    J['neck'] = V((0, _slice_center(P, 0.835 * H, 0.008 * H)[1], 0.835 * H))
    J['head'] = V((0, _slice_center(P, 0.885 * H, 0.008 * H)[1] + 0.004 * H, 0.885 * H))
    J['top'] = V((0, J['head'].y, H))
    return J


BONES = [
    # 名, 头, 尾, 父
    ('pelvis', 'pelvis', 'spine', None),
    ('spine', 'spine', 'chest', 'pelvis'),
    ('chest', 'chest', 'neck', 'spine'),
    ('neck', 'neck', 'head', 'chest'),
    ('head', 'head', 'top', 'neck'),
]
for _s in 'LR':
    BONES += [
        (f'clav.{_s}', f'clav.{_s}', f'shoulder.{_s}', 'chest'),
        (f'upperarm.{_s}', f'shoulder.{_s}', f'elbow.{_s}', f'clav.{_s}'),
        (f'forearm.{_s}', f'elbow.{_s}', f'wrist.{_s}', f'upperarm.{_s}'),
        (f'hand.{_s}', f'wrist.{_s}', f'hand.{_s}', f'forearm.{_s}'),
        (f'thigh.{_s}', f'hip.{_s}', f'knee.{_s}', 'pelvis'),
        (f'shin.{_s}', f'knee.{_s}', f'ankle.{_s}', f'thigh.{_s}'),
        (f'foot.{_s}', f'ankle.{_s}', f'toe.{_s}', f'shin.{_s}'),
    ]


def build_template(sex, coll):
    """载入一具身体，摆到原点、按身高缩放，量关节、建骨架、自动权重。返回 (身体, [眼睛], 骨架, 关节)"""
    obs = _load(SRC[sex])
    body = obs[0]
    eyes = obs[1:]
    for o in obs:
        coll.objects.link(o)
    P = _verts_world(body)
    mn, mx = P.min(0), P.max(0)
    k = STATURE[sex] / (mx[2] - mn[2])
    off = V((-(mn[0] + mx[0]) / 2, 0.0, -mn[2]))
    for o in obs:
        o.matrix_world = mathutils.Matrix.Scale(k, 4) @ mathutils.Matrix.Translation(off) @ o.matrix_world
    bpy.context.view_layer.update()
    for o in obs:
        bpy.context.view_layer.objects.active = o
        for oo in bpy.context.view_layer.objects:
            oo.select_set(oo is o)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    H = STATURE[sex]
    P = _verts_world(body)
    J = measure(P, H)
    arm_d = bpy.data.armatures.new(f'骨架·{sex}')
    arm = bpy.data.objects.new(f'骨架·{sex}', arm_d)
    coll.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    for oo in bpy.context.view_layer.objects:
        oo.select_set(oo is arm)
    bpy.ops.object.mode_set(mode='EDIT')
    for name, h, t, parent in BONES:
        eb = arm_d.edit_bones.new(name)
        eb.head = J[h]
        eb.tail = J[t]
        # 滚转：各节的 X 轴尽量朝身体右侧（−X），弯曲时绕它转
        eb.align_roll(V((0, -1, 0)) if name.startswith(('thigh', 'shin', 'pelvis', 'spine', 'chest', 'neck', 'head')) else V((0, 0, 1)))
        if parent:
            eb.parent = arm_d.edit_bones[parent]
            eb.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    # 自动权重（骨骼热度）
    for oo in bpy.context.view_layer.objects:
        oo.select_set(oo in (body, arm))
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    # 权重在原始网格（1 万面）上算（4 万面上骨骼热度会整个失败，女性那具就是）；之后把多分辨率按第 1 级烘进网格，
    # 权重跟着细分插值。.blend 里也就不再带第 2、3 级的雕刻数据（那两级占了文件的大半）
    for o in (body, *eyes):
        bpy.context.view_layer.objects.active = o
        for oo in bpy.context.view_layer.objects:
            oo.select_set(oo is o)
        for m in list(o.modifiers):
            if m.type == 'MULTIRES':
                m.levels = m.render_levels = m.sculpt_levels = 1 if o is body else 0
                bpy.ops.object.modifier_apply(modifier=m.name)
    none = sum(1 for v in body.data.vertices if not v.groups)
    if none:
        raise RuntimeError(f'{sex} 的身体有 {none} 个顶点没分到权重（骨骼热度失败）')
    for e in eyes:
        e.parent = arm
        e.parent_type = 'BONE'
        e.parent_bone = 'head'
        hb = arm.data.bones['head']
        e.matrix_parent_inverse = (arm.matrix_world @ hb.matrix_local @ mathutils.Matrix.Translation((0, hb.length, 0))).inverted()
    return body, eyes, arm, J


# ---------------------------------------------------------------- 衣服、头发：从身体表面挑面往外推
def _dominant(body):
    """每个顶点权重最大的那根骨（去掉 .L/.R）"""
    gi = {g.index: g.name for g in body.vertex_groups}
    out = []
    for v in body.data.vertices:
        best, w = '', 0.0
        for g in v.groups:
            if g.weight > w:
                best, w = gi[g.group], g.weight
        out.append(best.split('.')[0])
    return out


def face_zones(body, J, H):
    """静止网格上每个面：(主骨, 中心)。用来挑衣服、头发要覆盖的面"""
    dom = _dominant(body)
    me = body.data
    n = len(me.polygons)
    cen = np.empty(n * 3)
    me.polygons.foreach_get('center', cen)
    cen = cen.reshape(-1, 3)
    bones = []
    for p in me.polygons:
        names = [dom[i] for i in p.vertices]
        bones.append(max(set(names), key=names.count))
    return np.array(bones), cen


def pick(bones, cen, H, J, what, style):
    """按穿着挑面。what：shirt / pants / shoe / hair / sock"""
    z = cen[:, 2] / H
    x, y = cen[:, 0], cen[:, 1]
    b = bones
    arm_up = b == 'upperarm'
    arm_lo = b == 'forearm'
    torso = np.isin(b, ['chest', 'spine', 'clav', 'pelvis', 'neck'])
    top = style.get('top', 'long')
    bottom = style.get('bottom', 'pants')
    waist = 0.575 if bottom == 'skirt' else 0.565
    if what == 'shirt':
        # 上衣：躯干从腰到领口（领口在颈根下），袖子按款式
        neck_z = 0.815 if top in ('long', 'tee') else 0.83
        m = torso & (z > waist - 0.035) & (z < neck_z)
        m |= (b == 'neck') & (z < neck_z) & (y > 0.0)   # 后领高一点
        if top == 'tee':
            # 短袖：到上臂中段（离肩 ≤ 0.1H）
            for s, sg in (('L', 1), ('R', -1)):
                sh = J[f'shoulder.{s}']
                d = np.linalg.norm(cen - np.array(sh), axis=1)
                m |= arm_up & (d < 0.105 * H) & (x * sg > 0)
        else:
            cuff = 0.035 * H
            for s, sg in (('L', 1), ('R', -1)):
                wr = np.array(J[f'wrist.{s}'])
                d = np.linalg.norm(cen - wr, axis=1)
                m |= (arm_up | (arm_lo & (d > cuff))) & (x * sg > 0)
        return m
    if what == 'pants':
        legs = np.isin(b, ['thigh', 'shin'])
        hipzone = np.isin(b, ['pelvis', 'spine', 'thigh']) & (z <= waist) & (z > 0.40)
        if bottom == 'shorts':
            m = hipzone | ((b == 'thigh') & (z > 0.37))
        elif bottom == 'skirt':
            m = hipzone | ((b == 'thigh') & (z > 0.31))
        else:
            m = hipzone | (legs & (z > 0.055))
        return m & ~np.isin(b, ['upperarm', 'forearm', 'hand'])
    if what == 'sock':
        return np.isin(b, ['shin', 'foot']) & (z > 0.03) & (z < 0.115)
    if what == 'shoe':
        return (b == 'foot') | ((b == 'shin') & (z < 0.058))
    if what == 'hair':
        hair = style.get('hair', 'short')
        hz = 0.928 if hair == 'short' else 0.92
        hd = (b == 'head') | (b == 'neck')
        front = y < (J['head'].y - 0.03 * H)
        m = hd & (z > hz) & ~(front & (z < 0.968))
        m |= hd & (y > J['head'].y + 0.02 * H) & (z > 0.865)       # 后脑
        side = hd & (np.abs(x) > 0.05 * H) & (z > 0.915) & (y > J['head'].y + 0.005 * H)
        m |= side
        if hair == 'long':
            m |= (np.isin(b, ['neck', 'chest', 'head', 'clav'])) & (y > J['neck'].y + 0.01 * H) & (z > 0.72) & (np.abs(x) < 0.11 * H)
        return m
    raise ValueError(what)


def make_shell(name, body, mask, offset, coll, mat, smooth_iter=6, thick=0.003, smooth_k=0.5):
    """把 body 上 mask 选中的面复制成一层壳，沿法向推 offset，磨平，带上骨架修改器（同一副权重）"""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not mask[f.index]], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    # 零碎的小块（耳后、腋下挑漏的几个面）加厚时法向发散会拉出尖刺：只留大块
    bm.faces.ensure_lookup_table()
    seen, small = set(), []
    for f in bm.faces:
        if f in seen:
            continue
        stack, isl = [f], []
        seen.add(f)
        while stack:
            g = stack.pop()
            isl.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h not in seen:
                        seen.add(h)
                        stack.append(h)
        if len(isl) < 40:
            small += isl
    if small:
        bmesh.ops.delete(bm, geom=small, context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), dtype=bool))
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    for g in body.vertex_groups:
        ob.vertex_groups.new(name=g.name)
    sm = ob.modifiers.new('磨平', 'SMOOTH')
    sm.factor = smooth_k
    sm.iterations = smooth_iter
    d = ob.modifiers.new('外推', 'DISPLACE')
    d.direction = 'NORMAL'
    d.strength = offset
    d.mid_level = 0.0
    am = ob.modifiers.new('Armature', 'ARMATURE')
    so = ob.modifiers.new('厚度', 'SOLIDIFY')
    so.thickness = thick
    so.offset = -1
    so.use_even_offset = False
    so.use_rim = True
    ss = ob.modifiers.new('细分', 'SUBSURF')
    ss.levels = 0
    ss.render_levels = 1
    return ob


# ---------------------------------------------------------------- 摆姿势
def _orient(rest_mat, rest_dir, new_dir):
    """最小转角把骨的静止朝向 rest_dir 转到 new_dir，作用在静止的 3×3 上"""
    q = rest_dir.rotation_difference(new_dir)
    return q.to_matrix() @ rest_mat


def _ik2(root, target, L1, L2, pole):
    """两节解析 IK：root → mid → end，end 尽量落到 target，mid 偏向 pole 那侧"""
    d = target - root
    D = min(d.length, (L1 + L2) * 0.9995)
    D = max(D, abs(L1 - L2) + 1e-4)
    u = d.normalized()
    end = root + u * D
    a = (L1 * L1 - L2 * L2 + D * D) / (2 * D)
    h = math.sqrt(max(L1 * L1 - a * a, 0.0))
    pv = pole - root
    pv = pv - u * pv.dot(u)
    if pv.length < 1e-6:
        pv = V((0, 0, 1)).cross(u)
    pv.normalize()
    mid = root + u * a + pv * h
    return mid, end


class Poser:
    def __init__(self, arm):
        self.arm = arm
        self.rest = {b.name: (b.head_local.copy(), b.tail_local.copy(), b.matrix_local.to_3x3().copy()) for b in arm.data.bones}

    def set_bone(self, name, head, tail, base):
        """骨在骨架空间里摆到 head → tail：先按 base（身体的朝向）整体转，再最小转角对上方向（不额外扭转）"""
        h0, t0, R0 = self.rest[name]
        d0 = base @ (t0 - h0).normalized()
        R = _orient(base @ R0, d0, (tail - head).normalized())
        M = R.to_4x4()
        M.translation = head
        self.arm.pose.bones[name].matrix = M
        bpy.context.view_layer.update()

    def length(self, name):
        h0, t0, _ = self.rest[name]
        return (t0 - h0).length

    def posed(self, bone, p_rest):
        """静止时在 p_rest 的一点，随 bone 摆过去之后在哪"""
        pb = self.arm.pose.bones[bone]
        return pb.matrix @ (self.arm.data.bones[bone].matrix_local.inverted() @ p_rest)


def body_frame(fwd, up):
    """静止系（X = 人的左、Y = 人的后、Z = 上）→ 世界：列 = (左, 后, 上)，正交化"""
    right = fwd.cross(V((0, 0, 1))).normalized()
    X = -right
    Z = up.normalized()
    Z = (Z - X * Z.dot(X)).normalized()
    Y = Z.cross(X).normalized()
    return mathutils.Matrix((X, Y, Z)).transposed()


def pose_person(arm, J, P, gesture=None):
    """按仿真骨架 P（Blender 世界坐标）摆。arm 在世界原点（骨架空间 = 世界）。
    gesture：可选的手势覆盖 {'wrist.L': (x,y,z), 'elbow.L': 极向量参考, 'hand.L': 方向}（效果图布景，不是仿真输出）"""
    po = Poser(arm)
    legs = [{k: V(l[k]) for k in ('hip', 'knee', 'ankle')} for l in P['joints']['legs']]
    arms_ = [{k: V(a[k]) for k in ('shoulder', 'elbow', 'wrist')} for a in P['joints']['arms']]
    hip_mid = (legs[0]['hip'] + legs[1]['hip']) / 2
    sh_mid = (arms_[0]['shoulder'] + arms_[1]['shoulder']) / 2
    h = P['heading']
    fwd = V((math.cos(h), math.sin(h), 0))
    right = fwd.cross(V((0, 0, 1))).normalized()

    def side_of(p, ref):
        return 'R' if (p - ref).dot(right) > 0 else 'L'
    L = {side_of(l['hip'], hip_mid): l for l in legs}
    A = {side_of(a['shoulder'], sh_mid): a for a in arms_}
    if len(L) < 2:
        L = {'L': legs[0], 'R': legs[1]}
    if len(A) < 2:
        A = {'L': arms_[0], 'R': arms_[1]}
    up_t = (sh_mid - hip_mid)
    Bp = body_frame(fwd, V((0, 0, 1)).lerp(up_t.normalized(), 0.5))   # 盆骨只跟一半的前倾
    Bt = body_frame(fwd, up_t)
    hr = (J['hip.L'] + J['hip.R']) / 2
    pel = hip_mid + Bp @ (J['pelvis'] - hr)
    po.set_bone('pelvis', pel, pel + Bp @ (J['spine'] - J['pelvis']), Bp)
    sp = po.arm.pose.bones['pelvis'].tail.copy()
    Bs = body_frame(fwd, V((0, 0, 1)).lerp(up_t.normalized(), 0.8))
    po.set_bone('spine', sp, sp + Bs @ (J['chest'] - J['spine']), Bs)
    ch = po.arm.pose.bones['spine'].tail.copy()
    po.set_bone('chest', ch, ch + Bt @ (J['neck'] - J['chest']), Bt)
    nk = po.arm.pose.bones['chest'].tail.copy()
    # 头：朝看着的东西（看猫）或视线方位；颈分一半
    look = P.get('lookAt')
    if look is not None:
        g = V(look) - (nk + Bt @ (J['head'] - J['neck']))
        yaw = math.atan2(g.y, g.x) - h
        yaw = math.atan2(math.sin(yaw), math.cos(yaw))
        pitch = math.atan2(g.z, V((g.x, g.y, 0)).length)
    else:
        yaw = math.atan2(math.sin(P['gaze'] - h), math.cos(P['gaze'] - h))
        pitch = -0.12
    yaw = max(-1.25, min(1.25, yaw))
    # 躯干本身的前倾已经让头低了一些：俯仰按相对躯干算
    tilt = math.asin(max(-1, min(1, up_t.normalized().dot(fwd))))
    pitch = max(-0.75, min(0.4, pitch + tilt * 0.6))
    Bn = mathutils.Matrix.Rotation(yaw * 0.4, 3, 'Z') @ Bt
    Bn = mathutils.Matrix.Rotation(-pitch * 0.35, 3, Bn @ V((1, 0, 0))) @ Bn
    po.set_bone('neck', nk, nk + Bn @ (J['head'] - J['neck']), Bn)
    hd = po.arm.pose.bones['neck'].tail.copy()
    Bh = mathutils.Matrix.Rotation(yaw, 3, 'Z') @ Bt
    Bh = mathutils.Matrix.Rotation(-pitch * 0.9, 3, Bh @ V((1, 0, 0))) @ Bh
    po.set_bone('head', hd, hd + Bh @ (J['top'] - J['head']), Bh)
    # 腿：髋（随盆骨摆过去）→ 踝，两节 IK，极向量 = 仿真的膝
    for s in 'LR':
        hip = po.posed('pelvis', J[f'hip.{s}'])
        ank_t = L[s]['ankle']
        kn_s = L[s]['knee']
        pole = kn_s + (kn_s - (hip + ank_t) / 2) * 2.0 + fwd * 0.04
        kn, an = _ik2(hip, ank_t, po.length(f'thigh.{s}'), po.length(f'shin.{s}'), pole)
        po.set_bone(f'thigh.{s}', hip, kn, Bp)
        po.set_bone(f'shin.{s}', kn, an, Bp)
        out = 0.12 if s == 'L' else -0.12
        fdir = mathutils.Matrix.Rotation(out, 3, 'Z') @ fwd
        flen = (J[f'toe.{s}'] - J[f'ankle.{s}']).length
        drop = J[f'ankle.{s}'].z - J[f'toe.{s}'].z
        run = math.sqrt(max(flen * flen - drop * drop, 1e-6))
        toe = an + fdir * run - V((0, 0, drop))
        if P['pose'] == 'walk' and an.z > J[f'ankle.{s}'].z + 0.02:
            toe = an + fdir * run * 0.9 - V((0, 0, drop + 0.03))
        po.set_bone(f'foot.{s}', an, toe, Bp)
    # 臂：锁骨随胸，肩 → 腕两节 IK，极向量 = 仿真的肘
    for s in 'LR':
        shp = po.arm.pose.bones[f'clav.{s}'].tail.copy()
        wr_t = A[s]['wrist']
        el_p = A[s]['elbow']
        if gesture and f'wrist.{s}' in gesture:
            wr_t = V(gesture[f'wrist.{s}'])
            el_p = V(gesture.get(f'elbow.{s}', el_p))
        pole = el_p + (el_p - (shp + wr_t) / 2) * 2.0 - V((0, 0, 0.03))
        el, wr = _ik2(shp, wr_t, po.length(f'upperarm.{s}'), po.length(f'forearm.{s}'), pole)
        po.set_bone(f'upperarm.{s}', shp, el, Bt)
        po.set_bone(f'forearm.{s}', el, wr, Bt)
        hdir = (wr - el).normalized()
        if gesture and f'hand.{s}' in gesture:
            hdir = V(gesture[f'hand.{s}']).normalized()
        else:
            hdir = (hdir + V((0, 0, -0.35))).normalized()
        po.set_bone(f'hand.{s}', wr, wr + hdir * po.length(f'hand.{s}'), Bt)


# ---------------------------------------------------------------- 材质
_MATS = {}


def _principled(name, color, rough=0.6, sheen=0.0, sss=0.0, bump=0.0, bump_scale=600.0, spec=0.5, coat=0.0, metal=0.0):
    key = (name, tuple(round(c, 4) for c in color))
    if key in _MATS:
        return _MATS[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*srgb(color), 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    p.inputs['Specular IOR Level'].default_value = spec
    if sheen:
        p.inputs['Sheen Weight'].default_value = sheen
        p.inputs['Sheen Roughness'].default_value = 0.5
    if sss:
        p.inputs['Subsurface Weight'].default_value = sss
        p.inputs['Subsurface Radius'].default_value = (1.0, 0.35, 0.2)
        p.inputs['Subsurface Scale'].default_value = 0.008
    if coat:
        p.inputs['Coat Weight'].default_value = coat
    if bump:
        tc = nt.nodes.new('ShaderNodeTexCoord')
        nz = nt.nodes.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = bump_scale
        nz.inputs['Detail'].default_value = 3.0
        bp = nt.nodes.new('ShaderNodeBump')
        bp.inputs['Strength'].default_value = bump
        bp.inputs['Distance'].default_value = 0.0006
        nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
        nt.links.new(nz.outputs['Fac'], bp.inputs['Height'])
        nt.links.new(bp.outputs['Normal'], p.inputs['Normal'])
    m.diffuse_color = (*srgb(color), 1)
    _MATS[key] = m
    return m


def outfit_mats(colors):
    c = colors
    return dict(
        skin=_principled('人·皮肤', c['skin'], rough=0.5, sss=0.18, spec=0.4),
        hair=_principled('人·头发', [v * 0.9 for v in c['hair']], rough=0.42, bump=0.35, bump_scale=900.0, spec=0.6),
        shirt=_principled('人·上衣', c['shirt'], rough=0.85, sheen=0.5, bump=0.25),
        inner=_principled('人·内搭', c['inner'], rough=0.85, sheen=0.5, bump=0.25),
        pants=_principled('人·裤裙', c['pants'], rough=0.8, sheen=0.4, bump=0.25),
        shoe=_principled('人·鞋', c['shoe'], rough=0.55, spec=0.5, coat=0.15, bump=0.15, bump_scale=300),
        sock=_principled('人·袜', c['sock'], rough=0.9, sheen=0.4),
        hat=_principled('人·帽', c['hat'], rough=0.85, sheen=0.5, bump=0.3),
        bag=_principled('人·包', c['bag'], rough=0.7, sheen=0.2, bump=0.2),
        frame=_principled('人·镜框', c['frame'], rough=0.3, metal=0.6),
        eye=_principled('人·眼', (0.92, 0.9, 0.86), rough=0.15, coat=0.6),
        sole=_principled('人·鞋底', (0.9, 0.88, 0.84) if sum(c['shoe']) < 1.2 else (0.25, 0.23, 0.22), rough=0.7),
    )


# ---------------------------------------------------------------- 模板缓存与组装
class Template:
    def __init__(self, sex, coll):
        self.sex = sex
        self.H = STATURE[sex]
        self.body, self.eyes, self.arm, self.J = build_template(sex, coll)
        self.bones, self.cen = face_zones(self.body, self.J, self.H)
        self.shells = {}
        self.coll = coll
        self.hide = {}
        ph = _principled('临时', (0.5, 0.5, 0.5))
        for o in [self.body, *self.eyes]:
            if not o.data.materials:
                o.data.materials.append(ph)
        for o in [self.body, *self.eyes, self.arm]:
            o.hide_render = True
            o.hide_viewport = True

    def shell(self, what, style):
        key = (what, tuple(sorted((k, str(v)) for k, v in style.items() if k in ('top', 'bottom', 'hair'))))
        if key not in self.shells:
            m = pick(self.bones, self.cen, self.H, self.J, what, style)
            off, it, th, k = {
                'shirt': (0.014 if style.get('top') in ('jacket', 'hoodie') else 0.009, 6, 0.003, 0.5),
                'pants': (0.009 if style.get('bottom') != 'skirt' else 0.018, 6, 0.003, 0.5),
                'shoe': (0.011, 14, 0.004, 0.7),
                'sock': (0.004, 3, 0.0015, 0.4),
                'hair': (0.008 if style.get('hair', 'short') == 'short' else 0.012, 10, 0.0, 0.6),
            }[what]
            ob = make_shell(f'壳·{self.sex}·{what}', self.body, m, off, self.coll, _principled('临时', (0.5, 0.5, 0.5)), it, th, k)
            ob.hide_render = True
            ob.hide_viewport = True
            self.shells[key] = ob
        return self.shells[key]


def _style_key(style):
    return '|'.join(f'{k}={style.get(k)}' for k in ('top', 'bottom', 'hair', 'socks'))


def prepare_hide(tmpl, styles):
    """每种穿着一组「被衣服盖住的皮肤」顶点组（只收周围面全被盖住的顶点），身体按它遮掉，免得皮肤从衣服里透出来。
    要在复制任何一个人之前建好（顶点组名单在对象上，复制时带过去）"""
    me = tmpl.body.data
    for st in styles:
        key = _style_key(st)
        if key in tmpl.hide:
            continue
        cov = np.zeros(len(me.polygons), dtype=bool)
        for what in ('shirt', 'pants', 'shoe', 'hair') + (('sock',) if st.get('socks') and st.get('bottom') in ('shorts', 'skirt') else ()):
            cov |= pick(tmpl.bones, tmpl.cen, tmpl.H, tmpl.J, what, st)
        allc = np.ones(len(me.vertices), dtype=bool)
        for p in me.polygons:
            if not cov[p.index]:
                for i in p.vertices:
                    allc[i] = False
        g = tmpl.body.vertex_groups.new(name=f'遮·{key}')
        g.add([int(i) for i in np.nonzero(allc)[0]], 1.0, 'REPLACE')
        tmpl.hide[key] = g.name


def _parent_bone(ob, arm, bone):
    ob.parent = arm
    ob.parent_type = 'BONE'
    ob.parent_bone = bone
    b = arm.data.bones[bone]
    ob.matrix_parent_inverse = (arm.matrix_world @ b.matrix_local @ mathutils.Matrix.Translation((0, b.length, 0))).inverted()


def _ellipsoid(name, center, radii, coll, mat, segs=24, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=segs // 2, radius=1.0)
    for v in bm.verts:
        v.co = V((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
        if rot is not None:
            v.co = rot @ v.co
        v.co += V(center)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), dtype=bool))
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def make_person(tmpl, P, coll, name, gesture=None):
    """一个人：骨架复制一副、身体与衣服共用网格（各自的修改器指向自己的骨架），按仿真骨架摆好"""
    style = dict(P['outfit']['style'])
    mats = outfit_mats(P['outfit']['colors'])
    root = bpy.data.objects.new(name, None)
    coll.objects.link(root)
    arm = tmpl.arm.copy()
    arm.name = f'{name}·骨架'
    coll.objects.link(arm)
    arm.hide_render = True
    arm.hide_viewport = False
    arm.parent = None
    for pb in arm.pose.bones:
        pb.matrix_basis = mathutils.Matrix()
    bpy.context.view_layer.update()
    parts = []
    body = tmpl.body.copy()
    body.name = f'{name}·身体'
    coll.objects.link(body)
    body.parent = arm
    body.matrix_parent_inverse = mathutils.Matrix()
    body.hide_render = body.hide_viewport = False
    body.material_slots[0].link = 'OBJECT'
    body.material_slots[0].material = mats['skin']
    for m in body.modifiers:
        if m.type == 'ARMATURE':
            m.object = arm
    hk = tmpl.hide.get(_style_key(style))
    if hk:
        mk = body.modifiers.new('遮住衣服下的皮肤', 'MASK')
        mk.vertex_group = hk
        mk.invert_vertex_group = True
        mk.threshold = 0.5
        names = [m.name for m in body.modifiers]
        bpy.context.view_layer.objects.active = body
        with bpy.context.temp_override(object=body, active_object=body):
            bpy.ops.object.modifier_move_to_index(modifier=mk.name, index=1)
    parts.append(body)
    for e in tmpl.eyes:
        ec = e.copy()
        coll.objects.link(ec)
        ec.hide_render = ec.hide_viewport = False
        ec.material_slots[0].link = 'OBJECT'
        ec.material_slots[0].material = mats['eye']
        _parent_bone(ec, arm, 'head')
        ec.matrix_world = e.matrix_world.copy()
        parts.append(ec)
    # 衣服
    wear = [('shirt', 'shirt'), ('pants', 'pants'), ('hair', 'hair')]
    if style.get('socks') and style.get('bottom') in ('shorts', 'skirt'):
        wear.append(('sock', 'sock'))
    for what, mk in wear:
        sh = tmpl.shell(what, style)
        c = sh.copy()
        c.name = f'{name}·{what}'
        coll.objects.link(c)
        c.hide_render = c.hide_viewport = False
        c.parent = arm
        c.matrix_parent_inverse = mathutils.Matrix()
        c.material_slots[0].link = 'OBJECT'
        c.material_slots[0].material = mats[mk]
        for m in c.modifiers:
            if m.type == 'ARMATURE':
                m.object = arm
        if what == 'hair':
            add_hair_fuzz(c, P['outfit']['colors']['hair'], style.get('hair', 'short'), hash(name) % 1000)
        parts.append(c)
    J, H = tmpl.J, tmpl.H
    for s_ in 'LR':
        sh = shoe_mesh(f'{name}·鞋{s_}', J, s_, coll, mats['shoe'], mats['sole'])
        _parent_bone(sh, arm, f'foot.{s_}')
        parts.append(sh)
    # 发髻、马尾、帽子、背包：小件挂在骨上（静止位置建好再挂）
    hd = J['head']
    if style.get('hair') == 'bun':
        o = _ellipsoid(f'{name}·发髻', (0, hd.y + 0.085, J['top'].z - 0.045), (0.042, 0.038, 0.04), coll, mats['hair'])
        _parent_bone(o, arm, 'head'); parts.append(o)
    if style.get('hair') == 'ponytail':
        o = _ellipsoid(f'{name}·马尾', (0, hd.y + 0.11, J['top'].z - 0.13), (0.032, 0.03, 0.1), coll, mats['hair'],
                       rot=mathutils.Matrix.Rotation(-0.35, 3, 'X'))
        _parent_bone(o, arm, 'head'); parts.append(o)
    if style.get('hat') == 'cap':
        o = _ellipsoid(f'{name}·帽', (0, hd.y + 0.005, J['top'].z - 0.045), (0.098, 0.108, 0.075), coll, mats['hat'])
        v = _ellipsoid(f'{name}·帽檐', (0, hd.y - 0.115, J['top'].z - 0.085), (0.08, 0.06, 0.008), coll, mats['hat'],
                       rot=mathutils.Matrix.Rotation(0.15, 3, 'X'))
        for oo in (o, v):
            _parent_bone(oo, arm, 'head'); parts.append(oo)
    if style.get('hat') == 'beanie':
        o = _ellipsoid(f'{name}·毛线帽', (0, hd.y + 0.01, J['top'].z - 0.035), (0.1, 0.11, 0.085), coll, mats['hat'])
        _parent_bone(o, arm, 'head'); parts.append(o)
    if style.get('backpack') and P['pose'] != 'sit':
        ch = J['chest']
        o = _ellipsoid(f'{name}·背包', (0, ch.y + 0.16, ch.z - 0.03), (0.15, 0.075, 0.2), coll, mats['bag'], segs=32)
        o.modifiers.new('平', 'SUBSURF')
        _parent_bone(o, arm, 'chest'); parts.append(o)
    if style.get('glasses'):
        bm = bmesh.new()
        cy = hd.y - 0.103
        cz = hd.z + 0.068
        for sg in (1, -1):
            ring = []
            for k in range(24):
                a0 = 2 * math.pi * k / 24
                cx, cz2 = sg * 0.034 + 0.021 * math.cos(a0), cz + 0.017 * math.sin(a0)
                ring.append([bm.verts.new((cx + 0.0016 * math.cos(b0) * math.cos(a0), cy + 0.0016 * math.sin(b0), cz2 + 0.0016 * math.cos(b0) * math.sin(a0))) for b0 in np.linspace(0, 2 * math.pi, 6, endpoint=False)])
            for k in range(24):
                r0, r1 = ring[k], ring[(k + 1) % 24]
                for q in range(6):
                    bm.faces.new((r0[q], r1[q], r1[(q + 1) % 6], r0[(q + 1) % 6]))
        me = bpy.data.meshes.new('镜框')
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mats['frame'])
        me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), dtype=bool))
        o = bpy.data.objects.new(f'{name}·镜框', me)
        coll.objects.link(o)
        _parent_bone(o, arm, 'head'); parts.append(o)
    pose_person(arm, tmpl.J, P, gesture)
    for o in parts:
        if o.parent is None:
            o.parent = root
    arm.parent = root
    return root, arm, parts



def hair_strand_material(color):
    key = ('发丝', tuple(round(c, 4) for c in color))
    if key in _MATS:
        return _MATS[key]
    m = bpy.data.materials.new('人·发丝')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    hb = nt.nodes.new('ShaderNodeBsdfHairPrincipled')
    hb.parametrization = 'COLOR'
    hb.inputs['Color'].default_value = (*srgb([v * 0.8 for v in color]), 1)
    hb.inputs['Roughness'].default_value = 0.32
    hb.inputs['Radial Roughness'].default_value = 0.4
    hb.inputs['Coat'].default_value = 0.1
    nt.links.new(hb.outputs[0], nt.nodes['Material Output'].inputs[0])
    _MATS[key] = m
    return m


def add_hair_fuzz(ob, color, kind, seed):
    """头发那层壳上再长一层短发丝：边缘不再是一圈硬边（头盔感），表面有发丝的高光。长发长一点、贴着壳往下顺"""
    ob.data = ob.data.copy()          # 粒子毛发的材质槽要挂在网格上：每人一份
    ob.data.materials.append(hair_strand_material(color))
    for slot in ob.material_slots:
        pass
    # 壳加厚为 0 的那层不要（发丝自己给体积）
    for md in list(ob.modifiers):
        if md.type == 'SOLIDIFY' and md.thickness <= 0:
            ob.modifiers.remove(md)
    ps = ob.modifiers.new('发丝', 'PARTICLE_SYSTEM').particle_system
    ps.seed = seed
    st = ps.settings
    st.type = 'HAIR'
    st.use_advanced_hair = True
    st.count = 3000
    # 发丝方向：沿法向冒出一点、再往下梳（长发顺着垂下来），长度由这两个速度给
    if kind == 'short':
        st.normal_factor = 0.012
        st.object_align_factor = (0, 0, -0.02)
    else:
        st.normal_factor = 0.008
        st.object_align_factor = (0, 0, -0.065)
    st.material = 2
    st.child_type = 'INTERPOLATED'
    st.rendered_child_count = 30
    st.child_percent = 6
    st.clump_factor = 0.4
    st.clump_shape = -0.2
    st.roughness_1 = 0.002
    st.roughness_2 = 0.003
    st.roughness_2_size = 0.2
    st.root_radius = 1.0
    st.tip_radius = 0.15
    st.radius_scale = 0.00035
    st.use_hair_bspline = True
    st.render_step = 3


def shoe_mesh(name, J, side, coll, mat, sole_mat):
    """鞋：脚的静止位置上建一只圆头的鞋（鞋帮 + 浅色鞋底），挂在脚骨上随姿态走"""
    a = J[f'ankle.{side}']
    t = J[f'toe.{side}']
    fwd = V((t.x - a.x, t.y - a.y, 0)).normalized()
    left = V((0, 0, 1)).cross(fwd).normalized()
    heel = V((a.x, a.y, 0)) - fwd * 0.055
    toe = V((t.x, t.y, 0)) + fwd * 0.03
    L = (toe - heel).length
    bm = bmesh.new()
    # 鞋帮：沿鞋长取 9 个截面，宽、高按鞋型变化（后跟窄高、前掌宽、鞋头低）
    secs = []
    for k in range(9):
        u = k / 8
        w = 0.034 + 0.016 * math.sin(math.pi * min(1.0, u * 1.25)) - 0.012 * max(0, u - 0.85) * 6
        h = 0.085 - 0.05 * u ** 1.4
        z0 = 0.018
        c = heel + fwd * (L * u)
        ring = []
        for j in range(16):
            ang = 2 * math.pi * j / 16
            y = math.cos(ang) * w
            z = z0 + (math.sin(ang) * 0.5 + 0.5) * h
            if math.sin(ang) < 0:
                z = z0 + (math.sin(ang) * 0.5 + 0.5) * 0.012
            ring.append(bm.verts.new(c + left * y + V((0, 0, z))))
        secs.append(ring)
    for k in range(8):
        for j in range(16):
            bm.faces.new((secs[k][j], secs[k][(j + 1) % 16], secs[k + 1][(j + 1) % 16], secs[k + 1][j]))
    bm.faces.new(list(reversed(secs[0])))
    bm.faces.new(secs[-1])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), dtype=bool))
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    sub = ob.modifiers.new('细分', 'SUBSURF')
    sub.levels = sub.render_levels = 2
    # 鞋底：一块圆角薄板
    bm = bmesh.new()
    c = (heel + toe) / 2
    bs_box(bm, c + V((0, 0, 0.011)), (L / 2 + 0.006, 0.047, 0.011), fwd)
    me2 = bpy.data.meshes.new(name + '·底')
    bm.to_mesh(me2)
    bm.free()
    me2.materials.append(sole_mat)
    so = bpy.data.objects.new(name + '·底', me2)
    coll.objects.link(so)
    bv = so.modifiers.new('倒角', 'BEVEL')
    bv.width = 0.008
    bv.segments = 3
    so.parent = ob
    return ob


def bs_box(bm, c, half, fwd):
    left = V((0, 0, 1)).cross(fwd).normalized()
    R = mathutils.Matrix((fwd, left, V((0, 0, 1)))).transposed()
    vs = []
    for dx in (-1, 1):
        for dy in (-1, 1):
            for dz in (-1, 1):
                vs.append(bm.verts.new(c + R @ V((dx * half[0], dy * half[1], dz * half[2]))))
    idx = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    for f in idx:
        bm.faces.new([vs[i] for i in f])
