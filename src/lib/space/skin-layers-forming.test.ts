import { describe, expect, it } from 'vitest';
import { auditLayerProfile } from '../../../scripts/skin-layers/audit';
import { buildLayerProfiles, LAYER_FORMING } from './skin-layers-forming';
import { skinTerminalCatalog } from './skin-terminal-catalog';
import { sqSplitStructure, SQSPLIT_TIERS } from './skin-square-split';

const builds = buildLayerProfiles();
let results: ReturnType<typeof auditLayerProfile>[] | undefined;
const run = () => results ??= (['double', 'solid'] as const).map(auditLayerProfile);

describe('多层台 · 恒高双层区与厚台区的真实成形', () => {
  it('共用一个收缩终点与总带长，独立纳入发布终态缓存', () => {
    const catalog = skinTerminalCatalog();
    for (const build of builds) {
      expect(build.opts.r1).toBe(LAYER_FORMING.r1);
      expect(build.spec.reduce((n, seg) => n + seg[1], 0)).toBe(LAYER_FORMING.band);
      expect(catalog).toContainEqual(expect.objectContaining({ spec: build.spec, opts: build.opts }));
    }
    expect(builds[0].marks.center).toBe(builds[1].marks.center);
  });
  it('真跑：两区保持目标总高与挑出，端部水平、键全锁，剪影吻合目标', () => {
    for (const r of run()) {
      expect(r.finite).toBe(true);
      expect(r.locked).toBe(r.keys);
      expect(Math.abs(r.height - LAYER_FORMING.height)).toBeLessThan(.1);
      expect(Math.abs(r.reach - LAYER_FORMING.reach)).toBeLessThan(.5);
      expect(r.topFlat).toBeLessThan(.5);
      expect(r.bottomFlat).toBeLessThan(.5);
      expect(r.silD).toBeLessThan(1);
      expect(r.knot, `${r.kind} 全程每 10 步的非相邻交叉跨度`).toBe(0);
    }
  });
  it('厚台直边贯通上下，双层区仍保留 100 的空间', () => {
    const [double, solid] = run();
    expect(Math.abs(double.gap - LAYER_FORMING.gap)).toBeLessThan(.2);
    expect(solid.frontStraight).toBeLessThan(.1);
    expect(Math.abs(double.center - solid.center)).toBeLessThan(.1);
    for (const [i, f] of double.frames.entries()) if (f.step >= 800) {
      expect(Math.abs(f.top - solid.frames[i].top)).toBeLessThan(3.5);
      expect(Math.abs(f.bottom - solid.frames[i].bottom)).toBeLessThan(3.5);
    }
  });
  it('固定高度是显式选项；原变高档不随新台变高，非法高度拒收', () => {
    expect(sqSplitStructure(SQSPLIT_TIERS[9]).h).toBe(32);
    expect(sqSplitStructure(SQSPLIT_TIERS[0]).h).toBe(132);
    expect(() => sqSplitStructure(SQSPLIT_TIERS[0], 100, { height: 90 })).toThrow();
    expect(() => sqSplitStructure(SQSPLIT_TIERS[0], 100, { height: 100 })).toThrow();
    expect(() => sqSplitStructure(SQSPLIT_TIERS[0], 100, { r1: 0 })).toThrow();
  });
});
