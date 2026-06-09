export interface Word {
  id: number;
  word: string;
  source: string;
  stage: number | null;
  phonetic: string | null;
  pos: string | null;
  meaning_cn: string | null;
  meaning_en: string | null;
  root: string | null;
  association: string | null;
  collocations: string | null;
  derivatives: string | null;
  references: string | null;
}

export interface Example {
  id: number;
  word_id: number;
  sentence: string;
  translation: string | null;
}

export interface Synonym {
  id: number;
  word_id: number;
  synonym: string;
}

export interface LearningStatus {
  id: number;
  word_id: number;
  status: string;
  review_count: number;
  correct_count: number;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  ease_factor: number;
  interval_days: number;
}

export interface WordDetail {
  word: Word;
  examples: Example[];
  synonyms: Synonym[];
  learning_status: LearningStatus | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    per_page: number;
    total: number;
  };
}

export interface ListWordsParams {
  page?: number;
  per_page?: number;
  source?: string;
  status?: string;
  stage?: number;
  q?: string;
}

export interface QuizQuestion {
  word_id: number;
  word: string;
  question: string;
  options: string[];
  correct_index: number;
}

export interface Quiz {
  id: number;
  questions: QuizQuestion[];
}

export interface QuizResult {
  total: number;
  correct: number;
  details: QuizResultItem[];
}

export interface QuizResultItem {
  word_id: number;
  word: string;
  correct: boolean;
  correct_answer: string;
  user_answer: string;
}

export interface GenerateQuizParams {
  count?: number;
  source?: string;
  type?: string;
}
