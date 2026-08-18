# -*- coding: utf-8 -*-
"""
收缩张紧外皮单元 · v7 —— 软皮 + 键生成刚度
原则修正: 皮本身是软布(不设曲率上限), 形态的刚度来自成键 —
双层梯身扣合后由"层直化"约束拉直(不可伸长链: 端距=弧长 => 必然直线)。
上层通长直化(台面连续平), 下层按键长分段直化(台阶留在底面)。
"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
for f in font_manager.findSystemFonts():
    if "NotoSansCJK" in f:
        font_manager.fontManager.addfont(f)
plt.rcParams["font.family"] = ["Noto Sans CJK JP", "DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False

SEG   = 0.02
BETA  = 0.80                 # v6 验证过的成形刚度
GRAV  = -1.8
PRESS = 3.0
DT, DAMP, ITERS, STEPS = 0.004, 0.90, 55, 1500
R0, R1 = 0.95, 0.30
D_ACT, D_LOCK, K_ATT = 1.20, 0.14, 0.10
K_STR = 1.0                  # 层直化强度(键生成刚度)
STRIPE = 8

UNITS = {
    "袋 · pocket": [
        ('g', 50), ('f', 42, [(4, 38, 0.30), (7, 35, 0.30)]), ('g', 58)],
    "蘑菇挑台 · bulb flange": [
        ('g', 58), ('f', 62, [(30 - k, 30 + k, 0.10) for k in range(8, 26, 2)]), ('g', 50)],
    "直挑台 · straight ledge": [
        ('g', 58), ('f', 58, [(29 - k, 29 + k, 0.09) for k in range(4, 25, 2)]), ('g', 50)],
    "阶梯挑台 · stepped ledge": [
        ('g', 50), ('f', 66, [(33 - k, 33 + k, 0.24) for k in range(6, 27, 2)],
                    [(27, 39)]), ('g', 50)],   # 等长键方箱: 端面弧长=键长 -> 必然拉直
}

def build(spec):
    glued, chains, panels, idx = [], [], [], 0
    for s in spec:
        if s[0] == 'g':
            glued += list(range(idx, idx + s[1]))
        else:
            if s[2]:
                zone = [(idx + a, idx + b, rb) for (a, b, rb) in s[2]]
                zone.sort(key=lambda t: -(t[1] - t[0]))  # 拉链: 跨度大(近主干)在前
                chains.append(zone)
            if len(s) > 3:
                panels += [(idx + a, idx + b) for (a, b) in s[3]]
        idx += s[1]
    return idx, glued, chains, panels

def core_y(spec, r):
    ys, y = [], 0.0
    for s in spec:
        step = SEG if s[0] == 'g' else SEG * r
        for _ in range(s[1]):
            ys.append(-y); y += step
    return np.array(ys), y

def straighten(pos, a, b, k):
    """多尺度直化: 在 a..b 节点区间内按多个跨距施加 端距=弧长 约束 -> 板级刚度"""
    if b < a: a, b = b, a
    if b - a < 4: return
    for off in (2, 4, 8, 16, 32):
        if off > b - a: break
        seg = pos[a:b+1]
        d2 = seg[off:] - seg[:-off]
        dist2 = np.linalg.norm(d2, axis=1, keepdims=True)
        corr2 = k * 0.5 * (dist2 - off * SEG) / np.maximum(dist2, 1e-9) * d2
        seg[:-off] += corr2; seg[off:] -= corr2

def simulate(spec, record_every=20):
    N, glued, chains, panels = build(spec)
    ys0, _ = core_y(spec, R0)
    pos = np.stack([np.zeros(N), ys0], axis=1)
    free_mask = np.ones(N, bool); free_mask[glued] = False
    fi_ = np.where(free_mask)[0]
    if len(fi_):
        for run in np.split(fi_, np.where(np.diff(fi_) > 1)[0] + 1):
            pos[run, 0] += 0.18 * np.sin(np.pi * np.linspace(0, 1, len(run)))
    prev = pos.copy()
    locked, frames = [], []

    for step in range(STEPS):
        r = R0 + (R1 - R0) * min(step / 900, 1.0)
        ys, l_now = core_y(spec, r)
        vel = (pos - prev) * DAMP
        prev = pos.copy()
        pos = pos + vel
        pos[:, 1] += GRAV * DT * DT
        press_now = PRESS * (1.0 if step < 900 else max(0.0, 1.0 - (step - 900) / 200))
        pos[free_mask, 0] += press_now * DT * DT   # 外压随收缩结束衰减

        for _ in range(ITERS):
            pos[glued, 0] = 0.0; pos[glued, 1] = ys[glued]
            d = pos[1:] - pos[:-1]
            dist = np.linalg.norm(d, axis=1, keepdims=True)
            corr = 0.5 * (dist - SEG) / np.maximum(dist, 1e-9) * d
            pos[:-1] += corr; pos[1:] -= corr
            for off, k in ((4, BETA), (8, 0.65 * BETA), (16, 0.40 * BETA)):
                d2 = pos[off:] - pos[:-off]
                dist2 = np.linalg.norm(d2, axis=1, keepdims=True)
                corr2 = k * 0.5 * (dist2 - off * SEG) / np.maximum(dist2, 1e-9) * d2
                pos[:-off] += corr2; pos[off:] -= corr2
            lk = {(a, b) for (a, b, _) in locked}
            for (i, j, rb) in locked:
                dij = pos[j] - pos[i]; rr = max(np.linalg.norm(dij), 1e-9)
                corr = 0.5 * (rr - rb) / rr * dij
                pos[i] += corr; pos[j] -= corr
                xm = 0.5 * (pos[i, 0] + pos[j, 0])           # 梯挡垂直化 -> 矩形化
                pos[i, 0] += 0.35 * (xm - pos[i, 0])
                pos[j, 0] += 0.35 * (xm - pos[j, 0])
            # ---- 键生成刚度: 层直化 ----
            for ch in chains:
                lb = [t for t in ch if (t[0], t[1]) in lk]       # 已锁定, 按跨度降序
                if len(lb) >= 2:
                    straighten(pos, lb[0][0], lb[-1][0], K_STR)  # 上层通长直化
                if len(lb) >= 3:                                 # 台面找平(横撑板条)
                    a, b = lb[0][0], lb[-1][0]
                    top = pos[a:b+1]
                    top[:, 1] += 0.25 * (top[:, 1].mean() - top[:, 1])
                    run = [lb[0]]
                    for t in lb[1:]:                             # 下层按键长分段直化
                        if abs(t[2] - run[-1][2]) < 1e-9:
                            run.append(t)
                        else:
                            if len(run) >= 2:
                                straighten(pos, run[-1][1], run[0][1], K_STR)
                            run = [t]
                    if len(run) >= 2:
                        straighten(pos, run[-1][1], run[0][1], K_STR)
            for (a, b) in panels:                        # 面板: 直化 + 端面找直
                straighten(pos, a, b, K_STR)
                seg_p = pos[a:b+1]
                seg_p[:, 0] += 0.3 * (seg_p[:, 0].mean() - seg_p[:, 0])
            late = step > 950                                # 收缩完成后拉链纪律解除
            for ch in chains:
                first_unlocked = True
                for (i, j, rb) in ch:                            # 吸引全员, 锁定按拉链
                    if (i, j) in lk: continue
                    dij = pos[j] - pos[i]; rr = np.linalg.norm(dij)
                    if (first_unlocked or late) and rr < rb + D_LOCK:
                        locked.append((i, j, rb)); lk.add((i, j))
                    elif rb < rr < D_ACT:                        # 吸引只在键距>键长时作用
                        pos[i] += K_ATT * dij; pos[j] -= K_ATT * dij
                    first_unlocked = False
            pos[glued, 0] = 0.0; pos[glued, 1] = ys[glued]

        if step % record_every == 0 or step == STEPS - 1:
            frames.append((r, l_now, pos.copy(), list(locked)))
    return frames, [b for ch in chains for b in ch]

results = {name: simulate(spec) for name, spec in UNITS.items()}

INK, GREEN, PALE, BOND, GHOST, CORE = "#2c2c2a", "#0F6E56", "#e3e0d6", "#D85A30", "#c9c7bd", "#8a887f"

def render_smooth(p, w=3, passes=1):
    """渲染用平滑: 沿链移动平均, 不改物理数据"""
    q = p.copy()
    k = np.ones(w) / w
    for _ in range(passes):
        for c in (0, 1):
            pad = np.pad(q[:, c], (w//2, w//2), mode="edge")
            q[:, c] = np.convolve(pad, k, mode="valid")
    return q
def draw(ax, name, frames, bonds, fi=-1, ghosts=True):
    if ghosts:
        for gi in (len(frames)//3, 2*len(frames)//3):
            _, _, p, _ = frames[gi]
            p = render_smooth(p)
            ax.plot(p[:,0], p[:,1], color=GHOST, lw=0.9, alpha=0.5, zorder=1)
    r, l_now, p, locked = frames[fi]
    p = render_smooth(p)
    ax.plot([0,0],[0,-l_now], color=CORE, lw=2.2, zorder=2)
    for (i,j,rb) in locked:
        ax.plot(p[[i,j],0], p[[i,j],1], color=BOND, lw=1.2, alpha=0.85, zorder=3)
    N = len(p)
    for s0 in range(0, N - 1, STRIPE):
        s1 = min(s0 + STRIPE, N - 1)
        col = GREEN if (s0 // STRIPE) % 2 == 0 else PALE
        ax.plot(p[s0:s1+1,0], p[s0:s1+1,1], color=col, lw=3.8, solid_capstyle="butt", zorder=4)
    ax.plot([-0.55,1.15],[0,0], color=INK, lw=3)
    ax.set_xlim(-0.6,1.2); ax.set_ylim(-3.4,0.22)
    ax.set_aspect("equal"); ax.axis("off"); ax.set_title(name, fontsize=12)

fig, axes = plt.subplots(1, 4, figsize=(15.5, 6), sharey=True)
for ax, (name, (frames, bonds)) in zip(axes, results.items()):
    draw(ax, name, frames, bonds)
fig.suptitle("形态目录: 软皮 · 刚度由成键生成 · 四个键谱, 同一收缩协议\n"
             "soft skin, bond-generated rigidity: four bond maps under one contraction protocol",
             fontsize=12.5)
fig.tight_layout()
fig.savefig("/mnt/user-data/outputs/morphology_catalog_final.png", dpi=170, bbox_inches="tight")
print("final catalog saved")

from PIL import Image
imgs = []
n_frames = min(len(f) for f, _ in results.values())
ema = {name: None for name in results}          # 帧间指数平滑
for fi in range(n_frames):
    fig, axes = plt.subplots(1, 4, figsize=(13.5, 5))
    for ax, (name, (frames, bonds)) in zip(axes, results.items()):
        fr = frames[min(fi, len(frames)-1)]
        ema[name] = fr[2].copy() if ema[name] is None else 0.55 * fr[2] + 0.45 * ema[name]
        fr_s = (fr[0], fr[1], ema[name], fr[3])
        draw(ax, name, [fr_s], bonds, fi=0, ghosts=False)
        ax.set_title(name.split(" · ")[0], fontsize=11)
    fig.suptitle("自由段芯距压缩比 r = %.2f" % frames[min(fi, len(frames)-1)][0], fontsize=12)
    fig.tight_layout(); fig.canvas.draw()
    imgs.append(Image.fromarray(np.asarray(fig.canvas.buffer_rgba())[:,:,:3]))
    plt.close(fig)
imgs[0].save("/mnt/user-data/outputs/morphology_catalog_final.gif", save_all=True,
             append_images=imgs[1:], duration=75, loop=0)
print("final gif saved")
