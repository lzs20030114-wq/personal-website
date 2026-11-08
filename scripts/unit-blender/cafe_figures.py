"""Lab 2-15 效果图里的人：台架同一副方块人（2026-11-08，作者「人偶太难看，还原网页里看到的那种方块人」）。

几何不在这里建：cafe-export.mjs 用站上的 figureParts（src/lib/space/figure.ts）把每个人原样导出——零件、比例、坐姿、
看猫时前倾、头转、穿着与配色（figurePalette）全是台架那一份，世界坐标、米。这里只做两件事：
  1. 按颜色建网格、上材质（台架是平涂的块，这里给哑光的漆面，块的边稍微倒一点角）；
  2. 手势（摸猫、拿手机、拿逗猫棒；布景，不是仿真的输出）：方块人每一块都是独立的小盒子，把一条胳膊上的块
     （上臂、前臂、手、袖上的条纹）按离仿真骨架的哪一节最近认出来，整块地转到手势要的位置——上臂绕肩转、
     前臂与手跟着肘走；肩到腕仍是仿真的上臂、前臂长度（两节 IK），别的块一块不动。
"""

import bpy
import math
import mathutils
import numpy as np

V = mathutils.Vector


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


def _seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return (a + ab * t - p).length


_MAT = {}


def block_material(color, tone):
    key = (tone, tuple(round(c, 4) for c in color))
    if key in _MAT:
        return _MAT[key]
    m = bpy.data.materials.new(f'方块人·{tone}')
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*srgb(color), 1)
    p.inputs['Roughness'].default_value = {'eye': 0.25, 'shine': 0.2, 'frame': 0.3}.get(tone, 0.6)
    p.inputs['Coat Weight'].default_value = 0.12
    if tone == 'shine':
        p.inputs['Emission Color'].default_value = (*srgb(color), 1)
        p.inputs['Emission Strength'].default_value = 0.4
    m.diffuse_color = (*srgb(color), 1)
    _MAT[key] = m
    return m


def _sides(P):
    """仿真的两条胳膊各在身体哪一侧（世界系有镜像，按位置认）"""
    arms = [{k: V(a[k]) for k in ('shoulder', 'elbow', 'wrist')} for a in P['joints']['arms']]
    h = P['heading']
    right = V((math.sin(h), -math.cos(h), 0))
    mid = (arms[0]['shoulder'] + arms[1]['shoulder']) / 2
    return [('R' if (a['shoulder'] - mid).dot(right) > 0 else 'L', a) for a in arms]


def _arm_moves(P, gesture):
    """手势要动的胳膊：side → ((骨架上的 肩, 肘, 腕), (新的 肘, 腕))"""
    if not gesture:
        return {}
    out = {}
    for s, a in _sides(P):
        if f'wrist.{s}' not in gesture:
            continue
        sh, el, wr = a['shoulder'], a['elbow'], a['wrist']
        wt = V(gesture[f'wrist.{s}'])
        ep = V(gesture.get(f'elbow.{s}', el))
        pole = ep + (ep - (sh + wt) / 2) * 2.0
        el2, wr2 = _ik2(sh, wt, (el - sh).length, (wr - el).length, pole)
        out[s] = ((sh, el, wr), (el2, wr2))
    return out


def _components(idx, n):
    parent = np.arange(n)

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for a, b, c in idx:
        for x, y in ((a, b), (b, c)):
            rx, ry = find(x), find(y)
            if rx != ry:
                parent[rx] = ry
    return np.array([find(i) for i in range(n)])


def make_block_person(P, coll, name, gesture=None):
    """一个人：P['blocks'] = 台架方块人的零件（按颜色分组、世界坐标）。返回根物体"""
    J = P['joints']
    legs = [{k: V(l[k]) for k in ('hip', 'knee', 'ankle')} for l in J['legs']]
    neck = V(J['neck'])
    hip_mid = (legs[0]['hip'] + legs[1]['hip']) / 2
    moves = _arm_moves(P, gesture)
    # 骨架的各节：认每一块零件属于哪一节（离中心最近的那节）
    segs = [('torso', hip_mid, neck, None), ('head', neck, neck + V((0, 0, 0.25)), None)]
    for l in legs:
        segs += [('leg', l['hip'], l['knee'], None), ('leg', l['knee'], l['ankle'], None)]
    for s, a in _sides(P):
        segs += [('upper', a['shoulder'], a['elbow'], s), ('fore', a['elbow'], a['wrist'], s),
                 ('fore', a['wrist'], a['wrist'] + (a['wrist'] - a['elbow']).normalized() * 0.1, s)]
    root = bpy.data.objects.new(name, None)
    coll.objects.link(root)
    for part in P['blocks']:
        v = np.asarray(part['verts'], dtype=np.float64).reshape(-1, 3)
        idx = np.asarray(part['idx'], dtype=np.int64).reshape(-1, 3)
        if moves:
            comp = _components(idx, len(v))
            for cid in np.unique(comp):
                sel = comp == cid
                c = V(v[sel].mean(0))
                _, (kind, side) = min(((_seg_dist(c, a_, b_), (k, s)) for k, a_, b_, s in segs), key=lambda t: t[0])
                if kind not in ('upper', 'fore') or side not in moves:
                    continue
                (sh, el, wr), (el2, wr2) = moves[side]
                if kind == 'upper':
                    R = np.array((el - sh).rotation_difference(el2 - sh).to_matrix())
                    v[sel] = (R @ (v[sel] - np.array(sh)).T).T + np.array(sh)
                else:
                    R = np.array((wr - el).rotation_difference(wr2 - el2).to_matrix())
                    v[sel] = (R @ (v[sel] - np.array(el)).T).T + np.array(el2)
        me = bpy.data.meshes.new(f"{name}·{part['tone']}")
        me.from_pydata(v.tolist(), [], idx.tolist())
        me.validate()
        me.materials.append(block_material(part['color'], part['tone']))
        ob = bpy.data.objects.new(f"{name}·{part['tone']}", me)
        coll.objects.link(ob)
        ob.parent = root
        if part['tone'] not in ('eye', 'shine', 'frame'):
            bv = ob.modifiers.new('倒角', 'BEVEL')
            bv.width = 0.002
            bv.segments = 2
            bv.limit_method = 'ANGLE'
    return root
