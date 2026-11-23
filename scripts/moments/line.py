# -*- coding: utf-8 -*-
"""决定性瞬间的线稿 · 第二步：把 capture.mjs 取出来的一刻画成黑白线稿。

找线（轮廓 / 折痕 / 深度跳变）用交接图册的渲染器 scripts/handover/render.py 的 buffers()，这里只管黑白合成与标注：
  · 无关的东西：白底、灰色细线；
  · 触发的人 / 猫：黑色粗线，脚下一圈；
  · 被调动的单元：黑色粗线 + 浅灰底，旁边一个向下的箭头；
  · 本来要落、没落的单元（三道检查）：虚线框。
画面上不写字：编号与说明由排版那一层放（scripts/moments/sheet.mjs），作品集里可以另排。

用法：python scripts/moments/line.py <几何前缀（不带扩展名）> <out.png> '<json 选项>'
选项：n 场地几格见方 · az / el 机位 · w / h 出图像素 · crop [x0,y0,x1,y1]（按整幅 0–1 裁）
      units [[行,列]…] 被调动的单元 · ghosts [[行,列]…] 没落的单元 · trigger 'people' | 'cats' | 'both' | 'none'
      gaze true = 人到猫画一条视线 · arrows [[行,列]…] 画落下箭头的单元（省略 = units）
"""
import json, math, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'handover'))
import render as R  # noqa: E402

UNIT_COLORS = np.array([[0.8, 0.82, 0.84], [0.3, 0.32, 0.34], [0.74, 0.69, 0.62], [0.67, 0.63, 0.56]])
INK, GREY, PALE, TONE = 20, 150, 205, 226


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
    """每次绘制是什么：room / ceil / furn / ('unit', 行, 列) / ('fig', 序号)。
    单元的件 = 平移落在格心上、颜色是单元那四种之一；人和猫 = 其余带平移的，按平面距离归成一个个身体。"""
    xs = sorted({round(c['T'][0], 1) for c in calls if np.abs(c['lite'] - UNIT_COLORS[0]).max() < 0.02 and abs(c['T'][0]) > 1})
    pitch = min(abs(x) for x in xs) if xs else 105.0
    half = (n - 1) / 2

    def cell(T):
        col, row = T[0] / pitch + half, T[2] / pitch + half
        if abs(col - round(col)) < 0.02 and abs(row - round(row)) < 0.02 and 0 <= round(col) < n and 0 <= round(row) < n:
            return int(round(row)), int(round(col))
        return None

    figs = []  # [中心 xz, [件号…]]
    kinds = []
    for i, c in enumerate(calls):
        T, unitish = c['T'], np.abs(UNIT_COLORS - c['lite']).max(axis=1).min() < 0.02
        rc = cell(T)
        if np.abs(T).max() < 1e-6:
            lo, hi = c['v'].min(0), c['v'].max(0)
            kinds.append('room' if hi[0] - lo[0] > pitch * n * 0.9 and hi[2] - lo[2] > 200 else 'ceil' if hi[2] > -8 and hi[2] - lo[2] < 12 else 'furn')
        elif rc and unitish:
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
    if px <= 1:
        return mask
    k = int(px) | 1
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


def main():
    prefix, out, opt = sys.argv[1], sys.argv[2], json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
    n = opt.get('n', 3)
    W, H = opt.get('w', 1500), opt.get('h', 1900)
    SS = 2
    meta, calls = load(prefix)
    kinds, people, cats, pitch = classify(calls, n)
    foc_units = {tuple(u) for u in opt.get('units', [])}
    ghosts = [tuple(u) for u in opt.get('ghosts', [])]
    trig = opt.get('trigger', 'both')
    is_trig = lambda k: isinstance(k, tuple) and ((k[0] == 'person' and trig in ('people', 'both')) or (k[0] == 'cat' and trig in ('cats', 'both')))
    is_unit = lambda k: isinstance(k, tuple) and k[0] == 'unit' and k[1:] in foc_units
    # 没落的单元（ghosts）先不画进线稿：它们收在天花板下，另画一个虚线框标出本来要落到的位置
    items = [(c['v'], np.arange(len(c['v'])).reshape(-1, 3), (255, 255, 255), i) for i, c in enumerate(calls)]
    allv = np.vstack([c['v'] for c in calls])
    cam = R.fit_cam(allv, opt.get('az', -52), opt.get('el', 26), W, H, margin=0.035)
    B = R.buffers(items, cam, ss=SS, crease_deg=opt.get('crease', 40), depth_tol=opt.get('depth_tol', 4.0))
    part, hit, edge, crease, sc = B['part'], B['hit'], B['edge'], B['crease'], B['sc']
    np_ = len(calls)
    lum = np.array([c['lite'] @ np.array([0.3, 0.59, 0.11]) for c in calls])
    focus = np.array([is_trig(k) or is_unit(k) for k in kinds] + [False])
    figure = np.array([isinstance(k, tuple) and k[0] in ('person', 'cat') for k in kinds] + [False])
    tone = np.array([is_unit(k) and np.abs(calls[i]['lite'] - UNIT_COLORS[2:]).max(axis=1).min() < 0.02 for i, k in enumerate(kinds)] + [False])
    dark = np.array([figure[i] and lum[i] < 0.24 for i in range(np_)] + [False])
    pix = np.where(part >= 0, part, np_)
    img = np.full((B['H'], B['W']), 255, np.float32)
    img[tone[pix]] = TONE
    img[dark[pix] & focus[pix]] = 40
    img[dark[pix] & ~focus[pix]] = 170
    # 线分两种：一个东西的外轮廓（两侧不是同一个东西）与它内部的分件线（同一台单元的带与带、同一个人的衣服与手）。
    # 一条线属于谁 = 它两侧有没有重点件（把重点件的范围胀一圈再与线相交）
    gid = {}
    grp = np.array([gid.setdefault(k if isinstance(k, tuple) else (k, i), len(gid)) for i, k in enumerate(kinds)] + [-1])
    G = grp[pix]
    outer = np.zeros_like(edge)
    for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
        outer |= R._nb(G, dy, dx, -2) != G
    f_px = dilate(focus[pix], 5)
    fig_px = dilate(figure[pix], 5) & ~f_px
    ctx = ~f_px & ~fig_px
    wc, wf = opt.get('lw', 2.0) * SS, opt.get('lw_focus', 4.6) * SS
    def ink(mask, v, w):
        m = dilate(mask, w)
        img[m] = np.minimum(img[m], v)
    ink(crease & ctx & ~edge, 222, 1)
    ink(edge & ~outer & ctx, PALE, wc * 0.6)
    ink(edge & outer & ctx, GREY, wc)
    ink(edge & ~outer & fig_px, 135, wc * 0.6)
    ink(edge & outer & fig_px, 85, wc)
    ink(crease & f_px & ~edge, 150, 1)
    ink(edge & ~outer & f_px, 70, wc * 0.7)
    ink(edge & outer & f_px, INK, wf)
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert('L')
    d = ImageDraw.Draw(im)
    P = lambda p: tuple(sc.proj(np.array([p], float))[0][:2])
    floor = allv[:, 2].min() + 12.0  # 地板上表面（房间盒的底板厚 12）
    lw = int(round(wf))

    def ring(cx, cy, r, z=floor, dash=False, width=lw):
        pts = [P((cx + r * math.cos(a), cy + r * math.sin(a), z)) for a in np.linspace(0, 2 * math.pi, 97)]
        if dash:
            for a, b in zip(pts[0:-1:4], pts[2::4]):
                d.line([a, b], fill=INK, width=width)
        else:
            d.line(pts, fill=INK, width=width, joint='curve')

    anchors = {'people': [], 'cats': [], 'units': {}}
    for who, key in ((people, 'people'), (cats, 'cats')):
        for f in who:
            c = (f['lo'] + f['hi']) / 2
            r = max(f['hi'][0] - f['lo'][0], f['hi'][1] - f['lo'][1]) * 0.5 + pitch * 0.10
            anchors[key].append(dict(c=c.tolist(), top=f['hi'][2], px=P((c[0], c[1], f['hi'][2]))))
            if (key == 'people' and trig in ('people', 'both')) or (key == 'cats' and trig in ('cats', 'both')):
                ring(c[0], c[1], r, z=max(floor, f['lo'][2] + 1))
    if opt.get('gaze') and people and cats:
        p, c = people[0], cats[0]
        eye = ((p['lo'][0] + p['hi'][0]) / 2, (p['lo'][1] + p['hi'][1]) / 2, p['hi'][2] - pitch * 0.12)
        tgt = ((c['lo'][0] + c['hi'][0]) / 2, (c['lo'][1] + c['hi'][1]) / 2, c['hi'][2] - pitch * 0.05)
        dashed(d, P(eye), P(tgt), max(2, lw // 2), INK, dash=18 * SS, gap=12 * SS)
    half = (n - 1) / 2
    ceil_z = allv[:, 2].max()
    for (row, col) in opt.get('arrows', list(foc_units)):
        ux, uy = (col - half) * pitch, -(row - half) * pitch
        vv = [c['v'] for i, c in enumerate(calls) if kinds[i] == ('unit', row, col) and np.abs(calls[i]['lite'] - UNIT_COLORS[2:]).max(axis=1).min() < 0.02]
        if not vv:
            continue
        vv = np.vstack(vv)
        top = vv[:, 2].max()
        # 箭头贴着吊杆左边（画面上偏开一点）：从天花板下到此刻单元的上缘
        dxp = -opt.get('arrow_dx', 46) * SS
        a, b = P((ux, uy, ceil_z - pitch * 0.32)), P((ux, uy, top + pitch * 0.02))
        a, b = (a[0] + dxp, a[1]), (b[0] + dxp, b[1])
        dashed(d, a, (b[0], b[1] - 20 * SS), lw + 2, INK, dash=12 * SS, gap=12 * SS)
        s = 24 * SS
        d.line([(b[0] - s, b[1] - s * 1.4), b, (b[0] + s, b[1] - s * 1.4)], fill=INK, width=lw + 2, joint="curve")
        anchors['units'][f'{row},{col}'] = dict(px=P((ux, uy, top)))
    for (row, col) in ghosts:
        ux, uy = (col - half) * pitch, -(row - half) * pitch
        r = pitch * 0.43
        z = floor + opt.get('ghost_h', 1.05) * pitch / 0.83
        for k in range(4):
            a0, a1 = math.pi / 4 + k * math.pi / 2, math.pi / 4 + (k + 1) * math.pi / 2
            p0, p1 = (ux + r * math.sqrt(2) * math.cos(a0), uy + r * math.sqrt(2) * math.sin(a0), z), (ux + r * math.sqrt(2) * math.cos(a1), uy + r * math.sqrt(2) * math.sin(a1), z)
            dashed(d, P(p0), P(p1), max(2, lw // 2), INK, dash=14 * SS, gap=10 * SS)
        anchors['units'][f'{row},{col}'] = dict(px=P((ux, uy, z)))
    im = im.resize((W, H), Image.LANCZOS)
    crop = opt.get('crop')
    if crop:
        im = im.crop((int(crop[0] * W), int(crop[1] * H), int(crop[2] * W), int(crop[3] * H)))
    im.save(out)
    # 标注要用的画面坐标（出图像素，裁切前）：排版那一层按它放编号
    for grp in (anchors['people'], anchors['cats']):
        for a in grp:
            a['px'] = [a['px'][0] / SS, a['px'][1] / SS]
    for a in anchors['units'].values():
        a['px'] = [a['px'][0] / SS, a['px'][1] / SS]
    json.dump(dict(size=[W, H], crop=crop, hud=meta.get('hud'), anchors=anchors, people=len(people), cats=len(cats)), open(str(Path(out).with_suffix('.json')), 'w'), ensure_ascii=False)
    print(out, f'{len(calls)} 件 · 人 {len(people)} 猫 {len(cats)} · 格距 {pitch:.1f}')


if __name__ == '__main__':
    main()
