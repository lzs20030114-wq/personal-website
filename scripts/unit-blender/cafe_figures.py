"""Lab 2-15 效果图里的人：风格化的「模型小人」（2026-11-08，作者「做不好仿真的人，为了不露怯，干脆用风格化的人，不要追求真实」）。

光滑、无五官、统一的暖白哑光材质，像建筑模型里的人。形体直接从仿真的骨架长出来（cafe-export.mjs 导出的 humanSkeleton：
髋、膝、踝、肩、肘、腕与头的枢轴，世界坐标、米）：躯干、头、每条腿、每条胳膊各是一族融球（不同族之间不融合，关节处像人偶），
转成网格。坐 / 站 / 走、看猫时前倾、头转向在看的猫，都照仿真；手势（摸猫、拿手机、拿逗猫棒）由调用方给腕与肘的位置，
胳膊用两节 IK 按仿真的上臂、前臂长度落过去。
"""

import bpy
import math
import mathutils
import numpy as np

V = mathutils.Vector

# 融球：阈值 0.6、硬度 2 时表面落在影响半径的 0.575 处；下面的尺寸都写看得见的半径（米）
MB_T, MB_S = 0.6, 2.0
VIS = math.sqrt(1 - (MB_T / MB_S) ** (1 / 3))
K_ELL = 1.45


def srgb(c):
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


def _ik2(root, target, L1, L2, pole):
    """两节解析 IK：root → mid → end，end 尽量落到 target，mid 偏向 pole 那侧"""
    d = target - root
    D = min(max(d.length, abs(L1 - L2) + 1e-4), (L1 + L2) * 0.9995)
    u = d.normalized()
    a = (L1 * L1 - L2 * L2 + D * D) / (2 * D)
    h = math.sqrt(max(L1 * L1 - a * a, 0.0))
    pv = pole - root
    pv = pv - u * pv.dot(u)
    if pv.length < 1e-6:
        pv = V((0, 0, -1)).cross(u)
    pv.normalize()
    return root + u * a + pv * h, root + u * D


class Family:
    """一族融球（一个物体），建完转成网格"""

    def __init__(self, name, res=0.009):
        self.mb = bpy.data.metaballs.new(name)
        self.mb.resolution = res
        self.mb.render_resolution = res
        self.mb.threshold = MB_T
        self.ob = bpy.data.objects.new(name, self.mb)
        bpy.context.scene.collection.objects.link(self.ob)

    def ell(self, co, r, rot=None):
        e = self.mb.elements.new(type='ELLIPSOID')
        e.co = co
        e.stiffness = MB_S
        e.size_x, e.size_y, e.size_z = (r[0] * K_ELL, r[1] * K_ELL, r[2] * K_ELL)
        e.radius = 1.0
        if rot is not None:
            e.rotation = rot

    def cap(self, a, b, r):
        a, b = V(a), V(b)
        d = b - a
        L = d.length
        e = self.mb.elements.new(type='CAPSULE')
        e.co = (a + b) / 2
        e.stiffness = MB_S
        e.size_x = L / 2
        e.radius = r / VIS
        if L > 1e-6:
            e.rotation = V((1, 0, 0)).rotation_difference(d.normalized())

    def mesh(self, coll, mat):
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(self.ob.evaluated_get(dg))
        bpy.data.objects.remove(self.ob)
        bpy.data.metaballs.remove(self.mb)
        me.materials.append(mat)
        me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), dtype=bool))
        return me


def _frame(x_axis, z_axis):
    """椭球的朝向：局部 x 沿 x_axis、z 尽量沿 z_axis"""
    x = x_axis.normalized()
    z = (z_axis - x * z_axis.dot(x)).normalized()
    y = z.cross(x)
    return mathutils.Matrix((x, y, z)).transposed().to_quaternion()


_MAT = {}


def figure_material(color):
    """哑光、带一点点次表面（像树脂的模型人）。颜色 = 这个人上衣的色调淡成低饱和的单色：没有五官、不画衣服，只用颜色把人分开"""
    base = (0.86, 0.84, 0.8)
    c = tuple(0.5 * color[i] + 0.5 * base[i] for i in range(3))
    key = tuple(round(v, 3) for v in c)
    if key in _MAT:
        return _MAT[key]
    m = bpy.data.materials.new('人·模型色')
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*srgb(c), 1)
    p.inputs['Roughness'].default_value = 0.58
    p.inputs['Subsurface Weight'].default_value = 0.06
    p.inputs['Subsurface Radius'].default_value = (0.6, 0.5, 0.4)
    p.inputs['Subsurface Scale'].default_value = 0.01
    p.inputs['Coat Weight'].default_value = 0.08
    m.diffuse_color = (*srgb(c), 1)
    _MAT[key] = m
    return m


def make_figure(P, coll, name, gesture=None):
    """一个人：P = cafe-export 导出的一个人（世界坐标、米）；gesture = {'wrist.L': …, 'elbow.L': …, 'hand.L': …}（可选）。
    仿真的左右（世界系有镜像）按在身体哪一侧重新对上。返回根物体"""
    J = P['joints']
    legs = [{k: V(l[k]) for k in ('hip', 'knee', 'ankle')} for l in J['legs']]
    arms = [{k: V(a[k]) for k in ('shoulder', 'elbow', 'wrist')} for a in J['arms']]
    neck = V(J['neck'])
    hip_mid = (legs[0]['hip'] + legs[1]['hip']) / 2
    sh_mid = (arms[0]['shoulder'] + arms[1]['shoulder']) / 2
    h = P['heading']
    fwd = V((math.cos(h), math.sin(h), 0))
    right = fwd.cross(V((0, 0, 1))).normalized()
    up = (sh_mid - hip_mid).normalized()

    def side(p, ref):
        return 'R' if (p - ref).dot(right) > 0 else 'L'
    L = {side(l['hip'], hip_mid): l for l in legs}
    A = {side(a['shoulder'], sh_mid): a for a in arms}
    if len(L) < 2:
        L = {'L': legs[0], 'R': legs[1]}
    if len(A) < 2:
        A = {'L': arms[0], 'R': arms[1]}
    mat = figure_material(P['outfit']['colors']['shirt'])
    tag = name.replace('.', '_')
    meshes = []
    # 躯干 + 颈 + 头（一族，融成一体）
    f = Family(f'{tag}躯')
    q_t = _frame(right, up)
    chest = sh_mid - up * 0.13 + fwd * 0.005
    pelvis = hip_mid + up * 0.06
    f.ell(chest, (0.14, 0.095, 0.155), rot=q_t)
    f.ell(pelvis, (0.15, 0.1, 0.1), rot=q_t)
    f.cap(pelvis + up * 0.05, chest - up * 0.05, 0.115)
    # 肩：一根横贯两肩的圆杆（人偶那样平而宽的肩），胳膊从它的两端出来
    sl, sr = [a['shoulder'] - up * 0.045 for a in arms]
    f.cap(sl, sr, 0.056)
    f.cap(sh_mid - up * 0.02, neck + up * 0.01, 0.036)
    # 头：一只蛋形，窄头朝下巴那侧（前下方），朝向在看的东西
    meshes.append(f.mesh(coll, mat))
    f = Family(f'{tag}头')
    look = P.get('lookAt')
    gaze = V(look) - neck if look is not None else V((math.cos(P['gaze']), math.sin(P['gaze']), -0.1))
    g_h = V((gaze.x, gaze.y, 0)).normalized()
    pitch = math.atan2(gaze.z, V((gaze.x, gaze.y, 0)).length)
    pitch = max(-0.6, min(0.35, pitch))
    head_up = (up * 0.6 + V((0, 0, 1)) * 0.4).normalized()
    head_up = (head_up * math.cos(pitch) - g_h * math.sin(pitch) * 0.6).normalized()
    hc = neck + head_up * 0.085 + g_h * 0.015
    f.ell(hc, (0.08, 0.09, 0.102), rot=_frame(right if abs(right.dot(head_up)) < 0.9 else g_h.cross(head_up), head_up))
    f.ell(hc - head_up * 0.04 + g_h * 0.03, (0.052, 0.056, 0.045), rot=_frame(g_h.cross(head_up), head_up))   # 下颌
    meshes.append(f.mesh(coll, mat))
    # 腿（每条一族）
    for s in 'LR':
        l = L[s]
        f = Family(f'{tag}腿{s}')
        f.cap(l['hip'], l['knee'], 0.064)
        f.cap(l['knee'], l['ankle'], 0.047)
        f.ell(l['hip'].lerp(l['knee'], 0.3), (0.12, 0.075, 0.07), rot=_frame(l['knee'] - l['hip'], up))
        out = 0.1 if s == 'L' else -0.1
        fd = mathutils.Matrix.Rotation(out, 3, 'Z') @ fwd
        foot_c = V((l['ankle'].x, l['ankle'].y, 0.0)) + fd * 0.06 + V((0, 0, max(0.038, l['ankle'].z - 0.03)))
        f.ell(foot_c, (0.115, 0.045, 0.034), rot=_frame(fd, V((0, 0, 1))))
        meshes.append(f.mesh(coll, mat))
    # 胳膊（每条一族）：肩 → 腕两节 IK（长度用仿真的上臂、前臂），手势给的腕与肘优先
    for s in 'LR':
        a = A[s]
        sh = a['shoulder']
        L1 = (a['elbow'] - sh).length
        L2 = (a['wrist'] - a['elbow']).length
        wr_t, el_p = a['wrist'], a['elbow']
        hand_dir = None
        if gesture and f'wrist.{s}' in gesture:
            wr_t = V(gesture[f'wrist.{s}'])
            el_p = V(gesture.get(f'elbow.{s}', el_p))
            if f'hand.{s}' in gesture:
                hand_dir = V(gesture[f'hand.{s}']).normalized()
        pole = el_p + (el_p - (sh + wr_t) / 2) * 2.0
        el, wr = _ik2(sh - up * 0.035, wr_t, L1, L2, pole)
        f = Family(f'{tag}臂{s}')
        root = sh - up * 0.035
        f.cap(root, el, 0.04)
        f.cap(el, wr, 0.035)
        if hand_dir is None:
            hand_dir = ((wr - el).normalized() + V((0, 0, -0.3))).normalized()
        f.ell(wr + hand_dir * 0.055, (0.06, 0.035, 0.018), rot=_frame(hand_dir, right.cross(hand_dir) if abs(right.cross(hand_dir).length) > 0.1 else up))
        meshes.append(f.mesh(coll, mat))
    # 并成一个物体
    me = bpy.data.meshes.new(name)
    vs, fs, off = [], [], 0
    for m in meshes:
        co = np.empty(len(m.vertices) * 3)
        m.vertices.foreach_get('co', co)
        vs.append(co.reshape(-1, 3))
        for p in m.polygons:
            fs.append([i + off for i in p.vertices])
        off += len(m.vertices)
        bpy.data.meshes.remove(m)
    me.from_pydata(np.concatenate(vs).tolist(), [], fs)
    me.materials.append(mat)
    me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), dtype=bool))
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    sub = ob.modifiers.new('平滑', 'SMOOTH')
    sub.factor = 0.5
    sub.iterations = 4
    return ob
