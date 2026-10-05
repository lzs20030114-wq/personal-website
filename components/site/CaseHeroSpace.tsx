'use client';

import { SkinGridBench } from '../lab/SkinGridBench';
import { useCaseLang } from './CaseLang';

/**
 * 案例页主图位的空间活件（项目 II 临时顶替，作者供图后整件删掉）。
 *
 * 选 Lab 2-8（4×4 环阵列）而不是别的几台：项目二讲的是**空间**，而这几台里只有它
 * 带真实尺度——一间 3.7 m 高的房、地上一个 1.7 m 的人、十六片吊在天花下的平台。
 * 正文「空间本体」那节说的「缆长场决定网面形态」，在这里就是每个单元一个收缩
 * 自由度 ℓ；主图先答「这是一个什么尺度的空间装置」，细节交给 /lab。
 *
 * 与项目 01 的 CaseHeroLive 同一套做法：单独一层壳只为把页面的中英切换传给 HUD
 * ——主图在页面上**只能有一份**（放进 `<Pick>` 就成了两份 = 两个 WebGL 上下文）。
 * 控制条不出（`controls={false}`）：主图框（.cs-stage）里只有「在实验室中打开」，
 * 要调编制/形态/半径去 /lab。转场的共享元素是框（.cs-stage），不是台架。
 */
export function CaseHeroSpace() {
  return <SkinGridBench controls={false} lang={useCaseLang()} />;
}
