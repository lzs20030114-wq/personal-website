// 首屏方块场的台架截图（MAPPING §55.1）：从 /lab 逐台截画框，写到 public/home/field/lab<编号>.webp。
// 不跑也不会出错：没截图的台架在方块场里显示编号，有了截图下次构建自动换成图（MAPPING §55.2）。
//
//   先起生产服务：npm run build && npx next start -p 3100
//   node scripts/home-field/capture.mjs              （只补还没有截图的台架）
//   node scripts/home-field/capture.mjs --all        （全部重截，画面大改后用）
//   node scripts/home-field/capture.mjs 2-5 2-7      （只重截这几台）
//
// 只用 Node 自带的 WebSocket 走 Chrome DevTools 协议，不加依赖。Chrome 路径可用 CHROME 环境变量覆盖。
// 项目二的结构台勾「跳过成形」直接截终态；其余台架等它跑一会儿再截。截图前藏起 HUD 读数。
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE ?? 'http://localhost:3100';
const PORT = 9333;
const OUT = 'public/home/field';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const all = [...readFileSync('src/lib/site/lab-index.ts', 'utf8').matchAll(/no: "(\d-\d+)"/g)].map((m) => m[1]);
const args = process.argv.slice(2);
const nos = args.includes('--all') ? all : args.length ? args : all.filter((no) => !existsSync(join(OUT, `lab${no}.webp`)));
if (!nos.length) {
  console.log('每台台架都已有截图；要全部重截加 --all');
  process.exit(0);
}

const chrome = spawn(
  CHROME,
  ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'field-'))}`, '--window-size=1440,1000', '--hide-scrollbars', '--no-first-run', 'about:blank'],
  { stdio: 'ignore' },
);
try {
  let targets;
  for (let i = 0; i < 50 && !targets; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    } catch {
      await sleep(200);
    }
  }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pend = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (pend.has(m.id)) pend.get(m.id)(m), pend.delete(m.id);
  });
  const send = (method, params = {}) =>
    new Promise((r) => {
      pend.set(++id, r);
      ws.send(JSON.stringify({ id, method, params }));
    }).then((m) => {
      if (m.error) throw new Error(`${method}: ${m.error.message}`);
      return m.result;
    });
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;

  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${BASE}/lab` });
  await sleep(7000);
  await ev(`(()=>{const s=document.createElement('style');s.textContent='.lab-hud{visibility:hidden!important}';document.head.appendChild(s)})()`);

  for (const no of nos) {
    const sel = `document.getElementById('lab${no}')`;
    await ev(`${sel}.scrollIntoView({block:'center'})`);
    await sleep(1500);
    const skipped = await ev(
      `(()=>{const l=[...${sel}.querySelectorAll('label')].find(l=>/跳过成形|skip/i.test(l.textContent));if(!l)return false;const i=l.querySelector('input');if(!i.checked)i.click();return true})()`,
    );
    await sleep(skipped ? 9000 : no.startsWith('2-') ? 18000 : 9000);
    await ev(`${sel}.querySelector('.lab-fig').scrollIntoView({block:'center'})`);
    await sleep(800);
    const r = await ev(`(()=>{const b=${sel}.querySelector('.lab-fig').getBoundingClientRect();return {x:b.x+scrollX,y:b.y+scrollY,w:b.width,h:b.height}})()`);
    const shot = await send('Page.captureScreenshot', { format: 'webp', quality: 82, clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } });
    writeFileSync(join(OUT, `lab${no}.webp`), Buffer.from(shot.data, 'base64'));
    console.log(`lab${no}`, skipped ? 'skip forming' : 'waited', `${Math.round(r.w)}×${Math.round(r.h)}`);
  }
  ws.close();
} finally {
  chrome.kill();
}
