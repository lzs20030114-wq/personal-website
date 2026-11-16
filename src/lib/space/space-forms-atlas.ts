/**
 * 空间形态研究的一组排法（2026-11-16，方案 = 项目二_空间形态研究.md §4）。
 * 每一种是一间 8×8 的房（2-15 那间）里每台单元停在什么状态；读数由 space-forms.readSpace 现算，线稿由
 * scripts/space-forms/atlas.mjs 画。名字只用建筑上通行的叫法（走廊、壁龛、院、亭……），不另起名。
 * 行 r 沿 +y（线稿里从上往下），列 c 沿 +x；门在左右两面墙正中（第 3、4 行）。
 */
import { COLUMN, STOW, dual, emptyField, fill, plat, type SpaceField } from './space-forms';

export interface SpaceType {
  key: string;
  /** 组：面 · 地形 · 边界 · 围合 · 覆盖 · 腔与上下层 · 复合 */
  group: string;
  zh: string;
  /** 一句话说怎么排 */
  how: string;
  build: () => SpaceField;
  /** 线稿剖面切在哪：沿第几行（row）或第几列（col） */
  cut: { along: 'row' | 'col'; at: number };
}

const N = 8;
const WAIST = 1.05;
const TABLE = 0.74;
const LOW = 0.42;
const CANOPY = 2.25;

export const SPACE_GROUPS = ['面', '地形', '边界', '围合', '覆盖', '腔与上下层', '复合'] as const;

export const SPACE_TYPES: SpaceType[] = [
  // ── 面：几台齐平拼成一块
  {
    key: 'island', group: '面', zh: '一块齐腰的大台', how: '中间 2×2 齐平落到 1.05，拼成一块 1.5 m 见方的台（四块方台之间各有一道 0.13 m 的缝）',
    build: () => fill(emptyField(N), 3, 3, 4, 4, plat(WAIST)), cut: { along: 'row', at: 3 },
  },
  {
    key: 'deck', group: '面', zh: '一片桌面高的台', how: '中间 4×4 齐平落到 0.74',
    build: () => fill(emptyField(N), 2, 2, 5, 5, plat(TABLE)), cut: { along: 'row', at: 3 },
  },
  {
    key: 'islands', group: '面', zh: '几座低台', how: '四个角各一块 2×2，落到 0.42',
    build: () => {
      const f = emptyField(N);
      for (const [r, c] of [[1, 1], [1, 5], [5, 1], [5, 5]]) fill(f, r, c, r + 1, c + 1, plat(LOW));
      return f;
    },
    cut: { along: 'row', at: 1 },
  },
  {
    key: 'tiers', group: '面', zh: '靠墙的看台', how: '沿上墙三排，从墙往外 1.05 / 0.74 / 0.42 一排低一排',
    build: () => {
      const f = emptyField(N);
      fill(f, 0, 1, 0, 6, plat(WAIST));
      fill(f, 1, 1, 1, 6, plat(TABLE));
      fill(f, 2, 1, 2, 6, plat(LOW));
      return f;
    },
    cut: { along: 'col', at: 3 },
  },
  {
    key: 'arena', group: '面', zh: '一圈圈台阶围着中间', how: '外圈 1.05、中圈 0.74、里圈 0.42，中间 2×2 空地，从两扇门各留一条路进去',
    build: () => {
      const f = emptyField(N);
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++) {
          const ring = Math.min(r, c, N - 1 - r, N - 1 - c);
          f.cells[r * N + c] = ring === 0 ? plat(WAIST) : ring === 1 ? plat(TABLE) : ring === 2 ? plat(LOW) : STOW;
        }
      fill(f, 3, 0, 3, 2, STOW); // 左门进去的路
      fill(f, 3, 5, 3, 7, STOW); // 右门进去的路
      return f;
    },
    cut: { along: 'row', at: 4 },
  },
  // ── 地形：一台之内的斜坡首尾接成坡
  {
    key: 'ramp', group: '地形', zh: '一条坡道', how: '第 1 行三台各升 0.39，从 0.30 接到 1.47，再接两台 1.47 的平台',
    build: () => {
      const f = emptyField(N);
      [0.3, 0.69, 1.08].forEach((t, i) => (f.cells[1 * N + 1 + i] = plat(t, 0.39, 0)));
      f.cells[1 * N + 4] = plat(1.47);
      f.cells[1 * N + 5] = plat(1.47);
      return f;
    },
    cut: { along: 'row', at: 1 },
  },
  {
    key: 'ridge-valley', group: '地形', zh: '一道脊、一道谷', how: '上两行：从两端 0.30 升到中间 1.08 再降回去；下两行反过来，两端 1.08、中间 0.30',
    build: () => {
      const f = emptyField(N);
      for (const r of [1, 2]) {
        f.cells[r * N + 1] = plat(0.3, 0.39, 0);
        f.cells[r * N + 2] = plat(0.69, 0.39, 0);
        f.cells[r * N + 3] = plat(1.08);
        f.cells[r * N + 4] = plat(1.08);
        f.cells[r * N + 5] = plat(0.69, 0.39, 2);
        f.cells[r * N + 6] = plat(0.3, 0.39, 2);
      }
      for (const r of [5, 6]) {
        f.cells[r * N + 1] = plat(0.69, 0.39, 2);
        f.cells[r * N + 2] = plat(0.3, 0.39, 2);
        f.cells[r * N + 3] = plat(0.3);
        f.cells[r * N + 4] = plat(0.3);
        f.cells[r * N + 5] = plat(0.3, 0.39, 0);
        f.cells[r * N + 6] = plat(0.69, 0.39, 0);
      }
      return f;
    },
    cut: { along: 'row', at: 1 },
  },
  // ── 边界：分隔与路
  {
    key: 'divider', group: '边界', zh: '一道齐腰的隔断', how: '第 3 列整列落到 1.05，只在第 6 行留一格口',
    build: () => {
      const f = fill(emptyField(N), 0, 3, 7, 3, plat(WAIST));
      f.cells[6 * N + 3] = STOW;
      return f;
    },
    cut: { along: 'row', at: 2 },
  },
  {
    key: 'corridor', group: '边界', zh: '一条走廊', how: '第 2 行与第 4 行各落一排 1.05（两端各空一格），夹出第 3 行一条宽 0.96 m 的走廊',
    build: () => {
      const f = emptyField(N);
      fill(f, 2, 1, 2, 6, plat(WAIST));
      fill(f, 4, 1, 4, 6, plat(WAIST));
      return f;
    },
    cut: { along: 'col', at: 3 },
  },
  {
    key: 'maze', group: '边界', zh: '一条曲折的路', how: '第 1、3、5 列落成 1.05 的墙，口子上下交替，从左门绕到右门',
    build: () => {
      const f = emptyField(N);
      fill(f, 0, 1, 6, 1, plat(WAIST));
      fill(f, 1, 3, 7, 3, plat(WAIST));
      fill(f, 0, 5, 6, 5, plat(WAIST));
      return f;
    },
    cut: { along: 'row', at: 2 },
  },
  {
    key: 'colonnade', group: '边界', zh: '一排柱', how: '第 3 列八台不成形、布直垂到地，成一排 ⌀0.25 m 的布筒，透的边界',
    build: () => fill(emptyField(N), 0, 3, 7, 3, COLUMN), cut: { along: 'row', at: 2 },
  },
  // ── 围合
  {
    key: 'room-in-room', group: '围合', zh: '房中房', how: '中间 4×4 外圈落到 1.05、里面 2×2 空着，上边留一格口',
    build: () => {
      const f = fill(emptyField(N), 2, 2, 5, 5, plat(WAIST));
      fill(f, 3, 3, 4, 4, STOW);
      f.cells[2 * N + 3] = STOW;
      return f;
    },
    cut: { along: 'row', at: 3 },
  },
  {
    key: 'alcoves', group: '围合', zh: '靠墙的壁龛', how: '上墙边每隔一列落一对 1.47（两台进深），夹出三个开口朝房间的龛',
    build: () => {
      const f = emptyField(N);
      for (const c of [0, 2, 4, 6]) fill(f, 0, c, 1, c, plat(1.47));
      return f;
    },
    cut: { along: 'row', at: 0 },
  },
  {
    key: 'court', group: '围合', zh: '院', how: '6×6 外圈落到 0.74 围出中间 4×4 的院子，正对两扇门各留一个口',
    build: () => {
      const f = fill(emptyField(N), 1, 1, 6, 6, plat(TABLE));
      fill(f, 2, 2, 5, 5, STOW);
      fill(f, 3, 1, 4, 1, STOW);
      fill(f, 3, 6, 4, 6, STOW);
      return f;
    },
    cut: { along: 'row', at: 2 },
  },
  // ── 覆盖：台停在头顶以上
  {
    key: 'canopy', group: '覆盖', zh: '一片低顶', how: '中间 3×3 停在 2.25（台底 2.18，台心下夹环 2.02），人从下面走过',
    build: () => fill(emptyField(N), 2, 2, 4, 4, plat(CANOPY)), cut: { along: 'row', at: 3 },
  },
  {
    key: 'loggia', group: '覆盖', zh: '檐廊', how: '上墙边一排停在 2.25 当檐，前面一排柱',
    build: () => {
      const f = fill(emptyField(N), 0, 0, 0, 7, plat(CANOPY));
      for (const c of [0, 2, 5, 7]) f.cells[1 * N + c] = COLUMN;
      return f;
    },
    cut: { along: 'col', at: 2 },
  },
  {
    key: 'pavilion', group: '覆盖', zh: '亭', how: '中间 2×2 停在 2.25，四周一圈十二根柱',
    build: () => {
      const f = fill(emptyField(N), 2, 2, 5, 5, COLUMN);
      fill(f, 3, 3, 4, 4, plat(CANOPY));
      return f;
    },
    cut: { along: 'row', at: 3 },
  },
  {
    key: 'ceiling-terrain', group: '覆盖', zh: '高低起伏的顶', how: '全部 64 台都停在头顶以上，左低右高：2.25 → 3.30，中间两列压低成一道 2.25 的谷',
    build: () => {
      const f = emptyField(N);
      const h = [2.25, 2.55, 2.85, 2.25, 2.25, 2.85, 3.1, 3.3];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) f.cells[r * N + c] = plat(h[c]);
      return f;
    },
    cut: { along: 'row', at: 3 },
  },
  // ── 腔与上下层
  {
    key: 'two-decks', group: '腔与上下层', zh: '两层台铺成一片', how: '中间 4×4 全成上下两块：下台 0.90、上台 1.48，台与台之间的空连成一片 0.52 m 高的层',
    build: () => fill(emptyField(N), 2, 2, 5, 5, dual(0.9)), cut: { along: 'row', at: 3 },
  },
  {
    key: 'tunnel', group: '腔与上下层', zh: '一条腔', how: '第 1 行六台上下两块、下台 0.42，两块之间的空接成一条长 5 m 的腔',
    build: () => fill(emptyField(N), 1, 1, 1, 6, dual(LOW)), cut: { along: 'row', at: 1 },
  },
  {
    key: 'sheltered-row', group: '腔与上下层', zh: '一排有顶的台', how: '上墙边一排上下两块（下台 0.90），朝房间那半圈只成下台，背后半圈有顶',
    build: () => fill(emptyField(N), 0, 1, 0, 6, dual(0.9, 1)), cut: { along: 'col', at: 3 },
  },
  // ── 复合
  {
    key: 'tiers-canopy', group: '复合', zh: '看台前一片低顶', how: '靠墙的看台（1.05 / 0.74 / 0.42）前面再停一排 2.25 的低顶',
    build: () => {
      const f = emptyField(N);
      fill(f, 0, 1, 0, 6, plat(WAIST));
      fill(f, 1, 1, 1, 6, plat(TABLE));
      fill(f, 2, 1, 2, 6, plat(LOW));
      fill(f, 3, 1, 4, 6, plat(CANOPY));
      return f;
    },
    cut: { along: 'col', at: 3 },
  },
];
