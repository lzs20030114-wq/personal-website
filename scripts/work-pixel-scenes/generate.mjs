import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceDir = path.join(root, 'design-ref/work-pixel-scenes/sources');
const outputDir = path.join(root, 'public/home/work-scenes');
await fs.mkdir(outputDir, { recursive: true });
const previewDir = path.join(root, 'design-ref/work-pixel-scenes/previews');
await fs.mkdir(previewDir, { recursive: true });

const width = 960;
const height = 600;
const pitch = 6;
const levels = 8;
const files = (await fs.readdir(sourceDir)).filter((name) => name.endsWith('.svg')).sort();
const manifest = [];
for (const file of files) {
  const source = await fs.readFile(path.join(sourceDir, file));
  // 平面符号原稿 -> 灰度采样 -> 方点。保持完整大轮廓，不平铺图标。
  const { data, info } = await sharp(source).flatten({ background: '#fff' }).resize(width / pitch, height / pitch).greyscale().raw().toBuffer({ resolveWithObject: true });
  const paths = Array.from({ length: levels }, () => '');
  let pixels = 0;
  for (let row = 0; row < info.height; row++) {
    for (let col = 0; col < info.width; col++) {
      const tone = 1 - data[(row * info.width + col) * info.channels] / 255;
      if (tone < .055) continue;
      const level = Math.min(levels - 1, Math.floor(tone * levels));
      const size = 1.1 + level * .58;
      const x = (col * pitch + (pitch - size) / 2).toFixed(2);
      const y = (row * pitch + (pitch - size) / 2).toFixed(2);
      const s = size.toFixed(2);
      paths[level] += `M${x} ${y}h${s}v${s}h-${s}z`;
      pixels++;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600"><g fill="black">${paths.map((d) => `<path d="${d}"/>`).join('')}</g></svg>\n`;
  await fs.writeFile(path.join(outputDir, file), svg);
  const preview = svg.replace('<g fill="black">', '<rect width="960" height="600" fill="#edf0ec"/><g fill="#42685e" opacity=".58">');
  await sharp(Buffer.from(preview)).png().toFile(path.join(previewDir, file.replace('.svg', '.png')));
  manifest.push({ theme: file.replace('.svg', ''), source: `sources/${file}`, output: `/home/work-scenes/${file}`, pixels, bytes: Buffer.byteLength(svg) });
}
await fs.writeFile(path.join(root, 'design-ref/work-pixel-scenes/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest));
