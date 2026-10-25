'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBenchLang } from './LabLanguage';

/**
 * 控制面板的两个公用件（2026-10-25，用户「从控制逻辑的角度重新排列，该不要的不要、该隐去的隐去、
 * 该折叠的折叠，以精简的思路重新设计各个控制面板」）。全站台架的面板按同一个结构排：
 *   第一层「解什么」= 这台演示的对象与场景（编制 / 形态 / 人物 / 空间……），常显；
 *   第二层「怎么看」= 播放（运转 / 重播 / 跳过成形 / 时间倍速），常显；
 *   「更多」折叠 = 显示开关、速度、蒙皮、半径与模型参数滑条，默认收起；
 *   视角 = 底栏，与「− + 归位」在一处（面板里那颗重复的「归位」删掉）。
 * 差分清单里的档位一档不删（2026-09-03「千万不要丢差分的可能性」），只是收进折叠——
 * 折叠用原生 details，收起时控件仍在页面里，深链与守门照旧。
 */

/** 折叠组：默认收起；`label` 省略 = 「更多」 */
export function LabFold({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  const lang = useBenchLang();
  return (
    <details className={`grp lab-fold${className ? ' ' + className : ''}`}>
      <summary>{label ?? (lang === 'zh' ? '更多' : 'More')}</summary>
      <div className="lab-fold__body">{children}</div>
    </details>
  );
}

/**
 * 台架面板底栏里给视角预设留的位置（LabPanel 提供）。
 * undefined = 不在面板里（原地照画）；null = 在面板里、底栏还没挂上（先不画，免得首帧在面板里画一份再跳到底栏）。
 */
export const LabViewDockSlot = createContext<HTMLElement | null | undefined>(undefined);

/**
 * 视角预设：在 /lab 面板里搬到底栏，面板外（没有底栏）原地照画。
 * `off` = 这台此刻不显示（如 2-6 隐藏着的成形视图）——同一面板里两台都往底栏放会重成两排。
 */
export function LabViewDock({ children, off = false }: { children: ReactNode; off?: boolean }) {
  const slot = useContext(LabViewDockSlot);
  if (off || slot === null) return null;
  return slot ? createPortal(children, slot) : <div className="grp">{children}</div>;
}
