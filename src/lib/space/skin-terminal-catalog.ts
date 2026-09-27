/** 发布前枚举台架的物理输入；全部调用现有构造器，不另写键谱或近似形态。 */
import { SKIN_UNITS, skinSiteOpts } from './skin-data';
import { DUAL_MID_OPTIONS, buildDualDisplay } from './skin-dual';
import { buildTransitionArray } from './skin-array';
import { buildSplitLevels } from './skin-split';
import { buildRingUnits, buildWaveUnits } from './skin-ring';
import { buildRingGradient } from './skin-ring-gradient';
import { buildSplitRingUnits } from './skin-split-ring';
import { SQUARE_MORPH, squareMorphTiers, buildSquareUnits, buildSquareWave } from './skin-square';
import { buildSquareSplitUnits } from './skin-square-split';
import { CLUSTER_PLANS, CLUSTER_RELATIONS, CLUSTER_TIMINGS, clusterBuild, clusterForms } from './unit-cluster';
import { COMBO_PLANS, COMBO_FAMILIES, comboBuild, comboForms } from './unit-combo';
import type { SkinTerminalInput } from './skin-terminal';

export function skinTerminalCatalog(): SkinTerminalInput[] {
  const inputs: SkinTerminalInput[] = SKIN_UNITS.map((d) => ({ spec: d.spec, opts: skinSiteOpts(d) }));
  for (const mid of DUAL_MID_OPTIONS) inputs.push(...buildDualDisplay({ mid }));
  inputs.push(...buildTransitionArray(), ...buildSplitLevels());
  const rings = buildRingUnits();
  // Lab 2-5 双层台只取捏分 j0，下面的整组已覆盖；摆放不进入终态键。
  inputs.push(...rings, ...rings.flatMap(buildWaveUnits), ...buildRingGradient(), ...buildSplitRingUnits());
  for (let s = 0; s < SQUARE_MORPH.STEPS; s++) {
    const tiers = squareMorphTiers(s);
    inputs.push(...buildSquareUnits(tiers), ...buildSquareWave(tiers).units);
  }
  inputs.push(...buildSquareSplitUnits());
  for (const form of clusterForms())
    for (const plan of CLUSTER_PLANS)
      for (const relation of CLUSTER_RELATIONS)
        for (const timing of CLUSTER_TIMINGS)
          inputs.push(...clusterBuild(plan.key, relation.key, timing.key, form).units);
  for (const [i, form] of comboForms().entries())
    for (const family of COMBO_FAMILIES)
      for (const plan of COMBO_PLANS)
        inputs.push(...comboBuild(plan, family.key, form, i).units);
  return inputs;
}
