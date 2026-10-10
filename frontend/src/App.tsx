import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "./lib/apiClient";
import { MapPage } from "./pages/MapPage";

// 조회가 실패하면 한 번만 다시 시도하고 곧바로 '조회 실패 + 다시 시도' 화면을 보인다(기본값은 3번·약 7초 재시도라 그동안
// 화면이 '재조회 중'으로만 보여 실패를 알기 어렵다). 4xx(잘못된 요청)는 다시 해도 같으니 재시도하지 않는다.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: (failureCount, error) => failureCount < 1 && !(error instanceof ApiError && error.status < 500) },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MapPage />
    </QueryClientProvider>
  );
}

export default App;
