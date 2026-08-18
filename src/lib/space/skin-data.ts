/**
 * 项目二 · 四种目标形态的键谱（逐字取自 skin_sim_v7_final.py 的 UNITS，顺序即目录顺序）。
 * 键谱是设计对象：同一收缩协议下，键位图决定富余材料扣合成什么。
 * 等长键优先——方形来自「等长约束下富余被拉平」，不要用多级键长堆形态（已验证的教训）。
 */
import type { SkinBond, SkinSpec } from './skin-unit';

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
}

export const SKIN_UNITS: readonly SkinUnitDef[] = [
  {
    key: 'pocket',
    zh: '袋',
    en: 'pocket',
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
    spec: [['g', 58], ['f', 62, fan(30, 8, 26, 2, 0.1)], ['g', 50]],
  },
  {
    key: 'ledge',
    zh: '直挑台',
    en: 'straight ledge',
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
