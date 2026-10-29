import type { ComponentProps } from 'react';
import type { SlotLang } from '../slots';
import { ClosureCards, Interference, PartGrid, ResearchQuestion, StatusList, SystemLogic } from './CaseBlocks';
import { AgeingCurve, LayersToggle, LifeCycle, PersonaBench, Predictions, SpecList, StatCompare, LinkageFigure, ArchBench, TentacleBench } from './machine-dynamic';
import { FrameStrip } from './FrameStrip';
import { RingFamily } from './RingFamily';

export { CaseHero } from './machine-dynamic';

/** 项目一 MDX 注册；仅组合已有构件，所有参数与首帧保持不变。 */
export const components = (lang: SlotLang) => ({
  ResearchQuestion: (p: ComponentProps<typeof ResearchQuestion>) => <ResearchQuestion {...p} lang={lang} />,
  PartGrid: () => <PartGrid lang={lang} />,
  ClosureCards: (p: ComponentProps<typeof ClosureCards>) => <ClosureCards {...p} lang={lang} />,
  LifeCycle: (p: ComponentProps<typeof LifeCycle>) => <LifeCycle {...p} lang={lang} />,
  PersonaBench: (p: ComponentProps<typeof PersonaBench>) => <PersonaBench {...p} lang={lang} />,
  LayersToggle: () => <LayersToggle lang={lang} />,
  StatCompare: () => <StatCompare lang={lang} />,
  AgeingCurve: (p: ComponentProps<typeof AgeingCurve>) => <AgeingCurve {...p} lang={lang} />,
  SystemLogic: (p: ComponentProps<typeof SystemLogic>) => <SystemLogic {...p} lang={lang} />,
  Interference: () => <Interference lang={lang} />,
  StatusList: () => <StatusList lang={lang} />,
  Predictions: () => <Predictions lang={lang} />,
  SpecList: () => <SpecList lang={lang} />,
  // 2026-10-29 重构：分镜（台架截图与交接图册的模型渲染）与 N07 五环参数族线稿，两者都是服务端组件
  FrameStrip: (p: ComponentProps<typeof FrameStrip>) => <FrameStrip {...p} lang={lang} />,
  RingFamily: (p: ComponentProps<typeof RingFamily>) => <RingFamily {...p} lang={lang} />,

  LinkageFigure,

  /* ── 项目 01 正文里的求解器活件（2026-09-13 重构指令 §5；2026-10-29 五环 1-4 改成分镜 N22 与线稿 N07，留 1-2、1-3）──
     都是 7 月曲柄方案的求解器，实物 8 月改了驱动——**不重做台架**，按「当时的
     产物」嵌入，图注统一带日期与说明。控制条一律收掉（正文里的图不该带一排按钮），
     要动手去 /lab。
     整机那台**有意不嵌**（用户拍板 2026-09-13）：本页主图位已经在跑 MachineBench，
     正文再放一台就是同一台机器两个 WebGL 上下文，而且两者会抢同一个模块级 handoff
     槽（键名 'machine'，宽限期内两个实例都会去恢复主图的位形）。§6.5 末改为一句话
     指回页顶主图。 */
  ArchFigure: () => <ArchBench controls={false} onLight lang={lang} />,
  TentacleFigure: () => <TentacleBench controls={false} onLight lang={lang} />,
});
