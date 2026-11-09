// node render.mjs in.svg out.png [scale]  —— 按 SVG 自身宽高出 PNG
import { createRequire } from 'node:module'; import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [inp, out, sc] = process.argv.slice(2);
const svg = fs.readFileSync(inp, 'utf8');
const w = +svg.match(/width="([\d.]+)"/)[1], h = +svg.match(/height="([\d.]+)"/)[1];
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: Math.ceil(w), height: Math.ceil(h) }, deviceScaleFactor: +(sc || 1) });
await p.setContent(`<html><body style="margin:0">${svg}</body></html>`, { waitUntil: 'networkidle' });
await p.screenshot({ path: out, clip: { x: 0, y: 0, width: w, height: h } }); await b.close();
