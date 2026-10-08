import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../lib/apiClient";

const LONG = 10 * 60 * 1000;

export function useStoreDetail(storeId: string) {
  return useQuery({ queryKey: ["store", storeId], queryFn: () => apiClient.getStore(storeId), staleTime: LONG });
}

export function useNearbyAnalysis(storeId: string, radiusM: number) {
  return useQuery({
    queryKey: ["nearby", storeId, radiusM],
    queryFn: () => apiClient.getNearbyAnalysis(storeId, radiusM),
    staleTime: LONG,
  });
}

/** Google 장소 연결은 사용자가 'Google 고객평가'를 열었을 때만(enabled) 호출한다. 결과는 세션 동안 재사용. */
export function useGooglePlaceLink(storeId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["google-place", storeId],
    queryFn: () => apiClient.getGooglePlaceLink(storeId),
    enabled,
    staleTime: Infinity,
    retry: false,
  });
}
