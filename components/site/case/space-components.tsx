import type { ComponentProps } from 'react';
import type { SlotLang } from '../slots';
import { CompareChart, SkinSolidBench, SkinBench, SkinSeriesBench, SquareRingBench } from './space-dynamic';

export { CaseHero } from './space-dynamic';

/** 项目二 MDX 注册；保留现有 HUD、编制、布局和语言参数。 */
export const components = (lang: SlotLang) => ({
  CompareChart: (p: ComponentProps<typeof CompareChart>) => <CompareChart {...p} lang={lang} />,
  // 项目 II 正文里的活件：四种形态的立体带（Lab 2-2）。正文「空间本体」那节说的
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
  // 「方法」那节的滞后 2026-10-06 起搬到痕迹层（痕迹慢褪 + 猫占用钉住，松键已解禁）；
  // 这台只演示成形那一程：同一收缩协议下四张键谱各自扣出一种形态。图注不替它承诺回程。
  // Lab 2-1 是 2D 剖面、画的是 SVG，正文里最轻的一件。
  SkinUnitFigure: () => <SkinBench controls={false} onLight lang={lang} />,
  // 「行为条款与交互矩阵」那节要的是**形态的连续词汇**：十二条带的键谱逐级微变，
  // 从一种形态走到另一种。注意这是两张既有键谱的形态学串联（演示编排）——
  // 行为矩阵 → 键谱的翻译规则由作者手写，模型不代拟，图注也不许说成是它。
  // 开场取**分列**而不是 /lab 的并拢：并拢的默认机位是侧视，十二条带叠在深度上、
  // 前一条挡住后面的，读者又没有控制条可切——正文里必须一眼看见那条渐变。
  SkinArrayFigure: () => (
    <SkinSeriesBench controls={false} onLight lang={lang} plan="gradient" layout={1} />
  ),
  // 「技术实现」那节说的单元化 + 运动学可解：二十条同谱的带绕轴一圈，
  // 只解一条摆二十处，每条带挑出多远就决定了俯视的轮廓。
  SquareRingFigure: () => <SquareRingBench controls={false} onLight lang={lang} />,

});
