import { defineConfig } from "vite";
import { resolve } from "node:path";

// 台架双页（index.html 四杆 / arch.html 拱环）build 时输出到 public/demo/，
// 随 Next 产物静态上线（线上 /demo/、/demo/arch.html）。
// dev（npm run demo）base 保持 "/"，本地台架行为不变——SITE_SPEC §2 双构建共存。
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/demo/" : "/",
  // 台架不消费 Next 的 public/ 源目录；禁用复制可避免 publicDir 包住 outDir 的冲突。
  publicDir: false,
  build: {
    outDir: "public/demo",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        arch: resolve(import.meta.dirname, "arch.html"),
        tentacle: resolve(import.meta.dirname, "tentacle.html"),
        tentacle3d: resolve(import.meta.dirname, "tentacle3d.html"),
      },
    },
  },
}));
