/**
 * 项目二 · 4×4 阵列（Lab.10 的编制）——纯数据 + 纯几何，零 DOM。
 *
 * 用户 2026-08-23 立项：「做本项目第四个 lab，一个 4×4 的阵列，间距就是每个膨胀到
 * 最大的时候有一点点空隙就行。」这是交接件「单元阵列化」的平面版——前面几台把单元
 * 排成一列（Lab.08）或一圈（Lab.09），这台把它们铺进房间的平面网格。
 *
 * ## 间距是量出来的，不是定出来的
 *
 * 用户只给了一条规则：**膨胀到最大时留一点点空隙**。于是三个数全部由实测推出：
 *
 * - **全程最大膨胀 52.0px**（直挑台，step 900）。必须按「全程」量而不是终态——
 *   阶梯方箱在 step 519 鼓到 43.5，终态反而收回 40.6；只看终态会把间距定小 3px，
 *   过程中就撞上了。
 * - **芯轨外伸 5.8px**（轨心内偏 3.4 + 半宽 2.4）。这段也要算：不算的话邻居的杆会
 *   贴到这一个的皮上——缝是给「看得见的东西」留的，不只是给皮留的。
 * - ⇒ **间距 = 52.0 + 5.8 + 6 = 63.8 → 64**，缝 6px。
 *
 * **带深取 58**（= 间距 − 缝）让深度方向的缝也是 6：平面上每个格子四边都是同样的
 * 一点点空隙，而不是一个方向挤、另一个方向空。
 *
 * 间距按**四种形态里最大的那个**定，不随所选形态变——换形态时网格不该重排。
 */
import { ARRAY_FREE, ARRAY_LEAD, ARRAY_TAIL, placeOnBand } from './skin-array';
import { SKIN_UNITS, skinSiteOpts } from './skin-data';
import type { SkinSpec } from './skin-unit';
import type { RingUnitDef } from './skin-ring';

/** 全程最大膨胀（四种形态取最大；scripts/skin-ring/draft.mjs 旁的探针实测，守门复核） */
export const PEAK_REACH = 52.0;
/** 芯轨在 −X 侧的外伸（轨心内偏 3.4 + 半宽 2.4）——间距要把它算进去 */
export const RAIL_OUT = 5.8;
/** 留缝（用户：「有一点点空隙就行」） */
export const GRID_GAP = 6;

export const GRID = {
  COLS: 4,
  ROWS: 4,
  /** 网格间距：两个方向同值 ⇒ 平面上四边的缝一样宽 */
  PITCH: Math.ceil(PEAK_REACH + RAIL_OUT + GRID_GAP),
  /** 带深 = 间距 − 缝 ⇒ 深度方向的缝与膨胀方向一样 */
  DEPTH: Math.ceil(PEAK_REACH + RAIL_OUT + GRID_GAP) - GRID_GAP,
  THICK: 5,
} as const;

/** 单元数 */
export const GRID_COUNT = GRID.COLS * GRID.ROWS;

/** 膨胀方向（+X）上，一个单元与右邻之间的净缝 */
export function gridGapX(pitch: number = GRID.PITCH, reach: number = PEAK_REACH): number {
  return pitch - reach - RAIL_OUT;
}
/** 深度方向上，一个单元与后邻之间的净缝 */
export function gridGapZ(pitch: number = GRID.PITCH, depth: number = GRID.DEPTH): number {
  return pitch - depth;
}

/**
 * 阵列用的四种形态：目录键谱搬到 Lab.08 那副三段构造上（lead 54 / tail 57，
 * 折叠体在带子中段——这台是吊在房间里的一片单元，不是 Lab.09 那种贴底的环）。
 */
export function buildGridUnits(): RingUnitDef[] {
  return SKIN_UNITS.map((d) => ({
    key: d.key,
    zh: d.zh,
    en: d.en,
    spec: [['g', ARRAY_LEAD], placeOnBand(d.spec[1]), ['g', ARRAY_TAIL]] as SkinSpec,
    opts: skinSiteOpts(d),
    smooth: d.smooth ?? ([3, 1] as const),
  }));
}

/** 带总节数（与 Lab.08 / Lab.09 同长） */
export const GRID_BAND_NODES = ARRAY_LEAD + ARRAY_FREE + ARRAY_TAIL;

/**
 * 编制：
 * - `uniform` = 整片同一种形态（台架只传那一条引擎 ⇒ 16 格全指下标 0，解一次画十六份）；
 * - `perRow` = 每行一种（行 0→3 = 袋 / 蘑菇挑台 / 直挑台 / 阶梯挑台，四条引擎），
 *   一屏里把目录四形态当成一片场地来读。
 * 行优先编号：u = 行·列数 + 列。
 */
export function buildGridOrder(mode: 'uniform' | 'perRow', cols: number = GRID.COLS, rows: number = GRID.ROWS): number[] {
  return Array.from({ length: cols * rows }, (_, u) =>
    mode === 'uniform' ? 0 : Math.floor(u / cols),
  );
}
