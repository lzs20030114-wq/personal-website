// 与网格资源一样在 predev/prebuild 准备；只在开发机/构建机求解，访客只读终态。
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(root, 'public/skin-terminal');
const check = process.argv.includes('--check');
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom' });
try {
  const { skinTerminalCatalog } = await server.ssrLoadModule('/src/lib/space/skin-terminal-catalog.ts');
  const { skinTerminalSignature, storeSkinTerminal, restoreSkinTerminal, SKIN_TERMINAL_FORMAT } =
    await server.ssrLoadModule('/src/lib/space/skin-terminal-format.ts');
  const { solveSkinTerminal } = await server.ssrLoadModule('/src/lib/space/skin-terminal.ts');
  const { SKIN } = await server.ssrLoadModule('/src/lib/space/skin-unit.ts');
  // 引擎/序列化变化自动失效；键谱/选项变化由每个资产自己的签名失效。
  const source = ['skin-unit.ts', 'skin-terminal.ts', 'skin-terminal-format.ts']
    .map((name) => readFileSync(resolve(root, 'src/lib/space', name), 'utf8').replace(/\r\n/g, '\n')).join('\n');
  const revision = createHash('sha256').update(source).digest('hex');
  const unique = new Map(skinTerminalCatalog().map((input) => [skinTerminalSignature(input), input]));
  if (!check) mkdirSync(out, { recursive: true });
  let generated = 0;
  let bytes = 0;
  const started = performance.now();
  console.log(`[skin-terminal] ${unique.size} unique physical states${check ? ' · checking' : ''}`);
  for (const [signature, input] of unique) {
    const key = createHash('sha256').update(`${revision}\n${signature}`).digest('hex');
    const path = resolve(out, `${key}.json`);
    const nodes = input.spec.reduce((n, seg) => n + seg[1], 0);
    if (!existsSync(path)) {
      if (check) throw new Error(`Missing precomputed skin state: ${key}`);
      const result = solveSkinTerminal([{ spec: input.spec, opts: input.opts }]);
      const json = JSON.stringify(storeSkinTerminal(result.states[0]));
      restoreSkinTerminal(JSON.parse(json), nodes, SKIN.STEPS);
      writeFileSync(path, json);
      generated++;
      if (generated % 10 === 0) console.log(`[skin-terminal] generated ${generated}/${unique.size}`);
    }
    const json = readFileSync(path, 'utf8');
    restoreSkinTerminal(JSON.parse(json), nodes, SKIN.STEPS);
    bytes += Buffer.byteLength(json);
  }
  const manifest = { format: SKIN_TERMINAL_FORMAT, revision, count: unique.size };
  const manifestPath = resolve(out, 'manifest.json');
  if (check) {
    if (JSON.stringify(JSON.parse(readFileSync(manifestPath, 'utf8'))) !== JSON.stringify(manifest))
      throw new Error('Stale skin terminal manifest');
  } else writeFileSync(manifestPath, JSON.stringify(manifest));
  console.log(`[skin-terminal] ${generated} generated, ${(bytes / 1024 / 1024).toFixed(2)} MiB total, ${((performance.now() - started) / 1000).toFixed(1)}s`);
} finally {
  await server.close();
}
