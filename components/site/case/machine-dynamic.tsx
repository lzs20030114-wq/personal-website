'use client';

import dynamic from 'next/dynamic';

/**
 * 项目一的真实客户端加载边界。保留默认 SSR，首帧仍由原组件生成，不加 loading 画面。
 * 只把服务器组件注册表拆文件不足以隔离 Next 的 route client manifest，因此动态导入放在这里。
 */
export const CaseHero = dynamic(() => import('../CaseHeroLive').then((m) => m.CaseHeroLive));
export const AgeingCurve = dynamic(() => import('./AgeingCurve').then((m) => m.AgeingCurve));
export const LayersToggle = dynamic(() => import('./LayersToggle').then((m) => m.LayersToggle));
export const LifeCycle = dynamic(() => import('./LifeCycle').then((m) => m.LifeCycle));
export const PersonaBench = dynamic(() => import('./PersonaBench').then((m) => m.PersonaBench));
export const Predictions = dynamic(() => import('./Predictions').then((m) => m.Predictions));
export const SpecList = dynamic(() => import('./SpecList').then((m) => m.SpecList));
export const StatCompare = dynamic(() => import('./StatCompare').then((m) => m.StatCompare));
export const LinkageFigure = dynamic(() => import('../../linkage/LinkageFigure').then((m) => m.LinkageFigure));
export const ArchBench = dynamic(() => import('../../lab/ArchBench').then((m) => m.ArchBench));
export const RingsBench = dynamic(() => import('../../lab/RingsBench').then((m) => m.RingsBench));
export const TentacleBench = dynamic(() => import('../../lab/TentacleBench').then((m) => m.TentacleBench));
