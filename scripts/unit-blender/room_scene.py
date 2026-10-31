"""项目二 · Lab 2-15 整间房的一刻，在 Blender 里搭出来渲静帧（2026-10-30）。

    blender -b --factory-startup --python scripts/unit-blender/room_scene.py -- <room.json> <out.blend> <场景名>

输入是 room-export.mjs 导出的一刻（与台架同一套仿真跑到第 T 秒）：64 台单元各在什么高度、每条带取哪一帧剖面、扣着哪几颗键、
带间的膜接不接；人、猫按台架同一副方块模型摆好（世界坐标）；家具按平面模型的那一套。机构件（天花方板、吊杆、上下夹环、芯、
键的撑杆、膜）与单元建模的 A 镜头是同一套（import build_scene），这里只管摆放、布景、灯光和机位。
"""

import bpy
import bmesh
import math
import os
import sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_scene as bs  # noqa: E402  —— 模块顶层按 argv[0] 读入 room.json（里面有同样的 meta），尺寸常量随之按这间房

D = bs.D
OUT = bs.OUT
TITLE = bs.argv[2] if len(bs.argv) > 2 else 'R 整间房'
CEIL = bs.CEIL
DANG = bs.DANG
N = D['n']
HALF = D['meta']['roomM'] / 2


def clone(ob, coll, parent=None):
    """连子物体一起复制（网格数据共用）"""
    c = ob.copy()
    coll.objects.link(c)
    c.parent = parent
    for ch in ob.children:
        clone(ch, coll, c)
    return c


def drop_template(obs):
    names = [ob.name for ob in obs]
    for nm in names:
        if nm in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[nm])


def build_room_shell(coll, mats):
    """地面 + 两面墙（−X、−Y，与台架同侧，机位在 +X / +Y 那边）+ 天花板（下表面在 CEIL）+ 踢脚线"""
    m = 0.6
    bm = bmesh.new()
    bs.bm_box(bm, 0, 0, -0.05, HALF + m, HALF + m, 0.05)
    floor = bs.bm_obj('房间·地面', bm, coll, mats['floor_room'], smooth=False)
    bm = bmesh.new()
    bs.bm_box(bm, -HALF - 0.06, 0, CEIL / 2, 0.06, HALF + 0.12, CEIL / 2)
    bs.bm_box(bm, 0, -HALF - 0.06, CEIL / 2, HALF + 0.12, 0.06, CEIL / 2)
    wall = bs.bm_obj('房间·墙', bm, coll, mats['wall_room'], smooth=False)
    bm = bmesh.new()
    bs.bm_box(bm, -HALF + 0.006, 0, 0.04, 0.006, HALF, 0.04)
    bs.bm_box(bm, 0, -HALF + 0.006, 0.04, HALF, 0.006, 0.04)
    skirt = bs.bm_obj('房间·踢脚线', bm, coll, mats['dark'], smooth=False)
    bm = bmesh.new()
    bs.bm_box(bm, 0, 0, CEIL + 0.04, HALF + 0.12, HALF + 0.12, 0.04)
    ceil = bs.bm_obj('天花板', bm, coll, mats['ceiling'], smooth=False)
    return [floor, wall, skirt, ceil]


def furniture(coll, mats):
    """家具：平面模型那一套的方块（沙发 = 底座 + 坐垫 + 靠背 + 扶手，餐椅 = 座 + 靠背 + 腿），按种类上料"""
    by = {'sofa': bmesh.new(), 'chair': bmesh.new()}
    for b in D['furniture']:
        bm = by.get(b['kind'], by['sofa'])
        (cx, cy, cz), (hx, hy, hz) = b['c'], b['h']
        bs.bm_box(bm, cx, cy, cz, hx, hy, hz)
    out = []
    if D['furniture']:
        out.append(bs.bm_obj('家具·沙发', by['sofa'], coll, mats['sofa'], smooth=False, bevel=0.012))
        out.append(bs.bm_obj('家具·餐椅', by['chair'], coll, mats['wood'], smooth=False, bevel=0.004))
    return out


def figures(coll, items, prefix):
    """人 / 猫：导出时已摆到世界里（Blender 坐标），按零件颜色各一块"""
    for k, it in enumerate(items):
        root = bpy.data.objects.new(f'{prefix}{k + 1}', None)
        coll.objects.link(root)
        for p in it['parts']:
            v = np.asarray(p['verts'], dtype=np.float64).reshape(-1, 3)
            idx = np.asarray(p['idx'], dtype=np.int64).reshape(-1, 3)
            col = tuple(round(c, 3) for c in p['color'])
            mat = bs.principled(f'方块·{col}', col, rough=0.62)
            ob = bs.mesh_obj(f'{prefix}{k + 1}·{p["tone"]}', v, idx, coll, mats=[mat], smooth=[False] * len(idx))
            ob.parent = root


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.name = TITLE
    sc.unit_settings.system = 'METRIC'
    mats = bs.materials()
    mats['floor_room'] = bs.principled('地面·水磨石', (0.3, 0.29, 0.27), rough=0.5)
    mats['wall_room'] = bs.principled('墙·暖灰', (0.5, 0.48, 0.45), rough=0.9)
    mats['ceiling'] = bs.principled('天花·浅灰', (0.62, 0.62, 0.6), rough=0.9)
    mats['sofa'] = bs.principled('沙发·织物', (0.46, 0.41, 0.35), rough=0.9, sheen=0.4)
    mats['wood'] = bs.principled('餐椅·木', (0.5, 0.36, 0.24), rough=0.55)
    top = sc.collection

    stage = bs.new_coll('房间', top)
    build_room_shell(stage, mats)
    furniture(bs.new_coll('家具', top), mats)

    # ---------------------------------------------------------------- 模板（只建一次，之后按单元复制，网格共用）
    tmpl = bs.new_coll('模板', top)
    plate_t = bs.build_plate(tmpl, mats)
    carr_t = bs.build_carriage(tmpl, mats, bs.CLAMP_N)
    foot_t = bs.build_foot(tmpl, mats, bs.CLAMP_N)
    stage_cache = {}

    def stage_t(d, L, mat_key, collar):
        key = (round(d, 4), L, mat_key, collar)
        if key not in stage_cache:
            stage_cache[key] = bs.build_stage(tmpl, mats, f'节·{key}', d, L, mats[mat_key], collar=collar)
        return stage_cache[key]

    # 带子：每种（档, 帧）一份网格；同一档的所有帧一起交给 BandBuilder，键座朝向在各帧之间一致
    tiers = D['tiers']
    for t in tiers:
        for k, b in enumerate(t['bonds']):
            b['_k'] = k
            b['allHidden'] = False
    shapes = D['shapes']
    for st in shapes.values():
        st['p'] = 0
    builders = {}
    for ti, t in enumerate(tiers):
        mine = [st for st in shapes.values() if st['tier'] == ti]
        if mine:
            builders[ti] = bs.BandBuilder(N, t['bonds'], mine)
    band_mesh = {}
    for key, st in shapes.items():
        bb = builders[st['tier']]
        ob = bs.mesh_obj(f'带·{key}', bb.verts(st), bb.faces, tmpl, mats=[mats['fabric'], mats['pad'], mats['strut']],
                         mat_idx=bb.mat_idx, smooth=bb.smooth, uvs=bb.uv)
        band_mesh[key] = ob.data
        bpy.data.objects.remove(ob)
    mem_mesh = {}

    def membrane(ka, kb):
        if (ka, kb) not in mem_mesh:
            A, B = shapes[ka], shapes[kb]
            ta, tb = tiers[A['tier']], tiers[B['tier']]
            pair = (ta['mid'], tb['mid'], min(ta['midHalf'], tb['midHalf']))
            faces = [(i, i + 1, N + i + 1, N + i) for i in range(N - 1)]
            ob = bs.mesh_obj(f'膜·{ka}·{kb}', bs.membrane_verts(A, B, pair), faces, tmpl, mats=[mats['membrane']], smooth=[True] * len(faces))
            mem_mesh[(ka, kb)] = ob.data
            bpy.data.objects.remove(ob)
        return mem_mesh[(ka, kb)]

    # ---------------------------------------------------------------- 64 台
    a0 = D['angle0']
    plate_bot = CEIL - bs.PLATE_T

    def seen(ob, x, y, bottom, L):
        """伸缩杆的一节只留天花方板以下那截（按高度压扁；箍是子物体，跟着压，薄了几毫米看不出来）"""
        vis = min(L, plate_bot - bottom)
        if vis <= 0.006:
            for ch in list(ob.children):
                bpy.data.objects.remove(ch)
            bpy.data.objects.remove(ob)
            return
        ob.location = (x, y, bottom)
        ob.scale = (1.0, 1.0, vis / L)
    for u, unit in enumerate(D['units']):
        uc = bs.new_coll(f'单元{u:02d}', top)
        x, y = unit['x'], unit['y']
        for ob in plate_t:
            c = clone(ob, uc)
            c.location = (x, y, 0.0)
        for j, key in enumerate(unit['bands']):
            ob = bpy.data.objects.new(f'单元{u:02d}·带{j:02d}', band_mesh[key])
            uc.objects.link(ob)
            ob.location = (x, y, unit['top'])
            ob.rotation_euler = (0, 0, a0 + j * DANG)
            if unit['mem'][j]:
                mo = bpy.data.objects.new(f'单元{u:02d}·膜{j:02d}', membrane(key, unit['bands'][(j + 1) % len(unit['bands'])]))
                uc.objects.link(mo)
                mo.location = (x, y, unit['top'])
                mo.rotation_euler = (0, 0, a0 + j * DANG)
        cz, fz = unit['carriage'], unit['foot']
        for ob in carr_t:
            c = clone(ob, uc)
            c.location = (x, y, cz)
            c.rotation_euler = (0, 0, a0)
        for ob in foot_t:
            c = clone(ob, uc)
            c.location = (x, y, fz)
            c.rotation_euler = (0, 0, a0)
        # 吊杆：天花方板下沿到上夹环法兰顶，六节逐节等分伸出量。缩进天花里的那截不画（整间房的图要拿掉天花板俯瞰，
        # 设备层里的东西露出来就是一片立着的管子；单元建模的 A 镜头里有天花机箱的剖切图）
        E = plate_bot - (cz + bs.RING_TOP + bs.HUB['fh'])
        nh = bs.HANGER['n']
        for k in range(1, nh):
            d = bs.HANGER['d0'] - k * bs.HANGER['dd']
            bottom = plate_bot - E * k / (nh - 1)
            seen(clone(stage_t(d, bs.HANGER['L'], 'alu', True), uc), x, y, bottom, bs.HANGER['L'])
        # 芯：上夹环中心套底面到下夹环中心套顶面
        carr_bot = cz + bs.RING_TOP - bs.HUB['h']
        foot_top = fz - 0.008 + bs.HUB['h']
        Lc = max(0.0, carr_bot - foot_top)
        nc = max(2, int(math.ceil(Lc / (bs.CORE['L'] - 0.05))) + 1)
        for k in range(nc):
            d = bs.CORE['d0'] - k * (bs.CORE['d0'] - 0.016) / max(1, nc - 1)
            seen(clone(stage_t(d, bs.CORE['L'], 'dark' if k % 2 else 'alu', k > 0), uc), x, y, carr_bot - Lc * k / (nc - 1), bs.CORE['L'])
    drop_template(list(tmpl.objects))
    bpy.data.collections.remove(tmpl)

    figures(bs.new_coll('访客', top), D['people'], '访客')
    figures(bs.new_coll('猫', top), D['cats'], '猫')

    # ---------------------------------------------------------------- 灯光与机位
    lights = bs.new_coll('灯光与机位', top)
    bs.world(sc, color=(0.16, 0.17, 0.18), strength=0.35)
    key = bs.area_light(lights, '主光', (6.2, 4.6, 4.2), bs.look_rot((6.2, 4.6, 4.2), (0, 0, 0.8)), 4.0, 700, (1.0, 0.95, 0.88))
    fill = bs.area_light(lights, '补光', (2.0, 7.2, 2.6), bs.look_rot((2.0, 7.2, 2.6), (0, 0, 1.0)), 4.0, 220, (0.85, 0.92, 1.0))
    sky = bs.area_light(lights, '顶光', (0, 0, CEIL - 0.42), (0, 0, 0), HALF * 2 * 0.9, 380, (1.0, 0.97, 0.92))
    for L in (key, fill, sky):
        L.visible_camera = False
    bs.still_cam(lights, 'R·俯瞰', (7.6, 6.6, 6.4), (-0.3, -0.4, 0.9), lens=28)
    bs.still_cam(lights, 'R·人眼', (3.05, 2.85, 1.62), (-0.8, -1.2, 1.25), lens=20)
    bs.still_cam(lights, 'R·坐姿', (0.15, 3.0, 1.22), (-0.5, -0.6, 0.75), lens=24)
    side = bs.still_cam(lights, 'R·侧立面', (14.0, 0.0, CEIL / 2), (0.0, 0.0, CEIL / 2), lens=50)
    side.data.type = 'ORTHO'
    side.data.ortho_scale = HALF * 2 + 0.6
    sc.camera = bpy.data.objects['R·俯瞰']
    sc.render.resolution_x = 1920
    sc.render.resolution_y = 1080
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 64
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 6
    sc.cycles.transparent_max_bounces = 24
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.frame_start = sc.frame_end = 1
    bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
    print('SAVED', OUT, 'units', len(D['units']), 'shapes', len(shapes), 'membranes', len(mem_mesh))


main()
