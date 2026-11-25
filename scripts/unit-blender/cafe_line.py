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
import paint as PT  # noqa: E402
import light as LT  # noqa: E402
from ishi import Body, v, norm  # noqa: E402

# ---------------------------------------------------------------- 线型表（终稿 2400 px 宽时的像素）
# 五档，相邻两档 1.6 倍。每一档只给一类东西；远处的物体整体降一档（不是连续变细）。
GRADE = dict(cut=3.2, unit=2.0, unit_m=1.6, obj=1.25, inner=0.78, tex=0.48, hair=0.30)
DOWN = dict(cut='cut', unit='obj', unit_m='obj', obj='inner', inner='tex', tex='hair', hair='hair')
# 第五轮（黑白为主）多出的一档 hair 只给纹理（木纹、拼缝）；旧配色不用它。旧配色里 tex 降档还是 tex（见 _DOWN_OLD）
_DOWN_OLD = dict(DOWN, tex='tex')
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


# ================= 第四轮（2026-11-20）：作者「两套合起来可以；颜色还是老套，多出几套，不要只平涂，试渐变、纹理、颜色内的变化、混色」
# 面的上色走 drawing/paint.py（配色里多一项 fx），线、人、剖切面的外形不变。没有 fx 的配色一行不变。
def _with(base, **kw):
    d = dict(PALETTES[base]) if isinstance(base, str) else dict(base)
    fx = dict(d.get('fx') or {})
    fx.update(kw.pop('fx', {}))
    d.update(kw)
    d['fx'] = fx
    return d


# ---- 技法：同一组颜色（9-2 蓝底 + 橙）换六种上色法，只看技法本身
_BLUE, _ORANGE, _CREAM = '#27419A', '#FF6B3D', '#F4EFE3'
PALETTES.update({
    't_flat': _with('field_blue', fx=dict(shade='tint')),
    # 渐变：底从上往下加深；单元从台脚到台面由朱红走到琥珀；地面近处暖、远处冷
    't_grad': _with('field_blue', fx=dict(
        ground=('y', '#3B57C2', '#162563'), room=('y', '#F8F3EA', '#EDEBF2'), floor=('dist', '#F2E3CF', '#E3E3EF', 3.5, 11.0),
        unit=('z', '#F0461F', '#FFB347', 0.15, 1.5), sky=('y', '#C9D3F2', '#8FA2DE'), cut=('y', '#1D3180', '#0A1235'))),
    # 纹理：颜色不变，加油墨颗粒、纸纹，底是一团一团慢慢起伏的蓝
    't_grain': _with('field_blue', fx=dict(ground=('cloud', '#2F4CB0', '#1E3384', 0.22), grain=0.9, paper_grain=0.9)),
    # 网点：底用网点从上到下变密；单元朝下的面、地上的影子用蓝网点
    't_dots': _with('field_blue', fx=dict(
        ground=('ht', _BLUE, '#6B80CF', ('y', 0.15, 1.0), 5.0, 15), shade=('ht', _BLUE, 2.6, 45, 0.42),
        shadow=True, plates=[dict(what='shadow', ink=_BLUE, cover=0.55, ht=(3.2, 45))])),
    # 叠印 + 错版：单元的橙是单独一版，压在下面的颜色上（正片叠底），对线稿错开 3 像素；影子是一版半透明的蓝
    't_over': _with('field_blue', unit=_CREAM, fx=dict(
        unit=_CREAM, shade='flat', shadow=True, grain=0.5,
        plates=[dict(what='shadow', ink='#7F90D4', cover=0.9, grain=0.6),
                dict(what='unit', ink=_ORANGE, cover=0.95, shift=(5.0, -3.5), grain=0.6),
                dict(what='furn', ink='#C9D1EE', cover=0.75, shift=(-2.5, 1.5))])),
    # 颜色随用途：同一个橙按台面高低分四档（沙发茶几最浅、给猫的平台最深），底和地面在颜色里起伏
    't_use': _with('field_blue', fx=dict(
        unit_by={'table:sofa': '#FFB894', 'table:chair': '#FF8D5C', 'cat:half': '#FF6430', 'cat:flat': '#E8401C'},
        ground=('cloud', '#2C47A8', '#213887', 0.35), floor=('cloud', '#EFE6D7', '#E6DCCB', 0.05))),
})


# ---- 新配色八套：做法仍是「两套合起来」（线的颜色那一家铺到屋外当底，单元一个强调色），颜色换掉，面不只平涂
def _pal(**kw):
    base = dict(fig='#FFFFFF', unit_top=kw.get('unit'), unit_under=kw.get('unit'), mech=kw.get('room'), hair=kw.get('ink'),
                shadow=kw.get('ink'), unit_seam=kw.get('ink'))
    base.update(kw)
    return base


PALETTES.update({
    # 1 丁香紫 + 酸黄绿：底从浅丁香到深紫往下压；单元由台脚的黄绿走到台面的浅柠檬；朝下的面压紫色网点，混出橄榄色
    'n_lilac': _pal(paper='#7563C9', room='#F4F2F8', floor='#ECE8F4', sky='#CFC6F0', ink='#2E2470', far='#8C84BE', tex='#ADA6D4',
                    unit_line='#2E2470', unit='#D2F04B', furn='#E2DCF4', cut='#2A1F66', stow='#C3BCE2',
                    fx=dict(ground=('y', '#A190EA', '#45369F'), unit=('z', '#AEDB14', '#EEFC9A', 0.2, 1.5),
                            floor=('dist', '#F1ECF7', '#E0D9F0', 3.5, 11.0), shade=('ht', '#2E2470', 2.6, 45, 0.38),
                            cut=('y', '#3A2D85', '#1E1650'), grain=0.6, paper_grain=0.5)),
    # 2 黄昏：底是傍晚的天，上面丁香、下面桃色；单元群青，往上提亮；影子是一版半透明的淡紫
    'n_dusk': _pal(paper='#E9A890', room='#FBF6F0', floor='#F4E9E1', sky='#D9C3E6', ink='#3B1D46', far='#9A86A2', tex='#BDAEC2',
                   unit_line='#18207A', unit='#2C3FE0', unit_seam='#9AAAFF', furn='#F1E1E6', cut='#3B1D46', stow='#D8C9D2', shadow='#3B1D46',
                   fx=dict(ground=('y', '#A598DC', '#F8B796'), sky=('y', '#C2B5EA', '#F6C9B0'), unit=('z', '#1F31C4', '#6377FF', 0.2, 1.5),
                           cut=('y', '#4A2758', '#2B1233'), shadow=True, plates=[dict(what='shadow', ink='#C6B6E6', cover=0.9, grain=0.5)],
                           grain=0.5, paper_grain=0.5)),
    # 3 鼠尾草绿 + 电光蓝：底是一团一团起伏的灰绿；单元一个很亮的蓝，朝下的面压深蓝网点；影子用墨绿网点
    'n_sage': _pal(paper='#A3B38F', room='#F3F3EC', floor='#E7E9DC', sky='#D6DDC8', ink='#26331F', far='#86917C', tex='#A9B29E',
                   unit_line='#14209A', unit='#2747FF', unit_seam='#A6B6FF', furn='#DDE3CF', cut='#26331F', stow='#C5CCB8',
                   fx=dict(ground=('cloud', '#AEBE98', '#8FA27A', 0.3), shade=('ht', '#0B1460', 2.4, 45, 0.5), shadow=True,
                           plates=[dict(what='shadow', ink='#26331F', cover=0.55, ht=(3.0, 45))], cut=('y', '#33422A', '#1A2414'),
                           grain=0.7, paper_grain=0.6)),
    # 4 奶油黄 + 覆盆子：底中间亮、四周沉；单元按用途从浅粉（沙发前的茶几）到酒红（给猫的平台）
    'n_butter': _pal(paper='#F1DC8A', room='#FFFBF1', floor='#F7EDD5', sky='#F7E7B5', ink='#4A1426', far='#A67F89', tex='#C4A3AB',
                     unit_line='#4A1426', unit='#C2245A', unit_seam='#FFD3DF', furn='#F6E7C7', cut='#4A1426', stow='#E2D3B4',
                     fx=dict(ground=('rad', '#F8EAB0', '#E6C054', 0.5, 0.45, 0.75),
                             unit_by={'table:sofa': '#F58BA8', 'table:chair': '#E5507F', 'cat:half': '#BD2257', 'cat:flat': '#8C1440'},
                             cut=('y', '#5C1A30', '#3A0E1C'), grain=0.5, paper_grain=0.5)),
    # 5 酞青绿单色：全图一个绿从深到浅，单元是这个绿最亮的那一档，从下往上变浅
    'n_phthalo': _pal(paper='#0F4A42', room='#EEF5F0', floor='#E0ECE5', sky='#B6D6CC', ink='#0B3A35', far='#6E918B', tex='#9CB6B1',
                      unit_line='#0B3A35', unit='#2CE0B2', furn='#CFE3DA', cut='#072723', stow='#B9D0C9',
                      fx=dict(ground=('ang', '#18705F', '#082C27', 60), unit=('z', '#0FAE89', '#86F7D2', 0.2, 1.5),
                              floor=('dist', '#E7F1EB', '#D3E5DC', 3.5, 11.0), cut=('y', '#0E443D', '#041A17'), grain=0.6, paper_grain=0.4)),
    # 6 三色叠印：孔版的蓝、荧光粉、黄三个墨。地面是一版黄，单元是一版粉加一版黄（错开），影子是一版蓝——
    #    重叠的地方混出橙红、绿，错开的边上露出单色
    'n_trio': _pal(paper='#0078BF', room='#F7F3EA', floor='#F7F3EA', sky='#BFE0F2', ink='#0078BF', far='#7FB5DA', tex='#9CC7E3',
                   unit_line='#00578C', unit='#F7F3EA', unit_seam='#0078BF', furn='#F7F3EA', cut='#005A92', stow='#B5D4EA',
                   fx=dict(ground=('cloud', '#1A86C8', '#0066A6', 0.25), unit='#F7F3EA', shade='flat', shadow=True,
                           cut=('y', '#0A6AA6', '#00436E'), grain=0.3, paper_grain=0.5,
                           plates=[dict(what='floor', ink='#FFE800', cover=0.5, grain=0.25),
                                   dict(what='furn', ink='#0078BF', cover=0.16, shift=(-2.0, 1.5)),
                                   dict(what='shadow', ink='#0078BF', cover=0.55, grain=0.25),
                                   dict(what='unit', ink='#FF48B0', cover=0.95, shift=(4.0, -3.0), grain=0.2),
                                   dict(what='unit', ink='#FFE800', cover=0.7, shift=(-2.5, 2.0), grain=0.2)])),
    # 7 深靛夜 + 霓虹渐变：房间是暗的，底四周更暗；单元从台脚的橙走到台面的品红
    'n_night': _pal(paper='#121633', room='#1D2250', floor='#232A5C', sky='#0B0E24', ink='#E8E5F7', far='#8A8FC2', tex='#4A5290',
                    unit_line='#FFE1EA', unit='#FF5A7A', unit_seam='#7A1238', mech='#2E3570', furn='#2A3168', fig='#F3F0FF', fig_line='#121633',
                    hair='#121633', cut='#C9C4F0', stow='#3A4280', shadow='#0B0E24',
                    fx=dict(ground=('rad', '#2E3478', '#0B0E24', 0.5, 0.5, 0.8), unit=('z', '#FF6A2B', '#FF3DA8', 0.2, 1.5),
                            floor=('dist', '#2F3672', '#1C2150', 3.5, 11.0), cut=('y', '#D6D1F5', '#9C95D6'), grain=0.6, paper_grain=0.3)),
    # 8 钴蓝 + 镀铬：单元是一段一段明暗相间的银（镀铬的反光），底是钴蓝
    'n_chrome': _pal(paper='#2E45D8', room='#F5F6F8', floor='#ECEEF3', sky='#C8D0F5', ink='#13204F', far='#7A84A8', tex='#A3AAC4',
                     unit_line='#13204F', unit='#C8CED9', furn='#E3E7F0', cut='#18257A', stow='#C0C6D6',
                     fx=dict(ground=('y', '#3E58EA', '#1C2F9E'),
                             unit=('stops', ('z', None, None, 0.18, 1.55), ['#4A5263', '#C9D0DB', '#F8FAFD', '#8E97AA', '#E9EDF3', '#5B6477', '#F2F5F9']),
                             cut=('y', '#22339A', '#0F1A5C'), grain=0.4, paper_grain=0.4)),
})


# ================= 第四轮之二（2026-11-21）：作者「不光背景上有渐变，图板内部、物体上的颜色也可以渐变、加纹理、加肌理，做得有格调一些」
# 面的颜色跟着光走（drawing/light.py）：下午的太阳从 −Y 那面墙的窗户斜着照进来，物体朝窗的面暖、背着的面冷，
# 地上有窗格的光斑和单元、家具、人、猫的影子；材质贴在三维里：橡木地板、石灰墙、亚麻沙发、针织外皮。
_SUN = (-0.30, -0.85, 1.0)
_FILL = (-0.45, -0.75, 0.55)


def _lit(base, light=None, mat=None, **fxkw):
    lt = dict(sun=_SUN, fill=_FILL, face=(0.32, 0.28), ground=0.25, window=0.22, window_m=2.4, sun_k=0.32, sun_dim=0.34,
              occlude='objects', soft=0.05, ao=0.45, ao_px=22)
    lt.update(light or {})
    mt = dict(floor=('oak',), wall=('lime',), furn=('linen',), unit=('rib',), mech=('brushed',), amount=1.0)
    mt.update(mat or {})
    fx = dict(light=lt, mat=mt, hatch=('floor',), plates=[])     # 水磨石地面没有板缝：那几套写 hatch=()
    fx.update(fxkw)
    return _with(base, fx=fx)


# 燕麦 + 赤陶：屋外是线的那一家深苔绿，屋里是石灰的暖白墙、橡木地板、燕麦色亚麻沙发，单元一个赤陶色（针织外皮），影子蓝灰
PALETTES['n_oat'] = _pal(paper='#3A4634', room='#F3EDE3', floor='#D9C3A5', sky='#CBD5C2', ink='#2B2A25', far='#8D877B', tex='#B5A792',
                         unit_line='#5A1E0C', unit='#C4572F', unit_seam='#F5C9AE', furn='#EDDDC4', cut='#26301F', stow='#CEC3B2',
                         mech='#EEE9E0', fig='#FFFFFF', hair='#2B2A25', shadow='#2B2A25',
                         fx=dict(ground=('y', '#56644A', '#2A3424'), unit=('z', '#A63E1D', '#DE8350', 0.2, 1.5),
                                 sky=('y', '#DCE3D2', '#B7C4AC'), cut=('y', '#33402B', '#1A2214'), grain=0.45, paper_grain=0.45))
# 雾灰 + 钴蓝：浅的石色底，石墨线，屋里是灰白的墙和水磨石地面，沙发是圈绒，单元一个钴蓝（缎面，有一条高光）
PALETTES['n_stone'] = _pal(paper='#D9D4C9', room='#EFEDE8', floor='#D8D4CC', sky='#E4E7EA', ink='#26272B', far='#8A8A8C', tex='#B0ADA6',
                           unit_line='#0E1C6B', unit='#2A48D8', unit_seam='#A9B8FF', furn='#F1EEE7', cut='#2B2C31', stow='#C9C6BF',
                           mech='#EFEDE8', fig='#FFFFFF', hair='#26272B', shadow='#26272B',
                           fx=dict(ground=('cloud', '#DDD8CE', '#CBC5B9', 0.3), unit=('z', '#1C35B8', '#4F6CF2', 0.2, 1.5),
                                   cut=('y', '#3A3B42', '#1C1D22'), grain=0.4, paper_grain=0.55))

PALETTES.update({
    # M1 黄昏 + 光与材质
    'm_dusk': _lit('n_dusk', light=dict(cool='#A496D6', warm='#FFD3A6'), floor='#EEDFD3'),
    # M2 丁香紫 + 黄绿 + 光与材质
    'm_lilac': _lit('n_lilac', light=dict(cool='#9F95D6', warm='#F6FFD0')),
    # M3 燕麦 + 赤陶 + 光与材质（这一套是为材质配的颜色）
    'm_oat': _lit('n_oat', light=dict(cool='#93A3B8', warm='#FFE2B6')),
    # M4 蓝底 + 橙（9-2）+ 光与材质：地面换水磨石，沙发换圈绒，单元换缎面
    'm_blue': _lit('field_blue', light=dict(cool='#8E9CD6', warm='#FFE6C2'),
                   mat=dict(floor=('terrazzo', ['#C9C3B6', '#7F8FC4', '#FFFFFF', '#FF8D5C']), furn=('boucle',), unit=('satin',)),
                   grain=0.4, paper_grain=0.45, hatch=()),
    # M5 雾灰 + 钴蓝 + 光与材质
    'm_stone': _lit('n_stone', light=dict(cool='#9AA2B6', warm='#FFF0D8'),
                    mat=dict(floor=('terrazzo', ['#BDB8AE', '#8C8880', '#F4F2EC', '#5F6E9E']), furn=('boucle',), unit=('satin',)), hatch=()),
    # 窗户里进来的光斑（墙和天花也挡光）：给 M3 做对照
    'm_oat_win': _lit('n_oat', light=dict(cool='#93A3B8', warm='#FFE2B6', occlude='room', sun=(-0.30, -0.85, 0.72), sun_k=0.55,
                                          sun_dim=0.10, window=0.3)),
})


def _stage(base, k, **light):
    """逐层叠加：k = 1 平涂 · 2 朝向的冷暖 · 3 面里的渐变 · 4 太阳和影子 · 5 墙角压暗 · 6 材质（base 是 m_* 那一套）"""
    d = PALETTES[base]
    fx = dict(d['fx'])
    lt = dict(fx['light'])
    if k == 1:
        fx.pop('light'); fx.pop('mat')
        return dict(d, fx=fx)
    if k < 3:
        lt.update(ground=0, window=0)
    if k < 4:
        lt.update(sun_k=0)
    if k < 5:
        lt.update(ao=0)
    lt.update(light)
    fx['light'] = lt
    if k < 6:
        fx['mat'] = {}
    return dict(d, fx=fx)


for _b in ('m_oat', 'm_dusk'):
    for _k in range(1, 7):
        PALETTES[f'{_b}_s{_k}'] = _stage(_b, _k)
# 材质单看：同一套 M3，地面 / 沙发 / 单元换另一种
PALETTES['m_oat_alt'] = _lit('n_oat', light=dict(cool='#93A3B8', warm='#FFE2B6'),
                             mat=dict(floor=('terrazzo', ['#D2C7B4', '#9A8C76', '#F6F1E8', '#B8593A']), furn=('boucle',), unit=('satin',)), hatch=())


# ================= 第四轮之三（2026-11-21）：作者看了「物体上的颜色」：不要影子（平面化就是要去掉物体的真实感），
# 渐变也不是像画素描那样去表现体积，要的是颜色里的渐变，像做拼贴画：每个物体当成从一张渐变纸上剪下来的一块。
# 上色在 drawing/paint.py 的 _piece_layer：一块里所有的面同一道渐变，方向按块随机、只取渐变纸上的一段，和光无关；没有影子。
def _collage(base, pieces, common=None, **fxkw):
    pc = {}
    for c, sp in pieces.items():
        d = dict(common or {})
        d.update(sp)
        pc[c] = d
    fx = dict(pieces=pc, shade='flat', plates=[], hatch=('floor',))
    fx.update(fxkw)
    return _with(base, fx=fx)


def _pv(pieces, **over):
    """同一组纸，每一类都改几个参数（over 里写给哪几类都一样的那些）"""
    return {c: dict(sp, **over) for c, sp in pieces.items()}


# 黄昏那一族的纸：墙和地是桃色到淡紫，家具是浅粉、浅紫、杏色，单元是群青到紫、到天蓝
_DUSK_PAPER = dict(
    floor=dict(pairs=[('#F3DFD2', '#E2D8F1')], ang=[24]),
    wall=dict(pairs=[('#F7E2D7', '#E2D4F2'), ('#F1D6D4', '#FAEFE6'), ('#E7DBF4', '#F8E5DA')], span=0.7),
    ceil=dict(pairs=[('#EEE1EE', '#F8ECE4')]),
    furn=dict(pairs=[('#F0CED5', '#FBF1E9'), ('#D9CEF3', '#F8EFF4'), ('#F7DEC4', '#F1CCD8')], span=0.6),
    unit=dict(pairs=[('#1C31D0', '#7C62F6'), ('#2344E4', '#63A8FF'), ('#3124C0', '#C66BE6')], span=0.75),
    mech=dict(pairs=[('#FCF7F1', '#EEE5EF')]),
    stow=dict(pairs=[('#EDE0E9', '#F7EDE9')]),
)
_SHEET_ANG = dict(floor=24, wall=90, ceil=0, furn=125, unit=35, mech=90, stow=0)

PALETTES.update({
    # 对照：平涂，没有影子
    'k0': _with('n_dusk', fx=dict(shade='flat', plates=[], hatch=('floor',), unit='#2C3FE0', floor='#F4E9E1', room='#FBF6F0', furn='#F1E1E6')),
    # K1 一块一张纸：每块各自一道渐变，方向各不相同，只取渐变纸上的一段
    'k1': _collage('n_dusk', _DUSK_PAPER),
    # K2 同一张大纸：同一类东西从同一张渐变纸上剪下来，方向一致，颜色跨过几块连着走
    'k2': _collage('n_dusk', {c: dict(sp, sheet=True, ang=[_SHEET_ANG[c]]) for c, sp in _DUSK_PAPER.items()}),
    # K3 颗粒渐变：渐变用两种颜色的颗粒抖出来，近看一粒一粒，远看是渐变
    'k3': _collage('n_dusk', _pv(_DUSK_PAPER, grain=0.85)),
    # K4 色带：渐变压成四档，像丝网印刷
    'k4': _collage('n_dusk', _pv(_DUSK_PAPER, steps=4)),
    # K5 错位剪贴：颜色对线稿各自错开几像素，边上留一圈纸白
    'k5': _collage('n_dusk', _pv(_DUSK_PAPER, shift=4.0, edge=1.6)),
    # K6 网点：渐变换成网点，点越往一头越大
    'k6': _collage('n_dusk', _pv(_DUSK_PAPER, tex='ht', ht=(4.2, 45))),
})

# ---- 五套配色，都用同一个组合：一块一张纸 + 颗粒 + 错开一点、留纸边（K1 + K3 + K5，各减一档）
_MIX = dict(grain=0.5, shift=3.0, edge=1.2)
_LILAC_PAPER = dict(
    floor=dict(pairs=[('#ECE6F5', '#F5F0E4')], ang=[24]),
    wall=dict(pairs=[('#E5DEF6', '#F6F2FA'), ('#DCD2F2', '#EEF4D8'), ('#F1ECF9', '#E0D8F4')], span=0.7),
    ceil=dict(pairs=[('#ECE6F6', '#F6F3FA')]),
    furn=dict(pairs=[('#D8CEF2', '#F4F0FA'), ('#E8E2F7', '#E2F0C4'), ('#CEC3EE', '#EDE7F8')], span=0.6),
    unit=dict(pairs=[('#A6D418', '#F0FB9C'), ('#7DC62C', '#D6F258'), ('#C2E638', '#FFF2A6')], span=0.75),
    mech=dict(pairs=[('#F7F5FA', '#ECE8F4')]),
    stow=dict(pairs=[('#E2DDF0', '#F1EEF7')]),
)
_BLUE_PAPER = dict(
    floor=dict(pairs=[('#EFE5D4', '#E2E4F2')], ang=[24]),
    wall=dict(pairs=[('#F6EEE0', '#E0E5F4'), ('#E9E1D0', '#F7F2E8'), ('#DCE2F4', '#F5ECDE')], span=0.7),
    ceil=dict(pairs=[('#EEEAE4', '#F6F1E8')]),
    furn=dict(pairs=[('#D7DEF5', '#F6F1E6'), ('#C7D2F0', '#EEF0F8'), ('#E6E8F6', '#F3DAC8')], span=0.6),
    unit=dict(pairs=[('#FF5A2E', '#FFB04A'), ('#F0432A', '#FF8FA2'), ('#FF7838', '#FFD27A')], span=0.75),
    mech=dict(pairs=[('#F7F3EA', '#E9E6EE')]),
    stow=dict(pairs=[('#D8DDEE', '#ECEEF5')]),
)
_OAT_PAPER = dict(
    floor=dict(pairs=[('#E2CAAB', '#EEDBC2')], ang=[24]),
    wall=dict(pairs=[('#F4EDE2', '#E1E7D7'), ('#EEE5D6', '#F7F2EA'), ('#E5EADB', '#F3E8DB')], span=0.7),
    ceil=dict(pairs=[('#EEE9E0', '#F6F2EA')]),
    furn=dict(pairs=[('#EADAC1', '#F6EDE0'), ('#E1D1BB', '#F0DFD4'), ('#DADFCC', '#F2EBDF')], span=0.6),
    unit=dict(pairs=[('#B2442A', '#E88A5A'), ('#9C3922', '#D9A15E'), ('#C8553A', '#F2A98A')], span=0.75),
    mech=dict(pairs=[('#F2EEE6', '#E6E2D9')]),
    stow=dict(pairs=[('#DDD6C8', '#EDE7DC')]),
)
_BUTTER_PAPER = dict(
    floor=dict(pairs=[('#F8ECD0', '#F6DFDD')], ang=[24]),
    wall=dict(pairs=[('#FFF7E6', '#F8E1E1'), ('#FAEED3', '#FFFAF0'), ('#F5E4E6', '#FCF1DA')], span=0.7),
    ceil=dict(pairs=[('#FBF3E6', '#FFF9EF')]),
    furn=dict(pairs=[('#F5E1BF', '#FDF4E6'), ('#F3D4D4', '#FCF1E4'), ('#F8E9C6', '#F2D1DA')], span=0.6),
    unit=dict(pairs=[('#B61D54', '#F27A9B'), ('#8A1440', '#E24C76'), ('#C82A5E', '#FF9E7A')], span=0.75),
    mech=dict(pairs=[('#FFF9EE', '#F4EBDD')]),
    stow=dict(pairs=[('#EEE2CC', '#F8F1E2')]),
)
PALETTES.update({
    'c_dusk': _collage('n_dusk', _DUSK_PAPER, _MIX),
    'c_lilac': _collage('n_lilac', _LILAC_PAPER, _MIX),
    'c_blue': _collage('field_blue', _BLUE_PAPER, _MIX, grain=0.4, paper_grain=0.45),
    'c_oat': _collage('n_oat', _OAT_PAPER, _MIX),
    'c_butter': _collage('n_butter', _BUTTER_PAPER, _MIX),
})

# ================= 第四轮之四（2026-11-23）：作者看了「拼贴式渐变」：颜色要整体一点、渐变要有规律，
# 不能一个物体一个方向（十个物体十来个方向，乱）。四种有规律的排法，都只用一套颜色、每类一对：
# 同一个方向（每块各自一道渐变，方向全图一样）· 整张图一张纸（同一张纸从左到右剪满全图）·
# 颜色跟着物体在房间里的位置走（沿房间的一条对角线，房间一头暖一头冷）· 位置走法再压成色带。
_DUSK_ONE = dict(
    floor=dict(pairs=[('#F4DED0', '#E1D8F2')]),
    wall=dict(pairs=[('#F8E3D6', '#E3D6F3')]),
    ceil=dict(pairs=[('#F6E7E0', '#EAE1F4')]),
    furn=dict(pairs=[('#EFCDCB', '#D5CAF1')]),
    unit=dict(pairs=[('#1C3AD8', '#9A5CF2')]),
    mech=dict(pairs=[('#FCF5EF', '#F0E9F6')]),
    stow=dict(pairs=[('#F2E3DE', '#E8E0F2')]),
)
_ONE = dict(grain=0.45, edge=1.0)
_ROOM_CLS = ('floor', 'wall', 'ceil')
# 房间的一条对角线：世界 (1, −1)，在轴测和正视里都是画面上的左右；房间半宽 3.32 m，对角线上 ±4.7
_POS_AX = (1.0, -1.0)


def _pos_rule(steps=0, inner=0.7, paper=None):
    out = {}
    for c, sp in (paper or _DUSK_ONE).items():
        mode = 'pixel' if c in _ROOM_CLS else 'piece'
        d = dict(sp, pos=dict(axis=_POS_AX, range=(-4.2, 4.2), mode=mode, inner=0.0 if mode == 'pixel' else inner), ang=[180])
        if steps:
            d['steps'] = steps
        out[c] = d
    return out


PALETTES.update({
    # R1 同一个方向：每块各自一道渐变，方向全图一样（从右到左）
    'r1': _collage('n_dusk', {c: dict(sp, ang=[180]) for c, sp in _DUSK_ONE.items()}, _ONE),
    # R2 整张图一张纸：每一类一张和整张图一样大的纸，方向全一样，颜色跨过所有的块连着走
    'r2': _collage('n_dusk', {c: dict(sp, ang=[180], sheet='image') for c, sp in _DUSK_ONE.items()}, _ONE),
    # R3 跟着位置走：颜色按物体在房间里的位置（沿一条对角线）取；墙和地每个像素按自己的位置取，物体按中心取、块里再叠一点同方向的渐变
    'r3': _collage('n_dusk', _pos_rule(), _ONE),
    # R4 位置走法压成五档色带
    'r4': _collage('n_dusk', _pos_rule(steps=5), _ONE),
})

# ---- 跟着位置走（R3）换到另外三套配色：每类一对颜色，房间一头暖一头冷，单元是唯一的高色度
_BLUE_ONE = dict(
    floor=dict(pairs=[('#F1E6D3', '#DEE3F4')]),
    wall=dict(pairs=[('#F6EDDF', '#DCE2F5')]),
    ceil=dict(pairs=[('#F4EEE5', '#E6E9F6')]),
    furn=dict(pairs=[('#E9DBC4', '#C8D2F1')]),
    unit=dict(pairs=[('#FF4A28', '#FFB548')]),
    mech=dict(pairs=[('#F8F3EA', '#ECEDF5')]),
    stow=dict(pairs=[('#EFE6D8', '#E0E4F2')]),
)
_OAT_ONE = dict(
    floor=dict(pairs=[('#E6D0B2', '#E1E4D4')]),
    wall=dict(pairs=[('#F4EADC', '#E3E8D9')]),
    ceil=dict(pairs=[('#F2ECE2', '#E9ECE1')]),
    furn=dict(pairs=[('#E6D1B5', '#D3DAC4')]),
    unit=dict(pairs=[('#A63A22', '#E79C5E')]),
    mech=dict(pairs=[('#F4EFE6', '#E8E6DC')]),
    stow=dict(pairs=[('#E9DFCF', '#DFE2D4')]),
)
_LILAC_ONE = dict(
    floor=dict(pairs=[('#EDE5F5', '#F1F2DE')]),
    wall=dict(pairs=[('#E8E0F6', '#F1F3DF')]),
    ceil=dict(pairs=[('#F0EBF7', '#F4F4E8')]),
    furn=dict(pairs=[('#D6CCF2', '#E5EEC6')]),
    unit=dict(pairs=[('#8CC00E', '#E9F88C')]),
    mech=dict(pairs=[('#F7F5FA', '#EEF0E4')]),
    stow=dict(pairs=[('#E6E0F1', '#EEF0E2')]),
)
PALETTES.update({
    'r_blue': _collage('field_blue', _pos_rule(paper=_BLUE_ONE), _ONE, paper_grain=0.45),
    'r_oat': _collage('n_oat', _pos_rule(paper=_OAT_ONE), _ONE),
    'r_lilac': _collage('n_lilac', _pos_rule(paper=_LILAC_ONE), _ONE),
})

# ---- 相邻色（2026-11-23，作者「配色如果不是撞色呢，比如用色环的相邻色」）：仍用 R3 跟着位置走，
# 整张图只用色环上相邻的一段色相（约 60–90°），屋外的底、线、房间、单元都在这一段里；
# 层次不靠色相对比，靠深浅和浓淡：房间最浅最灰，家具浅一档，单元最深最浓，线是这一段里最深的颜色。
def _ana(g0, g1, ink, cut, sky, far, tex, uline, papers):
    base = _pal(paper=g1, room=papers['wall']['pairs'][0][0], floor=papers['floor']['pairs'][0][0], sky=sky, ink=ink,
                far=far, tex=tex, unit_line=uline, unit=papers['unit']['pairs'][0][0], furn=papers['furn']['pairs'][0][0],
                cut=cut, stow=papers['stow']['pairs'][0][0],
                fx=dict(ground=('y', g0, g1), cut=('y', cut, cut), grain=0.5, paper_grain=0.5))
    return _collage(base, _pos_rule(paper=papers), _ONE)


def _paper7(floor, wall, ceil, furn, unit, mech, stow):
    return dict(floor=dict(pairs=[floor]), wall=dict(pairs=[wall]), ceil=dict(pairs=[ceil]), furn=dict(pairs=[furn]),
                unit=dict(pairs=[unit]), mech=dict(pairs=[mech]), stow=dict(pairs=[stow]))


PALETTES.update({
    # P6 暖：黄 → 橙 → 红
    'a_warm': _ana('#F6CB80', '#E8854F', '#5A1E0E', '#4A180C', '#F9DDB8', '#B07A62', '#D9A98E', '#7A1F0F',
                   _paper7(('#FBEFD6', '#F8DCCB'), ('#FCF2DC', '#F9DFD0'), ('#FCF4E4', '#FAE6DA'), ('#F6DDB0', '#F2C3AE'),
                           ('#F5A21B', '#D93A1E'), ('#FFF8EC', '#FCEDE4'), ('#F5E2C6', '#F1D2C2'))),
    # P7 冷：青绿 → 蓝
    'a_cool': _ana('#A6DAD3', '#4774C2', '#0F2E4A', '#0B2238', '#C7E6EC', '#6F93A8', '#9DBACB', '#0B2A55',
                   _paper7(('#E3F3EE', '#E0E8F6'), ('#E9F6F2', '#E5ECF8'), ('#EEF7F5', '#EBF0F9'), ('#C7E6DE', '#C6D5F0'),
                           ('#11A38C', '#1F4FD6'), ('#F5FBF9', '#F1F5FC'), ('#D5EAE5', '#D3DDF0'))),
    # P8 紫 → 品红 → 粉
    'a_magenta': _ana('#CDB0EE', '#EE9FC2', '#3A1240', '#2C0C31', '#E3CFF2', '#9E7FA8', '#C3A8CB', '#4A1050',
                      _paper7(('#EFE6F7', '#F8E3EC'), ('#F2EAF9', '#FAE8EF'), ('#F5EFFA', '#FBEEF2'), ('#DCCBF1', '#F3CBDC'),
                              ('#7A3BE0', '#E0337E'), ('#FAF7FC', '#FDF4F7'), ('#E4D8F0', '#F1DAE3'))),
    # P9 黄绿 → 绿 → 青
    'a_green': _ana('#D3E592', '#55A891', '#173826', '#10291C', '#DDEDC0', '#7E9A84', '#A7BCA9', '#123F2A',
                    _paper7(('#F1F5DD', '#DFF1EA'), ('#F4F7E4', '#E5F4EE'), ('#F6F8EA', '#EAF5F1'), ('#DCE8B4', '#BFE2D3'),
                            ('#8DBE1A', '#0E8F78'), ('#FAFBF2', '#F2F9F6'), ('#E4EBCB', '#D2E6DD'))),
    # P10 蓝 → 靛 → 紫
    'a_violet': _ana('#AEBDF2', '#7C61C9', '#1A1650', '#120F3B', '#CFD8F6', '#7F80B4', '#A8A8D2', '#151A6E',
                     _paper7(('#E6ECFA', '#ECE5F8'), ('#EAEFFB', '#EFE9F9'), ('#EFF2FC', '#F2EEFA'), ('#CBD6F4', '#D8CAF1'),
                             ('#2453E6', '#7C3FE4'), ('#F6F8FE', '#F7F4FD'), ('#D8DFF3', '#DFD6F0'))),
    # P11 赭 → 赤陶 → 玫瑰棕（浓度压低的一段暖色）
    'a_earth': _ana('#DCBE92', '#BA7862', '#3E2418', '#2E1A11', '#EAD8C2', '#A3826F', '#C8AE9C', '#5A2A18',
                    _paper7(('#F2E7D3', '#F0DED6'), ('#F6EEE0', '#F3E4DD'), ('#F7F1E6', '#F5EAE4'), ('#E6D2B0', '#E3C3B6'),
                            ('#C98A2E', '#A8432E'), ('#FBF7F0', '#F9F2EE'), ('#E9DCC6', '#E6D2CA'))),
})

# ---- 邻近色（2026-11-23 第二次，作者纠正：上一版 P6–P11 只是一种色相分深浅，本质还是单色。
# 邻近色是色环上挨着的三种色相：蓝的邻近是绿和紫，黄的邻近是绿和橙，绿的邻近是黄和蓝，红的邻近是紫和橙）。
# 规律仍是 R3 跟着位置走。两种分法：
# 做法一 颜色沿房间走过三种色相：单元、家具、房间都按位置从一种色相走到中间色相、再走到另一种（stops 三色）；
# 做法二 一类东西一种色相：单元用中间色相，家具用一侧的邻近色，墙地天花用另一侧的邻近色。
def _mid(sp):
    return sp['stops'][len(sp['stops']) // 2] if sp.get('stops') else sp['pairs'][0][0]


def _hue3(ground, ink, cut, sky, far, tex, uline, papers):
    base = _pal(paper=ground, room=_mid(papers['wall']), floor=_mid(papers['floor']), sky=sky, ink=ink,
                far=far, tex=tex, unit_line=uline, unit=_mid(papers['unit']), furn=_mid(papers['furn']),
                cut=cut, stow=_mid(papers['stow']),
                fx=dict(ground=ground, cut=cut, grain=0.5, paper_grain=0.5))
    return _collage(base, _pos_rule(paper=papers), _ONE)


def _stops7(floor, wall, ceil, furn, unit, mech, stow):
    return {c: dict(stops=list(v)) for c, v in
            dict(floor=floor, wall=wall, ceil=ceil, furn=furn, unit=unit, mech=mech, stow=stow).items()}


_HUE_INK = dict(
    blue=('#7F95E0', '#1A1D4E', '#14173E', '#CBD6F6', '#7D86B8', '#A6AED4', '#14206E'),
    yellow=('#E9B93A', '#3B2A0A', '#2C1F06', '#F6E4A8', '#A8945F', '#CDB98A', '#5A3A08'),
    green=('#59B07A', '#123122', '#0C2418', '#CDE9D5', '#76968A', '#A3BBAE', '#0F3D24'),
    red=('#E36A5E', '#3A0E20', '#2C0918', '#F5D0D0', '#A77D86', '#CBA6AE', '#5E0E22'),
)
PALETTES.update({
    # 做法一 · 颜色沿房间走过三种色相
    # 蓝：绿 → 蓝 → 紫
    'h_blue': _hue3(*_HUE_INK['blue'], _stops7(
        ('#DDF1E6', '#DEE6FA', '#EAE0FA'), ('#E3F4EA', '#E3EAFB', '#EEE5FB'), ('#EAF7EF', '#EAEFFC', '#F2ECFC'),
        ('#C4E8D5', '#C8D5F5', '#DDCBF5'), ('#1FA87A', '#2D5BE3', '#8A4BE2'), ('#F3FBF6', '#F2F5FE', '#F7F3FE'),
        ('#D3EBDE', '#D5DEF4', '#E2D7F4'))),
    # 黄：绿 → 黄 → 橙
    'h_yellow': _hue3(*_HUE_INK['yellow'], _stops7(
        ('#EAF3D6', '#FAF0CC', '#FADFC8'), ('#EFF6DF', '#FBF3D8', '#FBE5D3'), ('#F4F9E8', '#FDF7E4', '#FDEDE0'),
        ('#D9EBB5', '#F6E3A0', '#F8C9A2'), ('#6DB22E', '#F2BE16', '#F2701E'), ('#F8FCF0', '#FEFBEF', '#FEF5EE'),
        ('#E2EDC7', '#F3E7BC', '#F3D6BE'))),
    # 绿：黄 → 绿 → 蓝
    'h_green': _hue3(*_HUE_INK['green'], _stops7(
        ('#F9F0CE', '#DDF1E1', '#DDE7F8'), ('#FBF4DA', '#E3F4E6', '#E3EBF9'), ('#FDF8E6', '#EBF7ED', '#EBF0FB'),
        ('#F4E4A4', '#C2E5CB', '#C5D5F2'), ('#E5BD12', '#2FA65C', '#2B6AD8'), ('#FEFBF0', '#F3FBF5', '#F2F6FD'),
        ('#F1E5BC', '#D0E8D6', '#D3DEF2'))),
    # 红：紫 → 红 → 橙
    'h_red': _hue3(*_HUE_INK['red'], _stops7(
        ('#EEE2F8', '#FADFDF', '#FCE8D2'), ('#F2E8FA', '#FBE5E5', '#FDEDDB'), ('#F6EFFC', '#FCEDED', '#FEF3E6'),
        ('#DCC6F0', '#F5C3C3', '#F8D5AD'), ('#8B3BD0', '#E0323C', '#F2861C'), ('#FAF6FD', '#FEF6F6', '#FFF9F1'),
        ('#E3D4F0', '#F2D2D2', '#F3DFC6'))),
    # 做法二 · 一类东西一种色相：单元 = 中间色相，家具 = 一侧邻近色，墙地天花 = 另一侧邻近色
    # 蓝：单元蓝、家具绿、房间紫
    'hc_blue': _hue3(*_HUE_INK['blue'], _paper7(
        ('#E9DFFA', '#F1EAFC'), ('#EDE4FB', '#F4EEFC'), ('#F2ECFC', '#F7F3FD'), ('#BEE5CE', '#D4EEDF'),
        ('#2350DE', '#4F5BEA'), ('#F7F3FE', '#FBF9FE'), ('#DED2F4', '#E9E1F7'))),
    # 黄：单元黄、家具绿、房间橙
    'hc_yellow': _hue3(*_HUE_INK['yellow'], _paper7(
        ('#FBE2CC', '#FDEBDB'), ('#FCE7D5', '#FDF0E3'), ('#FDEEE0', '#FEF5EC'), ('#D6EAB2', '#E6F2CE'),
        ('#F0B814', '#F5CB3A'), ('#FEF5EE', '#FFFAF6'), ('#F4D9C1', '#F8E5D3'))),
    # 绿：单元绿、家具黄、房间蓝
    'hc_green': _hue3(*_HUE_INK['green'], _paper7(
        ('#DCE6F8', '#E7EEFB'), ('#E2EAF9', '#ECF1FB'), ('#EAF0FB', '#F2F6FD'), ('#F3E2A0', '#F8EDC2'),
        ('#25A058', '#3CB46B'), ('#F2F6FD', '#F8FAFE'), ('#D2DDF2', '#DFE7F6'))),
    # 红：单元红、家具紫、房间橙
    'hc_red': _hue3(*_HUE_INK['red'], _paper7(
        ('#FCE6CF', '#FDEEDF'), ('#FDEBD8', '#FEF2E6'), ('#FEF0E2', '#FEF6EE'), ('#DBC4F0', '#E8DAF6'),
        ('#DD2E3A', '#E9505A'), ('#FFF7EF', '#FFFBF7'), ('#F4DCC2', '#F8E5D3'))),
})


# ================= 第五轮（2026-11-23）：作者「颜色存在感太强，作品集里不好排。以黑白为主，颜色清淡、面积小；
# 颜色的变化没了，用纹理、质感补回来；线再多几个层次」
# 线：用途分得更细（_BW_LINES），近 / 中 / 远三层灰（只在剖透视里分），多一档 hair 只给木纹和拼缝；单元的外轮廓仍是最重的黑。
# 面：全是白，纹理是平的一层墨（paint.py 的 _tone_layer）：墙是稀的点，沙发是密一点的点，地面是矢量的板缝、接头和木纹。
# 颜色：只给单元，且只给一小块（整台淡色 / 只给猫的台 / 只给台面 / 只给线）。没有影子，没有明暗。
_BW_LINES = dict(
    unit=(('unit', 'unit_m', 'obj'), ['#161514']),                # 单元外轮廓：全图最重；剖透视里按远近 2.0 / 1.6 / 1.25
    unit_in=(('inner', 'inner', 'tex'), ['#161514']),             # 单元里前面压后面的线
    unit_crease=('inner', ['#55524E']),                           # 台面顶面和侧面的交线
    seam=('tex', ['#8C8881', '#A19D96', '#B7B3AC']),              # 单元外皮上的缝
    furn=('obj', ['#2B2927', '#55524E', '#86827C']),              # 家具外轮廓
    furn_in=('inner', ['#6E6A65', '#8C8881', '#ACA8A1']),         # 家具里面的线
    room=('inner', ['#55524E', '#7A7671', '#A09C95']),            # 墙地天花的交线、墙的边
    mech=('inner', ['#2B2927', '#55524E', '#86827C']),            # 吊杆、夹环的外轮廓
    mech_in=('tex', ['#6E6A65', '#8C8881', '#ACA8A1']),           # 吊杆的节
    stow=('tex', ['#B3AFA8']),                                    # 收着的单元
    frame=('inner', ['#55524E', '#7A7671', '#A09C95']),           # 窗框
    mullion=('tex', ['#86827C', '#A09C95', '#B7B3AC']),           # 窗棂
    board=('tex', ['#A9A59E', '#BBB7B0', '#CBC7C1']),             # 地板缝
    joint=('hair', ['#9E9A93', '#B3AFA8', '#C6C2BB']),            # 地板接头
    grain=('hair', ['#B5B1AA', '#C6C2BC', '#D5D2CC']),            # 木纹
)
_CAT_GRAY = {'#E6D7C4': '#E6E3DE', '#A88A6E': '#8C8881', '#E8C36A': '#BDB9B2', '#FBF8F2': '#FFFFFF'}
# 纹理（终稿 2400 宽的像素）
_T_WALL = [('dots', '#7A7671', 6.0, 0.6, 0.75)]                  # 墙、天花：稀的点（石灰墙）
_T_WALL_FAINT = [('dots', '#8C8881', 7.0, 0.55, 0.6)]
_T_FABRIC = [('dots', '#4A4744', 3.6, 0.72)]                       # 沙发、单人沙发：密一点、匀的点（布面）
_T_FABRIC_FAINT = [('dots', '#6E6A65', 4.4, 0.6)]
_T_FABRIC_SCREEN = [('screen', '#55524E', 0.30, 4.0, 45)]          # 沙发：规整的网点，一档中灰
_T_TWILL = [('lines', '#55524E', 3.0, 45, 0.5)]                    # 沙发：45° 细斜线（斜纹布）
_T_CHAIR = [('lines', '#B3AFA8', 3.2, 0, 0.4)]                    # 椅子（木）：竖向细线（角度 0 = 线是竖的）


def _bw(tone=None, unit='#FFFFFF', shade='flat', lines=None, floor='boards', grain=1, fig_tone=None, unit_by=None, **over):
    pal = dict(paper='#FAF9F6', room='#FFFFFF', floor='#FFFFFF', sky='#F3F2EF', ink='#1C1B19', far='#8C8881', tex='#B3AFA8',
               unit_line='#161514', unit=unit, unit_top=unit, unit_under=unit, unit_seam='#8C8881',
               mech='#FFFFFF', furn='#FFFFFF', fig='#FFFFFF', hair='#2B2927', cut='#1C1B19', stow='#B3AFA8', shadow='#161514',
               cat_recolor=_CAT_GRAY,
               bw=dict(lines=dict(_BW_LINES, **(lines or {})), floor=floor, grain=grain, z=(9.6, 11.2), trace=True),
               fx=dict(shade=shade, tone=tone or {}, paper_grain=0.3))
    if fig_tone:
        pal['fig_tone'] = fig_tone
    if unit_by:
        pal['fx']['unit_by'] = unit_by
    pal.update(over)
    return pal


_TEX_A = dict(wall=_T_WALL, ceil=_T_WALL, sofa=_T_FABRIC, armchair=_T_FABRIC, chair=_T_CHAIR)
PALETTES.update({
    # 只换线：面全白、没有纹理（和第三轮的「黑白」比，只看线的层次）
    'bw_line': _bw(),
    # 一 · 大关系三种（单元都是白的）
    # 高调：墙稀点、沙发密点、地面木纹，整张图很浅
    'bw_v1': _bw(_TEX_A),
    # 头发不用全黑（全图最大的几块黑都是头发）：压成深灰
    'bw_v1g': _bw(_TEX_A, hair='#6E6A65'),
    # 剖切面三种：涂黑（上面几张）/ 中灰 / 45° 斜线
    'bw_cut_gray': _bw(_TEX_A, hair='#6E6A65', cut='#86827C'),
    'bw_cut_lines': _bw(_TEX_A, hair='#6E6A65', cut='#3A3835'),
})
_CUT_LINES = ('lines', '#3A3835', '#FFFFFF', 4.5, 45, 0.9)
PALETTES['bw_cut_lines']['fx']['cut'] = _CUT_LINES


def _bwk(tone=_TEX_A, **kw):
    """第五轮建议的底子：头发深灰、剖切面 45° 斜线"""
    pal = _bw(tone, hair='#6E6A65', cut='#3A3835', **kw)
    pal['fx']['cut'] = _CUT_LINES
    return pal


# 纹理三套（大关系都按高调）：点画 / 线 / 网点
_T_WALL_LINES = [('lines', '#B3AFA8', 5.0, 0, 0.4)]                # 墙：竖向细线（屏幕上的竖线就是房间里的竖线）
_T_CEIL_LINES = [('lines', '#C6C2BB', 5.0, 90, 0.35)]
PALETTES.update({
    'bw_t1': _bwk(),
    'bw_t2': _bwk(dict(wall=_T_WALL_LINES, ceil=_T_CEIL_LINES, sofa=_T_TWILL, armchair=_T_TWILL, chair=[('lines', '#B3AFA8', 3.2, 90, 0.4)])),
    'bw_t3': _bwk(dict(wall=[('screen', '#8C8881', 0.07, 4.5, 45)], ceil=[('screen', '#8C8881', 0.05, 4.5, 45)],
                       sofa=[('screen', '#55524E', 0.22, 3.6, 45)], armchair=[('screen', '#55524E', 0.22, 3.6, 45)], chair=_T_CHAIR), floor='seams'),
    # 大关系（纹理都是点画）：高调 = bw_t1；地面压一档灰；家具压一档灰
    'bw_v2': _bwk(dict(wall=_T_WALL_FAINT, ceil=_T_WALL_FAINT, sofa=_T_FABRIC_FAINT, armchair=_T_FABRIC_FAINT, chair=_T_CHAIR, floor=[('flat', '#E2DFD9')])),
    'bw_v3': _bwk(dict(wall=_T_WALL_FAINT, ceil=_T_WALL_FAINT, sofa=[('dots', '#3A3835', 2.5, 0.78)], armchair=[('dots', '#3A3835', 2.5, 0.78)], chair=_T_CHAIR)),
})

# 二 · 颜色放在哪：只给单元，淡、面积小（K1 → K4 面积从大到小）。两种淡色：淡橙（P3 那个橙冲淡）、淡蓝
_PALE = dict(o=('#F6D8C8', '#C9603C'), b=('#D9E2F5', '#3F5DB3'))
for _k, (_f, _l) in _PALE.items():
    PALETTES.update({
        f'bw_k1{_k}': _bwk(unit=_f),                                                  # 整台淡色
        f'bw_k2{_k}': _bwk(unit_by={'cat:half': _f, 'cat:flat': _f}),                 # 只给猫的台
        f'bw_k3{_k}': _bwk(shade=('top', _f)),                                        # 只给台面
        f'bw_k4{_k}': _bwk(lines=dict(unit=('unit', [_l]), unit_in=('inner', [_l]))),  # 只给线
    })
    PALETTES[f'bw_k3{_k}']['bw']['top_nz'] = 0.12     # 台面连同芯旁边收拢的那一圈布一起算

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



# ---------------------------------------------------------------- 第五轮（黑白为主）用到的小工具
def _lum(c):
    """颜色的亮度（0–1），给同一档线排先后：浅的先画、深的压在上面"""
    if not isinstance(c, str) or not c.startswith('#'):
        return 0.5
    r, g, b = (int(c[i:i + 2], 16) / 255 for i in (1, 3, 5))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _rdp(pts, eps):
    """折线化简（Ramer–Douglas–Peucker）：偏离不超过 eps 像素的点去掉，线更顺"""
    if eps <= 0 or len(pts) < 3:
        return pts
    keep = np.zeros(len(pts), bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        p, q = pts[a], pts[b]
        d = q - p
        L = math.hypot(d[0], d[1])
        seg = pts[a + 1:b]
        if L < 1e-9:
            dist = np.hypot(seg[:, 0] - p[0], seg[:, 1] - p[1])
        else:
            dist = np.abs(d[0] * (seg[:, 1] - p[1]) - d[1] * (seg[:, 0] - p[0])) / L
        i = int(np.argmax(dist))
        if dist[i] > eps:
            keep[a + 1 + i] = True
            stack.append((a, a + 1 + i)); stack.append((a + 1 + i, b))
    return pts[keep]


def _fig_tone(pal, k):
    """人身上哪几块换填色：配色里的 fig_tone 是一串 {区域: 颜色}，按人的编号轮着取"""
    ft = pal.get('fig_tone')
    if not ft:
        return {}
    return dict(ft[k % len(ft)])


def _recolor(svg, m):
    """猫的花色换成灰：按颜色逐个替换"""
    if not m:
        return svg
    for a, b in m.items():
        svg = svg.replace(a, b)
    return svg


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

    # ---- 黑白为主（第五轮，2026-11-23）：线按用途分档、按远近分三层灰，排线换成地板的木纹
    def _lines_bw(self, objs, put, bw):
        """bw['lines'] = {用途: (档, [近, 中, 远] 三个灰)}（只给一个灰就不分远近）。
        远近只在剖透视里分：离相机 < z[0] 是近、< z[1] 是中、再远是远；远的那层再降一档。返回虚线（收着的单元在地上的那一格）"""
        cam, buf, sc = self.cam, self.buf, self.sc
        L = bw['lines']
        z1, z2 = bw.get('z', (9.6, 11.2)) if cam.persp else (1e9, 1e9)
        dashed = []

        def emit(role, xy, z=None):
            if not len(xy) or role not in L:
                return
            grade, cols = L[role]
            grades = list(grade) if isinstance(grade, tuple) else [grade, grade, DOWN[grade]]
            if len(cols) == 1:
                cols = cols * 3
            if z is None or (not isinstance(grade, tuple) and len(L[role][1]) == 1):
                put(grades[0], cols[0], xy)
                return
            z = np.broadcast_to(np.asarray(z, float), (len(xy),))
            b = np.where(z < z1, 0, np.where(z < z2, 1, 2))
            for i in range(3):
                m = b == i
                if m.any():
                    put(grades[i], cols[i], xy[m])

        for o, V, T in objs:
            S, kind = LW.features(V, T, cam)
            r = LW.trace(buf, S, own=o.id)
            xy, p, z = r['xy'], r['prof'], r['z']
            if o.cls in ('floor', 'ceil', 'wall'):
                emit('room', xy, z)
            elif o.cls == 'furn':
                emit('furn', xy[p], z[p]); emit('furn_in', xy[~p], z[~p])
            elif o.cls == 'unit':
                if not bw.get('trace'):
                    jump = r['jump'] > 0.07
                    emit('unit', xy[p], z[p]); emit('unit_in', xy[~p & jump], z[~p & jump])
            elif o.cls == 'mech':
                emit('mech', xy[p], z[p]); emit('mech_in', xy[~p], z[~p])
            elif o.cls == 'stow':
                emit('stow', xy, z)
            for cls, pts, on_face in o.lines:
                seg = np.stack([pts[:-1], pts[1:]], 1)
                if self.cut is not None:
                    seg, _ = LW.clip_segs(seg, *self.cut)
                rr = LW.trace(buf, seg, own=o.id, by_id=on_face, min_px=0.6)
                emit(dict(seam='seam', stow_ring='stow').get(cls, 'mech_in'), rr['xy'], rr['z'])
        for cls, pts, wall in sc.frames:
            if wall in getattr(self, 'near_walls', ()):
                continue
            seg = np.stack([pts[:-1], pts[1:]], 1)
            if self.cut is not None:
                seg, _ = LW.clip_segs(seg, *self.cut)
            rr = LW.trace(buf, seg, own=-9, tol=0.05)
            emit('frame' if cls == 'frame' else 'mullion', rr['xy'], rr['z'])
        if bw.get('trace'):
            for role, pl, zr in self._trace_units(objs, bw):
                emit(role, np.c_[pl[:-1], pl[1:]], zr)
        for seg, oid, role in self.hatches_bw(bw):
            rr = LW.trace(buf, seg, own=oid, by_id=True, min_px=0.4)
            if role == 'grid':
                if len(rr['xy']):
                    dashed.append(rr['xy'])
            else:
                emit(role, rr['xy'], rr['z'])
        return dashed

    def _trace_units(self, objs, bw):
        """单元的线：面画完以后沿单元在画面上实际占的那块区域描（第五轮，2026-11-25）。

        以前单元的外轮廓从三维网格的边上取，二十条带子各自的轮廓边在画面上几乎重合又错开一点，叠成一道又粗又毛的黑边。
        现在：① 编号缓冲里每个单元占的像素，按深度再分成几块（同一个单元里前后差 > jump 米的地方断开，比如台面压在芯前面）；
        ② 每一块的边界用等值线描成一条连续的折线（先轻轻模糊，线是顺的）；
        ③ 边界的每一段看外面是谁：外面更近 = 这段边是挡在前面的东西的，不画；外面是同一个单元更远的那块 = 单元里的线；
           其他 = 单元的外轮廓。返回 [(用途, (n, 2) 终稿像素)]"""
        import contour as CT
        from scipy import ndimage
        buf, cam = self.buf, self.cam
        ss = buf.ss
        ids = buf.ids
        unit_ids = [o.id for o, _, _ in objs if o.cls == 'unit']
        if not unit_ids:
            return []
        U = np.isin(ids, unit_ids)
        if not U.any():
            return []
        key = buf.zk
        ok = np.isfinite(key)
        Z = np.where(ok, cam.zof(np.where(ok, key, -1.0 if cam.persp else 0.0)), np.inf)
        jump = float(bw.get('jump', 0.2))
        # ① 断开：同一个单元里相邻像素深度差大于 jump、或两个单元相邻，把远的那个像素划掉
        cut = np.zeros_like(U)
        for dy, dx in ((0, 1), (1, 0)):
            a = (slice(0, ids.shape[0] - dy), slice(0, ids.shape[1] - dx))
            b = (slice(dy, None), slice(dx, None))
            both = U[a] & U[b]
            with np.errstate(invalid='ignore'):
                diff = both & ((ids[a] != ids[b]) | (np.abs(Z[a] - Z[b]) > jump))
            far_a = diff & (Z[a] > Z[b]); far_b = diff & ~far_a
            cut[a] |= far_a; cut[b] |= far_b
        lab, n = ndimage.label(U & ~cut)
        # 划掉的像素并回最近的那一块
        if n == 0:
            return []
        idx = ndimage.distance_transform_edt(lab == 0, return_distances=False, return_indices=True)
        full = np.where(U, lab[idx[0], idx[1]], 0)
        out = []
        sig = float(bw.get('trace_blur', 1.0 if cam.persp else 0.7)) * ss / 2
        H, W = ids.shape
        objs_slices = ndimage.find_objects(full)
        for r, sl in enumerate(objs_slices, start=1):
            if sl is None:
                continue
            y0, y1 = max(sl[0].start - 4, 0), min(sl[0].stop + 4, H)
            x0, x1 = max(sl[1].start - 4, 0), min(sl[1].stop + 4, W)
            m = (full[y0:y1, x0:x1] == r)
            if m.sum() < 6 * ss * ss:
                continue
            f = ndimage.gaussian_filter(m.astype(np.float64), sig)
            rid = ids[y0:y1, x0:x1][m]
            uid = int(np.bincount(rid[rid >= 0]).argmax()) if (rid >= 0).any() else -1
            zin = float(np.median(Z[y0:y1, x0:x1][m]))
            # 台面：朝上的那一面在这一块里的边界（台面顶面和侧面的交线）。只取够长、够顺的几段
            if bw.get('crease') and buf.shade is not None:
                up = m & (buf.shade[y0:y1, x0:x1] == 1)
                up = ndimage.binary_opening(up, iterations=max(1, ss))
                lab_up, nu = ndimage.label(up)
                if nu:
                    sizes = ndimage.sum(up, lab_up, range(1, nu + 1))
                    keep = np.isin(lab_up, 1 + np.nonzero(sizes >= 40 * ss * ss)[0])
                    fu = ndimage.gaussian_filter(keep.astype(np.float64), sig * 1.6)
                    # 只留贴着台面边沿的那一段（离这一块的外缘不超过 rim 米）：绕到芯根部的那一圈是收拢的布，画出来是一串锯齿
                    dt = ndimage.distance_transform_edt(m)
                    ppm_b = float(cam.ppm(zin)) * ss
                    rim_px = float(bw.get('rim', 0.12)) * ppm_b
                    min_px = float(bw.get('crease_min', 10.0)) * ss
                    for pl in CT.polylines(fu, 0.5):
                        if len(pl) < 6:
                            continue
                        mid = (pl[:-1] + pl[1:]) / 2
                        t = pl[1:] - pl[:-1]
                        nrm = np.c_[t[:, 1], -t[:, 0]]
                        nrm /= np.maximum(np.hypot(nrm[:, 0], nrm[:, 1]), 1e-9)[:, None]
                        po = mid + nrm * (1.6 * ss / 2 + 0.8)
                        pn = mid - nrm * (1.6 * ss / 2 + 0.8)
                        pi = np.clip(np.round(po[:, 1]).astype(int), 0, f.shape[0] - 1); pj = np.clip(np.round(po[:, 0]).astype(int), 0, f.shape[1] - 1)
                        qi = np.clip(np.round(pn[:, 1]).astype(int), 0, f.shape[0] - 1); qj = np.clip(np.round(pn[:, 0]).astype(int), 0, f.shape[1] - 1)
                        # 两侧都还在这一块里（一侧顶面、一侧侧面）才是折线；贴着外轮廓的那段已经有外轮廓了
                        mi = np.clip(np.round(mid[:, 1]).astype(int), 0, f.shape[0] - 1); mj = np.clip(np.round(mid[:, 0]).astype(int), 0, f.shape[1] - 1)
                        inside = m[pi, pj] & m[qi, qj] & (keep[pi, pj] != keep[qi, qj]) & (dt[mi, mj] <= rim_px)
                        k = 0
                        while k < len(inside):
                            e = k
                            while e + 1 < len(inside) and inside[e + 1] == inside[k]:
                                e += 1
                            if inside[k]:
                                pts = pl[k:e + 2]
                                if np.sum(np.hypot(*np.diff(pts, axis=0).T)) >= min_px:
                                    out.append(('unit_crease', np.c_[(pts[:, 0] + x0 + 0.5) / ss, (pts[:, 1] + y0 + 0.5) / ss], zin))
                            k = e + 1
            for pl in CT.polylines(f, 0.5):
                if len(pl) < 3:
                    continue
                # 每一小段：法向朝外（模糊图变小的一侧）取外面一点、里面一点
                mid = (pl[:-1] + pl[1:]) / 2
                t = pl[1:] - pl[:-1]
                nrm = np.c_[t[:, 1], -t[:, 0]]
                nrm /= np.maximum(np.hypot(nrm[:, 0], nrm[:, 1]), 1e-9)[:, None]
                probe = mid + nrm * 0.8
                pi = np.clip(np.round(probe[:, 1]).astype(int), 0, f.shape[0] - 1)
                pj = np.clip(np.round(probe[:, 0]).astype(int), 0, f.shape[1] - 1)
                flip = f[pi, pj] > 0.5
                nrm[flip] *= -1
                po = mid + nrm * (1.6 * ss / 2 + 0.8)
                pin = mid - nrm * (1.6 * ss / 2 + 0.8)
                oi = np.clip(np.round(po[:, 1]).astype(int) + y0, 0, H - 1); oj = np.clip(np.round(po[:, 0]).astype(int) + x0, 0, W - 1)
                ii = np.clip(np.round(pin[:, 1]).astype(int) + y0, 0, H - 1); ij = np.clip(np.round(pin[:, 0]).astype(int) + x0, 0, W - 1)
                z_in = np.where(full[ii, ij] == r, Z[ii, ij], zin)
                z_out = Z[oi, oj]
                nearer = z_out < z_in - 0.03
                same = (ids[oi, oj] == uid) & (full[oi, oj] != r)
                role = np.where(nearer, 0, np.where(same, 2, 1))      # 0 不画 · 1 外轮廓 · 2 单元里的线
                # 按用途切成几段
                k = 0
                while k < len(role):
                    e = k
                    while e + 1 < len(role) and role[e + 1] == role[k]:
                        e += 1
                    if role[k]:
                        pts = pl[k:e + 2]
                        if len(pts) >= 2:
                            xy = _rdp(np.c_[(pts[:, 0] + x0 + 0.5) / ss, (pts[:, 1] + y0 + 0.5) / ss], float(bw.get('trace_rdp', 0.3)))
                            out.append(('unit' if role[k] == 1 else 'unit_in', xy, zin))
                    k = e + 1
        return out

    def hatches_bw(self, bw):
        """地板：板缝（与第三轮同一套位置，14 cm 一块）+ 每一条板错开的接头 + 板里一两道木纹；没有影子。
        bw['floor'] = 'boards'（缝 + 接头 + 木纹）/ 'seams'（只有缝）/ None。收着的单元在轴测的地上仍是一格虚线"""
        sc = self.sc
        h = sc.half
        out = []
        fid = sc.floor.id
        mode = bw.get('floor', 'boards')
        pitch = HATCH['mid']
        S = self.view == 'S'
        # 板的方向：剖透视里顺着进深（沿 x），轴测里沿 y（与前几轮一样）
        P = (lambda a, c: (a, c, 0.0)) if S else (lambda a, c: (c, a, 0.0))
        rng = np.random.default_rng(int(bw.get('seed', 5)))
        cs = np.arange(-h + pitch / 2, h, pitch)            # 缝的位置（横向）
        if mode:
            for c in cs:
                out.append((np.array([[P(-h, c), P(h, c)]], float), fid, 'board'))
        if mode == 'boards':
            edges = np.r_[-h, cs, h]
            grain = int(bw.get('grain', 1))
            for c0, c1 in zip(edges[:-1], edges[1:]):
                if c1 - c0 < 0.04:
                    continue
                a = -h - rng.uniform(0, 1.6)
                while a < h:
                    b = a + rng.uniform(0.9, 1.9)
                    if a > -h:
                        out.append((np.array([[P(a, c0), P(a, c1)]], float), fid, 'joint'))
                    # 木纹：一块板里一两道细线，只走一段，微微弯
                    for _ in range(grain):
                        if rng.random() < 0.25:
                            continue
                        lo, hi = max(a, -h) + 0.05, min(b, h) - 0.05
                        if hi - lo < 0.3:
                            continue
                        s0 = rng.uniform(lo, lo + (hi - lo) * 0.4)
                        s1 = rng.uniform(s0 + (hi - lo) * 0.35, hi)
                        t = np.linspace(s0, s1, max(3, int((s1 - s0) / 0.05)))
                        off = c0 + (c1 - c0) * rng.uniform(0.25, 0.75)
                        ph, amp, wl = rng.uniform(0, 6.3), (c1 - c0) * rng.uniform(0.04, 0.12), rng.uniform(0.5, 1.2)
                        cc = off + amp * np.sin(ph + 2 * np.pi * (t - s0) / wl)
                        pts = np.array([P(x, y) for x, y in zip(t, cc)], float)
                        out.append((np.stack([pts[:-1], pts[1:]], 1), fid, 'grain'))
                    a = b
        if self.view == 'A':
            r0 = 0.345
            for u in sc.D['units']:
                if u['drop'] >= 0.5:
                    continue
                x, y = u['x'], u['y']
                sq = np.array([(x - r0, y - r0, 0), (x + r0, y - r0, 0), (x + r0, y + r0, 0), (x - r0, y + r0, 0), (x - r0, y - r0, 0)], float)
                out.append((np.stack([sq[:-1], sq[1:]], 1), fid, 'grid'))
        return out

    def render(self, pal):
        cam, ss, sc = self.cam, self.ss, self.sc
        D = sc.D
        k = self.W / 2400
        objs = self.visible_objs()
        if cam.persp:
            objs = [(o, *LW.clip_mesh(V, T, *cam.near_plane())) for o, V, T in objs]
        buf = LW.Buffers(cam, ss)
        fx0 = pal.get('fx') or {}
        lit = bool(fx0.get('light') or fx0.get('mat'))
        for o, V, T in objs:
            shade = None
            if lit and len(T):
                # 物体上的颜色跟着光走（drawing/light.py）：每个三角形的法向（翻到朝着相机的那一侧）压成一个整数
                n = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]])
                n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
                cen = V[T].mean(1)
                tc = (cam.eye - cen) if cam.persp else np.broadcast_to(-cam.f, cen.shape)
                n = n * np.where(np.einsum('ij,ij->i', n, tc) < 0, -1.0, 1.0)[:, None]
                shade = LT.encode_normals(n)
            elif o.cls in ('unit', 'furn'):
                # 面朝上 = 1、朝下 = 2、朝侧 = 0（按朝着相机的那一面算，不依赖三角形绕向）
                n = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]])
                n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
                cen = V[T].mean(1)
                tc = (cam.eye - cen) if cam.persp else np.broadcast_to(-cam.f, cen.shape)
                nz = n[:, 2] * np.sign(np.einsum('ij,ij->i', n, tc))
                shade = np.where(nz > (pal.get('bw') or {}).get('top_nz', 0.5), 1, np.where(nz < -0.35, 2, 0))
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
            draw = (lambda clip, b=b, pl=pl, lay=lay, w=w, far=far, p=p:
                    LF.draw(b, pl, b.fit, ink=pal['far'] if far else pal.get('fig_line', pal['ink']), paper=pal['fig'], w=w, clip=clip, lay=lay, tone={**_fig_tone(pal, p['k']), 'hair': pal['far'] if far else pal['hair']})[0])
            flats.append((zc, draw, total, [m for m in masks if m]))
        for c in D['cats']:
            if not self.keeps(c['x'], c['y']):
                continue
            art, shape, zc = cat_art(c, cam, c['k'] in wand_cats)
            m = buf.add_flat(shape, zc, base + 500 + c['k'])
            far = zc > self.far_z
            draw = (lambda clip, art=art, c=c, far=far: self._clip_svg(_recolor(art(pal['far'] if far else pal.get('fig_line', pal['ink']), c['k'] + 3), pal.get('cat_recolor')), clip, f'cc{c["k"]}'))
            flats.append((zc, draw, shape, [m] if m else []))
        buf.done()
        self.buf = buf

        # ---- 线
        col = {}

        def put(grade, color, xy):
            if len(xy):
                col.setdefault((grade, color), []).append(xy)

        bw = pal.get('bw')
        if bw:
            dashed = self._lines_bw(objs, put, bw)
        else:
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
                put(g, 'ink', rr['xy'][~far]); put(_DOWN_OLD[g], 'far', rr['xy'][far])
            fx = pal.get('fx')
            keep_h = fx.get('hatch') if fx else None          # 只留哪几类排线：'floor'（木板缝）、'wall'、'shadow'；不写 = 都留
            for seg, oid, ckey in self.hatches():
                if ckey == 'shadow' and fx and (fx.get('shadow') or fx.get('light')):
                    continue                    # 影子改由叠印的那一版画（paint.py），或由太阳的影子贴图画（light.py）
                if keep_h is not None and ckey != 'grid':
                    kind = 'shadow' if ckey == 'shadow' else ('floor' if oid == sc.floor.id else 'wall')
                    if kind not in keep_h:
                        continue
                rr = LW.trace(buf, seg, own=oid, by_id=True, min_px=0.6)
                put('tex', ckey, rr['xy'])
            dashed = col.pop(('tex', 'grid'), [])
        fx = pal.get('fx')

        W, H = cam.W, cam.H
        s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
             f'<rect width="{W}" height="{H}" fill="{pal["paper"]}"/>']
        if fx:
            # 线也可以是渐变：配色里的某几个键换成 SVG 的线性渐变（按画面的几成给起止点）
            pal = dict(pal)
            defs = []
            for key, (c0, c1, x1, y1, x2, y2) in (fx.get('inks') or {}).items():
                gid = f'g_{key}'
                defs.append(f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{x1 * W:.1f}" y1="{y1 * H:.1f}" x2="{x2 * W:.1f}" y2="{y2 * H:.1f}">'
                            f'<stop offset="0" stop-color="{c0}"/><stop offset="1" stop-color="{c1}"/></linearGradient>')
                pal[key] = f'url(#{gid})'
            img, cut_img = self._paint(pal, fx, objs)
            if cut_img is not None:
                defs.append(f'<pattern id="cutpat" patternUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}">'
                            f'<image width="{W}" height="{H}" href="{PT.data_uri(cut_img)}"/></pattern>')
                pal['cut'] = 'url(#cutpat)'
            if defs:
                s.append('<defs>' + ''.join(defs) + '</defs>')
            s.append(f'<image x="0" y="0" width="{W}" height="{H}" href="{PT.data_uri(img)}"/>')
        # ---- 面的底色
        fills, shades = {}, {}
        for o, _, _ in objs:
            if fx:
                break
            c = dict(floor=pal['floor'], wall=pal['room'], ceil=pal['room'], furn=pal['furn'], unit=pal['unit'], mech=pal['mech'], stow=pal['room']).get(o.cls)
            fills[o.id] = LW.hexrgb(c)
            if o.cls == 'unit':
                shades[(o.id, 1)] = LW.hexrgb(pal['unit_top']); shades[(o.id, 2)] = LW.hexrgb(pal['unit_under'])
        if not fx:
            s.append(LW.fill_image(buf, fills, default=LW.hexrgb(pal['sky']) if self.view == 'S' else None, shades=shades))
        if self.view == 'S' and not fx:
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
        for grade in (('hair', 'tex', 'inner', 'obj', 'unit_m', 'unit') if bw else ('tex', 'inner', 'obj', 'unit')):
            groups = [(g, c) for (g, c) in col if g == grade]
            if bw:
                groups.sort(key=lambda gc: -_lum(pal.get(gc[1], gc[1])))
            for g, c in groups:
                s.append(LW.stroke(np.vstack(col[(g, c)]), pal.get(c, c), GRADE[g] * k))
        if dashed:
            s.append(LW.stroke(np.vstack(dashed), pal['stow'], GRADE['tex'] * k * (bw.get('grid_w', 1.25) if bw else 1.25), dash=f'{5 * k:.1f} {4 * k:.1f}', cap='butt'))
        # ---- 轴测里不画的那两面墙：在地上留一圈脚印
        if self.view == 'A':
            h, t = sc.half, WALL_T
            L = h + t
            foot = {'+x': (h, L, -h, h), '-x': (-L, -h, -h, h), '+y': (-L, L, h, L), '-y': (-L, L, -L, -h)}
            for name in self.near_walls:
                x0, x1, y0, y1 = foot[name]
                q = np.array([(x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0)], float)
                x, y, _ = cam.px(q)
                s.append(LW.polygon(np.c_[x, y], pal['floor'], bw['lines']['room'][1][0] if bw else pal['ink'], GRADE['inner'] * k))
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
        if fx and fx.get('paper_grain'):
            s.append(PT.paper_grain_filter(W, H, fx['paper_grain']))
        s.append('</svg>')
        return ''.join(s)

    # ---- 面不只平涂（paint.py）：准备每个像素是谁、房间以外在哪、影子在哪
    def _paint(self, pal, fx, objs):
        from PIL import Image, ImageDraw
        buf, cam, sc, ss = self.buf, self.cam, self.sc, self.ss
        H2, W2 = buf.ids.shape
        cls_of = {o.id: o.cls for o, _, _ in objs}
        role = {u['i']: u.get('role', '') for u in sc.D['units']}
        role_of = {o.id: role.get(o.tag, '') for o, _, _ in objs if o.cls == 'unit'}

        def raster(polys):
            im = Image.new('L', (W2, H2), 0)
            dr = ImageDraw.Draw(im)
            for pts in polys:
                dr.polygon([(float(x) * ss, float(y) * ss) for x, y in pts], fill=255)
            return np.asarray(im, np.float32) / 255.0

        masks = {}
        if self.view == 'S':
            h, t, C = sc.half, WALL_T, sc.ceil
            L = h + t
            cxp = self.cut[1]
            q = np.array([(cxp, -L, -SLAB_T), (cxp, L, -SLAB_T), (cxp, L, C + SLAB_T), (cxp, -L, C + SLAB_T)], float)
            x, y, _ = cam.px(q)
            inside = raster([np.c_[x, y]]) > 0.5
            masks['out'] = ~inside
            masks['sky'] = inside & (buf.ids < 0)
        else:
            masks['out'] = buf.ids < 0
        # 影子：与排线影子同一块地方（台面越高挪得越远），只落在看得见的地面上
        r = 0.345
        polys = []
        for u in sc.D['units']:
            if u['drop'] < 0.5 or not self.keeps(u['x'], u['y']):
                continue
            ox, oy = (0.10, 0.42) if self.view == 'S' else (-0.34, -0.26)
            cx_, cy_ = u['x'] + u['table'] * ox, u['y'] + u['table'] * oy
            q = np.array([(cx_ - r, cy_ - r, 0), (cx_ + r, cy_ - r, 0), (cx_ + r, cy_ + r, 0), (cx_ - r, cy_ + r, 0)], float)
            x, y, _ = cam.px(q)
            polys.append(np.c_[x, y])
        masks['shadow'] = raster(polys) * (buf.ids == sc.floor.id)
        scene = None
        if fx.get('light') or fx.get('mat'):
            # 影子贴图用整间房（不切、不藏：剖切面另一侧的墙和窗也挡光 / 透光），人和猫用台架那副方块挡光
            meshes = [(o.V, o.T) for o in sc.objs if o.cls != 'stow']
            objects = [(o.V, o.T) for o in sc.objs if o.cls in ('unit', 'furn', 'mech')]
            figs = []
            for p in sc.D['people']:
                for b in p['blocks']:
                    figs.append((np.array(b['verts'], float).reshape(-1, 3), np.array(b['idx']).reshape(-1, 3)))
            for c in sc.D['cats']:
                for b in c['blocks']:
                    figs.append((np.array(b['verts'], float).reshape(-1, 3), np.array(b['idx']).reshape(-1, 3)))
            h = sc.half
            board = ('x', HATCH['mid'], -h + HATCH['mid'] / 2) if self.view == 'S' else ('y', HATCH['mid'], -h + HATCH['mid'] / 2)
            scene = dict(meshes=meshes, figs=figs, floor=board, LW=LW, center=(0.0, 0.0, sc.ceil / 2), span=2 * (h + WALL_T) * 1.65, half=h, objects=objects)
        kinds = {o.id: o.tag for o, _, _ in objs if o.cls == 'furn'}
        return PT.paint(buf, cls_of, role_of, fx, pal, masks, scene=scene, kinds=kinds)

    def _clip_svg(self, svg, clip, uid):
        if clip is None:
            return svg
        return f'<clipPath id="{uid}"><path d="{LF.path_d(clip)}"/></clipPath><g clip-path="url(#{uid})">{svg}</g>'


if __name__ == '__main__':
    main()
