import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../lib/apiClient";

export function useRegions() {
  return useQuery({
    queryKey: ["regions"],
    queryFn: () => apiClient.getRegions(),
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
