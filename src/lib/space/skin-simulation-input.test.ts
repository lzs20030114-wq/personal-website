import { describe, expect, it } from 'vitest';
import { clusterBuild, clusterForms, CLUSTER_PLANS, CLUSTER_RELATIONS, CLUSTER_TIMINGS } from './unit-cluster';
import { shareSkinSimulationInputs, skinSimulationInputsKey, skinSimulationSignature } from './skin-simulation-input';
import { createSkinUnit } from './skin-unit';

describe('独立皮肤引擎的真实输入身份', () => {
  it('错相关系改变高度必须换输入；仅分离/相切则继续同一次成形', () => {
    const form = clusterForms()[3];
    for (const plan of CLUSTER_PLANS) {
      const key = (relation: Parameters<typeof clusterBuild>[1]) =>
        skinSimulationInputsKey(clusterBuild(plan.key, relation, 'stagger', form).units);
      expect(key('apart')).toBe(key('touch'));
      expect(key('apartStep')).toBe(key('touchStep'));
      expect(key('apart')).not.toBe(key('apartStep'));
    }
  });

  it('全部关系配置中相同 key 的各槽谱、选项与延迟一致', () => {
    const seen = new Map<string, unknown>();
    for (const form of clusterForms()) for (const plan of CLUSTER_PLANS)
      for (const relation of CLUSTER_RELATIONS) for (const timing of CLUSTER_TIMINGS) {
        const { units } = clusterBuild(plan.key, relation.key, timing.key, form);
        const key = skinSimulationInputsKey(units);
        // 对当前族还确认纯渲染参数相同；不能因物理 key 相等偷偷沿用另一套平滑。
        const physical = units.map(({ spec, opts, delay, smooth }) => ({ spec, opts, delay, smooth }));
        if (seen.has(key)) expect(physical).toEqual(seen.get(key));
        else seen.set(key, physical);
      }
  });

  it('同终态但不同延迟的活引擎不能共用', () => {
    const input = clusterForms()[3];
    expect(skinSimulationSignature(input)).toBe(skinSimulationSignature({ ...input, delay: 0 }));
    expect(skinSimulationSignature(input)).not.toBe(skinSimulationSignature({ ...input, delay: 150 }));
  });

  it('九宫错相去重保留每格的谱、绘图参数、相位和逻辑映射', () => {
    for (const form of clusterForms()) for (const relation of CLUSTER_RELATIONS) {
      const build = clusterBuild('nine', relation.key, 'stagger', form);
      const shared = shareSkinSimulationInputs(build.units);
      expect(shared.units).toHaveLength(relation.levels === 'stepped' ? 6 : 5);
      for (let slot = 0; slot < 9; slot++) {
        const a = build.units[slot], b = shared.units[shared.slotToUnit[slot]];
        expect([a.spec, a.opts, a.delay, a.smooth]).toEqual([b.spec, b.opts, b.delay, b.smooth]);
      }
      expect(build.plans.map(p => p.map(i => shared.slotToUnit[i]))).toHaveLength(9);
    }
    const input = clusterForms()[3];
    expect(shareSkinSimulationInputs([input, { ...input, smooth: [5, 1] as const }]).units).toHaveLength(2);
  });

  it('九宫交叠全 2100 tick 的坐标、r、step、锁键顺序与原九条解逐位一致', () => {
    const build = clusterBuild('nine', 'overlap', 'stagger', clusterForms()[3]);
    const shared = shareSkinSimulationInputs(build.units);
    const original = build.units.map(d => createSkinUnit(d.spec, d.opts));
    const unique = shared.units.map(d => createSkinUnit(d.spec, d.opts));
    for (let tick = 1; tick <= 2100; tick++) {
      original.forEach((s, i) => { if (tick > build.units[i].delay) s.advance(); });
      unique.forEach((s, i) => { if (tick > shared.units[i].delay) s.advance(); });
      for (let slot = 0; slot < 9; slot++) {
        const a = original[slot], b = unique[shared.slotToUnit[slot]];
        if (a.step !== b.step || a.r !== b.r ||
          !a.px.every((v, i) => Object.is(v, b.px[i])) || !a.py.every((v, i) => Object.is(v, b.py[i])) ||
          JSON.stringify(a.locked) !== JSON.stringify(b.locked))
          throw new Error(`轨迹差异 tick=${tick}, slot=${slot}`);
      }
    }
    expect(unique.every(s => s.done)).toBe(true);
  }, 60000);
});
