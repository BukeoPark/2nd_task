// 랜딩 사이트 주소 — 검색 노출(canonical·sitemap·공유 미리보기)에 쓴다. 빌드할 때 NEXT_PUBLIC_SITE_URL 로 정하고, 없으면 로컬 개발 주소를 쓴다.
// 다른 모듈을 import 하지 않는 순수 함수(tests/site.test.ts).

export const DEFAULT_SITE_URL = "http://localhost:3000";

/** 끝의 슬래시·공백을 정리하고, 비어 있거나 http(s) 주소가 아니면 로컬 개발 주소를 쓴다. */
export function normalizeSiteUrl(raw: string | undefined): string {
  const v = (raw ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s/]+/.test(v) ? v : DEFAULT_SITE_URL;
}

/** 실제 서비스 주소가 정해진 배포인지 — 로컬 개발 주소면 검색 로봇이 색인하지 않게 한다. */
export function isProductionSite(siteUrl: string): boolean {
  return !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(siteUrl);
}
