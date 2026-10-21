import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LandingPage } from "./features/landing/LandingPage";
import { ApiError } from "./lib/apiClient";
import { NAVIGATE_EVENT } from "./lib/navigate";
import { resolveRoute, type Page } from "./lib/route";
import { MapPage } from "./pages/MapPage";

// 조회가 실패하면 한 번만 다시 시도하고 곧바로 '조회 실패 + 다시 시도' 화면을 보인다(기본값은 3번·약 7초 재시도라 그동안
// 화면이 '재조회 중'으로만 보여 실패를 알기 어렵다). 4xx(잘못된 요청)는 다시 해도 같으니 재시도하지 않는다.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: (failureCount, error) => failureCount < 1 && !(error instanceof ApiError && error.status < 500) },
  },
});

const TITLES: Record<Page, string> = { landing: "상권분석 — 내 가게든 창업 자리든, 상권부터 숫자로 확인하세요", map: "상권 분석 지도" };

/** 지금 주소가 가리키는 화면. 예전 주소('/?mode=…')나 모르는 경로는 안전한 주소로 바꿔 둔다(기록 칸은 늘리지 않음, 검색값·기록 상태는 그대로). */
function readPage(): Page {
  const { pathname, search, hash } = window.location;
  const r = resolveRoute(pathname, search);
  if (r.canonical) window.history.replaceState(window.history.state, "", `${r.canonical}${hash}`);
  return r.page;
}

function App() {
  // 한 주소(5173)에서 '/' = 랜딩, '/map' = 지도·보고서. 이동은 앱 안 이벤트·브라우저 뒤로/앞으로로만 바뀐다(라우터 라이브러리 없음).
  const [page, setPage] = useState<Page>(readPage);
  useEffect(() => {
    const sync = () => setPage(readPage());
    window.addEventListener("popstate", sync);
    window.addEventListener(NAVIGATE_EVENT, sync);
    return () => { window.removeEventListener("popstate", sync); window.removeEventListener(NAVIGATE_EVENT, sync); };
  }, []);
  useEffect(() => { document.title = TITLES[page]; }, [page]);
  return (
    <QueryClientProvider client={queryClient}>
      {page === "map" ? <MapPage /> : <LandingPage />}
    </QueryClientProvider>
  );
}

export default App;
