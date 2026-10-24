// 수도권 노선 배지: 이름 표기 차이를 정규화하고 모르는 노선은 원문을 유지한다.
const NUMBER_COLORS = ["#0052A4", "#00A84D", "#EF7C1C", "#00A5DE", "#996CAC", "#CD7C2F", "#747F00", "#E6186C", "#BDB092"];
export function railLineBadge(raw: string) {
  const name = raw.trim();
  if (/^(경부선|경인선|경원선|장항선)$/.test(name)) return { label: "1", color: NUMBER_COLORS[0], name: `1호선 (${name})` };
  const n = name.match(/(?:^|서울|수도권)([1-9])호선/);
  if (n) return { label: n[1], color: NUMBER_COLORS[Number(n[1]) - 1], name: `${n[1]}호선` };
  const named: [RegExp, string, string][] = [[/공항|인천국제공항/, "공항", "#0090D2"], [/경의|중앙/, "경의중앙", "#77C4A3"], [/수인|분당/, "수인분당", "#F5A200"], [/신분당/, "신분당", "#D4003B"], [/경춘/, "경춘", "#0C8E72"], [/신림/, "신림", "#6789CA"], [/우이/, "우이신설", "#B7C452"], [/서해/, "서해", "#8FC31F"], [/경강/, "경강", "#003DA5"]];
  // 신분당을 분당보다 먼저 판별한다.
  if (name.includes("신분당")) return { label: "신분당", color: "#D4003B", name };
  const hit = named.find(([pattern]) => pattern.test(name));
  return hit ? { label: hit[1], color: hit[2], name } : { label: name, color: "#64748B", name };
}
export function splitRailLines(lines: string) { return [...new Set(lines.split(/[,·+|/]/).map(x => x.trim()).filter(Boolean))]; }
