/**
 * 共享页脚（Modernist 稿）——G900 深林整版铺底（MAPPING §1），左 email 占位、右链接卫生标语。
 * 文案照搬设计稿（不新写）；email 保持占位形态直至作者定名。
 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell flex items-baseline justify-between" style={{ paddingBlock: 40 }}>
        <span className="footer-email">[email placeholder]</span>
        <span className="footer-note">GitHub · no password · plain URLs</span>
      </div>
    </footer>
  );
}
