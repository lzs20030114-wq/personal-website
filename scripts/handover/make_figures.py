# -*- coding: utf-8 -*-
"""交接图册出图：815.3dm 分件网格 → 各张图 PNG + 标注锚点 JSON。

  python extract_815.py ../../模型求解器参考/815.3dm parts.pkl
  python make_figures.py parts.pkl <outDir>

- **不画** 815 模型中的曲柄轮与驱动杆：日志 2026-08-23 记录实物已改为齿条驱动，曲柄—连杆方案作废；
  齿条在模型里没有，交接图册用示意图另画。
- 模型里没有的电机本体、绕线盘、皮带、转台实物外形、肌腱，由 proxies.py 按留好的框 / 托盘补画（示意件）。
"""
import json, math, pickle, sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
from render import render, fit_cam, Cam, view_basis
import proxies as PX

PK, OUT = sys.argv[1], Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
_PK = pickle.load(open(PK, 'rb'))
P = _PK['parts']
# 环的三角板拓扑给 build_doc.py 画矢量图用（与 shell3d-data.ts 同一份）
json.dump({k: dict(tris=v['tris'], apex=v['apex'], pin=v['pin'], center=v['center'], crankR=v['crankR'])
           for k, v in _PK['shell'].items()}, open(OUT / 'ring-topo.json', 'w'))

ARM_SPLIT = -182.0   # 大触手：x 大于此 = 机架上的安装笼（含三个电机框），小于 = 椎节
FILL = dict(
    base=(200, 204, 209), turntable=(143, 163, 184), cage=(178, 188, 200), chassis=(216, 207, 190),
    rail=(196, 220, 207), ring=(238, 233, 223), shaft=(199, 123, 91), pulley=PX.SPOOL,
    shaftblock=(214, 92, 70), bracket=(160, 182, 214), motor=PX.STEPPER, crank=(240, 201, 135),
    armmount=(178, 200, 224), arm=(207, 224, 239), armmotor=PX.STEPPER, small=(235, 207, 217),
    tendon=PX.TENDON['A'],
)
PALE = (243, 244, 245)
PALE_INK = (150, 156, 162)

def group_of(p):
    c = p['cat']; lo, hi = p['lo'], p['hi']; s = hi - lo
    if c == 'plate': return 'ring'
    if c in ('wheel', 'rod'): return 'crank'
    if c == 'axpart': return 'pulley' if s[0] > 9 and s[1] > 14 else 'shaftblock'
    if c == 'motor': return 'bracket'
    if c == 'chassis':
        if hi[2] > -16.5: return 'chassis'
        if abs(s[0] - 59.8) < 1 and abs(s[2] - 45) < 1: return 'turntable'
        if lo[2] >= -100.5: return 'cage'
        return 'base'
    return c   # shaft / rail / arm / small

# 拆大触手：按三角形质心 x
pieces = []
for i, p in enumerate(P):
    g = group_of(p)
    v = p['v'].astype(float)
    if g in ('turntable', 'pulley'):
        continue          # 模型里的 ⌀60 圆柱占位、⌀16 小带轮：换成下面的实物示意件
    if g == 'arm':
        cx = v[p['t']].mean(1)[:, 0]
        for gg, m in (('armmount', cx > ARM_SPLIT), ('arm', cx <= ARM_SPLIT)):
            t = p['t'][m]
            if len(t): pieces.append(dict(g=gg, v=v, t=t, ring=None, src=i))
    else:
        pieces.append(dict(g=g, v=v, t=p['t'], ring=p['ring'], src=i))

_src = [1000]
def add_px(g, mesh, fill=None, ink=None, **kw):
    _src[0] += 1
    v, t = mesh
    d = dict(g=g, v=np.asarray(v, float), t=np.asarray(t, np.int32), ring=None, src=_src[0], proxy=True, **kw)
    if fill is not None: d['fill'] = fill
    if ink is not None: d['ink'] = ink
    pieces.append(d)

# 偏航转台：箱体 + 输出盘 + 侧挂电机
H = PX.hdb60()
add_px('turntable', H['housing']); add_px('turntable', H['disk'], fill=(170, 186, 204))
add_px('turntable', H['body'], fill=PX.STEPPER)
# 主电机 + 20T + 皮带 + 中间轴上的 60T
MD = PX.main_drive()
add_px('pulley', MD['pulley60'])
add_px('motor', MD['body']); add_px('motor', MD['shaft'], fill=(150, 150, 150))
add_px('motor', MD['pulley20'], fill=PX.SPOOL); add_px('motor', MD['belt'], fill=PX.BELT, ink=(40, 40, 40))
# 大触手三台肌腱电机 + 绕线盘
AM = PX.arm_motors()
for k, m in AM.items():
    add_px('armmotor', m['body'], frame=k); add_px('armmotor', m['shaft'], fill=(150, 150, 150), frame=k)
    add_px('armmotor', m['spool'], fill=PX.SPOOL, frame=k)
# 肌腱：根部腱孔 → 每节（窗口 → 对面槽口 → 窗口）→ 梢端绑柱；笼内一段从绕线盘到根部腱孔
TP, TSEQ = PX.tendon_paths(_PK['arm'])
TMAP = {'A': 'D', 'B': 'R', 'C': 'L'}     # 就近对应：上方腱孔 ↔ 底部电机，右下 ↔ 右侧，左下 ↔ 左侧（示意）
TEND_FULL = {}
for k, path in TP.items():
    m = AM[TMAP[k]]
    e = path[0]; c = m['spool_c']; ax = m['axis']
    vv = e - c; vv = vv - ax * (vv @ ax); vv /= np.linalg.norm(vv)
    full = np.vstack([c + vv * 6.4, path])
    TEND_FULL[k] = full
    add_px('tendon', PX.tube(full, r=0.75), fill=PX.TENDON[k], ink=PX.TENDON[k], tendon=k)

def gpts(*gs, ring=None):
    out = [q['v'][np.unique(q['t'])] for q in pieces if q['g'] in gs and (ring is None or q['ring'] == ring)]
    return np.vstack(out)

def bbox(*gs, ring=None):
    v = gpts(*gs, ring=ring); return v.min(0), v.max(0)

CURRENT = [g for g in FILL if g != 'crank']

def items_for(groups, hi=None, offs=None, pale_groups=(), ring=None, only=None):
    it = []
    for q in pieces:
        if q['g'] not in groups: continue
        if ring is not None and q['ring'] not in ring and q['g'] in ('ring', 'rail', 'crank'): continue
        if only is not None and not only(q): continue
        v = q['v']
        if offs and q['g'] in offs: v = v + (np.array(q['off'], float) if 'off' in q else np.array(offs[q['g']], float))
        if q['g'] in pale_groups:
            it.append((v, q['t'], PALE, q['src'], PALE_INK))
        else:
            it.append((v, q['t'], q.get('fill', FILL[q['g']]), q['src'], q.get('ink')))
    return it

meta = {}
def save(name, items, cam, anchors=None, **kw):
    im = render(items, cam, **kw)
    im.save(OUT / f'{name}.png', optimize=True)
    a = {}
    for k, p in (anchors or {}).items():
        q = cam.proj(np.array([p]))[0]
        a[k] = [round(float(q[0]), 1), round(float(q[1]), 1)]
    meta[name] = dict(W=cam.W, H=cam.H, scale=cam.s, anchors=a)
    print(name, cam.W, cam.H, f'{cam.s:.3f}px/mm')

def ctr(*gs, ring=None):
    lo, hi = bbox(*gs, ring=ring); return (lo + hi) / 2

def top_of(*gs, ring=None, frac=1.0):
    lo, hi = bbox(*gs, ring=ring); c = (lo + hi) / 2; c[2] = lo[2] + (hi[2] - lo[2]) * frac; return c

ISO = (-128, 26)
allv_cur = gpts(*CURRENT)
body_groups = [g for g in CURRENT if g not in ('arm', 'armmount', 'armmotor', 'tendon')]
body_v = gpts(*body_groups)
ALO, AHI = allv_cur.min(0), allv_cur.max(0)
meta['_dims'] = dict(L=round(float(AHI[0] - ALO[0])), W=round(float(AHI[1] - ALO[1])), H=round(float(AHI[2] - ALO[2])),
                     ymin=round(float(ALO[1]), 1), ymax=round(float(AHI[1]), 1), belt_c=round(MD['center_dist'], 1))
print('外包', meta['_dims'])

def mctr(frame, part='body'):
    v = AM[frame][part][0]; return list((v.min(0) + v.max(0)) / 2)

# 共用锚点（3D）
def common_anchors():
    A = {}
    A['ring_S2'] = [-85, 0, 221]
    A['ring_S1'] = [-170, -110, 95]
    A['ring_S5'] = [170, 100, 80]
    A['rail'] = [96, -150, 2]
    A['rail_top'] = [181, 0, 105]
    A['shaft'] = [-120, 0, 0]
    A['pulley'] = [121, 0, 19]
    A['bracket'] = [175.4, -60, -45]
    A['motor'] = [150, -53.8, -75]
    A['chassis'] = [-170, -140, -12]
    A['cage'] = [-35.5, -48.9, -60]
    A['turntable'] = [-10, -30, -120]
    A['hdb_motor'] = [100, 3.5, -102]
    A['base'] = [120, -150, -150]
    A['base_foot'] = [-169.8, -171.4, -148]
    A['small_R'] = [49.5, 116, -120]
    A['small_L'] = [-35.5, -126, -100]
    A['armmount'] = [-120, 109, -16]
    A['m_L'] = mctr('L')
    A['m_R'] = mctr('R')
    A['m_D'] = mctr('D')
    A['arm'] = [-400, 109, -52]
    A['arm_tip'] = [-575, 109, -52]
    return A

# ---------- 封面轴测
cam = fit_cam(allv_cur, *ISO, 1800, 1150, margin=0.05)
save('cover', items_for(CURRENT), cam, common_anchors())

# ---------- 扉页大图（右后方）
cam = fit_cam(allv_cur, 52, 20, 1800, 1000, margin=0.04)
save('hero', items_for(CURRENT), cam, {})

# ---------- 三视图（同比例）
S3V = 1.5  # px/mm
def ortho(name, az, el, W, H, groups=CURRENT, extra=None, top=46, left=None):
    """同一比例的正投影。物体上缘放在 top 像素处，水平居中（或左缘放在 left），下方余量留给尺寸线。"""
    r, u, f = view_basis(az, el)
    v = gpts(*groups)
    sx, sy = v @ r, v @ u
    cx = (sx.max() + sx.min()) / 2 if left is None else sx.min() + (W / 2 - left) / S3V
    cy = sy.max() - (H / 2 - top) / S3V
    center = cx * r + cy * u + (v @ f).mean() * f
    cam = Cam(az, el, W, H, S3V, center)
    lo, hi = v.min(0), v.max(0)
    A = dict(lo=list(lo), hi=list(hi))
    A.update(extra or {})
    save(name, items_for(groups), cam, A)
    return cam
ZB = -156
ortho('view_front', 180, 0, 760, 720, top=40, extra={
    'zmax_pt': [0, 0, AHI[2]], 'zmin_pt': [0, 0, ZB], 'ymin_pt': [0, ALO[1], ZB], 'ymax_pt': [0, AHI[1], ZB],
    'axis': [0, 0, 0], 'ring_left': [0, -173, 0], 'ring_right': [0, 173, 0]})
ortho('view_side', -90, 0, 1300, 760, top=54, extra={
    'body_l': [-187.8, 0, ZB], 'body_r': [199.5, 0, ZB],
    'xmin_pt': [ALO[0], 0, ZB], 'xmax_pt': [AHI[0], 0, ZB], 'zmax_pt': [-74, 0, AHI[2]], 'zmin_pt': [-74, 0, ZB],
    **{f'st{i+1}': [-170 + 85 * i, 0, 240] for i in range(5)}, 'axis_l': [-190, 0, 0], 'axis_r': [200, 0, 0]})
ortho('view_top', -90, 89.999, 1300, 780, top=56, extra={
    'body_l': [-187.8, 0, 0], 'body_r': [199.5, 0, 0],
    'xmin_pt': [ALO[0], 0, 0], 'xmax_pt': [AHI[0], 0, 0], 'ymin_pt': [AHI[0], ALO[1], 0], 'ymax_pt': [AHI[0], AHI[1], 0],
    'front_arrow': [-600, 109, 0]})

# ---------- 爆炸图
OFFS = dict(base=(0, 0, -230), turntable=(0, 0, -165), cage=(0, 0, -95), chassis=(0, 0, 0),
            rail=(0, 0, 70), shaft=(0, 0, 70), pulley=(0, 0, 70), shaftblock=(0, 0, 70),
            bracket=(0, -80, -50), motor=(0, -80, -50), ring=(0, 0, 200), small=(0, 0, -20),
            armmount=(-50, 0, 0), armmotor=(-50, 0, 0), arm=(-120, 0, 0))
# 小触手按左右各自往外推，不和笼架叠在一起
for q in pieces:
    if q['g'] == 'small':
        side = 1 if q['v'][np.unique(q['t'])][:, 1].mean() > 0 else -1
        q['off'] = (0, 95 * side, -20)
EXPL = [g for g in CURRENT if g != 'tendon']
def off_of(q):
    return np.array(q.get('off', OFFS.get(q['g'], (0, 0, 0))), float)
ex_v = np.vstack([q['v'][np.unique(q['t'])] + off_of(q) for q in pieces if q['g'] in EXPL])
cam = fit_cam(ex_v, -128, 22, 1800, 1500, margin=0.04)
EA = {}
for g in EXPL:
    EA[g] = list(ctr(g) + np.array(OFFS.get(g, (0, 0, 0))))
EA['ring'] = [-74, -95, 175 + 200]
EA['rail'] = [96, -150, 2 + 70]
EA['shaft'] = [60, 0, 70]
EA['pulley'] = [121, 0, 19 + 70]
EA['motor'] = [150, -53.8 - 80, -75 - 50]
EA['bracket'] = [175, -100 - 80, -40 - 50]
EA['turntable'] = [-10, -30, -120 - 165]
EA['hdb_motor'] = [100, 3.5, -102 - 165]
EA['small'] = [49.5, 116 + 95, -110 - 20]
EA['small2'] = [-35.5, -126 - 95, -110 - 20]
EA['chassis'] = [-150, -140, -10]
EA['armmotor'] = list(np.array(mctr('R')) + np.array([-50, 0, 0]))
EA['armmotor2'] = list(np.array(mctr('D')) + np.array([-50, 0, 0]))
save('explode', items_for(EXPL, offs=OFFS), cam, EA)

# ---------- 分步装配（累积，新件上色，旧件浅灰）
STEPS = [
    ('step1', ['base', 'turntable']),
    ('step2', ['cage']),
    ('step3', ['chassis']),
    ('step4', ['rail']),
    ('step5', ['shaft', 'pulley', 'shaftblock', 'bracket', 'motor']),
    ('step6', ['ring']),
    ('step7', ['small']),
    ('step8', ['armmount', 'arm', 'armmotor', 'tendon']),
]
cam_body = fit_cam(body_v, *ISO, 1200, 860, margin=0.05)
cam_full = fit_cam(allv_cur, *ISO, 1200, 860, margin=0.04)
done = []
anc = common_anchors()
for name, new in STEPS:
    groups = done + new
    cam = cam_full if 'arm' in new else cam_body
    save(name, items_for(groups, pale_groups=done), cam, anc)
    done = groups

# ---------- 细部
def det(name, groups, az, el, W, H, ring=None, anchors=None, margin=0.06, pale=(), only=None, fitv=None):
    its = items_for(groups, ring=ring, pale_groups=pale, only=only)
    v = fitv if fitv is not None else np.vstack([it[0][np.unique(it[1])] for it in its])
    cam = fit_cam(v, az, el, W, H, margin=margin)
    save(name, its, cam, anchors)
    return cam

det('det_ring', ['ring', 'rail', 'shaft'], 180, 0, 1300, 760, ring=[2], anchors={
    'apex': [-0, 0, 157.3], 'foot_out_l': [0, -161.9, 0], 'foot_in_l': [0, -147.6, 0],
    'foot_out_r': [0, 161.9, 0], 'foot_in_r': [0, 147.6, 0], 'slot': [0, 100, -2], 'guide': [0, 0, 120],
    'hub': [0, 0, 0], 'strut': [0, 40, 45], 'tab': [0, -120, -10], 'plate': [0, -120, 95],
})
# 主电机与皮带：从左前上方看（电机支架挂在左梯形支架下、S4 与 S5 之间）。不画滑轨架，梯形支架只留左边那副（浅灰）
_dv = np.vstack([gpts('bracket', 'motor', 'pulley'), np.array([[105, -20, 22], [180, -20, 22]])])
det('det_drive', ['shaft', 'pulley', 'bracket', 'motor'], -140, -14, 1300, 900, fitv=_dv, margin=0.08, anchors={
        'shaft': [182, 0, 3], 'pulley60': [116.5, 0, 12], 'motor': [150, -75, -60], 'pulley20': [114.5, -53.8, -61],
        'belt': [120, -24, -30], 'bracket': [125.4, -76, -42], 'slot': [125.4, -69.2, -69.5]})
# 底座 + 转台 + 笼架
det('det_base', ['base', 'turntable', 'cage'], -128, 24, 1300, 900, anchors={
    'turntable': [-10, -30, -125], 'disk': [7, -30, -100], 'hdb_motor': [102, 3.5, -102],
    'cage_post': [-35.5, -48.9, -60], 'cage_floor': [7, 40, -96], 'cage_top': [49.5, 20, -25],
    'foot': list(bbox('base')[0] + np.array([18, 18, 5])), 'seat': [-25, -32, -147]})
# 转台单独：俯视 + 轴测，看托盘与电机方向
det('det_chassis', ['chassis', 'rail'], -90, 89.999, 1300, 760, pale=('rail',), anchors={
    'frame_r': [11, 89, -14], 'frame_l': [11, -89, -14], 'cross1': [49.5, 0, -18], 'cross2': [-35.5, 0, -18],
    'tie_r': [150, 93.3, -12], 'tooth': [-159, -150, -12]})
det('det_arm', ['armmount', 'arm', 'armmotor', 'tendon'], -90, 0, 1800, 520, margin=0.03, anchors={
    'mount': [-120, 109, -16], 'm_L': mctr('L'), 'm_D': mctr('D'), 'tip': [-575, 109, -46],
    'v0': [-209, 109, -28], 'v6': [-519, 109, -38]})
# 安装笼 + 三台电机 + 绕线盘 + 第一节：从右前上方看
def near_root(q):
    return q['g'] in ('armmount', 'armmotor') or (q['g'] in ('arm', 'tendon'))
_its = []
for q in pieces:
    if q['g'] not in ('armmount', 'arm', 'armmotor', 'tendon'): continue
    t = q['t']
    if q['g'] in ('arm', 'tendon'):
        t = t[q['v'][t].min(1)[:, 0] > -250]
    if len(t): _its.append((q['v'], t, q.get('fill', FILL[q['g']]), q['src'], q.get('ink')))
_v = np.vstack([it[0][np.unique(it[1])] for it in _its])
for nm, az, el in (('det_armbase2', -130, -18),):
    cam = fit_cam(_v, az, el, 1200, 900, margin=0.07)
    save(nm, _its, cam, {
        'm_L': mctr('L'), 'm_R': mctr('R'), 'm_D': mctr('D'),
        's_L': list(AM['L']['spool_c']), 's_R': list(AM['R']['spool_c']), 's_D': list(AM['D']['spool_c']),
        'eyelet': list(TP['A'][0]), 'v0': [-232.9, 109, -30], 'top_plate': [-120, 109, -16.5],
        'tA': list((TEND_FULL['A'][0] + TEND_FULL['A'][1]) / 2), 'tB': list((TEND_FULL['B'][0] + TEND_FULL['B'][1]) / 2),
        'tC': list((TEND_FULL['C'][0] + TEND_FULL['C'][1]) / 2)})
# 剖视：沿腱 A 所在的竖直面（块局部 y = 0.1 ⇔ 世界 y = 108.99）切开前两节，只留远侧一半
YCUT = 108.99
cut_its = []
for q in pieces:
    if q['g'] == 'arm':
        T = q['t']; c = q['v'][T].mean(1)
        m = (c[:, 1] > YCUT) & (c[:, 0] < -175) & (c[:, 0] > -320)
        if m.any(): cut_its.append((q['v'], T[m], FILL['arm'], q['src'], None))
for k in ('A',):
    seg = TEND_FULL[k]
    seg = seg[(seg[:, 0] < -170) & (seg[:, 0] > -330)]
    cut_its.append((*PX.tube(seg, r=0.8), PX.TENDON[k], 9000, PX.TENDON[k]))
_cv = np.vstack([it[0][np.unique(it[1])] for it in cut_its[:-1]])
cam = fit_cam(_cv, -90, 0, 1500, 560, margin=0.05)
seq = TSEQ
M = np.asarray(_PK['arm']['l2w'], float)
def L2W(x, r):     # 块局部（沿臂 x，离轴 r，腱 A 方位）→ 世界
    ay, az = _PK['arm']['axis']; return list(np.array([x, ay, az + r, 1.0]) @ M)
save('det_arm_cut', cut_its, cam, {
    'win0': L2W(TSEQ[1][0], TSEQ[1][1]), 'groove0': L2W(TSEQ[2][0], TSEQ[2][1] - 2.5), 'win1': L2W(TSEQ[3][0], TSEQ[3][1]),
    'gap': L2W((TSEQ[3][0] + TSEQ[4][0]) / 2, (TSEQ[3][1] + TSEQ[4][1]) / 2 + 1.5),
    'groove1': L2W(TSEQ[5][0], TSEQ[5][1] - 2.5), 'spine': L2W((TSEQ[3][0] + TSEQ[4][0]) / 2, 0), 'block': L2W(TSEQ[5][0], 4.0),
    'axis_l': L2W(-20, 0), 'axis_r': L2W(150, 0)})
_keep = [q for q in pieces if q['g'] == 'small' and q['v'][np.unique(q['t'])][:, 1].mean() > 0]
_sv = _keep[0]['v'][np.unique(_keep[0]['t'])]
cam = fit_cam(_sv, -60, 16, 900, 900, margin=0.06)
save('det_small', [(q['v'], q['t'], FILL['small'], q['src']) for q in _keep], cam, {})

# 给 build_doc 的肌腱走线数据（块局部：沿臂位置、离轴距离；正 = 本腱方位，负 = 对面）
meta['_arm'] = dict(seq=[[round(float(x), 2), round(float(r), 2)] for x, r in TSEQ],
                    plates=[[round(float(x), 2), round(float(r), 2)] for x, r in _PK['arm']['plates']],
                    grooves=[[round(float(x), 2), round(float(r), 2)] for x, r in _PK['arm']['grooves'] if x < 400])
json.dump(meta, open(OUT / 'figures.json', 'w'), ensure_ascii=False, indent=1)
