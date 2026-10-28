// 案例页分镜截图用的浏览器控制（只用 Node 自带的 WebSocket 走 Chrome DevTools 协议，不加依赖；
// 做法同 scripts/home-field/capture.mjs）。比那份多一件：**假时钟**。
//
// 台架全部由 requestAnimationFrame + performance.now() 推进（components/lab/useBenchLoop.ts）。
// 页面一加载就把两者换掉：rAF 只排队、不自己跑，performance.now() 只在 frame(dt) 时前进。
// 于是「第几帧」完全由脚本决定，同一个种子、同一串 frame() 调用，截出来的画面每次相同——
// 软件 GL 跑得慢只影响截图花多久，不影响截到的是哪一刻。Math.random 也换成带种子的
// （2-15 每一场随机发穿着与花色，不换的话两次截图里的人不是同一批）。
//
// 快进时可以把 WebGL 的 draw / clear 改空操作（noDraw），中间帧不画，只在要截的那一帧画
// （MAPPING §76 截主页封面时的做法）。仿真照常按帧推进，只是不出图。
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 注入到每个页面最前面的脚本：假时钟 + 带种子的随机数 + 可关的 WebGL 绘制 */
const FAKE_CLOCK = `(() => {
  let t = 1000;
  let id = 0;
  const q = new Map();
  performance.now = () => t;
  window.requestAnimationFrame = (cb) => { q.set(++id, cb); return id; };
  window.cancelAnimationFrame = (i) => { q.delete(i); };
  let seed = 20261028;
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const cap = {
    noDraw: false,
    frames: 0,
    frame(dt = 1000 / 60) {
      t += dt;
      cap.frames++;
      const cbs = [...q.values()];
      q.clear();
      for (const cb of cbs) { try { cb(t); } catch (e) { console.error(e); } }
    },
    run(n, dt) { for (let i = 0; i < n; i++) cap.frame(dt); },
  };
  window.__cap = cap;
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    for (const m of ['drawArrays', 'drawElements', 'clear']) {
      const f = C.prototype[m];
      C.prototype[m] = function (...a) { if (cap.noDraw) return; return f.apply(this, a); };
    }
  }
})();`;

export async function openBrowser({ chrome, width = 1440, height = 1000, scale = 2, fakeClock = true, args = [] } = {}) {
  const bin = chrome ?? process.env.CHROME ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
  const port = 9300 + Math.floor(Math.random() * 400);
  const proc = spawn(
    bin,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${mkdtempSync(join(tmpdir(), 'case-frames-'))}`,
      `--window-size=${width},${height}`,
      '--hide-scrollbars',
      '--no-first-run',
      '--no-sandbox',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      ...args,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let targets;
  for (let i = 0; i < 80 && !targets; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    } catch {
      await sleep(250);
    }
  }
  if (!targets) throw new Error('Chrome 没有起来');
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pend = new Map();
  const logs = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      pend.get(m.id)(m);
      pend.delete(m.id);
    } else if (m.method === 'Runtime.exceptionThrown') {
      logs.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text);
    }
  });
  const send = (method, params = {}) =>
    new Promise((r) => {
      pend.set(++id, r);
      ws.send(JSON.stringify({ id, method, params }));
    }).then((m) => {
      if (m.error) throw new Error(`${method}: ${m.error.message}`);
      return m.result;
    });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
  if (fakeClock) await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_CLOCK });

  return {
    send,
    ev,
    logs,
    sleep,
    async goto(url, settle = 6000) {
      await send('Page.navigate', { url });
      await sleep(settle);
    },
    /** 推 n 帧（每帧 dt 毫秒）；分批推，免得一次 evaluate 太久 */
    async frames(n, dt = 1000 / 60, batch = 30) {
      for (let done = 0; done < n; done += batch) await ev(`window.__cap.run(${Math.min(batch, n - done)}, ${dt})`);
      await sleep(30); // 让 React 把这几帧里的 setState 提交掉（HUD 读数）
    },
    async noDraw(on) {
      await ev(`window.__cap.noDraw = ${on ? 'true' : 'false'}`);
    },
    /** 截一个元素（页面坐标），返回 webp/png 的 Buffer */
    async shot(selectorExpr, { format = 'png', pad = 0 } = {}) {
      const r = await ev(
        `(()=>{const el=${selectorExpr};if(!el)return null;const b=el.getBoundingClientRect();return {x:b.x+scrollX,y:b.y+scrollY,w:b.width,h:b.height}})()`,
      );
      if (!r) throw new Error(`找不到元素 ${selectorExpr}`);
      const shot = await send('Page.captureScreenshot', {
        format,
        captureBeyondViewport: true,
        clip: { x: r.x - pad, y: r.y - pad, width: r.w + 2 * pad, height: r.h + 2 * pad, scale: 1 },
      });
      return Buffer.from(shot.data, 'base64');
    },
    close() {
      ws.close();
      proc.kill();
    },
  };
}
