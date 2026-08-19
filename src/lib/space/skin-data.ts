/**
 * 项目二 · 四种目标形态的键谱（逐字取自 skin_sim_v7_final.py 的 UNITS，顺序即目录顺序）。
 * 键谱是设计对象：同一收缩协议下，键位图决定富余材料扣合成什么。
 * 等长键优先——方形来自「等长约束下富余被拉平」，不要用多级键长堆形态（已验证的教训）。
 */
import { SKIN_ROOT_FIX, type SkinBond, type SkinSpec, type SkinUnitOpts } from './skin-unit';

function fan(center: number, kFrom: number, kTo: number, kStep: number, rb: number): SkinBond[] {
  const out: SkinBond[] = [];
  for (let k = kFrom; k < kTo; k += kStep) out.push([center - k, center + k, rb]);
  return out;
}

export interface SkinUnitDef {
  key: string;
  /** 目录题名（中 · 英，照 v7 原文） */
  zh: string;
  en: string;
  spec: SkinSpec;
  /**
   * 站上展示的收缩终点（省略 = 全深 SKIN.R1）。系统本就是每单元一个收缩自由度 ℓ；
   * 用户 2026-08-18 拍板：袋收缩到原协议 step≈400 的程度（r=0.66）最好——
   * 再深下去 42 节的富余会把圆鼓形压成下垂的梨形。
   */
  r1?: number;
  /**
   * 渲染平滑 [w, passes]（省略 = v7 默认 3,1）。锁定微皱交接件明令「由渲染平滑
   * 覆盖」（暂缓物理级根除）；蘑菇/直挑台的梯身鳞状微皱在台架尺度读作锯齿
   * （用户 2026-08-18 指出），这两台加强到 5,2——绘图专用，物理数据不动。
   */
  smooth?: readonly [number, number];
}

/** 台架实际使用的引擎选项（根部贴轴修正 + 每单元收缩终点）——测试与台架共用同一份 */
export function skinSiteOpts(def: SkinUnitDef): SkinUnitOpts {
  return def.r1 === undefined ? SKIN_ROOT_FIX : { ...SKIN_ROOT_FIX, r1: def.r1 };
}

export const SKIN_UNITS: readonly SkinUnitDef[] = [
  {
    key: 'pocket',
    zh: '袋',
    en: 'pocket',
    r1: 0.66,
    spec: [
      ['g', 50],
      [
        'f',
        42,
        [
          [4, 38, 0.3],
          [7, 35, 0.3],
        ],
      ],
      ['g', 58],
    ],
  },
  {
    key: 'bulb',
    zh: '蘑菇挑台',
    en: 'bulb flange',
    smooth: [5, 2],
    spec: [['g', 58], ['f', 62, fan(30, 8, 26, 2, 0.1)], ['g', 50]],
  },
  {
    key: 'ledge',
    zh: '直挑台',
    en: 'straight ledge',
    smooth: [5, 2],
    spec: [['g', 58], ['f', 58, fan(29, 4, 25, 2, 0.09)], ['g', 50]],
  },
  {
    key: 'stepped',
    zh: '阶梯挑台',
    en: 'stepped ledge',
    // 等长键方箱: 端面弧长=键长 -> 必然拉直
    spec: [['g', 50], ['f', 66, fan(33, 6, 27, 2, 0.24), [[27, 39]]], ['g', 50]],
  },
];

/** v7 目录题名 → 参考 JSON 的 key（dump 脚本按 Python 原名存） */
export const SKIN_REF_NAMES: Record<string, string> = {
  pocket: '袋 · pocket',
  bulb: '蘑菇挑台 · bulb flange',
  ledge: '直挑台 · straight ledge',
  stepped: '阶梯挑台 · stepped ledge',
};
