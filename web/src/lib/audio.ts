export function audioUrl(wordId: number, variant: "uk" | "us"): string {
  return `/api/words/${wordId}/audio/${variant}`;
}
