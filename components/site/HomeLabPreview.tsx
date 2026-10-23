'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, type ComponentType } from 'react';
import { labBench } from '../../src/lib/site/lab-index';

type PreviewProps = { active?: boolean; controls?: boolean; onLight?: boolean; lang?: 'en' | 'zh' };
const loading = () => <span className="home-lab-loading">Loading experiment…</span>;
// 只加载当前台架。直接用 /lab 的实现与参数，不在主页另做一套模型。
const LOADERS: Record<string, () => Promise<ComponentType<PreviewProps>>> = {
  '1-1': () => import('../lab/FourBarBench').then(m => m.FourBarBench),
  '1-2': () => import('../lab/ArchBench').then(m => m.ArchBench),
  '1-3': () => import('../lab/TentacleBench').then(m => m.TentacleBench),
  '1-4': () => import('../lab/RingsBench').then(m => m.RingsBench),
  '1-5': () => import('../lab/MachineBench').then(m => m.MachineBench),
  // 同一台整机，驱动换成行为引擎（/lab 上 1-6 就是 <MachineBench behavior />）
  '1-6': () => import('../lab/MachineBench').then(m => function BehaviorPreview(p: PreviewProps) {
    return <m.MachineBench {...p} behavior />;
  }),
  '2-1': () => import('../lab/SkinBench').then(m => m.SkinBench),
  '2-2': () => import('../lab/SkinSolidBench').then(m => m.SkinSolidBench),
  '2-3': () => import('../lab/SkinDualBench').then(m => m.SkinDualBench),
  '2-4': () => import('../lab/SkinSeriesBench').then(m => m.SkinSeriesBench),
  '2-5': () => import('../lab/SkinRingBench').then(m => m.SkinRingBench),
  '2-6': () => import('../lab/SkinLayersBench').then(m => m.SkinLayersBench),
  '2-7': () => import('../lab/SquareRingBench').then(m => m.SquareRingBench),
  '2-8': () => import('../lab/SkinGridBench').then(m => m.SkinGridBench),
  '2-9': () => import('../lab/SkinClusterBench').then(m => m.SkinClusterBench),
  '2-10': () => import('../lab/WalkPlanBench').then(m => m.WalkPlanBench),
  '2-11': () => import('../lab/CrowdPlanBench').then(m => m.CrowdPlanBench),
  '2-12': () => import('../lab/CatPlanBench').then(m => m.CatPlanBench),
  '2-13': () => import('../lab/SkinComboBench').then(m => m.SkinComboBench),
  '2-14': () => import('../lab/CohabitBench').then(m => m.CohabitBench),
  '2-15': () => import('../lab/CohabitSpaceBench').then(m => m.CohabitSpaceBench),
};
const PREVIEWS: Record<string, ComponentType<PreviewProps>> = Object.fromEntries(
  Object.entries(LOADERS).map(([no, load]) => [no, dynamic(load, { loading })]),
);

/** 指针刚碰到目录条目就先拉代码块：等悬停延时到点切换时，新台架多半已能直接出首帧。 */
export function preloadLabPreview(no: string): void {
  LOADERS[no]?.().catch(() => {});
}

export function HomeLabPreview({ no, active }: { no: string; active: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    return () => {
      // 目录切换频繁，旧台架的专属 WebGL context 及时释放，避免挤掉 S0 的舞台。
      // 用捕获的子树（此时可能已从 document 移除），不碰其他台架。
      if (labBench(no).kernel !== '3d') return;
      const canvases = el?.querySelectorAll('canvas');
      queueMicrotask(() => {
        // StrictMode 的试清理 / HMR 后 DOM 仍在场，不能释放刚复用的上下文。
        if (el?.isConnected) return;
        canvases?.forEach(canvas => {
          canvas.getContext('webgl')?.getExtension('WEBGL_lose_context')?.loseContext();
        });
      });
    };
  }, [no]);
  const Bench = PREVIEWS[no];
  return <div ref={host} className="home-lab-preview-host">
    {Bench ? <Bench active={active} controls={false} onLight lang="en" /> : null}
  </div>;
}
