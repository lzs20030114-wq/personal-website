# -*- coding: utf-8 -*-
"""
项目二 · 收缩张紧外皮单元 —— TS 移植对照基准生成器。

物理部分（build / core_y / straighten / simulate 的逐步逻辑、全部常量与 UNITS）
**逐字取自 项目二参考/skin_sim_v7_final.py**，一处未改；本脚本只加了检查点记录
（记录不参与物理）。输出 src/lib/space/skin-ref.json，供 skin-unit.test.ts 对照：
选定 step 处的全部节点位置（9 位小数）+ 锁定键的完整追加序列。

复现: pip install numpy && python3 scripts/skin-ref/dump_skin_ref.py
"""
import json
import os

import numpy as np

SEG   = 0.02
BETA  = 0.80                 # v6 验证过的成形刚度
GRAV  = -1.8
PRESS = 3.0
DT, DAMP, ITERS, STEPS = 0.004, 0.90, 55, 1500
R0, R1 = 0.95, 0.30
D_ACT, D_LOCK, K_ATT = 1.20, 0.14, 0.10
K_STR = 1.0                  # 层直化强度(键生成刚度)

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

CHECKPOINTS = [0, 100, 300, 600, 900, 1000, 1200, 1499]


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


def simulate(spec):
    N, glued, chains, panels = build(spec)
    ys0, _ = core_y(spec, R0)
    pos = np.stack([np.zeros(N), ys0], axis=1)
    free_mask = np.ones(N, bool); free_mask[glued] = False
    fi_ = np.where(free_mask)[0]
    if len(fi_):
        for run in np.split(fi_, np.where(np.diff(fi_) > 1)[0] + 1):
            pos[run, 0] += 0.18 * np.sin(np.pi * np.linspace(0, 1, len(run)))
    prev = pos.copy()
    locked, checkpoints = [], []

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

        if step in CHECKPOINTS:
            checkpoints.append({
                "step": step,
                "r": round(r, 12),
                "len": round(l_now, 12),
                "pos": [[round(float(x), 9), round(float(y), 9)] for x, y in pos],
                "lockedCount": len(locked),
            })
    return {
        "n": N,
        "glued": glued,
        "chains": [[[i, j, rb] for (i, j, rb) in ch] for ch in chains],
        "panels": [[a, b] for (a, b) in panels],
        "checkpoints": checkpoints,
        "lockedSeq": [[i, j, rb] for (i, j, rb) in locked],
    }


def main():
    out = {
        "source": "项目二参考/skin_sim_v7_final.py (v7, 物理逐字)",
        "checkpoints": CHECKPOINTS,
        "units": {name: simulate(spec) for name, spec in UNITS.items()},
    }
    here = os.path.dirname(os.path.abspath(__file__))
    dst = os.path.normpath(os.path.join(here, "..", "..", "src", "lib", "space", "skin-ref.json"))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("written", dst, os.path.getsize(dst), "bytes")


if __name__ == "__main__":
    main()
