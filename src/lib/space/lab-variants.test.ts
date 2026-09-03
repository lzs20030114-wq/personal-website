import { describe, expect, it } from 'vitest';
import { LAB_VARIANTS, allCombos, benchCombos } from './lab-variants';

/**
 * 差分守门（2026-09-03 收纳同轮）：把七台的全部离散组合冻成清单。合并台架时最可能的
 * 事故是某一档被静默丢掉——形状合法、页面照样能跑、只有点过那个按钮的人才知道少了。
 * 这里少一条就红。改档位（加/减/改名）必须同时改这张表，这是有意的。
 */
const FROZEN = [
  // Ⅰ 单元 · 一条带
  '06:-',
  '07:-',
  '08:-:16',
  '08:-:29',
  '08:-:48',
  // Ⅱ 序列 · 一排（Lab.08 渐变 + Lab.12 捏分 ⇒ 编制 2 × 排布 2）
  '09:gradient:merged',
  '09:gradient:spread',
  '09:split:merged',
  '09:split:spread',
  // Ⅲ 环 · 一圈（Lab.09 三编制 × 形态 + Lab.13 捏分 ⇒ 4 + 4 + 1 + 1）
  '10:wave.pocket',
  '10:wave.bulb',
  '10:wave.ledge',
  '10:wave.stepped',
  '10:single.pocket',
  '10:single.bulb',
  '10:single.ledge',
  '10:single.stepped',
  '10:gradient',
  '10:split',
  // Lab.14 方形环 ⇒ (5 + 5 + 1) × 排布 2
  '11:flat.m0:single',
  '11:flat.m0:grid',
  '11:flat.m1:single',
  '11:flat.m1:grid',
  '11:flat.m2:single',
  '11:flat.m2:grid',
  '11:flat.m3:single',
  '11:flat.m3:grid',
  '11:flat.m4:single',
  '11:flat.m4:grid',
  '11:wave.m0:single',
  '11:wave.m0:grid',
  '11:wave.m1:single',
  '11:wave.m1:grid',
  '11:wave.m2:single',
  '11:wave.m2:grid',
  '11:wave.m3:single',
  '11:wave.m3:grid',
  '11:wave.m4:single',
  '11:wave.m4:grid',
  '11:split:single',
  '11:split:grid',
  // Ⅳ 场 · 一间房（Lab.10 ⇒ 4 + 1）
  '12:uniform.pocket',
  '12:uniform.bulb',
  '12:uniform.ledge',
  '12:uniform.stepped',
  '12:perRow',
  // Ⅴ 单元之间（Lab.13 单元关系 ⇒ 编制 4 × 形态 4 × 关系 5）
  '13:pair.pocket:apart',
  '13:pair.pocket:touch',
  '13:pair.pocket:apartStep',
  '13:pair.pocket:touchStep',
  '13:pair.pocket:overlap',
  '13:pair.bulb:apart',
  '13:pair.bulb:touch',
  '13:pair.bulb:apartStep',
  '13:pair.bulb:touchStep',
  '13:pair.bulb:overlap',
  '13:pair.ledge:apart',
  '13:pair.ledge:touch',
  '13:pair.ledge:apartStep',
  '13:pair.ledge:touchStep',
  '13:pair.ledge:overlap',
  '13:pair.stepped:apart',
  '13:pair.stepped:touch',
  '13:pair.stepped:apartStep',
  '13:pair.stepped:touchStep',
  '13:pair.stepped:overlap',
  '13:triad.pocket:apart',
  '13:triad.pocket:touch',
  '13:triad.pocket:apartStep',
  '13:triad.pocket:touchStep',
  '13:triad.pocket:overlap',
  '13:triad.bulb:apart',
  '13:triad.bulb:touch',
  '13:triad.bulb:apartStep',
  '13:triad.bulb:touchStep',
  '13:triad.bulb:overlap',
  '13:triad.ledge:apart',
  '13:triad.ledge:touch',
  '13:triad.ledge:apartStep',
  '13:triad.ledge:touchStep',
  '13:triad.ledge:overlap',
  '13:triad.stepped:apart',
  '13:triad.stepped:touch',
  '13:triad.stepped:apartStep',
  '13:triad.stepped:touchStep',
  '13:triad.stepped:overlap',
  '13:quad.pocket:apart',
  '13:quad.pocket:touch',
  '13:quad.pocket:apartStep',
  '13:quad.pocket:touchStep',
  '13:quad.pocket:overlap',
  '13:quad.bulb:apart',
  '13:quad.bulb:touch',
  '13:quad.bulb:apartStep',
  '13:quad.bulb:touchStep',
  '13:quad.bulb:overlap',
  '13:quad.ledge:apart',
  '13:quad.ledge:touch',
  '13:quad.ledge:apartStep',
  '13:quad.ledge:touchStep',
  '13:quad.ledge:overlap',
  '13:quad.stepped:apart',
  '13:quad.stepped:touch',
  '13:quad.stepped:apartStep',
  '13:quad.stepped:touchStep',
  '13:quad.stepped:overlap',
  '13:nine.pocket:apart',
  '13:nine.pocket:touch',
  '13:nine.pocket:apartStep',
  '13:nine.pocket:touchStep',
  '13:nine.pocket:overlap',
  '13:nine.bulb:apart',
  '13:nine.bulb:touch',
  '13:nine.bulb:apartStep',
  '13:nine.bulb:touchStep',
  '13:nine.bulb:overlap',
  '13:nine.ledge:apart',
  '13:nine.ledge:touch',
  '13:nine.ledge:apartStep',
  '13:nine.ledge:touchStep',
  '13:nine.ledge:overlap',
  '13:nine.stepped:apart',
  '13:nine.stepped:touch',
  '13:nine.stepped:apartStep',
  '13:nine.stepped:touchStep',
  '13:nine.stepped:overlap',
];

describe('lab-variants · 项目二台架差分清单', () => {
  it('八台五段：编号 06–13 连续、不重复', () => {
    expect(LAB_VARIANTS.map((b) => b.no)).toEqual(['06', '07', '08', '09', '10', '11', '12', '13']);
    expect(new Set(LAB_VARIANTS.map((b) => b.key)).size).toBe(LAB_VARIANTS.length);
  });

  it('126 种离散组合逐条与冻结清单相同（少一档即红）', () => {
    const combos = allCombos();
    expect(combos.length).toBe(126);
    expect(combos).toEqual(FROZEN);
  });

  it('每台组合数 = 收纳前各台组合之和（1 + 1 + 3 + (2+2) + (9+1) + 22 + 5）+ Lab.13 的 80', () => {
    const per = Object.fromEntries(LAB_VARIANTS.map((b) => [b.no, benchCombos(b).length]));
    expect(per).toEqual({ '06': 1, '07': 1, '08': 3, '09': 4, '10': 10, '11': 22, '12': 5, '13': 80 });
  });

  it('组合 id 唯一（同名档不会在清单里被折叠掉）', () => {
    const combos = allCombos();
    expect(new Set(combos).size).toBe(combos.length);
  });
});
