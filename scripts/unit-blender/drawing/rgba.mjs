// node rgba.mjs a.svg b.svg …  —— 每个 SVG 按自身宽高出一张透明底的 PNG（同名 .png）
import { createRequire } from 'node:module'; import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch(); let p = null;
for (const f of process.argv.slice(2)) {
  const svg = fs.readFileSync(f, 'utf8');
  const w = +svg.match(/width="([\d.]+)"/)[1], h = +svg.match(/height="([\d.]+)"/)[1];
  if (!p) p = await b.newPage({ viewport: { width: Math.ceil(w), height: Math.ceil(h) } });
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await p.screenshot({ path: f.replace(/\.svg$/, '.png'), omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
}
await b.close();
