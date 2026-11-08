/**
 * 首次载入页（2026-11-08，用户「点进网站时先弹出一个加载页，有一点动效，告诉他正在加载，加载完了再进去」，MAPPING §87）。
 *
 * 一块盖住整页的底，只在**这一次整页载入**时出现；站内跳转从不出现（它长在根布局的 HTML 里，客户端跳转不会重新解析）。
 * 规则只有一条：**不让人多等**——它只盖住页面本来就没准备好的那段时间，准备好了立刻退场：
 *
 * - 底色从第一帧就在（首页 = 纸，其余 = 夜色，与将要出现的页面同色，退场时看不出一块布被撤走）；
 *   中间那组方格与读数晚 `APPEAR_MS` 才淡入——快的载入（缓存、好网速）根本看不见它。
 * - 就绪 = 页面登记过的事都做完（首页登记 `home`：打包脚本接管、首屏能显示）+ 字体到了（最多等到 `FONT_CAP_MS`）。
 *   **不等 3D 模型、不等后几屏的图、不等详情页的预载**：那些在进站之后的空闲时间里继续下载（`SitePreload`）。
 * - 一旦露过面，至少停 `MIN_SHOWN_MS` 再退，免得一闪而过；总上限 `HARD_CAP_MS`，脚本出错也不会一直盖着。
 * - 进度条与读数是真的步骤（页面 → 字体 → 脚本），不编百分比。
 *
 * 控制器是一段内联脚本（ES5，不经打包器，放在 <body> 最前面），在打包脚本到达之前就开始计时；
 * 页面通过 `window.__sl` 登记 / 报告就绪 / 等它退场。React 侧只用下面两个函数，没有内联脚本时（单测、`/studio`）立即放行。
 */

export const SITE_LOADER = {
  /** 方格与读数淡入前的等待（ms）：载入快于它就什么也看不见 */
  APPEAR_MS: 280,
  /** 露过面之后至少停多久再退（ms），免得一闪而过 */
  MIN_SHOWN_MS: 600,
  /** 退场淡出（ms） */
  FADE_MS: 450,
  /** 读数还没露面就退：底色淡出（ms） */
  QUICK_FADE_MS: 180,
  /** 字体最多等多久（ms，从脚本开始算）；过了就让字体随后换上，不再拦 */
  FONT_CAP_MS: 3500,
  /** 无论如何到这一刻都退场（ms） */
  HARD_CAP_MS: 15000,
} as const;

/** <html> 上的状态：on = 盖着 · out = 正在退场；退完删掉 */
export const SITE_LOADER_ATTR = 'data-sl';
/** <html> 上的底色：paper | night */
export const SITE_LOADER_THEME_ATTR = 'data-sl-theme';
export const SITE_LOADER_ID = 'site-loader';

/** 浅底页（首页与隐私页），其余是夜色深底页（MAPPING §46） */
export function loaderTheme(pathname: string): 'paper' | 'night' {
  return pathname === '/' || pathname.startsWith('/privacy') ? 'paper' : 'night';
}

/** 不出载入页的路由：编辑后台 */
export function loaderSkips(pathname: string): boolean {
  return pathname.startsWith('/studio');
}

/** 读数的步骤（与内联脚本里的顺序一致） */
export const SITE_LOADER_STEPS = {
  en: { page: 'Loading page', type: 'Loading type', script: 'Loading scripts', done: 'Ready' },
  zh: { page: '载入页面', type: '载入字体', script: '载入脚本', done: '就绪' },
} as const;

/**
 * 退场时机（纯函数，内联脚本里同一套算式）：
 * 读数还没露面（now < 出现时刻）→ 立即退、快速淡出；露过面 → 补足最短停留再退。
 * 时刻都从脚本开始算。
 */
export function exitPlan(now: number): { wait: number; fade: number } {
  const { APPEAR_MS, MIN_SHOWN_MS, FADE_MS, QUICK_FADE_MS } = SITE_LOADER;
  if (now < APPEAR_MS) return { wait: 0, fade: QUICK_FADE_MS };
  return { wait: Math.max(0, APPEAR_MS + MIN_SHOWN_MS - now), fade: FADE_MS };
}

/**
 * 内联控制器（ES5）。暴露 window.__sl：
 * - need(k) / ready(k)：页面登记要等的事、做完了报告（只在 DOMContentLoaded 之前登记才算数）；
 * - then(cb)：退场开始时回调（已经退了就立刻回调）；
 * - done：是否已开始退场。
 */
export function siteLoaderScript(): string {
  const S = SITE_LOADER;
  const steps = JSON.stringify(SITE_LOADER_STEPS);
  return `(function(){var d=document.documentElement,w=window,el=document.getElementById(${JSON.stringify(SITE_LOADER_ID)});
var t0=Date.now(),path=location.pathname,needs={},cbs=[],fonts=false,dcl=false,done=false;
var sl={done:false,need:function(k){if(!dcl&&!done)needs[k]=1;},ready:function(k){if(needs[k]){needs[k]=2;check();}},then:function(cb){if(done)cb();else cbs.push(cb);}};
w.__sl=sl;
if(!el||path.indexOf('/studio')===0){sl.done=done=true;if(el)el.style.display='none';return;}
var lang='en';try{if(localStorage.getItem('site-lang')==='zh')lang='zh';}catch(e){}
var T=${steps}[lang];
d.setAttribute(${JSON.stringify(SITE_LOADER_THEME_ATTR)},(path==='/'||path.indexOf('/privacy')===0)?'paper':'night');
d.setAttribute(${JSON.stringify(SITE_LOADER_ATTR)},'on');
if(lang==='zh'){el.setAttribute('lang','zh');el.setAttribute('aria-label','\\u6b63\\u5728\\u8f7d\\u5165');}
var bar=el.querySelector('[data-sl-bar]'),lbl=el.querySelector('[data-sl-step]');
function pending(){var n=0;for(var k in needs)if(needs[k]===1)n++;return n;}
function paint(){var total=2,got=(dcl?1:0)+(fonts?1:0);for(var k in needs){total++;if(needs[k]===2)got++;}
if(bar)bar.style.transform='scaleX('+(got/total)+')';
if(lbl)lbl.textContent=!dcl?T.page:!fonts?T.type:pending()?T.script:T.done;}
function finish(){if(done)return;sl.done=done=true;paint();var now=Date.now()-t0,wait=0,fade=${S.QUICK_FADE_MS};
if(now>=${S.APPEAR_MS}){wait=Math.max(0,${S.APPEAR_MS + S.MIN_SHOWN_MS}-now);fade=${S.FADE_MS};}
setTimeout(function(){d.style.setProperty('--sl-fade',fade+'ms');d.setAttribute(${JSON.stringify(SITE_LOADER_ATTR)},'out');
var list=cbs;cbs=[];for(var i=0;i<list.length;i++){try{list[i]();}catch(e){setTimeout(function(){throw e;});}}
setTimeout(function(){d.removeAttribute(${JSON.stringify(SITE_LOADER_ATTR)});d.style.removeProperty('--sl-fade');if(!d.getAttribute('style'))d.removeAttribute('style');el.style.display='none';},fade+40);},wait);}
function check(){paint();if(done||!dcl)return;if(!fonts&&Date.now()-t0<${S.FONT_CAP_MS})return;if(pending())return;finish();}
function fontsDone(){if(!fonts){fonts=true;check();}}
try{if(document.fonts&&document.fonts.load)document.fonts.load('400 1em "Archivo Variable"');}catch(e){}
function onDcl(){dcl=true;paint();
var f=document.fonts;if(f&&f.ready){w.requestAnimationFrame(function(){w.requestAnimationFrame(function(){f.ready.then(fontsDone,fontsDone);});});}else fontsDone();
setTimeout(check,Math.max(0,${S.FONT_CAP_MS}-(Date.now()-t0))+10);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',onDcl);else onDcl();
setTimeout(finish,${S.HARD_CAP_MS});
w.addEventListener('pageshow',function(e){if(e.persisted&&!done)finish();});
paint();})();`;
}

type LoaderApi = { done: boolean; need: (k: string) => void; ready: (k: string) => void; then: (cb: () => void) => void };

function api(): LoaderApi | null {
  return typeof window === 'undefined' ? null : ((window as unknown as { __sl?: LoaderApi }).__sl ?? null);
}

/** 载入页开始退场时执行 cb（已经退了 / 根本没有载入页：立即执行）。返回取消函数。 */
export function afterLoader(cb: () => void): () => void {
  const sl = api();
  if (!sl || sl.done) {
    cb();
    return () => {};
  }
  let live = true;
  sl.then(() => {
    if (live) cb();
  });
  return () => {
    live = false;
  };
}

/** 报告页面登记过的一件事做完了（没有载入页时什么也不做） */
export function loaderReady(key: string): void {
  api()?.ready(key);
}

/** 载入页是否已退场（或根本没有） */
export function loaderGone(): boolean {
  const sl = api();
  return !sl || sl.done;
}
