'use client';

import { CohabitSpaceBench } from '../lab/CohabitSpaceBench';
import { useCaseLang } from './CaseLang';

/**
 * 案例页主图位的空间活件（项目 II 临时顶替，作者供图后整件删掉）。
 *
 * 2026-10-21 起换成 Lab 2-15（人猫同台的立体演示）：此前是 Lab 2-8（4×4 环阵列，只有房间和一个人），
 * 主图先答「这是个什么尺度的空间装置」；现在主图直接答项目的问题——单元按人猫的行为落下收回，
 * 猫被引到坐着的人面前，挡路的带各自收回。同一台台架也挂在 /lab 和主页预览上。
 *
 * 与项目 01 的 CaseHeroLive 同一套做法：单独一层壳只为把页面的中英切换传给 HUD
 * ——主图在页面上**只能有一份**（放进 `<Pick>` 就成了两份 = 两个 WebGL 上下文）。
 * 控制条不出（`controls={false}`）：主图框（.cs-stage）里只有「在实验室中打开」，
 * 要切空间三档、换视角去 /lab。转场的共享元素是框（.cs-stage），不是台架。
 */
export function CaseHeroSpace() {
  return <CohabitSpaceBench controls={false} lang={useCaseLang()} />;
}
