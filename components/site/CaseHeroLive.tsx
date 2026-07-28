'use client';

import { RingsBench } from '../lab/RingsBench';
import { useCaseLang } from './CaseLang';

/**
 * 案例页主图位的五环活件（项目 01 临时顶替，作者供图后整件删掉）。
 *
 * 单独一层壳只为一件事：HUD 语言要跟页面的中英切换走，而主图在页面上**只能有一份**
 * ——放进 `<Pick>` 就成了两份，等于两个 WebGL 上下文和两份逐帧渲染。所以这里读语言
 * 上下文再往下传 prop，活件本身照旧只挂一次。
 */
export function CaseHeroLive() {
  return <RingsBench sideControls ptTarget lang={useCaseLang()} />;
}
