# -*- coding: utf-8 -*-
"""交接图册出图：815.3dm 分件网格 → 各张图 PNG + 标注锚点 JSON。

  python extract_815.py ../../模型求解器参考/815.3dm parts.pkl
  python make_figures.py parts.pkl <outDir>

**图里不画 815 模型中的曲柄轮与驱动杆**（除「旧方案」那张）：日志 2026-08-23 记录实物已改为
齿条驱动，曲柄—连杆方案作废；齿条在模型里没有，交接图册用示意图另画。
"""
import json, math, pickle, sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
from render import render, fit_cam, Cam, view_basis

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
    rail=(196, 220, 207), ring=(238, 233, 223), shaft=(199, 123, 91), pulley=(214, 92, 70),
    shaftblock=(214, 92, 70), motor=(160, 182, 214), crank=(240, 201, 135),
    armmount=(178, 200, 224), arm=(207, 224, 239), small=(235, 207, 217),
)
PALE = (243, 244, 245)
PALE_INK = (150, 156, 162)

def group_of(p):
    c = p['cat']; lo, hi = p['lo'], p['hi']; s = hi - lo
    if c == 'plate': return 'ring'
    if c in ('wheel', 'rod'): return 'crank'
    if c == 'axpart': return 'pulley' if s[0] > 9 and s[1] > 14 else 'shaftblock'
    if c == 'motor': return 'motor'
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
    if g == 'arm':
        cx = v[p['t']].mean(1)[:, 0]
        for gg, m in (('armmount', cx > ARM_SPLIT), ('arm', cx <= ARM_SPLIT)):
            t = p['t'][m]
            if len(t): pieces.append(dict(g=gg, v=v, t=t, ring=None, src=i))
    else:
        pieces.append(dict(g=g, v=v, t=p['t'], ring=p['ring'], src=i))

def gpts(*gs, ring=None):
    out = [q['v'][np.unique(q['t'])] for q in pieces if q['g'] in gs and (ring is None or q['ring'] == ring)]
    return np.vstack(out)

def bbox(*gs, ring=None):
    v = gpts(*gs, ring=ring); return v.min(0), v.max(0)

CURRENT = [g for g in FILL if g != 'crank']

def items_for(groups, hi=None, offs=None, pale_groups=(), ring=None):
    it = []
    for q in pieces:
        if q['g'] not in groups: continue
        if ring is not None and q['ring'] not in ring and q['g'] in ('ring', 'rail', 'crank'): continue
        v = q['v']
        if offs and q['g'] in offs: v = v + (np.array(q['off'], float) if 'off' in q else np.array(offs[q['g']], float))
        if q['g'] in pale_groups:
            it.append((v, q['t'], PALE, q['src'], PALE_INK))
        else:
            it.append((v, q['t'], FILL[q['g']], q['src']))
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
body_groups = [g for g in CURRENT if g not in ('arm', 'armmount')]
body_v = gpts(*body_groups)

# 共用锚点（3D）
def common_anchors():
    A = {}
    A['ring_S2'] = [-85, 0, 221]
    A['ring_S1'] = [-170, -110, 95]
    A['ring_S5'] = [170, 100, 80]
    A['rail'] = [96, -150, 2]
    A['rail_top'] = [181, 0, 105]
    A['shaft'] = [-120, 0, 0]
    A['pulley'] = list(ctr('pulley'))
    A['motor'] = list(ctr('motor'))
    A['chassis'] = [-170, -140, -12]
    A['cage'] = [-35.5, -48.9, -60]
    A['turntable'] = list(ctr('turntable'))
    A['base'] = [120, -150, -150]
    A['base_foot'] = [-169.8, -171.4, -148]
    A['small_R'] = [49.5, 116, -120]
    A['small_L'] = [-35.5, -126, -100]
    A['armmount'] = list(ctr('armmount'))
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
S3V = 1.55  # px/mm
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
ortho('view_front', 180, 0, 720, 720, top=40, extra={
    'zmax_pt': [0, 0, 226.2], 'zmin_pt': [0, 0, -156], 'ymin_pt': [0, -189.4, -156], 'ymax_pt': [0, 197.9, -156],
    'axis': [0, 0, 0], 'ring_left': [0, -173, 0], 'ring_right': [0, 173, 0]})
ortho('view_side', -90, 0, 1300, 760, top=54, extra={
    'body_l': [-187.8, 0, -156], 'body_r': [199.5, 0, -156],
    'xmin_pt': [-580.7, 0, -156], 'xmax_pt': [199.5, 0, -156], 'zmax_pt': [-74, 0, 226.2], 'zmin_pt': [-74, 0, -156],
    **{f'st{i+1}': [-170 + 85 * i, 0, 240] for i in range(5)}, 'axis_l': [-190, 0, 0], 'axis_r': [200, 0, 0]})
ortho('view_top', -90, 89.999, 1300, 740, top=56, extra={
    'body_l': [-187.8, 0, 0], 'body_r': [199.5, 0, 0],
    'xmin_pt': [-580.7, 0, 0], 'xmax_pt': [199.5, 0, 0], 'ymin_pt': [199.5, -189.4, 0], 'ymax_pt': [199.5, 197.9, 0],
    'front_arrow': [-600, 109, 0]})

# ---------- 爆炸图
OFFS = dict(base=(0, 0, -230), turntable=(0, 0, -165), cage=(0, 0, -95), chassis=(0, 0, 0),
            rail=(0, 0, 70), shaft=(0, 0, 70), pulley=(0, 0, 70), shaftblock=(0, 0, 70),
            motor=(0, -80, -50), ring=(0, 0, 200), small=(0, 0, -20), armmount=(-50, 0, 0), arm=(-120, 0, 0))
# 小触手按左右各自往外推，不和笼架叠在一起
for q in pieces:
    if q['g'] == 'small':
        side = 1 if q['v'][np.unique(q['t'])][:, 1].mean() > 0 else -1
        q['off'] = (0, 95 * side, -20)
def off_of(q):
    return np.array(q.get('off', OFFS.get(q['g'], (0, 0, 0))), float)
ex_v = np.vstack([q['v'][np.unique(q['t'])] + off_of(q) for q in pieces if q['g'] in CURRENT])
cam = fit_cam(ex_v, -128, 22, 1800, 1500, margin=0.04)
EA = {}
for g in CURRENT:
    EA[g] = list(ctr(g) + np.array(OFFS.get(g, (0, 0, 0))))
EA['ring'] = [-74, -95, 175 + 200]
EA['rail'] = [96, -150, 2 + 70]
EA['shaft'] = [60, 0, 70]
EA['small'] = [49.5, 116 + 95, -110 - 20]
EA['small2'] = [-35.5, -126 - 95, -110 - 20]
EA['chassis'] = [-150, -140, -10]
save('explode', items_for(CURRENT, offs=OFFS), cam, EA)

# ---------- 分步装配（累积，新件上色，旧件浅灰）
STEPS = [
    ('step1', ['base', 'turntable']),
    ('step2', ['cage']),
    ('step3', ['chassis']),
    ('step4', ['rail']),
    ('step5', ['shaft', 'pulley', 'shaftblock', 'motor']),
    ('step6', ['ring']),
    ('step7', ['small']),
    ('step8', ['armmount', 'arm']),
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
# 单环 S3 + 滑轨架，正视
def det(name, groups, az, el, W, H, ring=None, anchors=None, margin=0.06, pale=()):
    its = items_for(groups, ring=ring, pale_groups=pale)
    v = np.vstack([it[0][np.unique(it[1])] for it in its])
    cam = fit_cam(v, az, el, W, H, margin=margin)
    save(name, its, cam, anchors)

r3lo, r3hi = bbox('rail', ring=2)
det('det_ring', ['ring', 'rail', 'shaft'], 180, 0, 1300, 760, ring=[2], anchors={
    'apex': [-0, 0, 157.3], 'foot_out_l': [0, -161.9, 0], 'foot_in_l': [0, -147.6, 0],
    'foot_out_r': [0, 161.9, 0], 'foot_in_r': [0, 147.6, 0], 'slot': [0, 100, -2], 'guide': [0, 0, 120],
    'hub': [0, 0, 0], 'strut': [0, 40, 45], 'tab': [0, -120, -10], 'plate': [0, -120, 95],
})
det('det_ring_iso', ['ring', 'rail'], -120, 20, 1100, 760, ring=[2])
det('det_crank_old', ['ring', 'rail', 'crank', 'shaft'], -120, 18, 1100, 800, ring=[2], anchors={
    'wheel': [11, 0, -5], 'rod': [11, 12, 80], 'apex': [0, 0, 157.3]})
det('det_drive', ['rail', 'shaft', 'pulley', 'shaftblock', 'motor', 'chassis'], -55, 24, 1300, 820,
    pale=('rail', 'chassis'), anchors={
        'shaft': [40, 0, 0], 'pulley': list(ctr('pulley')), 'motor': list(ctr('motor')),
        'shaftblock': list(ctr('shaftblock')), 'railhub': [-74, 0, 0], 'slot_bracket': list(top_of('motor', frac=0.2))})
det('det_base', ['base', 'turntable', 'cage'], -128, 24, 1300, 900, anchors={
    'turntable': list(ctr('turntable')), 'cage_post': [-35.5, -48.9, -60], 'cage_floor': [7, 0, -98],
    'cage_top': [49.5, 20, -25], 'foot': list(bbox('base')[0] + np.array([18, 18, 5])), 'arm_bar': [100, 100, -148],
    'center_plate': [7, 1, -146]})
det('det_chassis', ['chassis', 'rail'], -90, 89.999, 1300, 760, pale=('rail',), anchors={
    'frame_r': [11, 89, -14], 'frame_l': [11, -89, -14], 'cross1': [49.5, 0, -18], 'cross2': [-35.5, 0, -18],
    'tie_r': [150, 93.3, -12], 'tooth': [-159, -150, -12]})
det('det_arm', ['armmount', 'arm'], -90, 0, 1800, 460, margin=0.03, anchors={
    'mount': list(ctr('armmount')), 'tip': [-575, 109, -52], 'v0': [-205, 109, -52], 'v6': [-555, 109, -52]})
# 大触手安装笼特写：只要 x > -245 的三角形（安装笼 + 第一节椎节）
_its = []
for q in pieces:
    if q['g'] not in ('armmount', 'arm'): continue
    cxq = q['v'][q['t']].min(1)[:, 0]
    t = q['t'][cxq > -245]
    if len(t): _its.append((q['v'], t, FILL[q['g']], q['src']))
_v = np.vstack([it[0][np.unique(it[1])] for it in _its])
cam = fit_cam(_v, -140, 22, 1200, 900, margin=0.07)
save('det_armbase', _its, cam, {
    'frame_l': [-122.5, 45.5, -53.8], 'frame_r': [-122.5, 172.5, -53.8], 'frame_b': [-74.7, 109, -80.4],
    'disc': [-185.4, 109, -48.3], 'v0': [-232.9, 109, -30], 'top_plate': [-120, 109, -16.5]})
_keep = [q for q in pieces if q['g'] == 'small' and q['v'][np.unique(q['t'])][:, 1].mean() > 0]
_sv = _keep[0]['v'][np.unique(_keep[0]['t'])]
cam = fit_cam(_sv, -60, 16, 900, 900, margin=0.06)
save('det_small', [(q['v'], q['t'], FILL['small'], q['src']) for q in _keep], cam, {})

json.dump(meta, open(OUT / 'figures.json', 'w'), ensure_ascii=False, indent=1)
