'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, type ComponentType } from 'react';
import { labBench } from '../../src/lib/site/lab-index';

type PreviewProps = { active?: boolean; controls?: boolean; onLight?: boolean; lang?: 'en' | 'zh' };
const loading = () => <span className="home-lab-loading">Loading experiment…</span>;
// 只加载当前台架。直接用 /lab 的实现与参数，不在主页另做一套模型。
const PREVIEWS: Record<string, ComponentType<PreviewProps>> = {
  '1-1': dynamic(() => import('../lab/FourBarBench').then(m => m.FourBarBench), { loading }),
  '1-2': dynamic(() => import('../lab/ArchBench').then(m => m.ArchBench), { loading }),
  '1-3': dynamic(() => import('../lab/TentacleBench').then(m => m.TentacleBench), { loading }),
  '1-4': dynamic(() => import('../lab/RingsBench').then(m => m.RingsBench), { loading }),
  '1-5': dynamic(() => import('../lab/MachineBench').then(m => m.MachineBench), { loading }),
  '2-1': dynamic(() => import('../lab/SkinBench').then(m => m.SkinBench), { loading }),
  '2-2': dynamic(() => import('../lab/SkinSolidBench').then(m => m.SkinSolidBench), { loading }),
  '2-3': dynamic(() => import('../lab/SkinDualBench').then(m => m.SkinDualBench), { loading }),
  '2-4': dynamic(() => import('../lab/SkinSeriesBench').then(m => m.SkinSeriesBench), { loading }),
  '2-5': dynamic(() => import('../lab/SkinRingBench').then(m => m.SkinRingBench), { loading }),
  '2-6': dynamic(() => import('../lab/SkinLayersBench').then(m => m.SkinLayersBench), { loading }),
  '2-7': dynamic(() => import('../lab/SquareRingBench').then(m => m.SquareRingBench), { loading }),
  '2-8': dynamic(() => import('../lab/SkinGridBench').then(m => m.SkinGridBench), { loading }),
  '2-9': dynamic(() => import('../lab/SkinClusterBench').then(m => m.SkinClusterBench), { loading }),
  '2-10': dynamic(() => import('../lab/WalkPlanBench').then(m => m.WalkPlanBench), { loading }),
  '2-11': dynamic(() => import('../lab/CrowdPlanBench').then(m => m.CrowdPlanBench), { loading }),
  '2-12': dynamic(() => import('../lab/CatPlanBench').then(m => m.CatPlanBench), { loading }),
  '2-13': dynamic(() => import('../lab/SkinComboBench').then(m => m.SkinComboBench), { loading }),
};

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
