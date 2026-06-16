import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ListWordsParams } from "@/lib/types";

export function useWords(params?: ListWordsParams) {
  return useQuery({
    queryKey: ["words", params],
    queryFn: () => api.listWords(params),
    enabled: params !== undefined,
  });
}

export function useWord(id: number) {
  return useQuery({
    queryKey: ["word", id],
    queryFn: () => api.getWord(id),
    enabled: !!id,
  });
}

export function useNextReview(limit = 20) {
  return useQuery({
    queryKey: ["review-next", limit],
    queryFn: () => api.getNextReview(limit),
  });
}
