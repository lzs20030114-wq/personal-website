# -*- coding: utf-8 -*-
"""交接图册拼装：模板 + 渲染图 + 由数据生成的矢量图 → index.html（可发布、可打印成 PDF）。

  python build_doc.py handover.src.html <figDir> <outDir>

figDir 里要有 make_figures.py 的 PNG 与 figures.json，以及 ring-phases.json（ring-phases.mjs 产出）
和 ring-topo.json（环的三角板拓扑）。

模板里的占位：
  <!--FIG name-->      渲染图 + 编号气泡 + 图例（气泡位置按图像轮廓自动外推）
  <!--RINGS-->         五环全开 / 折叠对照（矢量，数据来自站上同一份环解算）
  <!--RACK-->          齿条推拉内侧脚示意（S3）
  <!--GEARTABLE-->     齿数 → 齿条行程
  <!--RINGTABLE-->     五环参数表
"""
import html, json, math, re, sys
from pathlib import Path
import numpy as np
from PIL import Image

SRC, FIG, OUT = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
(OUT / 'fig').mkdir(parents=True, exist_ok=True)
META = json.load(open(FIG / 'figures.json', encoding='utf-8'))
PH = json.load(open(FIG / 'ring-phases.json', encoding='utf-8'))
TOPO = json.load(open(FIG / 'ring-topo.json', encoding='utf-8'))
RINGS = ['S1_M3x1.057', 'S2_M1x1.184', 'S3_M5x1.584', 'S4_M3x1.000', 'S5_M3x0.870']
SHORT = ['S1', 'S2', 'S3', 'S4', 'S5']
TEETH = [32, 33, 32, 29, 25]      # 案例页技术参数（作者原文）：钢齿轮 m=1
SWING = 336.0                      # 中轴摆角约 336°（同上）

E = html.escape

# ---------------------------------------------------------------- 编号气泡
# 每张图：[(锚点名或 [x, y] 像素, 说明), ...]；编号按列表顺序 1..n
CALLOUTS = {
    'cover': [
        ('ring_S2', '呼吸环 S1–S5'),
        ('rail_top', '滑轨架 ×5'),
        ('shaft', '中间轴 ⌀6 D 形钢轴'),
        ('pulley', '中间轴上的 60T 带轮'),
        ('motor', '主电机 NEMA17'),
        ('bracket', '主电机支架'),
        ('chassis', '机身底盘（左右两副梯形支架）'),
        ('cage', '笼架（含顶部两根横梁）'),
        ('turntable', '偏航转台 HDB60XZ45B'),
        ('hdb_motor', '转台自带的 42 步进电机'),
        ('base_foot', 'X 形底座'),
        ('small_L', '小触手 ×2（SG90）'),
        ('m_R', '肌腱电机（右）'),
        ('m_D', '肌腱电机（下）'),
        ('armmount', '大触手安装笼'),
        ('arm', '大触手'),
    ],
    'explode': [
        ('ring', '五个呼吸环'),
        ('rail', '滑轨架 ×5'),
        ('shaft', '中间轴'),
        ('pulley', '60T 带轮'),
        ('chassis', '机身底盘（左右梯形支架）'),
        ('bracket', '主电机支架'),
        ('motor', '主电机 + 20T 带轮 + 皮带'),
        ('armmount', '大触手安装笼'),
        ('armmotor', '肌腱电机 ×3 + 绕线盘'),
        ('arm', '大触手'),
        ('small', '小触手（右）'),
        ('small2', '小触手（左）'),
        ('cage', '笼架（含顶部两根横梁）'),
        ('turntable', '偏航转台'),
        ('hdb_motor', '转台电机'),
        ('base', 'X 形底座'),
    ],
    'det_ring': [
        ('plate', '角化件'),
        ('apex', '拱顶销'),
        ('guide', '竖直导槽'),
        ('strut', '斜撑'),
        ('foot_out_r', '外侧脚'),
        ('foot_in_r', '内侧脚（接齿条）'),
        ('slot', '水平脚槽'),
        ('hub', '中轴孔'),
        ('tab', '安装耳'),
    ],
    'det_drive': [
        ('shaft', '中间轴'),
        ('pulley60', '60T 带轮'),
        ('belt', '皮带'),
        ('pulley20', '20T 带轮'),
        ('motor', '主电机'),
        ('slot', '腰形槽 ×4（调皮带松紧）'),
        ('bracket', '电机支架'),
    ],
    'det_base': [
        ('turntable', '转台箱体'),
        ('disk', '输出盘 ⌀60（5-M6）'),
        ('hdb_motor', '转台电机'),
        ('seat', '底座中心座（托盘）'),
        ('cage_floor', '笼架底板'),
        ('cage_post', '笼架立柱 ×4'),
        ('cage_top', '顶托架'),
        ('beam', '顶部横梁 ×2'),
        ('foot', '圆脚 ×4'),
    ],
    'det_arm': [
        ('mount', '安装笼'),
        ('m_L', '肌腱电机（左）'),
        ('m_D', '肌腱电机（下）'),
        ('v0', '第 1 节（最粗）'),
        ('v6', '第 6 节'),
        ('tip', '梢端节（绑线柱）'),
    ],
    'det_armbase2': [
        ('m_L', '肌腱电机（左）'),
        ('m_R', '肌腱电机（右）'),
        ('m_D', '肌腱电机（下）'),
        ('s_L', '绕线盘'),
        ('eyelet', '根部腱孔 ×3'),
        ('tC', '肌腱'),
        ('v0', '第 1 节'),
        ('top_plate', '安装笼顶板'),
    ],
    'det_arm_cut': [
        ('win0', '端板窗口'),
        ('groove0', '导块对面的槽口'),
        ('block', '中央导块'),
        ('gap', '节间沿本侧直走'),
        ('spine', '节间柔性脊柱杆'),
    ],
    'det_small': [
        ([300, 150], '安装板'),
        ([460, 330], 'SG90 舵机'),
        ([648, 250], '圆盘转轴'),
        ([712, 420], '大节'),
        ([616, 480], '软杆'),
        ([610, 770], '小块'),
    ],
}
EXTRA_ANCHOR = {}
DIMV = META.get('_dims', {})

# 尺寸线：(锚点1, 锚点2, 'h'|'v', 尺寸线所在的 y（h）或 x（v）, 文字)
DIMS = {
    'view_front': [('ymax_pt', 'ymin_pt', 'h', 672, f"{DIMV.get('W', 405)}"),
                   ('zmax_pt', 'zmin_pt', 'v', 738, f"{DIMV.get('H', 382)}"),
                   ('axis', 'zmin_pt', 'v', 22, '156 轴线高')],
    'view_side': [('body_l', 'body_r', 'h', 686, '387 机身'),
                  ('xmin_pt', 'xmax_pt', 'h', 734, f"{DIMV.get('L', 780)} 含大触手"),
                  ('zmax_pt', 'zmin_pt', 'v', 1284, f"{DIMV.get('H', 382)}"),
                  ('st1', 'st2', 'h', 28, '85'), ('st2', 'st3', 'h', 28, '85'),
                  ('st3', 'st4', 'h', 28, '85'), ('st4', 'st5', 'h', 28, '85')],
    'view_top': [('xmin_pt', 'xmax_pt', 'h', 746, f"{DIMV.get('L', 780)}"),
                 ('body_l', 'body_r', 'h', 30, '387'),
                 ('ymax_pt', 'ymin_pt', 'v', 1284, f"{DIMV.get('W', 405)}")],
}


def dims_svg(name, m):
    out = []
    fs = max(16, m['W'] / 58)
    for a, b, o, at, t in DIMS.get(name, []):
        p, q = m['anchors'][a], m['anchors'][b]
        if o == 'h':
            x1, x2 = sorted((p[0], q[0]))
            out.append(f'<line class="ext" x1="{p[0]:.1f}" y1="{p[1]:.1f}" x2="{p[0]:.1f}" y2="{at:.1f}"/>'
                       f'<line class="ext" x1="{q[0]:.1f}" y1="{q[1]:.1f}" x2="{q[0]:.1f}" y2="{at:.1f}"/>'
                       f'<line class="dim" x1="{x1:.1f}" y1="{at:.1f}" x2="{x2:.1f}" y2="{at:.1f}" marker-start="url(#dA)" marker-end="url(#dA)"/>'
                       f'<text class="dimt" x="{(x1 + x2) / 2:.1f}" y="{at - 6:.1f}" text-anchor="middle" font-size="{fs:.0f}">{E(t)}</text>')
        else:
            y1, y2 = sorted((p[1], q[1]))
            out.append(f'<line class="ext" x1="{p[0]:.1f}" y1="{p[1]:.1f}" x2="{at:.1f}" y2="{p[1]:.1f}"/>'
                       f'<line class="ext" x1="{q[0]:.1f}" y1="{q[1]:.1f}" x2="{at:.1f}" y2="{q[1]:.1f}"/>'
                       f'<line class="dim" x1="{at:.1f}" y1="{y1:.1f}" x2="{at:.1f}" y2="{y2:.1f}" marker-start="url(#dA)" marker-end="url(#dA)"/>'
                       f'<text class="dimt" x="{at - 6:.1f}" y="{(y1 + y2) / 2:.1f}" text-anchor="middle" font-size="{fs:.0f}" '
                       f'transform="rotate(-90 {at - 6:.1f} {(y1 + y2) / 2:.1f})">{E(t)}</text>')
    return ''.join(out)


def project(fig, p3):
    """用 figures.json 里没有的 3D 点时，按同一相机重算——这里只支持已存锚点。"""
    raise KeyError(p3)


def balloon_layout(img_path, anchors, R):
    """就近找空白：围绕锚点按半径由小到大试，同一半径先试背离图形中心的方向。
    条件：气泡周围 R+8 内没有图形像素、不压其它气泡、不出画。"""
    im = np.asarray(Image.open(img_path).convert('L'), np.float32)
    H, W = im.shape
    obj = im < 246
    ys, xs = np.nonzero(obj)
    c = np.array([xs.mean(), ys.mean()]) if len(xs) else np.array([W / 2, H / 2])
    placed = []

    def free(p, rad):
        x0, x1 = int(max(0, p[0] - rad)), int(min(W, p[0] + rad + 1))
        y0, y1 = int(max(0, p[1] - rad)), int(min(H, p[1] + rad + 1))
        if x1 <= x0 or y1 <= y0:
            return False
        return not obj[y0:y1:2, x0:x1:2].any()

    for a in anchors:
        a = np.array(a, float)
        d0 = a - c
        base = math.atan2(d0[1], d0[0]) if np.linalg.norm(d0) > 1e-6 else -math.pi / 2
        angs = sorted((base + math.radians(k * 15) for k in range(24)),
                      key=lambda t: abs(math.atan2(math.sin(t - base), math.cos(t - base))))
        best = None
        r = R * 2.4
        while best is None and r < max(W, H) * 0.6:
            for t in angs:
                p = a + r * np.array([math.cos(t), math.sin(t)])
                if not (R + 4 <= p[0] <= W - R - 4 and R + 4 <= p[1] <= H - R - 4):
                    continue
                if not free(p, R + 8):
                    continue
                if any(np.linalg.norm(p - q) < 2 * R + 8 for q in placed):
                    continue
                best = p
                break
            r += R * 0.6
        if best is None:
            best = np.clip(a + np.array([R * 3, -R * 3]), R + 4, [W - R - 4, H - R - 4])
        placed.append(best)
    return placed


def fig_html(name, caption, num, alt=None, cls=''):
    m = META[name]
    W, H = m['W'], m['H']
    src = FIG / f'{name}.png'
    Image.open(src).save(OUT / 'fig' / f'{name}.webp', lossless=True, quality=100, method=6)
    co = CALLOUTS.get(name, [])
    svg = ''
    legend = ''
    if name in DIMS:
        svg = (f'<svg class="ann" viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true">'
               '<defs><marker id="dA" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">'
               '<path d="M0,2 L10,5 L0,8 z" class="ahd"/></marker></defs>' + dims_svg(name, m) + '</svg>')
    if co:
        R = max(13, W / 70)
        extra = EXTRA_ANCHOR.get(name, {})
        pts = []
        for key, _ in co:
            if isinstance(key, list):
                pts.append(key)
            elif key in m['anchors']:
                pts.append(m['anchors'][key])
            elif key in extra:
                pts.append(proj_extra(name, extra[key]))
            else:
                raise KeyError(f'{name}: 缺锚点 {key}')
        lab = balloon_layout(src, pts, R)
        parts = []
        for i, (p, q) in enumerate(zip(pts, lab), 1):
            p, q = np.array(p), np.array(q)
            d = p - q
            L = np.linalg.norm(d)
            e = q + d / L * R if L > R else q
            parts.append(
                f'<line x1="{e[0]:.1f}" y1="{e[1]:.1f}" x2="{p[0]:.1f}" y2="{p[1]:.1f}" class="ld"/>'
                f'<circle cx="{p[0]:.1f}" cy="{p[1]:.1f}" r="{R * 0.22:.1f}" class="ldot"/>'
                f'<circle cx="{q[0]:.1f}" cy="{q[1]:.1f}" r="{R:.1f}" class="bal"/>'
                f'<text x="{q[0]:.1f}" y="{q[1]:.1f}" class="baln" font-size="{R * 1.05:.1f}">{i}</text>')
        svg = (f'<svg class="ann" viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true">'
               + ''.join(parts) + '</svg>')
        legend = '<ol class="legend">' + ''.join(
            f'<li><span class="lno">{i}</span><span>{E(t)}</span></li>' for i, (_, t) in enumerate(co, 1)) + '</ol>'
    return (f'<figure class="dwg {cls}" id="fig-{name}">'
            f'<div class="frame" style="aspect-ratio:{W}/{H};--ar:{W / H:.4f}">'
            f'<img src="fig/{name}.webp" width="{W}" height="{H}" alt="{E(alt or caption)}" loading="lazy">{svg}</div>'
            f'<figcaption><span class="fno">图 {num}</span>{caption}</figcaption>{legend}</figure>')


def proj_extra(name, p3):
    """额外锚点：用存下的两个对角锚点 lo/hi 不够，改用 make_figures 存的 scale 反推不了视向——
    所以额外锚点在 make_figures 里补存；这里只做兜底提示。"""
    raise KeyError(f'{name}: 额外锚点 {p3} 需在 make_figures.py 里补存')


# ---------------------------------------------------------------- 矢量图
def ring_draw(ri, phase, x0, y0, s, cls):
    name = RINGS[ri]
    top = TOPO[name]
    ph = next(r for r in PH if r['name'] == name)
    nodes = ph['phases'][phase]
    to = lambda p: (x0 + p[0] * s, y0 - p[1] * s)
    out = [f'<line class="gl" x1="{x0 - 178 * s:.1f}" y1="{y0:.1f}" x2="{x0 + 178 * s:.1f}" y2="{y0:.1f}"/>']
    for t in top['tris']:
        pts = ' '.join('%.1f,%.1f' % to(nodes[i]) for i in t)
        out.append(f'<polygon class="pl-{cls}" points="{pts}"/>')
    for i in sorted({i for t in top['tris'] for i in t}):
        x, y = to(nodes[i])
        out.append(f'<circle class="pin-{cls}" cx="{x:.1f}" cy="{y:.1f}" r="{max(1.5, 2.4 * s):.1f}"/>')
    cx, cy = to((0, 0))
    out.append(f'<circle class="axis" cx="{cx:.1f}" cy="{cy:.1f}" r="3"/>')
    ap = nodes[top['apex']][1]
    ax, ay = to((0, ap))
    out.append(f'<text class="dimt{" fold" if cls == "fold" else ""}" x="{ax:.1f}" y="{ay - 8:.1f}" text-anchor="middle" font-size="14">{ap:.0f}</text>')
    return '\n'.join(out)


def rings_svg():
    s = 0.56
    W, H = 1080, 420
    colw = W / 5
    body = []
    for ri in range(5):
        cx = colw * (ri + 0.5)
        body.append(f'<text class="rlab" x="{cx:.0f}" y="22">{SHORT[ri]}</text>')
        body.append(ring_draw(ri, '0', cx, 175, s, 'open'))
        body.append(ring_draw(ri, '180', cx, 345, s, 'fold'))
        ft = foot_travel(ri)
        body.append(f'<text class="vlab s" x="{cx:.0f}" y="370" text-anchor="middle">内侧脚行程 {ft["inner_tr"]:.1f}</text>')
    body.append('<text class="vlab s" x="8" y="198">全开 · 数字 = 拱顶离中轴高度</text>')
    body.append('<text class="vlab s" x="8" y="400">折叠</text>')
    return (f'<svg class="vec rings" viewBox="0 0 {W} {H}" role="img" aria-label="五个呼吸环全开与折叠对照">'
            + '\n'.join(body) + '</svg>')


# 角化件分组：图块号沿用作者的打印图块清单（工作日志表格 T-0615-2）。每块板按「所在环 + 夹角」唯一对应一个图块
BLOCK_NO = {(2, 150): 1, (2, 140): 2, (1, 160): 3, (1, 150): 4, (1, 140): 5,
            (0, 160): 6, (0, 140): 7, (3, 160): 8, (3, 140): 9, (4, 160): 10, (4, 140): 11}
ANG_STYLE = {140: ('#F6E7CC', '#8F5600'), 150: ('#DCE7F2', '#1D5A8E'), 160: ('#DCEBE2', '#2C6649')}


def plate_geom(p):
    """三点板：最长边是两端，对面那个销是中间销。返回 (中间销下标, 臂长, 夹角, 两端距)。"""
    L = [math.dist(p[(i + 1) % 3], p[(i + 2) % 3]) for i in range(3)]
    m = int(np.argmax(L))
    a = np.subtract(p[(m + 1) % 3], p[m]); b = np.subtract(p[(m + 2) % 3], p[m])
    ang = math.degrees(math.acos(float(np.dot(a, b) / np.linalg.norm(a) / np.linalg.norm(b))))
    return m, float(np.linalg.norm(a)), round(ang), L[m]


def ring_blocks(ri):
    name = RINGS[ri]
    nodes = next(r for r in PH if r['name'] == name)['phases']['0']
    out = []
    for t in TOPO[name]['tris']:
        p = [nodes[i] for i in t]
        m, arm, ang, chord = plate_geom(p)
        out.append(dict(tri=t, pts=p, mid=m, arm=arm, ang=ang, chord=chord, no=BLOCK_NO[(ri, ang)]))
    return out


def plate_groups_svg():
    """每个环一格：上为全开位，每块板标图块号（颜色 = 夹角）；下为该环用到的图块，按实尺寸同一比例画出。"""
    W, PW, PH_ = 1080, 360, 470
    s, sc = 0.95, 2.3
    body = []
    for ri in range(5):
        col, row = (ri % 3, ri // 3)
        x0, y0 = col * PW, row * PH_
        cx, ytop = x0 + PW / 2, y0 + 258
        body.append(f'<text class="rlab" x="{cx:.0f}" y="{y0 + 24:.0f}">{SHORT[ri]}</text>')
        bl = ring_blocks(ri)
        to = lambda p: (cx + p[0] * s, ytop - p[1] * s)
        body.append(f'<line class="gl" x1="{cx - 178 * s:.1f}" y1="{ytop}" x2="{cx + 178 * s:.1f}" y2="{ytop}"/>')
        for b in bl:
            fill, ink = ANG_STYLE[b['ang']]
            pts = ' '.join('%.1f,%.1f' % to(q) for q in b['pts'])
            body.append(f'<polygon points="{pts}" fill="{fill}" stroke="{ink}" stroke-width="1" stroke-linejoin="round" fill-opacity="0.85"/>')
        labs = []
        for b in bl:   # 号码放在「离中轴较远的那条臂」中段外侧，交叉成对的两块板各在一边
            mid = np.array(b['pts'][b['mid']], float)
            ends = [np.array(b['pts'][(b['mid'] + k) % 3], float) for k in (1, 2)]
            far = max(ends, key=lambda e: np.linalg.norm(e))
            p = mid + 0.55 * (far - mid)
            out = p / (np.linalg.norm(p) or 1)
            p = p + out * 9.0
            x, y = to(p)
            labs.append((x, y, b))
        # 挤得太近的号码互相推开（两块板的号码落在几乎同一处时）
        P = np.array([[x, y] for x, y, _ in labs], float)
        for _ in range(60):
            moved = False
            for i in range(len(P)):
                for j in range(i + 1, len(P)):
                    d = P[j] - P[i]; L = np.linalg.norm(d)
                    if L < 17:
                        u = d / L if L > 1e-6 else np.array([1.0, 0.0])
                        P[i] -= u * (17 - L) / 2; P[j] += u * (17 - L) / 2; moved = True
            if not moved: break
        labs = [(P[i][0], P[i][1], b) for i, (_, _, b) in enumerate(labs)]
        for x, y, b in labs:
            ink = ANG_STYLE[b['ang']][1]
            body.append(f'<text x="{x:.1f}" y="{y + 4.5:.1f}" text-anchor="middle" font-size="13" font-weight="700" fill="{ink}">{b["no"]}</text>')
        x, y = to((0, 0))
        body.append(f'<circle class="axis" cx="{x:.1f}" cy="{y:.1f}" r="3"/>')
        kinds = {}
        for b in bl:
            kinds.setdefault(b['no'], dict(b, n=0))['n'] += 1
        yy = ytop + 26
        for no in sorted(kinds, key=lambda n: -kinds[n]['ang']):
            k = kinds[no]
            fill, ink = ANG_STYLE[k['ang']]
            half = math.radians(k['ang'] / 2)
            dx, dy = k['arm'] * math.sin(half) * sc, k['arm'] * math.cos(half) * sc
            mx, my = cx + 18, yy + 8
            pl = f'{mx - dx:.1f},{my + dy:.1f} {mx:.1f},{my:.1f} {mx + dx:.1f},{my + dy:.1f}'
            body.append(f'<polyline points="{pl}" fill="none" stroke="{fill}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>')
            body.append(f'<polyline points="{pl}" fill="none" stroke="{ink}" stroke-width="1.3" stroke-linejoin="round"/>')
            for px, py in ((mx - dx, my + dy), (mx, my), (mx + dx, my + dy)):
                body.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="3.6" fill="#fff" stroke="{ink}" stroke-width="1.3"/>')
            body.append(f'<text x="{x0 + 14:.1f}" y="{my + dy / 2 + 7:.1f}" font-size="22" font-weight="700" fill="{ink}">{no}</text>')
            body.append(f'<text class="vlab s" x="{mx:.0f}" y="{my + dy + 22:.1f}" text-anchor="middle">'
                        f'臂 {k["arm"]:.1f} · 夹角 {k["ang"]}° · 两端 {k["chord"]:.1f} · ×{k["n"]}</text>')
            yy = my + dy + 34
    # 右下空格：图例
    lx, ly = 2 * PW + 24, PH_ + 60
    body.append(f'<text class="vlab" x="{lx}" y="{ly}" font-weight="700">图例</text>')
    for i, ang in enumerate((140, 150, 160)):
        fill, ink = ANG_STYLE[ang]
        body.append(f'<rect x="{lx}" y="{ly + 20 + i * 28}" width="26" height="15" fill="{fill}" stroke="{ink}"/>'
                    f'<text class="vlab s" x="{lx + 36}" y="{ly + 32 + i * 28}">夹角 {ang}°</text>')
    for i, t in enumerate(('板上数字 = 图块号', '×n = 本环件数')):
        body.append(f'<text class="vlab s" x="{lx}" y="{ly + 128 + i * 24}">{t}</text>')
    H = 2 * PH_
    return (f'<svg class="vec plates" viewBox="0 0 {W} {H}" role="img" aria-label="角化件分组：五个环各用哪几号图块">'
            + '\n'.join(body) + '</svg>')


def foot_travel(ri):
    """内侧脚：全开 x → 折叠 x（右侧那只）。"""
    name = RINGS[ri]
    ph = next(r for r in PH if r['name'] == name)
    o = ph['phases']['0']
    feet = ph['feet']
    right = [f for f in feet if o[f][0] > 0]
    inner = min(right, key=lambda f: o[f][0])
    outer = max(right, key=lambda f: o[f][0])
    slot = {sl['node']: sl for sl in ph['slots']}
    return dict(inner_open=o[inner][0], inner_fold=slot[inner]['lo'], inner_tr=slot[inner]['hi'] - slot[inner]['lo'],
                outer_open=o[outer][0], outer_fold=slot[outer]['lo'], outer_tr=slot[outer]['hi'] - slot[outer]['lo'])


def rack_svg():
    """S3 示意：中轴齿轮 z=32（节圆 r=16），上齿条接右内侧脚、下齿条接左内侧脚。只说明原理。"""
    ri = 2
    s = 1.9
    W, H = 1080, 470
    x0, y0 = 540, 330
    name = RINGS[ri]
    top = TOPO[name]
    ph = next(r for r in PH if r['name'] == name)
    o = ph['phases']['0']
    to = lambda p: (x0 + p[0] * s, y0 - p[1] * s)
    out = []
    # 淡画全开的环
    for t in top['tris']:
        pts = ' '.join('%.1f,%.1f' % to(o[i]) for i in t)
        out.append(f'<polygon class="pl-ghost" points="{pts}"/>')
    # 脚槽
    out.append(f'<rect class="slot" x="{x0 - 168 * s:.1f}" y="{y0 - 1.8 * s:.1f}" width="{336 * s:.1f}" height="{3.6 * s:.1f}"/>')
    ft = foot_travel(ri)
    r = TEETH[ri] / 2
    # 齿轮
    cx, cy = to((0, 0))
    out.append(f'<circle class="gear" cx="{cx:.1f}" cy="{cy:.1f}" r="{(r + 1) * s:.1f}"/>')
    out.append(f'<circle class="gearp" cx="{cx:.1f}" cy="{cy:.1f}" r="{r * s:.1f}"/>')
    out.append(f'<circle class="axis" cx="{cx:.1f}" cy="{cy:.1f}" r="5"/>')
    # 两根齿条：长度 = 全开时从脚到过齿轮 18mm
    xi = ft['inner_open']
    for side, yy in ((1, r), (-1, -r)):
        xa = side * xi            # 接脚处
        xb = -side * 18           # 另一端
        lo_, hi_ = sorted((xa, xb))
        X, Y = to((lo_, yy + side * 3.5))
        out.append(f'<rect class="rack" x="{X:.1f}" y="{min(Y, to((0, yy))[1]):.1f}" width="{(hi_ - lo_) * s:.1f}" height="{3.5 * s:.1f}"/>')
        # 齿（示意）
        teeth = []
        k = lo_
        while k < hi_:
            tx, ty = to((k, yy))
            teeth.append(f'M{tx:.1f},{ty:.1f} l{1.5 * s:.1f},{side * 1.6 * s:.1f} l{1.5 * s:.1f},{-side * 1.6 * s:.1f}')
            k += math.pi  # 模数 1 的齿距 = π
        out.append(f'<path class="teeth" d="{" ".join(teeth)}"/>')
        # U 形卡接件：从齿条下（上）到脚
        fx, fy = to((xa, 0))
        rx, ry = to((xa, yy))
        out.append(f'<path class="uclip" d="M{fx - 7:.1f},{fy:.1f} L{fx - 7:.1f},{ry:.1f} M{fx + 7:.1f},{fy:.1f} L{fx + 7:.1f},{ry:.1f}"/>')
        out.append(f'<circle class="foot" cx="{fx:.1f}" cy="{fy:.1f}" r="6"/>')
        # 运动箭头（张开方向）
        ax0, ay = to((xa - side * 10, yy + side * 14))
        ax1, _ = to((xa + side * 30, yy + side * 14))
        out.append(f'<line class="arrow" x1="{ax0:.1f}" y1="{ay:.1f}" x2="{ax1:.1f}" y2="{ay:.1f}" marker-end="url(#ah)"/>')
    # 旋转箭头
    out.append(f'<path class="arrow" d="M{cx - 30:.1f},{cy - 48:.1f} A 52 52 0 0 1 {cx + 30:.1f},{cy - 48:.1f}" marker-end="url(#ah)"/>')
    # 标注
    tr = math.pi * TEETH[ri] * SWING / 360
    labels = [
        (to((0, -46)), f'中轴齿轮 m=1，z={TEETH[ri]}（节圆 ⌀{TEETH[ri]}）', 'middle'),
        (to((xi + 4, -14)), '右内侧脚', 'start'),
        (to((-xi - 4, -14)), '左内侧脚', 'end'),
        (to((60, r + 22)), '上齿条 → 接右内侧脚', 'start'),
        (to((-70, -r - 12)), '下齿条 → 接左内侧脚', 'end'),
    ]
    for (x, y), t, anc in labels:
        out.append(f'<text class="vlab" x="{x:.1f}" y="{y:.1f}" text-anchor="{anc}">{E(t)}</text>')
    defs = ('<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            '<path d="M0,0 L10,5 L0,10 z" class="ahd"/></marker></defs>')
    return (f'<svg class="vec rack" viewBox="0 0 {W} {H}" role="img" aria-label="齿条推拉内侧脚的原理示意">'
            + defs + '\n'.join(out) + '</svg>')


def gear_table():
    rows = []
    for ri in range(5):
        tr = math.pi * TEETH[ri] * SWING / 360
        rows.append(f'<tr><td>{SHORT[ri]}</td><td class="n">{TEETH[ri]}</td><td class="n">{tr:.1f}</td></tr>')
    return ('<div class="tw"><table class="data"><thead><tr><th>环</th><th class="n">齿数 z（m=1）</th>'
            '<th class="n">齿条行程</th></tr></thead><tbody>' + ''.join(rows) + '</tbody></table></div>')


def ring_table():
    rows = []
    for ri in range(5):
        name = RINGS[ri]
        ph = next(r for r in PH if r['name'] == name)
        top = TOPO[name]
        o, f = ph['phases']['0'], ph['phases']['180']
        used = sorted({i for t in top['tris'] for i in t})
        span_o = max(o[i][0] for i in used) * 2
        span_f = max(f[i][0] for i in used) * 2
        ap_o, ap_f = o[top['apex']][1], f[top['apex']][1]
        rows.append(
            f'<tr><td>{SHORT[ri]}</td><td class="n">{len(top["tris"])}</td>'
            f'<td class="n">{span_o:.0f} / {span_f:.0f}</td><td class="n">{ap_o:.0f} / {ap_f:.0f}</td></tr>')
    return ('<div class="tw"><table class="data"><thead><tr><th>环</th><th class="n">角化件</th>'
            '<th class="n">全宽 开 / 合</th><th class="n">拱顶高 开 / 合</th></tr></thead><tbody>'
            + ''.join(rows) + '</tbody></table></div>')


# ---------------------------------------------------------------- 大触手肌腱走线（数据：make_figures 存的 815 实测）
ARM = META.get('_arm', {})


def _poly(pts):
    return ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)


def tendon_end_svg():
    """端视（第 1 节，从梢端往根部看）：端板窗口在 90 / 210 / 330°，中央导块槽口在对面的 270 / 30 / 150°。"""
    S, cx, cy = 8.6, 215, 225
    def P(r, deg):
        a = math.radians(deg); return (cx + S * r * math.cos(a), cy - S * r * math.sin(a))
    def hexagon(apo):   # 边法向在 angs 上的多边形
        angs = sorted(apo)
        out = []
        for i, t1 in enumerate(angs):
            t2 = angs[(i + 1) % len(angs)]
            n1 = np.array([math.cos(math.radians(t1)), math.sin(math.radians(t1))])
            n2 = np.array([math.cos(math.radians(t2)), math.sin(math.radians(t2))])
            p = np.linalg.solve(np.array([n1, n2]), np.array([apo[t1], apo[t2]]))
            out.append((cx + S * p[0], cy - S * p[1]))
        return out
    rw = ARM['plates'][0][1] if ARM else 11.5
    rg = ARM['grooves'][0][1] if ARM else 10.3
    plate = hexagon({90: 16.0, 210: 16.0, 330: 16.0, 30: 18.7, 150: 18.7, 270: 18.7})
    block = hexagon({t: rg for t in (30, 90, 150, 210, 270, 330)})
    g = [f'<polygon points="{_poly(plate)}" fill="#F4F6F8" stroke="#2A2E33" stroke-width="1.4"/>']
    for t in (30, 150, 270):          # 立柱成对，夹着槽口方向
        for dt in (-21, 21):
            x, y = P(12.0, t + dt); g.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{S * 2.1:.1f}" fill="#E3E8EE" stroke="#7B848D" stroke-width="1"/>')
    g.append(f'<polygon points="{_poly(block)}" fill="#DDE6EF" stroke="#2A2E33" stroke-width="1.2"/>')
    cols = {'A': ('#B02C20', 90), 'B': ('#1F5C96', 210), 'C': ('#28784E', 330)}
    for k, (c, t) in cols.items():
        # 端板窗口：V 形，尖朝轴心
        tip, base = P(rw, t), [P(rw + 3.4, t - 13), P(rw + 3.4, t + 13)]
        g.append(f'<polygon points="{_poly([tip] + base)}" fill="#fff" stroke="{c}" stroke-width="1.4"/>')
        # 对面的槽口
        x, y = P(rg, t + 180)
        g.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="5.2" fill="#fff" stroke="{c}" stroke-width="1.6"/>')
        a, b = P(rw, t), P(rg, t + 180)
        g.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="{c}" '
                 f'stroke-width="{3 if k == "A" else 1.6}" stroke-linecap="round"/>')
    g.append(f'<circle cx="{cx}" cy="{cy}" r="3" fill="#2A2E33"/>')
    # 标注（只标腱 A），文字统一排在右侧
    wa, gb = P(rw + 1.8, 90), P(rg, 270)
    lab = [
        (wa, 70, '腱 A 的端板窗口：90°'),
        ((cx, cy), 175, '轴线'),
        (P(rg * 0.6, 330), 245, '中央导块'),
        (gb, 315, '腱 A 压进的槽口：270°'),
        (P(12, 291), 385, '立柱 ×6，两根一组'),
    ]
    LX = 430
    for (x0, y0), ty, t in lab:
        g.append(f'<polyline points="{x0:.1f},{y0:.1f} {LX - 14:.1f},{ty:.1f} {LX - 4:.1f},{ty:.1f}" fill="none" stroke="#1D5A8E" stroke-width="1"/>'
                 f'<circle cx="{x0:.1f}" cy="{y0:.1f}" r="2.6" fill="#1D5A8E"/>'
                 f'<text class="vlab" x="{LX:.1f}" y="{ty + 5:.1f}">{E(t)}</text>')
    leg = ''.join(f'<line x1="{20 + i * 120}" y1="430" x2="{48 + i * 120}" y2="430" stroke="{c}" stroke-width="3"/>'
                  f'<text class="vlab s" x="{54 + i * 120}" y="435">腱 {k}</text>' for i, (k, (c, _)) in enumerate(cols.items()))
    return (f'<svg class="vec" viewBox="0 0 720 450" role="img" aria-label="第 1 节端视：窗口与槽口的方位">'
            + ''.join(g) + leg + '<text class="vlab s" x="20" y="24">第 1 节端视（从梢端往根部看）</text></svg>')


def tendon_side_svg():
    """腱 A 所在的纵剖面，整条触手。竖向放大 2 倍。"""
    seq = ARM['seq']; plates = ARM['plates']; grooves = ARM['grooves']
    x0, x1 = -14, 420
    W, H = 1080, 250
    sx = (W - 60) / (x1 - x0); sy = sx * 2
    cy = 130
    X = lambda x: 30 + (x - x0) * sx
    Y = lambda r: cy - r * sy
    g = [f'<line x1="{X(x0):.1f}" y1="{cy}" x2="{X(x1):.1f}" y2="{cy}" stroke="#9AA3AB" stroke-width="1" stroke-dasharray="10 4 2 4"/>']
    nbox = len(grooves)
    for i in range(nbox + 1):
        if i < nbox:
            (xa, ra), (xb, rb) = plates[2 * i], plates[2 * i + 1]
        else:
            (xa, ra), (xb, rb) = plates[2 * nbox], plates[2 * nbox + 1]
        k = ra / plates[0][1]
        top, bot, win = 16.0 * k, -18.7 * k, 3.4 * k
        for xp, rp in ((xa, ra), (xb, rb)):
            w = 6 * k
            # 端板：窗口处断开（窗口以下一段 + 窗口以上一段）
            g.append(f'<rect x="{X(xp) - w * sx / 2:.1f}" y="{Y(rp):.1f}" width="{w * sx:.1f}" height="{(rp - bot) * sy:.1f}" fill="#F4F6F8" stroke="#2A2E33" stroke-width="1"/>')
            g.append(f'<rect x="{X(xp) - w * sx / 2:.1f}" y="{Y(top):.1f}" width="{w * sx:.1f}" height="{max(0.8, (top - rp - win)) * sy:.1f}" fill="#F4F6F8" stroke="#2A2E33" stroke-width="1"/>')
        # 盒体轮廓（立柱所在的外包，淡）
        g.append(f'<rect x="{X(xa):.1f}" y="{Y(12 * k):.1f}" width="{(xb - xa) * sx:.1f}" height="{24 * k * sy:.1f}" fill="none" stroke="#C3CAD1" stroke-width="1" stroke-dasharray="3 3"/>')
        if i < nbox:
            xg, rg = grooves[i]
            bw = 15.1 * k
            g.append(f'<rect x="{X(xg) - bw * sx / 2:.1f}" y="{Y(rg):.1f}" width="{bw * sx:.1f}" height="{2 * rg * sy:.1f}" fill="#DDE6EF" stroke="#2A2E33" stroke-width="1"/>')
        if i < nbox:
            xn = plates[2 * i + 2][0]
            g.append(f'<line x1="{X(xb):.1f}" y1="{cy}" x2="{X(xn):.1f}" y2="{cy}" stroke="#7B848D" stroke-width="{3.5 * k:.1f}" stroke-linecap="round"/>')
    # 根部：腱孔件 + 脊柱杆
    g.append(f'<line x1="{X(-3):.1f}" y1="{cy}" x2="{X(plates[0][0]):.1f}" y2="{cy}" stroke="#7B848D" stroke-width="3.5"/>')
    g.append(f'<circle cx="{X(-3):.1f}" cy="{Y(13.9):.1f}" r="{4.9 * sy / 2:.1f}" fill="#fff" stroke="#2A2E33" stroke-width="1.2"/>')
    # 梢端绑柱
    g.append(f'<rect x="{X(401.7) - 3.75 * sx:.1f}" y="{Y(8.15):.1f}" width="{7.5 * sx:.1f}" height="{3.9 * sy:.1f}" fill="#F4F6F8" stroke="#2A2E33" stroke-width="1"/>')
    pts = [(X(x), Y(r)) for x, r in seq]
    pts = [(X(-14), Y(13.9))] + pts
    g.append(f'<polyline points="{_poly(pts)}" fill="none" stroke="#B02C20" stroke-width="2.4" stroke-linejoin="round"/>')
    lab = [
        ((X(-3), Y(13.9)), (X(-3) + 10, 34), '根部腱孔 → 绕线盘', 'start'),
        ((pts[3][0], pts[3][1]), (pts[3][0] + 30, 236), '每节越过轴线，压进导块对面的槽口', 'start'),
        ((X(401.7), Y(6.2)), (X(401.7) - 10, 34), '梢端绑线柱', 'end'),
    ]
    for (ax, ay), (tx, ty), t, an in lab:
        g.append(f'<line x1="{ax:.1f}" y1="{ay:.1f}" x2="{tx:.1f}" y2="{ty - (5 if ty > ay else -4):.1f}" stroke="#1D5A8E" stroke-width="1"/>'
                 f'<circle cx="{ax:.1f}" cy="{ay:.1f}" r="2.6" fill="#1D5A8E"/>'
                 f'<text class="vlab" x="{tx:.1f}" y="{ty + (8 if ty > ay else 0):.1f}" text-anchor="{an}">{E(t)}</text>')
    return (f'<svg class="vec" viewBox="0 0 {W} {H + 10}" role="img" aria-label="腱 A 的纵剖面，整条触手">' + ''.join(g)
            + f'<text class="vlab s" x="{W - 10}" y="{H + 4}" text-anchor="end">腱 A 纵剖面，B、C 同样走法。竖向放大 2 倍，左为根部。</text></svg>')


# ---------------------------------------------------------------- 拼装
src = SRC.read_text(encoding='utf-8')
fig_counter = [0]


def fig_sub(mo):
    name, caption = mo.group(1), mo.group(2) or ''
    fig_counter[0] += 1
    return fig_html(name, caption.strip(), fig_counter[0])


src = re.sub(r'<!--FIG (\w+)(?:\s+(.*?))?-->', fig_sub, src)
src = src.replace('<!--RINGS-->', rings_svg())
src = src.replace('<!--RACK-->', rack_svg())
src = src.replace('<!--GEARTABLE-->', gear_table())
src = src.replace('<!--RINGTABLE-->', ring_table())
src = src.replace('<!--PLATEGROUPS-->', plate_groups_svg())
src = src.replace('<!--TENDON_END-->', tendon_end_svg())
src = src.replace('<!--TENDON_SIDE-->', tendon_side_svg())
(OUT / 'index.html').write_text(src, encoding='utf-8')
print('figures', fig_counter[0], '→', OUT / 'index.html')
