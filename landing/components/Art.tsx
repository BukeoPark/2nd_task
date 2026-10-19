import { HERO_BUBBLES, type FlowStep } from "../lib/content";

const BLUE = "var(--blue)";
const ORANGE = "var(--orange)";

const Frame = ({ w, h, label, children }: { w: number; h: number; label: string; children: React.ReactNode }) => (
  <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="art">{children}</svg>
);

/** 첫 화면: 외식업 점포 수를 원으로 보여 주는 지도 그림(예시). 원 넓이는 점포 수에 비례한다. */
export function HeroMap() {
  const r = (n: number) => Math.sqrt(n) * 1.02;
  return (
    <Frame w={500} h={400} label="행정동별 외식업 점포 수를 원 크기로 보여 주는 지도 예시. 여의동 2,073곳, 영등포동 1,077곳, 문래동 716곳">
      <rect width="500" height="400" rx="20" fill="var(--map)" />
      {[80, 160, 240, 320].map((y) => <line key={y} x1="0" x2="500" y1={y} y2={y} stroke="var(--map-line)" />)}
      {[100, 200, 300, 400].map((x) => <line key={x} y1="0" y2="400" x1={x} x2={x} stroke="var(--map-line)" />)}
      <path d="M-10 190 C 90 150, 170 215, 250 170 S 400 130, 510 175 L510 215 C 400 175, 300 215, 250 215 S 90 195, -10 235 Z" fill="var(--river)" />
      {HERO_BUBBLES.map((b, i) => (
        <g key={b.name}>
          {i === 2 && <circle cx={b.x} cy={b.y} r={r(b.n) + 9} fill="none" stroke={ORANGE} strokeWidth="2.5" strokeDasharray="5 4" />}
          <circle cx={b.x} cy={b.y} r={r(b.n)} fill={i === 2 ? ORANGE : BLUE} opacity="0.88" />
          <text x={b.x} y={b.y - 2} textAnchor="middle" className="art-t art-w">{b.name}</text>
          <text x={b.x} y={b.y + 13} textAnchor="middle" className="art-t art-w art-n">{b.n.toLocaleString("ko-KR")}곳</text>
        </g>
      ))}
      <g transform="translate(332 372)">
        <rect width="150" height="18" rx="9" fill="var(--card)" opacity="0.92" />
        <text x="75" y="12.5" textAnchor="middle" className="art-t art-m">예시 · 원 크기 = 외식업 점포 수</text>
      </g>
      <g transform="translate(226 270)">
        <rect width="86" height="22" rx="11" fill={ORANGE} />
        <text x="43" y="15" textAnchor="middle" className="art-t art-w">내 상권</text>
      </g>
    </Frame>
  );
}

const card = { fill: "var(--card)", stroke: "var(--line)" } as const;

/** 단계별 화면 미리보기(그림) — 실제 화면의 구조를 단순하게 옮긴 것이다. */
export function Glimpse({ art }: { art: FlowStep["art"] }) {
  switch (art) {
    case "search":
      return (
        <Frame w={260} h={160} label="검색창에 가게 이름을 입력하는 화면">
          <rect x="14" y="14" width="232" height="132" rx="12" {...card} />
          <rect x="28" y="30" width="204" height="30" rx="15" fill="var(--soft)" stroke="var(--line)" />
          <circle cx="46" cy="45" r="6" fill="none" stroke="var(--mute)" strokeWidth="2" />
          <text x="62" y="49" className="art-t art-m">가게 이름·주소 검색</text>
          {[0, 1].map((i) => (
            <g key={i} transform={`translate(28 ${74 + i * 30})`}>
              <rect width="204" height="24" rx="6" fill={i === 0 ? "var(--blue-soft)" : "var(--soft)"} />
              <rect x="10" y="9" width={i === 0 ? 96 : 70} height="6" rx="3" fill={i === 0 ? BLUE : "var(--line)"} />
              <text x="194" y="16" textAnchor="end" className="art-t art-m">{i === 0 ? "매장" : "주소"}</text>
            </g>
          ))}
        </Frame>
      );
    case "area":
      return (
        <Frame w={260} h={160} label="소속 상권 종합분석 패널과 왼쪽 메뉴">
          <rect x="14" y="14" width="232" height="132" rx="12" {...card} />
          <rect x="14" y="14" width="42" height="132" rx="12" fill="var(--soft)" />
          {["요약", "성장", "수요"].map((t, i) => (
            <g key={t} transform={`translate(20 ${26 + i * 34})`}>
              <rect width="30" height="26" rx="6" fill={i === 0 ? "var(--blue-soft)" : "transparent"} />
              <text x="15" y="17" textAnchor="middle" className="art-t art-m" fill={i === 0 ? BLUE : undefined}>{t}</text>
            </g>
          ))}
          <text x="70" y="38" className="art-t art-b">발달상권 · 종합분석</text>
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(70 ${52 + i * 28})`}>
              <rect width="164" height="22" rx="6" fill="var(--soft)" />
              <rect x="8" y="8" width={[70, 94, 54][i]} height="6" rx="3" fill="var(--line)" />
              <text x="156" y="15" textAnchor="end" className="art-t art-b">{["378곳", "1,708만", "+9.4%"][i]}</text>
            </g>
          ))}
        </Frame>
      );
    case "rank":
      return (
        <Frame w={260} h={160} label="상권별 지표 순위 막대">
          <rect x="14" y="14" width="232" height="132" rx="12" {...card} />
          <rect x="28" y="24" width="84" height="18" rx="9" fill="var(--soft)" stroke="var(--line)" />
          <text x="70" y="37" textAnchor="middle" className="art-t art-m">지표: 폐업률</text>
          {[
            ["영등포구청역", 0.55],
            ["문래역", 0.82],
            ["당산역", 0.46],
            ["양평역", 0.36],
            ["목동역", 0.28],
          ].map(([n, v], i) => (
            <g key={String(n)} transform={`translate(28 ${52 + i * 17})`}>
              <text y="9" className="art-t art-m">{n}</text>
              <rect x="64" width={Number(v) * 150} height="11" rx="5.5" fill={i === 1 ? ORANGE : BLUE} opacity={i === 1 ? 1 : 0.55} />
            </g>
          ))}
        </Frame>
      );
    case "mine":
      return (
        <Frame w={260} h={160} label="내 월 매출 변화와 상권 평균 변화를 견주는 선 그래프">
          <rect x="14" y="14" width="232" height="132" rx="12" {...card} />
          <text x="28" y="34" className="art-t art-b">내 흐름 vs 상권 같은 업종</text>
          <line x1="28" x2="232" y1="124" y2="124" stroke="var(--line)" />
          <polyline points="30,100 78,92 126,96 174,76 226,70" fill="none" stroke="var(--mute)" strokeWidth="2.5" strokeDasharray="5 4" />
          <polyline points="30,108 78,98 126,84 174,70 226,50" fill="none" stroke={ORANGE} strokeWidth="3" strokeLinejoin="round" />
          <circle cx="226" cy="50" r="4.5" fill={ORANGE} />
          <g transform="translate(28 40)"><rect width="8" height="3" y="2" fill={ORANGE} /><text x="12" y="6" className="art-t art-m">내 가게</text><rect x="60" width="8" height="3" y="2" fill="var(--mute)" /><text x="72" y="6" className="art-t art-m">상권 평균</text></g>
        </Frame>
      );
    case "report":
      return (
        <Frame w={260} h={160} label="4쪽 인사이트 리포트 첫 쪽 미리보기">
          <rect x="70" y="10" width="120" height="142" rx="4" {...card} />
          <rect x="82" y="22" width="60" height="6" rx="3" fill={ORANGE} />
          <rect x="82" y="34" width="96" height="9" rx="3" fill="var(--ink)" />
          <rect x="82" y="47" width="70" height="9" rx="3" fill="var(--ink)" />
          {[0, 1, 2, 3].map((i) => <rect key={i} x={82 + (i % 2) * 49} y={66 + Math.floor(i / 2) * 22} width="45" height="18" rx="3" fill="var(--soft)" />)}
          {[0, 1, 2].map((i) => <rect key={i} x="82" y={116 + i * 10} width={96 - i * 14} height="4" rx="2" fill="var(--line)" />)}
        </Frame>
      );
    case "pick":
      return (
        <Frame w={260} h={160} label="후보 지역을 비교 목록에 담는 화면">
          <rect x="14" y="14" width="232" height="132" rx="12" {...card} />
          <text x="28" y="36" className="art-t art-b">비교 후보 (3/4)</text>
          {["문래역", "당산역", "영등포구청역"].map((n, i) => (
            <g key={n} transform={`translate(28 ${46 + i * 26})`}>
              <rect width="204" height="21" rx="10.5" fill="var(--blue-soft)" />
              <text x="12" y="14.5" className="art-t art-b" fill={BLUE}>{n}</text>
              <text x="192" y="14.5" textAnchor="end" className="art-t art-m">✕</text>
            </g>
          ))}
        </Frame>
      );
    default:
      return (
        <Frame w={260} h={160} label="후보 세 곳을 나란히 비교하는 표">
          <rect x="14" y="14" width="232" height="132" rx="12" {...card} />
          {["문래역", "당산역", "구청역"].map((n, i) => <text key={n} x={96 + i * 54} y="36" textAnchor="middle" className="art-t art-b">{n}</text>)}
          {["점포 수", "월매출", "폐업률"].map((m, r) => (
            <g key={m} transform={`translate(28 ${50 + r * 30})`}>
              <text y="12" className="art-t art-m">{m}</text>
              {[0, 1, 2].map((c) => <rect key={c} x={54 + c * 54 + 0} y="2" width={[40, 28, 34, 36, 40, 22, 20, 30, 38][r * 3 + c]} height="12" rx="6" fill={r === 2 && c === 0 ? ORANGE : BLUE} opacity={r === 2 && c === 0 ? 1 : 0.55} />)}
            </g>
          ))}
        </Frame>
      );
  }
}

/** 샘플 리포트 4쪽의 축소 그림. 숫자는 문래역 상권·한식 업종의 집계 값(2026년 2분기)이다. */
export function ReportThumb({ n }: { n: 1 | 2 | 3 | 4 }) {
  const frame = { x: 6, y: 6, width: 188, height: 248, rx: 4, ...card };
  return (
    <Frame w={200} h={260} label={`샘플 리포트 ${n}쪽 미리보기`}>
      <rect {...frame} />
      <rect x="18" y="18" width="52" height="5" rx="2.5" fill={ORANGE} />
      {n === 1 && (
        <>
          <rect x="18" y="30" width="150" height="10" rx="3" fill="var(--ink)" />
          <rect x="18" y="45" width="108" height="10" rx="3" fill="var(--ink)" />
          {[["3,934만", "월평균 추정매출"], ["4위", "55곳 중"], ["-2.6%", "전년 동기"], ["19.7%", "연 폐업률"]].map(([v, l], i) => (
            <g key={v} transform={`translate(${18 + (i % 2) * 87} ${68 + Math.floor(i / 2) * 50})`}>
              <rect width="81" height="44" rx="4" fill="var(--soft)" />
              <text x="8" y="22" className="art-t art-big" fill={i > 1 ? "var(--bad)" : i === 1 ? ORANGE : undefined}>{v}</text>
              <text x="8" y="36" className="art-t art-m">{l}</text>
            </g>
          ))}
          {[0, 1, 2].map((i) => <rect key={i} x="18" y={176 + i * 22} width={150 - i * 12} height="6" rx="3" fill="var(--line)" />)}
        </>
      )}
      {n === 2 && (
        <>
          <rect x="18" y="30" width="140" height="9" rx="3" fill="var(--ink)" />
          {[6, 10, 18, 30, 24, 16, 8, 5, 3, 2, 1, 1, 1].map((h, i) => <rect key={i} x={20 + i * 12.6} y={150 - h * 3.4} width="10" height={h * 3.4} fill={i === 7 ? ORANGE : "var(--slate)"} opacity={i === 7 ? 1 : 0.55} />)}
          <polyline points="20,200 52,186 84,194 116,190 148,184 180,190" fill="none" stroke={ORANGE} strokeWidth="2.5" />
          <line x1="20" x2="184" y1="212" y2="212" stroke="var(--line)" />
          <rect x="18" y="226" width="130" height="5" rx="2.5" fill="var(--line)" />
        </>
      )}
      {n === 3 && (
        <>
          <rect x="18" y="30" width="150" height="9" rx="3" fill="var(--ink)" />
          {[[2, 3, 20], [1, 3, 21], [20, 33, 15], [6, 9, 15], [55, 41, 17], [19, 14, 11]].map(([a, b, c], i) => (
            <g key={i}>
              <rect x={22 + i * 28} y={140 - a * 1.7} width="7" height={a * 1.7} fill={ORANGE} />
              <rect x={30 + i * 28} y={140 - b * 1.7} width="7" height={b * 1.7} fill="var(--slate)" opacity="0.6" />
              <rect x={38 + i * 28} y={140 - c * 1.7} width="7" height={c * 1.7} fill="var(--teal)" />
            </g>
          ))}
          <line x1="18" x2="186" y1="140" y2="140" stroke="var(--line)" />
          {[0, 1, 2, 3].map((i) => <rect key={i} x="18" y={160 + i * 14} width={150 - (i % 2) * 40} height="5" rx="2.5" fill="var(--line)" />)}
        </>
      )}
      {n === 4 && (
        <>
          <rect x="18" y="30" width="150" height="9" rx="3" fill="var(--ink)" />
          {[[10, 9], [15, 10], [21, 21], [28, 18], [20, 13], [10, 22], [21, 20], [25, 24], [16, 18]].map(([o, c], i) => (
            <g key={i}>
              <rect x={20 + i * 18} y={130 - o * 2.6} width="7" height={o * 2.6} fill="var(--teal)" />
              <rect x={28 + i * 18} y={130 - c * 2.6} width="7" height={c * 2.6} fill={ORANGE} />
            </g>
          ))}
          <line x1="18" x2="186" y1="130" y2="130" stroke="var(--line)" />
          {[0, 1, 2].map((i) => <g key={i}><line x1="60" x2="170" y1={158 + i * 20} y2={158 + i * 20} stroke={i === 0 ? ORANGE : "var(--slate)"} strokeWidth="3" /><circle cx={[110, 90, 120][i]} cy={158 + i * 20} r="4" fill={i === 0 ? ORANGE : "var(--card)"} stroke={i === 0 ? ORANGE : "var(--slate)"} strokeWidth="2" /></g>)}
        </>
      )}
    </Frame>
  );
}
