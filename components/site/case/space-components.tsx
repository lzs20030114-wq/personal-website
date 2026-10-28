import type { ComponentProps } from 'react';
import type { SlotLang } from '../slots';
import { CompareChart, SkinSolidBench } from './space-dynamic';
import { FrameStrip } from './FrameStrip';

export { CaseHero } from './space-dynamic';

/** 项目二 MDX 注册；保留现有 HUD、编制、布局和语言参数。 */
export const components = (lang: SlotLang) => ({
  CompareChart: (p: ComponentProps<typeof CompareChart>) => <CompareChart {...p} lang={lang} />,
  // 项目 II 正文里的活件：四种形态的立体带（Lab 2-2）。正文「单元的构成与运动」那节说的
  // 「缆长场决定网面形态、四种典型形态」，在引擎里就是每单元一个收缩自由度 ℓ；
  // 控制条收掉（正文里的图不该带一排按钮），要调去 /lab。
  SkinSolidFigure: () => (
    <SkinSolidBench
      controls={false}
      // 正文里的台架是深色仪表，框是稿的深色活件框；onLight 让台架自带深底与深色 token，
      // 不依赖外层是什么底（globals.css 记过 2026-07-27 的裸奔回归）
      onLight
      hud={
        lang === 'en'
          ? {
              kicker: 'Lab 2-2 / Project II',
              title: 'Four morphologies, one protocol',
              sub: 'Four bands · fabric 5 px · the same contraction run',
              hint: 'Each band locks its own bond map. Drive it in /lab',
              aria:
                'Four fabric bands contracting under one protocol; each bond map locks the surplus into a different morphology: pocket, bulb flange, straight ledge, stepped box.',
            }
          : {
              kicker: 'Lab 2-2 / Project II',
              title: '四种形态 · 同一收缩协议',
              sub: '四条带 · 织物厚度 5px · 同一次收缩',
              hint: '每条带按自己的键谱扣合，要动手调去 /lab',
              aria:
                '四条织物带在同一收缩协议下运行，各自的键谱把富余材料扣成不同形态：袋、蘑菇挑台、直挑台、阶梯方箱。',
            }
      }
    />
  ),
  // 分镜条（2026-10-28）：从 /lab 台架截下来的帧排成一行，看大图走页内看图器。
  // 原先正文里的 Lab 2-1 / 2-4 / 2-7 三台活件改成分镜（成形过程一帧一帧看得更清楚，页面也少三个台架）。
  FrameStrip: (p: ComponentProps<typeof FrameStrip>) => <FrameStrip {...p} lang={lang} />,

});
