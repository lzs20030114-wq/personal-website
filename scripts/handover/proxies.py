# -*- coding: utf-8 -*-
"""815.3dm 里没有建模、但交接时必须画出来的件：电机本体、绕线盘、皮带、转台实物外形、肌腱走线。

全部是**示意件**：尺寸取标准件常规尺寸，位置取模型里给它们留的框 / 孔 / 托盘。坐标系与 extract_815.py 相同
（x = 体轴，前方为 −x；y = 横向，+y 为机器右侧；z = 高，中间轴轴线 z = 0）。
"""
import math
import numpy as np

NEMA = 42.3          # NEMA17 机身边长
NEMA_CH = 4.5        # 机身四角倒角

# ---------------------------------------------------------------- 网格原件

def _frame(axis):
    """给定轴向，返回 (u, v, w) 正交基：w = 轴向。"""
    w = np.asarray(axis, float); w /= np.linalg.norm(w)
    a = np.array([0, 0, 1.0]) if abs(w[2]) < 0.9 else np.array([1.0, 0, 0])
    u = np.cross(w, a); u /= np.linalg.norm(u)
    v = np.cross(w, u)
    return u, v, w

def prism(profile, c0, axis, length):
    """2D 闭合轮廓（在 u-v 平面里，逆时针）沿 axis 拉伸 length。c0 = 起始端面中心。"""
    u, v, w = _frame(axis)
    P = np.asarray(profile, float); n = len(P)
    c0 = np.asarray(c0, float)
    ring0 = c0 + P[:, :1] * u + P[:, 1:] * v
    ring1 = ring0 + w * length
    V = np.vstack([ring0, ring1, [c0], [c0 + w * length]])
    T = []
    for i in range(n):
        j = (i + 1) % n
        T += [(i, j, n + j), (i, n + j, n + i)]
        T += [(2 * n, j, i), (2 * n + 1, n + i, n + j)]
    return V.astype(np.float32), np.array(T, np.int32)

def circle(r, n=36):
    a = np.linspace(0, 2 * math.pi, n, endpoint=False)
    return np.c_[r * np.cos(a), r * np.sin(a)]

def cyl(c0, axis, r, length, n=36):
    return prism(circle(r, n), c0, axis, length)

def box(lo, hi):
    lo, hi = np.asarray(lo, float), np.asarray(hi, float)
    s = hi - lo
    prof = [(-s[1] / 2, -s[2] / 2), (s[1] / 2, -s[2] / 2), (s[1] / 2, s[2] / 2), (-s[1] / 2, s[2] / 2)]
    # 轴向 x：u = y, v = z（_frame 对 x 轴给出 u = (0,1,0)·±，这里直接构造）
    V = []
    for x in (lo[0], hi[0]):
        for (py, pz) in prof:
            V.append((x, lo[1] + s[1] / 2 + py, lo[2] + s[2] / 2 + pz))
    V = np.array(V, np.float32)
    T = [(0, 1, 2), (0, 2, 3), (4, 6, 5), (4, 7, 6)]
    for i in range(4):
        j = (i + 1) % 4
        T += [(i, j, 4 + j), (i, 4 + j, 4 + i)]
    return V, np.array(T, np.int32)

def merge(*ms):
    V, T, off = [], [], 0
    for v, t in ms:
        V.append(v); T.append(t + off); off += len(v)
    return np.vstack(V).astype(np.float32), np.vstack(T).astype(np.int32)

def nema_profile():
    h, c = NEMA / 2, NEMA_CH
    return [(-h + c, -h), (h - c, -h), (h, -h + c), (h, h - c), (h - c, h), (-h + c, h), (-h, h - c), (-h, -h + c)]

def nema17(face_c, out_dir, body=48.0, shaft=22.0):
    """NEMA17：face_c = 前端面中心（出轴那一面），out_dir = 从端面指向机身尾部的方向。
    返回 (机身, 出轴)。"""
    d = np.asarray(out_dir, float); d /= np.linalg.norm(d)
    f = np.asarray(face_c, float)
    b = prism(nema_profile(), f, d, body)
    boss = cyl(f, -d, 11.0, 2.0)
    sh = cyl(f, -d, 2.5, shaft, 18)
    return merge(b, boss), sh

def spool(c, axis, core=6.4, flange=9.0, width=11.0, fl=1.0):
    """GT2 20T 带轮当绕线盘：两片挡边 + 中间芯。c = 中心。"""
    a = np.asarray(axis, float); a /= np.linalg.norm(a)
    c = np.asarray(c, float)
    s = c - a * width / 2
    return merge(cyl(s, a, flange, fl), cyl(s + a * fl, a, core, width - 2 * fl), cyl(s + a * (width - fl), a, flange, fl))

def tube(points, r=0.7, n=8):
    """沿折线的细管（肌腱、线）。"""
    P = np.asarray(points, float)
    out = []
    for p, q in zip(P[:-1], P[1:]):
        L = np.linalg.norm(q - p)
        if L < 1e-6: continue
        out.append(cyl(p, q - p, r, L, n))
    return merge(*out)

def _x2(a, b):
    return a[0] * b[1] - a[1] * b[0]

def belt(c1, r1, c2, r2, x0, x1, t=1.3, n=96):
    """开口皮带：两轮节圆（y-z 平面）的凸包环，沿 x 从 x0 到 x1。"""
    c1, c2 = np.asarray(c1, float), np.asarray(c2, float)
    pts = np.vstack([c1 + circle(r1, n), c2 + circle(r2, n)])
    # 凸包（单调链）
    P = pts[np.lexsort((pts[:, 1], pts[:, 0]))]
    def half(arr):
        st = []
        for p in arr:
            while len(st) >= 2 and _x2(st[-1] - st[-2], p - st[-2]) <= 0:
                st.pop()
            st.append(p)
        return st
    H = np.array(half(P)[:-1] + half(P[::-1])[:-1])
    # 每点外法向：相对最近的轮心
    def nrm(p):
        cc = c1 if np.linalg.norm(p - c1) - r1 < np.linalg.norm(p - c2) - r2 else c2
        d = p - cc; return d / np.linalg.norm(d)
    N = np.array([nrm(p) for p in H])
    inner, outer = H - N * 0.2, H + N * t
    m = len(H)
    V = []
    for x in (x0, x1):
        for loop in (inner, outer):
            V += [(x, p[0], p[1]) for p in loop]
    V = np.array(V, np.float32)
    def idx(xi, li, k): return xi * 2 * m + li * m + (k % m)
    T = []
    for k in range(m):
        for (xa, la), (xb, lb) in (((0, 0), (1, 0)), ((0, 1), (1, 1)), ((0, 0), (0, 1)), ((1, 0), (1, 1))):
            a, b = idx(xa, la, k), idx(xa, la, k + 1)
            c, d = idx(xb, lb, k + 1), idx(xb, lb, k)
            T += [(a, b, c), (a, c, d)]
    return V, np.array(T, np.int32)

# ---------------------------------------------------------------- 具体位置

STEPPER = (92, 99, 110)      # 电机本体
SPOOL = (214, 92, 70)        # 带轮 / 绕线盘
BELT = (70, 72, 76)
TENDON = {'A': (176, 44, 32), 'B': (31, 92, 150), 'C': (40, 120, 78)}

# 主电机：815 的电机支架前板在 x = 125.4–127.4（四条腰形槽，孔距 31），框体向后到 175.4 → 机身在框内、
# 出轴朝前穿过前板，20T 在前板前面，与中间轴上的带轮同一平面。电机轴心按腰形槽中位取。
MAIN_AXIS = (-53.8, -54.0)          # (y, z)
MAIN_FACE_X = 127.4
SHAFT_PULLEY = dict(x0=116.5, x1=124.5, r_pitch=19.1, r_out=19.5)   # 60T（作者定案 3:1）
MOTOR_PULLEY = dict(x0=115.5, x1=123.5, r_pitch=6.37)              # 20T

def main_drive():
    body, sh = nema17((MAIN_FACE_X, *MAIN_AXIS), (1, 0, 0), body=48.0, shaft=14.0)
    py = cyl((MOTOR_PULLEY['x0'], *MAIN_AXIS), (1, 0, 0), 6.6, MOTOR_PULLEY['x1'] - MOTOR_PULLEY['x0'])
    pyf = merge(cyl((MOTOR_PULLEY['x0'] - 1, *MAIN_AXIS), (1, 0, 0), 8.0, 1.0),
                cyl((MOTOR_PULLEY['x1'], *MAIN_AXIS), (1, 0, 0), 8.0, 1.0))
    p60 = merge(cyl((SHAFT_PULLEY['x0'], 0, 0), (1, 0, 0), SHAFT_PULLEY['r_out'], SHAFT_PULLEY['x1'] - SHAFT_PULLEY['x0'], 72),
                cyl((SHAFT_PULLEY['x1'], 0, 0), (1, 0, 0), 9.0, 7.0))
    bt = belt(MAIN_AXIS, MOTOR_PULLEY['r_pitch'], (0, 0), SHAFT_PULLEY['r_pitch'], 117.0, 123.0)
    d = (math.hypot(*MAIN_AXIS))
    return dict(body=body, shaft=sh, pulley20=merge(py, pyf), pulley60=p60, belt=bt, center_dist=d)

# 大触手的三台肌腱电机：安装笼两侧和底部各一个电机框（外 49.9 × 49.8 × 10，内口约 43.8）。
# 框内侧有横杆挡着，机身只能在框外，出轴朝里，绕线盘在笼内（夹在两根横杆之间）。
ARM_FRAMES = {   # 名称: (端面中心 = 框内侧面中心, 机身朝外方向)
    'R': ((-122.47, 167.6, -53.78), (0, 1, 0)),     # 右侧（外侧）框
    'L': ((-122.47, 50.5, -53.78), (0, -1, 0)),     # 左侧（靠机身中线）框
    'D': ((-74.77, 108.99, -75.48), (0, 0, -1)),    # 底部框
}
SPOOL_AT = 9.0    # 绕线盘中心离电机端面

def arm_motors():
    out = {}
    for k, (face, d) in ARM_FRAMES.items():
        body, sh = nema17(face, d, body=48.0, shaft=22.0)
        dd = np.asarray(d, float)
        sp = spool(np.asarray(face) - dd * SPOOL_AT, dd)
        out[k] = dict(body=body, shaft=sh, spool=sp, spool_c=np.asarray(face) - dd * SPOOL_AT, axis=dd)
    return out

# 偏航转台 HDB60XZ45B：底座中心座是一个托盘（内宽 69，−x 侧有墙、+x 侧敞开，两颗定位销孔距 50），
# 转轴在 (x 7, y 0)。按记录：箱高 45、宽 67.5、含电机总长约 147、输出盘 ⌀60。电机从托盘敞开的 +x 侧伸出。
HDB = dict(x0=-23.3, x1=68.7, y0=-30.3, y1=37.2, z0=-145.0, top=-104.0, disk_c=(7.0, -0.2), disk_r=30.0,
           disk_top=-100.0, coup=12.0, motor_len=43.0, motor_c=(3.5, -123.5))

def hdb60():
    h = HDB
    housing = box((h['x0'], h['y0'], h['z0']), (h['x1'], h['y1'], h['top']))
    disk = cyl((*h['disk_c'], h['top']), (0, 0, 1), h['disk_r'], h['disk_top'] - h['top'], 64)
    coup = box((h['x1'], h['motor_c'][0] - 14, h['motor_c'][1] - 14), (h['x1'] + h['coup'], h['motor_c'][0] + 14, h['motor_c'][1] + 14))
    face = (h['x1'] + h['coup'], *h['motor_c'])
    body = prism(nema_profile(), face, (1, 0, 0), h['motor_len'])
    return dict(housing=merge(housing, coup), disk=disk, body=body)

# ---------------------------------------------------------------- 肌腱走线（块局部坐标 → 世界）

def tendon_paths(arm):
    """返回 {'A','B','C'}: 世界坐标折线。arm = extract_815 存的大触手实测（端板窗口 / 槽口 / 变换）。

    真实走法：每一节里，肌腱从近端板的窗口（本腱方位）进来，**越过轴线**，压进中央导块正对面的槽口
    （本腱方位 + 180°），再回到远端板的窗口（本腱方位）。节与节之间沿本腱方位走。梢端过端板缺口后绑在绑线柱上。
    """
    M = np.asarray(arm['l2w'], float)
    ay, az = arm['axis']
    plates = arm['plates']; grooves = [g for g in arm['grooves'] if g[0] < 400]
    nbox = len(grooves)
    seq = [(-3.0, 13.9)]                     # 根部腱孔（离轴 13.9）
    for i in range(nbox):
        (xa, ra), (xb, rb) = plates[2 * i], plates[2 * i + 1]
        xg, rg = grooves[i]
        seq += [(xa, ra), (xg, -rg), (xb, rb)]
    seq += [(plates[2 * nbox][0], plates[2 * nbox][1]), (401.7, 6.2)]   # 梢端端板缺口 → 绑线柱
    out = {}
    for name, ang in (('A', 90.0), ('B', 210.0), ('C', 330.0)):
        a = math.radians(ang)
        P = np.array([(x, ay + r * math.cos(a), az + r * math.sin(a)) for x, r in seq])
        out[name] = (np.c_[P, np.ones(len(P))] @ M)
    return out, seq
