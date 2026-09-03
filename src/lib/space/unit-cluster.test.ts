import { beforeAll, describe, expect, it } from 'vitest';
import {
  CLUSTER_DEFAULT_FORM,
  CLUSTER_LEAD,
  CLUSTER_PLANS,
  CLUSTER_RELATIONS,
  CLUSTER_TIMINGS,
  LEVEL_RANGE_PX,
  OVERLAP_CLEAR,
  STAGGER_STEPS,
  UNIT_FORMS,
  clusterBridges,
  clusterBuild,
  clusterCamScale,
  clusterCells,
  clusterFieldSpan,
  clusterForms,
  clusterLeads,
  clusterLevelCount,
  clusterLevelStep,
  clusterLevels,
  clusterMetrics,
  clusterPitch,
  clusterPlans,
  clusterPositions,
  clusterScene,
  clusterUnits,
  clusterWaves,
  overlapFeasible,
  overlapMargin,
} from './unit-cluster';
import { RING, RING_LEAD, RING_TAIL, buildRingUnits } from './skin-ring';
import {
  MM_PER_UNIT,
  RIG_SCALE,
  ROOM,
  figureSpotBySpan,
  ringCellPitch,
  ringGridScene,
  viewFitBySpan,
} from './skin-grid';
import { SKIN, createSkinUnit } from './skin-unit';
import { SOLID } from './skin-solid';

/**
 * 守门：Lab.13 单元关系（用户 2026-09-03 立项「几个单元之间可形成的关系」）。
 * 卡的是这几条规则本身：
 * ① 单元的实测量表（挑出/峰值/嘴心/折叠体跨度）与引擎逐一对得上——间距与交叠可行性都建在它上面；
 * ② 齐平的单元 = Lab.10 / Lab.12 那个环逐位相同（关系研究不悄悄换单元）；
 * ③ 距离四态是量出来的：分离 = Lab.12 格距、相切 = 平台边贴边、交叠 = 真的盖过去且不顶到邻居芯带；
 * ④ 交叠必须错层、且高差装得下折叠体的**全程**竖向跨度——装不下的组合要被判出来（变灰），不能放行；
 * ⑤ 站位 / 编制表 / 房间 / 小人 / 取景对得上。
 */
const R = RING.RADIUS_DEF;
const PLANS = CLUSTER_PLANS.map((p) => p.key);
const RELS = CLUSTER_RELATIONS.map((r) => r.key);
const FORMS = buildRingUnits();

let measured: { reach: number; peak: number; mouth: number; body: number; bodyPeak: number }[] = [];
beforeAll(() => {
  measured = FORMS.map((d) => {
    const s = createSkinUnit(d.spec, d.opts);
    const bonds = d.spec[1][2]!;
    let w = bonds[0];
    for (const b of bonds) if (b[1] - b[0] > w[1] - w[0]) w = b;
    const off = d.spec[0][1];
    let peak = 0;
    let bodyPeak = 0;
    for (let k = 0; k < SKIN.STEPS; k++) {
      s.advance();
      const foot = s.py[s.n - 1];
      let m = 0;
      let yLo = Infinity;
      let yHi = -Infinity;
      for (let i = 0; i < s.n; i++) {
        const x = s.px[i] * SOLID.SCALE;
        m = Math.max(m, x);
        if (x > 8) {
          const y = (s.py[i] - foot) * SOLID.SCALE;
          yLo = Math.min(yLo, y);
          yHi = Math.max(yHi, y);
        }
      }
      peak = Math.max(peak, m);
      if (yHi > -Infinity) bodyPeak = Math.max(bodyPeak, yHi - yLo);
    }
    const foot = s.py[s.n - 1];
    let reach = 0;
    let yLo = Infinity;
    let yHi = -Infinity;
    for (let i = 0; i < s.n; i++) {
      const x = s.px[i] * SOLID.SCALE;
      reach = Math.max(reach, x);
      if (x > 8) {
        const y = (s.py[i] - foot) * SOLID.SCALE;
        yLo = Math.min(yLo, y);
        yHi = Math.max(yHi, y);
      }
    }
    return {
      reach,
      peak,
      mouth: ((s.py[off + w[0]] + s.py[off + w[1]]) / 2 - foot) * SOLID.SCALE,
      body: yHi - yLo,
      bodyPeak,
    };
  });
}, 120_000);

describe('unit-cluster 单元关系', () => {
  it('单元的实测量表与引擎对得上（挑出 / 全程峰值 / 嘴心 / 折叠体跨度）', () => {
    expect(UNIT_FORMS.map((f) => f.key)).toEqual(FORMS.map((d) => d.key));
    UNIT_FORMS.forEach((f, i) => {
      const m = measured[i];
      expect(Math.abs(f.reach - m.reach), `${f.key} reach`).toBeLessThan(0.6);
      expect(Math.abs(f.peakReach - m.peak), `${f.key} peak`).toBeLessThan(0.6);
      expect(Math.abs(f.mouth - m.mouth), `${f.key} mouth`).toBeLessThan(0.6);
      expect(Math.abs(f.body - m.body), `${f.key} body`).toBeLessThan(0.6);
      expect(Math.abs(f.bodyPeak - m.bodyPeak), `${f.key} bodyPeak`).toBeLessThan(1.0);
      // 表里的峰值是上界：不许比实测小（间距按它算，偏小就会在成形期撞上）
      expect(f.peakReach + 0.6).toBeGreaterThanOrEqual(m.peak);
      expect(f.bodyPeak + 1.0).toBeGreaterThanOrEqual(m.bodyPeak);
    });
  });

  it('齐平的单元就是 Lab.10 / Lab.12 那个环（键谱逐位相同，只有一级、一条引擎）', () => {
    expect(clusterForms().map((d) => d.key)).toEqual(FORMS.map((d) => d.key));
    for (const plan of PLANS) {
      const units = clusterUnits(plan, 'apart', FORMS[CLUSTER_DEFAULT_FORM]);
      expect(units.length).toBe(1);
      expect(units[0].spec).toEqual(FORMS[CLUSTER_DEFAULT_FORM].spec);
      expect(clusterPlans(1)).toEqual([new Array(RING.COUNT).fill(0)]);
    }
    expect(clusterLeads(1)).toEqual([RING_LEAD]);
    expect(CLUSTER_LEAD.LOW).toBe(RING_LEAD);
  });

  it('站位：单元数对、簇心在原点、相邻距离恒为 1', () => {
    for (const p of CLUSTER_PLANS) {
      const pos = clusterPositions(p.key);
      expect(pos.length).toBe(p.n);
      const cx = pos.reduce((s, q) => s + q.x, 0) / pos.length;
      const cz = pos.reduce((s, q) => s + q.z, 0) / pos.length;
      expect(Math.abs(cx)).toBeLessThan(1e-9);
      expect(Math.abs(cz)).toBeLessThan(1e-9);
      let dmin = Infinity;
      for (let i = 0; i < pos.length; i++)
        for (let j = i + 1; j < pos.length; j++)
          dmin = Math.min(dmin, Math.hypot(pos[i].x - pos[j].x, pos[i].z - pos[j].z));
      expect(dmin).toBeCloseTo(1, 9);
    }
    expect(CLUSTER_PLANS.map((p) => p.n)).toEqual([2, 3, 4, 9]);
  });

  it('高度级：齐平全 0；错层一对 2 / 三角 3 / 方阵对角 2 / 九宫 3（角 0 边 1 心 2）；交叠是棋盘，相邻永不同级', () => {
    for (const plan of PLANS) {
      expect(clusterLevels(plan, 'apart').every((l) => l === 0)).toBe(true);
      expect(clusterLevels(plan, 'touch').every((l) => l === 0)).toBe(true);
      expect(clusterLevels(plan, 'apartStep')).toEqual(clusterLevels(plan, 'touchStep'));
    }
    expect(clusterLevelCount('pair', 'touchStep')).toBe(2);
    expect(clusterLevelCount('triad', 'touchStep')).toBe(3);
    // 方阵：四级顺着绕（每级 0.11 m）在真机读不出「级」，用户 2026-09-03 拍板改对角两级（0.35 m）
    expect(clusterLevels('quad', 'touchStep')).toEqual([0, 1, 0, 1]);
    expect(clusterLevelCount('quad', 'touchStep')).toBe(2);
    expect(clusterLevels('nine', 'touchStep')).toEqual([0, 1, 0, 1, 2, 1, 0, 1, 0]);
    for (const plan of PLANS) {
      const pos = clusterPositions(plan);
      const lv = clusterLevels(plan, 'overlap');
      for (let i = 0; i < pos.length; i++)
        for (let j = i + 1; j < pos.length; j++) {
          const d = Math.hypot(pos[i].x - pos[j].x, pos[i].z - pos[j].z);
          if (Math.abs(d - 1) < 1e-9) expect(lv[i], `${plan} ${i}-${j}`).not.toBe(lv[j]);
        }
    }
    expect(clusterLevelCount('pair', 'overlap')).toBe(2);
    expect(clusterLevelCount('quad', 'overlap')).toBe(2);
    expect(clusterLevelCount('nine', 'overlap')).toBe(2);
    expect(clusterLevelCount('triad', 'overlap')).toBe(3); // 三角不是二分图
  });

  it('每级的 lead 在起伏编制验过的量程里、lead + tail 恒定 ⇒ 形状只平移、筒的上下缘不动', () => {
    for (const L of [1, 2, 3, 4]) {
      const leads = clusterLeads(L);
      expect(leads[0]).toBe(CLUSTER_LEAD.LOW);
      if (L > 1) expect(leads[L - 1]).toBe(CLUSTER_LEAD.HIGH);
      for (const l of leads) {
        expect(l).toBeGreaterThanOrEqual(CLUSTER_LEAD.HIGH);
        expect(l).toBeLessThanOrEqual(CLUSTER_LEAD.LOW);
      }
      // 整数节点 ⇒ 等分后取整，相邻级差最多差一节（2px）；取最小那对，且不比标称大
      const nominal = L > 1 ? LEVEL_RANGE_PX / (L - 1) : 0;
      expect(Math.abs(clusterLevelStep(L) - nominal)).toBeLessThanOrEqual(2);
      expect(clusterLevelStep(L)).toBeLessThanOrEqual(nominal + 1e-9);
    }
    for (const plan of PLANS)
      for (const rel of RELS)
        for (const u of clusterUnits(plan, rel, FORMS[CLUSTER_DEFAULT_FORM])) {
          expect(u.spec.length).toBe(3);
          expect(u.spec[1]).toBe(FORMS[CLUSTER_DEFAULT_FORM].spec[1]); // 同一个自由段对象
          expect(u.spec[0][1] + u.spec[2][1]).toBe(RING_LEAD + RING_TAIL);
        }
    expect(LEVEL_RANGE_PX).toBe(88);
  });

  it('距离四态是量出来的：每一对单元都满足自己的距离要求，且最紧的那对恰好贴着要求', () => {
    for (const plan of PLANS)
      for (const rel of RELS)
        UNIT_FORMS.forEach((f, fi) => {
          const p = clusterPitch(plan, rel, fi, R);
          const pos = clusterPositions(plan);
          const lv = clusterLevels(plan, rel);
          const sp = CLUSTER_RELATIONS.find((r) => r.key === rel)!.spacing;
          const rim = R + f.peakReach;
          let tight = false;
          let interleaved = false;
          for (let i = 0; i < pos.length; i++)
            for (let j = i + 1; j < pos.length; j++) {
              const d = p * Math.hypot(pos[i].x - pos[j].x, pos[i].z - pos[j].z);
              const need =
                sp === 'apart'
                  ? ringCellPitch(R)
                  : sp === 'touch' || lv[i] === lv[j]
                    ? 2 * rim
                    : 2 * R + f.peakReach + OVERLAP_CLEAR.XY;
              expect(d, `${plan}/${rel}/${f.key} ${i}-${j}`).toBeGreaterThanOrEqual(need - 1e-6);
              if (Math.abs(d - need) < 1e-6) tight = true;
              if (lv[i] !== lv[j] && d < 2 * rim - 1e-6) interleaved = true;
              // 嵌永远不发生：平台不伸进邻居的芯带
              expect(d).toBeGreaterThan(2 * R + f.peakReach);
            }
          expect(tight, `${plan}/${rel}/${f.key} 最紧的一对贴着要求`).toBe(true);
          if (sp === 'apart') expect(p).toBeCloseTo(ringCellPitch(R), 9); // = Lab.12 的格距
          if (sp === 'touch') expect(p).toBeCloseTo(2 * rim, 9);
          if (sp === 'overlap') expect(interleaved, `${plan}/${f.key} 真的盖过去了`).toBe(true);
        });
  });

  it('交叠的可行性矩阵：高差装得下折叠体全程跨度 + 余量的才放行', () => {
    // 两级（一对 / 方阵 / 九宫）：高差 88 —— 袋成形期跨 90.7 装不下，其余三种装得下
    for (const plan of ['pair', 'quad', 'nine'] as const)
      expect(UNIT_FORMS.map((_, i) => overlapFeasible(plan, i))).toEqual([false, true, true, true]);
    // 三级（三角）：每级高差只有 44 —— 蘑菇 36.1 / 直挑台 30.4 装得下，袋与方箱装不下
    expect(UNIT_FORMS.map((_, i) => overlapFeasible('triad', i))).toEqual([false, true, true, false]);
    // 余量 = 高差 − 全程跨度 − 净距，符号与判定一致
    for (const plan of PLANS)
      UNIT_FORMS.forEach((_, i) => expect(overlapMargin(plan, i) >= 0).toBe(overlapFeasible(plan, i)));
    expect(overlapMargin('pair', 3)).toBeCloseTo(88 - 77.0 - OVERLAP_CLEAR.Y, 6);
  });

  it('站位 / 编制表 / 房间 / 小人 / 取景对得上', () => {
    for (const plan of PLANS)
      for (const rel of RELS) {
        const fi = CLUSTER_DEFAULT_FORM;
        const cells = clusterCells(plan, rel, fi, R);
        const levels = clusterLevelCount(plan, rel);
        const plans = clusterPlans(levels);
        expect(cells.length).toBe(CLUSTER_PLANS.find((p) => p.key === plan)!.n);
        for (const c of cells) {
          expect(c.plan).toBeLessThan(plans.length);
          expect(plans[c.plan].length).toBe(RING.COUNT);
        }
        // 世界站位 = 归一站位 × 间距 × RIG_SCALE
        const p = clusterPitch(plan, rel, fi, R) * RIG_SCALE;
        const pos = clusterPositions(plan);
        cells.forEach((c, i) => {
          expect(c.x).toBeCloseTo(pos[i].x * p, 9);
          expect(c.z).toBeCloseTo(pos[i].z * p, 9);
        });
        // 房间装得下整簇：占宽 ≥ 最远站位 + 外缘
        const span = clusterFieldSpan(plan, rel, fi, R);
        const rimW = (R + UNIT_FORMS[fi].peakReach) * RIG_SCALE;
        for (const c of cells) {
          expect(span / 2).toBeGreaterThanOrEqual(Math.abs(c.x) + rimW - 1e-9);
          expect(span / 2).toBeGreaterThanOrEqual(Math.abs(c.z) + rimW - 1e-9);
        }
        // 小人站在簇外：与每个环的净距 > 0（头顶比平台高，平面上不许重叠）
        const spot = figureSpotBySpan(span);
        for (const c of cells) expect(Math.hypot(spot.x - c.x, spot.z - c.z) - rimW).toBeGreaterThan(20);
        // 布景 = 地板 + 两面墙 + 小人
        const scene = clusterScene(plan, rel, fi, R);
        expect(scene.map((m) => m.kind)).toEqual(['room', 'room', 'room', 'figure']);
        // 取景 ≤ 允许值（同一份余量）
        for (const v of ['axon', 'front', 'side', 'top'] as const) {
          const fit = viewFitBySpan(span + 2 * ROOM.MARGIN, v);
          const cam = clusterCamScale(plan, rel, fi, R, v);
          expect(cam).toBeGreaterThan(0);
          expect(cam / fit).toBeCloseTo(0.94, 9);
        }
      }
  });

  it('给人读的量：一对交叠高差 0.35 m、九宫错层每级 0.17 m、方箱平台 ⌀0.89 m、相切时正好贴边', () => {
    const toM = (px: number): number => (px * RIG_SCALE * MM_PER_UNIT) / 1000;
    const m1 = clusterMetrics('pair', 'overlap', 3, R);
    expect(m1.levels).toBe(2);
    expect(m1.stepM).toBeCloseTo(toM(88), 6);
    expect(m1.stepM).toBeGreaterThan(0.34);
    expect(m1.overlapM).toBeGreaterThan(0.2); // 平台真的盖过去一截
    const m2 = clusterMetrics('nine', 'touchStep', 3, R);
    expect(m2.levels).toBe(3);
    expect(m2.stepM).toBeCloseTo(toM(44), 6);
    expect(m2.platformM).toBeCloseTo(toM(2 * (R + 82.2)), 6);
    expect(m2.overlapM).toBeCloseTo(0, 6); // 相切：既不空也不叠
    const m3 = clusterMetrics('quad', 'apart', 3, R);
    expect(m3.stepM).toBe(0);
    expect(m3.overlapM).toBeLessThan(0); // 分离：留着空地
  });

  it('时序：同步 = 几级解几条、延迟全 0；错相 = 每格一条、按波序晚 150 步一波起步、九宫按对角线扫', () => {
    expect(CLUSTER_TIMINGS.map((t) => t.key)).toEqual(['sync', 'stagger']);
    expect(STAGGER_STEPS).toBe(150);
    expect(clusterWaves('pair')).toEqual([0, 1]);
    expect(clusterWaves('triad')).toEqual([0, 1, 2]);
    expect(clusterWaves('quad')).toEqual([0, 1, 2, 3]);
    expect(clusterWaves('nine')).toEqual([0, 1, 2, 1, 2, 3, 2, 3, 4]); // 行 + 列：一道波从一个角推到对角
    const form = FORMS[CLUSTER_DEFAULT_FORM];
    for (const plan of PLANS)
      for (const rel of RELS) {
        const n = CLUSTER_PLANS.find((p) => p.key === plan)!.n;
        const lv = clusterLevels(plan, rel);
        const leads = clusterLeads(clusterLevelCount(plan, rel));
        const sync = clusterBuild(plan, rel, 'sync', form);
        expect(sync.units.length).toBe(clusterLevelCount(plan, rel));
        expect(sync.units.every((u) => u.delay === 0)).toBe(true);
        expect(sync.cellPlan).toEqual(lv);
        expect(sync.plans.length).toBe(sync.units.length);
        const st = clusterBuild(plan, rel, 'stagger', form);
        expect(st.units.length).toBe(n);
        expect(st.plans.length).toBe(n);
        expect(st.cellPlan).toEqual(lv.map((_, i) => i));
        st.units.forEach((u, i) => {
          expect(u.delay).toBe(clusterWaves(plan)[i] * STAGGER_STEPS);
          expect(u.spec[0][1]).toBe(leads[lv[i]]); // 各带自己那一级的 lead
          expect(u.spec[1]).toBe(form.spec[1]); // 形态同一个自由段对象
          expect(st.plans[i].every((e) => e === i)).toBe(true);
        });
        // 站位表的 plan 跟着时序走
        expect(clusterCells(plan, rel, CLUSTER_DEFAULT_FORM, R, 'stagger').map((c) => c.plan)).toEqual(
          lv.map((_, i) => i),
        );
        expect(clusterCells(plan, rel, CLUSTER_DEFAULT_FORM, R).map((c) => c.plan)).toEqual(lv);
      }
  });

  it('连接：只在相切·齐平下，相邻（归一距 1）的每一对之间搭一块网', () => {
    expect(clusterBridges('pair', 'touch').length).toBe(1);
    expect(clusterBridges('triad', 'touch').length).toBe(3);
    expect(clusterBridges('quad', 'touch').length).toBe(4);
    expect(clusterBridges('nine', 'touch').length).toBe(12);
    for (const plan of PLANS) {
      for (const rel of ['apart', 'apartStep', 'touchStep', 'overlap'] as const)
        expect(clusterBridges(plan, rel)).toEqual([]);
      const pos = clusterPositions(plan);
      for (const [i, j] of clusterBridges(plan, 'touch'))
        expect(Math.hypot(pos[i].x - pos[j].x, pos[i].z - pos[j].z)).toBeCloseTo(1, 9);
    }
  });

  it('房间固定用 Lab.12 那一间：同半径下地板与两面墙逐位相同，簇再小房间不缩', () => {
    for (const r of [RING.RADIUS_MIN, R, RING.RADIUS_MAX]) {
      const ref = ringGridScene(r);
      for (const plan of PLANS)
        for (const rel of RELS) {
          const sc = clusterScene(plan, rel, CLUSTER_DEFAULT_FORM, r);
          for (let k = 0; k < 3; k++) {
            expect(sc[k].kind).toBe('room');
            expect(Array.from(sc[k].verts)).toEqual(Array.from(ref[k].verts));
          }
        }
    }
  });
});
