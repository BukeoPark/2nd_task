import { SUMMARY_PREVIEW as P } from "./content";

/** 지도 앱 '요약' 화면의 구성(확인된 사실 → 어떻게 읽을까? → 다음 확인사항)을 본뜬 미리보기 — 값은 lib/content.ts 의 공식 통계 집계 값이다. */
export function SummaryPreview() {
  return (
    <figure className="preview" aria-label="지도 앱 요약 화면 미리보기">
      <div className="ui">
        <div className="ui-eyebrow">{P.eyebrow}</div>
        <div className="ui-scope">{P.scope}</div>
        <div className="ui-h">① 확인된 사실</div>
        <div className="ui-facts">
          {P.facts.map((f) => (
            <div className="ui-fact" key={f.label}>
              <span>{f.label}</span>
              <b>{f.value}</b>
              <i>{f.note}</i>
            </div>
          ))}
        </div>
        <div className="ui-h">② 어떻게 읽을까?</div>
        <ul className="ui-read">{P.reading.map((r) => <li key={r}>{r}</li>)}</ul>
        <div className="ui-h">③ 다음 확인사항</div>
        <div className="ui-next">
          {P.next.map((n, i) => <span key={n} className={i === 0 ? "p" : ""}>{n} <em aria-hidden="true">›</em></span>)}
        </div>
      </div>
      <figcaption>{P.caption}</figcaption>
    </figure>
  );
}
