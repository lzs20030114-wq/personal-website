"""六单元环静态演示模型：出 PDF 图纸 + DXF / SVG 切割文件。

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


# ---- 剖面绘制（r, s）→ 页面 -------------------------------------------------------
def draw_unit_section(pp, ox, oy, sc, side=1, labels=True, ties=True, rib=True, plates=True, hoops=True):
    """单元过肋中面的剖面。ox = r=0 的页面 x，oy = s=0 的页面 y；side=-1 画在轴的左边。"""
    X = lambda r: ox + side * r * sc
    Y = lambda s: oy - s * sc

    def box(r0, r1, s0, s1, **kw):
        pp.poly([(X(r0), Y(s0)), (X(r1), Y(s0)), (X(r1), Y(s1)), (X(r0), Y(s1))], **kw)

    if rib:
        pp.poly([(X(r), Y(s)) for r, s in G.rib_outline_rs()], stroke=INK, fill=CORE, w=0.25)
        for t in G.TIES:
            r, s = t["rib_hole"]
            pp.circle(X(r), Y(s), G.RIB_HOLE_D / 2 * sc, stroke=INK, fill=HexColor("#ffffff"), w=0.18)
    if plates:
        for sp in G.PLATE_S:
            box(G.CENTER_HOLE / 2, G.SLOT_MID, sp - G.T_BOARD / 2, sp + G.T_BOARD / 2,
                stroke=INK, fill=CORE, w=0.25)
    for name, (r0, r1, s0, s1) in G.BOARDS_FOLDED.items():
        box(r0, r1, s0, s1, stroke=INK, fill=WOOD, w=0.25)
    for name, rects in G.SKIN_FOLDED.items():
        a = name.startswith("A")
        for r0, r1, s0, s1 in rects:
            box(r0, r1, s0, s1, stroke=SKIN_A_S if a else SKIN_B_S, fill=SKIN_A if a else SKIN_B, w=0.12)
    if hoops:
        for sp in G.PLATE_S:
            box(G.OUTER_WALL, G.OUTER_WALL + 1, sp - G.HOOP_W / 2, sp + G.HOOP_W / 2,
                stroke=None, fill=HOOP_C)
    if ties:
        for t in G.TIES:
            _, r, s = G.fold_map(t["flat_x"])
            hr, hs = t["rib_hole"]
            if t["board"] == "C3":
                pts = [(G.OUTER_FRONT + 0.6, s), (hr, s)]
            elif t["board"] == "C2":
                pts = [(r, G.PLATFORM_TOP_S - 0.6), (r, hs)]
            else:
                pts = [(r, G.PLATFORM_BOT_S + 0.6), (r, hs)]
            pp.poly([(X(a), Y(b)) for a, b in pts], stroke=RED, w=0.35, close=False)
    if labels:
        for name, (r0, r1, s0, s1) in G.BOARDS_FOLDED.items():
            rm, sm = (r0 + r1) / 2, (s0 + s1) / 2
            if name in ("C1", "C5"):
                pp.text(X(r1) + side * 3.0, Y(sm), name, 2.4, INK, "l" if side > 0 else "r")
            elif name == "C3":
                pp.text(X(r1) + side * 3.0, Y(sm), name, 2.4, INK, "l" if side > 0 else "r")
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


# ---- 页 1：总览 ----------------------------------------------------------------------
def page_overview(c, fig_dir):
    pp = P(c)
    frame(pp, 1, "01 | 总览：六个 v3 单元竖着围成一圈，凹槽朝外翻成挑台",
          "单元沿用 P2-SKIN-01 v3，五块板、5 mm 接缝、两面表皮的分段都不改；只在 C2 / C3 / C4 中点加了绑线孔。")
    img = ImageReader(os.path.join(fig_dir, "iso.png"))
    iw, ih = img.getSize()
    w = 238.0
    h = w * ih / iw
    c.drawImage(img, 26, 362 - h, w, h, mask="auto")
    pp.text(26, 362 - h - 5, "轴测示意：深色窄带是上下两道箍带；台面、底面和正面上的黑色短线是绑线露在外面的一针。", 2.1, GRAY)

    # 平面 1:2
    cx, cy, sc = 405.0, 279.0, 0.5
    pp.text(305, 365, "平面 1:2（从上往下看；虚线 = 被挡住的六边形板与定型肋）", 2.5)
    rv = G.APO / math.cos(math.pi / 6)
    hexp = [(cx + rv * sc * math.cos(k * math.pi / 3 + math.pi / 6), cy + rv * sc * math.sin(k * math.pi / 3 + math.pi / 6))
            for k in range(6)]
    pp.poly(hexp, stroke=GRAY, w=0.2, dash=(1.2, 0.8))
    pp.circle(cx, cy, math.hypot(G.OUTER_FRONT, G.W / 2) * sc, stroke=LIGHT, w=0.18)
    hoop = G.HOOP["pts"]
    pp.poly([(cx + x * sc, cy + y * sc) for x, y in hoop], stroke=HOOP_C, w=0.5)
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
        pp.poly([P2(G.R_IN, 0), P2(G.TAB_FRONT, 0)], stroke=GRAY, w=0.2, dash=(1.2, 0.8), close=False)
        lx, ly = P2((G.OUTER_WALL + G.OUTER_FRONT) / 2, 0)
        pp.text(lx, ly - 1, f"U{k + 1}", 2.6, INK, "c")
    # 标注
    yb = cy - G.OUTER_FRONT * sc
    pp.dimh(cx - G.OUTER_FRONT * sc, cx + G.OUTER_FRONT * sc, cy, yb - 10,
            f"{2 * G.OUTER_FRONT:.0f}（正面到正面）", above=False)
    rr = math.hypot(G.OUTER_FRONT, G.W / 2)
    a150 = math.radians(150)
    pp.text(cx + (rr * sc + 3) * math.cos(a150), cy + (rr * sc + 3) * math.sin(a150),
            f"外接圆 Ø{2 * rr:.0f}", 2.2, TEAL, "r")
    xw = cx + G.OUTER_FRONT * sc
    pp.dimv(cy - G.W / 2 * sc, cy + G.W / 2 * sc, xw, xw + 8, "75", left=False)
    pp.text(cx, cy - 3.5, "环轴", 2.0, GRAY, "c")

    sm = G.summary()
    rows = [("关键尺寸", "数值"),
            ("整体外接圆", f"Ø{2 * sm['corner_radius']:.0f}"),
            ("总高（肋）", f"{G.RIB_H:.0f}"),
            ("单元折后高", f"{sm['unit_height']:.0f}（离桌 2）"),
            ("台面离桌", f"{sm['platform_top_z']:.1f}"),
            ("挑出（墙外表面起）", f"{sm['protrusion']:.1f}"),
            ("箱高（外）", f"{sm['box_height']:.0f}"),
            ("单元间缝", f"{sm['wall_gap_inner']:.1f}（内）/ {sm['wall_gap_outer']:.1f}（外）")]
    pp.table(500, 352, [44, 28], rows, rh=6.0, size=2.1)

    bom = [("编号", "名称", "尺寸 mm", "数量", "材料", "说明"),
           ("C1 / C5", "端板", "101 × 75", "12", "木板 3", "墙段，上下各一"),
           ("C2 / C4", "台面 / 台底", "67.5 × 75", "12", "木板 3", "中点 2 个 Ø2 线孔"),
           ("C3", "正面", "43 × 75", "6", "木板 3", "中点 2 个 Ø2 线孔"),
           ("R", "定型肋", "132 × 263", "6", "木板 3", "3 个 Ø3 线孔、2 道插槽"),
           ("P", "六边形板", "边心距 72", "2", "木板 3", "6 道插槽、中心 Ø10（可不切）"),
           ("T", "槽宽试件", "70 × 20", "1", "木板 3", "先切，定插槽宽"),
           ("A1 / A3", "外表皮", "173.5 × 75", "12", "表皮 1", "跨 H1 / H4，2 个 Ø2 孔"),
           ("A2", "外表皮", "43 × 75", "6", "表皮 1", "2 个 Ø2 孔"),
           ("B1 / B3", "内表皮", "101 × 75", "12", "表皮 1", "无孔"),
           ("B2", "内表皮", "188 × 75", "6", "表皮 1", "跨 H2 / H3，6 个 Ø2 孔"),
           ("S", "箍带", f"{G.HOOP_W:.0f} × {G.HOOP_L}", "2", "表皮 1", f"搭接 {G.HOOP_LAP:.0f}，长度现场收"),
           ("—", "绑线", "Ø0.5–0.8 蜡线", "18 处", "—", "每单元 C2 / C3 / C4 各一处")]
    pp.text(305, 183, "零件清单（木板 38 件，表皮 38 件）", 2.6)
    pp.table(305, 179, [20, 22, 28, 14, 16, 167], bom, rh=6.2, size=2.15)

    panel(pp, 26, 40, 238, 52)
    pp.para(31, 85, [
        "六个单元一样，各自先按 v3 平铺胶合，再折成下凹槽形，竖着排成一圈，槽口朝里、方箱朝外，",
        "方箱的上表面就是挑台的台面。一圈六个台面读作一圈环形平台，对应 Lab 2-5 圆筒环收缩后的形态。",
        "每个单元背后一片定型肋，肋舌伸进方箱撑住 C2 / C3 / C4，三处绑线把三块板拉在肋上；",
        "六片肋插在上下两块六边形板上，板边托住端板 C1 / C5，两道箍带把六个单元的端板收在板边上。",
        "模型是静态的：形状由肋给定，不靠表皮回弹，也不做收缩动作。肋的下缘落桌，单元悬空 2 mm。",
    ], size=2.25, lead=4.6)
    pp.text(31, 51, "单元之间留缝：六边形边长 83.1，单元宽 75，内表面处缝 8.1。缝随半径变大，到方箱正面约 101，环上台面不连续。", 2.1, GRAY)


# ---- 页 2：剖面 ----------------------------------------------------------------------
def page_section(c):
    pp = P(c)
    frame(pp, 2, "02 | 剖面：过定型肋中面，1:1",
          "折后位置按理想铰点推算（每道缝绕凹侧表面、缝宽中点转 90°）。实物会差 1–2 mm，由肋和绑线定死。")
    ox, oy, sc = 52.0, 330.0, 1.0
    X, Y = draw_unit_section(pp, ox, oy, sc)
    pp.text(22, 366, "单元 U1 剖面 1:1", 2.6)
    # 轴线
    pp.line(ox, oy + 3, ox, Y(G.RIB_H) - 3, GRAY, 0.2, dash=(4, 1, 1, 1))
    pp.text(ox - 1.5, Y(G.RIB_H) - 6, "环轴", 2.0, GRAY, "c")
    # 桌面
    pp.line(ox - 8, Y(G.RIB_H), X(G.OUTER_FRONT) + 10, Y(G.RIB_H), INK, 0.4)
    pp.text(X(G.OUTER_FRONT) + 12, Y(G.RIB_H) - 0.8, "桌面", 2.0, GRAY)
    # 竖向尺寸（右）
    xr = X(G.OUTER_FRONT) + 10
    pp.dimv(Y(0), Y(G.RIB_H), X(G.OUTER_FRONT), xr + 26, f"{G.RIB_H:.0f} 肋高 = 总高", left=False)
    pp.dimv(Y(G.PLATFORM_TOP_S), Y(G.RIB_H), X(G.OUTER_FRONT), xr + 14,
            f"{G.RIB_H - G.PLATFORM_TOP_S:.1f} 台面离桌", left=False)
    pp.dimv(Y(G.PLATFORM_TOP_S), Y(G.PLATFORM_BOT_S), X(G.OUTER_FRONT), xr + 3,
            f"{G.PLATFORM_BOT_S - G.PLATFORM_TOP_S:.0f}", left=False)
    pp.dimv(Y(G.UNIT_H), Y(G.RIB_H), X(G.APO), X(G.APO) + 12, "2", left=False, ext=False)
    pp.text(X(G.APO) + 15, Y(G.RIB_H) + 0.5, "单元悬空", 1.9, GRAY)
    # 竖向尺寸（左）：板位
    xl = ox - 14
    for sp in G.PLATE_S:
        pp.text(ox + 1.5, Y(sp) + 2.6, "P", 2.2, INK)
    pp.dimv(Y(0), Y(G.PLATE_S[0]), ox, xl, f"{G.PLATE_S[0]:.0f}")
    pp.dimv(Y(G.PLATE_S[1]), Y(G.RIB_H), ox, xl, f"{G.RIB_H - G.PLATE_S[1]:.0f}")
    pp.text(xl - 4, Y(130), "P 板与 S 箍带同高", 2.0, GRAY, "c", rot=90)
    # 横向尺寸（上）
    yt = oy + 18
    pp.dimh(ox, X(G.APO), oy, yt, f"{G.APO:.0f}")
    pp.dimh(X(G.APO), X(G.OUTER_WALL), oy, yt, "5", ext=True)
    pp.dimh(X(G.OUTER_WALL), X(G.OUTER_FRONT), Y(G.PLATFORM_TOP_S), yt, f"{G.OUTER_FRONT - G.OUTER_WALL:.1f} 挑出")
    pp.dimh(ox, X(G.OUTER_FRONT), oy, yt + 9, f"{G.OUTER_FRONT:.1f}")
    # 层次说明
    pp.text(X(G.OUTER_WALL) + 3, Y(60), "A 外表皮 1", 2.0, SKIN_A_S)
    pp.text(X(G.APO) + 1, Y(70), "B", 2.0, SKIN_B_S)
    pp.text(X(100), Y(G.TAB_TOP + 22), "R 定型肋（肋舌）", 2.1, INK, "c")
    pp.text(X(100), Y(G.TAB_TOP + 26), "让表皮 0.5", 1.9, GRAY, "c")
    pp.text(X(36), Y(160), "R", 2.4, INK, "c")
    pp.text(X(G.OUTER_WALL) + 3, Y(G.PLATE_S[0]) + 7.5, "S 箍带", 2.0, HOOP_C)
    pp.text(X(G.OUTER_FRONT) + 3, Y(118), "红线 = 绑线", 1.9, RED)

    # A–A 1:2
    cx, top, s2 = 452.0, 352.0, 0.5
    pp.text(330, top + 7, "A–A 剖面 1:2（过 U1 与 U4 的肋中面）", 2.6)
    draw_unit_section(pp, cx, top, s2, side=1, labels=False)
    draw_unit_section(pp, cx, top, s2, side=-1, labels=False)
    pp.line(cx, top + 3, cx, top - G.RIB_H * s2 - 3, GRAY, 0.2, dash=(4, 1, 1, 1))
    pp.line(cx - 90, top - G.RIB_H * s2, cx + 90, top - G.RIB_H * s2, INK, 0.35)
    pp.text(cx + G.OUTER_FRONT * s2 + 2, top - 60 * s2, "U1", 2.4)
    pp.text(cx - G.OUTER_FRONT * s2 - 2, top - 60 * s2, "U4", 2.4, INK, "r")
    pp.dimh(cx - G.OUTER_FRONT * s2, cx + G.OUTER_FRONT * s2, top - G.RIB_H * s2, top - G.RIB_H * s2 - 9,
            f"{2 * G.OUTER_FRONT:.0f}", above=False)

    # 绑线详图 4:1
    dx, dy, s4 = 364.0, 160.0, 4.0
    panel(pp, 300, 40, 128, 148)
    pp.text(305, 181, "绑线详图 4:1（C2 处，顺着 r 方向看）", 2.4)
    hw = 13.0
    # 层：从上到下 A 1、板 3、B 1；肋从 B 下面 0.5 起
    def rr(t0, t1, z0, z1, **kw):
        pp.poly([(dx + t0 * s4, dy - z0 * s4), (dx + t1 * s4, dy - z0 * s4),
                 (dx + t1 * s4, dy - z1 * s4), (dx + t0 * s4, dy - z1 * s4)], **kw)
    rr(-hw, hw, 0, 1, stroke=SKIN_A_S, fill=SKIN_A, w=0.2)
    rr(-hw, hw, 1, 4, stroke=INK, fill=WOOD, w=0.25)
    rr(-hw, hw, 4, 5, stroke=SKIN_B_S, fill=SKIN_B, w=0.2)
    rr(-1.5, 1.5, 5.5, 14, stroke=INK, fill=CORE, w=0.25)
    for tt in (-G.TIE_DY, G.TIE_DY):
        rr(tt - G.HOLE_D / 2, tt + G.HOLE_D / 2, 0, 5, stroke=None, fill=HexColor("#ffffff"))
        pp.line(dx + (tt - 1) * s4, dy, dx + (tt - 1) * s4, dy - 5 * s4, INK, 0.15)
        pp.line(dx + (tt + 1) * s4, dy, dx + (tt + 1) * s4, dy - 5 * s4, INK, 0.15)
    zc = 5.5 + G.RIB_HOLE_INSET
    for zz in (zc - G.RIB_HOLE_D / 2, zc + G.RIB_HOLE_D / 2):
        pp.line(dx - 1.5 * s4, dy - zz * s4, dx + 1.5 * s4, dy - zz * s4, INK, 0.15, dash=(0.8, 0.6))
    pp.poly([(dx - 4 * s4, dy + 1.2), (dx - 4 * s4, dy - (zc - 0.4) * s4),
             (dx + 4 * s4, dy - (zc - 0.4) * s4), (dx + 4 * s4, dy + 1.2), (dx - 4 * s4, dy + 1.2)],
            stroke=RED, w=0.45, close=False)
    pp.circle(dx + 4 * s4, dy + 1.2, 0.9, stroke=None, fill=RED)
    pp.dimh(dx - 4 * s4, dx + 4 * s4, dy, dy + 9, "8（两孔各离中心线 4）")
    pp.dimv(dy - 5.5 * s4, dy - zc * s4, dx + 1.5 * s4, dx + 6 * s4 + 18, "5", left=False)
    pp.text(dx - hw * s4 - 2, dy - 0.8 * s4, "A", 2.0, SKIN_A_S, "r")
    pp.text(dx - hw * s4 - 2, dy - 2.8 * s4, "C2", 2.0, INK, "r")
    pp.text(dx - hw * s4 - 2, dy - 4.8 * s4, "B", 2.0, SKIN_B_S, "r")
    pp.text(dx + 2.5 * s4, dy - (zc + 2.6) * s4, "肋孔 Ø3", 2.0, INK)
    pp.text(dx + 2.5 * s4, dy - 11 * s4, "R 肋 3", 2.0)
    pp.para(305, 82, ["线从 A 面一孔穿进，穿过肋孔（Ø3，离肋舌边 5），",
                      "从另一孔穿出，在 A 面打结，外面只露 8 mm 一针。",
                      "C3 与 C4 同样做法，肋孔分别离肋舌正面、下缘 5。",
                      "线用 Ø0.5–0.8 蜡线或钓鱼线，拉到板贴住肋即可。"], size=2.1, lead=4.2)

    # 插接详图
    panel(pp, 438, 40, 134, 148)
    pp.text(443, 181, "肋与六边形板的插接（十字半槽）", 2.4)
    s3 = 1.0
    bx, by = 450.0, 170.0
    # 板：俯视一角，一条槽
    pw = 60
    pp.poly([(bx, by), (bx + pw * s3, by), (bx + pw * s3, by - 40 * s3), (bx, by - 40 * s3)],
            stroke=INK, fill=CORE, w=0.25)
    sx = bx + pw * s3 / 2
    depth = G.APO - G.SLOT_MID
    pp.poly([(sx - G.SLOT / 2 * s3, by - 40 * s3), (sx - G.SLOT / 2 * s3, by - (40 - depth) * s3),
             (sx + G.SLOT / 2 * s3, by - (40 - depth) * s3), (sx + G.SLOT / 2 * s3, by - 40 * s3)],
            stroke=INK, fill=HexColor("#ffffff"), w=0.25)
    pp.text(bx, by + 2.5, "P 板（俯视），槽从板边开口", 2.0, GRAY)
    pp.dimv(by - 40 * s3, by - (40 - depth) * s3, sx + 2.5, sx + 10, f"{depth:.1f}", left=False)
    pp.text(sx, by - 40 * s3 - 4.5, f"槽宽 {G.SLOT:.1f}", 2.0, TEAL, "c")
    # 肋：立面一段，一道槽从内缘开口
    rx, ry = 450.0, 118.0
    ribw = (G.APO - G.R_IN)
    pp.poly([(rx, ry), (rx + ribw * s3, ry), (rx + ribw * s3, ry - 30 * s3), (rx, ry - 30 * s3)],
            stroke=INK, fill=CORE, w=0.25)
    nd = G.SLOT_MID - G.R_IN
    yc = ry - 15 * s3
    pp.poly([(rx, yc + G.SLOT / 2 * s3), (rx + nd * s3, yc + G.SLOT / 2 * s3),
             (rx + nd * s3, yc - G.SLOT / 2 * s3), (rx, yc - G.SLOT / 2 * s3)],
            stroke=INK, fill=HexColor("#ffffff"), w=0.25)
    pp.text(rx, ry + 2.5, "R 肋（立面），槽从肋内缘开口", 2.0, GRAY)
    pp.dimh(rx, rx + nd * s3, ry - 30 * s3, ry - 30 * s3 - 6, f"{nd:.1f}", above=False)
    pp.para(443, 72, [f"两边各开一半深（{nd:.1f} + {depth:.1f} = {G.APO - G.R_IN:.0f}），肋从外往里推进板槽。",
                                "六片肋插好后由箍带往里压住，不用胶。",
                                "槽宽按 T 试件实测定：哪条槽插进同批木板",
                                "不松不紧，就按那个宽度重出全部插槽。"], size=2.05, lead=4.2)


# ---- 页 3：木板零件 -------------------------------------------------------------------
def page_wood(c):
    pp = P(c)
    cat = G.parts_catalog()
    frame(pp, 3, "03 | 木板零件 1:1：3 mm 木板，共 38 件",
          "建议 3 mm 椴木层板激光切。C1–C5 只是在 v3 的纸板上加了线孔，尺寸不变。")
    # 肋
    rib = cat["RIB"]
    ox, oy = 44.0, 352.0
    draw_part(pp, rib, ox, oy, fill=CORE)
    pp.text(ox - 18, oy + 17, "R 定型肋 × 6", 2.8)
    rx = lambda r: ox + (r - G.R_IN)
    sy = lambda s: oy - s
    pp.dimh(rx(G.R_IN), rx(G.APO), oy, oy + 2.5, f"{G.APO - G.R_IN:.0f}")
    pp.dimh(rx(G.R_IN), rx(G.TAB_FRONT), sy(G.TAB_TOP), oy + 11, f"{G.TAB_FRONT - G.R_IN:.0f}")
    pp.dimv(sy(0), sy(G.RIB_H), rx(G.R_IN), rx(G.R_IN) - 14, f"{G.RIB_H:.0f}")
    pp.dimv(sy(0), sy(G.PLATE_S[0]), rx(G.R_IN), rx(G.R_IN) - 6, f"{G.PLATE_S[0]:.0f}")
    pp.dimv(sy(G.PLATE_S[1]), sy(G.RIB_H), rx(G.R_IN), rx(G.R_IN) - 6, f"{G.RIB_H - G.PLATE_S[1]:.0f}")
    xr = rx(G.TAB_FRONT)
    pp.dimv(sy(0), sy(G.TAB_TOP), xr, xr + 10, f"{G.TAB_TOP:.0f}", left=False)
    pp.dimv(sy(G.TAB_TOP), sy(G.TAB_BOT), xr, xr + 10, f"{G.TAB_BOT - G.TAB_TOP:.0f}", left=False)
    pp.dimv(sy(G.TAB_BOT), sy(G.RIB_H), xr, xr + 10, f"{G.RIB_H - G.TAB_BOT:.0f}", left=False)
    pp.text(rx(G.SLOT_MID) + 2, sy(G.PLATE_S[0]) - 6, f"槽 {G.SLOT:.0f} × {G.SLOT_MID - G.R_IN:.1f}", 2.0, TEAL)
    pp.text(rx(G.SLOT_MID) + 2, sy(G.PLATE_S[1]) + 3.5, f"槽 {G.SLOT:.0f} × {G.SLOT_MID - G.R_IN:.1f}", 2.0, TEAL)
    pp.text(xr - 2, sy(G.TAB_TOP) - 3.5, f"倒角 {G.CHAMFER:.0f}", 1.9, TEAL, "r")
    for i, t in enumerate(G.TIES):
        r, s = t["rib_hole"]
        pp.text(rx(r) + 2.2, sy(s) - 0.7, f"h{i + 1}", 1.9, RED)
    pp.text(rx(G.R_IN) + 2, sy(185), "内缘（朝环轴）", 1.9, GRAY, rot=90)
    pp.text(rx(G.APO) - 2, sy(220), "外缘，贴 B 表皮", 1.9, GRAY, "l", rot=90)
    hole_rows = [("肋孔 Ø3", "离内缘", "离顶端")] + \
        [(f"h{i + 1}（{t['board']}）", f"{t['rib_hole'][0] - G.R_IN:.2f}", f"{t['rib_hole'][1]:.1f}")
         for i, t in enumerate(G.TIES)]
    pp.table(44, 76, [30, 22, 22], hole_rows, rh=5.6, size=2.0)

    # 六边形板
    pl = cat["PLATE"]
    px0, py0 = 214.0, 352.0
    draw_part(pp, pl, px0, py0, fill=CORE)
    pp.text(px0, py0 + 13, "P 六边形板 × 2", 2.8)
    pp.dimh(px0, px0 + pl["w"], py0 - pl["h"] / 2, py0 + 5, f"{pl['w']:.1f}（对角）")
    pp.dimv(py0, py0 - pl["h"], px0 + pl["w"], px0 + pl["w"] + 9, f"{pl['h']:.0f}（对边 = 2 × 72）", left=False)
    pp.text(px0 + pl["w"] / 2, py0 - pl["h"] / 2 - 9, f"Ø{G.CENTER_HOLE:.0f}（可不切）", 2.0, TEAL, "c")
    pp.text(px0 + pl["w"] / 2, py0 - 9, f"6 道槽 {G.SLOT:.0f} × {G.APO - G.SLOT_MID:.1f}，在每条边中点", 2.0, TEAL, "c")

    # 板件
    y0 = 186.0
    specs = [("C1", "C1 / C5 × 12", 214.0), ("C2", "C2 / C4 × 12", 333.0), ("C3", "C3 × 6", 418.0)]
    for key, label, x0 in specs:
        p = cat[key]
        draw_part(pp, p, x0, y0)
        pp.text(x0, y0 + 6, label, 2.8)
        pp.dimh(x0, x0 + p["w"], y0 - W_(p), y0 - W_(p) - 7, f"{p['w']:g}", above=False)
        pp.dimv(y0, y0 - p["h"], x0, x0 - 6, "75")
        if p["holes"]:
            hx = p["holes"][0][0]
            pp.dimh(x0, x0 + hx, y0, y0 + 2.5, f"{hx:g}")
            pp.text(x0 + hx + 2, y0 - G.TIE_Y[0] + 3.2, f"2 × Ø{G.HOLE_D:.0f}，距中心线 ±{G.TIE_DY:.0f}", 1.9, TEAL)
    comb = cat["COMB"]
    cx0, cy0 = 490.0, 186.0
    draw_part(pp, comb, cx0, cy0, fill=CORE)
    pp.text(cx0, cy0 + 6, "T 槽宽试件 × 1", 2.8)
    for i, sw in enumerate(comb["widths"]):
        pp.text(cx0 + 10 + i * 12.5, cy0 - 14.5, f"{sw:.1f}", 1.8, TEAL, "c")
    pp.text(cx0, cy0 - 26, "从左到右 2.8 / 2.9 / 3.0 / 3.1 / 3.2", 1.9, GRAY)

    panel(pp, 214, 40, 358, 48)
    pp.para(219, 81, [
        "全部零件在同一张 3 mm 板上切；插槽宽按实测板厚，同一批板先切 T 试件，用一块边角料去插，",
        "选不松不紧的那条，再按那个宽度出全部插槽（3 mm 椴木层板实测常在 2.8–3.1 之间）。",
        "C2 与 C4 是同一个零件，C1 与 C5 也是。板上的 Ø2 孔与表皮上的孔要对齐，建议表皮贴好后用 Ø2 钻头从板孔里再通一遍。",
        "肋只在 r–s 平面受力，纹理方向没有要求；层板正反面都可以朝外。",
    ], size=2.15, lead=4.5)


def W_(p):
    return p["h"]


# ---- 页 4：表皮零件 -------------------------------------------------------------------
def page_skin(c):
    pp = P(c)
    cat = G.parts_catalog()
    frame(pp, 4, "04 | 表皮零件 1:1：1 mm 表皮，共 38 件",
          "分段与 v3 相同，只加了 Ø2 线孔；全部是 75 宽的矩形，可以先裁 75 宽长条再截断。")
    y1 = 352.0
    items = [("A1", "A1 / A3 × 12", 26.0, SKIN_A, SKIN_A_S),
             ("A2", "A2 × 6", 222.0, SKIN_A, SKIN_A_S),
             ("B2", "B2 × 6", 290.0, SKIN_B, SKIN_B_S)]
    for key, label, x0, fill, stroke in items:
        p = cat[key]
        draw_part(pp, p, x0, y1, fill=fill, stroke=stroke)
        pp.text(x0, y1 + 6, label, 2.8)
        pp.dimh(x0, x0 + p["w"], y1 - 75, y1 - 82, f"{p['w']:g}", above=False)
        pp.dimv(y1, y1 - 75, x0, x0 - 6, "75")
        xs = sorted({h[0] for h in p["holes"]})
        prev = 0.0
        for k, hx in enumerate(xs):
            pp.dimh(x0 + prev, x0 + hx, y1, y1 + 2.5 + 0 * k, f"{hx - prev:g}")
            prev = hx
    pp.text(26, y1 - 92, "A1 的孔靠 C2 一端（离 C1 端 139.75）；A3 是同一个零件掉个头。", 2.1, RED)
    pp.text(26 + 173.5 - 2, y1 - 40, "C2 端", 2.0, GRAY, "r")
    pp.text(28, y1 - 40, "C1 端", 2.0, GRAY)
    pp.text(222, y1 - 92, f"孔位 y：{G.TIE_Y[0]:g} / {G.TIE_Y[1]:g}（距中心线 ±{G.TIE_DY:g}）", 2.1, TEAL)

    y2 = 238.0
    p = cat["B1"]
    draw_part(pp, p, 26.0, y2, fill=SKIN_B, stroke=SKIN_B_S)
    pp.text(26, y2 + 6, "B1 / B3 × 12（无孔）", 2.8)
    pp.dimh(26, 127, y2 - 75, y2 - 82, "101", above=False)
    pp.dimv(y2, y2 - 75, 26, 20, "75")

    h = cat["HOOP"]
    hy = 132.0
    draw_part(pp, h, 26.0, hy, fill=SKIN_A, stroke=SKIN_A_S)
    pp.text(26, hy + 6, f"S 箍带 × 2：{G.HOOP_W:g} × {G.HOOP_L}", 2.8)
    pp.dimh(26, 26 + G.HOOP_L, hy - G.HOOP_W, hy - G.HOOP_W - 7, f"{G.HOOP_L}", above=False)
    pp.dimh(26, 26 + G.HOOP_LAP, hy, hy + 2.5, f"{G.HOOP_LAP:g} 搭接")
    pp.text(26, hy - G.HOOP_W - 16, f"箍带在单元外表面上的一圈长 {G.HOOP['perimeter']:.1f}；再加 20 搭接。"
            "用不含弹性的料时按此长度；用硅胶等弹性料时绕一圈收紧后再定搭接位置。", 1.95, GRAY)

    panel(pp, 150, 168, 422, 70)
    pp.text(155, 230, "裁切", 2.6)
    pp.para(155, 223, [
        "表皮零件都是 75 宽的矩形，不一定要找切割厂：在整张 1 mm 片材上先划出 75 宽的长条（钢尺 + 美工刀，",
        "刀片常换），再按长度截断；Ø2 孔用皮带打孔器或空心冲打。一共要 75 宽长条约 4.7 m，S 箍带另裁两条 12 宽。",
        "要用激光切，就用第 06 页的 skin 排版文件（1000 × 500）。含氯的橡胶（氯丁 CR、PVC 类）不能进激光机，",
        "下单前问清片材成分；硅胶片可以激光切，切口会有一层白色粉末，用湿布擦掉。",
        "孔最后再通：表皮贴到板上以后，用 Ø2 钻头或打孔针从板孔里把表皮孔通一遍，两层就一定对齐。",
    ], size=2.15, lead=4.5)
    panel(pp, 26, 40, 546, 56)
    pp.text(31, 89, "表皮选什么", 2.6)
    pp.para(31, 82, [
        "这个模型的形状由定型肋撑住，表皮只需要弯过接缝、看起来是一层皮，不需要回弹。图纸按 1 mm 厚出，换 1 mm 的别的片材尺寸都不用改。",
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
    cat = G.parts_catalog()
    continuous = {"A": [0, 3], "B": [1, 2]}         # 哪几道缝在这一面连续
    for label, ytop, kind in bands:
        pp.text(x0 - 6, ytop - 40, label, 2.6, INK, "r")
        if kind == "C":
            for i, (fx, L) in enumerate(zip(G.FLAT_X, G.LENS)):
                p = G.part_board(f"C{i + 1}")
                draw_part(pp, p, x0 + fx, ytop)
                pp.text(x0 + fx + L / 2, ytop - 30, f"C{i + 1}", 3.0, INK, "c")
                pp.text(x0 + fx + L / 2, ytop - 36, f"{L:g} × 75", 2.0, GRAY, "c")
        else:
            segs = G.SKIN_A if kind == "A" else G.SKIN_B
            fill, stroke = (SKIN_A, SKIN_A_S) if kind == "A" else (SKIN_B, SKIN_B_S)
            for name, (a, b) in segs.items():
                p = G.part_skin(name)
                draw_part(pp, p, x0 + a, ytop, fill=fill, stroke=stroke)
                pp.text(x0 + (a + b) / 2, ytop - 30, name, 3.0, INK, "c")
                pp.text(x0 + (a + b) / 2, ytop - 36, f"{b - a:g} × 75", 2.0, GRAY, "c")
            for j in continuous[kind]:
                gx = G.FLAT_X[j] + G.LENS[j]
                pp.rect(x0 + gx - 2, ytop - 75, 9, 75, stroke=None, fill=FREE)
                pp.rect(x0 + gx - 2, ytop - 75, 9, 75, stroke=TEAL, lw=0.15, dash=(0.8, 0.6))
                pp.text(x0 + gx + 2.5, ytop - 72, "9", 2.0, TEAL, "c")
            # 重画孔（被浅蓝盖住的不会有，孔都不在缝上）
    # 接缝线
    for j in range(4):
        gx = x0 + G.FLAT_X[j] + G.LENS[j] + G.GAP / 2
        pp.line(gx, 345, gx, 78, GRAY, 0.18, dash=(2, 1.2))
        ok_a = j in continuous["A"]
        pp.text(gx, 348, f"H{j + 1}", 2.4, INK, "c")
        pp.text(gx, 72, ("A 连续 / B 断" if ok_a else "B 连续 / A 断"), 2.0, TEAL if ok_a else SKIN_B_S, "c")
    # 顶部坐标
    marks = sorted({0.0, 400.0, *[x for fx, L in zip(G.FLAT_X, G.LENS) for x in (fx, fx + L)]})
    for x in marks:
        pp.line(x0 + x, 352, x0 + x, 356, INK, 0.2)
        pp.text(x0 + x, 357.5, f"{x:g}", 1.9, GRAY, "c", rot=0)
    for t in G.TIES:
        pp.line(x0 + t["flat_x"], 340, x0 + t["flat_x"], 82, RED, 0.12, dash=(0.6, 0.8))
        pp.text(x0 + t["flat_x"], 362.5, f"孔 {t['flat_x']:g}", 1.9, RED, "c")
    pp.text(x0 + 405, 357.5, "← x，从 C1 端量", 1.9, GRAY)
    panel(pp, 26, 36, 546, 30)
    pp.para(31, 60, [
        "胶合：先把五块板按 5 mm 间隙排进一个直尺夹具（两根直尺 + 5 mm 垫片），贴 A 面，翻过来贴 B 面。连续的那一面在缝两侧各退 2 mm 不涂胶，",
        "留出 5 + 2 + 2 = 9 mm 的自由弯折段；断开的那一面表皮端边与板端边齐平，不伸进缝里。表皮按自然长度贴，不预拉。",
        "折：H1 / H4 朝 A 面折（A 在折角里侧），H2 / H3 朝 B 面折（B 在箱子里侧），四道都折 90°，成下凹槽形；槽口朝环轴装。",
    ], size=2.1, lead=4.4)


# ---- 页 6：排版 ----------------------------------------------------------------------
def page_nest(c):
    pp = P(c)
    cat = G.parts_catalog()
    frame(pp, 6, "06 | 切割排版 1:3：木板两张 600 × 400，表皮一张 1000 × 500",
          "本页只是缩小示意；切割用同名 DXF / SVG（1:1，单位 mm，只有闭合轮廓与圆孔）。零件间距 5，板边留 4。")
    sc = 1 / 3

    def sheet(nest, size, ox, oytop, title, fname, fill, stroke):
        w, h = size
        pp.text(ox, oytop + 5, title, 2.6)
        pp.text(ox + w * sc, oytop + 5, fname, 2.0, GRAY, "r")
        pp.rect(ox, oytop - h * sc, w * sc, h * sc, stroke=GRAY, lw=0.2, dash=(1.5, 1))
        for key, x, y, rot, mirror in nest:
            pts, holes = G.place(cat[key], x, y, rot, mirror)
            pp.poly([(ox + px * sc, oytop - py * sc) for px, py in pts], stroke=stroke, fill=fill, w=0.15)
            for hx, hy, d in holes:
                pp.circle(ox + hx * sc, oytop - hy * sc, max(d / 2 * sc, 0.25), stroke=stroke, w=0.1)
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            lab = {"C1": "C1", "C2": "C2", "C3": "C3", "RIB": "R", "PLATE": "P", "COMB": "T",
                   "A1": "A1", "A2": "A2", "B1": "B1", "B2": "B2", "HOOP": "S"}[key]
            if key == "RIB":
                lx = (min(xs) + max(xs)) / 2 + (-30 if not mirror else 30)
                ly = 40 + (50 if mirror else 0)
                pp.text(ox + lx * sc, oytop - (y + 200) * sc, lab, 2.0, INK, "c")
            else:
                pp.text(ox + (min(xs) + max(xs)) / 2 * sc, oytop - ((min(ys) + max(ys)) / 2 + 3) * sc, lab, 2.0, INK, "c")

    sheet(G.NEST_WOOD[0], G.SHEET_WOOD, 26, 358, "木板 A：R × 6，C2 × 7", "wood_A.dxf / .svg", CORE, INK)
    sheet(G.NEST_WOOD[1], G.SHEET_WOOD, 250, 358, "木板 B：P × 2，C1 × 12，C2 × 5，C3 × 6，T × 1", "wood_B.dxf / .svg", WOOD, INK)
    sheet(G.NEST_SKIN, G.SHEET_SKIN, 26, 205, "表皮：A1 × 12，A2 × 6，B1 × 12，B2 × 6，S × 2", "skin.dxf / .svg", SKIN_A, SKIN_A_S)
    panel(pp, 380, 40, 192, 165)
    pp.text(385, 197, "下单时说明", 2.6)
    pp.para(385, 189, [
        "1. 文件单位 mm，导入比例 1:1；先量一下 T 试件",
        "   宽 70、C1 长 101，对上再切。",
        "2. 只有红色闭合轮廓和圆孔，全部切穿，没有雕刻。",
        "3. 两张木板同为 3 mm；表皮一张，材料见第 07 页。",
        "4. 含氯材料（氯丁橡胶、PVC）不能激光切，",
        "   提供片材成分让店里确认。",
        "5. 两片 R 一正一反错开半个肋舌，排在一起省料，",
        "   切完按轮廓认件即可，正反不影响装配。",
        "6. 插槽宽 3.0 是默认值。T 试件定了宽度以后，",
        "   改 geom.py 里的 SLOT 重出两张木板文件。",
        "",
        "用量：木板 3 mm 600 × 400 两张；",
        "表皮 1 mm 1000 × 500 一张（或 75 宽长条约 4.7 m",
        "加两条 12 × 546）；蜡线约 3 m。",
    ], size=2.1, lead=4.6)


# ---- 页 7：装配与材料 -----------------------------------------------------------------
def page_assembly(c, fig_dir):
    pp = P(c)
    frame(pp, 7, "07 | 装配顺序与表皮材料",
          "先做芯（肋 + 六边形板），再一个一个挂单元、绑线，最后上箍带。全程不用胶的地方：肋与板、单元与肋。")
    img = ImageReader(os.path.join(fig_dir, "unit.png"))
    iw, ih = img.getSize()
    w = 112.0
    h = w * ih / iw
    c.drawImage(img, 40, 362 - h, w, h, mask="auto")
    pp.text(26, 362 - h - 5, "U1 单元与它的定型肋（只画一个单元和两块六边形板）", 2.1, GRAY)
    steps = [
        ("1", "切 T 试件，定插槽宽。按第 06 页切两张木板、一张表皮。"),
        ("2", "胶合六个单元（第 05 页）：A 面三片、B 面三片，缝里 9 mm 不涂胶。胶干后从板孔通开表皮孔。"),
        ("3", "做芯：两块 P 板平放，六片 R 从外往里推进板槽（十字半槽），检查六片肋竖直、等分。"),
        ("4", "折单元：H1 / H4 朝 A 面、H2 / H3 朝 B 面各折 90°，成下凹槽形。"),
        ("5", "挂单元：槽口朝里套在一片肋的肋舌上，C2 落在肋舌上缘，C3 贴正面，C4 托住下缘；端板 C1 / C5 贴在 P 板边上。"),
        ("6", "绑线：C3 → C2 → C4 的顺序，每处一针穿过肋孔，拉紧打结。六个单元逐个装。"),
        ("7", "上箍带：两条 S 带在 P 板高度绕一圈（离单元顶 / 底 25），收紧，搭接 20，缝两针或用胶固定。"),
        ("8", "立起来：肋的下缘落桌，单元悬空 2 mm。P 板中心的 Ø10 孔是预留的，用不到可以不切。"),
    ]
    y = 352.0
    pp.text(196, y + 4, "装配顺序", 2.8)
    for n, s in steps:
        pp.circle(199, y - 3.2, 2.4, stroke=None, fill=TEAL)
        pp.text(199, y - 4.0, n, 2.3, HexColor("#ffffff"), "c")
        # 断行
        lines, cur = [], ""
        for ch in s:
            cur += ch
            if pdfmetrics.stringWidth(cur, FONT, 2.25) > 160:
                lines.append(cur)
                cur = ""
        if cur:
            lines.append(cur)
        pp.para(205, y - 4.0, lines, size=2.25, lead=4.3)
        y -= 4.3 * len(lines) + 4.2
    pp.text(196, y - 2, "形状不对时先松线、调肋舌与板的贴合，不要硬拉表皮；肋是形状的基准。", 2.1, RED)

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
        "这个演示模型由定型肋撑住形状，表皮不承担回弹，",
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
    im2, _ = R.render(R.build_ring(units=[0], core_units=[0], hoops=False), az=-48.0, el=20.0, px_per_mm=6.0)
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

    pdf = os.path.join(out_dir, "P2-SKIN-RING6-01_六单元环_v1.pdf")
    c = canvas.Canvas(pdf, pagesize=(PAGE_W * MM, PAGE_H * MM))
    c.setTitle("项目二 六单元环静态演示模型 | P2-SKIN-RING6-01 v1")
    c.setSubject("6 × P2-SKIN-01 v3 units on rib formers; mm; physical validation pending")
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
