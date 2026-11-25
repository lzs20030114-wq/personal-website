"""等值线（marching squares）：一张浮点图 → 按顺序连好的折线。不依赖 skimage / matplotlib。

第五轮（2026-11-25）给单元描边用：面画完以后，沿单元在画面上实际占的那块区域描一圈，
一个单元一条连续的线（以前是从三维网格的边上取，二十条带子各自的轮廓边叠在一起，又粗又毛）。
坐标：x = 列、y = 行，都是图里的像素坐标（格点 = 像素中心）。
"""
import numpy as np

# 每种情况连哪两条边：0 上（a→b）、1 右（b→c）、2 下（d→c）、3 左（a→d）
# 角：a 左上、b 右上、c 右下、d 左下；情况号 = a·8 + b·4 + c·2 + d·1（大于等值的为 1）
_TABLE = {
    1: [(3, 2)], 2: [(2, 1)], 3: [(3, 1)], 4: [(0, 1)], 6: [(0, 2)], 7: [(3, 0)],
    8: [(3, 0)], 9: [(0, 2)], 11: [(0, 1)], 12: [(3, 1)], 13: [(2, 1)], 14: [(3, 2)],
}


def _edge_pts(f, level, ys, xs, edge):
    a = f[ys, xs]; b = f[ys, xs + 1]; c = f[ys + 1, xs + 1]; d = f[ys + 1, xs]

    def t(p, q):
        den = q - p
        return np.where(np.abs(den) > 1e-12, (level - p) / np.where(np.abs(den) > 1e-12, den, 1.0), 0.5)
    if edge == 0:
        return xs + t(a, b), ys.astype(float)
    if edge == 1:
        return (xs + 1).astype(float), ys + t(b, c)
    if edge == 2:
        return xs + t(d, c), (ys + 1).astype(float)
    return xs.astype(float), ys + t(a, d)


def segments(f, level=0.5):
    """所有小线段 (N, 4)：x0, y0, x1, y1"""
    f = np.asarray(f, np.float64)
    hi = f > level
    code = (hi[:-1, :-1] * 8 + hi[:-1, 1:] * 4 + hi[1:, 1:] * 2 + hi[1:, :-1] * 1).astype(np.int8)
    out = []
    for k, pairs in _TABLE.items():
        ys, xs = np.nonzero(code == k)
        if not len(ys):
            continue
        for e0, e1 in pairs:
            x0, y0 = _edge_pts(f, level, ys, xs, e0)
            x1, y1 = _edge_pts(f, level, ys, xs, e1)
            out.append(np.c_[x0, y0, x1, y1])
    # 两个对角的情况（5、10）：看格子中心定连法
    for k in (5, 10):
        ys, xs = np.nonzero(code == k)
        if not len(ys):
            continue
        cen = (f[ys, xs] + f[ys, xs + 1] + f[ys + 1, xs + 1] + f[ys + 1, xs]) / 4 > level
        for sel, pairs in ((cen, [(3, 0), (2, 1)] if k == 5 else [(0, 1), (3, 2)]),
                           (~cen, [(0, 1), (3, 2)] if k == 5 else [(3, 0), (2, 1)])):
            if not sel.any():
                continue
            for e0, e1 in pairs:
                x0, y0 = _edge_pts(f, level, ys[sel], xs[sel], e0)
                x1, y1 = _edge_pts(f, level, ys[sel], xs[sel], e1)
                out.append(np.c_[x0, y0, x1, y1])
    return np.vstack(out) if out else np.zeros((0, 4))


def polylines(f, level=0.5, step=1):
    """连好的折线：[(n, 2) 数组 …]。相邻格子在同一条格边上算出的点逐位相同，按端点接起来。
    step > 1 时每隔几个点取一个（首尾保留）"""
    seg = segments(f, level)
    if not len(seg):
        return []
    key = lambda x, y: (round(x * 4096), round(y * 4096))
    ends = {}
    for i, (x0, y0, x1, y1) in enumerate(seg):
        ends.setdefault(key(x0, y0), []).append((i, 0))
        ends.setdefault(key(x1, y1), []).append((i, 1))
    used = np.zeros(len(seg), bool)
    out = []
    for s in range(len(seg)):
        if used[s]:
            continue
        used[s] = True
        pts = [seg[s, :2], seg[s, 2:]]
        # 往后接
        for direction in (1, -1):
            while True:
                tail = pts[-1] if direction == 1 else pts[0]
                nxt = None
                for i, end in ends.get(key(*tail), []):
                    if not used[i]:
                        nxt = (i, end)
                        break
                if nxt is None:
                    break
                i, end = nxt
                used[i] = True
                p = seg[i, 2:] if end == 0 else seg[i, :2]
                if direction == 1:
                    pts.append(p)
                else:
                    pts.insert(0, p)
        a = np.array(pts)
        if step > 1 and len(a) > 2 * step:
            closed = np.allclose(a[0], a[-1])
            a = np.vstack([a[:-1:step], a[-1:]]) if not closed else np.vstack([a[:-1:step], a[:1]])
        out.append(a)
    return out
