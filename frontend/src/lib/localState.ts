// 브라우저 localStorage 읽기·쓰기 공통 도우미 — 서버로 보내지 않는 로컬 기록(관심 지역·최근 본 지역·창업 비용 점검·현장 확인)에 쓴다.
// 시크릿 창·차단·용량 초과에서 막힐 수 있어 모든 접근을 try/catch 로 감싸고, 막히면 저장만 포기한다(화면은 계속 쓸 수 있다).
// 다른 모듈을 import 하지 않는 순수 함수(tests/localState.test.ts).

export function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** 저장에 성공하면 true — 실패(막힘·용량)하면 false 이니 '새로고침하면 사라진다'고 알릴 수 있다. */
export function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): boolean {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
