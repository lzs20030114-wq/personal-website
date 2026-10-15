export const metadata = { title: 'Visitor privacy' };

export default function PrivacyPage() {
  return (
    <article className="prose-col" style={{ paddingBlock: 56, paddingInline: 24, lineHeight: 1.8 }}>
      <h1 style={{ fontSize: 28, marginBottom: 24 }}>Visitor privacy / 访客记录说明</h1>
      <p>When visit recording is enabled, this portfolio records the page path, access time, public IP address,
        approximate country, region and city, and referring website origin. The site owner uses these records
        to understand visits to the portfolio. Records are visible only in the password-protected dashboard.</p>
      <p style={{ marginBlock: 20 }}>No tracking cookies, persistent visitor identifiers or browser fingerprints are used.
        URL queries and fragments are excluded. The dashboard shows the last 30 days; older records are removed
        by scheduled cleanup. IP location is approximate and may reflect a shared network or VPN.</p>
      <p>Browsers sending Do Not Track or Global Privacy Control are excluded from this site’s visit recording.
        Hosting providers may maintain their own operational logs.</p>
      <div lang="zh-Hans" style={{ borderTop: '1px solid var(--hairline)', marginTop: 32, paddingTop: 24 }}>
        <p>启用后，本站记录访问页面路径、时间、公开 IP、IP 的大致国家／地区／城市及来源网站域名，供作者了解作品集访问情况。记录仅在密码保护的后台可见。</p>
        <p style={{ marginBlock: 20 }}>不使用追踪 Cookie、长期访客标识或浏览器指纹，不保存网址查询参数与锚点。后台仅可查询最近 30 天，超期记录定期清理。IP 归属地可能是共享网络或 VPN 的位置。</p>
        <p>浏览器开启 Do Not Track 或 Global Privacy Control 时，本站不记录该访问。托管平台仍可能保存自己的运行日志。</p>
      </div>
      <p style={{ marginTop: 28 }}>Contact / 联系：<a href="mailto:lzs20030114@gmail.com">lzs20030114@gmail.com</a></p>
    </article>
  );
}
