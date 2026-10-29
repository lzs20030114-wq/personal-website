"""六单元环静态演示模型 图纸 v4：出 PDF 图纸 + DXF / SVG 切割文件。

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
    pp.text(22, 396, f"{CODE}  |  6 × P2-SKIN-01 v3  |  图纸 v4  |  {DATE}", 2.2, GRAY)
    pp.text(PAGE_W - 22, 396, "A2 594 × 420 mm / 单位 mm", 2.2, GRAY, "r")
    pp.line(22, 391, PAGE_W - 22, 391, LIGHT, 0.3)
    pp.text(22, 381, title, 3.4)
    pp.text(22, 375.5, sub, 2.2, GRAY)
    pp.line(22, 30, PAGE_W - 22, 30, LIGHT, 0.3)
    pp.text(22, 24.5, "六单元环静态演示 / 木板 3 mm / 表皮 1 mm / 未做实物验证", 2.2, RED)
    pp.text(PAGE_W - 22, 24.5, f"切割只用配套 DXF / SVG，1:1 页可直接量  |  {n}/{N_PAGES}", 2.2, GRAY, "r")
    # 100 mm 校验尺
    x0, y0 = 22, 14
    pp.line(x0, y0, x0 + 100, y0, INK, 0.3)
    for i in range(11):
        h = 2.2 if i % 5 == 0 else 1.2
        pp.line(x0 + 10 * i, y0, x0 + 10 * i, y0 + h, INK, 0.25)
    pp.text(x0 + 104, y0, "100 mm 校验尺 / 打印选“实际大小 100%”，不要适配页面", 2.0, GRAY)


def panel(pp, x, y, w, h):
    pp.rect(x, y, w, h, stroke=LIGHT, fill=PANEL, lw=0.25)


import numpy as np

GLUE = HexColor("#c0392b")


def n(x, d=1):
    """尺寸写进图纸：最多 d 位小数，去掉多余的 0。"""
    return f"{round(x, d):g}"


SM = G.summary()


# ---- 剖面绘制（r, s）→ 页面 -------------------------------------------------------
def draw_unit_section(pp, ox, oy, sc, side=1, labels=True, core=True, hoops=True, glue=True):
    """单元过板宽中线的剖面（托就在这个面上）。ox = 环轴的页面 x，oy = s=0 的页面 y，
    side=-1 画在轴的左边。"""
    X = lambda r: ox + side * r * sc
    Y = lambda s: oy - s * sc

    def box(r0, r1, s0, s1, **kw):
        pp.poly([(X(r0), Y(s0)), (X(r1), Y(s0)), (X(r1), Y(s1)), (X(r0), Y(s1))], **kw)

    if core:
        pp.poly([(X(r), Y(s)) for r, s in G.rib_outline_rs()], stroke=INK, fill=CORE, w=0.25)
        for sp in G.PLATE_S:      # 六边形板从环轴连到托上的槽底
            box(0, G.SLOT_MID, sp - G.T_BOARD / 2, sp + G.T_BOARD / 2, stroke=INK, fill=CORE, w=0.25)
    for name, (r0, r1, s0, s1) in G.BOARDS_FOLDED.items():
        box(r0, r1, s0, s1, stroke=INK, fill=WOOD, w=0.25)
    for name, rects in G.SKIN_FOLDED.items():
        a = name.startswith("A")
        for r0, r1, s0, s1 in rects:
            box(r0, r1, s0, s1, stroke=SKIN_A_S if a else SKIN_B_S, fill=SKIN_A if a else SKIN_B, w=0.12)
    if hoops:
        for sp in G.HOOP_S:
            box(G.OUTER_WALL, G.OUTER_WALL + 1, sp - G.HOOP_W / 2, sp + G.HOOP_W / 2, stroke=None, fill=HOOP_C)
    if glue:
        # 小三角上沿：台面坐在上面，点胶
        pp.line(X(G.R_C2_NEAR + 0.5), Y(G.GUS_TOP), X(G.GUS_R), Y(G.GUS_TOP), GLUE, max(0.35, 0.18 * sc))
        # 小台阶下面那道缝：一片表皮边角料 + 胶
        box(G.R_C4_FAR + 0.5, G.FOOT_R, G.FOOT_BOT, G.FOOT_BOT + G.T_SKIN, stroke=SKIN_B_S, fill=SKIN_B, w=0.12)
        box(G.R_C4_FAR + 0.5, G.FOOT_R, G.FOOT_BOT + G.T_SKIN, G.BOX_IN_BOT, stroke=None, fill=GLUE)
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


def clipped(c, x, y, w, h, fn):
    c.saveState()
    p = c.beginPath()
    p.rect(x, y, w, h)
    c.clipPath(p, stroke=0, fill=0)
    fn()
    c.restoreState()


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


def image(c, path, x, ytop, w, hmax=None):
    img = ImageReader(path)
    iw, ih = img.getSize()
    h = w * ih / iw
    if hmax is not None and h > hmax:
        h = hmax
        w = h * iw / ih
    c.drawImage(img, x, ytop - h, w, h, mask="auto")
    return h


SKIN_STRIP_M = sum(p["w"] * p["qty"] for k, p in G.parts_catalog().items()
                   if p["mat"] == "skin" and k != "HOOP") / 1000
FRONT_GAP = 2 * G.OUTER_FRONT * math.tan(math.pi / 6) - G.W
GUS = SM["gusset"]
FOOT = SM["foot"]


# ---- 页 1：总览 ----------------------------------------------------------------------
def page_overview(c, fig_dir):
    pp = P(c)
    frame(pp, 1, "01 | 总览：六个单元竖着围成一圈，凹槽朝外翻成挑台",
          f"图纸 v4：v3 的做法不变，整体缩到 {n(G.SCALE)} 倍省料，木板从两张减到一张，"
          "插槽、托、单元之间按激光割缝和折叠误差留了余量（第 02 页）。")
    h = image(c, os.path.join(fig_dir, "iso.png"), 26, 362, 238.0)
    pp.text(26, 362 - h - 5, "轴测示意：深色窄带是两道箍带。中间一段的墙折成了箱子，所以箱子后面能看到芯（托与六边形板）。", 2.0, GRAY)

    cx, cy, sc = 405.0, 284.0, 0.5
    pp.text(305, 365, "平面 1:2（从上往下看）", 2.5)
    pp.poly([(cx + x * sc, cy + y * sc) for x, y in G.plate_outline(0.0)], stroke=INK, fill=CORE, w=0.2)
    rr = SM["corner_radius"]
    pp.circle(cx, cy, rr * sc, stroke=LIGHT, w=0.18)
    pp.poly([(cx + x * sc, cy + y * sc) for x, y in G.HOOP["pts"]], stroke=HOOP_C, w=0.5)
    for k in range(6):
        a = k * math.pi / 3
        nn = (math.cos(a), math.sin(a))
        t = (-nn[1], nn[0])
        P2 = lambda r, w: (cx + (r * nn[0] + w * t[0]) * sc, cy + (r * nn[1] + w * t[1]) * sc)
        hw = G.W / 2
        st = G.SLOT / 2
        pp.poly([P2(G.R_IN, -st), P2(G.APO, -st), P2(G.APO, st), P2(G.R_IN, st)], stroke=INK, fill=CORE, w=0.2)
        pp.poly([P2(G.APO, -hw), P2(G.OUTER_WALL, -hw), P2(G.OUTER_WALL, hw), P2(G.APO, hw)],
                stroke=INK, fill=WOOD, w=0.25)
        pp.poly([P2(G.OUTER_WALL, -hw), P2(G.OUTER_FRONT, -hw), P2(G.OUTER_FRONT, hw), P2(G.OUTER_WALL, hw)],
                stroke=INK, fill=SKIN_A, w=0.3)
        lx, ly = P2((G.OUTER_WALL + G.OUTER_FRONT) / 2, 0)
        pp.text(lx, ly - 1, f"U{k + 1}", 2.4, INK, "c")
    yb = cy - G.OUTER_FRONT * sc
    pp.dimh(cx - G.OUTER_FRONT * sc, cx + G.OUTER_FRONT * sc, cy, yb - 9,
            f"{n(2 * G.OUTER_FRONT)}（正面到正面）", above=False)
    a150 = math.radians(150)
    pp.text(cx + (rr * sc + 3) * math.cos(a150), cy + (rr * sc + 3) * math.sin(a150),
            f"外接圆 Ø{2 * rr:.0f}", 2.2, TEAL, "r")
    xw = cx + G.OUTER_FRONT * sc
    pp.dimv(cy - G.W / 2 * sc, cy + G.W / 2 * sc, xw, xw + 8, n(G.W), left=False)

    rows = [("关键尺寸", "数值"),
            ("整体外接圆", f"Ø{2 * rr:.0f}"),
            ("总高（托）", f"{n(G.RIB_H)}，单元 {n(G.UNIT_H)}"),
            ("台面离桌", n(SM["platform_top_z"])),
            ("挑出（墙外表面起）", n(SM["protrusion"])),
            ("箱高（外）", n(SM["box_height"])),
            ("单元两端距离", f"{n(G.UNIT_H)}（平铺 {n(G.STRIP_L)}）"),
            ("托伸出墙外", f"三角 {n(GUS['reach_past_wall'])} / 台阶 {n(FOOT['reach_past_wall'])}"),
            ("单元间缝（内 / 外）", f"{n(SM['wall_gap_inner'])} / {n(SM['wall_gap_outer'])}"),
            ("相对 v3 单元图纸", f"{n(G.SCALE)} 倍（厚度、接缝不缩）")]
    pp.table(500, 352, [36, 36], rows, rh=5.8, size=2.05)

    L1, L2, L3 = G.LENS[:3]
    W = G.W
    sk = lambda k: f"{n(G.part_skin(k)['w'])} × {n(W)}"
    bom = [("编号", "名称", "尺寸 mm", "数量", "材料", "说明"),
           ("C1 / C5", "端板", f"{n(L1)} × {n(W)}", "12", "木板 3", "无孔"),
           ("C2 / C4", "台面 / 底面", f"{n(L2)} × {n(W)}", "12", "木板 3", "无孔"),
           ("C3", "正面", f"{n(L3)} × {n(W)}", "6", "木板 3", "无孔"),
           ("R", "托", f"{n(G.RIB_H)} × {n(G.GUS_R - G.R_IN)}", "6", "木板 3",
            "沿墙内侧立着，伸进箱子一个小三角、一个小台阶"),
           ("P", "六边形板", f"边心距 {n(G.APO)}", "2", "木板 3", f"每条边中点一条 {n(G.SLOT)} 宽的槽，接托"),
           ("T", "槽宽试件", "70 × 20", "1", "木板 3", "先切，定槽宽"),
           ("A1 / A3", "外表皮", sk("A1"), "12", "表皮 1", "无孔"),
           ("A2", "外表皮", sk("A2"), "6", "表皮 1", "无孔"),
           ("B1 / B3", "内表皮", sk("B1"), "12", "表皮 1", "无孔"),
           ("B2", "内表皮", sk("B2"), "6", "表皮 1", "无孔"),
           ("S", "箍带", f"{n(G.HOOP_W)} × {G.HOOP_L}", "2", "表皮 1", f"搭接 {n(G.HOOP_LAP)}，长度现场收"),
           ("—", "胶", "", "", "", "跟着表皮选，见第 07 页"),
           ("—", "纸胶带", "", "", "", "装单元时临时贴住墙，上了箍带就撕掉")]
    pp.text(305, 186, "零件清单（木板 39 件，一张 600 × 400，表皮 38 件，一张 600 × 400）", 2.6)
    pp.table(305, 182, [20, 22, 28, 14, 16, 167], bom, rh=5.6, size=2.05)

    panel(pp, 26, 40, 238, 56)
    pp.para(31, 89, [
        "形状靠两样东西。一是芯：两块六边形板和六条托插成一个架子，每个单元的端板 C1、C5",
        f"贴在托的直边和板边上，两道箍带从外面压住。两端距离被定成 {n(G.UNIT_H)}，带子平铺是 {n(G.STRIP_L)}，",
        f"多出来的 {n(SM['contraction'])} 只能朝外折出去，往哪边折由铰链在哪一面连着决定，这就是 v3 交错分段的用处。",
        "二是托伸进箱子的两小块：小三角托住台面，小台阶贴住底面。墙定住以后台面一锁，整个箱子就定了。",
        f"两小块都在靠墙的里角，箱子进深 {n(SM['box_inner'][0])}，小三角伸出墙外 {n(GUS['reach_past_wall'])}、"
        f"小台阶 {n(FOOT['reach_past_wall'])}。",
    ], size=2.2, lead=4.5)
    pp.text(31, 51, f"六个单元一样，静态，不做收缩。单元之间留缝：内表面处 {n(SM['wall_gap_inner'])}，"
            f"到方箱正面约 {n(FRONT_GAP, 0)}。", 2.05, GRAY)


# ---- 页 2：剖面 + 配合与余量 -----------------------------------------------------------
def page_section(c, fig_dir):
    pp = P(c)
    frame(pp, 2, "02 | 剖面 1:1（过板宽中线，托就在这个面上）+ 配合与余量",
          "折后位置按理想铰点推算（每道缝绕凹侧表面、缝宽中点转 90°），实物会差 1–2 mm，"
          f"小台阶下面留的 {n(G.FOOT_CLR)} 就是给它留的。")
    ox, oy, sc = 56.0, 346.0, 1.0
    X, Y = draw_unit_section(pp, ox, oy, sc)
    pp.text(22, 366, "单元 U1 剖面 1:1", 2.6)
    pp.line(ox, oy + 3, ox, Y(G.RIB_H) - 3, GRAY, 0.2, dash=(4, 1, 1, 1))
    pp.text(ox - 1.5, Y(G.RIB_H) - 6, "环轴", 2.0, GRAY, "c")
    pp.line(ox - 8, Y(G.RIB_H), X(G.OUTER_FRONT) + 10, Y(G.RIB_H), INK, 0.4)
    pp.text(X(G.OUTER_FRONT) + 12, Y(G.RIB_H) - 0.8, "桌面", 2.0, GRAY)
    pp.text(X(G.OUTER_WALL) + 3, Y(G.UNIT_H) + 0.6, f"单元下端离桌 {n(G.RIB_EXTRA)}，托当脚", 1.9, GRAY)
    xr = X(G.OUTER_FRONT) + 10
    pp.dimv(Y(0), Y(G.RIB_H), X(G.OUTER_FRONT), xr + 26, f"{n(G.RIB_H)} 托高", left=False)
    pp.dimv(Y(G.PLATFORM_TOP_S), Y(G.RIB_H), X(G.OUTER_FRONT), xr + 14,
            f"{n(G.RIB_H - G.PLATFORM_TOP_S)} 台面离桌", left=False)
    pp.dimv(Y(G.PLATFORM_TOP_S), Y(G.PLATFORM_BOT_S), X(G.OUTER_FRONT), xr + 3,
            n(G.PLATFORM_BOT_S - G.PLATFORM_TOP_S), left=False)
    xl = ox - 8
    pp.dimv(Y(0), Y(G.PLATE_S[0]), ox, xl, n(G.PLATE_S[0]))
    pp.dimv(Y(G.PLATE_S[1]), Y(G.UNIT_H), ox, xl, n(G.UNIT_H - G.PLATE_S[1]))
    pp.dimv(Y(0), Y(G.UNIT_H), ox, xl - 8, f"{n(G.UNIT_H)} 单元")
    pp.text(xl - 15, Y(G.UNIT_H / 2), f"两块 P 板离单元两端都是 {n(G.PLATE_INSET)}", 2.0, GRAY, "c", rot=90)
    yt = oy + 13
    pp.dimh(ox, X(G.R_IN), oy, yt - 7, n(G.R_IN))
    pp.dimh(ox, X(G.APO), oy, yt, n(G.APO))
    pp.dimh(X(G.APO), X(G.OUTER_WALL), oy, yt, n(G.OUTER_WALL - G.APO))
    pp.dimh(X(G.OUTER_WALL), X(G.OUTER_FRONT), Y(G.PLATFORM_TOP_S), yt, f"{n(SM['protrusion'])} 挑出")
    pp.text(X(G.OUTER_WALL) + 3, Y(G.L1 * 0.55), "A 外表皮 1", 2.0, SKIN_A_S)
    pp.text(X(G.APO) + 1.2, Y(G.L1 * 0.7), "B", 2.0, SKIN_B_S)
    for sp in G.PLATE_S:
        pp.text(X(G.SLOT_MID * 0.6), Y(sp) + 2.2, "P", 2.2, INK, "c")
    pp.text(X((G.R_IN + G.APO) / 2), Y(G.PLATE_S[0] + 30), "R 托", 2.6, INK, "c")
    pp.text(X((G.R_IN + G.APO) / 2), Y(G.PLATE_S[0] + 36), "贴墙的直边", 1.9, GRAY, "c")
    pp.text(X(G.OUTER_WALL) + 3, Y(G.HOOP_S[0]) + 6.5, "S 箍带", 2.0, HOOP_C)
    pp.text(X(G.GUS_R) + 2, Y(G.GUS_TOP + 7), "小三角", 2.0, INK)
    pp.text(X(G.FOOT_R) + 2, Y(G.FOOT_TOP + 3), "小台阶", 2.0, INK)

    # 配合与余量
    pp.text(22, 135, "配合与余量（图上尺寸 → 切出来、装起来会怎样）", 2.6)
    fits = [("地方", "图上", "会怎样", "留了多少"),
            ("托与 P 板的插槽", f"槽宽 {n(G.SLOT)}，板厚 3", "割缝让槽再宽约 0.15，板实际 2.8–3.1",
             "松 0.2–0.5，靠胶定住，先切 T 再定"),
            ("两条槽的深度", f"都开到离环轴 {n(G.SLOT_MID)}", "割缝让槽底各多出约 0.1", "托的直边和板边齐平"),
            ("小三角上沿", "与台面内表皮平齐", "单元靠自重坐在上面", "台面高度由它定，点胶"),
            ("小台阶下沿", f"离底面内表皮 {n(G.FOOT_CLR)}", "折出来的箱子比图上差 1–2",
             "推得进去，装好后垫一片表皮再点胶"),
            ("托的长度", f"比单元长 {n(G.RIB_EXTRA)}", "单元实际长短差一点", "托当脚，单元不顶桌"),
            ("单元之间", f"内表面处缝 {n(SM['wall_gap_inner'])}", "单元左右装偏",
             f"每边偏 {n(SM['wall_gap_inner'] / 2)} 以内不碰邻居"),
            ("箍带", f"一圈 {n(SM['hoop_perimeter'], 0)} + 搭接 {n(G.HOOP_LAP)}", "料有没有弹性",
             "绕一圈收紧再定搭接位置"),
            ("表皮与木板", f"同宽 {n(G.W)}", "手裁 ±1", "贴好后沿板边用刀修齐"),
            ("所有切割文件", "按图上尺寸画", "没做割缝补偿：零件每边小约 0.1", "对外形无影响，槽往松的方向走")]
    pp.table(22, 131, [32, 46, 66, 66], fits, rh=6.4, size=1.95)

    cx, top, s2 = 452.0, 352.0, 0.5
    pp.text(330, top + 7, "A–A 剖面 1:2（过 U1 与 U4）", 2.6)
    draw_unit_section(pp, cx, top, s2, side=1, labels=False, glue=False)
    draw_unit_section(pp, cx, top, s2, side=-1, labels=False, glue=False)
    pp.line(cx - 70, top - G.RIB_H * s2, cx + 70, top - G.RIB_H * s2, INK, 0.35)
    pp.text(cx + G.OUTER_FRONT * s2 + 2, top - G.L1 * 0.6 * s2, "U1", 2.4)
    pp.text(cx - G.OUTER_FRONT * s2 - 2, top - G.L1 * 0.6 * s2, "U4", 2.4, INK, "r")
    pp.dimh(cx - G.OUTER_FRONT * s2, cx + G.OUTER_FRONT * s2, top - G.RIB_H * s2, top - G.RIB_H * s2 - 8,
            n(2 * G.OUTER_FRONT), above=False)

    # 靠墙那一角 3:1
    panel(pp, 300, 40, 140, 207)
    pp.text(305, 240, "靠墙那一角 3:1", 2.4)
    s4 = 3.0
    r0w, s0w = G.APO - 4.0, G.BOX_IN_TOP - 5.0
    ww, wh = (G.GUS_R + 13.0) - r0w, (G.BOX_IN_BOT + 4.0) - s0w
    wx, wy = 306.0, 233.0                              # 窗口左上
    ox4, oy4 = wx - r0w * s4, wy + s0w * s4
    X4 = lambda r: ox4 + r * s4
    Y4 = lambda s: oy4 - s * s4
    clipped(c, wx, wy - wh * s4, ww * s4, wh * s4,
            lambda: draw_unit_section(pp, ox4, oy4, s4, labels=False, hoops=False))
    pp.rect(wx, wy - wh * s4, ww * s4, wh * s4, stroke=GRAY, lw=0.2, dash=(1.2, 0.8))
    xm = (G.R_C2_NEAR + r0w + ww) / 2
    pp.text(X4(xm), Y4((G.S_C2_A + G.S_C2_B) / 2) - 0.7, "C2 台面", 1.9, INK, "c")
    pp.text(X4(xm), Y4((G.S_C4_A + G.S_C4_B) / 2) - 0.7, "C4 底面", 1.9, INK, "c")
    fs = (G.GUS_BOT + G.FOOT_TOP) / 2
    pp.text(X4((G.APO + G.OUTER_WALL) / 2) + 0.7, Y4(fs), "墙在这一段折成箱子", 1.6, GRAY, "c", rot=90)
    pp.dimh(X4(G.OUTER_WALL), X4(G.GUS_R), Y4(G.GUS_BOT), Y4(G.GUS_BOT + 2.5),
            n(GUS["reach_past_wall"]), above=False)
    pp.dimv(Y4(G.GUS_TOP), Y4(G.GUS_BOT), X4(G.GUS_R), X4(G.GUS_R + 8), n(GUS["height"]), left=False)
    pp.dimh(X4(G.OUTER_WALL), X4(G.FOOT_R), Y4(G.FOOT_TOP), Y4(G.FOOT_TOP - 2.2), n(FOOT["reach_past_wall"]))
    pp.dimv(Y4(G.FOOT_TOP), Y4(G.FOOT_BOT), X4(G.FOOT_R), X4(G.FOOT_R + 3.5), n(FOOT["height"]), left=False)
    pp.dimv(Y4(G.FOOT_BOT), Y4(G.BOX_IN_BOT), X4(G.FOOT_R), X4(G.FOOT_R + 8), n(G.FOOT_CLR), left=False)
    pp.text(X4(G.GUS_R + 0.8), Y4(G.GUS_TOP + 1.6), "坐在上面，点胶", 1.8, GLUE)
    pp.text(X4(G.FOOT_R + 9.5), Y4(G.BOX_IN_BOT) + 1.0, "垫表皮 + 胶", 1.8, GLUE)
    pp.text(X4(G.APO - 3.3), Y4(G.GUS_BOT + 4), "托", 2.2, INK)
    pp.para(305, wy - wh * s4 - 5, [
        "台面压在小三角上，往下垮时是压在托上，靠托本身挡住。",
        f"小三角顶住台面 {n(GUS['c2_contact'])}，小台阶贴住底面 {n(FOOT['c4_contact'])}。",
        f"小台阶下面留 {n(G.FOOT_CLR)}：箱子折得比图上小一点也推得进去，",
        "装好后塞一片 1 mm 表皮边角料，再点胶填满。",
        "单元顺着径向推进去：墙在小三角上面、小台阶下面都断开。",
    ], size=1.9, lead=3.9)

    # 照片里看得到多少
    panel(pp, 448, 40, 124, 207)
    pp.text(453, 240, "照片里看得到多少（平视，高 10°）", 2.4)
    hh = image(c, os.path.join(fig_dir, "eye_crop.png"), 452, 234, 116, hmax=66)
    pp.text(453, 234 - hh - 3.6, "木本色：正对箱子侧面能看到里角的托和后面的芯", 1.85, GRAY)
    y2 = 234 - hh - 8
    hh2 = image(c, os.path.join(fig_dir, "eye_crop_dark.png"), 452, y2, 116, hmax=66)
    pp.text(453, y2 - hh2 - 3.6, "托和 P 板刷深色：读成箱子里的暗处", 1.85, GRAY)
    pp.para(453, y2 - hh2 - 9, [
        "正面、上面、下面看不到托。墙在箱子这一段折出去了，",
        "箱子后面本来就空着，能看到芯，刷深色两样一起藏。",
    ], size=1.85, lead=3.7)


# ---- 页 3：木板零件 -------------------------------------------------------------------
def page_wood(c, fig_dir):
    pp = P(c)
    cat = G.parts_catalog()
    frame(pp, 3, "03 | 木板零件 1:1：3 mm 木板，共 39 件，排在一张 600 × 400 上",
          f"建议 3 mm 椴木层板激光切。C1–C5 是 v3 单元图纸的 {n(G.SCALE)} 倍、不打孔。"
          "托 R 与六边形板 P 十字插接，槽宽按 T 试件定。")
    rib = cat["RIB"]
    rx, ry = 36.0, 352.0
    draw_part(pp, rib, rx, ry, fill=CORE)
    pp.text(rx, ry + 6, "R 托 × 6", 2.8)
    sp_ = G.APO - G.R_IN
    pp.dimh(rx, rx + sp_, ry, ry + 2.5, n(sp_))
    pp.dimh(rx + sp_, rx + rib["w"], ry - G.GUS_TOP, ry + 2.5, n(G.GUS_R - G.APO))
    pp.dimv(ry, ry - G.RIB_H, rx, rx - 7, n(G.RIB_H))
    pp.dimv(ry, ry - G.PLATE_S[0], rx, rx - 14, n(G.PLATE_S[0]))
    pp.dimv(ry - G.PLATE_S[1], ry - G.RIB_H, rx, rx - 14, n(G.RIB_H - G.PLATE_S[1]))
    xe = rx + rib["w"]
    pp.dimv(ry, ry - G.GUS_TOP, xe, xe + 6, n(G.GUS_TOP), left=False)
    pp.dimv(ry - G.GUS_TOP, ry - G.GUS_BOT, xe, xe + 6, n(G.GUS_BOT - G.GUS_TOP), left=False)
    xf = rx + sp_ + (G.FOOT_R - G.APO)
    pp.dimv(ry - G.FOOT_TOP, ry - G.FOOT_BOT, xf, xe + 6, n(G.FOOT_BOT - G.FOOT_TOP), left=False)
    pp.dimv(ry, ry - G.FOOT_TOP, xe, xe + 13, n(G.FOOT_TOP), left=False)
    pp.dimh(rx + sp_, xf, ry - G.FOOT_BOT, ry - G.FOOT_BOT - 6, n(G.FOOT_R - G.APO), above=False)
    sx = rx + (G.SLOT_MID - G.R_IN)
    pp.dimh(rx, sx, ry - G.PLATE_S[1] - G.SLOT / 2, ry - G.PLATE_S[1] - 7, n(G.SLOT_MID - G.R_IN), above=False)
    pp.text(rx + 2, ry - G.PLATE_S[0] - 5, f"槽 {n(G.SLOT)} 宽", 1.9, TEAL)
    pp.text(rx + sp_ + 2, ry - G.GUS_TOP + 1.5, "这条边顶住台面", 1.9, GRAY)
    pp.text(xf + 2, ry - G.FOOT_BOT + 0.8, "贴住底面", 1.9, GRAY)
    pp.text(rx + sp_ - 2, ry - G.UNIT_H * 0.78, "这条直边贴墙内侧", 1.9, GRAY, "r", rot=90)
    pp.text(rx + 2, ry - G.RIB_H - 12, f"上端与单元齐平，下端比单元长 {n(G.RIB_EXTRA)}，落桌", 1.9, GRAY)
    pp.text(rx + 2, ry - G.RIB_H - 16.5, f"小三角的尖削平 {n(G.GUS_TIP)}", 1.9, GRAY)

    yt = 352.0
    x = 150.0
    for key, label in [("C1", "C1 / C5 × 12"), ("C2", "C2 / C4 × 12"), ("C3", "C3 × 6")]:
        p = cat[key]
        draw_part(pp, p, x, yt)
        pp.text(x, yt + 6, label, 2.8)
        pp.dimh(x, x + p["w"], yt - G.W, yt - G.W - 7, n(p["w"]), above=False)
        pp.dimv(yt, yt - G.W, x, x - 6, n(G.W))
        pp.text(x + p["w"] / 2, yt - G.W / 2, "无孔", 1.9, GRAY, "c")
        x += p["w"] + 22

    pl = cat["PLATE"]
    px0, py0 = 380.0, 352.0
    draw_part(pp, pl, px0, py0, fill=CORE)
    pp.text(px0, py0 + 13, "P 六边形板 × 2（上下两块相同）", 2.8)
    pp.dimh(px0, px0 + pl["w"], py0 - pl["h"] / 2, py0 + 5, f"{n(pl['w'])}（对角）")
    pp.dimv(py0, py0 - pl["h"], px0 + pl["w"], px0 + pl["w"] + 9, f"{n(pl['h'])}（对边 = 2 × {n(G.APO)}）", left=False)
    pp.text(px0 + pl["w"] / 2, py0 - pl["h"] - 7,
            f"每条边中点一条槽：宽 {n(G.SLOT)}、深 {n(G.APO - G.SLOT_MID)}", 2.0, TEAL, "c")

    cb = cat["COMB"]
    tx, ty = 150.0, 262.0
    draw_part(pp, cb, tx, ty)
    pp.text(tx, ty + 6, "T 槽宽试件 × 1（先切）", 2.8)
    for i, sw in enumerate(G.COMB_WIDTHS):
        pp.text(tx + 10 + G.COMB_PITCH * i, ty - cb["h"] - 4, f"{sw:.1f}", 1.8, TEAL, "c")
    pp.para(tx, ty - cb["h"] - 10, [
        "从左到右 " + " / ".join(f"{w:.1f}" for w in G.COMB_WIDTHS) + "，槽深 10。",
        "拿要用的那张木板的边角料往槽里插：",
        "能用手推进去、松手不掉、晃起来有一点点旷的那条最好。",
        f"图纸默认 {n(G.SLOT)}，选了别的，改 geom.py 的 SLOT 重出木板文件，",
        "托和 P 板上的槽一起变。",
    ], size=1.95, lead=4.0)

    hc = image(c, os.path.join(fig_dir, "core.png"), 300, 262, 74.0)
    pp.text(300, 262 - hc - 4, "插好以后的芯（轴测）：托顺着径向推进板上的槽，两条槽交叉咬住", 1.9, GRAY)

    panel(pp, 150, 40, 422, 40)
    pp.para(155, 73, [
        "全部零件在同一张 3 mm 板上切。先切 T 槽宽试件，定了槽宽再切整张。",
        f"托 R 与 P 板十字插接：托上的槽从内缘开到离环轴 {n(G.SLOT_MID)}，板上的槽从板边开到同一处，两条槽各占一半，交叉咬住。",
        f"托的直边、P 板的六条边都在离环轴 {n(G.APO)} 处，单元的墙（B 表皮面）贴在这里。托的下端比单元长 {n(G.RIB_EXTRA)}，托当脚，单元悬空。",
        "C2 与 C4 是同一个零件，C1 与 C5 也是，都不打孔。托刷深色更不显（第 02 页），要刷在插接之前。",
        "切出来的零件每边会小约 0.1（割缝），图纸没有补偿，外形尺寸照用即可。",
    ], size=2.15, lead=4.6)


# ---- 页 4：表皮零件 -------------------------------------------------------------------
def page_skin(c):
    pp = P(c)
    cat = G.parts_catalog()
    frame(pp, 4, "04 | 表皮零件 1:1：1 mm 表皮，共 38 件，排在一张 600 × 400 上",
          f"切法与 v3 单元图纸相同（A 面连 H1 / H4、B 面连 H2 / H3），都不打孔，全部是 {n(G.W)} 宽的矩形，"
          f"可以先裁 {n(G.W)} 宽长条再截断。")
    y1 = 352.0
    items = [("A1", "A1 / A3 × 12", SKIN_A, SKIN_A_S),
             ("A2", "A2 × 6", SKIN_A, SKIN_A_S),
             ("B2", "B2 × 6", SKIN_B, SKIN_B_S),
             ("B1", "B1 / B3 × 12", SKIN_B, SKIN_B_S)]
    x0 = 28.0
    for key, label, fill, stroke in items:
        p = cat[key]
        draw_part(pp, p, x0, y1, fill=fill, stroke=stroke)
        pp.text(x0, y1 + 6, label, 2.8)
        pp.dimh(x0, x0 + p["w"], y1 - G.W, y1 - G.W - 7, n(p["w"]), above=False)
        pp.dimv(y1, y1 - G.W, x0, x0 - 6, n(G.W))
        x0 += p["w"] + 24
    a1 = cat["A1"]["w"]
    pp.text(28 + a1 - 2, y1 - G.W + 3, "C2 端", 2.0, GRAY, "r")
    pp.text(30, y1 - G.W + 3, "C1 端", 2.0, GRAY)
    pp.text(28, y1 - G.W - 15, "A3 与 A1 是同一个零件，B3 与 B1 也是，掉个头即可。", 2.05, GRAY)

    h = cat["HOOP"]
    hy = 262.0
    draw_part(pp, h, 28.0, hy, fill=SKIN_A, stroke=SKIN_A_S)
    pp.text(28, hy + 6, f"S 箍带 × 2：{n(G.HOOP_W)} × {G.HOOP_L}", 2.8)
    pp.dimh(28, 28 + G.HOOP_L, hy - G.HOOP_W, hy - G.HOOP_W - 7, f"{G.HOOP_L}", above=False)
    pp.dimh(28, 28 + G.HOOP_LAP, hy, hy + 2.5, f"{n(G.HOOP_LAP)} 搭接")
    pp.text(28, hy - G.HOOP_W - 16, f"箍带在单元外表面上的一圈长 {n(SM['hoop_perimeter'])}，再加 {n(G.HOOP_LAP)} 搭接。"
            "用不含弹性的料时按此长度，用硅胶等弹性料时绕一圈收紧后再定搭接位置。", 1.95, GRAY)

    panel(pp, 26, 166, 546, 60)
    pp.text(31, 218, "裁切", 2.6)
    pp.para(31, 211, [
        f"表皮零件都是 {n(G.W)} 宽的矩形，不打孔，不一定要找切割厂。在 1 mm 片材上先划出 {n(G.W)} 宽的长条",
        f"（钢尺 + 美工刀，刀片常换），再按长度截断。一共要 {n(G.W)} 宽长条约 {n(SKIN_STRIP_M)} m，S 箍带另裁两条 {n(G.HOOP_W)} 宽。",
        "要用激光切，就用第 06 页的 skin 排版文件（600 × 400）。含氯的橡胶（氯丁 CR、PVC 类）不能进激光机，",
        "下单前问清片材成分，硅胶片可以激光切，切口会有一层白色粉末，用湿布擦掉。",
        "手裁难免差 1 mm 左右：贴上去以后哪边多出来，就沿木板边用刀修齐，短了的话，短在接缝那一头",
        "（不涂胶的那 2 mm 里）看不出来。",
    ], size=2.15, lead=4.6)
    panel(pp, 26, 104, 546, 52)
    pp.text(31, 149, "表皮选什么", 2.6)
    pp.para(31, 142, [
        "这个模型的形状由芯和托定住，表皮只需要弯过接缝、看起来是一层皮，不需要回弹。图纸按 1 mm 厚出，换 1 mm 的别的片材尺寸都不用改。",
        "推荐 1 mm 硅胶片（食品级、邵氏硬度 40–50A），几乎没有气味，手感最接近橡胶。缺点是难粘，要用中性硅酮胶，先用边角料试粘。",
        "最省事的是书皮布 / 装裱布：没有气味，剪刀和激光都能切，白乳胶就能粘，但没有弹性。几种材料的对比见第 07 页。",
    ], size=2.15, lead=4.6)


# ---- 页 5：叠层（平铺 1:1） ----------------------------------------------------------
def page_laminate(c):
    pp = P(c)
    frame(pp, 5, "05 | 平铺叠层与胶合 1:1：一个单元的三层，可打印当胶合定位样板",
          "三层都用同一个 x 坐标（C1 端为 0），A 面朝上看，B 层画在同一 x 上。跨缝连续的那一面每道缝留 9 mm 不涂胶。")
    x0 = (PAGE_W - G.STRIP_L) / 2
    bands = [("A 面（外）", 330.0, "A"), ("木板", 255.0, "C"), ("B 面（内）", 180.0, "B")]
    continuous = {"A": [0, 3], "B": [1, 2]}
    Wd = G.W
    for label, ytop, kind in bands:
        pp.text(x0 - 6, ytop - Wd / 2, label, 2.6, INK, "r")
        if kind == "C":
            for i, (fx, L) in enumerate(zip(G.FLAT_X, G.LENS)):
                draw_part(pp, G.part_board(f"C{i + 1}"), x0 + fx, ytop)
                pp.text(x0 + fx + L / 2, ytop - Wd / 2 + 4, f"C{i + 1}", 3.0, INK, "c")
                pp.text(x0 + fx + L / 2, ytop - Wd / 2 - 4, f"{n(L)} × {n(Wd)}", 2.0, GRAY, "c")
        else:
            segs = G.SKIN_A if kind == "A" else G.SKIN_B
            fill, stroke = (SKIN_A, SKIN_A_S) if kind == "A" else (SKIN_B, SKIN_B_S)
            for name, (a, b) in segs.items():
                draw_part(pp, G.part_skin(name), x0 + a, ytop, fill=fill, stroke=stroke)
                pp.text(x0 + (a + b) / 2, ytop - Wd / 2 + 4, name, 3.0, INK, "c")
                pp.text(x0 + (a + b) / 2, ytop - Wd / 2 - 4, f"{n(b - a)} × {n(Wd)}", 2.0, GRAY, "c")
            for j in continuous[kind]:
                gx = G.FLAT_X[j] + G.LENS[j]
                pp.rect(x0 + gx - 2, ytop - Wd, 9, Wd, stroke=None, fill=FREE)
                pp.rect(x0 + gx - 2, ytop - Wd, 9, Wd, stroke=TEAL, lw=0.15, dash=(0.8, 0.6))
                pp.text(x0 + gx + 2.5, ytop - Wd + 3, "9", 2.0, TEAL, "c")
    ybot = bands[-1][1] - Wd - 6
    for j in range(4):
        gx = x0 + G.FLAT_X[j] + G.LENS[j] + G.GAP / 2
        pp.line(gx, 337, gx, ybot, GRAY, 0.18, dash=(2, 1.2))
        ok_a = j in continuous["A"]
        pp.text(gx, 340, f"H{j + 1}", 2.4, INK, "c")
        pp.text(gx, ybot - 6, ("A 连续 / B 断" if ok_a else "B 连续 / A 断"), 2.0, TEAL if ok_a else SKIN_B_S, "c")
    marks = sorted({0.0, G.STRIP_L, *[x for fx, L in zip(G.FLAT_X, G.LENS) for x in (fx, fx + L)]})
    for x in marks:
        pp.line(x0 + x, 346, x0 + x, 350, INK, 0.2)
        pp.text(x0 + x, 351.5, n(x), 1.9, GRAY, "c")
    pp.text(x0 + G.STRIP_L + 6, 351.5, "← x，从 C1 端量", 1.9, GRAY)
    panel(pp, 26, 36, 546, 40)
    pp.para(31, 69, [
        "胶合时先把五块板按 5 mm 间隙排进一个直尺夹具（两根直尺 + 5 mm 垫片），贴 A 面，翻过来贴 B 面。连续的那一面在缝两侧各退 2 mm 不涂胶，",
        "留出 5 + 2 + 2 = 9 mm 的自由弯折段，断开的那一面表皮端边与板端边齐平，不伸进缝里。表皮按自然长度贴，不预拉。",
        "表皮长短差一点没关系：长了沿板边修掉，短在缝这一头的 2 mm 里看不出来。",
        "B2 贴在台面、正面、底面的箱内一侧，装好以后托顶着的就是它，所以托上的胶要能粘这种表皮（第 07 页）。",
    ], size=2.1, lead=4.4)


# ---- 页 6：排版 ----------------------------------------------------------------------
LAB = {"C1": "C1", "C2": "C2", "C3": "C3", "PLATE": "P", "RIB": "R", "COMB": "T",
       "A1": "A1", "A2": "A2", "B1": "B1", "B2": "B2", "HOOP": "S"}


def sheet_title(prefix, nest):
    from collections import Counter
    cnt = Counter(k for k, *_ in nest)
    order = ["RIB", "PLATE", "C1", "C2", "C3", "COMB", "A1", "A2", "B1", "B2", "HOOP"]
    return prefix + "，".join(f"{LAB[k]} × {cnt[k]}" for k in order if cnt[k])


def page_nest(c):
    pp = P(c)
    cat = G.parts_catalog()
    frame(pp, 6, "06 | 切割排版 1:2.5：木板一张 600 × 400，表皮一张 600 × 400",
          "本页只是缩小示意，切割用同名 DXF / SVG（1:1，单位 mm，只有闭合轮廓）。零件间距 5，板边留 4。")
    sc = 1 / 2.5

    def sheet(nest, size, ox, oytop, title, fname, fill, stroke):
        w, h = size
        pp.text(ox, oytop + 5, title, 2.3)
        pp.text(ox + w * sc, oytop + 5, fname, 2.0, GRAY, "r")
        pp.rect(ox, oytop - h * sc, w * sc, h * sc, stroke=GRAY, lw=0.2, dash=(1.5, 1))
        for key, x, y, rot, mirror in nest:
            pts, holes = G.place(cat[key], x, y, rot, mirror)
            f = CORE if key in ("RIB", "PLATE") else fill
            pp.poly([(ox + px * sc, oytop - py * sc) for px, py in pts], stroke=stroke, fill=f, w=0.15)
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            lx, ly = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
            if key == "RIB":            # 标在直的那段上
                sp_ = G.APO - G.R_IN
                lx = min(xs) + sp_ / 2 if rot == 0 else max(xs) - sp_ / 2
            pp.text(ox + lx * sc, oytop - (ly + 3) * sc, LAB[key], 2.0, INK, "c")

    sheet(G.NEST_WOOD[0], G.SHEET_WOOD, 26, 352, sheet_title("木板：", G.NEST_WOOD[0]), "wood.dxf / .svg", WOOD, INK)
    sheet(G.NEST_SKIN, G.SHEET_SKIN, 332, 352, sheet_title("表皮：", G.NEST_SKIN), "skin.dxf / .svg", SKIN_A, SKIN_A_S)
    panel(pp, 26, 40, 546, 145)
    pp.text(31, 177, "下单时说明", 2.6)
    pp.para(31, 169, [
        f"1. 文件单位 mm，导入比例 1:1，先量一下 C1 长 {n(G.L1)}、宽 {n(G.W)}，T 试件宽 70，对上再切。",
        "2. 只有红色闭合轮廓，全部切穿，没有雕刻，没有孔。",
        "3. 木板 3 mm 一张，表皮 1 mm 一张，材料见第 07 页。",
        "4. 含氯材料（氯丁橡胶、PVC）不能激光切，提供片材成分让店里确认。",
        f"5. 先单独切 T 试件试槽宽，定了以后改 geom.py 的 SLOT（默认 {n(G.SLOT)}），重出木板文件，",
        "   托与 P 板上的槽都跟着变。",
        "6. 文件没有做割缝补偿：跟店里说按线切、不要补偿。补偿了槽会变紧。",
        "7. 托 R 三对两两倒插，排在木板左上角。",
    ], size=2.1, lead=4.6)
    pp.para(300, 169, [
        "用量",
        "木板：3 mm 椴木层板 600 × 400 一张。",
        f"表皮：1 mm 片材 600 × 400 一张，手裁的话是 {n(G.W)} 宽长条约 {n(SKIN_STRIP_M)} m，",
        f"加两条 {n(G.HOOP_W)} × {G.HOOP_L} 的箍带。",
        "胶一支（跟着表皮选），纸胶带一卷，牙签几根。",
        "",
        "和图纸 v3 比",
        f"整体缩到 {n(G.SCALE)} 倍：外接圆 Ø314 → Ø{2 * SM['corner_radius']:.0f}，"
        f"高 263 → {n(G.RIB_H)}。",
        "木板 600 × 400 两张 → 一张，表皮 1000 × 500 → 600 × 400。",
    ], size=2.1, lead=4.6)


# ---- 页 7：装配与材料 -----------------------------------------------------------------
def page_assembly(c, fig_dir):
    pp = P(c)
    frame(pp, 7, "07 | 装配顺序与表皮材料",
          "先插芯，再把单元一个个顺着径向推上去，上箍带，最后从箱子侧面给托点胶。")
    h1 = image(c, os.path.join(fig_dir, "core.png"), 26, 362, 62.0)
    pp.text(26, 362 - h1 - 4, "芯：两块 P 板 + 六条托", 2.0, GRAY)
    h2 = image(c, os.path.join(fig_dir, "unit.png"), 92, 362, 70.0)
    pp.text(92, 362 - h2 - 4, "推上一个单元", 2.0, GRAY)
    steps = [
        ("1", f"切 T 槽宽试件，拿要用的木板去插，定槽宽（默认 {n(G.SLOT)}），改 SLOT 重出木板文件。按第 06 页切一张木板、一张表皮。"),
        ("2", "胶合六个单元（第 05 页）：A 面三片、B 面三片，缝里 9 mm 不涂胶。表皮多出来的沿板边修齐。要刷深色的话，这时把托和 P 板刷好。"),
        ("3", "插芯：两块 P 板平放，六条托槽口朝里，顺着径向推进板上的槽里，两条槽交叉咬住。托的直边与板边齐平，上端对齐。插好在交叉处点胶。"),
        ("4", "装单元：把单元折成箱子，墙对着一条托，顺着径向推进去。台面 C2 从小三角上面滑过，底面 C4 从小台阶下面滑过，墙贴到托的直边和两块板的边上。"
              "台面落在小三角上，用纸胶带把墙临时贴在板边上。六个单元逐个装。"),
        ("5", f"上箍带：两条 S 带绕在两块板的高度（离单元两端各 {n(G.PLATE_INSET)}），收紧，搭接 {n(G.HOOP_LAP)} 粘住，撕掉纸胶带。"),
        ("6", f"点胶：从每个箱子的侧面，用牙签在小三角和台面之间点胶，小台阶下面那道 {n(G.FOOT_CLR)} 的缝先塞一片 1 mm 表皮边角料，再点胶填满。"
              "胶跟着表皮选（下表），托顶着的是箱内那层 B 表皮。"),
        ("7", f"立起来：托的下端落桌，单元悬空 {n(G.RIB_EXTRA)}。看一眼台面是否水平，不平就在胶干前把台面往小三角上压实。"),
    ]
    y = 352.0
    pp.text(166, y + 4, "装配顺序", 2.8)
    for num, s in steps:
        pp.circle(169, y - 3.2, 2.4, stroke=None, fill=TEAL)
        pp.text(169, y - 4.0, num, 2.3, HexColor("#ffffff"), "c")
        lines = wrap(s, 394, 2.4)
        pp.para(175, y - 4.0, lines, size=2.4, lead=4.8)
        y -= 4.8 * len(lines) + 4.6
    pp.text(166, y - 3, "托只管把箱子定住，不用拉、不用绑。形状不对时先看墙有没有贴紧托的直边，再看台面是否落在小三角上。", 2.3, RED)

    pp.text(26, 172, "表皮材料对比（1 mm 厚，静态演示用）", 2.8)
    rows = [("材料", "气味", "怎么切", "粘到木板上 / 托上", "用在这个模型"),
            ("原橡胶片", "大", "刀模 / 手工，含氯配方不能激光", "万能胶（接触胶）", "能用，味道问题不解决"),
            ("硅胶片（推荐）", "几乎没有", "美工刀，可激光，切口有白粉", "中性硅酮胶，难粘，先试粘", "外观手感最接近橡胶，有弹性"),
            ("书皮布 / 装裱布", "没有", "剪刀、激光", "白乳胶", "最省事，静态够用，没有弹性"),
            ("EVA 片", "轻微", "美工刀，可激光", "万能胶、热熔胶", "便宜，偏软，看起来像泡沫"),
            ("TPU 片", "小", "美工刀，不建议激光（受热分解产生氰化氢）", "万能胶", "有 3D 打印机可直接打"),
            ]
    pp.table(26, 166, [36, 20, 90, 64, 70], rows, rh=7.0, size=2.15)
    panel(pp, 316, 40, 256, 132)
    pp.text(321, 164, "硅胶片怎么买、怎么粘", 2.6)
    pp.para(321, 156, [
        "买：搜“硅胶板 1mm 食品级”，选邵氏 40–50A、无味、透明或浅色，",
        "600 × 400 一张够全部表皮和箍带。有的店能按 DXF 激光切或模切。",
        "",
        "粘：硅胶表面能很低，普通万能胶、白乳胶、瞬干胶、热熔胶都粘不牢。",
        "用单组分中性硅酮胶（中性玻璃胶），薄刮一层在木板上，贴上压平，",
        "室温放一天。酸性玻璃胶固化时有醋味，选“中性”。",
        "要更牢，在木板一侧先刷硅胶专用底涂剂再上胶。托上的点胶也用它。",
        "",
        "先做试样：一块边角木板 + 一条硅胶，粘好放一天，",
        "手撕不下来再批量做。粘不住就改用书皮布，图纸尺寸不变。",
        "",
        "橡胶要继续用的话，买之前问清是不是氯丁 / 再生胶，",
        "这两种味道最重，拆封后通风放几天，味道会淡一些。",
    ], size=2.1, lead=4.4)
    pp.para(26, 120, [
        "为什么这里可以换掉橡胶：",
        "形状由芯和托定住，表皮不承担回弹，",
        "所以只需要能弯折、能粘、没有味道。",
        "以后要做“拉一下就成形”的实验，表皮要有弹性，",
        "那时硅胶仍然能用，布和 EVA 就不行了。",
    ], size=2.1, lead=4.4)


# ---- 入口 ----------------------------------------------------------------------------
def side_crop(info, k, side, pad=6.0, aspect=1.75):
    """单元 k 的箱子朝 side 一侧的开口，在渲染图里的裁切框（按 aspect 补成固定宽高比）。"""
    f = R.unit_frame(k)
    pts = [f(r, s, w) for r in (G.APO - 6, G.OUTER_FRONT) for s in (G.L1 - 6, G.S_C5_TOP + 6)
           for w in (-G.W / 2, G.W / 2)]
    xy = np.array([info["project"](p) for p in pts])
    x0, y0 = xy.min(0) - pad * 5
    x1, y1 = xy.max(0) + pad * 5
    w, h = x1 - x0, y1 - y0
    if w / h < aspect:
        cxm = (x0 + x1) / 2
        x0, x1 = cxm - h * aspect / 2, cxm + h * aspect / 2
    else:
        cym = (y0 + y1) / 2
        y0, y1 = cym - w / aspect / 2, cym + w / aspect / 2
    W_, H_ = info["size"]
    return (int(max(0, x0)), int(max(0, y0)), int(min(W_, x1)), int(min(H_, y1)))


def facing_side(view):
    """侧面开口最正对相机、且单元本身朝着相机的那个箱子。"""
    best = None
    for k in range(G.N_UNITS):
        a = k * math.pi / 3
        nn = np.array([math.cos(a), math.sin(a), 0.0])
        t = np.array([-math.sin(a), math.cos(a), 0.0])
        if np.dot(nn, view) <= 0.5:          # 单元本身要朝着相机，否则开口被前面的单元挡住
            continue
        for side in (1, -1):
            sc_ = float(np.dot(side * t, view))
            if best is None or sc_ > best[0]:
                best = (sc_, k, side)
    return best[1], best[2]


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    fig_dir = tempfile.mkdtemp(prefix="ring6-fig-")      # 渲染图只嵌进 PDF，不留在输出目录
    im, _ = R.render(R.build_ring(), az=-14.0, el=22.0, px_per_mm=6.5)
    im.save(os.path.join(fig_dir, "iso.png"))
    im, _ = R.render(R.build_ring(units=[], hoops=False), az=-40.0, el=24.0, px_per_mm=5.5)
    im.save(os.path.join(fig_dir, "core.png"))
    im, _ = R.render(R.build_ring(units=[0], hoops=False), az=-62.0, el=14.0, px_per_mm=5.5)
    im.save(os.path.join(fig_dir, "unit.png"))
    wood = R.COL["core"]
    crop = None
    for name, col in (("eye_crop", wood), ("eye_crop_dark", (0.22, 0.22, 0.22))):
        R.COL["core"] = col
        im, info = R.render(R.build_ring(), az=20.0, el=10.0, px_per_mm=7.0)
        if crop is None:
            crop = side_crop(info, *facing_side(info["view"]))
        im.crop(crop).save(os.path.join(fig_dir, f"{name}.png"))
    R.COL["core"] = wood

    cat = G.parts_catalog()
    report = {}
    for name, nest, sheet in [("wood", G.NEST_WOOD[0], G.SHEET_WOOD),
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
    assert sum(v["qty"] for v in cat.values() if v["mat"] == "wood") == 39
    assert sum(v["qty"] for v in cat.values() if v["mat"] == "skin") == 38

    pdf = os.path.join(out_dir, "P2-SKIN-RING6-01_六单元环_v4.pdf")
    c = canvas.Canvas(pdf, pagesize=(PAGE_W * MM, PAGE_H * MM))
    c.setTitle("项目二 六单元环静态演示模型 | P2-SKIN-RING6-01 v4")
    c.setSubject("6 × P2-SKIN-01 v3 units at 0.7 scale on a slotted core; a small bracket per unit holds the box; "
                 "clearances for laser kerf; mm; physical validation pending")
    c.setAuthor("Project II / P2-SKIN-RING6-01")
    for fn in (lambda: page_overview(c, fig_dir), lambda: page_section(c, fig_dir), lambda: page_wood(c, fig_dir),
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
