'use client';

import dynamic from 'next/dynamic';

/** 项目二专属依赖；默认 SSR 保留原首帧，终态仍随实际台架代码加载，点击时不重新请求。 */
export const CaseHero = dynamic(() => import('../CaseHeroSpace').then((m) => m.CaseHeroSpace));
export const CompareChart = dynamic(() => import('./CompareChart').then((m) => m.CompareChart));
export const SkinSolidBench = dynamic(() => import('../../lab/SkinSolidBench').then((m) => m.SkinSolidBench));
export const SkinBench = dynamic(() => import('../../lab/SkinBench').then((m) => m.SkinBench));
export const SkinSeriesBench = dynamic(() => import('../../lab/SkinSeriesBench').then((m) => m.SkinSeriesBench));
export const SquareRingBench = dynamic(() => import('../../lab/SquareRingBench').then((m) => m.SquareRingBench));
