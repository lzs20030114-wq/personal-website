import { beforeAll, describe, expect, it } from 'vitest';
import {
  PEAK_REACH,
  RING_GRID_FIT,
  ringGridViewFit,
  ringGridScene,
  RIG_SCALE,
  RIG_Y,
  RIG_HANG,
  RIG_ANCHOR_Y,
  roomBoxes,
  roomSpan,
  FIGURE,
  MM_PER_UNIT,
  ROOM,
  figureSpot,
  RING_GAP_RATIO,
  RING_GRID,
  RING_GRID_COUNT,
  RING_GRID_DEFAULT_FORM,
  ringCellGap,
  ringCellPitch,
  ringGridCamScale,
  ringGridCells,
  ringGridPlans,
  ringGridSpan,
  ringOuter,
} from './skin-grid';
import { figureBox } from './figure';
import { RING, buildRingUnits, ringGap } from './skin-ring';
import { SKIN, createSkinUnit } from './skin-unit';

/**
 * 守门：Lab.10 4×4 环阵列（用户 2026-08-25 纠偏成「十六个环」，并拍板
 * 格距跟着半径滑块走 / 每个环各自独立 / 编制两档）。卡的就是这几条规则本身：
 * ① 格距真的按**全程**膨胀峰值算（只看终态会偏小）；
 * ② 环与环之间的空地明显大于环内带间缝——「每个环都独立」的硬约束，且全量程成立；
 * ③ 格距与取景确实随半径动；④ 站位与编制对得上；⑤ 环本身与 Lab.09 是同一份。
 */
const RADII = [RING.RADIUS_MIN, RING.RADIUS_DEF, 50, 70, RING.RADIUS_MAX];

let PEAKS: { key: string; peak: number; peakAt: number; final: number }[] = [];
beforeAll(() => {
  PEAKS = buildRingUnits().map((d) => {
    const s = createSkinUnit(d.spec, d.opts);
    let peak = 0;
    let peakAt = 0;
    for (let k = 0; k < SKIN.STEPS; k++) {
      s.advance();
      let m = 0;
      for (let i = 0; i < s.n; i++) m = Math.max(m, s.px[i]);
      if (m * 100 > peak) {
        peak = m * 100;
        peakAt = k;
      }
    }
    let final = 0;
    for (let i = 0; i < s.n; i++) final = Math.max(final, s.px[i]);
    return { key: d.key, peak, peakAt, final: final * 100 };
  });
}, 120_000);

describe('skin-grid 4×4 环阵列', () => {
  it('外缘按**全程**膨胀峰值定——只看终态会偏小（阶梯方箱中途鼓得比终态大）', () => {
    const worst = Math.max(...PEAKS.map((p) => p.peak));
    expect(worst).toBeCloseTo(PEAK_REACH, 0); // 常量没跟实测漂开
    // 常量必须是**全程**的上界，不是终态值：四种形态逐个卡
    for (const p of PEAKS) expect(PEAK_REACH, p.key).toBeGreaterThanOrEqual(p.peak);
    // 「必须按全程量」的由来：阶梯方箱的峰值出现在收缩途中而不是终点。
    // 2026-08-25 折叠加深后这个过冲已经很小（0.5px，早先是 3px），但方向没变
    const box = PEAKS.find((p) => p.key === 'stepped')!;
    expect(box.peak).toBeGreaterThanOrEqual(box.final);
    // 外缘 = 芯上半径 + 峰值：四种形态全程都不越出去
    for (const p of PEAKS) expect(ringOuter(30) - 30, p.key).toBeGreaterThanOrEqual(p.peak);
  });

  it('每个环各自独立：环间空地明显大于环内平台外缘的带间缝，且全量程成立', () => {
    for (const r of RADII) {
      const inner = ringGap(ringOuter(r)); // 环内相邻两带在平台外缘的净缝
      const between = ringCellGap(r);
      expect(inner, `R=${r}`).toBeGreaterThan(0); // 环自己先不能互穿
      expect(between, `R=${r}`).toBeGreaterThan(inner); // 读作两个环之间的空地，不是环内的又一道缝
      expect(between / inner).toBeCloseTo(RING_GAP_RATIO, 6);
      // 格距 = 两个环的外缘 + 那道缝：邻居全程不互穿
      expect(ringCellPitch(r) - 2 * ringOuter(r)).toBeCloseTo(between, 6);
    }
  });

  it('格距与取景跟着半径滑块走（用户 2026-08-25 拍板）', () => {
    const pitches = RADII.map(ringCellPitch);
    const scales = RADII.map((r) => ringGridCamScale(r));
    for (let i = 1; i < RADII.length; i++) {
      expect(pitches[i], `R=${RADII[i]}`).toBeGreaterThan(pitches[i - 1]); // 半径大 → 格距大
      expect(scales[i], `R=${RADII[i]}`).toBeLessThan(scales[i - 1]); // 阵列变大 → 相机退
    }
    // 装置缩到 0.5 后房间的长宽比随半径变（占宽减半、房高不变）⇒「屏上占比恒定」
    // 这条不再成立，取而代之的是上一条「每档余量恒定」。这里只卡取景确实随半径动。
    expect(ringGridCamScale(RING.RADIUS_MAX)).toBeLessThan(ringGridCamScale(RING.RADIUS_MIN));
  });

  it('取景：四个视角逐半径各自算，全量程都不裁边、余量恒定', () => {
    const views = ['axon', 'front', 'side', 'top'] as const;
    for (const r of RADII)
      for (const v of views) {
        const used = ringGridCamScale(r, v);
        const fit = ringGridViewFit(r, v);
        expect(used, `${v} R=${r} 裁边`).toBeLessThanOrEqual(fit);
        // 每档都贴着自己的极限留同一份余量：既不裁边，也不白留一大片空地
        expect(used / fit, `${v} R=${r} 余量漂了`).toBeCloseTo(RING_GRID_FIT, 9);
      }
    expect(RING_GRID_FIT).toBeGreaterThan(0.85);
    expect(RING_GRID_FIT).toBeLessThan(1);
    // 顶视看的是整片地面（span 见方投进 520 高的画框），是四档里最苛刻的那个
    for (const r of RADII) expect(ringGridViewFit(r, 'top')).toBeLessThan(ringGridViewFit(r, 'axon'));
    // 未知视角退回轴测，不炸
    expect(ringGridCamScale(RING.RADIUS_DEF, 'nope')).toBe(ringGridCamScale(RING.RADIUS_DEF, 'axon'));
  });

  it('十六格：以原点居中、行列间距 = 格距', () => {
    for (const r of [RING.RADIUS_DEF, RING.RADIUS_MAX]) {
      const cells = ringGridCells(r, 'uniform');
      expect(cells.length).toBe(RING_GRID_COUNT);
      expect(RING_GRID_COUNT).toBe(RING_GRID.COLS * RING_GRID.ROWS);
      const pitch = ringCellPitch(r) * RIG_SCALE; // cells 是世界单位，ringCellPitch 是装置单位
      // 居中：两个方向的重心都在原点（枢轴才不用随半径动）
      expect(cells.reduce((a, c) => a + c.x, 0) / cells.length).toBeCloseTo(0, 9);
      expect(cells.reduce((a, c) => a + c.z, 0) / cells.length).toBeCloseTo(0, 9);
      // 行优先编号：同一行内列走 X、跨行走 Z
      for (let row = 0; row < RING_GRID.ROWS; row++)
        for (let col = 1; col < RING_GRID.COLS; col++) {
          const a = cells[row * RING_GRID.COLS + col - 1];
          const b = cells[row * RING_GRID.COLS + col];
          expect(b.x - a.x).toBeCloseTo(pitch, 6);
          expect(b.z).toBeCloseTo(a.z, 9);
        }
      for (let row = 1; row < RING_GRID.ROWS; row++)
        expect(cells[row * RING_GRID.COLS].z - cells[(row - 1) * RING_GRID.COLS].z).toBeCloseTo(pitch, 6);
      // 占宽 = 首末格中心距 + 两端各半个环
      const xs = cells.map((c) => c.x);
      expect(Math.max(...xs) - Math.min(...xs) + 2 * ringOuter(r) * RIG_SCALE).toBeCloseTo(ringGridSpan(r), 6);
    }
  });

  it('编制：整片同形全场一条引擎；每行一种 = 行号，每种四格；环内不混形态', () => {
    const uni = ringGridPlans('uniform');
    expect(uni.length).toBe(1);
    expect(uni[0].length).toBe(RING.COUNT);
    expect(new Set(uni[0]).size).toBe(1); // 一圈一种形状才连得成平台（2026-08-23 拍板）
    const rows = ringGridPlans('perRow');
    expect(rows.length).toBe(RING_GRID.ROWS);
    rows.forEach((p, v) => {
      expect(p.length).toBe(RING.COUNT);
      expect(new Set(p)).toEqual(new Set([v])); // 每份编制里只有一条引擎
    });
    // 格子指向的编制：整片同形全指第 0 份；每行一种按行号，每行四格
    const flat = ringGridCells(RING.RADIUS_DEF, 'uniform');
    expect(new Set(flat.map((c) => c.plan))).toEqual(new Set([0]));
    const byRow = ringGridCells(RING.RADIUS_DEF, 'perRow');
    for (let row = 0; row < RING_GRID.ROWS; row++) {
      const inRow = byRow.filter((c) => c.plan === row);
      expect(inRow.length).toBe(RING_GRID.COLS);
      for (const c of inRow) expect(c.z).toBeCloseTo(byRow[row * RING_GRID.COLS].z, 9);
    }
  });

  it('布景的尺度自洽：草图那三条比例 ⇒ 房高 / 人 / 离地', () => {
    // 全站此前无尺度；这三条是由用户手绘草图的比例反推出来的，改一条别的要跟着改
    expect(MM_PER_UNIT * FIGURE.HEIGHT).toBeCloseTo(1700, 6); // 人 = 1.70 m
    const hang = 336; // 吊件总长（收缩全程包络）——房高就是按它 / 0.71 定的
    expect(ROOM.FLOOR_Y / hang).toBeCloseTo(1 / 0.71, 1);
    expect(FIGURE.HEIGHT / ROOM.FLOOR_Y).toBeCloseTo(0.455, 1);
    expect(ROOM.FLOOR_Y - hang).toBe(137); // 吊件下缘离地 ≈ 1.08 m
    // 取景包围盒的下界就是地板底面：地板落在画外的话「站在地上」就读不出来
    expect(ROOM.FLOOR_Y + ROOM.FLOOR_T).toBeGreaterThanOrEqual(ROOM.FLOOR_Y);
  });

  it('位置关系：人站在地上、在房间内、且不与任何一个环相撞', () => {
    for (const r of RADII) {
      const spec = figureSpot(r);
      const b = figureBox(spec);
      expect(b.y1, `R=${r} 脚没落地`).toBeCloseTo(ROOM.FLOOR_Y, 6);
      expect(b.y0, `R=${r} 顶到天花`).toBeGreaterThan(0);
      // 在房间内（墙内面 = ±roomSpan/2）
      const wall = roomSpan(r) / 2;
      for (const v of [b.x0, b.x1, b.z0, b.z1]) expect(Math.abs(v), `R=${r} 出墙`).toBeLessThan(wall);
      // 与十六个环的水平净距 > 0。这条是硬的不是构图偏好：人的头顶（y≈258）比带子的
      // 下缘（y=336）还高，平面上一旦与环重叠，头就插进平台里了
      const reach = Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2;
      expect(b.y0, `R=${r} 头顶反而低于带子下缘了，这条约束的前提变了`).toBeLessThan(336);
      for (const c of ringGridCells(r, 'uniform')) {
        const d = Math.hypot(spec.x - c.x, spec.z - c.z);
        expect(d - ringOuter(r) * RIG_SCALE - reach, `R=${r} 与环相撞`).toBeGreaterThan(0);
      }
      // 正视图里人落在最外一列之外（草图画的就是这个位置关系）
      expect(spec.x, `R=${r} 人没在阵列外侧`).toBeGreaterThan(ringGridSpan(r) / 2);
    }
  });

  it('装置缩到 0.5 且下缘不动（用户 2026-08-25 拍板）', () => {
    expect(RIG_SCALE).toBe(0.5);
    // 缩完整体下移，使下缘停在 RIG_ANCHOR_Y —— 只缩不移的话整片会升到人头以上。
    // 这条也把「带子放长/放大时下缘不动」钉住了：变的是顶端离天花多远，不是下缘离地多高
    expect(RIG_HANG * RIG_SCALE + RIG_Y).toBeCloseTo(RIG_ANCHOR_Y, 9);
    // 下缘离地仍是 1.08 m；顶端退到半空，那一截由芯轨（房间的立杆）补上
    expect((ROOM.FLOOR_Y - RIG_ANCHOR_Y) * MM_PER_UNIT).toBeCloseTo(1083, 0);
    expect(RIG_Y).toBeGreaterThan(0); // 顶端确实离开了天花
    // 世界尺寸确实是装置尺寸的一半
    for (const r of RADII) {
      expect(ringGridSpan(r)).toBeCloseTo(
        ((RING_GRID.COLS - 1) * ringCellPitch(r) + 2 * ringOuter(r)) * RIG_SCALE, 6);
      const cells = ringGridCells(r, 'uniform');
      expect(cells[1].x - cells[0].x).toBeCloseTo(ringCellPitch(r) * RIG_SCALE, 6);
    }
    // 平台 ⌀1.04 m、场地 4.74 m 见方（2026-08-25 第二轮加深折叠后；
    // 三轮的账：⌀0.65 → 0.82（放大构造）→ 1.04（贴合段匀给自由段））
    expect(2 * ringOuter(RING.RADIUS_DEF) * RIG_SCALE * MM_PER_UNIT / 1000).toBeCloseTo(1.04, 2);
    expect(ringGridSpan(RING.RADIUS_DEF) * MM_PER_UNIT / 1000).toBeCloseTo(4.74, 1);
  });

  it('房间：地板 + 两面墙，墙内面到最外环外缘 = 留距', () => {
    for (const r of [RING.RADIUS_DEF, RING.RADIUS_MAX]) {
      expect(roomSpan(r) - ringGridSpan(r)).toBeCloseTo(2 * ROOM.MARGIN, 6);
      const boxes = roomBoxes(r);
      expect(boxes.length).toBe(3);
      const [floor, wx, wz] = boxes;
      // 地板铺满房间、顶面就是地面高度
      expect(floor.cy - floor.hy).toBeCloseTo(ROOM.FLOOR_Y, 6);
      expect(floor.hx * 2).toBeGreaterThanOrEqual(roomSpan(r));
      // 两面墙在 −X / −Z（相机在 +X/+Z 上方 ⇒ 远端，露内表面、不挡装置）
      expect(wx.cx).toBeLessThan(0);
      expect(wz.cz).toBeLessThan(0);
      // 墙顶收在天花平面 y=0：那条顶边就是草图里的天花线
      for (const w of [wx, wz]) expect(w.cy - w.hy).toBeCloseTo(0, 6);
      for (const w of [wx, wz]) expect(w.cy + w.hy).toBeCloseTo(ROOM.FLOOR_Y, 6);
      // **不做天花板面**：做了会横在相机与装置之间，整幅盖死
      expect(boxes.some((b) => b.cy + b.hy <= 0 && b.hx > 50)).toBe(false);
    }
  });

  it('布景件：房间三件 + 人一件，随半径重建', () => {
    const a = ringGridScene(RING.RADIUS_DEF);
    expect(a.length).toBe(4);
    expect(a.filter((m) => m.kind === 'room').length).toBe(3);
    expect(a.filter((m) => m.kind === 'figure').length).toBe(1);
    for (const m of a) {
      expect(m.verts.length % 3).toBe(0);
      expect(m.idx.length % 3).toBe(0);
      for (const i of m.idx) expect(i).toBeLessThan(m.verts.length / 3);
    }
    // 半径变了房间跟着变（格距变了墙不动的话阵列会撞穿墙）
    const wide = roomBoxes(RING.RADIUS_MAX)[1];
    const near = roomBoxes(RING.RADIUS_DEF)[1];
    expect(Math.abs(wide.cx)).toBeGreaterThan(Math.abs(near.cx));
  });

  it('环本身与 Lab.09 逐字同源——阵列只是把它复制到十六处', () => {
    const forms = buildRingUnits();
    expect(forms.length).toBe(4);
    expect(RING_GRID_DEFAULT_FORM).toBeLessThan(forms.length);
    // 编制长度 = 环上单元数：阵列没有偷偷改环的疏密
    for (const p of [...ringGridPlans('uniform'), ...ringGridPlans('perRow')])
      expect(p.length).toBe(RING.COUNT);
    // 每份编制指到的引擎都在 forms 范围内（每行一种用满四条）
    expect(new Set(ringGridPlans('perRow').map((p) => p[0]))).toEqual(new Set([0, 1, 2, 3]));
  });
});
