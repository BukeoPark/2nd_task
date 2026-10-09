import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiClient, type FoodLevel, type FoodMetric } from "../../lib/apiClient";

const LONG = 10 * 60 * 1000;

export interface Bounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export function useFoodCategories() {
  return useQuery({ queryKey: ["food-categories"], queryFn: () => apiClient.getFoodCategories(), staleTime: Infinity });
}

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

/** 버블 하나에 속한 매장 — 버블 점포 수와 같은 경계 기준. */
export function useFoodUnitStores(level: FoodLevel, code: string, svc: string | null, scls: string | null) {
  return useQuery({
    queryKey: ["food-unit-stores", level, code, svc, scls],
    queryFn: () => apiClient.getFoodUnitStores(level, code, svc, scls),
    staleTime: LONG,
  });
}

export function useFoodAnchors(enabled: boolean) {
  return useQuery({ queryKey: ["food-anchors"], queryFn: () => apiClient.getFoodAnchors(), enabled, staleTime: Infinity });
}
