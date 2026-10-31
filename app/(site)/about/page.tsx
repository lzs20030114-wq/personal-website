import { Pick } from '../../../components/site/CaseLang';
import './about.css';

export const metadata = { title: 'About' };

/**
 * About（MAPPING §82）。2026-10-31 作者：「about 页不用写这么复杂，这些东西之前全都有，只写联系方式就 OK」——
 * 自我介绍、经历在首页 03 About 屏，项目在案例页，这一页只留名字和联系方式。电话不上站。
 * 外壳与日志页同一套深色（DarkHeader + 主青色面页脚，语言在顶栏切）；页头复用 .ld-meta / .ld-h1。
 */
export default function AboutPage() {
  return (
    <>
      <div className="ground-plane" aria-hidden />
      <div className="shell pg-dark ab">
        <header className="ab-head">
          <p className="ld-meta">
            <Pick en="About" zh="关于" />
          </p>
          <h1 className="ld-h1">
            <Pick
              en={
                <>
                  Zishuo Li<span className="ld-h1__dot">.</span>
                </>
              }
              zh="李梓硕"
            />
          </h1>
        </header>
        <dl className="ab-contact">
          <div>
            <dt>
              <Pick en="Email" zh="邮箱" />
            </dt>
            <dd>
              <a href="mailto:lzs20030114@gmail.com">lzs20030114@gmail.com</a>
            </dd>
          </div>
          <div>
            <dt>
              <Pick en="Based in" zh="所在地" />
            </dt>
            <dd>
              <Pick en="Beijing" zh="北京" />
            </dd>
          </div>
        </dl>
      </div>
    </>
  );
}
