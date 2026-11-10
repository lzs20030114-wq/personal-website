// Lab 2-15 / 2-16 带子轨迹的预烘（2026-11-10）：构建机算好，访客只下载。做法同 scripts/skin-terminal/generate.mjs。
//
// 九条带的轨迹在浏览器里要算三十来秒，Lab 2-16 的小样等它算完才开演——这段时间画面里没有人也没有猫。
// 这里用站上同一份 UnitBaker 算（一个数不改），按 cohabit-bake-format.ts 存成 public/cohabit-bake/{tiers,dual}.bin(+.gz)。
// 台架先取文件，取不到或键对不上才退回后台线程现算。
//
// 缓存：文件名 = src/lib/space 下全部非测试源码的哈希，放 .next/cache/cohabit-bake/（Vercel 跨部署保留）。
// 源码没变就直接复制，不重算。
//
//   node scripts/cohabit-bake/generate.mjs
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { constants, gzipSync } from 'node:zlib';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const srcDir = resolve(root, 'src/lib/space');
const out = resolve(root, 'public/cohabit-bake');
const cache = resolve(root, '.next/cache/cohabit-bake');

// 引擎、键谱、烘焙、格式任何一处变了都重算：整个目录的非测试源码一起哈希（宁可多算一次，不用陈的）
const revision = createHash('sha256');
for (const name of readdirSync(srcDir).sort()) {
  if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue;
  revision.update(name).update(readFileSync(resolve(srcDir, name), 'utf8').replace(/\r\n/g, '\n'));
}
const rev = revision.digest('hex').slice(0, 20);

const write = (path, data) => {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
};

const names = ['tiers', 'dual'];
const cached = (name) => resolve(cache, `${rev}-${name}.bin`);
mkdirSync(out, { recursive: true });

if (!names.every((n) => existsSync(cached(n)))) {
  const server = await createServer({ root, configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'error' });
  try {
    const { UnitBaker, UNIT_TIERS, UNIT_DUAL_DEFS, UNIT_DUAL_OPTS, FRAMES, bakedKey } = await server.ssrLoadModule('/src/lib/space/cohabit-solid.ts');
    const { packTrajectories, unpackTrajectories } = await server.ssrLoadModule('/src/lib/space/cohabit-bake-format.ts');
    const groups = { tiers: [UNIT_TIERS, undefined], dual: [UNIT_DUAL_DEFS, UNIT_DUAL_OPTS] };
    for (const name of names) {
      const [defs, opts] = groups[name];
      const t0 = performance.now();
      const baker = new UnitBaker(defs, FRAMES, opts);
      while (!baker.work(1000)) process.stdout.write(`\r[cohabit-bake] ${name} ${(baker.progress * 100).toFixed(0)}%   `);
      const key = bakedKey(defs, FRAMES);
      const buf = packTrajectories(key, baker.trajectories);
      if (!unpackTrajectories(buf, key)) throw new Error(`[cohabit-bake] ${name} 打包后解不回来`);
      write(cached(name), Buffer.from(buf));
      console.log(`\r[cohabit-bake] ${name} 算完 ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    }
  } finally {
    await server.close();
  }
}

for (const name of names) {
  const dst = resolve(out, `${name}.bin`);
  copyFileSync(cached(name), dst);
  const gz = gzipSync(readFileSync(dst), { level: constants.Z_BEST_COMPRESSION });
  write(`${dst}.gz`, gz);
  console.log(`[cohabit-bake] ${name}.bin ${(readFileSync(dst).length / 1024).toFixed(0)} KB（.gz ${(gz.length / 1024).toFixed(0)} KB）`);
}
