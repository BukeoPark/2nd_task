import { useEffect } from "react";
import { AppLink } from "../../components/AppLink";
import { mapHref } from "../../lib/route";
import { ReportThumb } from "./Art";
import { FlowTabs } from "./FlowTabs";
import { ModeCards } from "./ModeCards";
import { SummaryPreview } from "./SummaryPreview";
import { FAQ, FEATURES, HERO, REPORT_PAGES, SCOPE_NOTE, SOURCES, TRUST } from "./content";
import "./landing.css";

/** 서비스 홈('/') — landing/app/page.tsx 와 같은 구성·문구다. 시작 버튼은 같은 앱의 /map?mode=… 로 이동한다(별도 랜딩 서버 없음). */
export function LandingPage() {
  useEffect(() => {
    // 해시가 붙은 주소('/#faq')로 들어오면 해당 구역으로 간다(이동 후에 그려지므로 브라우저 기본 동작이 닿지 않는다)
    if (window.location.hash) document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView();
  }, []);
  return (
    <div className="lp">
      <header className="header">
        <div className="wrap">
          <a className="brand" href="#top">상권<b>분석</b></a>
          <nav className="nav" aria-label="주요 메뉴">
            <a href="#features">기능</a>
            <a href="#flow">이용 흐름</a>
            <a href="#report">샘플 보고서</a>
            <a href="#trust">믿는 이유</a>
            <a href="#faq">질문</a>
          </nav>
          <AppLink className="btn small primary" to={mapHref("owner")}>지도 열기</AppLink>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="wrap">
            <div>
              <span className="badge">{HERO.eyebrow}</span>
              <h1><span>{HERO.title[0]}</span><span><em>{HERO.title[1]}</em></span></h1>
              <p className="lead">{HERO.sub}</p>
              <ModeCards />
              <p className="reportlink"><a href="#report">먼저 보고서가 어떤지 볼래요 — 샘플 상권분석 보고서 보기 →</a></p>
            </div>
            <div className="hero-art">
              <img src="/landing-map.jpg" width={900} height={720} alt="서비스 실제 지도 화면: 양천구·영등포구 행정동별 외식 점포 수를 원 크기로 보여 줍니다" />
              <span className="hero-art-cap">실제 서비스 화면 · 원 크기 = 외식업 점포 수</span>
            </div>
          </div>
        </section>

        <section className="section" id="features" style={{ paddingBottom: 0 }}>
          <div className="wrap features">
            <div>
              <p className="eyebrow">서비스에서 하는 일</p>
              <h2 className="h2" style={{ marginTop: 8 }}>지도에서 시작해, 판단에 필요한 숫자까지</h2>
              <ul className="feat">
                {FEATURES.map((f) => (
                  <li key={f.title}>
                    <div><b>{f.title}</b><span className={`who ${f.who === "모두" ? "all" : f.who === "자영업자" ? "o" : "f"}`}>{f.who}</span></div>
                    <p>{f.body}</p>
                  </li>
                ))}
              </ul>
            </div>
            <SummaryPreview />
          </div>
        </section>

        <section className="section" id="flow">
          <div className="wrap"><FlowTabs /></div>
        </section>

        <section className="section dark" id="report">
          <div className="wrap">
            <p className="eyebrow">상권분석 보고서</p>
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
            {/* 위쪽 시작 카드와 같은 내용을 되풀이하지 않고 버튼 둘로 마무리한다 */}
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 24 }}>
              <AppLink className="btn primary" to={mapHref("owner")}>자영업자로 시작하기 →</AppLink>
              <AppLink className="btn" to={mapHref("founder")}>예비 창업자로 시작하기 →</AppLink>
            </div>
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
    </div>
  );
}
