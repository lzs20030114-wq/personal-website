# -*- coding: utf-8 -*-
"""决定性瞬间的线稿 · 第二步：把 capture.mjs 取出来的一刻画成黑白线稿。

找线（轮廓 / 折痕 / 深度跳变）用交接图册的渲染器 scripts/handover/render.py 的 buffers()，这里只管黑白合成与标注。
画法（2026-11-23 作者「太漫画了，要学术一点、像竞赛图版、清新一些；高亮的形式可以；箭头不要」）：
  · 线都细：无关的东西灰色细线，重点只比它粗一档；
  · 人和猫画成比例人那样的剪影，不画脸和衣服：触发的 = 实心深色 + 脚下一圈细线，其余 = 白底灰线；
  · 被调动的单元 = 黑线 + 浅灰底；让路时只标收回的那几条带；
  · 本来要落、没落的单元（三道检查）= 虚线框；
  · 地面画出格线（一格 = 一台单元）。
画面上不写字：编号、说明、平面小图与落下 / 收回 / 路线这些记号由排版那一层放（scripts/moments/sheet.mjs，
11-25 作者要「图上的引导」后加，用这里写出去的投影数据画），作品集里可以另排。

用法：python scripts/moments/line.py <几何前缀（不带扩展名）> <out.png> '<json 选项>'
      python scripts/moments/line.py --plate <plate.json> <几何目录> <出图目录>   按图版里每格的 geo / opt 一次出完
选项：n 场地几格见方 · az / el 机位 · w / h 出图像素 · crop [x0,y0,x1,y1]（按整幅 0–1 裁）
      units [[行,列]…] 被调动的单元 · bands true = 只标各台收回的带 · ghosts [[行,列]…] 没落的单元
      hide ['people' | 'cats' | 'furn'…] 这一格不画的东西 · hide_units [[行,列]…] 不画的单元（讲单元自己的动作时用）
      trigger 'people' | 'cats' | 'both' | 'none' · gaze true = 人到猫画一条视线 · fit_n 按几格见方的场地定比例尺
"""
import json, math, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'handover'))
import render as R  # noqa: E402

# 单元的件：金属 · 深色件 · 外皮盖片 · 外皮接缝片 · 带子 · 带子暗面 · 键 · 键座
METAL, DARKP = (0.8, 0.82, 0.84), (0.3, 0.32, 0.34)
SKIN = np.array([[0.74, 0.69, 0.62], [0.67, 0.63, 0.56]])
BAND = np.array([[0.42, 0.76, 0.58], [0.62, 0.66, 0.63], [0.95, 0.5, 0.28], [0.2, 0.21, 0.23]])
UNIT_COLORS = np.vstack([[METAL, DARKP], SKIN, BAND])
INK = 24          # 重点的线
SOLID = 146       # 触发的人 / 猫的底（中灰，外加黑线）
LINE = 138        # 无关的东西的外轮廓
FIGLINE = 96      # 不相干的人 / 猫的轮廓
INNER = 198       # 分件线
CREASE = 226      # 折痕
TONE = 229        # 被调动的单元的底
GRID = 208        # 地面格线


def near(col, table, tol=0.02):
    return bool(np.abs(np.asarray(table) - col).max(axis=-1).min() < tol)


def to_zup(v):
    """台架的世界系（y 朝下）→ 渲染器的 z 朝上；y 取反号是为了与台架画面同一个朝向（不镜像）"""
    return np.c_[v[:, 0], -v[:, 2], -v[:, 1]]


def load(prefix):
    meta = json.load(open(prefix + '.json', encoding='utf-8'))
    v = to_zup(np.fromfile(prefix + '.bin', np.float32).reshape(-1, 3).astype(float))
    calls, o = [], 0
    for c in meta['calls']:
        k = c['n'] * 3
        if c['alpha'] >= 0.99 and k:
            calls.append(dict(v=v[o:o + k], T=np.array(c['T'], float), lite=np.array(c['lite'], float)))
        o += k
    return meta, calls


def classify(calls, n):
    """每次绘制是什么：room / ceil / furn / ('unit', 行, 列) / ('person' | 'cat', 序号)。
    单元的件 = 平移落在格心上、颜色是单元那几种之一；人和猫 = 其余带平移的，按平面距离归成一个个身体。"""
    # 格距 = 单元金属件的平移里相邻两列的间隔（偶数格时格心在 ±半个格距上，不能取离原点最近的那个）
    xs = sorted({round(float(t), 1) for c in calls if near(c['lite'], [METAL]) for t in (c['T'][0], c['T'][2])})
    gaps = [q - p for p, q in zip(xs, xs[1:]) if q - p > 1]
    pitch = min(gaps) if gaps else 105.0
    half = (n - 1) / 2

    def cell(T):
        col, row = T[0] / pitch + half, T[2] / pitch + half
        if abs(col - round(col)) < 0.02 and abs(row - round(row)) < 0.02 and 0 <= round(col) < n and 0 <= round(row) < n:
            return int(round(row)), int(round(col))
        return None

    figs = []  # [中心 xz, [件号…]]
    kinds = []
    for i, c in enumerate(calls):
        T = c['T']
        rc = cell(T)
        if np.abs(T).max() < 1e-6:
            lo, hi = c['v'].min(0), c['v'].max(0)
            kinds.append('room' if hi[0] - lo[0] > pitch * n * 0.9 and hi[2] - lo[2] > 200 else 'ceil' if hi[2] > -8 and hi[2] - lo[2] < 12 else 'furn')
        elif rc and near(c['lite'], UNIT_COLORS):
            kinds.append(('unit',) + rc)
        else:
            for f in figs:
                if math.hypot(T[0] - f[0][0], T[2] - f[0][1]) < pitch * 0.42:
                    f[1].append(i)
                    break
            else:
                figs.append([(T[0], T[2]), [i]])
            kinds.append(None)
    people, cats = [], []
    for f in figs:
        vv = np.vstack([calls[i]['v'] for i in f[1]])
        tall = vv[:, 2].max() - vv[:, 2].min()
        who = people if tall > pitch * 0.55 else cats
        who.append(dict(parts=f[1], lo=vv.min(0), hi=vv.max(0)))
        for i in f[1]:
            kinds[i] = ('person' if who is people else 'cat', len(who) - 1)
    return kinds, people, cats, pitch


def dilate(mask, px):
    k = int(round(px)) | 1
    if k <= 1:
        return mask
    return np.array(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(k))) > 0


def dashed(draw, p, q, w, fill, dash=22, gap=16):
    L = math.hypot(q[0] - p[0], q[1] - p[1])
    if L < 1:
        return
    ux, uy = (q[0] - p[0]) / L, (q[1] - p[1]) / L
    s = 0.0
    while s < L:
        e = min(L, s + dash)
        draw.line([(p[0] + ux * s, p[1] + uy * s), (p[0] + ux * e, p[1] + uy * e)], fill=fill, width=w)
        s = e + gap


def render(prefix, out, opt):
    n = opt.get('n', 3)
    W, H = opt.get('w', 1500), opt.get('h', 1900)
    SS = 2
    meta, calls = load(prefix)
    kinds, people, cats, pitch = classify(calls, n)
    allv = np.vstack([c['v'] for c in calls])      # 取景按全部东西定：藏掉几样以后画面不跟着挪
    hide = set(opt.get('hide', []))
    hide_units = {tuple(u) for u in opt.get('hide_units', [])}

    def hidden(k):
        if k == 'furn':
            return 'furn' in hide
        if isinstance(k, tuple):
            return (k[0] == 'person' and 'people' in hide) or (k[0] == 'cat' and 'cats' in hide) or (k[0] == 'unit' and k[1:] in hide_units)
        return False

    keep = [i for i, k in enumerate(kinds) if not hidden(k)]
    calls, kinds = [calls[i] for i in keep], [kinds[i] for i in keep]
    people = [] if 'people' in hide else people
    cats = [] if 'cats' in hide else cats
    half = (n - 1) / 2
    axis = lambda row, col: ((col - half) * pitch, -(row - half) * pitch)
    foc_units = {tuple(u) for u in opt.get('units', [])}
    ghosts = [tuple(u) for u in opt.get('ghosts', [])]
    trig = opt.get('trigger', 'both')
    is_fig = lambda k: isinstance(k, tuple) and k[0] in ('person', 'cat')
    is_trig = lambda k: is_fig(k) and ((k[0] == 'person' and trig in ('people', 'both')) or (k[0] == 'cat' and trig in ('cats', 'both')))
    is_unit = lambda k: isinstance(k, tuple) and k[0] == 'unit'
    np_ = len(calls)
    # 每台单元伸出去多远；让路时收回的带 = 逐条画的带里贴着立杆的那些
    reach, rad = {}, np.zeros(np_)
    for i, k in enumerate(kinds):
        if is_unit(k) and not near(calls[i]['lite'], [METAL, DARKP]):
            ux, uy = axis(k[1], k[2])
            rad[i] = np.hypot(calls[i]['v'][:, 0] - ux, calls[i]['v'][:, 1] - uy).max()
            reach[k[1:]] = max(reach.get(k[1:], 0.0), rad[i])
    if opt.get('bands'):
        foc_part = [is_unit(k) and rad[i] > 0 and rad[i] < 0.5 * reach[k[1:]] for i, k in enumerate(kinds)]
    else:
        foc_part = [is_unit(k) and k[1:] in foc_units for k in kinds]
    focus_u = np.array(foc_part + [False])
    focus_f = np.array([is_trig(k) for k in kinds] + [False])
    figure = np.array([is_fig(k) for k in kinds] + [False])
    roomish = np.array([k == 'room' for k in kinds] + [False])
    tone = np.array([foc_part[i] and near(calls[i]['lite'], np.vstack([SKIN, BAND[:2]])) for i in range(np_)] + [False])

    items = [(c['v'], np.arange(len(c['v'])).reshape(-1, 3), (255, 255, 255), i) for i, c in enumerate(calls)]
    fitv = allv
    if opt.get('fit_n'):  # 小场地按大场地的比例尺画（同一张图版里 2×2 与 3×3 的人一样大）
        hw = allv[:, 0].max() + (opt['fit_n'] - n) / 2 * pitch
        fitv = np.array([[sx * hw, sy * hw, z] for sx in (-1, 1) for sy in (-1, 1) for z in (allv[:, 2].min(), allv[:, 2].max())])
    cam = R.fit_cam(fitv, opt.get('az', -52), opt.get('el', 26), W, H, margin=0.035)
    B = R.buffers(items, cam, ss=SS, crease_deg=opt.get('crease', 40), depth_tol=opt.get('depth_tol', 4.0))
    part, edge, crease, sc = B['part'], B['edge'], B['crease'], B['sc']
    pix = np.where(part >= 0, part, np_)
    P = lambda p: tuple(sc.proj(np.array([p], float))[0][:2])
    floor = allv[:, 2].min() + 12.0  # 地板上表面（房间盒的底板厚 12）

    img = np.full((B['H'], B['W']), 255, np.float32)
    # 地面格线：一格 = 一台单元。只落在看得见地板的地方（被东西挡住的不画）
    grid = Image.new('L', (B['W'], B['H']), 255)
    gd = ImageDraw.Draw(grid)
    e = n / 2 * pitch
    for k in range(n + 1):
        t = (k - n / 2) * pitch
        gd.line([P((t, -e, floor)), P((t, e, floor))], fill=GRID, width=SS)
        gd.line([P((-e, t, floor)), P((e, t, floor))], fill=GRID, width=SS)
    g = np.asarray(grid, np.float32)
    m = roomish[pix] & (g < 255)
    img[m] = g[m]
    img[tone[pix]] = TONE
    img[figure[pix] & focus_f[pix]] = opt.get('solid', SOLID)
    # 线分两种：一个东西的外轮廓（两侧不是同一个东西）与它内部的分件线（同一台单元的带与带）
    gid = {}
    grp = np.array([gid.setdefault(k if isinstance(k, tuple) else (k, i), len(gid)) for i, k in enumerate(kinds)] + [-1])
    if opt.get('bands'):  # 只标带子时，收回的带与同一台其余的件算两个东西，轮廓才描得出来
        grp[:-1] = np.where(focus_u[:-1], grp[:-1] + len(gid) + 1, grp[:-1])
    G = grp[pix]
    outer = np.zeros_like(edge)
    for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
        outer |= R._nb(G, dy, dx, -2) != G
    fu_px = dilate(focus_u[pix], 5)
    ff_px = dilate(focus_f[pix], 5)
    fig_px = dilate(figure[pix], 5) & ~ff_px
    ctx = ~fu_px & ~ff_px & ~fig_px

    def ink(mask, v, w):
        mm = dilate(mask, w)
        img[mm] = np.minimum(img[mm], v)

    w1, w2, w3 = 1, opt.get('lw', 1.5) * SS, opt.get('lw_focus', 2.4) * SS
    ink(crease & ctx & ~edge, CREASE, w1)
    ink(edge & ~outer & ctx, INNER, w1)
    ink(edge & outer & ctx, LINE, w2)
    ink(edge & outer & fig_px, FIGLINE, w2)
    if opt.get('fig_inner', True):                   # 人和猫的分件线只留很淡的一层，看得出姿态、不画出脸
        ink(edge & ~outer & fig_px & figure[pix], INNER, w1)
        ink(edge & ~outer & ff_px & focus_f[pix], opt.get('solid_inner', 74), w1)
    ink(crease & fu_px & ~edge & ~ff_px, 176, w1)
    ink(edge & ~outer & fu_px & ~ff_px, 112, w1)
    ink(edge & outer & fu_px, INK, w3)
    ink(edge & outer & ff_px, INK, w2)
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert('L')
    d = ImageDraw.Draw(im)
    thin = max(2, int(round(w2)))

    def ring(cx, cy, r, z):
        pts = [P((cx + r * math.cos(a), cy + r * math.sin(a), z)) for a in np.linspace(0, 2 * math.pi, 121)]
        d.line(pts, fill=INK, width=thin, joint='curve')

    anchors = {'people': [], 'cats': []}
    for who, key in ((people, 'people'), (cats, 'cats')):
        for f in who:
            c = (f['lo'] + f['hi']) / 2
            r = max(f['hi'][0] - f['lo'][0], f['hi'][1] - f['lo'][1]) * 0.5 + pitch * 0.09
            on = (key == 'people' and trig in ('people', 'both')) or (key == 'cats' and trig in ('cats', 'both'))
            anchors[key].append(dict(c=[float(c[0]), float(c[1])], trigger=on))
            if on:
                ring(c[0], c[1], r, max(floor, f['lo'][2] + 1))
    if opt.get('gaze') and people and cats:
        p, c = people[0], cats[0]
        eye = ((p['lo'][0] + p['hi'][0]) / 2, (p['lo'][1] + p['hi'][1]) / 2, p['hi'][2] - pitch * 0.12)
        tgt = ((c['lo'][0] + c['hi'][0]) / 2, (c['lo'][1] + c['hi'][1]) / 2, c['hi'][2] - pitch * 0.05)
        dashed(d, P(eye), P(tgt), thin, INK, dash=9 * SS, gap=7 * SS)
    for (row, col) in ghosts:
        ux, uy = axis(row, col)
        r = pitch * 0.43 * math.sqrt(2)
        z = floor + opt.get('ghost_h', 1.05) * pitch / 0.83
        for k in range(4):
            a0, a1 = math.pi / 4 + k * math.pi / 2, math.pi / 4 + (k + 1) * math.pi / 2
            dashed(d, P((ux + r * math.cos(a0), uy + r * math.sin(a0), z)), P((ux + r * math.cos(a1), uy + r * math.sin(a1), z)), thin, INK, dash=9 * SS, gap=7 * SS)
    im = im.resize((W, H), Image.LANCZOS)
    crop = opt.get('crop')
    if crop:
        im = im.crop((int(crop[0] * W), int(crop[1] * H), int(crop[2] * W), int(crop[3] * H)))
    im.save(out)
    # 平面小图要用的东西（排版那一层画）：格数、格距、家具的外框、落着的单元、被调动的单元、人和猫在哪
    span = allv[:, 2].max() - floor
    down = sorted({k[1:] for i, k in enumerate(kinds) if is_unit(k) and rad[i] > 0 and calls[i]['v'][:, 2].min() < floor + 0.55 * span})
    furn = [[float(c['v'][:, 0].min()), float(c['v'][:, 1].min()), float(c['v'][:, 0].max()), float(c['v'][:, 1].max())] for c, k in zip(calls, kinds) if k == 'furn']
    marked = sorted({k[1:] for i, k in enumerate(kinds) if foc_part[i]})
    # 图上的记号由排版那一层画（sheet.mjs）：这里把投影（正轴测，是仿射的）与人、猫、每台单元的包围盒写出去
    ox, oy = (int(crop[0] * W), int(crop[1] * H)) if crop else (0, 0)
    camd = dict(r=[float(x) for x in cam.r], u=[float(x) for x in cam.u], c=[float(x) for x in cam.c], s=float(cam.s),
                W=W, H=H, ox=ox, oy=oy, floor=float(floor), m=float(pitch / 0.83))
    box = lambda f: dict(lo=[float(x) for x in f['lo']], hi=[float(x) for x in f['hi']])
    ub = {}
    for i, k in enumerate(kinds):
        if is_unit(k) and rad[i] > 0:
            ub.setdefault(k[1:], []).append(calls[i]['v'])
    unitd = {}
    for rc, vs in ub.items():
        vv = np.vstack(vs)
        ux, uy = axis(*rc)
        rr = np.hypot(vv[:, 0] - ux, vv[:, 1] - uy)
        wide = vv[rr > 0.85 * rr.max()]
        unitd['%d,%d' % rc] = dict(lo=[float(x) for x in vv.min(0)], hi=[float(x) for x in vv.max(0)], reach=float(rr.max()),
                                   plat=float(wide[:, 2].max()))
    json.dump(
        dict(size=[W, H], crop=crop, hud=meta.get('hud'), n=n, pitch=pitch, room=float(max(allv[:, 0].max(), allv[:, 1].max())),
             down=down, marked=marked, ghosts=ghosts, furn=furn, bands=bool(opt.get('bands')), anchors=anchors,
             gaze=bool(opt.get('gaze') and people and cats), cam=camd, people=[box(f) for f in people], cats=[box(f) for f in cats], units=unitd),
        open(str(Path(out).with_suffix('.json')), 'w'), ensure_ascii=False)
    print(out, f'{len(calls)} 件 · 人 {len(people)} 猫 {len(cats)} · 格距 {pitch:.1f} · 落着 {len(down)} 台')


def _one(job):
    render(*job)


def main():
    if sys.argv[1] == '--plate':
        from multiprocessing import Pool
        plate, geo, outdir = json.load(open(sys.argv[2], encoding='utf-8')), Path(sys.argv[3]), Path(sys.argv[4])
        outdir.mkdir(parents=True, exist_ok=True)
        jobs = [(str(geo / pn['geo']), str(outdir / pn['img']), pn.get('opt', {})) for s in plate['sections'] for r in s['rows'] for pn in r['panels']]
        with Pool(4) as pool:
            pool.map(_one, jobs)
    else:
        render(sys.argv[1], sys.argv[2], json.loads(sys.argv[3]) if len(sys.argv) > 3 else {})


if __name__ == '__main__':
    main()
