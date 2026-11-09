// 把台架用的二进制资源复制到 Next 的 public/ 下，供站内 React 台架组件 fetch。
// 真实扫描网格（tentacle3d-mesh.bin，106k 三角）是 3D 台架「真实形态」的载荷——
// vite 台架经 ?url 打包进 public/demo/assets/<hash>.bin（构建产物、gitignore），
// 站内组件需要稳定 URL，故在 dev/build 前复制一份到 public/mesh/（同样 gitignore）。
//
// 2026-11-08（MAPPING §87）：每份另存一个 gzip 版（<name>.bin.gz，约小一半：2.6 MB → 1.4 MB）。
// Vercel 只压缩它认得的文本类 MIME，application/octet-stream 原样发；站内 fetchMeshBuffer 先拉 .gz、
// 在浏览器里用 DecompressionStream 解开，不支持的浏览器退回原文件。原文件照旧保留（src/demo 台架与回退都用它）。
import { mkdirSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, constants } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jobs = [
  ['src/demo/assets/tentacle3d-mesh.bin', 'public/mesh/tentacle3d-mesh.bin'],
  ['src/demo/assets/machine-mesh.bin', 'public/mesh/machine-mesh.bin'],
];

for (const [from, to] of jobs) {
  const src = join(root, from);
  const dst = join(root, to);
  if (!existsSync(src)) {
    console.error(`[copy-assets] 缺少源文件：${from}`);
    process.exit(1);
  }
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  const gz = gzipSync(readFileSync(src), { level: constants.Z_BEST_COMPRESSION });
  writeFileSync(`${dst}.gz`, gz);
  console.log(`[copy-assets] ${from} → ${to}（+ .gz ${(gz.length / 1024).toFixed(0)} KB）`);
}
