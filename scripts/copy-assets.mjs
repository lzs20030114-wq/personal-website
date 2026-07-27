// 把台架用的二进制资源复制到 Next 的 public/ 下，供站内 React 台架组件 fetch。
// 真实扫描网格（tentacle3d-mesh.bin，106k 三角）是 3D 台架「真实形态」的载荷——
// vite 台架经 ?url 打包进 public/demo/assets/<hash>.bin（构建产物、gitignore），
// 站内组件需要稳定 URL，故在 dev/build 前复制一份到 public/mesh/（同样 gitignore）。
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jobs = [['src/demo/assets/tentacle3d-mesh.bin', 'public/mesh/tentacle3d-mesh.bin']];

for (const [from, to] of jobs) {
  const src = join(root, from);
  const dst = join(root, to);
  if (!existsSync(src)) {
    console.error(`[copy-assets] 缺少源文件：${from}`);
    process.exit(1);
  }
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  console.log(`[copy-assets] ${from} → ${to}`);
}
