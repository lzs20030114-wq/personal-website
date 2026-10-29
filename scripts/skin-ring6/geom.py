"""六单元环静态演示模型的全部几何（单位 mm）。v2：不用模子，形靠芯和键。

单元 = P2-SKIN-01 v3 下凹槽版：五块 3 mm 板 + 两面 1 mm 表皮，板宽 75，
接缝 5，A 面连 H1/H4、B 面连 H2/H3。六个单元竖着排成一圈，凹槽朝外翻成方箱
（挑台）。

形状怎么来（对应 Lab 2-5 的两件事）：
- 芯：中间一根立杆 + 四块六边形板。上下端板 C1 / C5 夹在板边上，两端的距离被
  定成 261（带子平铺 400），多出来的 139 只能朝外折出去。
- 键：每个箱子里两根斜线（上台面靠墙一端 → 下底面靠外一端），把折好的箱子锁成
  直角，不让它往下垮。箱子里面没有任何撑形状的零件。

v1（2026-10-29 上午）每个单元背后一片定型肋，肋舌就是箱子内腔的形状，等于一个
模子；用户指出拍照会拍到它、读起来像造假，v2 拿掉。

坐标约定
- 平铺：x 沿带长（C1 一端为 0），y 沿板宽（0..75）。
- 折后剖面：r = 离环轴的距离，s = 从单元顶端往下量。
- 世界：Z 向上，z = UNIT_H - s（单元下端与立杆都落在桌面 z = 0）。
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
DOWEL_D = 10.0                # 中间立杆（木圆棒）直径

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
UNIT_H = S_C5_TOP + L5                   # 折后单元总高 = 立杆长

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

# ---- 芯：四块六边形板 -----------------------------------------------------------
# 每块端板各压两块板：一块在 C1 / C5 的外端（箍带压上去），一块在靠箱子那一端
# （一针线把端板缝在板边上）。四个位置关于箱子中线对称，所以 C1 与 C5 是同一个零件。
PLATE_S = [12.0, 90.0, 171.0, 249.0]
HOOP_S = [PLATE_S[0], PLATE_S[3]]        # 两道箍带：压在外端那两块板的高度
STITCH_S = [PLATE_S[1], PLATE_S[2]]      # 端板缝在这两块板上
STITCH_DS = 3.5                          # 端板上那对孔离板中面的距离（孔在板上下各一个）
PLATE_HOLE_R = APO - 5.0                 # 板上的缝线孔：离板边 5
PLATE_HOLE_D = 3.0
HOLE_D = 2.0                             # 木板与表皮上的线孔

assert abs(sum(PLATE_S) / 4 - (S_C2_A + S_C4_A) / 2) < 1e-9, "板位应关于箱子中线对称"

HOOP_W = 12.0
HOOP_LAP = 20.0

# ---- 键：箱子里的斜线 -----------------------------------------------------------
# 斜线 AC：台面 C2 靠墙一端 → 底面 C4 靠外一端。箱子往下垮时它变长，拉住就垮不了。
# 斜线 BD（预留孔，默认不穿）：台面靠外 → 底面靠墙，挡另一个方向的歪。
BOND_U = 8.0                             # 锚点离板端
BOND_Y = (10.0, 65.0)                    # 两根斜线各在板宽两侧
BOND_DY = 3.0                            # 每个锚点一对孔，间距 6（线从一孔进、一孔出）

BOND_AC = ((R_C2_NEAR + BOND_U, BOX_IN_TOP), (R_C4_NEAR - BOND_U, BOX_IN_BOT))
BOND_BD = ((R_C2_FAR - BOND_U, BOX_IN_TOP), (R_C4_FAR + BOND_U, BOX_IN_BOT))
BOND_LEN = math.dist(*BOND_AC)


def _holes_flat() -> list[tuple[float, float, float, str]]:
    """全部线孔，平铺坐标 (x, y, 直径, 用途)。"""
    out = []
    # 端板缝线孔：C1 在 s = 90 上下各一个，C5 在 s = 171 上下各一个
    for s in STITCH_S:
        if s < L1:
            xc = s
        else:
            xc = FLAT_X[4] + (s - S_C5_TOP)
        for d in (-STITCH_DS, STITCH_DS):
            out.append((xc + d, W / 2, HOLE_D, "stitch"))
    # 键：C2 与 C4 上的锚点
    for name, kind_u in (("C2", ((BOND_U, "ac"), (L2 - BOND_U, "bd"))),
                         ("C4", ((BOND_U, "ac"), (L4 - BOND_U, "bd")))):
        i = int(name[1]) - 1
        for u, kind in kind_u:
            for yc in BOND_Y:
                for dy in (-BOND_DY, BOND_DY):
                    out.append((FLAT_X[i] + u, yc + dy, HOLE_D, kind))
    return out


HOLES_FLAT = _holes_flat()


# ---- 平面零件（局部坐标，y 向下与 SVG 一致） -------------------------------------
def rect(w, h):
    return [(0.0, 0.0), (w, 0.0), (w, h), (0.0, h)]


def _holes_in(x0, x1):
    return [(x - x0, y, d) for x, y, d, _ in HOLES_FLAT if x0 < x < x1]


def part_board(name: str) -> dict:
    i = int(name[1]) - 1
    x0 = FLAT_X[i]
    return {"outline": rect(LENS[i], W), "holes": _holes_in(x0, x0 + LENS[i]), "w": LENS[i], "h": W}


def part_skin(name: str) -> dict:
    x0, x1 = {**SKIN_A, **SKIN_B}[name]
    return {"outline": rect(x1 - x0, W), "holes": _holes_in(x0, x1), "w": x1 - x0, "h": W}


def plate_outline(phi0: float = 0.0) -> list[tuple[float, float]]:
    """六边形板，边心距 APO，中心为原点；phi0 = 第一条边法线的方位角。"""
    rv = APO / math.cos(math.pi / 6)
    return [(rv * math.cos(phi0 + k * math.pi / 3 - math.pi / 6),
             rv * math.sin(phi0 + k * math.pi / 3 - math.pi / 6)) for k in range(N_UNITS)]


def plate_holes(phi0: float = 0.0) -> list[tuple[float, float, float]]:
    hs = [(0.0, 0.0, DOWEL_D)]
    for k in range(N_UNITS):
        a = phi0 + k * math.pi / 3
        hs.append((PLATE_HOLE_R * math.cos(a), PLATE_HOLE_R * math.sin(a), PLATE_HOLE_D))
    return hs


def part_plate() -> dict:
    # 平放排版：顶点朝左右，宽 = 外接圆直径、高 = 2·APO
    rv = APO / math.cos(math.pi / 6)
    pts = [(x + rv, y + APO) for x, y in plate_outline(math.pi / 6)]
    holes = [(x + rv, y + APO, d) for x, y, d in plate_holes(math.pi / 6)]
    return {"outline": pts, "holes": holes, "w": 2 * rv, "h": 2 * APO}


# ---- 装配工具（做完拿走，不装在模型上） -------------------------------------------
JIG_SLOT = 3.3                 # 卡条槽宽，比板厚松一点
JIG_DEPTH = 12.0


def part_jig() -> dict:
    """装配卡条 J：一条 24 × 261 的长条，一侧开四道槽卡住四块板，定板距。"""
    w = 24.0
    pts = [(0.0, 0.0)]
    for s in PLATE_S:
        pts += [(s - JIG_SLOT / 2, 0.0), (s - JIG_SLOT / 2, JIG_DEPTH),
                (s + JIG_SLOT / 2, JIG_DEPTH), (s + JIG_SLOT / 2, 0.0)]
    pts += [(UNIT_H, 0.0), (UNIT_H, w), (0.0, w)]
    return {"outline": pts, "holes": [], "w": UNIT_H, "h": w}


GAUGE_LEG = 10.0
GAUGE_RELIEF = 4.0
GAUGE_TOP_S = 42.5


def gauge_outline_rs() -> list[tuple[float, float]]:
    """直角卡板 G，(r, s) 坐标：一条腿贴墙外表面，一条腿压在台面上，内角让开 H1 的表皮鼓包。"""
    r0, r1 = OUTER_WALL, OUTER_FRONT
    sp = PLATFORM_TOP_S
    e = GAUGE_RELIEF
    return [(r0, GAUGE_TOP_S), (r0 + GAUGE_LEG, GAUGE_TOP_S), (r0 + GAUGE_LEG, sp - GAUGE_LEG),
            (r1, sp - GAUGE_LEG), (r1, sp), (r0 + e, sp), (r0 + e, sp - e), (r0, sp - e)]


def part_gauge() -> dict:
    """直角卡板 G：在模型外面用，一边贴墙、一边托平台面，拉紧斜线后拿走。"""
    pts = [(r - OUTER_WALL, s - GAUGE_TOP_S) for r, s in gauge_outline_rs()]
    return {"outline": pts, "holes": [], "w": OUTER_FRONT - OUTER_WALL, "h": PLATFORM_TOP_S - GAUGE_TOP_S}


def part_holetest() -> dict:
    """孔径试件：五个孔 9.6 / 9.8 / 10.0 / 10.2 / 10.4，拿立杆去插，定中心孔。"""
    ds = [9.6, 9.8, 10.0, 10.2, 10.4]
    w, h = 80.0, 22.0
    return {"outline": rect(w, h), "holes": [(10.0 + 15.0 * i, h / 2, d) for i, d in enumerate(ds)],
            "w": w, "h": h, "diams": ds}


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
        "C1": dict(part_board("C1"), qty=12, mat="wood", label="C1 / C5", note="墙段端板"),
        "C2": dict(part_board("C2"), qty=12, mat="wood", label="C2 / C4", note="台面 / 底面"),
        "C3": dict(part_board("C3"), qty=6, mat="wood", label="C3", note="箱子正面"),
        "PLATE": dict(part_plate(), qty=4, mat="wood", label="P 六边形板", note="芯，四块相同"),
        "JIG": dict(part_jig(), qty=2, mat="wood", label="J 装配卡条", note="装配工具，用完拿走"),
        "GAUGE": dict(part_gauge(), qty=1, mat="wood", label="G 直角卡板", note="装配工具，用完拿走"),
        "HTEST": dict(part_holetest(), qty=1, mat="wood", label="T 孔径试件", note="先切，定中心孔"),
        "A1": dict(part_skin("A1"), qty=12, mat="skin", label="A1 / A3", note="外表面，跨 H1 / H4"),
        "A2": dict(part_skin("A2"), qty=6, mat="skin", label="A2", note="箱子正面外，无孔"),
        "B1": dict(part_skin("B1"), qty=12, mat="skin", label="B1 / B3", note="墙段内表面"),
        "B2": dict(part_skin("B2"), qty=6, mat="skin", label="B2", note="箱内，跨 H2 / H3"),
        "HOOP": dict(part_hoop(), qty=2, mat="skin", label="S 箍带", note="上下两道"),
    }


# C5 = C1、C4 = C2、A3 = A1、B3 = B1（掉个头即是）：校验孔位对称
def _mirror(p):
    return sorted((round(p["w"] - x, 6), round(y, 6)) for x, y, _ in p["holes"])


def _plain(p):
    return sorted((round(x, 6), round(y, 6)) for x, y, _ in p["holes"])


assert _plain(part_board("C5")) == _mirror(part_board("C1"))
assert _plain(part_board("C4")) == _mirror(part_board("C2")) == _plain(part_board("C2"))
assert _plain(part_skin("A3")) == _mirror(part_skin("A1"))
assert _plain(part_skin("B3")) == _mirror(part_skin("B1"))


# ---- 排版（sheet 坐标 y 向下；零件按 (key, x, y, rot, mirror) 摆放） ---------------
SHEET_WOOD = (600.0, 400.0)
SHEET_SKIN = (1000.0, 500.0)
M = 4.0       # 板边留量
G = 5.0       # 零件间距


def _nest_wood() -> list[list[tuple]]:
    pl = part_plate()
    pw, ph = pl["w"], pl["h"]                 # 166.3 × 144
    a = []
    # 板 A 第 1 行：三块 P，右边一列 C3 + G
    for i in range(3):
        a.append(("PLATE", M + i * (pw + G), M, 0, False))
    xr = M + 3 * (pw + G)
    a.append(("C3", xr, M, 0, False))
    a.append(("GAUGE", xr, M + W + G, 0, False))
    # 第 2 行：一块 P + C1 × 4，C1 下面两条卡条
    y2 = M + ph + G
    a.append(("PLATE", M, y2, 0, False))
    x = M + pw + G
    for i in range(4):
        a.append(("C1", x + i * (L1 + G), y2, 0, False))
    a.append(("JIG", x, y2 + W + G, 0, False))
    a.append(("JIG", x, y2 + W + G + part_jig()["h"] + G, 0, False))
    # 第 3 行：C1 × 5
    y3 = y2 + ph + G
    for i in range(5):
        a.append(("C1", M + i * (L1 + G), y3, 0, False))

    b = []
    rows = [["C1"] * 3 + ["C2"] * 3 + ["C3"],
            ["C2"] * 8,
            ["C2"] + ["C3"] * 4 + ["HTEST"]]
    y = M
    for row in rows:
        x = M
        for key in row:
            b.append((key, x, y, 0, False))
            x += (LENS[int(key[1]) - 1] if key[0] == "C" else part_holetest()["w"]) + G
        y += W + G
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
        "platform_top_z": UNIT_H - PLATFORM_TOP_S,
        "platform_bot_z": UNIT_H - PLATFORM_BOT_S,
        "box_height": PLATFORM_BOT_S - PLATFORM_TOP_S,
        "corner_radius": math.hypot(OUTER_FRONT, W / 2),
        "wall_gap_inner": 2 * APO * math.tan(math.pi / 6) - W,
        "wall_gap_outer": 2 * OUTER_WALL * math.tan(math.pi / 6) - W,
        "hoop_perimeter": HOOP["perimeter"],
        "hoop_len": HOOP_L,
        "bond_ac": BOND_AC,
        "bond_len": BOND_LEN,
        "contraction": 400.0 - UNIT_H,
        "holes": len(HOLES_FLAT),
    }


if __name__ == "__main__":
    import json
    print(json.dumps(summary(), ensure_ascii=False, indent=1, default=str))
