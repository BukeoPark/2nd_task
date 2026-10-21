import { AppLink } from "../../components/AppLink";
import { mapHref } from "../../lib/route";
import { MODE_CARDS } from "./content";

/** 자영업자 / 예비 창업자 시작 카드 — 누르면 같은 앱의 지도(/map?mode=…)가 그 모드로 열린다. */
export function ModeCards() {
  return (
    <div className="modes">
      {MODE_CARDS.map((m) => (
        <AppLink key={m.mode} className={`mode ${m.mode}`} to={mapHref(m.mode)}>
          <span className="name">{m.name}</span>
          <span className="lead2">{m.lead}</span>
          <span className="go">{m.cta} →</span>
        </AppLink>
      ))}
    </div>
  );
}
