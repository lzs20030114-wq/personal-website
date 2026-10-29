"""六单元环静态演示模型的全部几何（单位 mm）。图纸 v4：缩到 0.7 倍，配合处留余量。

单元 = P2-SKIN-01 v3 下凹槽版按 0.7 倍缩小：板长 70 / 47 / 30 / 47 / 70、板宽 52
（原 101 / 67.5 / 43 / 67.5 / 101 × 75）。木板厚 3、表皮厚 1、接缝 5 不缩：前两个
是买来的料的厚度，接缝是表皮弯过去要的长度，都和模型大小无关。A 面连 H1/H4、B 面
连 H2/H3 不变。六个单元竖着排成一圈，凹槽朝外翻成方箱（挑台）。

形状怎么来
- 芯：上下两块六边形板 + 六条托 R 插成一个架子。每个单元的端板 C1、C5 贴在
  托的直边和板边上，两道箍带从外面压住。两端距离被定成 186（带子平铺 284），
  多出来的 98 只能朝外折出去。
- 托：托 R 沿墙内侧立着，在箱子里伸出两小块。上面一个小三角托住台面 C2，
  下面一个小台阶贴住底面 C4。墙定住以后台面一锁，整个箱子就定了；底面那一块是
  保险，免得表皮铰链软、底面自己往下耷拉。两小块都只占靠墙的里角。

改过的版本（都在 2026-10-29）
- v1 每个单元背后一片定型肋，肋舌就是箱子内腔的形状，等于一个模子。
- v2 拿掉肋，改用立杆 + 四块板 + 箱子里的两根斜线。用户指出拉线不现实。
- v3 把 v1 的肋缩成托：箱子里只剩靠墙的一个小三角和一个小台阶。
- v4 整体缩到 0.7 倍省料（木板两张 → 一张），插槽、托、单元之间按激光割缝和
  折叠误差留余量。

坐标约定
- 平铺：x 沿带长（C1 一端为 0），y 沿板宽（0..W）。
- 折后剖面：r = 离环轴的距离，s = 从单元顶端往下量。
- 世界：Z 向上，z = RIB_H - s（托的下端落在桌面 z = 0，单元悬空 2 mm）。
"""

from __future__ import annotations

import math

# ---- 单元（P2-SKIN-01 v3 按 0.7 倍缩小，厚度与接缝不缩） -----------------------
SCALE = 0.7                   # 相对 v3 单元图纸（板宽 75、带长 400）
W = 52.0                      # 板宽 = 表皮宽（75 × 0.7 = 52.5，取整）
T_BOARD = 3.0                 # 木板厚
T_SKIN = 1.0                  # 表皮厚
GAP = 5.0                     # 接缝
LENS = [70.0, 47.0, 30.0, 47.0, 70.0]     # C1..C5（101 / 67.5 / 43 × 0.7，取整）
H = GAP / 2


def flat_starts() -> list[float]:
    xs, x = [], 0.0
    for L in LENS:
        xs.append(x)
        x += L + GAP
    return xs


FLAT_X = flat_starts()                     # [0, 75, 127, 162, 214]
STRIP_L = FLAT_X[-1] + LENS[-1]            # 284
assert LENS[0] == LENS[4] and LENS[1] == LENS[3], "上下对称：C1 = C5、C2 = C4"

# 表皮分段（平铺 x 区间），切法与 v3 图纸第 02 页相同：A 面在 H1/H4 连续、B 面在 H2/H3 连续
SKIN_A = {"A1": (0.0, FLAT_X[1] + LENS[1]), "A2": (FLAT_X[2], FLAT_X[2] + LENS[2]),
          "A3": (FLAT_X[3], STRIP_L)}
SKIN_B = {"B1": (0.0, LENS[0]), "B2": (FLAT_X[1], FLAT_X[3] + LENS[3]),
          "B3": (FLAT_X[4], STRIP_L)}

# ---- 环 ----------------------------------------------------------------------
N_UNITS = 6
APO = 50.0                    # 环轴到单元 B 面（内表面）的距离 = 六边形板的边心距

# ---- 折后剖面（理想铰点：每道缝绕凹侧表面、缝宽中点转 90°） ---------------------
# 全部接缝的连续表皮都在凹侧：H1/H4 凹侧是 A（外），H2/H3 凹侧是 B（箱内）。
A_FACE = APO + T_SKIN + T_BOARD          # 墙段板的 A 面
L1, L2, L3, L4, L5 = LENS

S_C2_A = L1 + H                          # C2 的 A 面（台面）
S_C2_B = S_C2_A + T_BOARD
R_C2_NEAR = A_FACE + H
R_C2_FAR = R_C2_NEAR + L2
R_C3_B = R_C2_FAR + H                    # C3 的 B 面（箱内正面）
S_C3_TOP = S_C2_B + H
S_C3_BOT = S_C3_TOP + L3
S_C4_B = S_C3_BOT + H
S_C4_A = S_C4_B + T_BOARD
R_C4_NEAR = R_C3_B - H                   # = R_C2_FAR
R_C4_FAR = R_C4_NEAR - L4                # = R_C2_NEAR
S_C5_TOP = S_C4_A + H
UNIT_H = S_C5_TOP + L5                   # 折后单元总高

assert abs(R_C4_FAR - H - A_FACE) < 1e-9, "H4 铰点应落回墙段 A 面"

BOARDS_FOLDED = {
    "C1": (APO + T_SKIN, A_FACE, 0.0, L1),
    "C2": (R_C2_NEAR, R_C2_FAR, S_C2_A, S_C2_B),
    "C3": (R_C3_B, R_C3_B + T_BOARD, S_C3_TOP, S_C3_BOT),
    "C4": (R_C4_FAR, R_C4_NEAR, S_C4_B, S_C4_A),
    "C5": (APO + T_SKIN, A_FACE, S_C5_TOP, UNIT_H),
}

SKIN_FOLDED = {
    "A1": [(A_FACE, A_FACE + T_SKIN, 0.0, S_C2_A - T_SKIN),
           (A_FACE, R_C2_FAR, S_C2_A - T_SKIN, S_C2_A)],
    "A2": [(R_C3_B + T_BOARD, R_C3_B + T_BOARD + T_SKIN, S_C3_TOP, S_C3_BOT)],
    "A3": [(A_FACE, R_C4_NEAR, S_C4_A, S_C4_A + T_SKIN),
           (A_FACE, A_FACE + T_SKIN, S_C4_A, UNIT_H)],
    "B1": [(APO, APO + T_SKIN, 0.0, L1)],
    "B2": [(R_C2_NEAR, R_C3_B, S_C2_B, S_C2_B + T_SKIN),
           (R_C3_B - T_SKIN, R_C3_B, S_C2_B, S_C4_B),
           (R_C4_FAR, R_C3_B, S_C4_B - T_SKIN, S_C4_B)],
    "B3": [(APO, APO + T_SKIN, S_C5_TOP, UNIT_H)],
}

OUTER_FRONT = R_C3_B + T_BOARD + T_SKIN          # 箱子正面外表面
PLATFORM_TOP_S = S_C2_A - T_SKIN                 # 台面（A 表皮上表面）
PLATFORM_BOT_S = S_C4_A + T_SKIN
OUTER_WALL = A_FACE + T_SKIN                     # 墙段外表面
BOX_IN_TOP = S_C2_B + T_SKIN                     # 箱内：C2 的 B 表皮下表面
BOX_IN_BOT = S_C4_B - T_SKIN                     # 箱内：C4 的 B 表皮上表面
BOX_IN_FRONT = R_C3_B - T_SKIN                   # 箱内：C3 的 B 表皮内表面

# ---- 加工余量 -----------------------------------------------------------------
# 激光割缝约 0.1–0.2：文件按图上尺寸画、不做割缝补偿，切出来的零件每边小约 0.1，
# 槽每边大约 0.1，正好往松的方向走。3 mm 层板实际常在 2.8–3.1 之间。
SLOT = 3.2                    # 插槽宽（板厚 3）：松 0.2–0.5，靠胶定住；先切试件 T 再定
COMB_WIDTHS = [3.0, 3.1, 3.2, 3.3, 3.4]
FOOT_CLR = 2.0                # 小台阶与底面之间：吃掉折叠误差，单元才推得进去；装好后垫一片表皮边角料
RIB_EXTRA = 2.0               # 托比单元长：托当脚，单元长短差一点也不顶桌
WALL_GAP_MIN = 5.0            # 单元之间的缝在内表面处不小于它：单元左右装偏一点不碰邻居

# ---- 芯：两块六边形板 + 六条托，十字插接 ----------------------------------------
PLATE_INSET = 18.0            # 两块板（及两道箍带）离单元两端（v3 图纸 25 × 0.7）
PLATE_S = [PLATE_INSET, UNIT_H - PLATE_INSET]
HOOP_S = PLATE_S
R_IN = 10.0                   # 托的内缘
SLOT_MID = (R_IN + APO) / 2   # 托上的槽与板上的槽在此碰头
RIB_H = UNIT_H + RIB_EXTRA

# ---- 托伸进箱子的两小块 ---------------------------------------------------------
GUS_TOP = BOX_IN_TOP          # 小三角上沿与台面内表皮平齐：单元靠自重坐在上面，台面高度由它定
GUS_R = OUTER_WALL + 15.0     # 小三角伸出墙外 15（箱子进深约 50）
GUS_TIP = 2.0                 # 三角尖削平 2，不做尖角
GUS_BOT = GUS_TOP + 16.0      # 三角斜边落回墙的高度
FOOT_BOT = BOX_IN_BOT - FOOT_CLR
FOOT_TOP = FOOT_BOT - 5.0
FOOT_R = OUTER_WALL + 10.0

assert GUS_BOT + 5.0 <= FOOT_TOP, "小三角和小台阶之间至少留 5 的直边"
assert L1 < GUS_TOP and FOOT_BOT < S_C5_TOP, "两小块都在墙的开口里，单元能顺着径向推进去"
assert GUS_R < BOX_IN_FRONT - 10 and FOOT_R < GUS_R
assert PLATE_S[0] + 6 < L1 and PLATE_S[1] - 6 > S_C5_TOP, "箍带压在墙上，不碰箱子"

HOOP_W = 10.0
HOOP_LAP = 20.0

HEX_SIDE = 2 * APO * math.tan(math.pi / 6)
assert HEX_SIDE - W >= WALL_GAP_MIN


# ---- 平面零件（局部坐标，y 向下与 SVG 一致） -------------------------------------
def rect(w, h):
    return [(0.0, 0.0), (w, 0.0), (w, h), (0.0, h)]


def part_board(name: str) -> dict:
    i = int(name[1]) - 1
    return {"outline": rect(LENS[i], W), "holes": [], "w": LENS[i], "h": W}


def part_skin(name: str) -> dict:
    x0, x1 = {**SKIN_A, **SKIN_B}[name]
    return {"outline": rect(x1 - x0, W), "holes": [], "w": x1 - x0, "h": W}


def rib_outline_rs() -> list[tuple[float, float]]:
    """托的轮廓，(r, s) 坐标。直边贴墙内侧，伸进箱子一个小三角、一个小台阶；
    内缘两处开口槽接六边形板。"""
    pts = [(R_IN, 0.0), (APO, 0.0),
           (APO, GUS_TOP), (GUS_R, GUS_TOP), (GUS_R, GUS_TOP + GUS_TIP), (APO, GUS_BOT),
           (APO, FOOT_TOP), (FOOT_R, FOOT_TOP), (FOOT_R, FOOT_BOT), (APO, FOOT_BOT),
           (APO, RIB_H), (R_IN, RIB_H)]
    for sp in reversed(PLATE_S):
        pts += [(R_IN, sp + SLOT / 2), (SLOT_MID, sp + SLOT / 2),
                (SLOT_MID, sp - SLOT / 2), (R_IN, sp - SLOT / 2)]
    return pts


def part_rib() -> dict:
    pts = [(r - R_IN, s) for r, s in rib_outline_rs()]
    return {"outline": pts, "holes": [], "w": GUS_R - R_IN, "h": RIB_H}


def plate_outline(phi0: float = 0.0) -> list[tuple[float, float]]:
    """六边形板，边心距 APO；每条边中点一条朝心的开口槽。中心为原点；
    phi0 = 第一条边法线的方位角。"""
    rv = APO / math.cos(math.pi / 6)
    pts = []
    for k in range(N_UNITS):
        a = phi0 + k * math.pi / 3
        n = (math.cos(a), math.sin(a))
        t = (-n[1], n[0])
        pts.append((rv * math.cos(a - math.pi / 6), rv * math.sin(a - math.pi / 6)))
        for (ro, to) in [(APO, -SLOT / 2), (SLOT_MID, -SLOT / 2),
                         (SLOT_MID, SLOT / 2), (APO, SLOT / 2)]:
            pts.append((ro * n[0] + to * t[0], ro * n[1] + to * t[1]))
    return pts


def part_plate() -> dict:
    # 平放排版：顶点朝左右，宽 = 外接圆直径、高 = 2·APO
    rv = APO / math.cos(math.pi / 6)
    pts = [(x + rv, y + APO) for x, y in plate_outline(math.pi / 6)]
    return {"outline": pts, "holes": [], "w": 2 * rv, "h": 2 * APO}


COMB_PITCH = 12.5


def part_comb() -> dict:
    """槽宽试件：五条槽，从左到右按 COMB_WIDTHS。"""
    w, h, depth = 70.0, 20.0, 10.0
    pts = [(0.0, 0.0)]
    for i, sw in enumerate(COMB_WIDTHS):
        cx = 10.0 + i * COMB_PITCH
        pts += [(cx - sw / 2, 0.0), (cx - sw / 2, depth), (cx + sw / 2, depth), (cx + sw / 2, 0.0)]
    pts += [(w, 0.0), (w, h), (0.0, h)]
    return {"outline": pts, "holes": [], "w": w, "h": h}


def hoop_geometry() -> dict:
    """箍带走的十二边形：贴着每个单元外表面，跨过单元之间的缝走直线。"""
    pts = []
    rm = OUTER_WALL + T_SKIN / 2
    for k in range(N_UNITS):
        a = k * math.pi / 3
        n = (math.cos(a), math.sin(a))
        t = (-n[1], n[0])
        for ty in (-W / 2, W / 2):
            pts.append((rm * n[0] + ty * t[0], rm * n[1] + ty * t[1]))
    per = sum(math.dist(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts)))
    # 箍带跨过单元之间的缝时走弦：弦的中点离环轴的距离
    chord_r = math.hypot(*[(pts[1][i] + pts[2][i]) / 2 for i in range(2)])
    return {"pts": pts, "perimeter": per, "chord_r": chord_r}


HOOP = hoop_geometry()
HOOP_L = math.ceil(HOOP["perimeter"] + HOOP_LAP)
assert APO / math.cos(math.pi / 6) < HOOP["chord_r"] - 1, "六边形板的角藏在箍带里"


def part_hoop() -> dict:
    return {"outline": rect(HOOP_L, HOOP_W), "holes": [], "w": HOOP_L, "h": HOOP_W}


# ---- 零件清单 -------------------------------------------------------------------
def parts_catalog() -> dict:
    return {
        "C1": dict(part_board("C1"), qty=12, mat="wood", label="C1 / C5", note="墙段端板"),
        "C2": dict(part_board("C2"), qty=12, mat="wood", label="C2 / C4", note="台面 / 底面"),
        "C3": dict(part_board("C3"), qty=6, mat="wood", label="C3", note="箱子正面"),
        "RIB": dict(part_rib(), qty=6, mat="wood", label="R 托", note="沿墙内侧，托住台面和底面"),
        "PLATE": dict(part_plate(), qty=2, mat="wood", label="P 六边形板", note="上下各一"),
        "COMB": dict(part_comb(), qty=1, mat="wood", label="T 槽宽试件", note="先切，定槽宽"),
        "A1": dict(part_skin("A1"), qty=12, mat="skin", label="A1 / A3", note="外表面，跨 H1 / H4"),
        "A2": dict(part_skin("A2"), qty=6, mat="skin", label="A2", note="箱子正面外"),
        "B1": dict(part_skin("B1"), qty=12, mat="skin", label="B1 / B3", note="墙段内表面"),
        "B2": dict(part_skin("B2"), qty=6, mat="skin", label="B2", note="箱内，跨 H2 / H3"),
        "HOOP": dict(part_hoop(), qty=2, mat="skin", label="S 箍带", note="上下两道"),
    }


# ---- 排版（sheet 坐标 y 向下；零件按 (key, x, y, rot, mirror) 摆放） ---------------
SHEET_WOOD = (600.0, 400.0)
SHEET_SKIN = (600.0, 400.0)
M = 4.0       # 板边留量
G = 5.0       # 零件间距


def _row(out, keys, x, y, widths):
    for key in keys:
        out.append((key, x, y, 0, False))
        x += widths[key] + G
    return x


def _nest_wood() -> list[list[tuple]]:
    """一张 600 × 400：左上三对托，托下面两块 P 板和一排小板，右边一列板。"""
    rib = part_rib()
    rw = rib["w"]
    spine = APO - R_IN
    # 两条托一对：第二条转 180°，伸出的两小块朝左插进第一条直边旁的空当，往下错开让开第一条的两小块
    flip_lo = RIB_H - FOOT_BOT                     # 转 180° 后两小块的最高处
    dy = (FOOT_BOT + G) - flip_lo
    dx = spine + G
    pair_w = dx + rw
    out = []
    for p in range(3):
        x0 = M + p * (pair_w + G)
        out.append(("RIB", x0, M, 0, False))
        out.append(("RIB", x0 + dx, M + dy, 180, False))
    ribs_w = 3 * pair_w + 2 * G
    widths = {"C1": LENS[0], "C2": LENS[1], "C3": LENS[2], "COMB": part_comb()["w"]}
    # 右边一列：每行一种组合，行高 = 板宽
    xr = M + ribs_w + G
    rows = [["C1"] * 3 + ["C3"]] * 4 + [["C2"] * 5] * 2
    for r, keys in enumerate(rows):
        _row(out, keys, xr, M + r * (W + G), widths)
    out.append(("COMB", xr, M + len(rows) * (W + G), 0, False))
    # 托下面：两块 P 板，再下面一排小板
    pl = part_plate()
    yb = M + dy + RIB_H + G
    out.append(("PLATE", M, yb, 0, False))
    out.append(("PLATE", M + pl["w"] + G, yb, 0, False))
    _row(out, ["C2", "C2", "C3", "C3"], M, yb + pl["h"] + G, widths)
    return [out]


def _nest_skin() -> list[tuple]:
    """一张 600 × 400：六排 52 宽的表皮，最下面两条箍带。"""
    w = {k: part_skin(k)["w"] for k in ("A1", "A2", "B1", "B2")}
    rows = [["A1"] * 4 + ["A2"] * 2,
            ["A1"] * 4 + ["A2"] * 2,
            ["A1"] * 4 + ["B1"],
            ["B2"] * 4,
            ["B2"] * 2 + ["B1"] * 4,
            ["B1"] * 7 + ["A2"] * 2]
    out = []
    for r, keys in enumerate(rows):
        _row(out, keys, M, M + r * (W + G), w)
    y = M + len(rows) * (W + G)
    out.append(("HOOP", M, y, 0, False))
    out.append(("HOOP", M, y + HOOP_W + G, 0, False))
    return out


NEST_WOOD = _nest_wood()
NEST_SKIN = _nest_skin()


def place(part: dict, x: float, y: float, rot: int, mirror: bool):
    """返回 (外轮廓点列, [(cx, cy, d)]) 的 sheet 坐标。rot 取 0 / 90（顺时针）/ 180。"""
    w, h = part["w"], part["h"]

    def tf(px, py):
        if mirror:
            px = w - px
        if rot == 90:            # 顺时针 90°：新宽 = h
            px, py = h - py, px
        elif rot == 180:
            px, py = w - px, h - py
        return (x + px, y + py)

    pts = [tf(*p) for p in part["outline"]]
    holes = [(*tf(hx, hy), d) for hx, hy, d in part["holes"]]
    return pts, holes


def summary() -> dict:
    return {
        "strip": STRIP_L,
        "unit_height": UNIT_H,
        "rib_height": RIB_H,
        "outer_wall": OUTER_WALL,
        "outer_front": OUTER_FRONT,
        "protrusion": OUTER_FRONT - OUTER_WALL,
        "platform_top_z": RIB_H - PLATFORM_TOP_S,
        "platform_bot_z": RIB_H - PLATFORM_BOT_S,
        "box_height": PLATFORM_BOT_S - PLATFORM_TOP_S,
        "box_inner": (BOX_IN_FRONT - OUTER_WALL, BOX_IN_BOT - BOX_IN_TOP),
        "corner_radius": math.hypot(OUTER_FRONT, W / 2),
        "hex_side": HEX_SIDE,
        "wall_gap_inner": HEX_SIDE - W,
        "wall_gap_outer": 2 * OUTER_WALL * math.tan(math.pi / 6) - W,
        "hoop_perimeter": HOOP["perimeter"],
        "hoop_len": HOOP_L,
        "gusset": {"reach_past_wall": GUS_R - OUTER_WALL, "height": GUS_BOT - GUS_TOP,
                   "c2_contact": GUS_R - R_C2_NEAR},
        "foot": {"reach_past_wall": FOOT_R - OUTER_WALL, "height": FOOT_BOT - FOOT_TOP,
                 "c4_contact": FOOT_R - R_C4_FAR, "clearance": FOOT_CLR},
        "contraction": STRIP_L - UNIT_H,
    }


if __name__ == "__main__":
    import json
    print(json.dumps(summary(), ensure_ascii=False, indent=1, default=str))
