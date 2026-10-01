import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// 台架双页（index.html 四杆 / arch.html 拱环）build 时输出到 public/demo/，
// 随 Next 产物静态上线（线上 /demo/、/demo/arch.html）。
// dev（npm run demo）base 保持 "/"，本地台架行为不变——SITE_SPEC §2 双构建共存。
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/demo/" : "/",
  // 台架不消费 Next 的 public/ 源目录；禁用复制可避免 publicDir 包住 outDir 的冲突。
  publicDir: false,
  // 真跑求解器的守门测试（skin-layers-* 等）本机单独跑就要 4–6 秒，贴着 vitest 默认的 5 秒线；
  // `npm run build` 把 `npm test` 放在最前面，Vercel 的构建机更慢，超时会直接让生产部署失败
  // （2026-10-01 主页合并 master 时即此）。全局放宽是兜底，逐条显式预算仍然有效。
  test: { testTimeout: 60_000 },
  build: {
    outDir: "public/demo",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        arch: resolve(import.meta.dirname, "arch.html"),
        tentacle: resolve(import.meta.dirname, "tentacle.html"),
        tentacle3d: resolve(import.meta.dirname, "tentacle3d.html"),
        shell3d: resolve(import.meta.dirname, "shell3d.html"),
      },
    },
  },
}));
