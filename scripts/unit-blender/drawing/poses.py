"""姿态库：猫咖里会出现的动作。每个函数返回一个摆好的 Body（局部系，单位 H，脚底 y = 0）。

2026-11-09 第三轮重排（作者：线条流畅度、动态、动作识别度、人体正确性、生动程度）。每个姿态照这几条摆：
  1. 重心：站着的人骨盆压在承重脚上方，承重那侧的胯高、肩低（骨盆和肩反着斜），另一条腿松着；
  2. 一条贯穿全身的弧线（脊柱不是一根直棍）：看猫的人从脚到头是一个往前的 C 形；
  3. 左右不对称：两只手、两只脚不做同一件事；
  4. 视线：头朝着正在看的东西（猫、手机、杯子），用 aim_head 解出来，不是随手填的角度；
  5. 手里的东西画出来，手和东西离开身体的外形，一眼看得出在干什么；
  6. 关节不超出活动范围：膝只往后弯、肘只往前弯，手够不到的地方靠弯腰和屈膝去够，不拉长胳膊。
侧别：s = 1 是人的左边（+x），s = −1 是右边。姿态表里 yaw > 0 时右边朝着看图的人。
"""
import math
import numpy as np
from ishi import Body, ADULT, CHILD, v, norm, rx, ry, rz
import linefig as LF

G = 0.036  # 踝高


def _body(P, fit, hair, hat=None, kid=False):
    b = Body(P or (LF.KID if kid else LF.REAL))
    b.fit = dict(fit); b.hair = hair; b.hat = hat; b.clothes = {}
    return b


# ---------------------------------------------------------------- 手里的东西
def cup(b, c, pri=0.0):
    """纸杯：上口比底大一点的圆台。手压在杯子上（优先级比手低）"""
    up = v(0, 1, 0)
    b.extra.append(('hull', [(v(*c) - up * 0.030, 0.0165, up), (v(*c) + up * 0.032, 0.021, up)], 'body', pri))
    b.extra.append(('hull', [(v(*c) + up * 0.032, 0.0225, up), (v(*c) + up * 0.038, 0.0225, up)], 'body', pri))


def phone(b, c, right, up, w=0.088, h=0.046, t=0.007):
    c, right, up = v(*c), norm(v(*right)), norm(v(*up))
    n = np.cross(right, up)
    pts = [c + right * (i * w / 2) + up * (j * h / 2) + n * (k * t / 2) for i in (-1, 1) for j in (-1, 1) for k in (-1, 1)]
    b.extra.append(('poly', pts, 'ink', 0.0))


def tote(b, hand_pt, swing=(0, 0, 0)):
    """手里提着的帆布袋：两根提手 + 一个扁袋子"""
    h = v(*hand_pt); s = v(*swing)
    top = h + v(0, -0.075, 0) + s * 0.4
    bot = h + v(0, -0.235, 0) + s
    for dz in (-0.045, 0.045):
        b.extra.append(('line', [h + v(0, -0.012, dz * 0.25), top + v(0, 0, dz)], 0.0028))
    pts = [p + v(dx, 0, dz) for p, hw in ((top, 0.075), (bot, 0.082)) for dx in (-0.012, 0.012) for dz in (-hw, hw)]
    b.extra.append(('poly', pts, 'body', 0.6))


def wand(b, grip, tip, lure):
    grip, tip, lure = v(*grip), v(*tip), v(*lure)
    b.extra.append(('line', [grip - norm(tip - grip) * 0.02, tip], 0.0032))
    sag = (tip + lure) / 2 + v(0, -0.02, 0)
    b.extra.append(('line', [tip, sag, lure], 0.0016))
    b.extra.append(('hull', [(lure, 0.012), (lure + v(0, -0.035, 0.008), 0.006)], 'ink', 1.5))


def held_cat(b, rump, chest, head, tail, coat='ink'):
    """抱在怀里的猫（黑猫，和白衣服分得开）：身子竖着贴在胸前，头搭在肩上，尾巴从前臂下面垂下来"""
    rump, chest, head = v(*rump), v(*chest), v(*head)
    pr = -12.0       # 往后推 5 cm：排在前臂和手后面、躯干前面
    b.extra.append(('chain', [(v(*t), r) for t, r in zip(tail, (0.012, 0.011, 0.008))], coat, pr))
    b.extra.append(('hull', [(rump, 0.050), (chest, 0.044)], coat, pr))
    up = norm(head - chest); side = norm(np.cross(up, v(0, 0, 1)))
    for sx in (-1, 1):
        b.extra.append(('poly', [head + side * (sx * 0.012) + up * 0.022, head + side * (sx * 0.030) + up * 0.058, head + side * (sx * 0.036) + up * 0.012], coat, pr + 1))
    b.extra.append(('hull', [(head, 0.035)], coat, pr + 1))


# ---------------------------------------------------------------- 十六个姿态
def stand_look_down(P=None):
    """站着低头看脚边的猫：重心在右腿，左脚松着点在前面，两手插在大衣口袋里，上身往前探"""
    b = _body(P, dict(top='coat', bottom='trousers', nohand=(1, -1)), 'bob')
    b.trunk(pelvis=(-0.022, 0.540, 0.0), tilt=-5, side=9, pitch=4, bend=14, twist=6)
    b.leg(-1, (-0.040, G, -0.012), foot=(-0.12, 0, 1))
    b.leg(1, (0.100, G + 0.004, 0.090), knee_pole=(0.3, 0, 1), foot=(0.45, 0, 1), toe_pitch=3)
    # 两手插在大衣口袋里，手肘往后外撑开
    b.arm(1, (0.118, 0.548, 0.062), elbow_pole=(1, 0.1, -0.8), hand=(-0.3, -1, 0.3))
    b.arm(-1, (-0.122, 0.540, 0.058), elbow_pole=(-1, 0.1, -0.8), hand=(0.3, -1, 0.3))
    LF.aim_head(b, (-0.03, 0.06, 0.40), htilt=-5, gain=0.9)
    return b


def walk_cup(P=None):
    """端着杯子走：右脚脚跟刚着地，左脚在后面蹬地；左手端杯在身前，右臂往后摆"""
    b = _body(P, dict(top='long', bottom='wide', grip={1: True}), 'bun')
    b.trunk(pelvis=(0, 0.506, 0), yaw=6, pitch=4, tilt=-2, twist=-14, side=2, bend=3)
    b.leg(-1, (-0.045, G + 0.012, 0.175), foot=(-0.05, 0, 1), toe_pitch=-16)
    b.leg(1, (0.050, G + 0.058, -0.195), foot=(0.05, 0, 1), toe_pitch=54)
    b.arm(1, (0.060, 0.650, 0.205), elbow_pole=(0.5, -1, -0.4), hand=(-0.2, 0.15, 1))
    b.arm(-1, (-0.128, 0.530, -0.115), elbow_pole=(-0.3, 0.25, -1), hand=(0.0, -0.9, -0.35))
    A = b.arms[1]
    cup(b, A['wrist'] + norm(A['tip'] - A['wrist']) * 0.045 + v(0, 0.012, 0))
    LF.aim_head(b, (0.0, 0.84, 1.0), gain=0.9)
    return b


def phone_photo(P=None):
    """举手机拍台上的猫：上身往前探，右手把手机举在眼前，左手扶着包带，两脚一前一后"""
    b = _body(P, dict(top='tee', bottom='skirt', grip={-1: True, 1: True}, len=1.1), 'long')
    b.trunk(pelvis=(0, 0.530, -0.040), pitch=8, bend=14, side=-3, tilt=2, twist=-8)
    b.leg(1, (0.062, G, 0.085), knee_pole=(0.15, 0, 1), foot=(0.2, 0, 1))
    b.leg(-1, (-0.072, G + 0.006, -0.090), knee_pole=(-0.1, 0, 1), foot=(-0.25, 0, 1), toe_pitch=12)
    LF.shrug(b, -1, up=0.012, fwd=0.03)
    T = v(-0.045, 0.875, 0.335)
    b.arm(-1, T + v(0, -0.060, -0.012), elbow_pole=(-0.5, -1, 0.0), hand=(0.1, 1, 0.15))
    phone(b, T, (1, 0, 0), (0, 1, -0.12), w=0.046, h=0.090)
    b.arm(1, (0.060, 0.735, 0.090), elbow_pole=(1, -0.6, -0.5), hand=(-0.5, 0.8, 0.0))
    LF.aim_head(b, (-0.03, 0.80, 0.70), gain=0.9, htilt=-4)
    return b


def squat_pet(P=None):
    """蹲下摸地上的猫：深蹲，右脚跟抬起来一点，右手伸到前下方，左前臂搭在膝上"""
    b = _body(P, dict(top='long', bottom='trousers'), 'short')
    b.trunk(pelvis=(0, 0.222, -0.105), pitch=24, bend=36, twist=-8, side=-3)
    b.leg(1, (0.095, G, 0.045), knee_pole=(0.35, 0.5, 1), foot=(0.3, 0, 1))
    b.leg(-1, (-0.085, G + 0.020, -0.005), knee_pole=(-0.3, 0.5, 1), foot=(-0.25, 0, 1), toe_pitch=26)
    LF.shrug(b, -1, fwd=0.03)
    b.arm(-1, (-0.075, 0.105, 0.390), elbow_pole=(-0.6, -0.2, 0.2), hand=(0.15, -0.5, 1))
    k = b.legs[1]['knee']
    b.arm(1, k + v(-0.040, 0.048, 0.050), elbow_pole=(1, -0.3, -0.2), hand=(-0.75, -0.5, 0.35))
    LF.aim_head(b, (-0.07, 0.04, 0.47), gain=0.9)
    return b


def kneel_offer(P=None):
    """单膝跪地，右手伸出去给猫闻：左膝着地，右脚踩在前面，左手搭在自己腿上"""
    b = _body(P, dict(top='tee', bottom='trousers'), 'fringe')
    b.trunk(pelvis=(0, 0.300, -0.030), pitch=6, bend=15, twist=-6)
    b.leg_fk(1, knee=(0.060, 0.050, 0.020), ankle=(0.066, 0.046, -0.227), foot=(0, 0, -1), toe_pitch=62)
    b.leg(-1, (-0.075, G, 0.245), knee_pole=(-0.15, 0.6, 1), foot=(-0.1, 0, 1))
    LF.shrug(b, -1, fwd=0.035)
    b.arm(-1, (-0.050, 0.235, 0.480), elbow_pole=(-0.4, -1, 0), hand=(0.05, -0.25, 1))
    b.arm(1, (0.105, 0.340, 0.085), elbow_pole=(1, -0.2, -0.5), hand=(-0.35, -0.8, 0.45))
    LF.aim_head(b, (-0.04, 0.10, 0.62), gain=0.9, htilt=6)
    return b


def sofa_cross_legs(P=None, seat=0.25):
    """沙发上跷腿往后靠：左脚踩地，右腿搭在左膝上，左臂搭在靠背上，右手放在腿上"""
    b = _body(P, dict(top='long', bottom='trousers'), 'curly')
    b.trunk(pelvis=(0.0, seat + 0.066, -0.175), pitch=-17, bend=-2, side=3, twist=-6)
    b.leg(1, (0.070, G, 0.050), knee_pole=(0.15, 0.6, 1), foot=(0.25, 0, 1))
    k1 = b.legs[1]['knee']
    b.leg(-1, (k1[0] + 0.050, k1[1] - 0.100, k1[2] + 0.165), knee_pole=(-0.15, 1, 0.3), foot=(0.4, 0, 1), toe_pitch=38)
    b.arm(1, (0.310, 0.538, -0.330), elbow_pole=(0.2, 0.3, -1), hand=(1, -0.15, -0.1))
    kR = b.legs[-1]['knee']
    b.arm(-1, kR + v(-0.012, 0.046, -0.025), elbow_pole=(-1, -0.3, -0.3), hand=(0.45, -0.5, 0.7))
    LF.aim_head(b, (-0.5, 0.42, 0.6), gain=0.8, htilt=-6)
    return b


def chair_lean(P=None, seat=0.27):
    """椅子上往前倾，两手捧着杯子，前臂撑在腿上；一只脚往后收，脚跟抬着"""
    b = _body(P, dict(top='tee', bottom='wide', grip={1: True, -1: True}), 'pony')
    b.trunk(pelvis=(0, seat + 0.066, -0.040), pitch=16, bend=25)
    b.leg(1, (0.090, G, 0.235), knee_pole=(0.2, 0.5, 1), foot=(0.2, 0, 1))
    b.leg(-1, (-0.080, G + 0.024, 0.110), knee_pole=(-0.2, 0.5, 1), foot=(-0.15, 0, 1), toe_pitch=26)
    c = v(0.0, 0.455, 0.300)
    for s in (1, -1):
        b.arm(s, c + v(s * 0.036, -0.010, -0.024), elbow_pole=(s * 0.8, -1, 0), hand=(-s * 0.75, 0.25, 0.6))
    cup(b, c)
    LF.aim_head(b, (0, 0.30, 0.9), gain=0.9)
    return b


def floor_crosslegged(P=None):
    """盘腿坐在地上，猫在怀里，两手拢着它，低头看"""
    b = _body(P, dict(top='long', bottom='trousers'), 'long')
    b.trunk(pelvis=(0, 0.070, 0), pitch=2, bend=17, side=-2)
    b.leg_fk(1, knee=(0.222, 0.066, 0.172), ankle=(-0.012, 0.042, 0.238), foot=(-1, 0, 0.25))
    b.leg_fk(-1, knee=(-0.224, 0.078, 0.165), ankle=(0.030, 0.066, 0.186), foot=(1, 0, 0.3))
    b.arm(1, (0.062, 0.165, 0.185), elbow_pole=(0.9, -0.4, -0.3), hand=(-0.8, -0.3, 0.5))
    b.arm(-1, (-0.078, 0.150, 0.165), elbow_pole=(-0.9, -0.4, -0.3), hand=(0.8, -0.3, 0.5))
    LF.aim_head(b, (0, 0.13, 0.21), gain=0.85, htilt=5)
    return b


def lie_prone(P=None):
    """趴在地上，手肘撑着，两只脚翘起来交叉，抬头看面前的猫"""
    b = _body(P, dict(top='tee', bottom='trousers'), 'bob')
    b.trunk(pelvis=(0, 0.060, -0.080), pitch=86, bend=-32)
    for s in (1, -1):
        S = b.sh[s]
        b.arm(s, (s * 0.030, 0.030, S[2] + 0.255 - s * 0.012), elbow_pole=(s * 0.5, -1, 0.15), hand=(-s * 0.5, 0.05, 1))
    b.leg_fk(1, knee=(0.050, 0.036, -0.326), ankle=(0.030, 0.268, -0.245), foot=(0, 1, 0.25))
    b.leg_fk(-1, knee=(-0.050, 0.036, -0.326), ankle=(-0.005, 0.238, -0.405), foot=(0, 1, -0.35))
    LF.aim_head(b, (0, 0.14, 0.80), gain=1.0, max_nod=(-60, 40))
    return b


def hold_cat(P=None):
    """站着把猫抱在胸前：重心在左腿，上身微微后仰，右前臂托着猫，左手扶着它的背，头歪向它"""
    b = _body(P, dict(top='dress', bottom=None), 'bun')
    b.trunk(pelvis=(0.020, 0.540, 0.010), tilt=5, side=-9, pitch=-4, bend=-3, twist=6)
    b.leg(1, (0.040, G, 0.0), foot=(0.2, 0, 1))
    b.leg(-1, (-0.100, G + 0.006, 0.070), knee_pole=(-0.3, 0, 1), foot=(-0.45, 0, 1), toe_pitch=5)
    # 猫竖着贴在右胸前，头搭在右肩上；右前臂横着托住它的屁股，左手扶着它的背
    b.arm(-1, (0.020, 0.640, 0.150), elbow_pole=(-1, -1, 0.1), hand=(1, 0.1, 0.0))
    b.arm(1, (0.000, 0.765, 0.170), elbow_pole=(1, -0.9, 0.1), hand=(-1, 0.25, 0.0))
    held_cat(b, (-0.030, 0.672, 0.118), (-0.048, 0.775, 0.104), (-0.066, 0.838, 0.090),
             [(-0.020, 0.640, 0.130), (0.012, 0.568, 0.138), (0.022, 0.505, 0.126)])
    LF.aim_head(b, (-0.07, 0.84, 0.16), gain=0.8, htilt=-10)
    return b


def child_reach(P=None):
    """小孩踮着脚，两只手伸高去够台上的猫，仰着头"""
    b = _body(P, dict(top='dress', bottom=None), 'pony', kid=True)
    b.trunk(pelvis=(0, 0.515, -0.020), pitch=-3, bend=-10, side=4, tilt=-2)
    b.leg(1, (0.050, G + 0.050, 0.030), toe_pitch=56, foot=(0.15, 0, 1))
    b.leg(-1, (-0.055, G + 0.058, -0.045), toe_pitch=60, foot=(-0.1, 0, 1))
    for s in (1, -1):
        LF.shrug(b, s, up=0.030, fwd=0.010)
    b.arm(1, (0.075, 1.130, 0.150), elbow_pole=(1, -0.2, -0.5), hand=(0, 1, 0.5))
    b.arm(-1, (-0.090, 1.085, 0.185), elbow_pole=(-1, -0.2, -0.5), hand=(0.1, 1, 0.5))
    LF.aim_head(b, (0, 1.42, 0.30), max_nod=(-50, 40))
    return b


def child_run(P=None):
    """小孩往前跑：上身前倾，近侧的腿抬膝在前，远侧的腿蹬在后面，两臂一前一后"""
    b = _body(P, dict(top='tee', bottom='shorts'), 'short', kid=True)
    b.trunk(pelvis=(0, 0.478, 0), yaw=8, pitch=14, bend=5, twist=-18)
    b.leg(-1, (-0.045, 0.165, 0.160), knee_pole=(0, 0.6, 1), toe_pitch=-8)
    b.leg(1, (0.045, 0.130, -0.255), knee_pole=(0, -0.2, 1), toe_pitch=58)
    b.arm(1, (0.070, 0.670, 0.165), elbow_pole=(0.4, -1, -0.5), hand=(0, 0.5, 1))
    b.arm(-1, (-0.118, 0.565, -0.150), elbow_pole=(-0.3, 0.4, -1), hand=(0, -0.3, -1))
    LF.aim_head(b, (0, 0.78, 1.0))
    return b


def bend_hands_knees(P=None):
    """弯下腰、两手撑在膝上，抬头看台上的猫"""
    b = _body(P, dict(top='tee', bottom='wide'), 'short', 'cap')
    b.trunk(pelvis=(0, 0.478, -0.130), pitch=48, bend=22)
    b.leg(1, (0.085, G, 0.030), knee_pole=(0.25, 0, 1), foot=(0.3, 0, 1))
    b.leg(-1, (-0.085, G, -0.005), knee_pole=(-0.25, 0, 1), foot=(-0.3, 0, 1))
    for s in (1, -1):
        k = b.legs[s]['knee']
        b.arm(s, k + v(s * 0.006, 0.048, 0.028), elbow_pole=(s, -0.2, -0.5), hand=(-s * 0.2, -0.85, 0.45))
    LF.aim_head(b, (0, 0.62, 0.46), max_nod=(-55, 55))
    return b


def chat_gesture(P=None):
    """站着说话：重心在左腿，右手抬起来比划，左手提着帆布袋，头偏向对面的人"""
    b = _body(P, dict(top='coat', bottom='wide', grip={1: True}), 'short')
    b.trunk(pelvis=(0.020, 0.540, 0), yaw=6, tilt=5, side=-9, twist=-12)
    b.leg(1, (0.045, G, 0.0), foot=(0.2, 0, 1))
    b.leg(-1, (-0.105, G + 0.004, 0.055), knee_pole=(-0.3, 0, 1), foot=(-0.5, 0, 1), toe_pitch=3)
    b.arm(-1, (-0.285, 0.725, 0.135), elbow_pole=(-0.5, -1, -0.4), hand=(-0.75, 0.45, 0.45))
    LF.hang(b, 1, fwd=0.015, out=0.03, hand=(0, -1, 0.05))
    A = b.arms[1]
    tote(b, A['wrist'] + v(0, -0.04, 0.0), swing=(0.0, 0, 0.02))
    LF.aim_head(b, (-0.9, 0.95, 0.9), htilt=8, gain=0.9)
    return b


def lean_wall(P=None):
    """靠墙站着抱着胳膊，一只脚往后踩在墙上，头转向屋里"""
    b = _body(P, dict(top='long', bottom='slim'), 'curly')
    b.trunk(pelvis=(0, 0.528, -0.058), pitch=-9, bend=7, side=2)
    b.leg(-1, (-0.055, G, 0.125), foot=(-0.1, 0, 1))
    b.leg(1, (0.045, 0.235, -0.118), knee_pole=(0.2, 0, 1), foot=(0, 0, 1), toe_pitch=86)
    b.arm(1, (-0.088, 0.712, 0.108), elbow_pole=(1, -0.9, 0.3), hand=(-1, 0.25, -0.3))
    b.arm(-1, (0.072, 0.690, 0.100), elbow_pole=(-1, -0.9, 0.3), hand=(1, 0.1, -0.4))
    LF.aim_head(b, (-0.7, 0.9, 1.0), gain=0.9, htilt=-4)
    return b


def wand_play(P=None):
    """站着拿逗猫棒往前伸，上身跟着探出去，另一只手叉在腰上，低头看猫"""
    b = _body(P, dict(top='long', bottom='skirt', grip={-1: True}, len=1.15, flare=0.02), 'pony')
    b.trunk(pelvis=(0.0, 0.530, -0.020), pitch=8, bend=13, tilt=-3, side=5, twist=-14)
    b.leg(1, (0.055, G, -0.030), foot=(0.25, 0, 1))
    b.leg(-1, (-0.070, G + 0.004, 0.130), knee_pole=(-0.1, 0, 1), foot=(-0.1, 0, 1))
    LF.shrug(b, -1, fwd=0.02)
    b.arm(-1, (-0.075, 0.650, 0.305), elbow_pole=(-0.5, -1, 0), hand=(0.0, 0.1, 1))
    b.arm(1, (0.128, 0.590, -0.025), elbow_pole=(1, 0.1, -0.7), hand=(-0.6, -0.6, 0.2))
    A = b.arms[-1]
    g = A['wrist'] + norm(A['tip'] - A['wrist']) * 0.045
    wand(b, g, g + v(0.0, 0.035, 0.150), g + v(0.0, -0.270, 0.185))
    LF.aim_head(b, (-0.03, 0.22, 0.62), gain=0.85, htilt=4)
    return b


def couple_walk(P=None):
    """两个人并肩走（返回两个）"""
    a = _body(P, dict(top='coat', bottom='trousers'), 'short')
    a.trunk(pelvis=(0, 0.510, 0), tilt=-2, twist=-10, pitch=3)
    a.leg(1, (0.05, G + 0.055, -0.185), toe_pitch=50)
    a.leg(-1, (-0.05, G + 0.012, 0.170), toe_pitch=-15)
    LF.hang(a, 1, fwd=0.10); LF.hang(a, -1, fwd=-0.08)
    LF.aim_head(a, (-0.6, 0.9, 1.0), gain=0.8)
    c = _body(P, dict(top='dress', bottom=None), 'long')
    c.trunk(pelvis=(0, 0.508, 0), tilt=3, twist=10, pitch=3)
    c.leg(-1, (-0.05, G + 0.055, -0.180), toe_pitch=50)
    c.leg(1, (0.05, G + 0.012, 0.165), toe_pitch=-15)
    LF.hang(c, -1, fwd=0.10); LF.hang(c, 1, fwd=-0.08)
    LF.aim_head(c, (0.6, 0.9, 1.0), gain=0.8, htilt=6)
    return a, c


ALL = [
    ('站着低头看猫', stand_look_down, 35, []),
    ('端着杯子走', walk_cup, 70, []),
    ('举手机拍猫', phone_photo, 55, [('plate', 0.0, 0.62, 0.62, 0.42)]),
    ('蹲下摸猫', squat_pet, 60, []),
    ('单膝跪地伸手', kneel_offer, 65, []),
    ('沙发上跷腿靠着', sofa_cross_legs, 62, [('sofa', 1)]),
    ('椅子上前倾捧杯', chair_lean, 65, [('chair',)]),
    ('盘腿坐地上', floor_crosslegged, 25, []),
    ('趴着撑肘', lie_prone, 75, []),
    ('抱着猫', hold_cat, 40, []),
    ('小孩踮脚够猫', child_reach, 72, [('plate', 0.0, 1.30, 0.30, 0.44)]),
    ('小孩跑', child_run, 80, []),
    ('弯腰撑膝看猫', bend_hands_knees, 60, [('plate', 0.0, 0.54, 0.42, 0.42)]),
    ('站着比划', chat_gesture, 30, []),
    ('靠墙抱臂', lean_wall, 82, [('wall', -0.155)]),
    ('拿逗猫棒', wand_play, 60, []),
]
