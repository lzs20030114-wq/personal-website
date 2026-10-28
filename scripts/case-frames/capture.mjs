// 项目二案例页的分镜截图（MAPPING §78）：从 /lab 的台架按协议步数或仿真时间截帧，
// 写成 public/work/project-ii/frames/<组>/<帧>.webp（原图）与 <帧>-s.webp（缩略图）。
// 帧数据（读数、说明、尺寸）在 src/lib/site/case-frames.ts，改了截图要同步改那里（守门会卡尺寸）。
//
//   先起生产服务：npm run build && npx next start -p 3100
//   node scripts/case-frames/capture.mjs                 （全部重截）
//   node scripts/case-frames/capture.mjs ring-forming    （只截这几组）
//
// 假时钟见 cdp.mjs：每一帧由脚本推进，同一份脚本每次截到同一组画面。软件 GL 下 2-15 一组要十来分钟。
// 截图前藏起 HUD（读数写在格子下面，不留在图里）；台架自带的英文标签按组裁掉，免得中文页上出现英文图字。
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { openBrowser } from './cdp.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const OUT = 'public/work/project-ii/frames';
const HIDE_HUD = `.lab-hud{visibility:hidden!important}`;

/** 一帧 = 一张 PNG（设备像素）→ 裁切 → webp 原图 + 缩略图 */
async function save(set, file, png, { crop, width, thumb }) {
  const dir = join(OUT, set);
  mkdirSync(dir, { recursive: true });
  let img = sharp(png);
  const meta = await img.metadata();
  if (crop) {
    const [x0, y0, x1, y1] = crop;
    img = img.extract({
      left: Math.round(meta.width * x0),
      top: Math.round(meta.height * y0),
      width: Math.round(meta.width * (x1 - x0)),
      height: Math.round(meta.height * (y1 - y0)),
    });
  }
  const buf = await img.png().toBuffer();
  const full = width ? sharp(buf).resize({ width }) : sharp(buf);
  await full.webp({ quality: 84 }).toFile(join(dir, `${file}.webp`));
  // 缩略图不比原图宽（宽图一张占满正文列时，原图本身就够用）
  const tw = Math.min(thumb, (await sharp(buf).metadata()).width);
  await sharp(buf).resize({ width: tw }).webp({ quality: 80 }).toFile(join(dir, `${file}-s.webp`));
  const m = await sharp(join(dir, `${file}.webp`)).metadata();
  console.log(`  ${set}/${file}  ${m.width}×${m.height}`);
}

/** 打开 /lab#lab<hash>，藏 HUD，滚到台架，按顺序点按钮 */
async function openBench(b, no, hash, clicks = []) {
  await b.goto(`${BASE}/lab#lab${hash ?? no}`, 9000);
  await b.ev(`(()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(HIDE_HUD)};document.head.appendChild(s)})()`);
  const sel = `document.getElementById('lab${no}')`;
  // 别的台架一律藏起来：它们一看不见，IntersectionObserver 就把各自的循环停了（不藏的话 2-14 旁边的 2-15 每帧都在算，
  // 一组要截半小时）。各台互不依赖，藏不藏不影响截到的画面
  await b.ev(`document.querySelectorAll('[id^="lab"]').forEach(el=>{if(/^lab\\d-\\d+$/.test(el.id)&&el.id!=='lab${no}')el.style.display='none'})`);
  await b.sleep(300);
  await b.ev(`${sel}.querySelector('.lab-fig').scrollIntoView({block:'center'})`);
  await b.sleep(800); // 只等布局与 IntersectionObserver，不推帧：步 0 那一帧要截台架挂载时的初始摆位
  for (const c of clicks) {
    const ok = await b.ev(
      `(()=>{const x=[...${sel}.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(c)});if(!x)return false;x.click();return true})()`,
    );
    if (!ok) throw new Error(`lab${no} 找不到按钮「${c}」`);
    await b.frames(2, 0.001); // 让 React 提交这次点击；每帧只给 1 ms，台架几乎不前进（步 0 仍是步 0）
  }
  return sel;
}

/** 点「+」zc 次放大，再右键拖把画框里 (fx, fy)（.lab-fig 内的 CSS 坐标）挪到画布中心。
 *  相机的平移量直接加的是指针的 clientX 差（逻辑像素，画布逻辑尺寸 700×520），缩放以画布中心为不动点。 */
async function zoomTo(b, sel, fx, fy, zc, dt) {
  const r = await b.ev(
    `(()=>{const f=${sel}.querySelector('.lab-fig').getBoundingClientRect();const c=${sel}.querySelector('canvas').getBoundingClientRect();return {fx:f.x,fy:f.y,cx:c.x,cy:c.y,cw:c.width,ch:c.height}})()`,
  );
  const Z = Math.pow(Math.exp(150 * 0.0012), zc);
  const lx = ((r.fx + fx - r.cx) * 700) / r.cw;
  const ly = ((r.fy + fy - r.cy) * 520) / r.ch;
  const px = -(lx - 350) * Z;
  const py = -(ly - 260) * Z;
  for (let i = 0; i < zc; i++) {
    await b.ev(`[...${sel}.querySelectorAll('button')].find(x=>x.textContent.trim()==='+').click()`);
    await b.frames(1, dt);
  }
  const sx = r.cx + r.cw / 2;
  const sy = r.cy + r.ch / 2;
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sx, y: sy });
  await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sx, y: sy, button: 'right', buttons: 2, clickCount: 1 });
  for (let k = 1; k <= 10; k++)
    await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sx + (px * k) / 10, y: sy + (py * k) / 10, button: 'right', buttons: 2 });
  await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sx + px, y: sy + py, button: 'right', buttons: 0, clickCount: 1 });
  await b.frames(20, dt);
}

/** 结构台：读 HUD 的「步 N/1500」 */
const readStep = (b, sel) =>
  b.ev(`(()=>{const t=${sel}.querySelector('.lab-hud.br')?.textContent??'';const m=t.match(/(\\d+)\\s*\\/\\s*1500/);return m?Number(m[1]):-1})()`);
/** 2-14 / 2-15：读 HUD 的「t M:SS」 */
const readTime = (b, sel) =>
  b.ev(
    `(()=>{const t=[...${sel}.querySelectorAll('.lab-hud')].map(h=>h.textContent).join(' ');const m=t.match(/t (\\d+):(\\d\\d)/);return m?Number(m[1])*60+Number(m[2]):-1})()`,
  );

/** 2-15 先在后台把三条带的轨迹烘完（HUD 从「baking …%」变成「t 0:00」）才开始跑仿真 */
async function waitBake(b, sel) {
  // 等的时候每帧只给 1 ms：轨迹烘完那一帧仿真就开跑，不让它先吃掉一个 16 ms 的步
  for (let i = 0; i < 120; i++) {
    await b.frames(1, 0.001);
    if ((await readTime(b, sel)) >= 0) return;
    await b.sleep(500);
  }
  throw new Error('2-15 轨迹没烘完');
}

/** 推到读数 ≥ target。快进时一律不画 WebGL（同页邻近的 3D 台架也在跑，软件 GL 下画一帧要几百毫秒）；
 *  webgl 台到点后再画一帧（读数因此可能再走一两步，记的是截图前那一刻），SVG 台不用补画 */
async function advanceTo(b, read, target, { webgl, frames = 6, dt } = {}) {
  let v = await read();
  if (v < target) {
    await b.noDraw(true);
    for (let g = 0; v >= 0 && v < target && g < 8000; g++) {
      // 离目标近了改一帧一帧推，读数最多越过一两步
      await b.frames(target - v > 3 * frames * 2 ? frames : 1, dt);
      v = await read();
    }
    await b.noDraw(false);
  }
  if (webgl) await b.frames(1, 0.001);
  if (v < target) throw new Error(`没推到 ${target}（停在 ${v}）`);
  console.log(`  读数 ${v}（目标 ${target}）`);
  return v;
}

/** 2-15 的仿真时钟：轨迹烘完之后，每帧（dt 50 ms）推进 0.05 s，按帧数算到指定时刻；快进时不画，到点画一帧 */
function simClock(b) {
  let t = 0;
  return {
    async to(T) {
      const n = Math.round((T - t) / 0.05);
      await b.noDraw(true);
      if (n > 0) await b.frames(n, 50, 60);
      await b.noDraw(false);
      t += Math.max(0, n) * 0.05;
      await b.frames(1, 0.001);
      console.log(`  仿真 ${t.toFixed(2)} s`);
      return t;
    },
  };
}

// ─── 各组 ────────────────────────────────────────────────────────────────────
const SETS = {
  // FIG.03 · Lab 2-1：四张键谱同一次收缩（SVG）。底下一行英文名裁掉
  'strip-forming': async (b) => {
    const sel = await openBench(b, '2-1');
    for (const s of [0, 200, 400, 700, 800, 1500]) {
      await advanceTo(b, () => readStep(b, sel), s);
      await save('strip-forming', `s${String(s).padStart(4, '0')}`, await b.shot(`${sel}.querySelector('.lab-fig')`), {
        crop: [0, 0, 1, 0.86],
        thumb: 720,
      });
    }
  },
  // FIG.07 · Lab 2-5：整环同形 · 阶梯方箱，轴测。环在画面正中，左右各裁掉一截空白
  'ring-forming': async (b) => {
    const sel = await openBench(b, '2-5', '2-5-single', ['stepped ledge']);
    for (const s of [0, 300, 450, 550, 650, 1500]) {
      await advanceTo(b, () => readStep(b, sel), s, { webgl: true });
      await save('ring-forming', `s${String(s).padStart(4, '0')}`, await b.shot(`${sel}.querySelector('.lab-fig')`), {
        crop: [0.3, 0.12, 0.7, 0.96],
        thumb: 400,
      });
    }
  },
  // FIG.05 · Lab 2-4 目录渐变：分列 + 正视 + 放大一档，终态一张（十二条带的剖面并排）
  'series-gradient': async (b) => {
    const sel = await openBench(b, '2-4', '2-4-gradient', ['Spread', 'Front', '+']);
    await advanceTo(b, () => readStep(b, sel), 1500, { webgl: true });
    await save('series-gradient', 's1500', await b.shot(`${sel}.querySelector('.lab-fig')`), { crop: [0, 0.34, 1, 0.78], thumb: 1100 });
  },
  // FIG.06 · Lab 2-4 捏分：分列 + 正视（不放大，十条带都在画内），六个时刻
  'series-split': async (b) => {
    const sel = await openBench(b, '2-4', '2-4-split', ['Spread', 'Front']);
    for (const s of [200, 400, 500, 600, 700, 1500]) {
      await advanceTo(b, () => readStep(b, sel), s, { webgl: true });
      await save('series-split', `s${String(s).padStart(4, '0')}`, await b.shot(`${sel}.querySelector('.lab-fig')`), {
        crop: [0, 0.27, 1, 0.69], // 成形时整组往下走：上沿取步 200 的顶、下沿取终态的底
        thumb: 720,
      });
    }
  },
  // FIG.08 · Lab 2-7 整环平：五种轮廓，顶视（高角度斜俯视）+ 放大三档对准平台，每种跑到终态
  'round-to-square': async (b) => {
    const sel = await openBench(b, '2-7', '2-7-flat', ['Top']);
    await b.frames(40);
    await zoomTo(b, sel, 390, 367, 3);
    for (const [i, lb] of ['Circle', 'Soft square', 'Half square', 'Near square', 'Square'].entries()) {
      await b.ev(`[...${sel}.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(lb)}).click()`);
      await b.frames(3);
      await advanceTo(b, () => readStep(b, sel), 1500, { webgl: true });
      await save('round-to-square', `o${i + 1}`, await b.shot(`${sel}.querySelector('.lab-fig')`), { crop: [0.28, 0.02, 0.72, 0.8], thumb: 400 });
    }
  },
  // FIG.02 · Lab 2-14 默认场景（1 位访客 1 只猫，「走 · 站 · 坐」规则，8×8 方台铺满）：坐下后猫被一步一步引过来。
  // 仿真按帧推（每帧 50 ms），从挂载起就用同一个步长，所以每次截到同一场
  'plan-sit': async (b) => {
    const sel = await openBench(b, '2-14');
    for (const t of [0, 16, 60, 160, 200, 220, 240, 270]) {
      await advanceTo(b, () => readTime(b, sel), t, { frames: 10, dt: 50 });
      await save('plan-sit', `t${String(t).padStart(3, '0')}`, await b.shot(`${sel}.querySelector('.lab-fig')`), {
        crop: [0.08, 0.14, 0.92, 0.7],
        thumb: 560,
      });
    }
  },
  // FIG.09 · Lab 2-15 前排沙发：两人 11.1 s 坐下、140.3 s 起身，面前那台（单元 45）落下当茶几再收回。
  // 仿真每帧固定 50 ms（MAX_SIM_DT），所以按帧数算时刻；这两个时刻用 Node 直跑同一配置（同一种子、同一步长）核过
  'room-cycle': async (b) => {
    const sel = await openBench(b, '2-15');
    await waitBake(b, sel);
    await zoomTo(b, sel, 262, 335, 3, 0.001);
    const clock = simClock(b);
    for (const T of [11, 11.45, 11.9, 12.5, 140.8, 142.6]) {
      const t = await clock.to(T);
      await save('room-cycle', `t${t.toFixed(2).replace('.', '_').padStart(6, '0')}`, await b.shot(`${sel}.querySelector('canvas')`), { thumb: 480 });
    }
  },
  // FIG.10 · Lab 2-15 侧视剖面：t = 100 s，沙发前的茶几高度与猫待的台面高度落在同一张剖面上
  'two-uses': async (b) => {
    const sel = await openBench(b, '2-15', '2-15', ['Side']);
    await waitBake(b, sel);
    const t = await simClock(b).to(100);
    await save('two-uses', `t${Math.round(t)}-side`, await b.shot(`${sel}.querySelector('.lab-fig')`), { crop: [0.03, 0.27, 0.97, 0.67], thumb: 1008 });
  },
};

const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : Object.keys(SETS);
for (const n of names) if (!SETS[n]) throw new Error(`没有这一组：${n}`);
// 2D canvas 的台架（2-14）在无头环境里走软件 GL 光栅化，每帧几百毫秒；关掉 2D 加速改 CPU 光栅，快好几倍，画面相同
const BROWSER_ARGS = { 'plan-sit': ['--disable-accelerated-2d-canvas'] };
for (const n of names) {
  console.log(n);
  const b = await openBrowser({ width: 1440, height: 1000, scale: 2, args: BROWSER_ARGS[n] ?? [] });
  try {
    await SETS[n](b);
    if (b.logs.length) console.log('  页面报错', b.logs.slice(0, 3));
  } finally {
    b.close();
  }
}
