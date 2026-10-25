# -*- coding: utf-8 -*-
"""交接图册拼装：模板 + 渲染图 + 由数据生成的矢量图 → index.html（可发布、可打印成 PDF）。

  python build_doc.py handover.src.html <figDir> <outDir>

figDir 里要有 make_figures.py 的 PNG 与 figures.json，以及 ring-phases.json（ring-phases.mjs 产出）
和 ring-topo.json（环的三角板拓扑）。

模板里的占位：
  <!--FIG name-->      渲染图 + 编号气泡 + 图例（气泡位置按图像轮廓自动外推）
  <!--RINGS-->         五环全开 / 折叠对照（矢量，数据来自站上同一份环解算）
  <!--RACK-->          齿条推拉内侧脚示意（S3）
  <!--GEARTABLE-->     齿数 → 齿条行程 → 与内侧脚全行程之比
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
        ('ring_S2', '呼吸环 S1–S5（五个 Hoberman 角化拱）'),
        ('rail_top', '滑轨架 ×5（脚槽 + 竖直导槽 + 中轴孔）'),
        ('shaft', '中间轴 ⌀6 D 形钢轴'),
        ('pulley', '轴上同步带轮（GT2）'),
        ('motor', '主电机支架（NEMA17，腰形槽调皮带）'),
        ('chassis', '机身底盘：左右两副梯形支架'),
        ('cage', '笼架（立柱 + 上下框）'),
        ('turntable', '偏航转台 HDB60XZ45B（模型为 ⌀60 圆柱占位）'),
        ('base_foot', 'X 形底座与四个圆脚'),
        ('small_L', '小触手（左），SG90 驱动'),
        ('armmount', '大触手安装笼（三台肌腱电机）'),
        ('arm', '大触手：7 节椎节 + 3 根肌腱'),
    ],
    'explode': [
        ('ring', '五个呼吸环'),
        ('rail', '滑轨架 ×5'),
        ('shaft', '中间轴（齿轮与齿条见 RM-HO-09）'),
        ('chassis', '机身底盘'),
        ('motor', '主电机支架'),
        ('armmount', '大触手安装笼'),
        ('arm', '大触手'),
        ('small', '小触手（右）'),
        ('small2', '小触手（左）'),
        ('cage', '笼架'),
        ('turntable', '偏航转台'),
        ('base', 'X 形底座'),
    ],
    'det_ring': [
        ('plate', '角化件（V 形三点板），本环 10 件'),
        ('apex', '拱顶销，在竖直导槽里上下滑'),
        ('guide', '竖直导槽'),
        ('strut', '斜撑'),
        ('foot_out_r', '外侧脚（自由滑动）'),
        ('foot_in_r', '内侧脚（齿条推拉的那一只）'),
        ('slot', '水平脚槽（槽宽 3.4–3.6）'),
        ('hub', '中轴孔 ⌀6.15（D 形轴直接穿过）'),
        ('tab', '安装耳（螺栓固定到底盘梳齿上）'),
    ],
    'det_drive': [
        ('shaft', '中间轴 ⌀6 D 形，长 370'),
        ('pulley', '轴上带轮（模型画成 ⌀16，按定案应为 60T）'),
        ('motor', '主电机支架：NEMA17 装在框内'),
        ('slot_bracket', '腰形槽：移动电机调皮带张力'),
        ('railhub', '滑轨架的中轴孔（兼作滑动轴承）'),
        ('shaftblock', 'S1 端两块挡块（模型为方块，作用待确认）'),
    ],
    'det_base': [
        ('turntable', '偏航转台位置（⌀60 × 45 占位）'),
        ('cage_floor', '笼架底板（螺栓锁到转台输出盘）'),
        ('cage_post', '笼架立柱 ×4'),
        ('cage_top', '立柱顶托架（托住机身底盘的横梁）'),
        ('center_plate', '底座中心座'),
        ('foot', '圆脚 ×4'),
    ],
    'det_chassis': [
        ('frame_r', '右梯形支架 362.5 × 123.7'),
        ('frame_l', '左梯形支架'),
        ('cross1', '后横梁（落在笼架立柱上）'),
        ('cross2', '前横梁'),
        ('tie_r', '侧拉杆 ×2'),
        ('tooth', '梳齿：滑轨架的安装耳落在这里'),
    ],
    'det_arm': [
        ('mount', '安装笼（挂在右梯形支架下）'),
        ('v0', '第 1 节椎节（最粗）'),
        ('v6', '第 7 节椎节'),
        ('tip', '梢端：三根肌腱各绑在自己的绑线柱上'),
    ],
    'det_armbase': [
        ('frame_l', '电机框 A（约 50 × 50，内口约 44，装 NEMA17）'),
        ('frame_r', '电机框 B'),
        ('frame_b', '电机框 C（在下方）'),
        ('disc', '根部连接件：肌腱从这里进入触手'),
        ('v0', '第 1 节椎节'),
        ('top_plate', '顶板：螺栓固定到机身底盘下面'),
    ],
    'det_small': [
        ([300, 150], '安装板（螺栓固定到底盘下面）'),
        ([460, 330], 'SG90 舵机'),
        ([648, 250], '圆盘转轴：大节绕它前后甩'),
        ([712, 420], '大节（叉形，约 49 长）'),
        ([616, 480], '软杆 3.9 × 3.9 × 26（被动弯曲）'),
        ([610, 770], '小块（被动，跟着甩）'),
    ],
}
EXTRA_ANCHOR = {}

# 尺寸线：(锚点1, 锚点2, 'h'|'v', 尺寸线所在的 y（h）或 x（v）, 文字)
DIMS = {
    'view_front': [('ymax_pt', 'ymin_pt', 'h', 672, '387'),
                   ('zmax_pt', 'zmin_pt', 'v', 698, '382'),
                   ('axis', 'zmin_pt', 'v', 26, '156 轴线高')],
    'view_side': [('body_l', 'body_r', 'h', 686, '387 机身'),
                  ('xmin_pt', 'xmax_pt', 'h', 734, '780 含大触手'),
                  ('zmax_pt', 'zmin_pt', 'v', 1284, '382'),
                  ('st1', 'st2', 'h', 28, '85'), ('st2', 'st3', 'h', 28, '85'),
                  ('st3', 'st4', 'h', 28, '85'), ('st4', 'st5', 'h', 28, '85')],
    'view_top': [('xmin_pt', 'xmax_pt', 'h', 704, '780'),
                 ('body_l', 'body_r', 'h', 30, '387'),
                 ('ymax_pt', 'ymin_pt', 'v', 1284, '387')],
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
        body.append(f'<text class="rlab" x="{cx:.0f}" y="22">{SHORT[ri]} · {RINGS[ri][3:].replace("x", " × ")}</text>')
        body.append(ring_draw(ri, '0', cx, 175, s, 'open'))
        body.append(ring_draw(ri, '180', cx, 345, s, 'fold'))
        ft = foot_travel(ri)
        body.append(f'<text class="vlab s" x="{cx:.0f}" y="370" text-anchor="middle">内侧脚行程 {ft["inner_tr"]:.1f}</text>')
    body.append('<text class="vlab s" x="8" y="198">全开（中轴 0°）· 数字 = 拱顶离中轴高度</text>')
    body.append('<text class="vlab s" x="8" y="400">折叠（815 模型曲柄方案的另一端死点）</text>')
    return (f'<svg class="vec rings" viewBox="0 0 {W} {H}" role="img" aria-label="五个呼吸环全开与折叠对照">'
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
        ((W / 2, 26), f'中轴转 {SWING:.0f}° ⇒ 每根齿条走 {tr:.1f} mm；这个环内侧脚的全行程是 {ft["inner_tr"]:.1f} mm', 'middle'),
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
        ft = foot_travel(ri)
        tr = math.pi * TEETH[ri] * SWING / 360
        rows.append(f'<tr><td>{SHORT[ri]}</td><td class="n">{TEETH[ri]}</td><td class="n">{TEETH[ri]}</td>'
                    f'<td class="n">{tr:.1f}</td><td class="n">{ft["inner_tr"]:.1f}</td>'
                    f'<td class="n">{tr / ft["inner_tr"] * 100:.0f}%</td><td class="n">{ft["outer_tr"]:.1f}</td></tr>')
    return ('<div class="tw"><table class="data"><thead><tr><th>环</th><th>齿数 z</th><th>节圆 ⌀（m=1）</th>'
            '<th>齿条行程（中轴转 336°）</th><th>内侧脚全行程</th><th>齿条 / 内侧脚</th><th>外侧脚行程（自由滑）</th>'
            '</tr></thead><tbody>' + ''.join(rows) + '</tbody></table></div>')


def ring_table():
    rows = []
    for ri in range(5):
        name = RINGS[ri]
        ph = next(r for r in PH if r['name'] == name)
        top = TOPO[name]
        o, f = ph['phases']['0'], ph['phases']['180']
        used = sorted({i for t in top['tris'] for i in t})
        ft = foot_travel(ri)
        hinges = sum(1 for i in used if sum(i in t for t in top['tris']) == 2)
        span_o = max(o[i][0] for i in used) * 2
        span_f = max(f[i][0] for i in used) * 2
        ap_o, ap_f = o[top['apex']][1], f[top['apex']][1]
        base, sc = name[3:].split('x')
        rows.append(
            f'<tr><td>{SHORT[ri]}</td><td>{base} × {sc}</td><td class="n">{(-170 + 85 * ri):+d}</td>'
            f'<td class="n">{len(top["tris"])}</td><td class="n">{hinges}</td><td class="n">4</td>'
            f'<td class="n">{span_o:.0f} / {span_f:.0f}</td><td class="n">{ap_o:.1f} / {ap_f:.1f}</td>'
            f'<td class="n">{ft["inner_tr"]:.1f}</td><td class="n">{ft["outer_tr"]:.1f}</td>'
            f'<td class="n">{top["crankR"]:.1f}</td></tr>')
    return ('<div class="tw"><table class="data"><thead><tr><th>环</th><th>基型 × 比例</th><th>站位 x</th>'
            '<th>角化件</th><th>铰点</th><th>脚</th><th>全宽 开/合</th><th>拱顶高 开/合</th>'
            '<th>内侧脚行程</th><th>外侧脚行程</th><th>旧曲柄 r</th></tr></thead><tbody>'
            + ''.join(rows) + '</tbody></table></div>')


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
(OUT / 'index.html').write_text(src, encoding='utf-8')
print('figures', fig_counter[0], '→', OUT / 'index.html')
