// 复现冻结参数的原始成形过程和终态指标。node scripts/skin-layers/calibrate.mjs
import { createServer } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom' });
try {
  const { auditLayerProfile } = await server.ssrLoadModule('/scripts/skin-layers/audit.ts');
  const rows = ['double', 'solid'].map(auditLayerProfile);
  for (const { frames, target, ...metrics } of rows) console.log(JSON.stringify(metrics));
  const a = rows[0].frames, b = rows[1].frames;
  console.log('outer-height spread after step 800:', Math.max(...a.flatMap((f, i) => f.step < 800 ? [] : [Math.abs(f.top - b[i].top), Math.abs(f.bottom - b[i].bottom)])));
  mkdirSync('scripts/skin-layers/output', { recursive: true });
  writeFileSync('scripts/skin-layers/output/calibration.json', JSON.stringify(rows));
} finally { await server.close(); }
