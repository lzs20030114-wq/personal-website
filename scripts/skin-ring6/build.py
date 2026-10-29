"""六单元环静态演示模型 v2：出 PDF 图纸 + DXF / SVG 切割文件。

python3 scripts/skin-ring6/build.py <输出目录>
"""

from __future__ import annotations

import math
import os
import sys
import tempfile

from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

import cutfiles as CF
import geom as G
import render as R

PAGE_W, PAGE_H = 594.0, 420.0
MM = 72 / 25.4
N_PAGES = 7
CODE = "P2-SKIN-RING6-01"
DATE = "2026-10-29"

INK = HexColor("#1d2b36")
GRAY = HexColor("#6b7780")
LIGHT = HexColor("#c9d1d6")
TEAL = HexColor("#1f6f8b")
RED = HexColor("#b8392b")
WOOD = HexColor("#efe6d6")
CORE = HexColor("#e2cfa9")
SKIN_A = HexColor("#dbe8f0")
SKIN_A_S = HexColor("#4f7f99")
SKIN_B = HexColor("#dcefe5")
SKIN_B_S = HexColor("#3e8a68")
HOOP_C = HexColor("#2e5d6b")
FREE = HexColor("#bfe3ef")
PANEL = HexColor("#f4f7f9")

FONT = "Hei"
pdfmetrics.registerFont(TTFont(FONT, "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", subfontIndex=0))


# ---- 绘图小件 -----------------------------------------------------------------------
class P:
    def __init__(self, c):
        self.c = c

    def text(self, x, y, s, size=2.4, color=INK, anchor="l", rot=0):
        c = self.c
        c.saveState()
        c.setFillColor(color)
        c.setFont(FONT, size)
        c.translate(x, y)
        if rot:
            c.rotate(rot)
        w = pdfmetrics.stringWidth(s, FONT, size)
        dx = {"l": 0, "c": -w / 2, "r": -w}[anchor]
        c.drawString(dx, 0, s)
        c.restoreState()
        return w

    def para(self, x, y, lines, size=2.3, lead=4.4, color=INK, bullet=False):
        for i, s in enumerate(lines):
            if bullet:
                self.c.setFillColor(color)
                self.c.circle(x + 0.7, y - i * lead + size * 0.32, 0.45, stroke=0, fill=1)
                self.text(x + 3, y - i * lead, s, size, color)
            else:
                self.text(x, y - i * lead, s, size, color)
        return y - len(lines) * lead

    def poly(self, pts, stroke=INK, fill=None, w=0.25, dash=None, close=True):
        c = self.c
        c.saveState()
        p = c.beginPath()
        p.moveTo(*pts[0])
        for q in pts[1:]:
            p.lineTo(*q)
        if close:
            p.close()
        c.setLineWidth(w)
        c.setLineJoin(1)
        if dash:
            c.setDash(list(dash))
        if stroke is not None:
            c.setStrokeColor(stroke)
        if fill is not None:
            c.setFillColor(fill)
        c.drawPath(p, stroke=1 if stroke is not None else 0, fill=1 if fill is not None else 0)
        c.restoreState()

    def line(self, x0, y0, x1, y1, color=INK, w=0.25, dash=None):
        self.poly([(x0, y0), (x1, y1)], stroke=color, w=w, dash=dash, close=False)

    def rect(self, x, y, w, h, stroke=INK, fill=None, lw=0.25, dash=None):
        self.poly([(x, y), (x + w, y), (x + w, y + h), (x, y + h)], stroke, fill, lw, dash)

    def circle(self, x, y, r, stroke=INK, fill=None, w=0.25):
        c = self.c
        c.saveState()
        c.setLineWidth(w)
        if stroke is not None:
            c.setStrokeColor(stroke)
        if fill is not None:
            c.setFillColor(fill)
        c.circle(x, y, r, stroke=1 if stroke is not None else 0, fill=1 if fill is not None else 0)
        c.restoreState()

    def arrow(self, x, y, ang, color=INK, L=1.8, Wd=0.55):
        ca, sa = math.cos(ang), math.sin(ang)
        p0 = (x, y)
        p1 = (x - L * ca + Wd * sa, y - L * sa - Wd * ca)
        p2 = (x - L * ca - Wd * sa, y - L * sa + Wd * ca)
        self.poly([p0, p1, p2], stroke=None, fill=color)

    def dimh(self, x0, x1, yb, yd, txt, color=TEAL, size=2.2, ext=True, above=True):
        if ext:
            for x in (x0, x1):
                self.line(x, yb, x, yd + (1.2 if yd > yb else -1.2), LIGHT, 0.18)
        self.line(x0, yd, x1, yd, color, 0.2)
        if abs(x1 - x0) > 5:
            self.arrow(x0, yd, math.pi, color)
            self.arrow(x1, yd, 0, color)
        self.text((x0 + x1) / 2, yd + (0.9 if above else -size - 0.6), txt, size, color, "c")

    def dimv(self, y0, y1, xb, xd, txt, color=TEAL, size=2.2, ext=True, left=True):
        if ext:
            for y in (y0, y1):
                self.line(xb, y, xd + (1.2 if xd > xb else -1.2), y, LIGHT, 0.18)
        self.line(xd, y0, xd, y1, color, 0.2)
        if abs(y1 - y0) > 5:
            self.arrow(xd, y0, -math.pi / 2 if y0 < y1 else math.pi / 2, color)
            self.arrow(xd, y1, math.pi / 2 if y0 < y1 else -math.pi / 2, color)
        off = -0.9 if left else size + 0.6
        self.text(xd + off, (y0 + y1) / 2, txt, size, color, "c", rot=90)

    def table(self, x, ytop, widths, rows, rh=6.4, size=2.25, head_fill=PANEL):
        y = ytop
        tw = sum(widths)
        for i, row in enumerate(rows):
            if i == 0:
                self.rect(x, y - rh, tw, rh, stroke=None, fill=head_fill)
            self.line(x, y - rh, x + tw, y - rh, LIGHT, 0.2)
            cx = x
            for w, cell in zip(widths, row):
                self.text(cx + 1.8, y - rh + (rh - size) / 2 + 0.25, str(cell), size,
                          GRAY if i == 0 else INK)
                cx += w
            y -= rh
        self.line(x, ytop, x + tw, ytop, LIGHT, 0.2)
        return y


def frame(pp: P, n: int, title: str, sub: str):
    pp.text(22, 403, "项目二 / 六单元环 · 静态演示模型", 5.0)
    pp.text(PAGE_W - 22, 403, f"{n:02d} / {N_PAGES:02d}", 3.6, TEAL, "r")
    pp.text(22, 396, f"{CODE}  |  6 × P2-SKIN-01 v3  |  v1.0  |  {DATE}", 2.2, GRAY)
    pp.text(PAGE_W - 22, 396, "A2 594 × 420 mm / 单位 mm", 2.2, GRAY, "r")
    pp.line(22, 391, PAGE_W - 22, 391, LIGHT, 0.3)
    pp.text(22, 381, title, 3.4)
    pp.text(22, 375.5, sub, 2.2, GRAY)
    pp.line(22, 30, PAGE_W - 22, 30, LIGHT, 0.3)
    pp.text(22, 24.5, "六单元环静态演示 / 木板 3 mm / 表皮 1 mm / 未做实物验证", 2.2, RED)
    pp.text(PAGE_W - 22, 24.5, f"切割只用配套 DXF / SVG；1:1 页可直接量  |  {n}/{N_PAGES}", 2.2, GRAY, "r")
    # 100 mm 校验尺
    x0, y0 = 22, 14
    pp.line(x0, y0, x0 + 100, y0, INK, 0.3)
    for i in range(11):
        h = 2.2 if i % 5 == 0 else 1.2
        pp.line(x0 + 10 * i, y0, x0 + 10 * i, y0 + h, INK, 0.25)
    pp.text(x0 + 104, y0, "100 mm 校验尺 / 打印选“实际大小 100%”，不要适配页面", 2.0, GRAY)


def panel(pp, x, y, w, h):
    pp.rect(x, y, w, h, stroke=LIGHT, fill=PANEL, lw=0.25)


BOND_C = HexColor("#d9772f")


# ---- 剖面绘制（r, s）→ 页面 -------------------------------------------------------
def draw_unit_section(pp, ox, oy, sc, side=1, labels=True, ties=True, core=True, hoops=True, bd=True):
    """单元过板宽中线的剖面。ox = 环轴的页面 x，oy = s=0 的页面 y；side=-1 画在轴的左边。"""
    X = lambda r: ox + side * r * sc
    Y = lambda s: oy - s * sc

    def box(r0, r1, s0, s1, **kw):
        pp.poly([(X(r0), Y(s0)), (X(r1), Y(s0)), (X(r1), Y(s1)), (X(r0), Y(s1))], **kw)

    if core:
        box(0, G.DOWEL_D / 2, 0, G.UNIT_H, stroke=INK, fill=CORE, w=0.25)
        for sp in G.PLATE_S:
            box(G.DOWEL_D / 2, G.APO, sp - G.T_BOARD / 2, sp + G.T_BOARD / 2, stroke=INK, fill=CORE, w=0.25)
            hr = G.PLATE_HOLE_D / 2
            box(G.PLATE_HOLE_R - hr, G.PLATE_HOLE_R + hr, sp - G.T_BOARD / 2, sp + G.T_BOARD / 2,
                stroke=None, fill=HexColor("#ffffff"))
    for name, (r0, r1, s0, s1) in G.BOARDS_FOLDED.items():
        box(r0, r1, s0, s1, stroke=INK, fill=WOOD, w=0.25)
    for name, rects in G.SKIN_FOLDED.items():
        a = name.startswith("A")
        for r0, r1, s0, s1 in rects:
            box(r0, r1, s0, s1, stroke=SKIN_A_S if a else SKIN_B_S, fill=SKIN_A if a else SKIN_B, w=0.12)
    if hoops:
        for sp in G.HOOP_S:
            box(G.OUTER_WALL, G.OUTER_WALL + 1, sp - G.HOOP_W / 2, sp + G.HOOP_W / 2, stroke=None, fill=HOOP_C)
    if ties:
        for sc_ in G.STITCH_S:
            d = G.STITCH_DS
            t = G.T_BOARD / 2
            pts = [(G.OUTER_WALL + 0.5, sc_ - d), (G.APO - 0.3, sc_ - d), (G.PLATE_HOLE_R, sc_ - t - 0.3),
                   (G.PLATE_HOLE_R, sc_ + t + 0.3), (G.APO - 0.3, sc_ + d), (G.OUTER_WALL + 0.5, sc_ + d)]
            pp.poly([(X(a), Y(b)) for a, b in pts], stroke=RED, w=0.3)
        pp.poly([(X(a), Y(b)) for a, b in G.BOND_AC], stroke=BOND_C, w=0.5, close=False)
        if bd:
            pp.poly([(X(a), Y(b)) for a, b in G.BOND_BD], stroke=BOND_C, w=0.3, dash=(1.2, 0.9), close=False)
    if labels:
        for name, (r0, r1, s0, s1) in G.BOARDS_FOLDED.items():
            rm, sm = (r0 + r1) / 2, (s0 + s1) / 2
            anc = "l" if side > 0 else "r"
            if name in ("C1", "C5", "C3"):
                pp.text(X(r1) + side * 3.0, Y(sm), name, 2.4, INK, anc)
            elif name == "C2":
                pp.text(X(rm), Y(s0) + 4.5, name, 2.4, INK, "c")
            else:
                pp.text(X(rm), Y(s1) - 6.0, name, 2.4, INK, "c")
    return X, Y


# ---- 平铺零件 → 页面（局部 y 向下） ---------------------------------------------------
def draw_part(pp, part, ox, oy, sc=1.0, fill=WOOD, stroke=INK, w=0.3, mirror=False):
    def T(x, y):
        if mirror:
            x = part["w"] - x
        return ox + x * sc, oy - y * sc
    pp.poly([T(x, y) for x, y in part["outline"]], stroke=stroke, fill=fill, w=w)
    for hx, hy, d in part["holes"]:
        px, py = T(hx, hy)
        pp.circle(px, py, d / 2 * sc, stroke=stroke, fill=HexColor("#ffffff"), w=0.2)
    return T


def wrap(s, width, size):
    lines, cur = [], ""
    for ch in s:
        if pdfmetrics.stringWidth(cur + ch, FONT, size) > width:
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines


# ---- 页 1：总览 ----------------------------------------------------------------------
def page_overview(c, fig_dir):
    pp = P(c)
    frame(pp, 1, "01 | 总览：六个 v3 单元竖着围成一圈，凹槽朝外翻成挑台",
          "v2：去掉 v1 每个单元背后的定型肋。形状只靠芯（立杆 + 四块六边形板）和每个箱子里的两根斜线定住。")
    img = ImageReader(os.path.join(fig_dir, "iso.png"))
    iw, ih = img.getSize()
    w = 238.0
    h = w * ih / iw
    c.drawImage(img, 26, 362 - h, w, h, mask="auto")
    pp.text(26, 362 - h - 5, "轴测示意：深色窄带是两道箍带；箱子里的橙色斜线是键；端板、台面、底面上的黑色短线是露在外面的针脚。", 2.0, GRAY)

    cx, cy, sc = 405.0, 279.0, 0.5
    pp.text(305, 365, "平面 1:2（从上往下看；虚线 = 被挡住的六边形板）", 2.5)
    rv = G.APO / math.cos(math.pi / 6)
    pp.poly([(cx + x * sc, cy + y * sc) for x, y in G.plate_outline(0.0)], stroke=GRAY, w=0.2, dash=(1.2, 0.8))
    pp.circle(cx, cy, G.DOWEL_D / 2 * sc, stroke=INK, fill=CORE, w=0.2)
    rr = math.hypot(G.OUTER_FRONT, G.W / 2)
    pp.circle(cx, cy, rr * sc, stroke=LIGHT, w=0.18)
    pp.poly([(cx + x * sc, cy + y * sc) for x, y in G.HOOP["pts"]], stroke=HOOP_C, w=0.5)
    for k in range(6):
        a = k * math.pi / 3
        n = (math.cos(a), math.sin(a))
        t = (-n[1], n[0])
        P2 = lambda r, w: (cx + (r * n[0] + w * t[0]) * sc, cy + (r * n[1] + w * t[1]) * sc)
        hw = G.W / 2
        pp.poly([P2(G.APO, -hw), P2(G.OUTER_WALL, -hw), P2(G.OUTER_WALL, hw), P2(G.APO, hw)],
                stroke=INK, fill=WOOD, w=0.25)
        pp.poly([P2(G.OUTER_WALL, -hw), P2(G.OUTER_FRONT, -hw), P2(G.OUTER_FRONT, hw), P2(G.OUTER_WALL, hw)],
                stroke=INK, fill=SKIN_A, w=0.3)
        lx, ly = P2((G.OUTER_WALL + G.OUTER_FRONT) / 2, 0)
        pp.text(lx, ly - 1, f"U{k + 1}", 2.6, INK, "c")
    yb = cy - G.OUTER_FRONT * sc
    pp.dimh(cx - G.OUTER_FRONT * sc, cx + G.OUTER_FRONT * sc, cy, yb - 10,
            f"{2 * G.OUTER_FRONT:.0f}（正面到正面）", above=False)
    a150 = math.radians(150)
    pp.text(cx + (rr * sc + 3) * math.cos(a150), cy + (rr * sc + 3) * math.sin(a150),
            f"外接圆 Ø{2 * rr:.0f}", 2.2, TEAL, "r")
    xw = cx + G.OUTER_FRONT * sc
    pp.dimv(cy - G.W / 2 * sc, cy + G.W / 2 * sc, xw, xw + 8, "75", left=False)
    pp.text(cx, cy - 6, "立杆", 2.0, GRAY, "c")

    sm = G.summary()
    rows = [("关键尺寸", "数值"),
            ("整体外接圆", f"Ø{2 * sm['corner_radius']:.0f}"),
            ("总高", f"{sm['unit_height']:.0f}"),
            ("台面离桌", f"{sm['platform_top_z']:.1f}"),
            ("挑出（墙外表面起）", f"{sm['protrusion']:.1f}"),
            ("箱高（外）", f"{sm['box_height']:.0f}"),
            ("单元两端距离", f"{sm['unit_height']:.0f}（平铺 400）"),
            ("斜线长", f"{sm['bond_len']:.1f}"),
            ("单元间缝", f"{sm['wall_gap_inner']:.1f} / {sm['wall_gap_outer']:.1f}")]
    pp.table(500, 352, [42, 30], rows, rh=5.8, size=2.05)

    bom = [("编号", "名称", "尺寸 mm", "数量", "材料", "说明"),
           ("C1 / C5", "端板", "101 × 75", "12", "木板 3", "离外端 90 处一对 Ø2 缝线孔"),
           ("C2 / C4", "台面 / 底面", "67.5 × 75", "12", "木板 3", "8 个 Ø2 孔，斜线的锚点"),
           ("C3", "正面", "43 × 75", "6", "木板 3", "无孔"),
           ("P", "六边形板", "边心距 72", "4", "木板 3", "中心 Ø10 穿立杆，6 个 Ø3 缝线孔"),
           ("J", "装配卡条", "261 × 24", "2", "木板 3", "定板距的工具，胶干后拿走"),
           ("G", "直角卡板", "75.5 × 60", "1", "木板 3", "托平台面的工具，绑好拿走"),
           ("T", "孔径试件", "80 × 22", "1", "木板 3", "先切，定立杆孔"),
           ("—", "立杆", "Ø10 × 261", "1", "木圆棒", "买现成的，截到 261"),
           ("A1 / A3", "外表皮", "173.5 × 75", "12", "表皮 1", "10 个 Ø2 孔"),
           ("A2", "外表皮", "43 × 75", "6", "表皮 1", "无孔"),
           ("B1 / B3", "内表皮", "101 × 75", "12", "表皮 1", "2 个 Ø2 孔"),
           ("B2", "内表皮", "188 × 75", "6", "表皮 1", "16 个 Ø2 孔"),
           ("S", "箍带", f"{G.HOOP_W:.0f} × {G.HOOP_L}", "2", "表皮 1", f"搭接 {G.HOOP_LAP:.0f}，长度现场收"),
           ("—", "线", "Ø0.5–0.8", "24 根", "蜡线", "每单元 2 根斜线 + 2 针端板缝线")]
    pp.text(305, 186, "零件清单（木板 37 件 + 一根立杆，表皮 38 件）", 2.6)
    pp.table(305, 182, [20, 22, 28, 14, 16, 167], bom, rh=5.6, size=2.05)

    panel(pp, 26, 40, 238, 56)
    pp.para(31, 89, [
        "形状只来自两件事，和 Lab 2-5 一样。一是芯，立杆和四块六边形板把每个单元的端板 C1、C5 夹住，",
        "两端距离被定成 261，带子平铺是 400，多出来的 139 只能朝外折出去，往哪边折由铰链在哪一面连着决定，",
        "这就是 v3 交错分段的用处。二是键，每个箱子里两根斜线把折好的箱子锁成直角，不让它在自重下往下垮。",
        "箱子里面没有按形状切出来的零件。装配用的卡条 J 和直角卡板 G 是工具，装好就拿走，不在照片里。",
        "六个单元一样；静态，不做收缩动作。两道箍带是原来设想的窄条，压住上下端板。",
    ], size=2.2, lead=4.5)
    pp.text(31, 51, "单元之间留缝：六边形边长 83.1，单元宽 75，内表面处缝 8.1。缝随半径变大，到方箱正面约 101，环上台面不连续。", 2.05, GRAY)


# ---- 页 2：剖面 ----------------------------------------------------------------------
def page_section(c):
    pp = P(c)
    frame(pp, 2, "02 | 剖面：过板宽中线，1:1",
          "折后位置按理想铰点推算（每道缝绕凹侧表面、缝宽中点转 90°）。实物差 1–2 mm 时，以斜线拉紧后台面水平为准。")
    ox, oy, sc = 52.0, 330.0, 1.0
    X, Y = draw_unit_section(pp, ox, oy, sc)
    pp.text(22, 366, "单元 U1 剖面 1:1", 2.6)
    pp.line(ox, oy + 3, ox, Y(G.UNIT_H) - 3, GRAY, 0.2, dash=(4, 1, 1, 1))
    pp.text(ox - 1.5, Y(G.UNIT_H) - 6, "环轴", 2.0, GRAY, "c")
    pp.line(ox - 8, Y(G.UNIT_H), X(G.OUTER_FRONT) + 10, Y(G.UNIT_H), INK, 0.4)
    pp.text(X(G.OUTER_FRONT) + 12, Y(G.UNIT_H) - 0.8, "桌面", 2.0, GRAY)
    xr = X(G.OUTER_FRONT) + 10
    pp.dimv(Y(0), Y(G.UNIT_H), X(G.OUTER_FRONT), xr + 26, f"{G.UNIT_H:.0f} 总高 = 立杆长", left=False)
    pp.dimv(Y(G.PLATFORM_TOP_S), Y(G.UNIT_H), X(G.OUTER_FRONT), xr + 14,
            f"{G.UNIT_H - G.PLATFORM_TOP_S:.1f} 台面离桌", left=False)
    pp.dimv(Y(G.PLATFORM_TOP_S), Y(G.PLATFORM_BOT_S), X(G.OUTER_FRONT), xr + 3,
            f"{G.PLATFORM_BOT_S - G.PLATFORM_TOP_S:.0f}", left=False)
    xl = ox - 8
    pp.dimv(Y(0), Y(G.PLATE_S[0]), ox, xl, f"{G.PLATE_S[0]:.0f}")
    pp.dimv(Y(0), Y(G.PLATE_S[1]), ox, xl - 7, f"{G.PLATE_S[1]:.0f}")
    pp.dimv(Y(G.PLATE_S[3]), Y(G.UNIT_H), ox, xl, f"{G.UNIT_H - G.PLATE_S[3]:.0f}")
    pp.dimv(Y(G.PLATE_S[2]), Y(G.UNIT_H), ox, xl - 7, f"{G.UNIT_H - G.PLATE_S[2]:.0f}")
    pp.text(xl - 12, Y(130), "四块 P 板的位置（两端各量）", 2.0, GRAY, "c", rot=90)
    yt = oy + 18
    pp.dimh(ox, X(G.APO), oy, yt, f"{G.APO:.0f}")
    pp.dimh(X(G.APO), X(G.OUTER_WALL), oy, yt, "5")
    pp.dimh(X(G.OUTER_WALL), X(G.OUTER_FRONT), Y(G.PLATFORM_TOP_S), yt, f"{G.OUTER_FRONT - G.OUTER_WALL:.1f} 挑出")
    pp.dimh(ox, X(G.OUTER_FRONT), oy, yt + 9, f"{G.OUTER_FRONT:.1f}")
    pp.text(X(G.OUTER_WALL) + 3, Y(55), "A 外表皮 1", 2.0, SKIN_A_S)
    pp.text(X(G.APO) + 1, Y(66), "B", 2.0, SKIN_B_S)
    for sp in G.PLATE_S:
        pp.text(X(40), Y(sp) + 2.2, "P", 2.2, INK, "c")
    pp.text(X(2.5), Y(205), "立杆 Ø10", 2.0, INK, "l", rot=90)
    pp.text(X(G.OUTER_WALL) + 3, Y(G.HOOP_S[0]) + 7.5, "S 箍带", 2.0, HOOP_C)
    mx = (G.BOND_AC[0][0] + G.BOND_AC[1][0]) / 2
    my = (G.BOND_AC[0][1] + G.BOND_AC[1][1]) / 2
    pp.text(X(mx) - 4, Y(my) - 1, f"斜线 AC {G.BOND_LEN:.1f}", 2.1, BOND_C, "r")
    pp.text(X(mx) + 6, Y(my - 13), "BD（预留）", 1.9, BOND_C)
    pp.text(X(G.OUTER_WALL) + 3, Y(G.STITCH_S[0]) - 1, "缝线", 1.9, RED)
    pp.text(X(G.OUTER_WALL) + 3, Y(G.STITCH_S[1]) - 1, "缝线", 1.9, RED)
    pp.para(X(G.OUTER_FRONT) + 4, Y(190), ["斜线在板宽 10 与 65 两处，", "这里投影画在中线剖面上。"],
            size=1.9, lead=3.6, color=GRAY)

    cx, top, s2 = 452.0, 352.0, 0.5
    pp.text(330, top + 7, "A–A 剖面 1:2（过 U1 与 U4）", 2.6)
    draw_unit_section(pp, cx, top, s2, side=1, labels=False, bd=False)
    draw_unit_section(pp, cx, top, s2, side=-1, labels=False, bd=False)
    pp.line(cx - 90, top - G.UNIT_H * s2, cx + 90, top - G.UNIT_H * s2, INK, 0.35)
    pp.text(cx + G.OUTER_FRONT * s2 + 2, top - 60 * s2, "U1", 2.4)
    pp.text(cx - G.OUTER_FRONT * s2 - 2, top - 60 * s2, "U4", 2.4, INK, "r")
    pp.dimh(cx - G.OUTER_FRONT * s2, cx + G.OUTER_FRONT * s2, top - G.UNIT_H * s2, top - G.UNIT_H * s2 - 9,
            f"{2 * G.OUTER_FRONT:.0f}", above=False)

    # 端板缝线详图 4:1
    panel(pp, 300, 40, 128, 148)
    pp.text(305, 181, "端板缝在板边上 4:1（s = 90 处）", 2.4)
    s4 = 4.0
    r0w, s0w = 60.0, 81.0          # 窗口左上
    ox4, oy4 = 312.0, 168.0
    X4 = lambda r: ox4 + (r - r0w) * s4
    Y4 = lambda s: oy4 - (s - s0w) * s4
    sp = G.STITCH_S[0]
    def b4(r0, r1, a0, a1, **kw):
        pp.poly([(X4(r0), Y4(a0)), (X4(r1), Y4(a0)), (X4(r1), Y4(a1)), (X4(r0), Y4(a1))], **kw)
    b4(r0w, G.APO, sp - 1.5, sp + 1.5, stroke=INK, fill=CORE, w=0.25)
    b4(G.PLATE_HOLE_R - 1.5, G.PLATE_HOLE_R + 1.5, sp - 1.5, sp + 1.5, stroke=None, fill=HexColor("#ffffff"))
    b4(G.APO, G.APO + 1, s0w, s0w + 19, stroke=SKIN_B_S, fill=SKIN_B, w=0.15)
    b4(G.APO + 1, G.A_FACE, s0w, s0w + 19, stroke=INK, fill=WOOD, w=0.25)
    b4(G.A_FACE, G.OUTER_WALL, s0w, s0w + 19, stroke=SKIN_A_S, fill=SKIN_A, w=0.15)
    for d in (-G.STITCH_DS, G.STITCH_DS):
        b4(G.APO, G.OUTER_WALL, sp + d - 1, sp + d + 1, stroke=None, fill=HexColor("#ffffff"))
    dd = G.STITCH_DS
    t = 1.5
    loop = [(G.OUTER_WALL + 0.4, sp - dd), (G.APO - 0.3, sp - dd), (G.PLATE_HOLE_R, sp - t - 0.3),
            (G.PLATE_HOLE_R, sp + t + 0.3), (G.APO - 0.3, sp + dd), (G.OUTER_WALL + 0.4, sp + dd)]
    pp.poly([(X4(a), Y4(b)) for a, b in loop], stroke=RED, w=0.45)
    pp.dimv(Y4(sp - dd), Y4(sp + dd), X4(G.OUTER_WALL), X4(G.OUTER_WALL) + 10, "7（两孔）", left=False)
    pp.dimh(X4(G.PLATE_HOLE_R), X4(G.APO), Y4(sp + 1.5), Y4(sp + 1.5) - 9, "5", above=False)
    pp.text(X4(r0w) + 2, Y4(sp) - 0.8, "P 板", 2.0)
    pp.text(X4(G.APO + 2), Y4(s0w) + 2, "C1", 2.0, INK, "c")
    pp.para(305, 74, ["线从端板上面那个孔穿进去，穿过 P 板上离边 5 的孔，",
                      "从端板下面那个孔穿出来，在外面打结。外面只露 7 mm 一竖针。",
                      "C5 同样缝在 s = 171 那块板上。最上、最下两块板",
                      "不缝线，由箍带把端板压在板边上。"], size=2.05, lead=4.2)

    # 为什么是斜线
    panel(pp, 438, 40, 134, 148)
    pp.text(443, 181, "为什么拉斜线，不拉竖线", 2.4)

    def mini(x0, y0, shear, diag, label):
        a, b = 34.0, 26.0
        dx = shear
        A, B = (x0, y0), (x0 + a, y0 - dx)
        D, C = (x0, y0 - b), (x0 + a, y0 - b - dx)
        pp.line(x0 - 3, y0 + 6, x0 - 3, y0 - b - 6, INK, 0.6)
        pp.poly([A, B, C, D], stroke=INK, w=0.35, close=False)
        for p in (A, B, C, D):
            pp.circle(p[0], p[1], 0.7, stroke=INK, fill=HexColor("#ffffff"), w=0.2)
        if diag:
            pp.line(A[0] + 3, A[1] - 0.3, C[0] - 2, C[1] + 1.2, BOND_C, 0.5)
        else:
            m1 = (A[0] + a * 0.6, A[1] - dx * 0.6)
            m2 = (D[0] + a * 0.6, D[1] - dx * 0.6)
            pp.line(m1[0], m1[1], m2[0], m2[1], BOND_C, 0.5)
        pp.text(x0 + a / 2, y0 - b - dx - 7, label, 1.9, GRAY, "c")

    mini(452, 165, 0, False, "竖线")
    mini(510, 165, 9, False, "往下垮了，竖线还是原长")
    mini(452, 118, 0, True, "斜线")
    mini(510, 118, 9, True, "要往下垮，斜线得变长")
    pp.para(443, 72, ["墙是一边，台面、正面、底面是三根杆，",
                      "四根杆铰在一起，能歪成平行四边形。",
                      "竖着拉的线和墙平行，歪了也不变长，拉不住。",
                      "斜线从台面靠墙那头拉到底面靠外那头，",
                      "箱子一往下垮它就要变长，所以拉得住。"], size=2.0, lead=4.1)


# ---- 页 3：木板零件 -------------------------------------------------------------------
def page_wood(c):
    pp = P(c)
    cat = G.parts_catalog()
    frame(pp, 3, "03 | 木板零件 1:1：3 mm 木板，共 37 件",
          "建议 3 mm 椴木层板激光切。C1–C5 尺寸与 v3 相同，只加了线孔。J、G 是装配工具，不装在模型上。")
    yt = 352.0
    p = cat["C1"]
    x0 = 30.0
    draw_part(pp, p, x0, yt)
    pp.text(x0, yt + 6, "C1 / C5 × 12", 2.8)
    pp.dimh(x0, x0 + p["w"], yt - 75, yt - 82, "101", above=False)
    pp.dimv(yt, yt - 75, x0, x0 - 6, "75")
    hx = (p["holes"][0][0] + p["holes"][1][0]) / 2
    pp.dimh(x0, x0 + hx, yt, yt + 2.5, f"{hx:g}")
    pp.text(x0 + hx + 4, yt - 37.5 - 0.8, f"2 × Ø{G.HOLE_D:g}，间距 7", 1.9, TEAL)
    pp.text(x0 + 1.5, yt - 70, "外端", 1.9, GRAY)
    pp.text(x0 + p["w"] - 1.5, yt - 70, "靠箱子一端", 1.9, GRAY, "r")

    p = cat["C2"]
    x0 = 150.0
    draw_part(pp, p, x0, yt)
    pp.text(x0, yt + 6, "C2 / C4 × 12", 2.8)
    pp.dimh(x0, x0 + p["w"], yt - 75, yt - 82, f"{p['w']:g}", above=False)
    pp.dimv(yt, yt - 75, x0, x0 - 6, "75")
    pp.dimh(x0, x0 + G.BOND_U, yt, yt + 2.5, f"{G.BOND_U:g}")
    pp.dimh(x0 + p["w"] - G.BOND_U, x0 + p["w"], yt, yt + 2.5, f"{G.BOND_U:g}")
    xe = x0 + p["w"]
    pp.dimv(yt, yt - G.BOND_Y[0], xe, xe + 6, f"{G.BOND_Y[0]:g}", left=False)
    pp.dimv(yt, yt - G.BOND_Y[1], xe, xe + 12, f"{G.BOND_Y[1]:g}", left=False)
    pp.text(x0 + p["w"] / 2, yt - 37.5 - 0.8, f"每处 2 × Ø{G.HOLE_D:g}，间距 6", 1.9, TEAL, "c")

    p = cat["C3"]
    x0 = 255.0
    draw_part(pp, p, x0, yt)
    pp.text(x0, yt + 6, "C3 × 6", 2.8)
    pp.dimh(x0, x0 + p["w"], yt - 75, yt - 82, "43", above=False)
    pp.text(x0 + p["w"] / 2, yt - 37.5, "无孔", 1.9, GRAY, "c")

    pl = cat["PLATE"]
    px0, py0 = 320.0, 352.0
    draw_part(pp, pl, px0, py0, fill=CORE)
    pp.text(px0, py0 + 13, "P 六边形板 × 4（四块相同）", 2.8)
    pp.dimh(px0, px0 + pl["w"], py0 - pl["h"] / 2, py0 + 5, f"{pl['w']:.1f}（对角）")
    pp.dimv(py0, py0 - pl["h"], px0 + pl["w"], px0 + pl["w"] + 9, "144（对边 = 2 × 72）", left=False)
    pp.text(px0 + pl["w"] / 2, py0 - pl["h"] / 2 - 9, f"中心 Ø{G.DOWEL_D:g} 穿立杆", 2.0, TEAL, "c")
    pp.text(px0 + pl["w"] / 2, py0 - 9, f"6 个 Ø{G.PLATE_HOLE_D:g}，在每条边中点、离边 5", 2.0, TEAL, "c")

    g = cat["GAUGE"]
    gx, gy = 30.0, 190.0
    draw_part(pp, g, gx, gy, fill=HexColor("#f3efe6"), stroke=GRAY)
    pp.text(gx, gy + 6, "G 直角卡板 × 1（装配工具）", 2.8)
    pp.dimh(gx, gx + g["w"], gy - g["h"], gy - g["h"] - 7, f"{g['w']:g}", above=False)
    pp.dimv(gy, gy - g["h"], gx, gx - 6, f"{g['h']:g}")
    pp.text(gx + G.GAUGE_LEG + 3, gy - 18, "贴墙外表面", 1.9, GRAY)
    pp.text(gx + g["w"] - 2, gy - g["h"] + G.GAUGE_LEG + 2, "压在台面上", 1.9, GRAY, "r")
    pp.text(gx + 2, gy - g["h"] - 13, f"内角 {G.GAUGE_RELIEF:g} × {G.GAUGE_RELIEF:g} 让开 H1 的表皮", 1.9, TEAL)

    j = cat["JIG"]
    jx, jy = 130.0, 190.0
    draw_part(pp, j, jx, jy, fill=HexColor("#f3efe6"), stroke=GRAY)
    pp.text(jx, jy + 6, "J 装配卡条 × 2（装配工具）", 2.8)
    prev = 0.0
    for sp in G.PLATE_S:
        pp.dimh(jx + prev, jx + sp, jy, jy + 2.5, f"{sp - prev:g}")
        prev = sp
    pp.dimh(jx, jx + j["w"], jy - j["h"], jy - j["h"] - 7, f"{j['w']:g}", above=False)
    pp.text(jx + j["w"] + 3, jy - 6, f"槽 {G.JIG_SLOT:g} × {G.JIG_DEPTH:g}", 1.9, TEAL)
    pp.text(jx + j["w"] + 3, jy - 11, "比板厚松一点，能拔出来", 1.9, GRAY)

    tt = cat["HTEST"]
    tx, ty = 450.0, 190.0
    draw_part(pp, tt, tx, ty)
    pp.text(tx, ty + 6, "T 孔径试件 × 1", 2.8)
    for (hx, hy, d) in tt["holes"]:
        pp.text(tx + hx, ty - tt["h"] - 4, f"{d:.1f}", 1.8, TEAL, "c")
    pp.text(tx, ty - tt["h"] - 10, "从左到右 9.6 / 9.8 / 10.0 / 10.2 / 10.4", 1.9, GRAY)

    dx0, dy0 = 130.0, 140.0
    pp.rect(dx0, dy0 - G.DOWEL_D, G.UNIT_H, G.DOWEL_D, stroke=INK, fill=CORE, lw=0.3)
    pp.text(dx0, dy0 + 5, "立杆 × 1：Ø10 木圆棒（买现成的），截到 261", 2.8)
    pp.dimh(dx0, dx0 + G.UNIT_H, dy0 - G.DOWEL_D, dy0 - G.DOWEL_D - 7, f"{G.UNIT_H:g}", above=False)
    prev = 0.0
    for sp in G.PLATE_S:
        pp.line(dx0 + sp, dy0 + 1.5, dx0 + sp, dy0 - G.DOWEL_D - 1.5, TEAL, 0.25, dash=(0.8, 0.6))
    pp.text(dx0 + G.UNIT_H + 3, dy0 - 6, "虚线 = 四块 P 板的位置（12 / 90 / 171 / 249）", 1.9, TEAL)

    panel(pp, 26, 40, 546, 62)
    pp.para(31, 95, [
        "全部零件在同一种 3 mm 板上切。先切 T 孔径试件，拿买到的立杆去插，选不松不紧的那个孔，改 geom.py 的 DOWEL_D 后重出 P 板文件。",
        "C2 与 C4 是同一个零件，C1 与 C5 也是。板上的 Ø2 孔与表皮上的孔要对齐，表皮贴好后用 Ø2 钻头或打孔针从板孔里再通一遍。",
        "C2 / C4 两端各两处孔：靠墙一端（离端 8）穿斜线 AC，另一端穿 BD。BD 是预留的，第一个单元装好后，箱子会往上翘才穿。",
        "J 卡条在做芯时卡住四块板定板距，胶干后拔出来；G 卡板在拉紧斜线时托平台面，绑好拿走。两件都不留在模型上。",
        "v1 的定型肋 R 与它的插槽已经取消；P 板上不再有插槽。",
    ], size=2.15, lead=4.6)


# ---- 页 4：表皮零件 -------------------------------------------------------------------
def page_skin(c):
    pp = P(c)
    cat = G.parts_catalog()
    frame(pp, 4, "04 | 表皮零件 1:1：1 mm 表皮，共 38 件",
          "分段与 v3 相同，只加了 Ø2 线孔；全部是 75 宽的矩形，可以先裁 75 宽长条再截断。")
    y1 = 352.0
    items = [("A1", "A1 / A3 × 12", 26.0, SKIN_A, SKIN_A_S),
             ("A2", "A2 × 6（无孔）", 222.0, SKIN_A, SKIN_A_S),
             ("B2", "B2 × 6", 290.0, SKIN_B, SKIN_B_S)]
    for key, label, x0, fill, stroke in items:
        p = cat[key]
        draw_part(pp, p, x0, y1, fill=fill, stroke=stroke)
        pp.text(x0, y1 + 6, label, 2.8)
        pp.dimh(x0, x0 + p["w"], y1 - 75, y1 - 82, f"{p['w']:g}", above=False)
        pp.dimv(y1, y1 - 75, x0, x0 - 6, "75")
        xs = sorted({round(h[0], 3) for h in p["holes"]})
        prev = 0.0
        for k, hx in enumerate(xs):
            pp.dimh(x0 + prev, x0 + hx, y1, y1 + 2.5 + (5 if k % 2 else 0), f"{hx - prev:g}")
            prev = hx
    pp.text(26, y1 - 92, "A1 的缝线孔靠 C1 一端（离端 86.5 / 93.5），斜线孔在 C2 段；A3 是同一个零件掉个头。", 2.05, RED)
    pp.text(26 + 173.5 - 2, y1 - 72, "C2 端", 2.0, GRAY, "r")
    pp.text(28, y1 - 72, "C1 端", 2.0, GRAY)
    pp.text(290, y1 - 92, "斜线孔 y：7 / 13 与 62 / 68；缝线孔 y：37.5（板宽中线）", 2.05, TEAL)

    y2 = 238.0
    p = cat["B1"]
    draw_part(pp, p, 26.0, y2, fill=SKIN_B, stroke=SKIN_B_S)
    pp.text(26, y2 + 6, "B1 / B3 × 12", 2.8)
    pp.dimh(26, 127, y2 - 75, y2 - 82, "101", above=False)
    pp.dimv(y2, y2 - 75, 26, 20, "75")
    xs = sorted({h[0] for h in p["holes"]})
    pp.dimh(26, 26 + xs[0], y2, y2 + 2.5, f"{xs[0]:g}")
    pp.dimh(26 + xs[0], 26 + xs[1], y2, y2 + 7.5, f"{xs[1] - xs[0]:g}")

    h = cat["HOOP"]
    hy = 132.0
    draw_part(pp, h, 26.0, hy, fill=SKIN_A, stroke=SKIN_A_S)
    pp.text(26, hy + 6, f"S 箍带 × 2：{G.HOOP_W:g} × {G.HOOP_L}", 2.8)
    pp.dimh(26, 26 + G.HOOP_L, hy - G.HOOP_W, hy - G.HOOP_W - 7, f"{G.HOOP_L}", above=False)
    pp.dimh(26, 26 + G.HOOP_LAP, hy, hy + 2.5, f"{G.HOOP_LAP:g} 搭接")
    pp.text(26, hy - G.HOOP_W - 16, f"箍带在单元外表面上的一圈长 {G.HOOP['perimeter']:.1f}，再加 20 搭接。"
            "用不含弹性的料时按此长度；用硅胶等弹性料时绕一圈收紧后再定搭接位置。", 1.95, GRAY)

    panel(pp, 150, 168, 422, 70)
    pp.text(155, 230, "裁切", 2.6)
    pp.para(155, 223, [
        "表皮零件都是 75 宽的矩形，不一定要找切割厂。在整张 1 mm 片材上先划出 75 宽的长条（钢尺 + 美工刀，",
        "刀片常换），再按长度截断；Ø2 孔用皮带打孔器或空心冲打。一共要 75 宽长条约 4.7 m，S 箍带另裁两条 12 宽。",
        "要用激光切，就用第 06 页的 skin 排版文件（1000 × 500）。含氯的橡胶（氯丁 CR、PVC 类）不能进激光机，",
        "下单前问清片材成分；硅胶片可以激光切，切口会有一层白色粉末，用湿布擦掉。",
        "孔最后再通。表皮贴到板上以后，用 Ø2 钻头或打孔针从板孔里把表皮孔通一遍，两层就一定对齐。",
    ], size=2.15, lead=4.5)
    panel(pp, 26, 40, 546, 56)
    pp.text(31, 89, "表皮选什么", 2.6)
    pp.para(31, 82, [
        "这个模型的形状由芯和斜线定住，表皮只需要弯过接缝、看起来是一层皮，不需要回弹。图纸按 1 mm 厚出，换 1 mm 的别的片材尺寸都不用改。",
        "推荐 1 mm 硅胶片（食品级、邵氏硬度 40–50A），几乎没有气味，手感最接近橡胶。缺点是难粘，要用中性硅酮胶，先用边角料试粘。",
        "最省事的是书皮布 / 装裱布：没有气味，剪刀和激光都能切，白乳胶就能粘，但没有弹性。几种材料的对比见第 07 页。",
    ], size=2.15, lead=4.6)


# ---- 页 5：叠层与孔位（平铺 1:1） ---------------------------------------------------
def page_laminate(c):
    pp = P(c)
    frame(pp, 5, "05 | 平铺叠层与胶合 1:1：一个单元的三层，可打印当胶合定位样板",
          "三层都用同一个 x 坐标（C1 端为 0），A 面朝上看，B 层画在同一 x 上。跨缝连续的那一面每道缝留 9 mm 不涂胶。")
    x0 = 97.0
    bands = [("A 面（外）", 338.0, "A"), ("木板", 248.0, "C"), ("B 面（内）", 158.0, "B")]
    continuous = {"A": [0, 3], "B": [1, 2]}
    for label, ytop, kind in bands:
        pp.text(x0 - 6, ytop - 40, label, 2.6, INK, "r")
        if kind == "C":
            for i, (fx, L) in enumerate(zip(G.FLAT_X, G.LENS)):
                draw_part(pp, G.part_board(f"C{i + 1}"), x0 + fx, ytop)
                pp.text(x0 + fx + L / 2, ytop - 30, f"C{i + 1}", 3.0, INK, "c")
                pp.text(x0 + fx + L / 2, ytop - 46, f"{L:g} × 75", 2.0, GRAY, "c")
        else:
            segs = G.SKIN_A if kind == "A" else G.SKIN_B
            fill, stroke = (SKIN_A, SKIN_A_S) if kind == "A" else (SKIN_B, SKIN_B_S)
            for name, (a, b) in segs.items():
                draw_part(pp, G.part_skin(name), x0 + a, ytop, fill=fill, stroke=stroke)
                pp.text(x0 + (a + b) / 2, ytop - 30, name, 3.0, INK, "c")
                pp.text(x0 + (a + b) / 2, ytop - 46, f"{b - a:g} × 75", 2.0, GRAY, "c")
            for j in continuous[kind]:
                gx = G.FLAT_X[j] + G.LENS[j]
                pp.rect(x0 + gx - 2, ytop - 75, 9, 75, stroke=None, fill=FREE)
                pp.rect(x0 + gx - 2, ytop - 75, 9, 75, stroke=TEAL, lw=0.15, dash=(0.8, 0.6))
                pp.text(x0 + gx + 2.5, ytop - 72, "9", 2.0, TEAL, "c")
    for j in range(4):
        gx = x0 + G.FLAT_X[j] + G.LENS[j] + G.GAP / 2
        pp.line(gx, 345, gx, 78, GRAY, 0.18, dash=(2, 1.2))
        ok_a = j in continuous["A"]
        pp.text(gx, 348, f"H{j + 1}", 2.4, INK, "c")
        pp.text(gx, 72, ("A 连续 / B 断" if ok_a else "B 连续 / A 断"), 2.0, TEAL if ok_a else SKIN_B_S, "c")
    marks = sorted({0.0, 400.0, *[x for fx, L in zip(G.FLAT_X, G.LENS) for x in (fx, fx + L)]})
    for x in marks:
        pp.line(x0 + x, 352, x0 + x, 356, INK, 0.2)
        pp.text(x0 + x, 357.5, f"{x:g}", 1.9, GRAY, "c")
    groups = {}
    for x, y, d, kind in G.HOLES_FLAT:
        groups.setdefault((round(x, 3), kind), None)
    for (x, kind) in groups:
        col = RED if kind == "stitch" else BOND_C
        pp.line(x0 + x, 340, x0 + x, 82, col, 0.12, dash=(0.6, 0.8))
    stitch_x = sorted({x for (x, k) in groups if k == "stitch"})
    for a, b in zip(stitch_x[0::2], stitch_x[1::2]):
        pp.text(x0 + (a + b) / 2, 362.5, f"缝线 {(a + b) / 2:g}", 1.9, RED, "c")
    for (x, kind) in groups:
        if kind == "ac":
            pp.text(x0 + x, 366.5, f"AC {x:g}", 1.9, BOND_C, "c")
        elif kind == "bd":
            pp.text(x0 + x, 366.5, f"BD {x:g}", 1.9, BOND_C, "c")
    pp.text(x0 + 405, 357.5, "← x，从 C1 端量", 1.9, GRAY)
    panel(pp, 26, 36, 546, 30)
    pp.para(31, 60, [
        "胶合时先把五块板按 5 mm 间隙排进一个直尺夹具（两根直尺 + 5 mm 垫片），贴 A 面，翻过来贴 B 面。连续的那一面在缝两侧各退 2 mm 不涂胶，",
        "留出 5 + 2 + 2 = 9 mm 的自由弯折段；断开的那一面表皮端边与板端边齐平，不伸进缝里。表皮按自然长度贴，不预拉。",
        "红色虚线 = 端板缝线孔（与 P 板缝在一起），橙色虚线 = 斜线孔（AC 默认穿，BD 预留）。",
    ], size=2.1, lead=4.4)


# ---- 页 6：排版 ----------------------------------------------------------------------
LAB = {"C1": "C1", "C2": "C2", "C3": "C3", "PLATE": "P", "JIG": "J", "GAUGE": "G", "HTEST": "T",
       "A1": "A1", "A2": "A2", "B1": "B1", "B2": "B2", "HOOP": "S"}


def sheet_title(prefix, nest):
    from collections import Counter
    cnt = Counter(k for k, *_ in nest)
    order = ["PLATE", "C1", "C2", "C3", "JIG", "GAUGE", "HTEST", "A1", "A2", "B1", "B2", "HOOP"]
    return prefix + "，".join(f"{LAB[k]} × {cnt[k]}" for k in order if cnt[k])


def page_nest(c):
    pp = P(c)
    cat = G.parts_catalog()
    frame(pp, 6, "06 | 切割排版 1:3：木板两张 600 × 400，表皮一张 1000 × 500",
          "本页只是缩小示意；切割用同名 DXF / SVG（1:1，单位 mm，只有闭合轮廓与圆孔）。零件间距 5，板边留 4。")
    sc = 1 / 3

    def sheet(nest, size, ox, oytop, title, fname, fill, stroke):
        w, h = size
        pp.text(ox, oytop + 5, title, 2.4)
        pp.text(ox + w * sc, oytop + 5, fname, 2.0, GRAY, "r")
        pp.rect(ox, oytop - h * sc, w * sc, h * sc, stroke=GRAY, lw=0.2, dash=(1.5, 1))
        for key, x, y, rot, mirror in nest:
            pts, holes = G.place(cat[key], x, y, rot, mirror)
            f = fill if key not in ("JIG", "GAUGE") else HexColor("#f3efe6")
            pp.poly([(ox + px * sc, oytop - py * sc) for px, py in pts], stroke=stroke, fill=f, w=0.15)
            for hx, hy, d in holes:
                pp.circle(ox + hx * sc, oytop - hy * sc, max(d / 2 * sc, 0.25), stroke=stroke, w=0.1)
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            pp.text(ox + (min(xs) + max(xs)) / 2 * sc, oytop - ((min(ys) + max(ys)) / 2 + 3) * sc,
                    LAB[key], 2.0, INK, "c")

    sheet(G.NEST_WOOD[0], G.SHEET_WOOD, 26, 358, sheet_title("木板 A：", G.NEST_WOOD[0]), "wood_A.dxf / .svg", CORE, INK)
    sheet(G.NEST_WOOD[1], G.SHEET_WOOD, 250, 358, sheet_title("木板 B：", G.NEST_WOOD[1]), "wood_B.dxf / .svg", WOOD, INK)
    sheet(G.NEST_SKIN, G.SHEET_SKIN, 26, 205, sheet_title("表皮：", G.NEST_SKIN), "skin.dxf / .svg", SKIN_A, SKIN_A_S)
    panel(pp, 380, 40, 192, 165)
    pp.text(385, 197, "下单时说明", 2.6)
    pp.para(385, 189, [
        "1. 文件单位 mm，导入比例 1:1；先量一下 C1 长 101、",
        "   T 试件宽 80，对上再切。",
        "2. 只有红色闭合轮廓和圆孔，全部切穿，没有雕刻。",
        "3. 两张木板同为 3 mm；表皮一张，材料见第 07 页。",
        "4. 含氯材料（氯丁橡胶、PVC）不能激光切，",
        "   提供片材成分让店里确认。",
        "5. J、G 是装配工具，和零件一起切出来。",
        "6. 立杆不切，买 Ø10 木圆棒截到 261。T 试件定了",
        "   孔径后，改 geom.py 的 DOWEL_D 重出木板 A。",
        "",
        "用量：木板 3 mm 600 × 400 两张；",
        "表皮 1 mm 1000 × 500 一张（或 75 宽长条约 4.7 m",
        "加两条 12 × 546）；蜡线约 4 m；Ø10 木圆棒一根。",
    ], size=2.1, lead=4.6)


# ---- 页 7：装配与材料 -----------------------------------------------------------------
def page_assembly(c, fig_dir):
    pp = P(c)
    frame(pp, 7, "07 | 装配顺序与表皮材料",
          "先做芯，再逐个挂单元。上端缝住，把下端往上推到位，中间那段自己朝外折出来，最后拉紧斜线锁形。")
    img = ImageReader(os.path.join(fig_dir, "unit.png"))
    iw, ih = img.getSize()
    w = 104.0
    h = w * ih / iw
    c.drawImage(img, 40, 362 - h, w, h, mask="auto")
    pp.text(26, 362 - h - 5, "U1 单元挂在芯上（只画一个单元）", 2.1, GRAY)
    steps = [
        ("1", "切 T 试件，拿立杆去插，定 P 板中心孔。按第 06 页切两张木板、一张表皮。"),
        ("2", "胶合六个单元（第 05 页）：A 面三片、B 面三片，缝里 9 mm 不涂胶。胶干后从板孔通开表皮孔。每个单元先把两根斜线穿上、不拉紧：从台面靠墙一端那对孔穿进，到底面靠外一端那对孔穿出，线头留在外面。"),
        ("3", "做芯：立杆截 261。四块 P 板套上立杆，两条卡条 J 卡在相对的两条板边上，定出 12 / 90 / 171 / 249 的板距、对齐板边，在立杆处点胶。胶干后拔掉卡条。"),
        ("4", "挂单元：端板 C1 贴在上面两块板的边上，在 s = 90 那块板处缝一针（从端板上孔进、穿过板孔、从下孔出，打结）。单元先直着垂下来。"),
        ("5", "收缩：把 C5 往上推，贴到下面两块板的边上，推到它的孔对上 s = 171 那块板，缝一针。中间那段会朝外折出来：H1 / H4 朝 A 面、H2 / H3 朝 B 面。"),
        ("6", "锁形：直角卡板 G 一条腿贴墙、一条腿压在台面上，把台面托平，拉紧两根斜线在底面外侧打结，拿走 G。六个单元逐个装。"),
        ("7", "上箍带：两条 S 带绕在最上、最下两块板的高度，收紧，搭接 20，缝两针或用胶固定。"),
        ("8", "立起来：立杆和六个单元的下端一起落桌。箱子要是往上翘，再穿预留的 BD 斜线。"),
    ]
    y = 352.0
    pp.text(160, y + 4, "装配顺序", 2.8)
    for n, s in steps:
        pp.circle(163, y - 3.2, 2.4, stroke=None, fill=TEAL)
        pp.text(163, y - 4.0, n, 2.3, HexColor("#ffffff"), "c")
        lines = wrap(s, 400, 2.2)
        pp.para(169, y - 4.0, lines, size=2.2, lead=4.2)
        y -= 4.2 * len(lines) + 3.8
    pp.text(160, y - 2, "拍照前确认卡条 J、卡板 G 都拿走了。形状不对时先松斜线重新托平，不要硬拉表皮。", 2.1, RED)

    pp.text(26, 172, "表皮材料对比（1 mm 厚，静态演示用）", 2.8)
    rows = [("材料", "气味", "怎么切", "和木板怎么粘", "用在这个模型"),
            ("原橡胶片", "大", "刀模 / 手工；含氯配方不能激光", "万能胶（接触胶）", "能用，味道问题不解决"),
            ("硅胶片（推荐）", "几乎没有", "美工刀、打孔器；可激光，切口有白粉", "中性硅酮胶；难粘，先试粘", "外观手感最接近橡胶，有弹性"),
            ("书皮布 / 装裱布", "没有", "剪刀、激光", "白乳胶", "最省事，静态够用，没有弹性"),
            ("EVA 片", "轻微", "美工刀；可激光", "万能胶、双面胶", "便宜，偏软，看起来像泡沫"),
            ("TPU 片", "小", "美工刀；不建议激光（受热分解产生氰化氢）", "万能胶", "有 3D 打印机可直接打带孔的片"),
            ]
    pp.table(26, 166, [36, 20, 90, 64, 70], rows, rh=7.0, size=2.15)
    panel(pp, 316, 40, 256, 132)
    pp.text(321, 164, "硅胶片怎么买、怎么粘", 2.6)
    pp.para(321, 156, [
        "买：搜“硅胶板 1mm 食品级”，选邵氏 40–50A、无味、透明或浅色；",
        "尺寸 1000 × 500 一张够全部表皮和箍带。有的店能按 DXF 激光切或模切。",
        "",
        "粘：硅胶表面能很低，普通万能胶、白乳胶、瞬干胶都粘不牢。",
        "用单组分中性硅酮胶（中性玻璃胶），薄刮一层在木板上，贴上压平，",
        "室温放一天。酸性玻璃胶固化时有醋味，选“中性”。",
        "要更牢，在木板一侧先刷硅胶专用底涂剂再上胶。",
        "",
        "先做试样：一块边角木板 + 一条硅胶，粘好放一天，",
        "手撕不下来再批量做。粘不住就改用书皮布，图纸尺寸不变。",
        "",
        "橡胶要继续用的话，买之前问清是不是氯丁 / 再生胶，",
        "这两种味道最重；拆封后通风放几天，味道会淡一些。",
    ], size=2.1, lead=4.4)
    pp.para(26, 120, [
        "为什么这里可以换掉橡胶：",
        "形状由芯和斜线定住，表皮不承担回弹，",
        "所以只需要能弯折、能粘、没有味道。",
        "以后要做“拉一下就成形”的实验，表皮要有弹性，",
        "那时硅胶仍然能用，布和 EVA 就不行了。",
    ], size=2.1, lead=4.4)


# ---- 入口 ----------------------------------------------------------------------------
def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    fig_dir = tempfile.mkdtemp(prefix="ring6-fig-")      # 渲染图只嵌进 PDF，不留在输出目录
    im, _ = R.render(R.build_ring(), az=-14.0, el=22.0, px_per_mm=5.0)
    im.save(os.path.join(fig_dir, "iso.png"))
    im2, _ = R.render(R.build_ring(units=[0], hoops=False), az=-62.0, el=12.0, px_per_mm=6.0)
    im2.save(os.path.join(fig_dir, "unit.png"))

    cat = G.parts_catalog()
    report = {}
    for name, nest, sheet in [("wood_A", G.NEST_WOOD[0], G.SHEET_WOOD),
                              ("wood_B", G.NEST_WOOD[1], G.SHEET_WOOD),
                              ("skin", G.NEST_SKIN, G.SHEET_SKIN)]:
        CF.write_dxf(os.path.join(out_dir, f"{name}.dxf"), nest, cat, sheet)
        CF.write_svg(os.path.join(out_dir, f"{name}.svg"), nest, cat, sheet)
        report[name] = CF.check_sheet(os.path.join(out_dir, f"{name}.dxf"), sheet)
        r = report[name]
        assert r["bounds_ok"] and r["overlap_px"] == 0 and r["gap_violation_px"] == 0 \
            and r["holes"] == r["holes_inside_parts"], (name, r)
    from collections import Counter
    cnt = Counter(k for sh in G.NEST_WOOD for k, *_ in sh) + Counter(k for k, *_ in G.NEST_SKIN)
    for k, v in cat.items():
        assert cnt[k] == v["qty"], (k, cnt[k], v["qty"])

    pdf = os.path.join(out_dir, "P2-SKIN-RING6-01_六单元环_v2.pdf")
    c = canvas.Canvas(pdf, pagesize=(PAGE_W * MM, PAGE_H * MM))
    c.setTitle("项目二 六单元环静态演示模型 | P2-SKIN-RING6-01 v2")
    c.setSubject("6 × P2-SKIN-01 v3 units held by a core and diagonal bonds; mm; physical validation pending")
    c.setAuthor("Project II / P2-SKIN-RING6-01")
    for fn in (lambda: page_overview(c, fig_dir), lambda: page_section(c), lambda: page_wood(c),
               lambda: page_skin(c), lambda: page_laminate(c), lambda: page_nest(c),
               lambda: page_assembly(c, fig_dir)):
        c.saveState()
        c.scale(MM, MM)
        c.setFillColor(HexColor("#ffffff"))
        c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
        fn()
        c.restoreState()
        c.showPage()
    c.save()
    return pdf, report


if __name__ == "__main__":
    pdf, rep = main(sys.argv[1])
    print(pdf)
    for k, v in rep.items():
        print(k, v)
