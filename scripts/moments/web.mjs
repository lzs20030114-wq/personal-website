// 案例页「方法」节的三组分镜（FIG.02–04，2026-11-28）：把图版里 03 行走 · 05 站着 · 08 坐着 三行的带记号单格
// 与同一刻的平面图上下拼成一张，存成 public/work/letting-agent/frames/<组>/sN.webp 与缩略图 sN-s.webp。
// 带记号的单格由 sheet.mjs 的第五个参数出（见 README）；尺寸变了这里会报错，同时要改 src/lib/site/case-frames.ts 里的 w / h。
// 用法：node scripts/moments/web.mjs [带记号单格的目录 = 项目二_决定性瞬间/带记号]
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const src = resolve(process.argv[2] ?? join(root, '项目二_决定性瞬间/带记号'));
const SETS = [
  { set: 'rule-walk', row: '03', n: 3, w: 692, top: 556, plan: 408, tw: 520 },
  { set: 'rule-stand', row: '05', n: 3, w: 692, top: 558, plan: 408, tw: 520 },
  { set: 'rule-sit', row: '08', n: 4, w: 508, top: 408, plan: 320, tw: 508 },
];
const GAP = 16;
for (const s of SETS) {
  const dir = join(root, 'public/work/letting-agent/frames', s.set);
  mkdirSync(dir, { recursive: true });
  const H = s.top + GAP + s.plan;
  for (let k = 1; k <= s.n; k++) {
    const a = sharp(join(src, `${s.row}-${k}.png`));
    const b = sharp(join(src, `${s.row}-${k}-plan.png`));
    const [ma, mb] = [await a.metadata(), await b.metadata()];
    if (ma.width !== s.w || ma.height !== s.top || mb.height !== s.plan) throw new Error(`${s.row}-${k} 尺寸变了：${ma.width}×${ma.height} / ${mb.width}×${mb.height}`);
    const buf = await sharp({ create: { width: s.w, height: H, channels: 3, background: '#ffffff' } })
      .composite([
        { input: await a.toBuffer(), left: 0, top: 0 },
        { input: await b.toBuffer(), left: Math.round((s.w - mb.width) / 2), top: s.top + GAP },
      ])
      .png()
      .toBuffer();
    await sharp(buf).webp({ quality: 92 }).toFile(join(dir, `s${k}.webp`));
    await sharp(buf).resize({ width: s.tw }).webp({ quality: 90 }).toFile(join(dir, `s${k}-s.webp`));
  }
  console.log(s.set, s.w, H, s.tw);
}
