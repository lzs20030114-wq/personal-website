"""六单元环静态演示模型的全部几何（单位 mm）。

单元 = P2-SKIN-01 v3 下凹槽版：五块 3 mm 板 + 两面 1 mm 表皮，板宽 75，
接缝 5，A 面连 H1/H4、B 面连 H2/H3。六个单元竖着排成一圈，凹槽朝外翻成方箱
（挑台），每个单元背后一片定型肋撑住折后的形状；六片肋插在上下两块六边形
板上，两条窄条把六个单元的上下端板箍在六边形板的边上。

坐标约定
- 平铺：x 沿带长（C1 一端为 0），y 沿板宽（0..75）。
- 折后剖面：r = 离环轴的距离，s = 从单元顶端往下量。
- 世界：Z 向上，z = RIB_H - s（肋的下缘落在桌面 z = 0）。
"""

from __future__ import annotations

import math

# ---- 单元（沿用 P2-SKIN-01 v3，一个数不改） ---------------------------------
W = 75.0                      # 板宽 = 表皮宽
T_BOARD = 3.0                 # 木板厚
T_SKIN = 1.0                  # 表皮厚
GAP = 5.0                     # 接缝
LENS = [101.0, 67.5, 43.0, 67.5, 101.0]   # C1..C5
H = GAP / 2

def flat_starts() -> list[float]:
    xs, x = [], 0.0
    for L in LENS:
        xs.append(x)
        x += L + GAP
    return xs

FLAT_X = flat_starts()        # [0, 106, 178.5, 226.5, 299]
assert abs(FLAT_X[-1] + LENS[-1] - 400.0) < 1e-9

# 表皮分段（平铺 x 区间），与 v3 图纸第 02 页一致
SKIN_A = {"A1": (0.0, 173.5), "A2": (178.5, 221.5), "A3": (226.5, 400.0)}
SKIN_B = {"B1": (0.0, 101.0), "B2": (106.0, 294.0), "B3": (299.0, 400.0)}

# ---- 环 ----------------------------------------------------------------------
N_UNITS = 6
APO = 72.0                    # 环轴到单元 B 面（内表面）的距离 = 六边形板的边心距
R_IN = 15.0                   # 肋的内缘
CLR = 0.5                     # 肋与表皮之间的余量
SLOT = 3.0                    # 插槽宽 = 实测板厚（先切试件）
SLOT_MID = (R_IN + APO) / 2   # 肋槽与板槽在此相接
PLATE_S = [25.0, 236.0]       # 两块六边形板（及两条箍带）的位置，从单元顶端量
RIB_H = 263.0                 # 肋高：比单元长 2 mm，单元悬空 2 mm，肋当脚
CHAMFER = 4.0                 # 肋舌前角倒角，让开表皮在内角的鼓包
CENTER_HOLE = 10.0            # 六边形板中心孔（可选，穿杆用）

# ---- 绑线 --------------------------------------------------------------------
TIE_DY = 4.0                  # 线孔对中心线的偏移，两孔骑在肋两侧
TIE_Y = (W / 2 - TIE_DY, W / 2 + TIE_DY)
HOLE_D = 2.0                  # 板与表皮上的线孔
RIB_HOLE_D = 3.0              # 肋上的线孔
RIB_HOLE_INSET = 5.0          # 肋孔中心离肋舌边缘

HOOP_W = 12.0
HOOP_LAP = 20.0

# ---- 折后剖面（理想铰点：每道折缝绕凹侧表面、缝宽中点转 90°） ---------------------
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

# 每块板折后的矩形 (r0, r1, s0, s1) 以及平铺 x 到折后点的映射
BOARDS_FOLDED = {
    "C1": (APO + T_SKIN, A_FACE, 0.0, L1),
    "C2": (R_C2_NEAR, R_C2_FAR, S_C2_A, S_C2_B),
    "C3": (R_C3_B, R_C3_B + T_BOARD, S_C3_TOP, S_C3_BOT),
    "C4": (R_C4_FAR, R_C4_NEAR, S_C4_B, S_C4_A),
    "C5": (APO + T_SKIN, A_FACE, S_C5_TOP, UNIT_H),
}

# 表皮折后矩形（内角处两段互相搭过去，外角处断开，与平铺分段一致）
SKIN_FOLDED = {
    "A1": [(A_FACE, A_FACE + T_SKIN, 0.0, S_C2_A - T_SKIN + 0.0),
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

# 肋舌：贴着箱内三面，各让 CLR
TAB_TOP = S_C2_B + T_SKIN + CLR
TAB_BOT = S_C4_B - T_SKIN - CLR
TAB_FRONT = R_C3_B - T_SKIN - CLR

OUTER_FRONT = R_C3_B + T_BOARD + T_SKIN          # 箱子正面外表面
PLATFORM_TOP_S = S_C2_A - T_SKIN                 # 台面（A 表皮上表面）
PLATFORM_BOT_S = S_C4_A + T_SKIN
OUTER_WALL = A_FACE + T_SKIN                     # 墙段外表面


def fold_map(x: float) -> tuple[str, float, float]:
    """平铺 x（落在某块板上）→ (板名, r, s)，取板中面。"""
    for i, (x0, L) in enumerate(zip(FLAT_X, LENS)):
        if x0 - 1e-9 <= x <= x0 + L + 1e-9:
            u = x - x0
            name = f"C{i+1}"
            r0, r1, s0, s1 = BOARDS_FOLDED[name]
            if name == "C1":
                return name, (r0 + r1) / 2, u
            if name == "C2":
                return name, R_C2_NEAR + u, (s0 + s1) / 2
            if name == "C3":
                return name, (r0 + r1) / 2, S_C3_TOP + u
            if name == "C4":
                return name, R_C4_NEAR - u, (s0 + s1) / 2
            return name, (r0 + r1) / 2, S_C5_TOP + u
    raise ValueError(f"x={x} 落在接缝里")


# 绑线：每个单元三处，C2 / C3 / C4 各一处，都在板的中点
TIES = []
for name in ("C2", "C3", "C4"):
    i = int(name[1]) - 1
    x = FLAT_X[i] + LENS[i] / 2
    _, r, s = fold_map(x)
    if name == "C2":
        hole = (r, TAB_TOP + RIB_HOLE_INSET)
    elif name == "C3":
        hole = (TAB_FRONT - RIB_HOLE_INSET, s)
    else:
        hole = (r, TAB_BOT - RIB_HOLE_INSET)
    TIES.append({"board": name, "flat_x": x, "rib_hole": hole})


# ---- 平面零件（局部坐标，y 向下与 SVG 一致） -------------------------------------
def rect(w, h):
    return [(0.0, 0.0), (w, 0.0), (w, h), (0.0, h)]


def part_board(name: str) -> dict:
    i = int(name[1]) - 1
    L = LENS[i]
    holes = []
    for t in TIES:
        if t["board"] == name:
            u = t["flat_x"] - FLAT_X[i]
            holes += [(u, TIE_Y[0], HOLE_D), (u, TIE_Y[1], HOLE_D)]
    return {"outline": rect(L, W), "holes": holes, "w": L, "h": W}


def part_skin(name: str) -> dict:
    x0, x1 = {**SKIN_A, **SKIN_B}[name]
    holes = []
    for t in TIES:
        if x0 < t["flat_x"] < x1:
            u = t["flat_x"] - x0
            holes += [(u, TIE_Y[0], HOLE_D), (u, TIE_Y[1], HOLE_D)]
    return {"outline": rect(x1 - x0, W), "holes": holes, "w": x1 - x0, "h": W}


def rib_outline_rs() -> list[tuple[float, float]]:
    """肋的轮廓，(r, s) 坐标，顺时针。内缘两处开口槽接六边形板。"""
    c = CHAMFER
    pts = [(R_IN, 0.0), (APO, 0.0), (APO, TAB_TOP),
           (TAB_FRONT - c, TAB_TOP), (TAB_FRONT, TAB_TOP + c),
           (TAB_FRONT, TAB_BOT - c), (TAB_FRONT - c, TAB_BOT),
           (APO, TAB_BOT), (APO, RIB_H), (R_IN, RIB_H)]
    for sp in reversed(PLATE_S):
        pts += [(R_IN, sp + SLOT / 2), (SLOT_MID, sp + SLOT / 2),
                (SLOT_MID, sp - SLOT / 2), (R_IN, sp - SLOT / 2)]
    return pts


def part_rib() -> dict:
    pts = [(r - R_IN, s) for r, s in rib_outline_rs()]
    holes = [(t["rib_hole"][0] - R_IN, t["rib_hole"][1], RIB_HOLE_D) for t in TIES]
    return {"outline": pts, "holes": holes, "w": TAB_FRONT - R_IN, "h": RIB_H}


def plate_outline(phi0: float = 0.0) -> list[tuple[float, float]]:
    """六边形板，边心距 APO；每条边中点一条朝心的开口槽。中心为原点。"""
    rv = APO / math.cos(math.pi / 6)
    pts = []
    for k in range(N_UNITS):
        a = phi0 + k * math.pi / 3
        n = (math.cos(a), math.sin(a))
        t = (-n[1], n[0])
        v0 = (rv * math.cos(a - math.pi / 6), rv * math.sin(a - math.pi / 6))
        pts.append(v0)
        for (ro, to) in [(APO, -SLOT / 2), (SLOT_MID, -SLOT / 2),
                         (SLOT_MID, SLOT / 2), (APO, SLOT / 2)]:
            pts.append((ro * n[0] + to * t[0], ro * n[1] + to * t[1]))
    return pts


def part_plate() -> dict:
    # 平放排版：顶点朝左右，宽 = 外接圆直径、高 = 2·APO
    rv = APO / math.cos(math.pi / 6)
    pts = [(x + rv, y + APO) for x, y in plate_outline(math.pi / 6)]
    return {"outline": pts, "holes": [(rv, APO, CENTER_HOLE)], "w": 2 * rv, "h": 2 * APO}


def part_comb() -> dict:
    """槽宽试件：五条槽 2.8 / 2.9 / 3.0 / 3.1 / 3.2，从左到右。"""
    w, h, depth = 70.0, 20.0, 10.0
    widths = [2.8, 2.9, 3.0, 3.1, 3.2]
    pts = [(0.0, 0.0)]
    for i, sw in enumerate(widths):
        cx = 10.0 + i * 12.5
        pts += [(cx - sw / 2, 0.0), (cx - sw / 2, depth), (cx + sw / 2, depth), (cx + sw / 2, 0.0)]
    pts += [(w, 0.0), (w, h), (0.0, h)]
    return {"outline": pts, "holes": [], "w": w, "h": h, "widths": widths}


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
    return {"pts": pts, "perimeter": per}


HOOP = hoop_geometry()
HOOP_L = math.ceil(HOOP["perimeter"] + HOOP_LAP)


def part_hoop() -> dict:
    return {"outline": rect(HOOP_L, HOOP_W), "holes": [], "w": HOOP_L, "h": HOOP_W}


# ---- 零件清单 -------------------------------------------------------------------
def parts_catalog() -> dict:
    return {
        # 木板 3 mm
        "C1": dict(part_board("C1"), qty=12, mat="wood", label="C1 / C5", note="墙段端板"),
        "C2": dict(part_board("C2"), qty=12, mat="wood", label="C2 / C4", note="台面 / 台底"),
        "C3": dict(part_board("C3"), qty=6, mat="wood", label="C3", note="箱子正面"),
        "RIB": dict(part_rib(), qty=6, mat="wood", label="R 定型肋", note="撑住折后形状"),
        "PLATE": dict(part_plate(), qty=2, mat="wood", label="P 六边形板", note="上下各一"),
        "COMB": dict(part_comb(), qty=1, mat="wood", label="T 槽宽试件", note="先切，定槽宽"),
        # 表皮 1 mm
        "A1": dict(part_skin("A1"), qty=12, mat="skin", label="A1 / A3", note="外表面，跨 H1 / H4"),
        "A2": dict(part_skin("A2"), qty=6, mat="skin", label="A2", note="箱子正面外"),
        "B1": dict(part_skin("B1"), qty=12, mat="skin", label="B1 / B3", note="墙段内表面"),
        "B2": dict(part_skin("B2"), qty=6, mat="skin", label="B2", note="箱内，跨 H2 / H3"),
        "HOOP": dict(part_hoop(), qty=2, mat="skin", label="S 箍带", note="上下两道"),
    }


# A3 与 A1 同形（掉头即是），B3 与 B1 同形，C5=C1、C4=C2：校验
assert part_skin("A3")["w"] == part_skin("A1")["w"]
assert sorted(round(part_skin("A1")["w"] - h[0], 6) for h in part_skin("A1")["holes"]) == \
       sorted(round(h[0], 6) for h in part_skin("A3")["holes"])
assert part_board("C4")["holes"] == part_board("C2")["holes"]


# ---- 排版（sheet 坐标 y 向下；零件按 (key, x, y, rot, mirror) 摆放） ---------------
SHEET_WOOD = (600.0, 400.0)
SHEET_SKIN = (1000.0, 500.0)
M = 4.0       # 板边留量
G = 5.0       # 零件间距


def _nest_wood() -> list[list[tuple]]:
    rib = part_rib()
    rw = rib["w"]                  # 132
    straight = APO - R_IN          # 57
    shift = (TAB_BOT - TAB_TOP) + G   # 第二片肋往下错开，肋舌插进第一片的空当
    pair_dx = rw + G - (rw - straight)   # 第二片（镜像）的原点
    pair_w = rw + G + straight
    a, b = [], []
    for p in range(3):
        x0 = M + p * (pair_w + G)
        a.append(("RIB", x0, M, 0, False))
        a.append(("RIB", x0 + pair_dx, M + shift, 0, True))
    y_strip = M + RIB_H + shift + G
    for i in range(7):
        a.append(("C2", M + i * (W + G), y_strip, 90, False))
    # 板 B
    pl = part_plate()
    b.append(("PLATE", M, M, 0, False))
    b.append(("PLATE", M, M + pl["h"] + G, 0, False))
    yb = M + 2 * pl["h"] + 2 * G
    for i in range(3):
        b.append(("C3", M + i * (LENS[2] + G), yb, 0, False))
    xg = M + pl["w"] + G
    cells = ["C1"] * 12 + ["C2"] * 4
    for k, key in enumerate(cells):
        cx, cy = k % 4, k // 4
        b.append((key, xg + cx * (L1 + G), M + cy * (W + G), 0, False))
    ys = M + 4 * (W + G)
    b.append(("C2", xg, ys, 90, False))
    for i in range(3):
        b.append(("C3", xg + (i + 1) * (W + G), ys, 90, False))
    b.append(("COMB", xg + 4 * (W + G), ys, 0, False))
    return [a, b]


def _nest_skin() -> list[tuple]:
    out = []
    row = lambda r: M + r * (W + G)
    w = {k: part_skin(k)["w"] for k in ("A1", "A2", "B1", "B2")}

    def run(r, seq, x=M):
        for key in seq:
            out.append((key, x, row(r), 0, False))
            x += w[key] + G
        return x

    run(0, ["A1"] * 5 + ["A2"])
    run(1, ["A1"] * 5 + ["A2"])
    run(2, ["A1"] * 2 + ["B2"] * 3)
    run(3, ["B2"] * 3 + ["B1"] * 3 + ["A2"])
    run(4, ["B1"] * 9)
    y5 = row(5)
    out.append(("HOOP", M, y5, 0, False))
    out.append(("HOOP", M, y5 + HOOP_W + G, 0, False))
    run(5, ["A2"] * 3, x=M + HOOP_L + G)
    return out


NEST_WOOD = _nest_wood()
NEST_SKIN = _nest_skin()


def place(part: dict, x: float, y: float, rot: int, mirror: bool):
    """返回 (外轮廓点列, [(cx, cy, d)]) 的 sheet 坐标。"""
    w, h = part["w"], part["h"]

    def tf(px, py):
        if mirror:
            px = w - px
        if rot == 90:            # 顺时针 90°：新宽 = h
            px, py = h - py, px
        return (x + px, y + py)

    pts = [tf(*p) for p in part["outline"]]
    holes = [(*tf(hx, hy), d) for hx, hy, d in part["holes"]]
    return pts, holes


def summary() -> dict:
    return {
        "unit_height": UNIT_H,
        "outer_wall": OUTER_WALL,
        "outer_front": OUTER_FRONT,
        "protrusion": OUTER_FRONT - OUTER_WALL,
        "platform_top_z": RIB_H - PLATFORM_TOP_S,
        "platform_bot_z": RIB_H - PLATFORM_BOT_S,
        "box_height": PLATFORM_BOT_S - PLATFORM_TOP_S,
        "corner_radius": math.hypot(OUTER_FRONT, W / 2),
        "hex_side": 2 * APO * math.tan(math.pi / 6),
        "wall_gap_inner": 2 * APO * math.tan(math.pi / 6) - W,
        "wall_gap_outer": 2 * OUTER_WALL * math.tan(math.pi / 6) - W,
        "hoop_perimeter": HOOP["perimeter"],
        "hoop_len": HOOP_L,
        "tab": (TAB_TOP, TAB_BOT, TAB_FRONT),
        "ties": TIES,
    }


if __name__ == "__main__":
    import json
    print(json.dumps(summary(), ensure_ascii=False, indent=1, default=str))
