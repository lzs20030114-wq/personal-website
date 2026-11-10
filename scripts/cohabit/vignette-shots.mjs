// Lab 2-16 小样的检查截图（2026-11-09）：每个小样按脚本推到几个时刻，各截一张台架画面。
// 假时钟（scripts/case-frames/cdp.mjs）：第几帧由脚本决定，快进时 WebGL 不画，只在要截的那一刻画。
//
//   先起生产服务：npm run build && npx next start -p 3100
//   node scripts/cohabit/vignette-shots.mjs <输出目录> [小样键…]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser } from '../case-frames/cdp.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const out = process.argv[2] ?? 'vignette-shots';
const only = process.argv.slice(3);
/** 每个小样截哪几秒（脚本时间）与哪个视角 */
const PLAN = {
  tea: [[1, 'axon'], [7, 'axon'], [12, 'axon'], [22, 'axon'], [22, 'front'], [22, 'side']],
  cavity: [[1, 'axon'], [16, 'axon'], [26, 'axon'], [26, 'front']],
  giveway: [[1, 'axon'], [5, 'axon'], [10, 'axon'], [10, 'top'], [16, 'axon']],
  guide: [[1, 'axon'], [17, 'axon'], [28, 'axon'], [44, 'axon'], [44, 'top'], [60, 'axon']],
  ramp: [[16, 'axon'], [16, 'front'], [21, 'axon'], [30, 'axon']],
  counter: [[6, 'axon'], [11, 'axon'], [22, 'axon'], [22, 'front']],
  step: [[18, 'axon'], [21, 'axon'], [28, 'axon']],
};
const FPS = 60;
mkdirSync(out, { recursive: true });

const b = await openBrowser({ width: 1440, height: 1100, scale: 1 });
try {
  for (const [key, shots] of Object.entries(PLAN)) {
    if (only.length && !only.includes(key)) continue;
    await b.goto('about:blank', 300);
    await b.goto(`${BASE}/lab#lab2-16-${key}`, 8000);
    const el = `document.getElementById('lab2-16')`;
    await b.ev(`${el}.scrollIntoView({block:'center'})`);
    // 等两组轨迹烘完（后台线程，真实时间；主循环由假时钟推，这里一边推一边等）
    for (let i = 0; i < 400; i++) {
      await b.frames(2);
      const txt = await b.ev(`${el}.querySelector('.lab-hud.br')?.innerText ?? ''`);
      if (/\/ \d+ s/i.test(txt)) break;
      await b.sleep(250);
    }
    // 台架开场默认 ×4（2026-11-10）；下面按 ×1 换算帧数，先切回 ×1
    const slow = await b.ev(`(()=>{const x=[...${el}.querySelectorAll('button')].find(x=>x.textContent.trim()==='×1');x&&x.click();return !!x})()`);
    if (!slow) console.log('  (没找到 ×1 按钮，截到的时刻会偏)');
    await b.frames(1);
    // 脚本时间从台架 HUD 读（烘轨迹时主循环已经在推帧，开演那一刻不是 0）；要截的时刻已经过了就跳到下一轮
    const hudText = () => b.ev(`${el}.querySelector('.lab-hud.br')?.innerText ?? ''`);
    const hudT = async () => Number((await hudText()).match(/(\d+) \//)?.[1] ?? 0);
    const dur = Number((await hudText()).match(/\/ (\d+)/)?.[1] ?? 60);
    for (const [at, view] of shots) {
      const now = await hudT();
      const n = Math.max(0, Math.round((((at - now - 0.5) % dur) + dur) % dur * FPS));
      await b.noDraw(true);
      await b.frames(n, 1000 / FPS, 120);
      await b.noDraw(false);
      // 切视角：点底栏的视角按钮，再推几帧让镜头过渡走完（过渡期间脚本时间也在走，记下来）
      const labels = { axon: ['轴测', 'Axon'], front: ['正', 'Front'], side: ['侧', 'Side'], top: ['顶', 'Top'] }[view];
      const hit = await b.ev(`(()=>{const bs=[...${el}.querySelectorAll('button')].filter(x=>${JSON.stringify(labels)}.includes(x.textContent.trim()));bs[0]&&bs[0].click();return bs.length})()`);
      if (!hit) console.log('  (没找到视角按钮)', view);
      await b.frames(1);
      const png = await b.shot(`${el}.querySelector('canvas')`);
      const hud = await b.ev(`${el}.querySelector('.lab-hud.br')?.innerText ?? ''`);
      const f = join(out, `${key}-${String(at).padStart(2, '0')}-${view}.png`);
      writeFileSync(f, png);
      console.log(f, '|', hud.replace(/\n/g, ' · '));
    }
  }
  if (b.logs.length) console.log('page errors:', b.logs);
} finally {
  b.close();
}
