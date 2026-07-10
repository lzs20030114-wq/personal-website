import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // public/ 不做目录索引：/demo 与 /demo/ 本身 404，落到台架首页
  async redirects() {
    return [
      { source: "/demo", destination: "/demo/index.html", permanent: false },
    ];
  },
};

export default nextConfig;
