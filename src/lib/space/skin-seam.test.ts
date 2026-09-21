import { describe, expect, it } from 'vitest';
import type { SkinBond, SkinSpec } from './skin-unit';
import { buildSquareSplitUnits, SQSPLIT_TIERS } from './skin-square-split';
import { buildSplitRingUnits, SPLIT_RING_TIERS } from './skin-split-ring';
import { buildSplitLevels } from './skin-split';

/**
 * 捏分档的「缝底」标记（用户 2026-09-21：取消上下两片台之间跨平台的橙色键，只留各片台
 * 内部的）。台架按它过滤键线：两端跨在缝底两侧的键不画。这里守的是标记本身——
 * 落在自由段里、恰是对称中心；按它分类，每条开了缝的带只剩两根内部键（上下面角的
 * 同侧键），其余（外箱梯挡 + 缝链）全是跨缝的；整块档（t=0）不给标记，梯挡照画。
 */
function bondsAbs(spec: SkinSpec): SkinBond[] {
  const out: SkinBond[] = [];
  let off = 0;
  for (const seg of spec) {
    if (seg[0] === 'f') {
      const lists: (readonly SkinBond[])[] = [seg[2]];
      if (seg.length >= 5) lists.push(...(seg[4] as readonly (readonly SkinBond[])[]));
      for (const l of lists) for (const [i, j, rb] of l) out.push([off + i, off + j, rb]);
    }
    off += seg[1];
  }
  return out;
}

function split(bonds: readonly SkinBond[], seam: number) {
  const kept = bonds.filter(([i, j]) => (i - seam) * (j - seam) > 0);
  const cross = bonds.filter(([i, j]) => (i - seam) * (j - seam) < 0);
  const touch = bonds.filter(([i, j]) => i === seam || j === seam);
  return { kept, cross, touch };
}

describe('捏分缝底标记（键线过滤）', () => {
  const families = [
    { name: '方形环捏分', units: buildSquareSplitUnits(), t: SQSPLIT_TIERS.map((x) => x.t) },
    { name: '圆筒环捏分', units: buildSplitRingUnits(), t: SPLIT_RING_TIERS.map((x) => x.t) },
    {
      name: '序列捏分（Lab 2-4）',
      units: buildSplitLevels().map((l) => ({ spec: l.spec, seam: l.t > 0 ? l.marks.center : undefined })),
      t: buildSplitLevels().map((l) => l.t),
    },
  ];

  for (const fam of families) {
    it(`${fam.name}：开缝的档有缝底标记、整块没有`, () => {
      fam.units.forEach((u, k) => {
        if (fam.t[k] > 0) expect(u.seam).toBeTypeOf('number');
        else expect(u.seam).toBeUndefined();
      });
      expect(fam.units.some((u) => u.seam === undefined)).toBe(true);
    });

    it(`${fam.name}：按缝底分，每条只剩两根内部键，跨缝的 ≥ 4，没有键搭在缝底上`, () => {
      for (const u of fam.units) {
        if (u.seam === undefined) continue;
        const bonds = bondsAbs(u.spec);
        const { kept, cross, touch } = split(bonds, u.seam);
        expect(kept.length).toBe(2);
        expect(cross.length).toBeGreaterThanOrEqual(4);
        expect(touch.length).toBe(0);
        expect(kept.length + cross.length).toBe(bonds.length);
        // 两根内部键一上一下，各在缝底一侧
        expect(kept.filter(([i]) => i < u.seam!).length).toBe(1);
        expect(kept.filter(([i]) => i > u.seam!).length).toBe(1);
        // 缝底在某个自由段里（不在贴合段上）
        let off = 0;
        let inFree = false;
        for (const seg of u.spec) {
          if (seg[0] === 'f' && u.seam >= off && u.seam < off + seg[1]) inFree = true;
          off += seg[1];
        }
        expect(inFree).toBe(true);
      }
    });
  }
});
