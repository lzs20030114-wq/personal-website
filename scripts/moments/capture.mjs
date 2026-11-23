// 决定性瞬间的线稿 · 第一步：把 Lab 2-16 小样在某一秒画的立体几何原样取出来（世界坐标的三角形 + 每次绘制的颜色）。
//
//   先起生产服务：npm run build && npx next start -p 3100
//   node scripts/moments/capture.mjs <输出目录> <小样键> <秒> [秒 …]
//
// 假时钟与快进沿用 scripts/case-frames/cdp.mjs；几何由 gl-record.js 在 WebGL 这一层抄下来，站上代码不改。
// 每个时刻写两个文件：<键>-<秒>.bin（Float32，三角形顶点连在一起）与 <键>-<秒>.json（每次绘制的三角形数、平移、颜色 + 这一刻的说明）。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser } from '../case-frames/cdp.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const [out, key, ...times] = process.argv.slice(2);
if (!out || !key || !times.length) throw new Error('用法：capture.mjs <输出目录> <小样键> <秒> [秒 …]');
const FPS = 60;
mkdirSync(out, { recursive: true });
const here = dirname(fileURLToPath(import.meta.url));

const b = await openBrowser({ width: 1440, height: 1500, scale: 1 });
try {
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: readFileSync(join(here, 'gl-record.js'), 'utf8') });
  await b.goto('about:blank', 300);
  await b.goto(`${BASE}/lab#lab2-16-${key}`, 8000);
  const el = `document.getElementById('lab2-16')`;
  await b.ev(`${el}.scrollIntoView({block:'center'})`);
  const hudText = () => b.ev(`${el}.querySelector('.lab-hud.br')?.innerText ?? ''`);
  for (let i = 0; i < 400; i++) {
    await b.frames(2);
    if (/\/ \d+ s/i.test(await hudText())) break;
    await b.sleep(250);
  }
  await b.ev(`(()=>{const x=[...${el}.querySelectorAll('button')].find(x=>x.textContent.trim()==='×1');x&&x.click()})()`);
  await b.frames(1);
  const hudT = async () => Number((await hudText()).match(/(\d+) \//)?.[1] ?? 0);
  const dur = Number((await hudText()).match(/\/ (\d+)/)?.[1] ?? 60);
  for (const at of times.map(Number)) {
    const now = await hudT();
    const n = Math.max(0, Math.round(((((at - now - 0.5) % dur) + dur) % dur) * FPS));
    await b.noDraw(true);
    await b.frames(n, 1000 / FPS, 120);
    await b.noDraw(false);
    await b.ev(`(window.__rec.calls = [], window.__rec.on = true)`);
    await b.frames(1);
    await b.ev(`window.__rec.on = false`);
    const hud = (await hudText()).replace(/\n/g, ' · ');
    const dump = await b.ev(`window.__recDump(${el})`);
    const f = join(out, `${key}-${String(at).padStart(2, '0')}`);
    writeFileSync(`${f}.bin`, Buffer.from(dump.b64, 'base64'));
    writeFileSync(`${f}.json`, JSON.stringify({ key, at, hud, calls: dump.meta }));
    console.log(f, '|', dump.meta.length, '次绘制', dump.meta.reduce((s, c) => s + c.n, 0), '个三角形 |', hud);
  }
  if (b.logs.length) console.log('page errors:', b.logs);
} finally {
  b.close();
}
