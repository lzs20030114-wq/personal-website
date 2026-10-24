// Field icon master: one 48-unit grid, 2.4-unit strokes, flat silhouettes.
// Extends the site's WorkspaceIcon / TableGlyph line language; no raster or 3D material.
const p = (d: string) => `<path d="${d}"/>`;
const c = (x: number, y: number, r = 3) => `<circle cx="${x}" cy="${y}" r="${r}"/>`;
const dot = (x: number, y: number, r = 2) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;
const box = (x: number, y: number, w: number, h: number) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`;
const human = (x: number, y: number) => c(x, y, 2.5) + p(`M${x - 4} ${y + 12}v-5q4-5 8 0v5`);
const cat = p('M16 34v-8l-3-5v-8l5 4 5-4v8l4 6v7M16 34h16q7 0 5-7');
const shell = p('M8 34Q8 21 17 18M14 34Q14 17 23 14M20 34Q20 13 29 10M26 34Q26 16 35 15M32 34Q32 21 40 21M8 35h32');

export const FIELD_GLYPHS: Record<string, string> = {
  machine: p('M9 29Q9 12 21 12Q33 12 33 29M15 28Q15 17 21 17Q27 17 27 28M8 30h27M13 30v6h17v-6M21 36l-5 5M34 27l5-5') + dot(39, 20),
  space: human(13, 13) + p('M8 32h14M29 30v-9l-3-5 5 2 4-3v8l4 7M27 30h12M22 10v4M28 8v4M34 8v4M40 10v4M24 36h16'),
  sleep: p('M30 10a13 13 0 1 0 8 22A12 12 0 0 1 30 10M10 36h12m-12 5h18') + dot(36, 12, 1.7),
  bed: p('M8 21v17M8 32h32v6M12 22h10v7H12zM22 25h14q4 0 4 4v3M29 10a6 6 0 1 0 7 7'),
  about: c(24, 15, 6) + p('M12 39v-5a12 12 0 0 1 24 0v5M8 9v7m32-7v7'),
  linkage: p('M12 32l4-17 20 3 3 14z') + c(12, 32) + c(16, 15) + c(36, 18) + c(39, 32),
  arch: p('M7 35l9-18 8-6 8 6 9 18M7 35l17-24 17 24M12 25h24M6 39h8m20 0h8') + dot(24, 11) + dot(12, 25) + dot(36, 25),
  tendon: p('M16 40V29l3-9 7-8 9-4M22 40V30l3-7 7-7 7-3M16 34h6m-4-9 6 2m-1-10 6 4m0-9 6 5M12 41h14'),
  shell,
  assembly: p('M8 27q0-13 7-13t7 13m-8 0q0-17 7-17t7 17m-7 0q0-13 7-13t7 13M8 29h29M12 29v6h20v-6M23 35l-3 5-5 2M35 26l5-4'),
  behavior: c(24, 24, 7) + p('M24 7v5m17 12h-5M24 41v-5M7 24h5M12 11l4 1M37 12l-1 4M36 37l-4-1M11 36l1-4') + dot(24, 6) + dot(42, 24) + dot(24, 42) + dot(6, 24),
  strip: p('M14 8v32M22 8v10l13 7-13 7v8M29 8v6l13 11-13 11v4'),
  'solid-strip': p('M12 8h7v10l16 7-16 7v8h-7V29l16-4-16-4zM19 18l7-4 16 11-7 0M19 32l7 4 16-11'),
  'dual-strip': p('M10 8v8l12 5-12 5v14M18 8v6l12 7-12 7v12M26 8v16l12 5-12 5v6M34 8v14l12 7-12 7'),
  series: p('M10 10v28M19 10v11l6 3-6 3v11M33 10v8l9 6-9 6v8'),
  cylinder: '<ellipse cx="24" cy="13" rx="8" ry="4"/><ellipse cx="24" cy="29" rx="17" ry="6"/>' + p('M16 13v13m16-13v13M16 32v7q8 5 16 0v-7M24 17v7'),
  layers: p('M24 8v32M9 18l15-6 15 6-15 6zM9 30l15-6 15 6-15 6z'),
  'square-ring': p('M8 14l16-6 16 6v20l-16 6-16-6zM8 14l16 7 16-7M24 21v19') + '<ellipse cx="24" cy="14" rx="6" ry="3"/>',
  array: [12,20,28,36].flatMap(x=>[12,20,28,36].map(y=>dot(x,y,2.5))).join(''),
  between: '<ellipse cx="17" cy="28" rx="11" ry="6"/><ellipse cx="31" cy="18" rx="11" ry="6"/>' + p('M6 28v6q11 9 22 0v-6M20 18v6q11 9 22 0v-6'),
  walk: human(25, 14) + p('M8 38q19 4 16-9M29 29q6-1 11-9') + dot(10, 18) + dot(17, 10) + dot(38, 35),
  crowd: human(12, 13) + human(34, 13) + human(24, 30) + p('M16 29q8-8 16 0M21 13h5'),
  cat,
  joined: p('M6 29h12v-8h12v-8h12M6 35h18v-8h12v-8h6M12 29v6m12-14v6m12-14v6'),
  together: human(13, 13) + p('M27 31v-8l-2-5 5 3 4-4v8l4 6M26 31h13M8 38h32'),
  'together-3d': human(14, 13) + p('M29 30v-8l-2-4 4 2 4-3v8l3 5M28 30h11M6 33l18 9 18-9M6 33v-5m36 5v-5'),
  layout: box(9,10,30,28) + p('M9 18h30M21 18v20M27 24h7m-7 7h7'),
  interaction: p('M21 35V19a3 3 0 0 1 6 0v9l4-2 8 4-2 9H24l-9-9a3 3 0 0 1 4-4l2 3M10 19a13 13 0 0 1 13-13M13 19a10 10 0 0 1 10-10'),
  writing: p('M9 13h17M9 21h12M9 29h9M9 37h23M24 28l12-17 5 4-12 17-7 3zM33 15l5 4'),
  archive: p('M14 8h25v26M9 14h24v26H9zM15 21h12M15 27h8') + dot(25,34),
  code: p('M17 14 7 24l10 10M31 14l10 10-10 10M26 11l-4 26'),
  analytics: p('M8 39h33M11 33V23h6v10M22 33V17h6v16M33 33V9h6v24'),
  lifecycle: p('M9 20a16 16 0 0 1 28-7M31 13h7V6M39 28A16 16 0 0 1 11 35M17 35h-7v7M14 25h5l3-7 4 13 3-6h5'),
  research: box(8,10,21,28) + p('M14 16h9m-9 6h7M36 33l6 7') + c(31,27,8),
  agents: human(10,11) + human(36,11) + human(24,29) + p('M12 30h5M31 30h5M21 12h6'),
  experiment: p('M10 10h9M12 10v15L7 37h19l-5-12V10M28 10h9M30 10v15l-3 8m12-23v15l4 12H31M11 29h10') + dot(16,32) + dot(35,28),
  fabric: p('M10 8v10l9 6-9 6v10M22 8v10l9 6-9 6v10M34 8v10l9 6-9 6v10'),
  cluster: c(17,18,9) + c(31,18,9) + c(24,32,9),
  mechanism: p('M12 34l5-18 19 4-2 14z') + c(12,34) + c(17,16) + c(36,20) + c(34,34) + p('M7 40h32'),
  measurement: p('M9 9v30M9 15h30M15 9v24h-6M33 9v24h6V9M22 12v6m5-6v6M21 38h12m-6-4v8'),
  model: p('M24 7 40 16v17l-16 9-16-9V16zM8 16l16 9 16-9M24 25v17') + '<path d="M24 7v17M8 33l16-9 16 9" stroke-dasharray="3 4" opacity=".5"/>',
  interview: p('M7 10h24v17H18l-7 6v-6H7zM20 31v6h12l6 5v-5h3V21h-6M13 17h12m-12 5h7'),
  survey: box(10,8,28,33) + p('M16 16l2 2 4-4M26 16h6M16 25l2 2 4-4M26 25h6M16 34h6m4 0h6'),
  electronics: box(14,14,20,20) + box(20,20,8,8) + p('M20 8v6m8-6v6M20 34v6m8-6v6M8 20h6m-6 8h6m20-8h6m-6 8h6'),
  sourcing: p('M8 20l16 7 16-7v16l-16 7-16-7zM24 27v16M8 20l8-4m24 4-8-4M24 6v14m-6-6 6 6 6-6'),
  photo: p('M8 16h9l3-6h8l3 6h9v23H8z') + c(24,27,7) + dot(35,21,1.5),
  strategy: p('M8 36h9V24h14V12h9M34 6l6 6-6 6') + c(10,36) + dot(24,24),
  ethics: p('M24 7 38 13v11q0 11-14 18Q10 35 10 24V13zM17 24l5 5 10-12'),
};

export function fieldGlyphSvg(key: string): string {
  const glyph = FIELD_GLYPHS[key];
  if (!glyph) throw new Error(`Unknown Field icon: ${key}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" color="#fff" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg>`;
}
