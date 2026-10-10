import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../lib/apiClient";

const LONG = 10 * 60 * 1000;

export function useStoreDetail(storeId: string, enabled = true) {
  return useQuery({ queryKey: ["store", storeId], queryFn: () => apiClient.getStore(storeId), staleTime: LONG, enabled });
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

export function useStoreAnchors(storeId: string) {
  return useQuery({ queryKey: ["store-anchors", storeId], queryFn: () => apiClient.getStoreAnchors(storeId), staleTime: LONG });
}

/** 선택한 매장의 비교 단위·업종 안 매장과 단위 경계. 매장을 고르지 않았으면(null) 조회하지 않는다. */
export function usePeerStores(storeId: string | null) {
  return useQuery({
    queryKey: ["peer-stores", storeId],
    queryFn: () => apiClient.getPeerStores(storeId as string),
    enabled: storeId !== null,
    staleTime: LONG,
  });
}
