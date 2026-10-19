import { HeroMap, ReportThumb } from "../components/Art";
import { FlowTabs } from "../components/FlowTabs";
import { ModeCards } from "../components/ModeCards";
import { FAQ, HERO, REPORT_PAGES, SCOPE_NOTE, SOURCES, TRUST } from "../lib/content";
import { appLink, normalizeAppUrl } from "../lib/links";

// 지도 앱 주소 — 빌드할 때 NEXT_PUBLIC_APP_URL 로 정한다(없으면 로컬 개발 주소).
const APP_URL = normalizeAppUrl(process.env.NEXT_PUBLIC_APP_URL);

export default function Page() {
  return (
    <>
      <header className="header">
        <div className="wrap">
          <a className="brand" href="#top">상권<b>분석</b></a>
          <nav className="nav" aria-label="주요 메뉴">
            <a href="#flow">이용 흐름</a>
            <a href="#report">샘플 리포트</a>
            <a href="#trust">믿는 이유</a>
            <a href="#faq">질문</a>
          </nav>
          <a className="btn small primary" href={appLink(APP_URL, "owner")}>지도 열기</a>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="wrap">
            <div>
              <span className="badge">{HERO.eyebrow}</span>
              <h1>{HERO.title[0]}<br /><em>{HERO.title[1]}</em></h1>
              <p className="lead">{HERO.sub}</p>
              <ModeCards appUrl={APP_URL} />
            </div>
            <div className="hero-art"><HeroMap /></div>
          </div>
        </section>

        <section className="section" id="flow">
          <div className="wrap"><FlowTabs /></div>
        </section>

        <section className="section dark" id="report">
          <div className="wrap">
            <p className="eyebrow">인사이트 리포트</p>
            <h2 className="h2" style={{ marginTop: 8 }}>본 것을 4쪽으로 정리해 드려요</h2>
            <p className="lead" style={{ marginTop: 14 }}>버튼 하나를 누르면, 매출 수준과 흐름·시간대·경쟁·폐업을 한 번에 읽을 수 있는 리포트가 만들어져요. 자영업자는 내 가게 기준으로, 예비 창업자는 후보 상권 기준으로 받을 수 있고, 인쇄하거나 PDF로 저장할 수도 있어요.</p>
            <div className="reports">
              {REPORT_PAGES.map((p) => (
                <div className="rp" key={p.n}>
                  <div className="thumb"><ReportThumb n={p.n} /></div>
                  <span className="n">{p.n}쪽</span>
                  <b>{p.title}</b>
                  <span>{p.body}</span>
                </div>
              ))}
            </div>
            <p className="note">그림은 문래역 상권·한식 업종의 집계 값(서울시 상권분석서비스 2026년 2분기 등)으로 만든 예시이며, 특정 업소의 자료가 아니에요.</p>
          </div>
        </section>

        <section className="section" id="trust">
          <div className="wrap">
            <p className="eyebrow">믿는 이유</p>
            <h2 className="h2" style={{ marginTop: 8 }}>숫자를 보여 주는 만큼, 한계도 말해요</h2>
            <div className="trust">
              {TRUST.map((t) => (
                <div className="tr" key={t.title}><i aria-hidden="true" /><h3>{t.title}</h3><p>{t.body}</p></div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="faq" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <p className="eyebrow">자주 묻는 질문</p>
            <h2 className="h2" style={{ marginTop: 8 }}>궁금한 점</h2>
            <div className="faq">
              {FAQ.map((f) => (
                <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>
              ))}
            </div>
          </div>
        </section>

        <section className="section cta" style={{ background: "var(--card)", borderTop: "1px solid var(--line)" }}>
          <div className="wrap">
            <h2 className="h2">지금 우리 상권을 열어 볼까요?</h2>
            <p className="lead" style={{ margin: "14px auto 0" }}>{SCOPE_NOTE}</p>
            <ModeCards appUrl={APP_URL} />
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap">
          <p><strong>자료 출처</strong></p>
          <ul>{SOURCES.map((s) => <li key={s}>{s}</li>)}</ul>
          <p>이 서비스의 매출은 카드 결제 기반 추정치이며 개별 가게의 실제 매출이 아닙니다. 분석은 참고용이고, 창업·운영의 최종 판단은 현장 상황과 함께 하세요.</p>
        </div>
      </footer>
    </>
  );
}
