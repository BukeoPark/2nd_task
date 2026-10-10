import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiClient, type FoodLevel, type FoodMetric, type UnitStoreSort } from "../../lib/apiClient";

const LONG = 10 * 60 * 1000;
export const UNIT_STORE_PAGE = 50;

export interface Bounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export function useFoodCategories() {
  return useQuery({ queryKey: ["food-categories"], queryFn: () => apiClient.getFoodCategories(), staleTime: Infinity });
}

/** 지도 버블. 조건(업종·지표·단위)이 바뀌면 새 결과가 올 때까지 이전 결과를 보여 주되(화면 깜빡임 방지),
 * isPlaceholderData 로 '지금 보이는 것은 이전 조건의 결과'임을 화면이 알 수 있다 — 그 동안 클릭·비교는 막는다. */
export function useFoodBubbles(level: FoodLevel | null, metric: FoodMetric, svc: string | null, scls: string | null) {
  return useQuery({
    queryKey: ["food-bubbles", level, metric, svc, scls],
    queryFn: () => apiClient.getFoodBubbles(level!, metric, svc, scls),
    enabled: level !== null,
    staleTime: LONG,
    placeholderData: keepPreviousData,
  });
}

export function useFoodStores(bounds: Bounds | null, svc: string | null, scls: string | null) {
  // 지도를 조금씩 움직일 때마다 새로 부르지 않도록 범위를 소수 3자리(약 100m)로 맞춘다.
  const key = bounds && [bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat].map((v) => v.toFixed(3));
  return useQuery({
    queryKey: ["food-stores", key, svc, scls],
    queryFn: () => apiClient.getFoodStores(bounds!, svc, scls),
    enabled: bounds !== null,
    staleTime: LONG,
    placeholderData: keepPreviousData,
  });
}

/** 버블 하나에 속한 매장 — 버블 점포 수와 같은 경계 기준. 50곳씩 '더 보기'로 이어 받는다.
 * 업종·정렬이 바뀌면 키가 달라져 처음부터 다시 받으므로 이전 조건의 목록과 섞이지 않는다. */
export function useFoodUnitStores(level: FoodLevel, code: string, svc: string | null, scls: string | null, sort: UnitStoreSort) {
  return useInfiniteQuery({
    queryKey: ["food-unit-stores", level, code, svc, scls, sort],
    queryFn: ({ pageParam }) => apiClient.getFoodUnitStores(level, code, svc, scls, pageParam, sort, UNIT_STORE_PAGE),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_offset ?? undefined,
    staleTime: LONG,
  });
}

/** 비교표. 담은 곳·업종이 바뀌면 이전 표를 흐리게 보여 주고(isPlaceholderData) 새 계산이 끝나면 바뀐다. */
export function useFoodCompare(level: FoodLevel | null, codes: string[], svc: string | null, scls: string | null) {
  return useQuery({
    queryKey: ["food-compare", level, codes, svc, scls],
    queryFn: () => apiClient.getFoodCompare(level!, codes, svc, scls),
    enabled: level !== null && codes.length > 0,
    staleTime: LONG,
    placeholderData: keepPreviousData,
  });
}

export function useFoodAnchors(enabled: boolean) {
  return useQuery({ queryKey: ["food-anchors"], queryFn: () => apiClient.getFoodAnchors(), enabled, staleTime: Infinity });
}

/** 위치·매장 검색. 2자 미만은 부르지 않는다. 같은 글자는 캐시를 쓴다. */
export function useSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ["search", q],
    queryFn: () => apiClient.searchPlaces(q),
    enabled: q.length >= 2,
    staleTime: LONG,
    retry: false,
  });
}
