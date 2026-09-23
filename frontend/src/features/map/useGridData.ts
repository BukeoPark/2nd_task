import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../lib/apiClient";

export function useGridData(sizeM: number) {
  return useQuery({
    queryKey: ["grid", sizeM],
    queryFn: () => apiClient.getGrid(sizeM),
    staleTime: 5 * 60 * 1000, // 파이프라인 산출물은 자주 안 바뀌므로 5분간 재요청 안 함
  });
}

export function useRegions() {
  return useQuery({
    queryKey: ["regions"],
    queryFn: () => apiClient.getRegions(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useDongMetrics() {
  return useQuery({
    queryKey: ["dong-metrics"],
    queryFn: () => apiClient.getDongMetrics(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useDongTrend() {
  return useQuery({
    queryKey: ["dong-trend"],
    queryFn: () => apiClient.getDongTrend(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRebZones() {
  return useQuery({
    queryKey: ["reb-zones"],
    queryFn: () => apiClient.getRebZones(),
    staleTime: 5 * 60 * 1000,
  });
}
