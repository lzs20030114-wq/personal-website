import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

// 1a 题栏印记（MAPPING §58.3）：平面符号原稿 -> 二值方点。
// 格距按屏幕像素定死 6px（网页按 1:1 显示，留白带不够高时才等比缩小），每格覆盖过半才出点，没有灰阶毛边。
// 两组按面积等重：统一 264 高的画框，符号贴右下；宽的符号（闭眼）因此更矮。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceDir = path.join(root, 'design-ref/work-pixel-scenes/sources');
const outputDir = path.join(root, 'public/home/work-scenes');
const previewDir = path.join(root, 'design-ref/work-pixel-scenes/previews');
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const pitch = 6;
const dot = 2.5;
const frameH = 264;
const refArea = frameH * frameH * 0.7;
const samples = 4;
const files = (await fs.readdir(sourceDir)).filter((name) => name.endsWith('.svg')).sort();
const manifest = [];
for (const file of files) {
  const source = await fs.readFile(path.join(sourceDir, file));
  const { data, info } = await sharp(source).flatten({ background: '#fff' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const dark = (x, y) => data[(y * W + x) * info.channels] < 128;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dark(x, y)) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const aspect = bw / bh;
  const rows = Math.round(Math.min(frameH, Math.sqrt(refArea / aspect)) / pitch);
  const cols = Math.round(rows * aspect);
  const top = frameH / pitch - rows;
  const cw = bw / cols;
  const ch = bh / rows;
  const pad = (pitch - dot) / 2;
  let d = '';
  let pixels = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let hit = 0;
      for (let j = 0; j < samples; j++) for (let i = 0; i < samples; i++) {
        const px = Math.min(W - 1, Math.floor(x0 + (c + (i + 0.5) / samples) * cw));
        const py = Math.min(H - 1, Math.floor(y0 + (r + (j + 0.5) / samples) * ch));
        if (dark(px, py)) hit++;
      }
      if (hit / (samples * samples) < 0.5) continue;
      d += `M${c * pitch + pad} ${(top + r) * pitch + pad}h${dot}v${dot}h-${dot}z`;
      pixels++;
    }
  }
  const width = cols * pitch;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${frameH}" viewBox="0 0 ${width} ${frameH}"><path fill="black" d="${d}"/></svg>\n`;
  await fs.writeFile(path.join(outputDir, file), svg);
  const preview = svg.replace('<path fill="black"', `<rect width="${width}" height="${frameH}" fill="#edf0ec"/><path fill="#42685e"`);
  await sharp(Buffer.from(preview)).png().toFile(path.join(previewDir, file.replace('.svg', '.png')));
  manifest.push({ theme: file.replace('.svg', ''), source: `sources/${file}`, output: `/home/work-scenes/${file}`, cols, rows, width, height: frameH, pixels, bytes: Buffer.byteLength(svg) });
}
await fs.writeFile(path.join(root, 'design-ref/work-pixel-scenes/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest));
