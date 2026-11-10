"""线稿人：ishi.Body 那副 3D 骨架不变，换一层按真人体块做的「皮」，画成线。

第一、二轮的黑色小人为什么难看（2026-11-09 作者：「人物画的太丑了」）：四肢半径只有真人的三分之一、躯干是一块板、
头是一个椭球插在细脖子上（没有下巴和鼻子，看不出脸朝哪）、手是一个圆头、整个人涂黑以后交叠的四肢读不出来。

这里的做法：
  · 每一块身体 = 「几个球的凸包」。球按人体测量的宽、厚摆（肩峰、胸廓、腰、髂、臀、大腿根、膝、腓肠肌、踝……），
    正交投影以后一组球的外形恰好是这些圆的凸包，所以换机位、换朝向外形都对。
  · 一个人 = 三十来个这样的区域（头、颈、上衣、左右上臂 / 前臂 / 手、胯、左右大腿 / 小腿 / 鞋、头发的几块、手里的东西）。
    按深度从远到近叠：每个区域的外形线只画没被更近的区域盖住的那一段，这就是线稿里「前面的胳膊压在身上」的那些线。
  · 相连的两块（上臂—躯干、大腿—胯、上臂—前臂……）在关节附近不画分界，线从腋下、腿根自己长出来。
  · 衣服是另一层区域：比身体大一圈，袖口、裤脚、下摆是平口（垂直于那一段骨头的一圈），不是圆头；
    线稿里的衣服线（下摆、袖口、领口、裤脚、门襟）都是它们的外形线。
  · 头发是几块实心墨色（顶、额发、后脑、后颈、两鬓……），按各自的深度和头叠：正面只露发际和两鬓，背面整个是黑的。

单位 = 身高 H。局部系同 ishi：x 向人的左边，y 向上，z 向前。
"""
import math
import numpy as np
from shapely.geometry import Point, Polygon, MultiPoint, LineString
from shapely.ops import unary_union, linemerge
from ishi import v, norm, rx, ry, rz, Body, ADULT, CHILD

# ---------------------------------------------------------------- 比例
# 骨架分段取 Drillis & Contini（站上 figure.ts 同一份）；头按 8 头身（配景人的惯例，比 7.5 头身修长一点）
REAL = dict(ADULT)
REAL.update(HEAD=0.125, HEADW=0.094, NECK=0.016, HAND=0.084, HIPX=0.047, SHX=0.088, TH=0.247, SH=0.247)
KID = dict(CHILD)
KID.update(HEAD=0.172, HEADW=0.132, NECK=0.010, HAND=0.092, HIPX=0.05, SHX=0.090)

EPS = 0.004         # 优先级只在同一处、同一深度上分先后（衣服压身体、头发压头），不许它盖过真正在前面的胳膊和腿
SEG = 14            # 每四分之一圆的分段


# ---------------------------------------------------------------- 球、圈、凸包
def blob(proj, it):
    """(球心, 半径) → 圆；(圆心, 半径, 轴) → 垂直于轴的一圈（投影是椭圆，做平口用）"""
    if len(it) == 2:
        x, y, _, s = proj(it[0])
        return Point(x, y).buffer(max(it[1] * s, 0.05), SEG)
    c, r, ax = it
    ax = norm(np.asarray(ax, float))
    u = np.cross(ax, v(0, 1, 0))
    if np.linalg.norm(u) < 0.2:
        u = np.cross(ax, v(1, 0, 0))
    u = norm(u); w = np.cross(ax, u)
    pts = [proj(c + (u * math.cos(t) + w * math.sin(t)) * r)[:2] for t in np.linspace(0, 2 * math.pi, 40, endpoint=False)]
    return MultiPoint(pts).convex_hull


def hull(proj, items):
    ds = [blob(proj, it) for it in items]
    return unary_union(ds).convex_hull if len(ds) > 1 else ds[0]


def chain(proj, items):
    """一串：相邻两个取凸包再并起来（不是整串的凸包，弯的地方保持弯）"""
    return unary_union([hull(proj, items[i:i + 2]) for i in range(len(items) - 1)])


def poly3(proj, pts):
    return MultiPoint([proj(p)[:2] for p in pts]).convex_hull


def lerp(a, b, t):
    return a + (b - a) * t


class Reg:
    __slots__ = ('name', 'poly', 'z', 'pri', 'fill', 'cls', 'key')

    def __init__(self, name, poly, z, pri=0.0, fill='body', cls='skin', key=None):
        self.name, self.poly, self.z, self.pri, self.fill, self.cls = name, poly, z, pri, fill, cls
        self.key = z - pri * EPS if key is None else key


# ---------------------------------------------------------------- 身体各块（球的位置和半径都是占身高的比例）
def torso_sets(b, e=0.0, kid=False):
    """躯干的四组球：骨盆、腰、胸廓、肩带。e = 衣服比身体大出的量。
    宽：髋 0.20、腰 0.16、胸 0.18、两肩 0.25；厚：臀 0.17、腰 0.12、胸 0.135"""
    P = b.P
    pel, lum, ch = b.pelvis, b.lumbar, b.chest
    Rp, Rl, Rc = b.Rp, b.Rl, b.Rc
    hw = P['HIPX']
    k = 1.12 if kid else 1.0
    pelv = [(pel + Rp @ v(s * (hw + 0.006), -0.012, -0.004), 0.047 * k + e) for s in (1, -1)] \
        + [(pel + Rp @ v(s * 0.030, -0.018, -0.030), 0.047 * k + e) for s in (1, -1)] \
        + [(pel + Rp @ v(0, 0.012, 0.024), 0.043 * k + e)] \
        + [(pel + Rp @ v(s * 0.046, 0.045, 0.0), 0.041 * k + e) for s in (1, -1)]
    waist = [(lum + Rl @ v(s * 0.034, 0.035, 0.0), 0.044 * k + e) for s in (1, -1)] \
        + [(lum + Rl @ v(0, 0.03, 0.020), 0.044 * k + e), (lum + Rl @ v(0, 0.03, -0.012), 0.044 * k + e)]
    rib = [(ch + Rc @ v(s * 0.040, 0.035, 0.0), 0.050 * k + e) for s in (1, -1)] \
        + [(ch + Rc @ v(0, 0.04, 0.022), 0.044 * k + e), (ch + Rc @ v(0, 0.05, -0.022), 0.047 * k + e)]
    # 肩带：三角肌的球心在肩关节下面一点，斜方肌从颈根斜下来——肩是斜的，不是衣架
    gird = [(b.sh[s] + Rc @ v(-s * 0.008, -0.026, 0), 0.029 * k + e) for s in (1, -1)] \
        + [(ch + Rc @ v(s * 0.044, 0.054, 0.0), 0.040 * k + e) for s in (1, -1)] \
        + [(ch + Rc @ v(s * 0.024, 0.094, -0.012), 0.021 + e * 0.6) for s in (1, -1)]
    return pelv, waist, rib, gird


def leg_back(b, L):
    """腿弯的里侧方向（腘窝那边）：腓肠肌往这边鼓"""
    mid = (L['hip'] + L['ankle']) / 2 - L['knee']
    back = mid + (b.Rp @ v(0, 0, -1)) * 0.02
    ax = norm(L['ankle'] - L['hip'])
    return norm(back - ax * np.dot(back, ax))


# 裤子自己的一套半径：胯、大腿中、膝、小腿、裤脚，裤脚落在小腿的几成处
TROUSER = dict(trousers=(0.057, 0.051, 0.041, 0.040, 0.036, 0.90), wide=(0.061, 0.058, 0.055, 0.056, 0.058, 0.86),
               slim=(0.055, 0.049, 0.037, 0.037, 0.027, 0.94), crop=(0.058, 0.054, 0.048, 0.048, 0.048, 0.62))


def thigh(b, L, kid=False, cut=None):
    k = 1.1 if kid else 1.0
    back = leg_back(b, L)
    if cut:
        r = TROUSER[cut]
        return [(L['hip'], r[0] * k), (lerp(L['hip'], L['knee'], 0.45) - back * 0.004, r[1] * k), (L['knee'], r[2] * k)]
    return [(L['hip'], 0.052 * k), (lerp(L['hip'], L['knee'], 0.45) - back * 0.006, 0.046 * k), (L['knee'], 0.033 * k)]


def shank(b, L, kid=False, cut=None):
    k = 1.1 if kid else 1.0
    back = leg_back(b, L)
    ax = L['ankle'] - L['knee']
    if cut:
        r = TROUSER[cut]
        return [(L['knee'], r[2] * k), (lerp(L['knee'], L['ankle'], min(0.30, r[5] * 0.5)) + back * 0.006, r[3] * k), (lerp(L['knee'], L['ankle'], r[5]), r[4] * k, ax)]
    return [(L['knee'], 0.033 * k), (lerp(L['knee'], L['ankle'], 0.30) + back * 0.010, 0.034 * k), (L['ankle'], 0.020 * k)]


def shoe(L, kid=False):
    k = 1.1 if kid else 1.0
    heel, toe, ank = L['heel'], L['toe'], L['ankle']
    ball = lerp(heel, toe, 0.68)
    sole = [(heel + v(0, 0.000, 0), 0.0165 * k), (ball + v(0, -0.001, 0), 0.0170 * k), (toe + v(0, -0.004, 0), 0.0115 * k)]
    upper = [(ank + v(0, -0.010, 0), 0.0205 * k), (lerp(heel, toe, 0.34) + v(0, 0.004, 0), 0.0185 * k)]
    return sole, upper


def arm(A, kid=False, e=0.0):
    k = 1.1 if kid else 1.0
    ua = [(lerp(A['sh'], A['elbow'], 0.10), 0.029 * k + e), (lerp(A['sh'], A['elbow'], 0.45), 0.027 * k + e), (A['elbow'], 0.023 * k + e)]
    fa = [(A['elbow'], 0.023 * k + e), (lerp(A['elbow'], A['wrist'], 0.28), 0.0245 * k + e), (A['wrist'], 0.016 * k + e)]
    return ua, fa


def hand(proj, A, P, grip=False):
    w = A['wrist']
    hd = norm(A['tip'] - w)
    fa = norm(w - A['elbow'])
    Lh = P['HAND']
    # 拇指那一侧：垂直于手指方向，偏上
    up = v(0, 1, 0)
    td = up - hd * np.dot(up, hd)
    if np.linalg.norm(td) < 0.3:
        td = np.cross(hd, fa) if np.linalg.norm(np.cross(hd, fa)) > 0.2 else v(0, 0, 1) - hd * hd[2]
    td = norm(td)
    if grip:
        main = [(w, 0.0160), (w + hd * Lh * 0.42, 0.0225), (w + hd * Lh * 0.64, 0.0195)]
        thumb = [(w + hd * Lh * 0.28 + td * 0.013, 0.0110), (w + hd * Lh * 0.58 + td * 0.021, 0.0085)]
    else:
        main = [(w, 0.0160), (w + hd * Lh * 0.40, 0.0200), (w + hd * Lh * 0.72, 0.0165), (w + hd * Lh * 0.96, 0.0105)]
        thumb = [(w + hd * Lh * 0.22 + td * 0.011, 0.0105), (w + hd * Lh * 0.50 + td * 0.029, 0.0072)]
    return unary_union([hull(proj, main), hull(proj, thumb)])


def head(proj, b, kid=False):
    """头分两块：颅（长头发的地方，整块是头发的颜色）和脸（白的一块，盖在颅的前面）。
    脸朝着看图的人时发际线就是脸这一块的外形；从背后看脸被颅挡住，整个头是黑的；侧面看得出鼻尖和下巴。
    返回 (颅, 脸)"""
    hc, Rh = b.head_c, b.Rh
    h = b.P['HEAD']; w = b.P['HEADW']
    f = h / 0.125
    c = lambda x, y, z: hc + Rh @ v(x * w / 0.094, y * f, z * f)
    if kid:
        skull = [(c(0, 0.010, -0.022), 0.0475 * f), (c(0, 0.012, 0.006), 0.046 * f), (c(0, -0.018, 0.000), 0.036 * f)]
        face = [(c(0, 0.000, 0.014), 0.040 * f), (c(0, -0.020, 0.014), 0.038 * f), (c(0, -0.040, 0.020), 0.020 * f)]
        nose = [(c(0, -0.014, 0.048), 0.008 * f), (c(0, -0.016, 0.054), 0.0055 * f)]
    else:
        skull = [(c(0, 0.0145, -0.024), 0.048 * f), (c(0, 0.0165, 0.003), 0.046 * f), (c(0, -0.030, -0.010), 0.030 * f)]
        face = [(c(0, 0.004, 0.014), 0.0385 * f), (c(0, -0.020, 0.014), 0.036 * f), (c(0, -0.0475, 0.024), 0.015 * f)]
        nose = [(c(0, -0.004, 0.046), 0.008 * f), (c(0, -0.017, 0.056), 0.0062 * f), (c(0, -0.022, 0.046), 0.008 * f)]
    return hull(proj, skull), unary_union([hull(proj, face), hull(proj, nose)])


def hair_parts(b, kind):
    """颅以外多出来的头发（每块一组球）：刘海、鬓角垂下来的、后颈的、披在背上的、发髻、马尾。
    每块带一个朝外的方向：朝着看图的人就画在脸前面，背着就压在头后面（只露出头的外形以外的那一圈）。
    返回 [(名, [球], 朝外的方向（头的系里）, 是不是一串, 是不是垂到背上的)]"""
    hc, Rh, Rc = b.head_c, b.Rh, b.Rc
    h = b.P['HEAD']; w = b.P['HEADW']
    f = h / 0.125
    c = lambda x, y, z: hc + Rh @ v(x * w / 0.094, y * f, z * f)
    S = lambda *a: [(c(x, y, z), r * f) for x, y, z, r in a]
    top = ('top', S((0, 0.040, -0.016, 0.031), (0, 0.040, 0.008, 0.027)), (0, 1, 0), False, False)
    fringe = ('fringe', S((0, 0.040, 0.014, 0.026), (0.006, 0.030, 0.034, 0.019)), (0, 0.5, 0.85), False, False)
    nape = ('nape', S((0, -0.016, -0.030, 0.034), (0, -0.038, -0.026, 0.030)), (0, -0.2, -1), False, False)
    low = lambda s, y=-0.036: (f'low{s}', S((s * 0.030, 0.006, -0.014, 0.025), (s * 0.033, y, -0.014, 0.020)), (s, -0.1, -0.25), False, False)
    if kind == 'short':
        return [top]
    if kind == 'fringe':
        return [top, fringe]
    if kind == 'bob':
        return [top, fringe, nape, low(1), low(-1)]
    if kind == 'long':
        fall = ('fall', [(c(0, -0.010, -0.036), 0.044 * f), (b.neckb + Rc @ v(0, -0.035, -0.048), 0.046), (b.neckb + Rc @ v(0, -0.115, -0.052), 0.038)], (0, 0, -1), True, True)
        return [top, fringe, fall, low(1, -0.052), low(-1, -0.052)]
    if kind == 'bun':
        return [top, ('bun', S((0, 0.070, -0.032, 0.024)), (0, 0.7, -0.7), False, False)]
    if kind == 'pony':
        tail = ('tail', S((0, 0.024, -0.056, 0.017), (0, -0.030, -0.084, 0.015), (0, -0.078, -0.088, 0.008)), (0, 0, -1), True, True)
        return [top, fringe, tail]
    if kind == 'curly':
        return [('top', S((0, 0.040, -0.014, 0.045), (0, 0.034, 0.014, 0.034)), (0, 1, 0), False, False),
                ('back', S((0, 0.008, -0.034, 0.054)), (0, 0.2, -1), False, False),
                ('fringe', S((0, 0.040, 0.016, 0.030), (0, 0.030, 0.034, 0.020)), (0, 0.5, 0.85), False, False),
                ('side1', S((0.030, 0.012, -0.012, 0.034)), (1, 0.1, -0.2), False, False), ('side-1', S((-0.030, 0.012, -0.012, 0.034)), (-1, 0.1, -0.2), False, False)]
    return []


def toward_cam(proj, p):
    """从 p 指向看图的人的单位向量（局部系）"""
    if hasattr(proj, 'toward'):
        return proj.toward(p)
    return proj.R.T @ v(0, 0, 1)


def hat_parts(b, kind):
    hc, Rh = b.head_c, b.Rh
    f = b.P['HEAD'] / 0.125
    c = lambda x, y, z: hc + Rh @ v(x, y * f, z * f)
    if kind == 'beanie':
        return [('hat', [(c(0, 0.026, -0.012), 0.053 * f), (c(0, 0.052, -0.012), 0.038 * f)], c(0, 0.06, 0), 'body')]
    if kind == 'cap':
        return [('hat', [(c(0, 0.030, -0.012), 0.051 * f), (c(0, 0.046, -0.008), 0.040 * f)], c(0, 0.06, 0), 'body'),
                ('brim', [(c(0.026, 0.020, 0.040), 0.010 * f), (c(-0.026, 0.020, 0.040), 0.010 * f), (c(0, 0.014, 0.088), 0.007 * f)], c(0, 0.03, 0.08), 'body')]
    return []


def hem_ring(b, drop, flare, e, n=24):
    """长下摆的一圈点：在骨盆下方 drop 处，盖住两条腿在那个高度的位置，再放出 flare"""
    pel, Rp = b.pelvis, b.Rp
    legs = getattr(b, 'legs', {})
    if len(legs) == 2 and drop < -0.08:
        f = min(1.6, (-drop - 0.012) / b.P['TH'])
        def along(L):
            return lerp(L['hip'], L['knee'], f) if f <= 1 else lerp(L['knee'], L['ankle'], f - 1)
        a, c = along(legs[1]), along(legs[-1])
        mid = (a + c) / 2
        half = np.linalg.norm(a - c) / 2
        ax = norm(a - c) if half > 1e-4 else Rp @ v(1, 0, 0)
        up = norm(pel - mid)
        side = norm(np.cross(ax, up))
        rr = 0.046 + e + flare
        return [mid + ax * ((half + rr) * math.cos(t)) + side * ((rr + 0.012) * math.sin(t)) for t in np.linspace(0, 2 * math.pi, n, endpoint=False)]
    hw = b.P['HIPX'] + 0.006 + 0.047 + e + flare
    hd = 0.075 + e + flare
    c0 = pel + Rp @ v(0, drop, -0.008)
    return [c0 + Rp @ v(hw * math.cos(t), 0, hd * math.sin(t)) for t in np.linspace(0, 2 * math.pi, n, endpoint=False)]


# ---------------------------------------------------------------- 一个人的全部区域
def regions(b: Body, proj, fit=None):
    """fit：穿着。top = tee | long | coat | dress | None；bottom = trousers | wide | slim | crop | shorts | skirt | None；
    hair、hat；shoe = ink | line；grip = {±1: True} 哪只手握着东西。
    返回 (区域, 关节, 衣服上的线)"""
    fit = {**dict(top='long', bottom='trousers', hair=getattr(b, 'hair', 'short'), hat=getattr(b, 'hat', None), shoe='ink'), **(getattr(b, 'fit', None) or {}), **(fit or {})}
    P = b.P
    kid = P['HEAD'] > 0.15
    R, J, seams = [], [], []
    z = lambda p: proj(p)[2]

    def add(name, poly, zp, pri=0.0, fill='body', cls='skin', key=None):
        if poly is not None and not poly.is_empty:
            R.append(Reg(name, poly, z(zp), pri, fill, cls, key))

    top, bottom = fit['top'], fit['bottom']
    e_top = dict(tee=0.006, long=0.011, coat=0.020, dress=0.008).get(top, 0.0)
    pelv, waist, rib, gird = torso_sets(b, 0.0, kid)
    pelv_g, waist_g, rib_g, gird_g = torso_sets(b, e_top, kid)
    pel, Rp, Rc = b.pelvis, b.Rp, b.Rc

    # ---- 头、颈
    hair = fit['hair']
    cam = toward_cam(proj, b.head_c)
    k_skull = z(b.head_c) - 1.5 * EPS
    skull_p, face_p = head(proj, b, kid)
    haired = hair not in ('bald', None)
    add('skull', skull_p.buffer(0.004 * proj(b.head_c)[3]) if haired else skull_p, b.head_c, 0, 'ink' if haired else 'body', 'hair' if haired else 'skin', k_skull)
    face_on = float(np.dot(b.Rh @ norm(v(0, -0.1, 1)), cam)) > -0.08
    k_face = k_skull - 0.006 if face_on else k_skull + 0.02
    add('face', face_p, b.head_c, 0, 'body', 'skin', k_face)
    neck_top = b.head_c + b.Rh @ v(0, -0.036 * P['HEAD'] / 0.125, -0.012)
    add('neck', hull(proj, [(b.neckb + Rc @ v(0, -0.014, 0.004), 0.034 if not kid else 0.036), (neck_top, 0.029 if not kid else 0.033)]), lerp(b.neckb, neck_top, 0.5), 0.0,
        key=k_skull + 0.012)

    # ---- 躯干
    if top is None:
        add('top', unary_union([hull(proj, pelv + waist), hull(proj, waist + rib), hull(proj, rib + gird)]), b.chest, 0.4)
    else:
        drop = dict(tee=-0.030, long=-0.042, coat=-0.215, dress=-0.250)[top] * fit.get('len', 1.0)
        flare = dict(tee=0.004, long=0.006, coat=0.014, dress=0.045)[top] + fit.get('flare', 0.0)
        hem = hem_ring(b, drop, flare, e_top)
        shapes = [hull(proj, waist_g + rib_g), hull(proj, rib_g + gird_g)]
        low = hull(proj, pelv_g + waist_g)
        if top in ('coat', 'dress'):
            shapes += [low, hull(proj, pelv_g).union(poly3(proj, hem)).convex_hull]
        else:
            # 下摆以上的那一截：和「下摆那一圈往上拉成的柱」取交，下缘就是下摆的椭圆
            shapes.append(low.intersection(poly3(proj, hem + [p + Rp @ v(0, 0.3, 0) for p in hem])))
        add('top', unary_union(shapes[:2]), b.chest, 1.0, cls='top')
        add('top_low', unary_union(shapes[2:]), pel, 1.0, cls='top')
        J.append(('top', 'top_low', b.lumbar + b.Rl @ v(0, 0.035, 0), 0.24))
        if top == 'coat':
            # 门襟：胸口到下摆正中的一条线
            f0 = pel + Rp @ v(0.008, 0.0, 0.068 + e_top)
            fr = [b.chest + Rc @ v(0, 0.085, 0.060 + e_top), b.chest + Rc @ v(0.004, 0.02, 0.068 + e_top), b.lumbar + b.Rl @ v(0.006, 0.03, 0.066 + e_top),
                  f0, np.mean(hem, axis=0) + Rp @ v(0.01, 0, 0.07 + flare)]
            seams.append((('top', 'top_low'), fr, Rc @ v(0, 0, 1)))

    # ---- 胯与腿
    legs = getattr(b, 'legs', {})
    if bottom in TROUSER or bottom == 'shorts':
        e_b = dict(trousers=0.008, wide=0.012, slim=0.005, crop=0.010, shorts=0.012)[bottom]
        pelv_b, waist_b, _, _ = torso_sets(b, e_b, kid)
        add('hips', hull(proj, pelv_b + waist_b[:2]), pel, 0.5, cls='bottom')
    elif bottom == 'skirt':
        hem = hem_ring(b, -0.22 * fit.get('len', 1.0), 0.05 + fit.get('flare', 0.0), 0.006)
        pelv_b, waist_b, _, _ = torso_sets(b, 0.006, kid)
        add('hips', unary_union([hull(proj, pelv_b + waist_b[:2]), hull(proj, pelv_b).union(poly3(proj, hem)).convex_hull]), pel, 0.6, cls='bottom')
    else:
        add('hips', hull(proj, pelv + waist[:2]), pel, 0.2)
    for s, L in legs.items():
        mid_t = lerp(L['hip'], L['knee'], 0.55); mid_s = lerp(L['knee'], L['ankle'], 0.5)
        if bottom in TROUSER:
            add(f'ank{s}', chain(proj, shank(b, L, kid)[1:]), mid_s, 0.0)
            add(f'tth{s}', chain(proj, thigh(b, L, kid, bottom)), mid_t, 0.6, cls='bottom')
            add(f'tsk{s}', chain(proj, shank(b, L, kid, bottom)), mid_s, 0.6, cls='bottom')
            J.append((f'tth{s}', f'tsk{s}', L['knee'], TROUSER[bottom][2] * 1.25 + 0.012))
            J.append(('hips', f'tth{s}', L['hip'], 0.085))
        else:
            add(f'th{s}', chain(proj, thigh(b, L, kid)), mid_t, 0.3)
            add(f'sk{s}', chain(proj, shank(b, L, kid)), mid_s, 0.0)
            J.append((f'th{s}', f'sk{s}', L['knee'], 0.048))
            J.append(('hips', f'th{s}', L['hip'], 0.075))
            if bottom == 'shorts':
                sp = thigh(b, L, kid, 'trousers')
                cut = lerp(L['hip'], L['knee'], 0.40)
                add(f'tth{s}', hull(proj, [sp[0], (cut, 0.057, L['knee'] - L['hip'])]), mid_t, 0.6, cls='bottom')
                J.append(('hips', f'tth{s}', L['hip'], 0.085))
        sole, upper = shoe(L, kid)
        add(f'shoe{s}', unary_union([hull(proj, sole), hull(proj, upper + sole[:2])]), lerp(L['heel'], L['toe'], 0.5), 0.2, 'ink' if fit['shoe'] == 'ink' else 'body', 'shoe')

    # ---- 胳膊、手
    sleeve = dict(tee='short', long='long', coat='long', dress=fit.get('sleeve', 'short')).get(top)
    for s, A in getattr(b, 'arms', {}).items():
        ua, fa = arm(A, kid)
        mu = lerp(A['sh'], A['elbow'], 0.6); mf = lerp(A['elbow'], A['wrist'], 0.55)
        if s not in fit.get('nohand', ()):
            add(f'hand{s}', hand(proj, A, P, grip=fit.get('grip', {}).get(s, False)), mf, 0.1)
        if sleeve == 'long':
            e_s = 0.007 if top != 'coat' else 0.013
            ug, fg = arm(A, kid, e_s)
            fg[-1] = (lerp(A['elbow'], A['wrist'], 0.94), 0.016 + e_s + 0.005, A['wrist'] - A['elbow'])
            add(f'slu{s}', chain(proj, ug), mu, 0.6, cls='top')
            add(f'sll{s}', chain(proj, fg), mf, 0.6, cls='top')
            add(f'fa{s}', hull(proj, fa[1:]), mf, 0.0)
            J.append(('top', f'slu{s}', A['sh'], 0.056))
            J.append((f'slu{s}', f'sll{s}', A['elbow'], 0.042))
        else:
            add(f'ua{s}', chain(proj, ua), mu, 0.0)
            add(f'fa{s}', chain(proj, fa), mf, 0.0)
            J.append((f'ua{s}', f'fa{s}', A['elbow'], 0.034))
            J.append((f'fa{s}', f'hand{s}', A['wrist'], 0.026))
            J.append(('top', f'ua{s}', A['sh'], 0.05))
            if sleeve == 'short':
                ug, _ = arm(A, kid, 0.008)
                cut = lerp(A['sh'], A['elbow'], 0.52)
                add(f'slu{s}', hull(proj, [ug[0], (cut, 0.038, A['elbow'] - A['sh'])]), lerp(A['sh'], A['elbow'], 0.3), 0.6, cls='top')
                J.append(('top', f'slu{s}', A['sh'], 0.056))

    # ---- 头发、帽子
    k_body = z(b.chest) - EPS
    for i, (name, sph, nrm, is_chain, on_back) in enumerate(hair_parts(b, hair)):
        facing = float(np.dot(b.Rh @ norm(v(*nrm)), cam)) > -0.15
        if on_back:      # 垂到背上的：从背后看压在头和上衣前面，从正面看在它们后面
            key = (min(k_skull, k_body) - 0.012) if facing else (max(k_skull, k_body) + 0.03)
        else:
            key = (min(k_skull, k_face) - 0.004 - 0.0004 * i) if facing else (max(k_skull, k_face) + 0.02)
        add('hair_' + name, chain(proj, sph) if is_chain else hull(proj, sph), b.head_c, 0, 'ink', 'hair', key)
    for name, sph, zp, fill in hat_parts(b, fit['hat']):
        add(name, hull(proj, sph), zp, 0, fill, 'hat', min(k_skull, k_face) - 0.012)

    # ---- 手里的、身上的东西（姿态里给的）
    for i, e in enumerate(b.extra):
        k = e[0]
        if k == 'cap':
            add(f'prop{i}', hull(proj, [(e[1], e[3]), (e[2], e[4])]), lerp(e[1], e[2], 0.5), 1.5, e[5] if len(e) > 5 else 'body', 'prop')
        elif k == 'hull':       # ('hull', [球或圈…], 填色, 优先级)
            add(f'prop{i}', hull(proj, e[1]), np.mean([it[0] for it in e[1]], axis=0), e[3] if len(e) > 3 else 1.5, e[2] if len(e) > 2 else 'body', 'prop')
        elif k == 'chain':
            add(f'prop{i}', chain(proj, e[1]), np.mean([it[0] for it in e[1]], axis=0), e[3] if len(e) > 3 else 1.5, e[2] if len(e) > 2 else 'body', 'prop')
        elif k == 'poly':
            add(f'prop{i}', poly3(proj, e[1]), np.mean(e[1], axis=0), e[3] if len(e) > 3 else 1.5, e[2] if len(e) > 2 else 'body', 'prop')
        elif k == 'line':
            pts = [proj(p) for p in e[1]]
            add(f'prop{i}', LineString([q[:2] for q in pts]).buffer(max(e[2] * pts[0][3], 0.4), 6), np.mean(e[1], axis=0), 1.5, 'ink', 'prop')
    return R, J, seams


# ---------------------------------------------------------------- 画
def lines_of(g):
    if g.is_empty:
        return []
    if g.geom_type in ('LineString', 'LinearRing'):
        return [LineString(g.coords)]
    if hasattr(g, 'geoms'):
        out = []
        for k in g.geoms:
            out += lines_of(k)
        return out
    return []


def polys_of(g):
    if g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g]
    if hasattr(g, 'geoms'):
        out = []
        for k in g.geoms:
            out += polys_of(k)
        return out
    return []


def path_d(g):
    d = []
    for p in polys_of(g):
        for ring_ in [p.exterior] + list(p.interiors):
            c = list(ring_.coords)
            d.append('M' + ' L'.join(f'{x:.2f},{y:.2f}' for x, y in c[:-1]) + 'Z')
    return ' '.join(d)


def line_d(ls):
    return 'M' + ' L'.join(f'{x:.2f},{y:.2f}' for x, y in ls.coords)


def ribbon(ls, w, taper):
    """一根线画成两头收尖的墨迹（多边形）：中间宽 w，两端在 taper 长度里收到 0.3 w"""
    L = ls.length
    if L < 1e-6:
        return None
    n = max(6, int(L / 1.2))
    ts = np.linspace(0, L, n)
    pts = np.array([ls.interpolate(t).coords[0] for t in ts])
    d = np.gradient(pts, axis=0)
    d /= np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
    nrm = np.stack([-d[:, 1], d[:, 0]], 1)
    tp = min(taper, L * 0.45)
    k = np.clip(np.minimum(ts, L - ts) / max(tp, 1e-6), 0, 1)
    hw = (0.3 + 0.7 * np.sin(k * math.pi / 2)) * w / 2
    a = pts + nrm * hw[:, None]; c = pts - nrm * hw[:, None]
    return 'M' + ' L'.join(f'{x:.2f},{y:.2f}' for x, y in np.vstack([a, c[::-1]])) + 'Z'


def layout(b: Body, proj, fit=None):
    """一个人画出来要用的全部几何：区域（远 → 近）、每个区域看得见的外形线、整个人的外形、衣服上的线"""
    R, J, seams = regions(b, proj, fit)
    R.sort(key=lambda r: -r.key)
    byname = {r.name: r for r in R}
    cover, vis, front = None, {}, {}
    for r in reversed(R):                 # 近 → 远
        bd = r.poly.boundary
        vis[r.name] = bd if cover is None else bd.difference(cover)
        front[r.name] = cover
        cover = r.poly if cover is None else cover.union(r.poly)
    sc = proj(b.chest)[3]
    for a, c, pt, rad in J:               # 相连的两块在关节附近不画分界
        if rad <= 0 or a not in byname or c not in byname:
            continue
        x, y = proj(pt)[:2]
        dz = Point(x, y).buffer(rad * sc, 12)
        vis[a] = vis[a].difference(dz.intersection(byname[c].poly.buffer(0.4)))
        vis[c] = vis[c].difference(dz.intersection(byname[a].poly.buffer(0.4)))
    seam_lines = []
    for owner, pts, nrm in seams:
        owners = [o for o in (owner if isinstance(owner, tuple) else (owner,)) if o in byname]
        if float(np.dot(nrm, toward_cam(proj, pts[0]))) < 0.12 or not owners:
            continue
        ls = LineString([proj(p)[:2] for p in pts])
        for o in owners:
            g = ls.intersection(byname[o].poly)
            fr_ = [byname[k].poly for k in byname if byname[k].key < byname[o].key and k not in owners]
            if fr_:
                g = g.difference(unary_union(fr_))
            seam_lines += lines_of(g)
    return R, vis, cover, seam_lines


def draw(b: Body, proj, fit=None, ink='#1f1b18', paper='#ffffff', w=1.6, w_in=None, taper=True, tone=None, clip=None, lay=None):
    """返回 (svg 片段, 整个人的外形)。w = 外轮廓线宽（像素），w_in = 里面的线（缺省 0.6 w）。
    tone：{'top' | 'bottom' | 'hair' | 'shoe' | 'skin' | 'prop' | 'hat': 颜色}，给某一类区域换填色（缺省全是纸色，头发和鞋是墨色）。
    clip：只画落在这个形状里的部分（被前面的东西挡住时用）；lay：已经算好的 layout()（放进场景时先要用它的区域去占深度）"""
    R, vis, total, seam_lines = lay if lay is not None else layout(b, proj, fit)
    w_in = w * 0.6 if w_in is None else w_in
    tone = tone or {}
    outer = total.boundary
    ob = outer.buffer(max(0.35, w * 0.3))
    cl = (lambda g: g.intersection(clip)) if clip is not None else (lambda g: g)

    def fill_of(r):
        if r.cls in tone:
            return tone[r.cls]
        return ink if r.fill == 'ink' else (paper if r.fill == 'body' else r.fill)

    s = []
    for r in R:
        g = cl(r.poly)
        if not g.is_empty:
            s.append(f'<path d="{path_d(g)}" fill="{fill_of(r)}"/>')
    inner = []
    for r in R:
        g = cl(vis[r.name].difference(ob))
        g = linemerge(g) if g.geom_type == 'MultiLineString' else g
        inner += [ls for ls in lines_of(g) if ls.length > max(1.2, w * 1.2)]
    for ls in seam_lines:
        inner += lines_of(cl(ls))
    if taper:
        d = ' '.join(filter(None, (ribbon(ls, w_in, 5 * w) for ls in inner)))
        if d:
            s.append(f'<path d="{d}" fill="{ink}"/>')
    else:
        d = ' '.join(line_d(ls) for ls in inner)
        if d:
            s.append(f'<path d="{d}" fill="none" stroke="{ink}" stroke-width="{w_in:.2f}" stroke-linecap="round" stroke-linejoin="round"/>')
    og = cl(outer)
    d = ' '.join(line_d(ls) for ls in lines_of(linemerge(og) if og.geom_type == 'MultiLineString' else og))
    if d:
        s.append(f'<path d="{d}" fill="none" stroke="{ink}" stroke-width="{w:.2f}" stroke-linecap="round" stroke-linejoin="round"/>')
    return ''.join(s), total


# ---------------------------------------------------------------- 姿态上的小帮手
def aim_head(b: Body, target, htilt=0.0, gain=1.0, max_turn=70, max_nod=(-45, 55)):
    """让脸朝着 target（局部系里的点）：在胸的系里解出转头和点头的角度，不超过脖子转得动的范围"""
    P = b.P
    pivot = b.neckb + b.Rc @ v(0, 0.02, 0)
    d = b.Rc.T @ (v(*target) - pivot)
    turn = math.degrees(math.atan2(d[0], d[2])) * gain
    nod = -math.degrees(math.atan2(d[1], math.hypot(d[0], d[2]))) * gain
    turn = max(-max_turn, min(max_turn, turn))
    nod = max(max_nod[0], min(max_nod[1], nod))
    b.Rh = b.Rc @ ry(turn) @ rz(htilt) @ rx(nod)
    b.head_c = pivot + b.Rh @ v(0, P['NECK'] + P['HEAD'] * 0.42, 0.012)
    return b


def shrug(b: Body, s, up=0.0, fwd=0.0, out=0.0):
    """肩带：抬手过肩时肩跟着抬，往前够时肩往前送"""
    b.sh[s] = b.sh[s] + b.Rc @ v(s * out, up, fwd)
    return b


def hang(b: Body, s, fwd=0.035, out=0.02, lift=0.0, hand=None):
    """胳膊自然垂着：手腕在肩的正下方偏前一点（按重力，不跟着躯干歪）"""
    w = b.sh[s] + v(s * out, -(b.P['UA'] + b.P['FA']) * (0.985 - lift), 0) + b.Rp @ v(0, 0, fwd)
    return b.arm(s, w, elbow_pole=(s * 0.25, 0.0, -1), hand=hand if hand is not None else (s * 0.05, -1, 0.22))
