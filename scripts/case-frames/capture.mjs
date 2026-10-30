// 案例页的分镜截图（项目二 MAPPING §78 起用，项目一 §79 跟上）：从 /lab 的台架按协议步数或仿真时间截帧，
// 写成 public/work/<项目>/frames/<组>/<帧>.webp（原图）与 <帧>-s.webp（缩略图）。
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
// 组 → 项目（图放在哪个目录）；没列的是项目二
const PROJECT_OF = { 'form-views': 'reincarnation-machine', breath: 'reincarnation-machine', hand: 'reincarnation-machine', startle: 'reincarnation-machine' };
const outDir = (set) => `public/work/${PROJECT_OF[set] ?? 'project-ii'}/frames`;
// HUD 与 Lab 1-6 的逐轴标号（M1–M7）一律藏起；手的标记圈（.lab-hand）留着，它是画面的一部分
const HIDE_HUD = `.lab-hud,.actuator-markers{visibility:hidden!important}`;

/** 一帧 = 一张 PNG（设备像素）→ 裁切 → webp 原图 + 缩略图 */
async function save(set, file, png, { crop, width, thumb, fit }) {
  const dir = join(outDir(set), set);
  mkdirSync(dir, { recursive: true });
  let img = sharp(png);
  const meta = await img.metadata();
  if (fit) {
    // 按画面内容自动取景：找出比底色亮出一截的像素的包围盒，四周留 pad，再扩成 fit.aspect 的框、缩到 fit.w 宽。
    // 同一组里各帧视角不同（轴测 / 正 / 侧 / 顶），机身落在画框里不同位置，固定裁切会裁掉或留一大片空
    const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
    let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
    for (let y = 0; y < info.height; y += 2)
      for (let x = 0; x < info.width; x += 2)
        if (data[y * info.width + x] > (fit.thr ?? 46)) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    let w = x1 - x0, h = y1 - y0;
    const pad = (fit.pad ?? 0.08) * Math.max(w, h);
    w += 2 * pad; h += 2 * pad;
    if (w / h < fit.aspect) w = h * fit.aspect; else h = w / fit.aspect;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const left = Math.max(0, Math.round(cx - w / 2)), top = Math.max(0, Math.round(cy - h / 2));
    img = img.extract({ left, top, width: Math.min(info.width - left, Math.round(w)), height: Math.min(info.height - top, Math.round(h)) })
      .resize({ width: fit.w, height: Math.round(fit.w / fit.aspect), fit: 'contain', background: { r: 2, g: 12, b: 16 } });
  } else if (crop) {
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


/** 一组帧的公共取景：所有帧里比底色亮的像素取并集，四周留 pad，按 aspect 扩框，返回比例坐标 crop。
 *  动作会让机构在帧与帧之间伸出去（惊跳时臂往下甩），用并集取景，同一组帧的框不动、动作不被裁掉 */
async function unionCrop(pngs, { aspect, pad = 0.06, thr = 46, edge = 0.03 }) {
  let X0 = 1, Y0 = 1, X1 = 0, Y1 = 0;
  let W = 0, H = 0;
  for (const png of pngs) {
    const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
    W = info.width; H = info.height;
    for (let y = Math.round(H * edge); y < H * (1 - edge); y += 2)
      for (let x = Math.round(W * edge); x < W * (1 - edge); x += 2)
        if (data[y * W + x] > thr) {
          X0 = Math.min(X0, x / W); X1 = Math.max(X1, x / W);
          Y0 = Math.min(Y0, y / H); Y1 = Math.max(Y1, y / H);
        }
  }
  let w = (X1 - X0) * W, h = (Y1 - Y0) * H;
  const p = pad * Math.max(w, h);
  w += 2 * p; h += 2 * p;
  if (w / h < aspect) w = h * aspect; else h = w / aspect;
  const cx = ((X0 + X1) / 2) * W, cy = ((Y0 + Y1) / 2) * H;
  const c = [(cx - w / 2) / W, (cy - h / 2) / H, (cx + w / 2) / W, (cy + h / 2) / H].map((v) => Math.min(1, Math.max(0, v)));
  console.log('  取景', c.map((v) => v.toFixed(3)).join(' '));
  return c;
}

/** 打开 /lab#lab<hash>，藏 HUD，滚到台架，按顺序点按钮 */
async function openBench(b, no, hash, clicks = [], { bare = false } = {}) {
  await b.goto(`${BASE}/lab#lab${hash ?? no}`, 9000);
  // bare：连图框四角的取景标记也藏掉（按内容自动取景时它们会被当成画面内容，项目一的组用）
  const css = HIDE_HUD + (bare ? '.lab-fig::before,.lab-fig::after{display:none!important}' : '');
  await b.ev(`(()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(css)};document.head.appendChild(s)})()`);
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


/** 按 aria-label（正则）找滑块，设值并发 input / change（React 受控滑块要走原生 setter） */
const setRange = (b, sel, labelRe, v) =>
  b.ev(`(()=>{const i=[...${sel}.querySelectorAll('input[type=range]')].find(x=>${labelRe}.test(x.getAttribute('aria-label')||''));if(!i)return null;const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,String(${v}));i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));return i.value})()`);
/** 把某个复选框设成 on（按所在 label 的文字找） */
const setCheck = (b, sel, labelRe, on) =>
  b.ev(`(()=>{const i=[...${sel}.querySelectorAll('input[type=checkbox]')].find(x=>${labelRe}.test(x.closest('label')?.textContent||''));if(!i)return null;if(i.checked!==${on})i.click();return i.checked})()`);
const clickBtn = async (b, sel, text) => {
  const ok = await b.ev(`(()=>{const x=[...${sel}.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(text)});if(!x)return false;x.click();return true})()`);
  if (!ok) throw new Error(`找不到按钮「${text}」`);
  await b.frames(2, 0.001);
};
/** 快进 sec 秒（每帧 1/60 s，不画），到点画一帧 */
async function run(b, sec) {
  await b.noDraw(true);
  if (sec > 0) await b.frames(Math.round(sec * 60), 1000 / 60, 60);
  await b.noDraw(false);
  await b.frames(1, 0.001);
}
/** Lab 1-5 停转，相位滑块一度一度推到 deg（相位一下跳太多会让五环解算换支，台架上手拖也是连续的） */
async function phaseTo(b, sel, from, deg) {
  const step = deg >= from ? 1 : -1;
  await b.noDraw(true);
  for (let v = from; v !== deg; v += step) {
    await setRange(b, sel, '/^$/', v + step);
    await b.ev('window.__cap.run(1, 1000/60)');
  }
  await b.noDraw(false);
  await b.frames(1, 0.001);
}
/** Lab 1-6：生命钟 ×1、选首世人格、视角、跳过诞生段，再静置 pre 秒（让它先自己动一会儿） */
async function openBehaviour(b, persona, view, pre = 3) {
  const sel = await openBench(b, '1-6', undefined, [], { bare: true });
  await setRange(b, sel, '/Life clock/', 0); // 四档 ×1 / ×5 / ×10 / ×20 的第 0 档：成长段整整 240 s，截图期间不会老
  await b.frames(2, 0.001);
  await clickBtn(b, sel, persona);
  await clickBtn(b, sel, view);
  await clickBtn(b, sel, 'Next stage');
  await run(b, pre);
  return sel;
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
  // 首页项目二卡片封面（MAPPING §76，不进案例页）：Lab 2-15 默认场景，拉近两档，仿真 100 s（两张沙发上有人坐着、面前那台
  // 落成桌子，右边一只猫在落成的台上；2026-10-30 在 40–280 s 里每 30 s 截一张挑的）。卡片图层比卡宽 20%（视差用），两侧各裁掉
  // 约 8%，所以主体要收在中间。取画布底部 3:2 那块（顶上是一片收着的单元，裁掉；底下坐着的人留全），存 1200 × 800 webp
  'home-cover': async (b) => {
    const sel = await openBench(b, '2-15');
    await waitBake(b, sel);
    for (let i = 0; i < 2; i++) {
      await b.ev(`[...${sel}.querySelectorAll('button')].find(x=>x.textContent.trim()==='+').click()`);
      await b.frames(1, 0.001);
    }
    await b.frames(20, 0.001);
    await simClock(b).to(Number(process.env.COVER_T ?? 100));
    const png = await b.shot(`${sel}.querySelector('canvas')`);
    const m = await sharp(png).metadata();
    const h = Math.round(m.width / 1.5);
    const top = Math.round((m.height - h) * Number(process.env.COVER_Y ?? 1));
    await sharp(png).extract({ left: 0, top, width: m.width, height: h }).resize({ width: 1200, height: 800 }).webp({ quality: 84 }).toFile('public/home/cover-project-ii.webp');
    console.log(`  home/cover-project-ii.webp  1200×800（画布 ${m.width}×${m.height}，上沿 ${top}）`);
  },
  // ─── 项目一 ───
  // N04 · Lab 1-5 停在全开（中间轴 0°），四个固定视角：外形三视 + 轴测。按内容自动取景（四个视角里机身落在画框不同位置）
  'form-views': async (b) => {
    const sel = await openBench(b, '1-5', undefined, [], { bare: true });
    await setCheck(b, sel, '/Run/', false);
    await b.frames(2, 0.001);
    for (const [file, view] of [['axon', 'Axon'], ['left', 'Left'], ['front', 'Front'], ['top', 'Top']]) {
      await clickBtn(b, sel, view);
      await run(b, 1.5); // 视角插值走完
      await save('form-views', file, await b.shot(`${sel}.querySelector('canvas')`), { fit: { aspect: 4 / 3, w: 1200 }, thumb: 480 });
    }
  },
  // N08 前后 · Lab 1-5 停转、从前方看（看得见 S1 的外形），中间轴 0° → 180° 五个相位：一次张合
  breath: async (b) => {
    const sel = await openBench(b, '1-5', undefined, [], { bare: true });
    await setCheck(b, sel, '/Run/', false);
    await clickBtn(b, sel, 'Left');
    await run(b, 1.5);
    let at = 0;
    for (const deg of [0, 45, 90, 135, 180]) {
      await phaseTo(b, sel, at, deg);
      at = deg;
      await run(b, 0.5);
      await save('breath', `p${String(deg).padStart(3, '0')}`, await b.shot(`${sel}.querySelector('canvas')`), { crop: [0.2, 0.1, 0.68, 0.72], thumb: 420 });
    }
  },
  // 行为引擎 · Lab 1-6 指针 = 手，俯视：同一只手放在同一处，热情型迎上去缠住握住，回避型侧过身、臂背着手藏低。
  // 两场各从一场的起点算：成长段第 3 s 把手放进画面（画布内比例坐标），之后按给定时刻截
  hand: async (b0) => {
    const PATHS = {
      warm: { persona: 'A Warm', path: [[0, 0.2, 0.4]], at: [0.5, 2, 4.5, 5.5, 7] },
      avoid: { persona: 'C Avoidant', path: [[0, 0.2, 0.4], [6, 0.2, 0.4], [9, 0.38, 0.55]], at: [0.5, 3, 6, 7, 11] },
    };
    for (const [key, cfg] of Object.entries(PATHS)) {
      const b = key === 'warm' ? b0 : await openBrowser({ width: 1440, height: 1000, scale: 2 });
      try {
        const sel = await openBehaviour(b, cfg.persona, 'Top');
        const crop = [0.15, 0, 0.78, 1];
        await save('hand', `${key}-pre`, await b.shot(`${sel}.querySelector('.lab-fig')`), { crop, thumb: 300 });
        const r = await b.ev(`(()=>{const c=${sel}.querySelector('canvas').getBoundingClientRect();return {x:c.x,y:c.y,w:c.width,h:c.height}})()`);
        const P = cfg.path;
        const at = (t) => {
          let a = P[0], c = P[P.length - 1];
          for (let i = 0; i < P.length - 1; i++) if (t >= P[i][0] && t <= P[i + 1][0]) { a = P[i]; c = P[i + 1]; }
          const u = c[0] > a[0] ? Math.min(1, Math.max(0, (t - a[0]) / (c[0] - a[0]))) : 1;
          return { x: r.x + r.w * (a[1] + (c[1] - a[1]) * u), y: r.y + r.h * (a[2] + (c[2] - a[2]) * u) };
        };
        let p = at(0);
        await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
        let t = 0;
        for (const T of cfg.at) {
          await b.noDraw(true);
          while (t < T - 1e-6) {
            t += 1 / 60;
            p = at(t);
            await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
            await b.ev('window.__cap.run(1, 1000/60)');
          }
          await b.noDraw(false);
          await b.frames(1, 0.001);
          await save('hand', `${key}-t${String(Math.round(T * 10)).padStart(3, '0')}`, await b.shot(`${sel}.querySelector('.lab-fig')`), { crop, thumb: 300 });
        }
        if (b.logs.length) console.log('  页面报错', b.logs.slice(0, 3));
      } finally {
        if (b !== b0) b.close();
      }
    }
  },
  // 行为引擎 · Lab 1-6 回避型被敲一下（Knock）：0.1 s 后的反射猛缩、定住、按回避型的方式恢复。侧视，指针不当手
  startle: async (b) => {
    const sel = await openBench(b, '1-6', undefined, [], { bare: true });
    await setCheck(b, sel, '/Pointer = hand/', false);
    await setRange(b, sel, '/Life clock/', 0);
    await b.frames(2, 0.001);
    await clickBtn(b, sel, 'C Avoidant');
    await clickBtn(b, sel, 'Left');
    await clickBtn(b, sel, 'Next stage');
    await run(b, 3);
    const shots = [['t000', await b.shot(`${sel}.querySelector('canvas')`)]];
    await clickBtn(b, sel, 'Knock');
    let t = 0;
    for (const T of [0.1, 0.25, 0.6, 1.5, 4]) {
      await run(b, T - t);
      t = T;
      shots.push([`t${String(Math.round(T * 100)).padStart(3, '0')}`, await b.shot(`${sel}.querySelector('canvas')`)]);
    }
    const crop = await unionCrop(shots.map((x) => x[1]), { aspect: 16 / 9 });
    for (const [file, png] of shots) await save('startle', file, png, { crop, thumb: 400 });
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
