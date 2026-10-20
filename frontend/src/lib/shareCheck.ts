// 공유 주소(?unit=…&svc=…&scls=…)나 관심 지역을 열 때, 지원하지 않는 업종·없는 지역이면 빈 화면 대신 알려 주는 판정.
// 업종 목록·지역 목록이 도착한 뒤에만 판정한다(도착 전에는 문제 없음으로 본다). 다른 모듈을 import 하지 않는 순수 함수(tests/shareCheck.test.ts).

export interface ShareCheckInput {
  svc: string | null;
  scls: string | null;
  /** 지원하는 서울시 업종 코드와 그 세부 업종 코드(아직 못 받았으면 null) */
  groups: { svc_cd: string; details: { code: string }[] }[] | null;
  /** 열려는 지역 — 없으면 null */
  pending: { code: string } | null;
  /** 그 단위의 지역 코드 목록(해당 단위 목록이 도착했을 때만, 아니면 null) */
  unitCodes: string[] | null;
}

export interface ShareIssue {
  /** 업종 코드를 지원하지 않아 '외식 전체'로 연다 */
  svcInvalid: boolean;
  /** 세부 업종 코드가 그 업종에 없어 '업종 전체'로 연다 */
  sclsInvalid: boolean;
  /** 열려는 지역 코드가 이 지도에 없다 */
  unitMissing: boolean;
}

export function checkShare(i: ShareCheckInput): ShareIssue {
  const group = i.svc && i.groups ? i.groups.find((g) => g.svc_cd === i.svc) : undefined;
  const svcInvalid = Boolean(i.svc && i.groups && !group);
  const sclsInvalid = Boolean(i.scls && !svcInvalid && group && !group.details.some((d) => d.code === i.scls));
  const unitMissing = Boolean(i.pending && i.unitCodes && !i.unitCodes.includes(i.pending.code));
  return { svcInvalid, sclsInvalid, unitMissing };
}

/** 사용자에게 보일 한 문장(문제가 없으면 null) */
export function shareIssueText(x: ShareIssue): string | null {
  const parts: string[] = [];
  if (x.unitMissing) parts.push("주소에 담긴 지역을 이 지도에서 찾지 못했어요(파일럿 범위는 양천구·영등포구입니다).");
  if (x.svcInvalid) parts.push("주소에 담긴 업종을 지원하지 않아 '외식 전체'로 열었어요.");
  else if (x.sclsInvalid) parts.push("주소에 담긴 세부 업종을 찾지 못해 업종 전체로 열었어요.");
  return parts.length ? parts.join(" ") : null;
}
