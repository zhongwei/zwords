import type {
  PaginatedResponse,
  Word,
  WordDetail,
  LearningStatus,
  ListWordsParams,
  Quiz,
  QuizResult,
  GenerateQuizParams,
} from "./types";

const BASE = "/api";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  listWords(params?: ListWordsParams): Promise<PaginatedResponse<Word>> {
    const sp = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) sp.set(k, String(v));
      }
    }
    return request(`/words?${sp.toString()}`);
  },

  getWord(id: number): Promise<WordDetail> {
    return request(`/words/${id}`);
  },

  getNextReview(limit = 20): Promise<WordDetail[]> {
    return request(`/review/next?limit=${limit}`);
  },

  submitReview(wordId: number, quality: number): Promise<LearningStatus> {
    return request(`/review/${wordId}/answer`, {
      method: "POST",
      body: JSON.stringify({ quality }),
    });
  },

  generateQuiz(params?: GenerateQuizParams): Promise<Quiz> {
    return request(`/quiz/generate`, {
      method: "POST",
      body: JSON.stringify(params || {}),
    });
  },

  submitQuiz(quizId: number, answers: { word_id: number; answer: string }[]): Promise<QuizResult> {
    return request(`/quiz/${quizId}/submit`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    });
  },
};
