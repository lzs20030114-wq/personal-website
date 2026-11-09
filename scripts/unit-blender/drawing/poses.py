"""姿态库：猫咖里会出现的动作。每个函数返回一个摆好的 Body（局部系，单位 H，脚底 y = 0）。"""
from ishi import Body, ADULT, CHILD, v, norm, rx, ry, rz
import numpy as np

G = 0.036  # 踝高


def stand_look_down():
    """站着低头看脚边的猫：重心在右腿，左膝放松，双手插大衣口袋"""
    b = Body(); b.clothes = dict(lower='coat', len=1.05, sleeve=True); b.hair = 'short'
    b.trunk(pelvis=(-0.018, 0.535, 0), tilt=-5, side=6, bend=4, nod=32, htilt=-8, turn=10)
    b.leg(-1, (-0.045, G, 0.0))
    b.leg(1, (0.085, G + 0.01, 0.07), knee_pole=(0.2, 0, 1), toe_pitch=8)
    b.arm(-1, (-0.10, 0.565, 0.075), elbow_pole=(-0.7, -0.1, -1), hand=(0.2, -1, 0.4))
    b.arm(1, (0.095, 0.555, 0.075), elbow_pole=(0.7, -0.1, -1), hand=(-0.2, -1, 0.4))
    return b


def walk_cup():
    """端着杯子走：左脚刚落地，右脚蹬地，右手端杯在胸前"""
    b = Body(); b.clothes = dict(); b.hair = 'bun'
    b.trunk(pelvis=(0, 0.525, 0), yaw=-6, tilt=2, bend=3, twist=10, nod=6)
    b.leg(1, (0.05, G + 0.02, 0.22), toe_pitch=-22)
    b.leg(-1, (-0.05, G + 0.06, -0.20), knee_pole=(0, -0.2, 1), toe_pitch=50)
    b.arm(-1, (-0.07, 0.70, 0.17), elbow_pole=(-0.4, -1, -0.4), hand=(0.3, 0.2, 1))
    b.arm(1, (0.13, 0.50, -0.13), elbow_pole=(0.2, -0.4, -1))
    w = b.arms[-1]['wrist']
    b.cap(w + v(0.005, 0.0, 0.028), w + v(0.005, 0.045, 0.028), 0.017, 0.02)  # 杯
    return b


def phone_photo():
    """弯着身子举手机拍台上的猫：一只脚在前，两手把手机举到眼前"""
    b = Body(); b.clothes = dict(lower='skirt', flare=0.06); b.hair = 'long'
    b.trunk(pelvis=(0, 0.53, -0.02), pitch=4, bend=12, side=-3, nod=-6, htilt=4)
    b.leg(1, (0.06, G, 0.13), knee_pole=(0.1, 0, 1))
    b.leg(-1, (-0.06, G + 0.005, -0.09), toe_pitch=12)
    tgt = v(0.0, 0.86, 0.27)
    b.arm(1, tgt + v(0.035, 0, 0), elbow_pole=(1, -1, 0), hand=(-0.2, 0.9, 0.2))
    b.arm(-1, tgt + v(-0.035, 0, 0), elbow_pole=(-1, -1, 0), hand=(0.2, 0.9, 0.2))
    b.cap(tgt + v(-0.03, 0.05, 0.01), tgt + v(0.03, 0.05, 0.01), 0.022, 0.022)  # 手机
    b.cap(b.sh[-1] + v(-0.02, -0.02, -0.02), b.pelvis + v(-0.12, -0.04, -0.04), 0.006, 0.006)  # 包带
    b.blob(b.pelvis + v(-0.13, -0.07, -0.05), 0.045)  # 包
    return b


def squat_pet():
    """蹲下摸地上的猫：脚跟着地深蹲，右手伸向前下方，左前臂搭在膝上"""
    b = Body(); b.clothes = dict(sleeve=True); b.hair = 'short'; b.hat = 'beanie'
    b.trunk(pelvis=(0, 0.22, -0.11), pitch=18, bend=30, side=2, twist=-8, nod=24, turn=-6)
    b.leg(1, (0.10, G, 0.03), knee_pole=(0.35, 0.3, 1))
    b.leg(-1, (-0.08, G, -0.02), knee_pole=(-0.25, 0.3, 1))
    b.arm(-1, (-0.04, 0.13, 0.40), elbow_pole=(-0.5, -0.6, 0.2), hand=(0, -0.5, 1))
    k = b.legs[1]['knee']
    b.arm(1, k + v(0.0, 0.03, 0.06), elbow_pole=(1, -0.2, -0.3), hand=(-0.4, -0.6, 0.5))
    return b


def kneel_offer():
    """单膝跪地，右手平伸给猫闻"""
    b = Body(); b.clothes = dict(sleeve=True); b.hair = 'bob'
    b.trunk(pelvis=(0.0, 0.30, -0.04), pitch=-2, bend=14, side=-4, nod=16, htilt=10)
    # 右膝着地，小腿在身后贴地
    b.leg_fk(-1, knee=(-0.055, 0.035, -0.02), ankle=(-0.06, 0.05, -0.26), foot=(0, 0, -1), toe_pitch=70)
    b.leg(1, (0.08, G, 0.27), knee_pole=(0.2, 0.3, 1))
    b.arm(-1, (-0.03, 0.29, 0.44), elbow_pole=(-0.3, -1, 0), hand=(0.1, 0.0, 1))
    k = b.legs[1]['knee']
    b.arm(1, k + v(0.01, 0.025, 0.02), elbow_pole=(1, -0.3, 0), hand=(-0.2, -0.8, 0.4))
    return b


def sofa_cross_legs(seat=0.26):
    """沙发上跷二郎腿往后靠，左臂搭在靠背上"""
    b = Body(); b.clothes = dict(sleeve=True); b.hair = 'curly'
    b.trunk(pelvis=(0, seat + 0.05, -0.02), pitch=-14, bend=-6, side=4, twist=-6, nod=8, htilt=-8, turn=0)
    b.leg(1, (0.06, G, 0.36), knee_pole=(0.1, 0.4, 1))
    k1 = b.legs[1]['knee']
    b.leg(-1, (k1[0] + 0.03, k1[1] - 0.12, k1[2] + 0.13), knee_pole=(-0.2, 1, 0.6), toe_pitch=30, foot=(0.3, 0, 1))
    b.arm(1, (0.27, 0.50, -0.15), elbow_pole=(1, 0.3, -0.4), hand=(0.8, -0.3, 0.2))
    b.arm(-1, (0.02, seat + 0.17, 0.20), elbow_pole=(-0.6, -1, -0.2), hand=(0.6, -0.4, 0.3))
    return b


def chair_lean(seat=0.27):
    """椅子上往前倾，手肘撑在膝上，两手捧杯"""
    b = Body(); b.clothes = dict(); b.hair = 'pony'
    b.trunk(pelvis=(0, seat + 0.04, -0.04), pitch=8, bend=26, nod=10, htilt=6)
    b.leg(1, (0.08, G, 0.27), knee_pole=(0.2, 0.3, 1))
    b.leg(-1, (-0.06, G + 0.03, 0.18), knee_pole=(-0.2, 0.3, 1), toe_pitch=25)
    c = v(0.005, 0.44, 0.27)
    b.arm(1, c + v(0.03, 0, 0), elbow_pole=(0.6, -1, 0), hand=(-0.6, 0.4, 0.4))
    b.arm(-1, c + v(-0.03, 0, 0), elbow_pole=(-0.6, -1, 0), hand=(0.6, 0.4, 0.4))
    b.cap(c + v(0, 0.01, 0.025), c + v(0, 0.055, 0.025), 0.02, 0.023)
    return b


def floor_crosslegged():
    """盘腿坐在地上，手放在腿上（猫在怀里）"""
    b = Body(); b.clothes = dict(sleeve=True); b.hair = 'long'
    b.trunk(pelvis=(0, 0.075, 0), pitch=-2, bend=10, side=-3, nod=26, htilt=6)
    b.leg_fk(1, knee=(0.21, 0.07, 0.13), ankle=(-0.05, 0.05, 0.20), foot=(-1, 0, 0.1))
    b.leg_fk(-1, knee=(-0.21, 0.08, 0.12), ankle=(0.06, 0.07, 0.15), foot=(1, 0, 0.2))
    b.arm(1, (0.07, 0.17, 0.20), elbow_pole=(0.8, -0.5, -0.4), hand=(-0.6, -0.3, 0.6))
    b.arm(-1, (-0.10, 0.16, 0.17), elbow_pole=(-0.8, -0.5, -0.4), hand=(0.6, -0.3, 0.6))
    return b


def lie_prone():
    """趴在地上撑着手肘，两只脚翘起来交叉"""
    b = Body(); b.clothes = dict(); b.hair = 'bob'
    b.trunk(pelvis=(0, 0.07, -0.05), pitch=84, bend=-34, side=0, nod=-46, htilt=8)
    b.arm(1, (0.05, 0.26, 0.49), elbow_pole=(0.6, -1, 0), hand=(-0.4, 0.6, 0.6))
    b.arm(-1, (-0.04, 0.27, 0.50), elbow_pole=(-0.6, -1, 0), hand=(0.4, 0.6, 0.6))
    b.leg_fk(1, knee=(0.06, 0.04, -0.29), ankle=(0.01, 0.25, -0.18), foot=(0, 1, 0.2))
    b.leg_fk(-1, knee=(-0.05, 0.04, -0.29), ankle=(0.03, 0.22, -0.41), foot=(0, 1, -0.3))
    b.arms[1]['sh'] = b.sh[1]; b.arms[-1]['sh'] = b.sh[-1]
    return b


def hold_cat():
    """站着把猫抱在胸前，微微后仰，低头看它"""
    b = Body(); b.clothes = dict(lower='dress', flare=0.05); b.hair = 'bun'
    b.trunk(pelvis=(0.01, 0.535, 0.02), pitch=-4, bend=-4, side=-4, twist=6, nod=30, htilt=12, turn=8)
    b.leg(1, (0.06, G, 0.0))
    b.leg(-1, (-0.075, G + 0.02, 0.06), knee_pole=(-0.2, 0, 1), toe_pitch=12)
    b.arm(1, (-0.05, 0.64, 0.15), elbow_pole=(1, -1, 0.1), hand=(-1, 0.1, 0.15))
    b.arm(-1, (0.06, 0.74, 0.16), elbow_pole=(-1, -1, 0), hand=(1, 0.2, 0.1))
    return b


def child_reach():
    """小孩踮脚，双手伸高去够台上的猫"""
    b = Body(CHILD); b.clothes = dict(lower='dress', flare=0.07, len=0.9); b.hair = 'pony'
    b.trunk(pelvis=(0, 0.50, -0.02), pitch=-3, bend=-8, side=3, nod=-18, htilt=8)
    b.leg(1, (0.05, G + 0.05, 0.02), toe_pitch=55)
    b.leg(-1, (-0.05, G + 0.06, -0.05), toe_pitch=58)
    b.arm(1, (0.06, 1.08, 0.20), elbow_pole=(1, -0.2, -0.5), hand=(0, 1, 0.5))
    b.arm(-1, (-0.09, 1.04, 0.16), elbow_pole=(-1, -0.2, -0.5), hand=(0.1, 1, 0.4))
    return b


def child_run():
    """小孩往前跑，身子前倾，手臂甩开"""
    b = Body(CHILD); b.clothes = dict(); b.hair = 'short'
    b.trunk(pelvis=(0, 0.47, 0), pitch=12, bend=4, twist=-14, nod=-6)
    b.leg(1, (0.04, 0.17, 0.12), knee_pole=(0, 0.5, 1), toe_pitch=-10)
    b.leg(-1, (-0.04, 0.12, -0.24), knee_pole=(0, -0.3, 1), toe_pitch=55)
    b.arm(1, (0.11, 0.62, -0.14), elbow_pole=(0.3, 0.3, -1))
    b.arm(-1, (-0.06, 0.70, 0.16), elbow_pole=(-0.3, -1, -0.4), hand=(0, 0.5, 1))
    return b


def bend_hands_knees():
    """弯下腰、两手撑在膝上，抬头看台上的猫"""
    b = Body(); b.clothes = dict(wide=True); b.hair = 'short'; b.hat = 'cap'
    b.trunk(pelvis=(0, 0.50, -0.07), pitch=28, bend=22, nod=-38, htilt=-6, turn=10)
    b.leg(1, (0.07, G, 0.04), knee_pole=(0.2, 0, 1))
    b.leg(-1, (-0.07, G, 0.0), knee_pole=(-0.2, 0, 1))
    for s in (1, -1):
        k = b.legs[s]['knee']
        b.arm(s, k + v(s * 0.005, 0.035, 0.03), elbow_pole=(s * 1, -0.2, -0.5), hand=(0, -0.7, 0.6))
    return b


def chat_gesture():
    """站着说话，一只手抬起来比划，另一只手提着帆布包"""
    b = Body(); b.clothes = dict(lower='coat', len=1.1); b.hair = 'long'
    b.trunk(pelvis=(0.01, 0.535, 0), yaw=8, tilt=4, side=-5, twist=-10, nod=-4, htilt=10, turn=-12)
    b.leg(1, (0.04, G, 0.0))
    b.leg(-1, (-0.085, G + 0.012, 0.05), knee_pole=(-0.2, 0, 1), toe_pitch=10)
    b.arm(-1, (-0.19, 0.66, 0.17), elbow_pole=(-1, -1, -0.4), hand=(-0.6, 0.3, 0.6))
    b.arm(1, (0.13, 0.50, 0.02), elbow_pole=(0.3, -0.5, -1), hand=(0, -1, 0))
    w = b.arms[1]['wrist']
    b.line([w + v(0.0, 0.0, 0.0), w + v(0.0, -0.05, 0.0)], 0.004)
    b.cap(w + v(0.01, -0.08, 0.0), w + v(0.01, -0.15, 0.0), 0.04, 0.042)
    return b


def lean_wall():
    """靠墙站，抱着胳膊，一只脚往后踩在墙上"""
    b = Body(); b.clothes = dict(); b.hair = 'curly'
    b.trunk(pelvis=(0, 0.53, -0.05), pitch=-6, bend=-3, side=3, nod=10, htilt=-10, turn=-20)
    b.leg(-1, (-0.06, G, 0.10))
    b.leg(1, (0.04, 0.24, -0.11), knee_pole=(0.2, 0, 1), foot=(0, -0.2, -1), toe_pitch=-20)
    b.arm(1, (-0.08, 0.72, 0.10), elbow_pole=(1, -0.6, 0.6), hand=(-1, 0.2, -0.2))
    b.arm(-1, (0.08, 0.70, 0.11), elbow_pole=(-1, -0.8, 0.6), hand=(1, 0.3, -0.2))
    return b


def wand_play():
    """站着拿逗猫棒往前伸，另一只手叉腰"""
    b = Body(); b.clothes = dict(lower='skirt', flare=0.08, len=1.1); b.hair = 'pony'
    b.trunk(pelvis=(0, 0.53, 0), yaw=-6, pitch=3, tilt=-3, bend=10, side=4, twist=-12, nod=26, htilt=6)
    b.leg(1, (0.05, G, -0.01))
    b.leg(-1, (-0.07, G + 0.01, 0.12), knee_pole=(-0.1, 0, 1), toe_pitch=6)
    b.arm(-1, (-0.06, 0.66, 0.38), elbow_pole=(-0.5, -1, 0), hand=(0, -0.2, 1))
    b.arm(1, (0.12, 0.56, -0.02), elbow_pole=(1, 0.1, -0.6), hand=(-0.6, -0.4, -0.2))
    tip = b.arms[-1]['tip']
    end = tip + v(0.03, -0.24, 0.20)
    mid = (tip + end) / 2 + v(0, 0.08, 0)
    b.line([tip, mid * 0.6 + tip * 0.4, mid, end], 0.004)
    b.blob(end + v(0, -0.02, 0), 0.016)
    b.line([end, end + v(0, -0.04, 0.01)], 0.002)
    return b


def couple_walk():
    """两个人并肩走（返回两个）"""
    a = Body(); a.clothes = dict(lower='coat', len=1.0); a.hair = 'short'; a.hat = 'bowler'
    a.trunk(pelvis=(0, 0.53, 0), yaw=0, tilt=-2, twist=-8, nod=2, turn=-25)
    a.leg(1, (0.05, G + 0.05, -0.17), toe_pitch=45)
    a.leg(-1, (-0.05, G + 0.015, 0.19), toe_pitch=-15)
    a.arm(1, (0.11, 0.55, 0.06), elbow_pole=(0.3, -0.5, -1))
    a.arm(-1, (-0.12, 0.50, -0.08), elbow_pole=(0, -0.5, -1))
    c = Body(); c.clothes = dict(lower='dress', flare=0.05); c.hair = 'long'
    c.trunk(pelvis=(0, 0.525, 0), tilt=3, twist=8, nod=-2, htilt=6, turn=22)
    c.leg(-1, (-0.05, G + 0.05, -0.17), toe_pitch=45)
    c.leg(1, (0.05, G + 0.015, 0.17), toe_pitch=-15)
    c.arm(-1, (-0.11, 0.56, 0.08), elbow_pole=(-0.3, -0.5, -1))
    c.arm(1, (0.10, 0.48, -0.08), elbow_pole=(0, -0.5, -1))
    return a, c


ALL = [
    ('站着低头看猫', stand_look_down, 35, []),
    ('端着杯子走', walk_cup, 70, []),
    ('举手机拍猫', phone_photo, 55, [('plate', 0.0, 0.62, 0.62, 0.42)]),
    ('蹲下摸猫', squat_pet, 60, []),
    ('单膝跪地伸手', kneel_offer, 65, []),
    ('沙发上跷腿靠着', sofa_cross_legs, 62, [('sofa',)]),
    ('椅子上前倾捧杯', chair_lean, 65, [('chair',)]),
    ('盘腿坐地上', floor_crosslegged, 25, []),
    ('趴着撑肘', lie_prone, 75, []),
    ('抱着猫', hold_cat, 40, []),
    ('小孩踮脚够猫', child_reach, 55, [('plate', 0.0, 1.30, 0.30, 0.44)]),
    ('小孩跑', child_run, 80, []),
    ('弯腰撑膝看猫', bend_hands_knees, 60, [('plate', 0.0, 0.54, 0.42, 0.42)]),
    ('站着比划', chat_gesture, 30, []),
    ('靠墙抱臂', lean_wall, 82, [('wall', -0.155)]),
    ('拿逗猫棒', wand_play, 60, []),
]
