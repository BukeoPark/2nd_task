import { MODE_CARDS } from "../lib/content";
import { appLink } from "../lib/links";

/** 자영업자 / 예비 창업자 시작 카드 — 누르면 지도 앱이 그 모드로 열린다. */
export function ModeCards({ appUrl }: { appUrl: string }) {
  return (
    <div className="modes">
      {MODE_CARDS.map((m) => (
        <a key={m.mode} className={`mode ${m.mode}`} href={appLink(appUrl, m.mode)}>
          <span className="name">{m.name}</span>
          <span className="lead2">{m.lead}</span>
          <ul>{m.points.map((p) => <li key={p}>{p}</li>)}</ul>
          <span className="go">{m.cta} →</span>
        </a>
      ))}
    </div>
  );
}
