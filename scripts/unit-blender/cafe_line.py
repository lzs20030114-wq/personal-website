"""猫咖这一刻画成矢量线稿（第三轮，2026-11-09）。不经过 Blender：几何直接取 cafe-export.mjs 导出的那一刻
（单元外皮的世界坐标网格、家具的立体块、人的关节、猫的落点），房间按 cafe_scene.py 的尺寸另搭一份只为画线的。

python3 scripts/unit-blender/cafe_line.py <cafe.json> <机位 S|A> <输出.svg> [配色 名字] [选项 k=v …]

作者 2026-11-09 对第二轮的三条意见，这里各自怎么落：
  · 线的粗细「完全在瞎排」→ 线不再从像素里找。每根线在三维里就有类别（剖到的 / 单元的外轮廓 / 物体的外轮廓 /
    物体里面的线和房间的线 / 纹理），粗细只由类别定，五档，相邻两档差 1.6 倍，见 GRADE。远处的东西整体降一档。
  · 排线「没有疏密的条理」→ 疏密先按构图排好再去画，间距只有三档（7 / 14 / 28 cm，一档是上一档的两倍）：
    最远的那面墙排最密的竖线，把前面白的单元、家具和人托出来；地面是木板缝（中档）；落下的单元在地上有一块影子（密档、横向）；
    侧墙、天花留白，天花下收着的单元是一格一格的淡线。单元外皮上的缝是全图最密的线，它是主角。见 Plate.hatches。
  · 「从做一张图出发，不是怎么把模型转成图」→ 画什么、不画什么逐类写明：收着的单元只画一个方板加一截短筒；
    窗框只画线；剖切面只切房子，不切家具、单元和人（按中心在剖切面哪一侧整件留或整件去）。
"""
import json, math, os, sys
import numpy as np
from shapely.geometry import Polygon

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'drawing'))
import linework as LW  # noqa: E402
import linefig as LF  # noqa: E402
import poses  # noqa: E402
import cats as catlib  # noqa: E402
from ishi import Body, v, norm  # noqa: E402

# ---------------------------------------------------------------- 线型表（终稿 2400 px 宽时的像素）
# 五档，相邻两档 1.6 倍。每一档只给一类东西；远处的物体整体降一档（不是连续变细）。
GRADE = dict(cut=3.2, unit=2.0, obj=1.25, inner=0.78, tex=0.48)
DOWN = dict(cut='cut', unit='obj', obj='inner', inner='tex', tex='tex')
# 排线间距三档（米）
HATCH = dict(dense=0.07, mid=0.14, wide=0.28)

PALETTES = {
    # 黑白：只有墨线，单元留白，剖切面涂黑
    'ink': dict(paper='#F4F1EA', room='#F4F1EA', floor='#F4F1EA', sky='#F4F1EA', ink='#1D1B19', far='#77736C', tex='#9C978D',
                unit_line='#1D1B19', unit='#FFFFFF', unit_top='#FFFFFF', unit_under='#E4E0D6', unit_seam='#77736C',
                mech='#FFFFFF', furn='#FFFFFF', fig='#FFFFFF', hair='#1D1B19', cut='#1D1B19', stow='#B4AFA4', shadow='#77736C'),
    # 朱红：冷的墨蓝线 + 一个朱红给单元，剖切面墨蓝
    'vermilion': dict(paper='#EFECE4', room='#F7F5EF', floor='#E9E5DA', sky='#DCE3E6', ink='#1B2233', far='#7C8494', tex='#9AA1AE',
                      unit_line='#B3261A', unit='#F25A3C', unit_top='#FF7A5C', unit_under='#C93A22', unit_seam='#FFD0C2',
                      mech='#F7F5EF', furn='#FFFFFF', fig='#FFFFFF', hair='#1B2233', cut='#1B2233', stow='#B9BEC8', shadow='#1B2233'),
    # 夜：深底浅线，单元是亮的；人是浅色的一块，身上的线用深色（fig_line）
    'night': dict(paper='#12141C', room='#1C2030', floor='#262B3F', sky='#0C0E14', ink='#E9E4D4', far='#8189A3', tex='#525A78',
                  unit_line='#FFE7A8', unit='#FFB23E', unit_top='#FFD070', unit_under='#D9801E', unit_seam='#8A4A0C',
                  mech='#3A4160', furn='#2F3550', fig='#F3EEDF', fig_line='#12141C', hair='#12141C', cut='#E9E4D4', stow='#454C68', shadow='#0C0E14'),
    # 双色印刷：青绿线 + 荧光粉红，叠印的地方变深
    'riso': dict(paper='#F5F0E3', room='#F5F0E3', floor='#EFE2D9', sky='#D7ECE8', ink='#0E5F6E', far='#6FA3AA', tex='#8DB7BB',
                 unit_line='#0E5F6E', unit='#FF5A6E', unit_top='#FF8493', unit_under='#D93B55', unit_seam='#0E5F6E',
                 mech='#F5F0E3', furn='#FFFFFF', fig='#FFFFFF', hair='#0E5F6E', cut='#0E5F6E', stow='#A9CBCB', shadow='#0E5F6E'),
    # 色底：房间外面是一整块芥黄，房间里是白纸；单元涂墨色，缝是白线
    'ground': dict(paper='#E8B531', room='#FBF8F0', floor='#F1ECE0', sky='#F6DFA0', ink='#1E1C19', far='#7B766C', tex='#A6A092',
                   unit_line='#1E1C19', unit='#2A2724', unit_top='#3B3733', unit_under='#141210', unit_seam='#FBF8F0',
                   mech='#FBF8F0', furn='#FFFFFF', fig='#FFFFFF', hair='#1E1C19', cut='#1E1C19', stow='#BDB7A8', shadow='#1E1C19'),
    # 紫：站上项目二的颜色（globals.css 的 --p 系，这里取高色度的一档给单元），线是深紫蓝
    'violet': dict(paper='#EFEDF3', room='#F8F7FB', floor='#E6E2F0', sky='#EBF2DA', ink='#1C1F39', far='#7A7C9A', tex='#A3A4BD',
                   unit_line='#39258C', unit='#8362ED', unit_top='#A791FA', unit_under='#553ABA', unit_seam='#E1D7FF',
                   mech='#F8F7FB', furn='#FFFFFF', fig='#FFFFFF', hair='#1C1F39', cut='#1C1F39', stow='#C2C2D6', shadow='#1C1F39'),

    # ================= 第三轮之后（2026-11-10）：作者要从「双色印刷」和「芥黄色底」这两套再发展 =================
    # ---- 从双色印刷发展：全图只有两个专色，没有黑。线、头发、剖切面是第一个颜色，落下的单元是第二个颜色
    # 蓝 + 橙
    'riso_blue': dict(paper='#F4EFE3', room='#F4EFE3', floor='#ECE4D6', sky='#DCE3F1', ink='#27419A', far='#7F8FC4', tex='#9DAAD3',
                      unit_line='#27419A', unit='#FF6B3D', unit_top='#FF8C63', unit_under='#D94A22', unit_seam='#27419A',
                      mech='#F4EFE3', furn='#FFFFFF', fig='#FFFFFF', hair='#27419A', cut='#27419A', stow='#B4BEDD', shadow='#27419A'),
    # 墨绿 + 黄
    'riso_green': dict(paper='#F3F0E2', room='#F3F0E2', floor='#EAE8D6', sky='#E1EDD6', ink='#1D5645', far='#7FA596', tex='#9FBBAF',
                       unit_line='#1D5645', unit='#FFD91A', unit_top='#FFE55C', unit_under='#D9B000', unit_seam='#1D5645',
                       mech='#F3F0E2', furn='#FFFFFF', fig='#FFFFFF', hair='#1D5645', cut='#1D5645', stow='#B5CCC2', shadow='#1D5645'),
    # 红线 + 天蓝：线是红的（红线图），单元是冷的
    'riso_red': dict(paper='#F6F1E7', room='#F6F1E7', floor='#F0E8DC', sky='#D9ECF3', ink='#C2311F', far='#DD8E82', tex='#E3A79D',
                     unit_line='#C2311F', unit='#58BFE0', unit_top='#86D3EC', unit_under='#2F9CC2', unit_seam='#C2311F',
                     mech='#F6F1E7', furn='#FFFFFF', fig='#FFFFFF', hair='#C2311F', cut='#C2311F', stow='#EABFB7', shadow='#C2311F'),
    # 紫 + 青柠：站上项目二的紫当线，青柠给单元
    'riso_lime': dict(paper='#F2F0E8', room='#F2F0E8', floor='#E9E6DE', sky='#E4E0F2', ink='#3A2A8C', far='#8D83C4', tex='#A9A1D3',
                      unit_line='#3A2A8C', unit='#C5EE4F', unit_top='#D9F884', unit_under='#9CC62A', unit_seam='#3A2A8C',
                      mech='#F2F0E8', furn='#FFFFFF', fig='#FFFFFF', hair='#3A2A8C', cut='#3A2A8C', stow='#C1BBE0', shadow='#3A2A8C'),
    # 三色：蓝线 + 粉单元 + 黄地面；粉压在黄上的地方（单元朝下的面）是橙红
    'riso_three': dict(paper='#F6F1E4', room='#F6F1E4', floor='#FFEC80', sky='#D5E2F4', ink='#2B459F', far='#8493CC', tex='#7F92D6',
                       unit_line='#2B459F', unit='#FF5C9E', unit_top='#FF86B7', unit_under='#F2552E', unit_seam='#2B459F',
                       mech='#F6F1E4', furn='#FFFFFF', fig='#FFFFFF', hair='#2B459F', cut='#2B459F', stow='#B8C2E4', shadow='#2B459F'),

    # 蓝 + 橙，家具压一层线的浅色：白只留给人，人不再和沙发混在一起
    'riso_blue_tint': dict(paper='#F4EFE3', room='#F4EFE3', floor='#ECE4D6', sky='#DCE3F1', ink='#27419A', far='#7F8FC4', tex='#9DAAD3',
                           unit_line='#27419A', unit='#FF6B3D', unit_top='#FF8C63', unit_under='#D94A22', unit_seam='#27419A',
                           mech='#F4EFE3', furn='#E3E7F3', fig='#FFFFFF', hair='#27419A', cut='#27419A', stow='#B4BEDD', shadow='#27419A'),

    # ---- 从芥黄色底发展：颜色不给单元，给一整块底；图本身是黑白的，单元靠黑白反差跳出来
    # 钴蓝底
    'ground_blue': dict(paper='#2748D6', room='#FBF8F1', floor='#EEEFF4', sky='#B9C6F5', ink='#16181D', far='#72757D', tex='#A2A4AB',
                        unit_line='#16181D', unit='#22252B', unit_top='#343840', unit_under='#0F1114', unit_seam='#FBF8F1',
                        mech='#FBF8F1', furn='#FFFFFF', fig='#FFFFFF', hair='#16181D', cut='#16181D', stow='#B9BBC2', shadow='#16181D'),
    # 朱红底
    'ground_red': dict(paper='#E8442B', room='#FCF8F1', floor='#F3ECE3', sky='#F6C7BB', ink='#1C1917', far='#78726C', tex='#A8A199',
                       unit_line='#1C1917', unit='#292524', unit_top='#3A3533', unit_under='#131110', unit_seam='#FCF8F1',
                       mech='#FCF8F1', furn='#FFFFFF', fig='#FFFFFF', hair='#1C1917', cut='#1C1917', stow='#BEB7AE', shadow='#1C1917'),
    # 芥黄底，单元也是芥黄：外面的颜色落进屋里
    'ground_echo': dict(paper='#E8B531', room='#FBF8F0', floor='#F1ECE0', sky='#F6DFA0', ink='#1E1C19', far='#7B766C', tex='#A6A092',
                        unit_line='#1E1C19', unit='#E8B531', unit_top='#F3C851', unit_under='#C18F12', unit_seam='#8C6A0F',
                        mech='#FBF8F0', furn='#FFFFFF', fig='#FFFFFF', hair='#1E1C19', cut='#1E1C19', stow='#BDB7A8', shadow='#1E1C19'),
    # 钴蓝底，单元也是钴蓝
    'ground_echo_blue': dict(paper='#2748D6', room='#FBF8F1', floor='#EEEFF4', sky='#B9C6F5', ink='#16181D', far='#72757D', tex='#A2A4AB',
                             unit_line='#16181D', unit='#2748D6', unit_top='#4D69E8', unit_under='#1A31A6', unit_seam='#C9D3FA',
                             mech='#FBF8F1', furn='#FFFFFF', fig='#FFFFFF', hair='#16181D', cut='#16181D', stow='#B9BBC2', shadow='#16181D'),
    # 地面涂色：底不在屋外，在脚下。白的家具和人站在一块芥黄的地面上
    'ground_floor': dict(paper='#F4F1EA', room='#FDFBF6', floor='#F0BE3A', sky='#E7E3D8', ink='#1E1C19', far='#7B766C', tex='#B98A12',
                         unit_line='#1E1C19', unit='#2A2724', unit_top='#3B3733', unit_under='#141210', unit_seam='#FDFBF6',
                         mech='#FDFBF6', furn='#FFFFFF', fig='#FFFFFF', hair='#1E1C19', cut='#1E1C19', stow='#BDB7A8', shadow='#1E1C19'),
    # 粉底 + 墨绿：底是粉的，线和单元从黑换成墨绿
    'ground_pink': dict(paper='#F3A9BA', room='#FCF9F2', floor='#F3EEE4', sky='#F9D5DD', ink='#173F35', far='#6F8C83', tex='#9DB3AB',
                        unit_line='#173F35', unit='#1B4A3E', unit_top='#2A6253', unit_under='#0E2B24', unit_seam='#FCF9F2',
                        mech='#FCF9F2', furn='#FFFFFF', fig='#FFFFFF', hair='#173F35', cut='#173F35', stow='#B7C7C1', shadow='#173F35'),

    # ---- 两套合起来：两个专色，其中一个铺成底
    # 青绿底 + 粉：双色印刷那两个颜色，线的颜色铺到屋外
    'field_teal': dict(paper='#0E5F6E', room='#F5F0E3', floor='#EFE2D9', sky='#A5CDCE', ink='#0E5F6E', far='#6FA3AA', tex='#8DB7BB',
                       unit_line='#0E5F6E', unit='#FF5A6E', unit_top='#FF8493', unit_under='#D93B55', unit_seam='#0E5F6E',
                       mech='#F5F0E3', furn='#FFFFFF', fig='#FFFFFF', hair='#0E5F6E', cut='#093F4A', stow='#A9CBCB', shadow='#0E5F6E'),
    # 蓝底 + 橙：蓝 + 橙那一套（家具压浅蓝），线的蓝铺到屋外。和 riso_blue_tint 是同一套颜色的两种用法：整间房的图用这个，局部用那个
    'field_blue': dict(paper='#27419A', room='#F4EFE3', floor='#ECE4D6', sky='#AEBBE3', ink='#27419A', far='#7F8FC4', tex='#9DAAD3',
                       unit_line='#27419A', unit='#FF6B3D', unit_top='#FF8C63', unit_under='#D94A22', unit_seam='#27419A',
                       mech='#F4EFE3', furn='#E3E7F3', fig='#FFFFFF', hair='#27419A', cut='#1A2D73', stow='#B4BEDD', shadow='#27419A'),
    # 墨绿底 + 朱红：深色的底，屋里是亮的，单元一个朱红
    'field_dark': dict(paper='#1C3B33', room='#F6F2E8', floor='#ECE7DA', sky='#A9BFB6', ink='#1C3B33', far='#74908A', tex='#A0B5AE',
                       unit_line='#9E2416', unit='#F25A3C', unit_top='#FF7A5C', unit_under='#C93A22', unit_seam='#FFD0C2',
                       mech='#F6F2E8', furn='#FFFFFF', fig='#FFFFFF', hair='#1C3B33', cut='#11251F', stow='#B9C8C2', shadow='#1C3B33'),
}

HM = 1.70
UP = np.array([0.0, 0.0, 1.0])
WALL_T = 0.24
SLAB_T = 0.30


def main():
    src, view, out = sys.argv[1:4]
    pal_name = sys.argv[4] if len(sys.argv) > 4 else 'ink'
    opts = dict(a.split('=', 1) for a in sys.argv[5:])
    D = json.load(open(src))
    sc = Scene(D)
    plate = Plate(sc, view, opts)
    svg = plate.render(PALETTES[pal_name])
    open(out, 'w').write(svg)
    print('写出', out, f'{len(svg) / 1e6:.1f} MB')


# ================================================================ 场景：实体 + 人为加的线
class Obj:
    __slots__ = ('id', 'cls', 'V', 'T', 'center', 'lines', 'cuttable', 'tag')

    def __init__(self, oid, cls, V, T, cuttable=False, tag=None):
        self.id, self.cls, self.V, self.T, self.cuttable, self.tag = oid, cls, V, T, cuttable, tag
        self.center = V.mean(0) if len(V) else np.zeros(3)
        self.lines = []      # [(类别, 折线 (N, 3), 是不是贴在面上)]


def wall_mesh(axis, pos, s0, s1, H, openings, t=WALL_T, z_lo=0.0):
    """一面墙（带洞）做成一个实体：墙面按洞口的边切成格子，实心的格子出前后两个面，实心格与洞相邻处出洞口的侧面。
    axis = 'x'：墙面垂直于 x（沿 y 走），pos = 墙心的 x；'y' 同理。openings = [(a, b, z0, z1)]"""
    ss = sorted({s0, s1, *[o[0] for o in openings], *[o[1] for o in openings]})
    zs = sorted({z_lo, H, *[o[2] for o in openings], *[o[3] for o in openings]})
    ns, nz = len(ss) - 1, len(zs) - 1
    solid = np.ones((ns, nz), bool)
    for a, b, z0, z1 in openings:
        for i in range(ns):
            for j in range(nz):
                cs, cz = (ss[i] + ss[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2
                if a < cs < b and z0 < cz < z1:
                    solid[i, j] = False
    P = lambda s, z, w: (pos + w, s, z) if axis == 'x' else (s, pos + w, z)
    V, T = [], []

    def quad(p0, p1, p2, p3):
        k = len(V)
        V.extend([p0, p1, p2, p3]); T.extend([[k, k + 1, k + 2], [k, k + 2, k + 3]])

    h = t / 2
    for i in range(ns):
        for j in range(nz):
            if not solid[i, j]:
                continue
            a, b, c, d = ss[i], ss[i + 1], zs[j], zs[j + 1]
            quad(P(a, c, h), P(b, c, h), P(b, d, h), P(a, d, h))
            quad(P(a, c, -h), P(a, d, -h), P(b, d, -h), P(b, c, -h))
            for di, dj, e0, e1 in ((-1, 0, (a, c), (a, d)), (1, 0, (b, d), (b, c)), (0, -1, (b, c), (a, c)), (0, 1, (a, d), (b, d))):
                ii, jj = i + di, j + dj
                if ii < 0 or ii >= ns or jj < 0 or jj >= nz or not solid[ii, jj]:
                    quad(P(*e0, h), P(*e1, h), P(*e1, -h), P(*e0, -h))
    return LW.weld(np.array(V, float), np.array(T), 1e-4)


class Scene:
    def __init__(self, D):
        self.D = D
        m = D['meta']
        self.half = m['roomM'] / 2
        self.ceil = m['ceiling']
        self.pitch = m['pitch']
        self.objs = []
        self.frames = []      # 窗框、门框的线（没有实体）：[(类别, 折线, 在哪面墙)]
        self._room()
        self._furniture()
        self._units()

    def add(self, cls, V, T, cuttable=False, tag=None):
        o = Obj(len(self.objs), cls, np.asarray(V, float), np.asarray(T), cuttable, tag)
        self.objs.append(o)
        return o

    # ---- 房间
    def _room(self):
        h, t, C = self.half, WALL_T, self.ceil
        L = h + t
        self.floor = self.add('floor', *LW.box(-L, L, -L, L, -SLAB_T, 0.0), cuttable=True)
        self.ceiling = self.add('ceil', *LW.box(-L, L, -L, L, C, C + SLAB_T), cuttable=True)
        # 洞口照 cafe_scene.build_room：−Y 墙三扇窗；−X 墙窗、门、窗；+X 墙一扇门；+Y 实墙
        self.openings = {
            '-y': [(-2.95, -1.05, 0.45, 3.25, 'window'), (-0.95, 0.95, 0.45, 3.25, 'window'), (1.05, 2.95, 0.45, 3.25, 'window')],
            '-x': [(-2.9, -1.0, 0.45, 3.25, 'window'), (-0.55, 0.55, 0.0, 2.35, 'door'), (1.0, 2.9, 0.45, 3.25, 'window')],
            '+x': [(-0.55, 0.55, 0.0, 2.35, 'door')],
            '+y': [],
        }
        self.walls = {}
        for name, axis, pos in (('-y', 'y', -h - t / 2), ('+y', 'y', h + t / 2), ('-x', 'x', -h - t / 2), ('+x', 'x', h + t / 2)):
            ops = self.openings[name]
            # 沿 y 的墙（±x）只到墙角里侧，墙角归 ±y 墙，免得两面墙在角上重叠
            s0, s1 = (-L, L) if axis == 'y' else (-h, h)
            V, T = wall_mesh(axis, pos, s0, s1, C, [o[:4] for o in ops])
            self.walls[name] = self.add('wall', V, T, cuttable=True, tag=name)
            for a, b, z0, z1, kind in ops:
                P = (lambda s, z, pos=pos, axis=axis: (pos, s, z) if axis == 'x' else (s, pos, z))
                R = lambda a_, b_, c_, d_: np.array([P(a_, c_), P(b_, c_), P(b_, d_), P(a_, d_), P(a_, c_)], float)
                fw = 0.05
                self.frames.append(('frame', R(a + fw, b - fw, z0 + fw if kind == 'window' else z0, z1 - fw), name))
                if kind == 'window':
                    n = max(1, round((b - a) / 0.95))
                    for k in range(1, n):
                        mx = a + (b - a) * k / n
                        self.frames.append(('mullion', np.array([P(mx, z0 + fw), P(mx, z1 - fw)], float), name))
                    zt = z0 + (z1 - z0) * 0.78
                    self.frames.append(('mullion', np.array([P(a + fw, zt), P(b - fw, zt)], float), name))
                else:
                    self.frames.append(('mullion', np.array([P((a + b) / 2, z0), P((a + b) / 2, z1 - fw)], float), name))

    # ---- 家具（台架同一套立体块）
    def _furniture(self):
        self.furn = {}
        by = {}
        for b in self.D.get('furnBoxes', []):
            by.setdefault(b['furn'], []).append(b)
        for i, bs in by.items():
            V, T = LW.merge([LW.obox(b['c'], b['h'], b['rot']) for b in bs])
            f = self.D['furniture'][i]
            o = self.add('furn', V, T, tag=f['kind'])
            o.center = np.array([f['cx'], f['cy'], 0.4])
            self.furn[i] = o

    # ---- 单元
    def _units(self):
        self.units = {}
        self.mech = {}
        C = self.ceil
        for u in self.D['units']:
            x, y = u['x'], u['y']
            down = u['drop'] > 0.5
            plate = LW.box(x - 0.19, x + 0.19, y - 0.19, y + 0.19, C - 0.022, C)       # 天花上的方板
            if not down:
                # 收着的：只画一截短筒（收起来的那束布），在天花下排出一格一格的节奏；方板留给落下来的那几台
                top, foot = u['top'], u['foot']
                o = self.add('stow', *LW.prism(x, y, foot, C, 0.135, 20), tag=u['i'])
                o.center = np.array([x, y, (top + foot) / 2])
                a = np.linspace(0, 2 * math.pi, 41)
                z = foot + (top - foot) * 0.5
                o.lines.append(('stow_ring', np.c_[x + 0.136 * np.cos(a), y + 0.136 * np.sin(a), np.full(41, z)], True))
                continue
            V = np.vstack([np.array(u['cover'], float).reshape(-1, 3), np.array(u['gore'], float).reshape(-1, 3)])
            nc = len(u['cover']) // 3
            T = np.vstack([np.array(u['coverIdx']).reshape(-1, 3), np.array(u['goreIdx']).reshape(-1, 3) + nc])
            Vw, Tw = LW.weld(V, T, 1e-3)
            o = self.add('unit', Vw, Tw, tag=u['i'])
            o.center = np.array([x, y, (u['carriage'] + u['foot']) / 2])
            cov = np.array(u['cover'], float).reshape(20, 2, -1, 3)
            for j in range(20):               # 外皮上的缝：每条带一根
                o.lines.append(('seam', cov[j, 0], True))
            self.units[u['i']] = o
            # 机构：天花方板、吊杆、上夹环、芯、下夹环
            top, car, foot = u['top'], u['carriage'], u['foot']
            parts = [plate, LW.prism(x, y, top, C - 0.022, 0.030, 16)]
            if top > car + 0.03:
                parts.append(LW.prism(x, y, car, top, 0.017, 12))
            parts.append(LW.prism(x, y, car - 0.012, car + 0.030, 0.150, 28))
            parts.append(LW.prism(x, y, foot - 0.030, foot + 0.006, 0.140, 28))
            mo = self.add('mech', *LW.merge(parts), cuttable=True, tag=u['i'])
            mo.center = np.array([x, y, (C + foot) / 2])
            z = C - 0.25                       # 吊杆的节（伸缩杆每 0.42 m 一节）
            while z > top + 0.2:
                a = np.linspace(0, 2 * math.pi, 25)
                mo.lines.append(('mast_ring', np.c_[x + 0.0305 * np.cos(a), y + 0.0305 * np.sin(a), np.full(25, z)], True))
                z -= 0.42
            self.mech[u['i']] = mo


# ================================================================ 人和猫
class Placed:
    """人的局部系（单位 = 身高：x 向左、y 向上、z 向前）→ 世界 → 屏幕。同时就是 linefig 要的那个投影"""

    def __init__(self, cam, x, y, heading, hm=HM):
        self.cam, self.hm = cam, hm
        self.o = np.array([x, y, 0.0])
        self.f = np.array([math.cos(heading), math.sin(heading), 0.0])
        self.l = np.array([-math.sin(heading), math.cos(heading), 0.0])

    def world(self, p):
        return self.o + self.hm * (p[0] * self.l + p[1] * UP + p[2] * self.f)

    def local(self, w):
        r = (np.asarray(w, float) - self.o) / self.hm
        return v(r @ self.l, r[2], r @ self.f)

    def __call__(self, p):
        x, y, z = self.cam.px(self.world(p))
        return float(x), float(y), float(z) / self.hm, float(self.cam.ppm(z)) * self.hm

    def toward(self, p):
        d = self.cam.toward(self.world(p))
        return v(d @ self.l, d[2], d @ self.f)


HAIRS = ['short', 'fringe', 'bob', 'curly']


def fit_of(p, keep=None):
    st = p['outfit']['style']
    k = p['k']
    f = dict(top={'tee': 'tee', 'hoodie': 'long', 'jacket': 'long'}.get(st.get('top'), 'long'),
             bottom={'shorts': 'shorts', 'skirt': 'skirt'}.get(st.get('bottom'), 'wide' if k % 3 == 0 else 'trousers'),
             hair={'long': 'long', 'bun': 'bun', 'ponytail': 'pony', 'short': 'short'}.get(st.get('hair'), HAIRS[k % 4]),
             hat={'cap': 'cap', 'beanie': 'beanie'}.get(st.get('hat')))
    for key in ('grip', 'nohand', 'len', 'flare'):
        if keep and key in keep:
            f[key] = keep[key]
    return f


def assign_roles(D):
    """这一刻每个人在做什么（布景）：离猫最近、够得着的人摸它；站着的人举手机拍；坐着看猫的人里最近的一个拿逗猫棒，
    其余按顺序轮着捧杯、撑着膝盖、看手机。不看猫的人坐在桌边就把手搭在桌上"""
    people, cats = D['people'], D['cats']
    dist = lambda p, c: math.hypot(p['x'] - c['x'], p['y'] - c['y'])
    role = {}
    for ci, c in enumerate(cats):
        cand = sorted((dist(p, c), p['k']) for p in people if dist(p, c) < 1.0)
        if cand:
            role[cand[0][1]] = ('pet', ci)
    for ci, c in enumerate(cats):
        cand = sorted((dist(p, c), p['k']) for p in people if p['pose'] != 'sit' and p['k'] not in role and dist(p, c) < 2.6)
        if cand:
            role[cand[0][1]] = ('photo', ci)
    for ci, c in enumerate(cats):
        cand = sorted((dist(p, c), p['k']) for p in people if p['pose'] == 'sit' and p['k'] not in role and p['watchCat'] == ci and 1.0 <= dist(p, c) < 2.0)
        if cand:
            role[cand[0][1]] = ('wand', ci)
    rest = ['cup', 'lean', 'phone']
    n = 0
    for p in people:
        if p['k'] in role:
            continue
        if p['pose'] == 'sit':
            if p['watchCat'] is not None and p['watchCat'] >= 0:
                role[p['k']] = (rest[n % 3], p['watchCat']); n += 1
            else:
                role[p['k']] = ('table' if p.get('seatTable') is not None else 'back', -1)
        else:
            role[p['k']] = ('stand', p['watchCat'] if p['watchCat'] is not None else -1)
    return role


def build_person(p, cam, role, D):
    """返回 (Body, Placed)"""
    kind, ci = role
    cat = D['cats'][ci] if ci is not None and ci >= 0 else None
    cat_head = np.array(cat['headPivot']) if cat else None
    k = p['k']
    G = poses.G
    if p['pose'] != 'sit':
        if cat is not None:
            hd = math.atan2(cat['y'] - p['y'], cat['x'] - p['x'])
            d = math.hypot(cat['x'] - p['x'], cat['y'] - p['y'])
        else:
            hd, d = p['heading'], 0
        x, y = p['x'], p['y']
        if kind == 'pet' and cat['z'] < 0.3:
            b = poses.squat_pet()
            reach = 0.70                     # 蹲着伸手够得到的距离（m）
            x, y = cat['x'] - math.cos(hd) * reach, cat['y'] - math.sin(hd) * reach
        elif kind == 'pet':
            b = Body(LF.REAL); b.fit = {}
            b.trunk(pelvis=(0.01, 0.538, 0), tilt=3, side=-6, bend=8, twist=-8)
            b.leg(1, (0.045, G, 0.0), foot=(0.2, 0, 1)); b.leg(-1, (-0.09, G + 0.004, 0.07), knee_pole=(-0.2, 0, 1), foot=(-0.3, 0, 1))
            pl0 = Placed(cam, x, y, hd)
            t = pl0.local(cat_head + np.array([0, 0, 0.04]))
            LF.shrug(b, -1, fwd=0.03, up=0.01)
            b.arm(-1, t + v(0.0, 0.01, -0.03), elbow_pole=(-0.5, -1, 0), hand=(0, -0.3, 1))
            LF.hang(b, 1)
            LF.aim_head(b, t, gain=0.9)
        elif kind == 'photo':
            b = poses.phone_photo()
        elif k % 2:
            b = poses.chat_gesture()
        else:
            b = poses.stand_look_down()
        pl = Placed(cam, x, y, hd)
        if kind in ('photo',) and cat is not None:
            LF.aim_head(b, pl.local(cat_head), gain=0.9)
        b.fit = fit_of(p, b.fit)
        return b, pl
    # ---- 坐着的：腿取仿真给的髋位（座面高度、座深都是它按家具解的），上身和手按这一刻在做的事摆
    pl = Placed(cam, p['x'], p['y'], p['heading'])
    j = p['joints']
    legs = [(pl.local(L['hip']), pl.local(L['knee']), pl.local(L['ankle'])) for L in j['legs']]
    hip_mid = (legs[0][0] + legs[1][0]) / 2
    b = Body(LF.REAL); b.fit = {}
    lean = kind in ('pet', 'wand', 'lean', 'cup', 'table')
    tw = (-8, 6, -4, 9)[k % 4]
    if lean:
        b.trunk(pelvis=hip_mid + v(0, 0.014, 0.0), pitch=14 + (k % 3) * 3, bend=20, side=(3, -3, 0)[k % 3], twist=tw)
    else:
        b.trunk(pelvis=hip_mid + v(0, 0.014, -0.01), pitch=-14, bend=-2, side=(4, -4)[k % 2], twist=tw * 0.6)
    for hip, knee, ank in legs:
        s = 1 if hip[0] > hip_mid[0] else -1
        var = (k + (0 if s > 0 else 1)) % 4
        dz = (0.0, 0.085, -0.05, 0.03)[var]
        dx = (0.0, 0.01, 0.0, -s * 0.045)[var]
        b.leg(s, (ank[0] + dx, G + (0.016 if var == 2 else 0), ank[2] + dz), knee_pole=(s * 0.1, 1, 0.5), foot=(s * 0.2, 0, 1), toe_pitch=(0, 0, 22, 0)[var])
    hy = b.pelvis[1]
    knee = {s: b.legs[s]['knee'] for s in (1, -1)}
    t = pl.local(cat_head) if cat is not None else None

    def rest_on_knee(s):
        b.arm(s, knee[s] + v(-s * 0.035, 0.045, -0.045), elbow_pole=(s, -0.3, -0.3), hand=(-s * 0.5, -0.6, 0.6))

    if kind == 'pet':
        s = 1 if t[0] > 0 else -1
        tgt = t + v(0, 0.035, -0.02)
        reach = b.P['UA'] + b.P['FA'] + 0.03
        for _ in range(6):       # 够不着就再往前探
            if np.linalg.norm(tgt - b.sh[s]) <= reach:
                break
            b.trunk(pelvis=b.pelvis, pitch=math.degrees(math.asin(min(0.9, b.Rp[2, 1]))) + 6, bend=24, twist=-s * 12)
        LF.shrug(b, s, fwd=0.035, up=0.01)
        b.arm(s, tgt, elbow_pole=(s * 0.5, -1, 0), hand=(0, -0.35, 1))
        rest_on_knee(-s)
    elif kind == 'wand':
        s = 1 if t[0] > 0 else -1
        dirn = norm(t - b.sh[s])
        w = b.sh[s] + dirn * 0.27 + v(0, -0.07, 0)
        b.arm(s, w, elbow_pole=(s * 0.5, -1, -0.2), hand=tuple(dirn + v(0, 0.2, 0)))
        b.fit['grip'] = {s: True}
        A = b.arms[s]
        g = A['wrist'] + norm(A['tip'] - A['wrist']) * 0.045
        tip = g + norm(t - g + v(0, 0.12, 0)) * 0.26
        lure = t + v(0, 0.035, 0) + norm(g - t) * 0.07
        poses.wand(b, g, tip, lure)
        rest_on_knee(-s)
    elif kind == 'cup':
        c0 = (knee[1] + knee[-1]) / 2 + v(0, 0.105, -0.035)
        for s in (1, -1):
            b.arm(s, c0 + v(s * 0.036, -0.010, -0.024), elbow_pole=(s * 0.8, -1, 0), hand=(-s * 0.75, 0.25, 0.6))
        b.fit['grip'] = {1: True, -1: True}
        poses.cup(b, c0)
    elif kind == 'lean':
        rest_on_knee(1)
        b.arm(-1, (knee[1] + knee[-1]) / 2 + v(-0.02, 0.02, 0.03), elbow_pole=(-1, -0.4, -0.3), hand=(0.5, -0.8, 0.3))
    elif kind == 'phone':
        s = (1, -1)[k % 2]
        T = b.sh[s] + v(-s * 0.05, -0.085, 0.215)
        b.arm(s, T + v(0, -0.055, -0.012), elbow_pole=(s * 0.6, -1, -0.2), hand=(0, 1, 0.2))
        b.fit['grip'] = {s: True}
        poses.phone(b, T, (1, 0, 0), (0, 1, -0.25), w=0.046, h=0.090)
        b.arm(-s, v(-s * 0.05, hy + 0.075, 0.13), elbow_pole=(-s, -0.4, -0.4), hand=(s * 0.7, -0.4, 0.5))
    elif kind == 'table':
        top = 0.74 / HM + 0.012
        for s in (1, -1):
            b.arm(s, v(s * (0.05 + 0.03 * s), top, knee[s][2] + 0.085), elbow_pole=(s, -0.6, -0.2), hand=(-s * 0.6, 0, 0.8))
    else:
        b.arm(1, v(0.055, hy + 0.075, 0.145), elbow_pole=(1, -0.4, -0.4), hand=(-0.7, -0.4, 0.5))
        b.arm(-1, v(-0.26, hy + 0.165, -0.04), elbow_pole=(-0.3, 0.2, -1), hand=(-0.6, -0.5, 0.4))
    if t is not None:
        LF.aim_head(b, t, gain=0.9, htilt=(4, -4)[k % 2])
    elif kind == 'table':
        LF.aim_head(b, v(0.0, hy + 0.30, 0.9), gain=0.9)
    else:
        LF.aim_head(b, v((0.5, -0.5)[k % 2], hy + 0.48, 1.0), gain=0.8)
    b.fit = fit_of(p, b.fit)
    return b, pl


def cat_art(c, cam, wand=False):
    """猫是二维的画（cats.py），立在落点上。返回 (画法函数(ink, sc) → svg, 屏幕上的外形, 深度 m)"""
    B = np.array([c['x'], c['y'], c['z']])
    fx, fy = math.cos(c['heading']), math.sin(c['heading'])
    b0 = cam.px(B); b1 = cam.px(B + np.array([fx, fy, 0]) * 0.2)
    up = cam.px(B + UP * 0.01)
    sx = float(cam.ppm(b0[2])) / 100.0                 # 每 cm 多少像素
    vx, vy = (0.0, -sx) if cam.persp else (float(up[0] - b0[0]), float(up[1] - b0[1]))
    dx = float(b1[0] - b0[0])
    side = abs(dx) > 0.45 * math.hypot(b1[0] - b0[0], b1[1] - b0[1])
    pose = c['pose']
    if wand and side:
        cat = catlib.paw_up()
    elif pose == 'walk':
        cat = catlib.walk()
    elif pose in ('curl', 'loaf', 'lie'):
        cat = catlib.loaf() if side else catlib.curl()
    else:
        cat = catlib.sit_side() if side else catlib.sit_front()
    flip = -1 if (side and dx < 0) else 1
    ol = cat.outline()
    cxm = (ol.bounds[0] + ol.bounds[2]) / 2
    T = lambda x, y: (float(b0[0]) + flip * (x - cxm) * sx + y * vx, float(b0[1]) + y * vy)
    shape = Polygon([T(x, y) for x, y in ol.exterior.coords]).buffer(0)
    coat = {'tabby': 'tabby', 'cow': 'cow', 'black': 'black', 'tuxedo': 'black', 'calico': 'cow'}.get(c['coat'], 'cow')
    draw = lambda ink, seed: catlib.cat_svg(cat, T, max(sx, 0.4), style='line', coat=coat, seed=seed, uid=f'k{c["k"]}', ink=ink)
    return draw, shape, float(b0[2]) - 0.05


# ================================================================ 一张图
class Plate:
    def __init__(self, sc, view, opts):
        self.sc, self.view, self.opts = sc, view, opts
        self.W = int(opts.get('w', 2400))
        self.ss = int(opts.get('ss', 2))
        f = lambda k, d: float(opts.get(k, d))
        self.cut = None           # (法向, d)：只留 n·p ≥ d 那一侧
        self.hide = set()
        if view == 'S':
            # 剖透视：从 −X 那侧往 +X 看，剖切面 x = cut（在靠门那排沙发和第一排单元之间）
            cx = f('cut', -1.72)
            self.H = int(self.W * f('ratio', 0.6))
            eye = f('eye', 1.5)
            self.cam = LW.Cam(eye=(cx - f('dist', 7.6), f('ey', 0.0), eye), look=(cx, f('ey', 0.0), eye), W=self.W, H=self.H, fov=f('fov', 54), cy=f('cy', 0.58))
            self.cut = (np.array([1.0, 0, 0]), cx)
            self.far_z = f('far', f('dist', 7.6) + 3.4)
        elif view == 'A':
            # 轴测：水平剖在 cut，从斜上方往下看
            cz = f('cut', 3.45)
            self.H = int(self.W * f('ratio', 0.75))
            az, el = math.radians(f('az', 42)), math.radians(f('el', 38))
            d = np.array([math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)])
            tgt = np.array([f('tx', 0.0), f('ty', 0.0), f('tz', 1.25)])
            self.cam = LW.Cam(eye=tgt + d * 30, look=tgt, W=self.W, H=self.H, width=f('width', 13.2))
            self.cut = (np.array([0, 0, -1.0]), -cz)
            self.hide |= {'ceil', 'stow'}
            self.far_z = f('far', 1e9)
            # 朝着相机的两面墙不画（只在地上留一圈脚印），背着相机的两面墙剖在 cut 的高度
            self.near_walls = {name for name, n in (('+x', (1, 0, 0)), ('-x', (-1, 0, 0)), ('+y', (0, 1, 0)), ('-y', (0, -1, 0))) if np.dot(n, d) > 0}
        else:
            raise SystemExit('机位：S 剖透视 / A 轴测')

    # ---- 哪些实体进这张图
    def visible_objs(self):
        out = []
        for o in self.sc.objs:
            if o.cls in self.hide or (o.cls == 'wall' and o.tag in getattr(self, 'near_walls', ())):
                continue
            V, T = o.V, o.T
            if self.cut is not None:
                n, d = self.cut
                if o.cuttable:
                    s = V @ n - d
                    if (s < 0).all():
                        continue
                    if (s < 0).any():
                        V, T = LW.clip_mesh(V, T, n, d)
                elif o.center @ n - d < 0:        # 家具、单元：按中心在哪一侧整件留或整件去
                    continue
            out.append((o, V, T))
        return out

    def keeps(self, x, y, z=0.8, slack=0.0):
        if self.cut is None:
            return True
        n, d = self.cut
        return np.array([x, y, z]) @ n - d >= -slack

    # ---- 排线：每一组是 (间距档, 线段们, 贴在哪个实体上, 颜色键)
    def hatches(self):
        sc = self.sc
        h, C = sc.half, sc.ceil
        out = []
        seg = lambda a, b: np.array([[a, b]], float)
        if self.view == 'S':
            # 地面：木板缝顺着进深走（朝灭点收），中档
            for y in np.arange(-h + HATCH['mid'] / 2, h, HATCH['mid']):
                out.append((seg((-h, y, 0), (h, y, 0)), sc.floor.id, 'tex'))
            # 最远的那面墙：密档竖线
            w = sc.walls['+x']
            for y in np.arange(-h + HATCH['dense'] / 2, h, HATCH['dense']):
                out.append((seg((h, y, 0), (h, y, C)), w.id, 'tex'))
            # 没有窗的那面侧墙：宽档横线（朝灭点收）
            w = sc.walls['+y']
            for z in np.arange(HATCH['wide'], C, HATCH['wide']):
                out.append((seg((-h, h, z), (h, h, z)), w.id, 'tex'))
        else:
            for x in np.arange(-h + HATCH['mid'] / 2, h, HATCH['mid']):
                out.append((seg((x, -h, 0), (x, h, 0)), sc.floor.id, 'tex'))
            # 留着的两面墙里，背光的那一面（−X）排密档竖线，另一面留白：一眼分得出两个面
            w = sc.walls['-x']
            for y in np.arange(-h + HATCH['dense'] / 2, h, HATCH['dense']):
                out.append((seg((-h, y, 0), (-h, y, C)), w.id, 'tex'))
            # 收着的单元：在地上用虚线标出它落下来会占的那一格
            r0 = 0.345
            for u in sc.D['units']:
                if u['drop'] >= 0.5:
                    continue
                x, y = u['x'], u['y']
                sq = np.array([(x - r0, y - r0, 0), (x + r0, y - r0, 0), (x + r0, y + r0, 0), (x - r0, y + r0, 0), (x - r0, y - r0, 0)], float)
                out.append((np.stack([sq[:-1], sq[1:]], 1), sc.floor.id, 'grid'))
        # 落下的单元在地上的影子：密档、与木板缝垂直的短线；台面越高影子挪得越远（斜着投下来），看得出台面的高低
        r = 0.345
        for u in sc.D['units']:
            if u['drop'] < 0.5 or not self.keeps(u['x'], u['y']):
                continue
            ox, oy = (0.10, 0.42) if self.view == 'S' else (-0.34, -0.26)
            x, y = u['x'] + u['table'] * ox, u['y'] + u['table'] * oy
            if self.view == 'S':
                for xx in np.arange(x - r + HATCH['dense'] / 2, x + r, HATCH['dense']):
                    out.append((seg((xx, y - r, 0), (xx, y + r, 0)), sc.floor.id, 'shadow'))
            else:
                for yy in np.arange(y - r + HATCH['dense'] / 2, y + r, HATCH['dense']):
                    out.append((seg((x - r, yy, 0), (x + r, yy, 0)), sc.floor.id, 'shadow'))
        return out

    def render(self, pal):
        cam, ss, sc = self.cam, self.ss, self.sc
        D = sc.D
        k = self.W / 2400
        objs = self.visible_objs()
        if cam.persp:
            objs = [(o, *LW.clip_mesh(V, T, *cam.near_plane())) for o, V, T in objs]
        buf = LW.Buffers(cam, ss)
        for o, V, T in objs:
            shade = None
            if o.cls in ('unit', 'furn'):
                # 面朝上 = 1、朝下 = 2、朝侧 = 0（按朝着相机的那一面算，不依赖三角形绕向）
                n = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]])
                n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
                cen = V[T].mean(1)
                tc = (cam.eye - cen) if cam.persp else np.broadcast_to(-cam.f, cen.shape)
                nz = n[:, 2] * np.sign(np.einsum('ij,ij->i', n, tc))
                shade = np.where(nz > 0.5, 1, np.where(nz < -0.35, 2, 0))
            buf.add(V, T, o.id, shade)

        # ---- 人和猫先占深度（他们挡住身后的线；被前面的东西挡住的部分不画）
        roles = assign_roles(D)
        wand_cats = {ci for kind, ci in roles.values() if kind == 'wand'}
        flats = []          # (深度, 画法, 外形, [(遮罩, X0, Y0, key)])
        base = 10000
        for p in D['people']:
            b, pl = build_person(p, cam, roles[p['k']], D)
            if not self.keeps(pl.o[0], pl.o[1], slack=0.3):       # 人不切：贴着剖切面站的整个人留下
                continue
            lay = LF.layout(b, pl, b.fit)
            R, _, total, _ = lay
            zc = float(cam.px(pl.world(b.chest))[2])
            if cam.persp and (zc < 1.0 or total.bounds[2] < 0 or total.bounds[0] > self.W):
                continue
            masks = [buf.add_flat(r.poly, r.key * pl.hm, base + p['k']) for r in R]
            far = zc > self.far_z
            w = GRADE['inner' if far else 'obj'] * k
            draw = (lambda clip, b=b, pl=pl, lay=lay, w=w, far=far:
                    LF.draw(b, pl, b.fit, ink=pal['far'] if far else pal.get('fig_line', pal['ink']), paper=pal['fig'], w=w, clip=clip, lay=lay, tone={'hair': pal['far'] if far else pal['hair']})[0])
            flats.append((zc, draw, total, [m for m in masks if m]))
        for c in D['cats']:
            if not self.keeps(c['x'], c['y']):
                continue
            art, shape, zc = cat_art(c, cam, c['k'] in wand_cats)
            m = buf.add_flat(shape, zc, base + 500 + c['k'])
            far = zc > self.far_z
            draw = (lambda clip, art=art, c=c, far=far: self._clip_svg(art(pal['far'] if far else pal.get('fig_line', pal['ink']), c['k'] + 3), clip, f'cc{c["k"]}'))
            flats.append((zc, draw, shape, [m] if m else []))
        buf.done()
        self.buf = buf

        # ---- 线
        col = {}

        def put(grade, color, xy):
            if len(xy):
                col.setdefault((grade, color), []).append(xy)

        for o, V, T in objs:
            S, kind = LW.features(V, T, cam)
            r = LW.trace(buf, S, own=o.id)
            xy, p, far = r['xy'], r['prof'], r['z'] > self.far_z
            ink = lambda f: np.where(f, 1, 0)
            if o.cls in ('floor', 'ceil', 'wall'):
                put('inner', 'ink', xy[~far]); put('tex', 'far', xy[far])
            elif o.cls == 'furn':
                put('obj', 'ink', xy[p & ~far]); put('inner', 'ink', xy[~p & ~far])
                put('inner', 'far', xy[p & far]); put('tex', 'far', xy[~p & far])
            elif o.cls == 'unit':
                # 外轮廓最重；里面只留前面压后面的线（落差 7 cm 以上），带与带之间那些几毫米的台阶不画——那是缝，另有细线
                jump = r['jump'] > 0.07
                put('unit', 'unit_line', xy[p]); put('inner', 'unit_line', xy[~p & jump])
            elif o.cls == 'mech':
                put('inner', 'ink', xy[p & ~far]); put('tex', 'ink', xy[~p & ~far]); put('tex', 'far', xy[far])
            elif o.cls == 'stow':
                put('tex', 'stow', xy)
            for cls, pts, on_face in o.lines:
                seg = np.stack([pts[:-1], pts[1:]], 1)
                if self.cut is not None:
                    seg, _ = LW.clip_segs(seg, *self.cut)
                rr = LW.trace(buf, seg, own=o.id, by_id=on_face, min_px=0.6)
                put('tex', dict(seam='unit_seam', stow_ring='stow').get(cls, 'ink'), rr['xy'])
        for cls, pts, wall in sc.frames:
            if wall in getattr(self, 'near_walls', ()):
                continue
            seg = np.stack([pts[:-1], pts[1:]], 1)
            if self.cut is not None:
                seg, _ = LW.clip_segs(seg, *self.cut)
            rr = LW.trace(buf, seg, own=-9, tol=0.05)
            far = rr['z'] > self.far_z
            g = 'inner' if cls == 'frame' else 'tex'
            put(g, 'ink', rr['xy'][~far]); put(DOWN[g], 'far', rr['xy'][far])
        for seg, oid, ckey in self.hatches():
            rr = LW.trace(buf, seg, own=oid, by_id=True, min_px=0.6)
            put('tex', ckey, rr['xy'])
        dashed = col.pop(('tex', 'grid'), [])

        W, H = cam.W, cam.H
        s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
             f'<rect width="{W}" height="{H}" fill="{pal["paper"]}"/>']
        # ---- 面的底色
        fills, shades = {}, {}
        for o, _, _ in objs:
            c = dict(floor=pal['floor'], wall=pal['room'], ceil=pal['room'], furn=pal['furn'], unit=pal['unit'], mech=pal['mech'], stow=pal['room']).get(o.cls)
            fills[o.id] = LW.hexrgb(c)
            if o.cls == 'unit':
                shades[(o.id, 1)] = LW.hexrgb(pal['unit_top']); shades[(o.id, 2)] = LW.hexrgb(pal['unit_under'])
        s.append(LW.fill_image(buf, fills, default=LW.hexrgb(pal['sky']) if self.view == 'S' else None, shades=shades))
        if self.view == 'S':
            # 房间以外（剖切面外廓以外）盖回纸色，窗洞里才是窗外的颜色
            h, t, C = sc.half, WALL_T, sc.ceil
            L = h + t
            cxp = self.cut[1]
            q = np.array([(cxp, -L, -SLAB_T), (cxp, L, -SLAB_T), (cxp, L, C + SLAB_T), (cxp, -L, C + SLAB_T)], float)
            x, y, _ = cam.px(q)
            inner = 'M' + 'L'.join(f'{a:.2f},{b:.2f}' for a, b in zip(x, y)) + 'Z'
            s.append(f'<path d="M0,0H{W}V{H}H0Z {inner}" fill="{pal["paper"]}" fill-rule="evenodd"/>')
        # ---- 人和猫：远 → 近
        tol = 0.10
        for zc, draw, shape, masks in sorted(flats, key=lambda t: -t[0]):
            clip = None
            if masks:
                X0 = min(m[1] for m in masks); Y0 = min(m[2] for m in masks)
                X1 = max(m[1] + m[0].shape[1] for m in masks); Y1 = max(m[2] + m[0].shape[0] for m in masks)
                tot = np.zeros((Y1 - Y0, X1 - X0), bool); vis = np.zeros_like(tot)
                for m, mx, my, key in masks:
                    hh, ww = m.shape
                    zv = buf.zk[my:my + hh, mx:mx + ww]
                    zm = cam.zof(key)
                    tk = tol / (zm * zm) if cam.persp else tol
                    sub = (slice(my - Y0, my - Y0 + hh), slice(mx - X0, mx - X0 + ww))
                    tot[sub] |= m
                    vis[sub] |= m & (zv >= key - tk)
                occ = tot & ~vis
                if occ.sum() > 6 * ss * ss:
                    g = LW.mask_poly(occ, X0, Y0, ss)
                    if g is not None:
                        clip = shape.difference(g.buffer(0.3))
                        if clip.is_empty:
                            continue
            s.append(draw(clip))
        # ---- 场景的线（画在人和猫上面：被他们挡住的线在找线时已经去掉了）
        for grade in ('tex', 'inner', 'obj', 'unit'):
            for (g, c), parts in col.items():
                if g == grade:
                    s.append(LW.stroke(np.vstack(parts), pal[c], GRADE[g] * k))
        if dashed:
            s.append(LW.stroke(np.vstack(dashed), pal['stow'], GRADE['tex'] * k * 1.25, dash=f'{5 * k:.1f} {4 * k:.1f}', cap='butt'))
        # ---- 轴测里不画的那两面墙：在地上留一圈脚印
        if self.view == 'A':
            h, t = sc.half, WALL_T
            L = h + t
            foot = {'+x': (h, L, -h, h), '-x': (-L, -h, -h, h), '+y': (-L, L, h, L), '-y': (-L, L, -L, -h)}
            for name in self.near_walls:
                x0, x1, y0, y1 = foot[name]
                q = np.array([(x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0)], float)
                x, y, _ = cam.px(q)
                s.append(LW.polygon(np.c_[x, y], pal['floor'], pal['ink'], GRADE['inner'] * k))
        # ---- 剖切面
        if self.cut is not None:
            n, d = self.cut
            for o in sc.objs:
                if not o.cuttable or o.cls in self.hide or (o.cls == 'wall' and o.tag in getattr(self, 'near_walls', ())):
                    continue
                for loop in LW.section_caps(o.V, o.T, n, d):
                    if len(loop) < 3:
                        continue
                    x, y, _ = cam.px(loop)
                    s.append(LW.polygon(np.c_[x, y], pal['cut'], pal['cut'], 0.6 * k))
        s.append('</svg>')
        return ''.join(s)

    def _clip_svg(self, svg, clip, uid):
        if clip is None:
            return svg
        return f'<clipPath id="{uid}"><path d="{LF.path_d(clip)}"/></clipPath><g clip-path="url(#{uid})">{svg}</g>'


if __name__ == '__main__':
    main()
