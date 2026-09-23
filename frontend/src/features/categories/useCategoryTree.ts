import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../lib/apiClient";

export function useCategoryTree() {
  return useQuery({ queryKey: ["category-tree"], queryFn: () => apiClient.getCategoryTree(), staleTime: Infinity });
}
