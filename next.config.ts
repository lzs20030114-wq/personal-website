import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 响应头不报框架与版本——没有收益，只给扫描器省事
  poweredByHeader: false,

  // public/ 不做目录索引：/demo 与 /demo/ 本身 404，落到台架首页
  async redirects() {
    return [
      { source: "/demo", destination: "/demo/index.html", permanent: false },
    ];
  },

  /**
   * 安全响应头（全站，含 public/ 下的台架静态页）。
   * 站上公开部分无 API / 用户输入（2026-07-28 起多了 `/studio` 编辑后台与它的发布接口，
   * 密码 + 签名 cookie 门禁、noindex、robots 屏蔽，见 SITE_SPEC §12）；
   * 真正的风险不是被打穿而是**被套壳冒名**——
   * 作品集页嵌进别人的 iframe 里当素材，对申请场景比入侵现实得多。故 DENY。
   * 全站零 iframe 使用（含台架页），DENY 不影响任何自有功能。
   * CSP 暂不加：站内大量内联 style 与内联 animation，写严了先绊住自己，
   * 要上须连同内联样式一起整改，不属于「零风险」范畴。
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
