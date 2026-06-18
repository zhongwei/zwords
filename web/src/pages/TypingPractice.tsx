import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { useWords } from "@/hooks/useWords";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import TypingCard from "@/components/typing/TypingCard";
import TypingProgress from "@/components/typing/TypingProgress";
import TypingResult, { type TypingErrorWord } from "@/components/typing/TypingResult";
import type { ListWordsParams, Word } from "@/lib/types";

type Phase = "playing" | "result";

function parseListParams(sp: URLSearchParams): ListWordsParams {
  const params: ListWordsParams = { per_page: 100 };
  const page = sp.get("page");
  if (page) params.page = Number(page);
  const q = sp.get("q");
  if (q) params.q = q;
  const source = sp.get("source");
  if (source) params.source = source;
  const status = sp.get("status");
  if (status) params.status = status;
  return params;
}

interface WordResult {
  word_id: number;
  word: string;
  correct: boolean;
  error_count: number;
}

export default function TypingPractice() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const numericId = Number(id);

  const listParams = parseListParams(searchParams);
  const hasListContext = searchParams.has("page");
  const { data: listData } = useWords(hasListContext ? listParams : undefined);

  const [practiceWords, setPracticeWords] = useState<Word[] | null>(null);
  const [phase, setPhase] = useState<Phase>("playing");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<WordResult[]>([]);
  const [startTime, setStartTime] = useState<number>(0);
  const [totalTimeMs, setTotalTimeMs] = useState(0);
  const [showWord, setShowWord] = useState(true);

  useEffect(() => {
    if (practiceWords === null && listData) {
      const allWords = listData.data;
      const startIdx = allWords.findIndex((w) => w.id === numericId);
      const words = startIdx >= 0 ? allWords.slice(startIdx) : allWords;
      setPracticeWords(words);
      setStartTime(Date.now());
    }
  }, [listData, practiceWords, numericId]);

  const currentWord = practiceWords?.[currentIndex];

  const handleError = useCallback(() => {
    setResults((prev) => {
      const copy = [...prev];
      const existing = copy.find((r) => r.word_id === currentWord!.id);
      if (existing) {
        existing.error_count += 1;
        existing.correct = false;
      } else {
        copy.push({ word_id: currentWord!.id, word: currentWord!.word, correct: false, error_count: 1 });
      }
      return copy;
    });
  }, [currentWord]);

  const handleComplete = useCallback(() => {
    const isLast = currentIndex + 1 >= (practiceWords?.length ?? 0);
    const elapsed = Date.now() - startTime;

    setResults((prev) => {
      const copy = [...prev];
      const existing = copy.find((r) => r.word_id === currentWord!.id);
      if (existing) {
        existing.correct = existing.error_count === 0;
      } else {
        copy.push({ word_id: currentWord!.id, word: currentWord!.word, correct: true, error_count: 0 });
      }

      if (isLast) {
        api.submitTypingResult({
          results: copy.map((r) => ({
            word_id: r.word_id,
            correct: r.correct,
            error_count: r.error_count,
          })),
          total_time_ms: elapsed,
        }).catch(() => {});
      }

      return copy;
    });

    if (isLast) {
      setTotalTimeMs(elapsed);
      setPhase("result");
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }, [currentWord, currentIndex, practiceWords, startTime]);

  const handleRestartAll = () => {
    setPhase("playing");
    setCurrentIndex(0);
    setResults([]);
    setStartTime(Date.now());
    setTotalTimeMs(0);
  };

  const handleRetryErrors = () => {
    const errorWordIds = new Set(results.filter((r) => !r.correct).map((r) => r.word_id));
    const retryWords = practiceWords?.filter((w) => errorWordIds.has(w.id)) ?? [];
    setPracticeWords(retryWords);
    setPhase("playing");
    setCurrentIndex(0);
    setResults([]);
    setStartTime(Date.now());
    setTotalTimeMs(0);
  };

  const backTo = () => navigate(`/words/${id}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`);

  const correctCount = results.filter((r) => r.correct).length;
  const errorWords: TypingErrorWord[] = results
    .filter((r) => !r.correct)
    .map((r) => ({ word_id: r.word_id, word: r.word, error_count: r.error_count }));

  if (!listData || !practiceWords) {
    return <div className="flex items-center justify-center py-20 text-gray-400">Loading...</div>;
  }

  return (
    <div className="tp-page">
      <div className="tp-header">
        <Button variant="ghost" onClick={backTo} className="gap-2 text-gray-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          {t.typing.back}
        </Button>
        <h1 className="tp-title">{t.typing.title}</h1>
      </div>

      {phase === "playing" && currentWord && (
        <>
          <TypingProgress
            current={currentIndex + 1}
            total={practiceWords.length}
          />
          <TypingCard
            key={currentWord.id}
            word={currentWord}
            showWord={showWord}
            onToggleShowWord={() => setShowWord((v) => !v)}
            onComplete={handleComplete}
            onError={handleError}
          />
        </>
      )}

      {phase === "result" && (
        <TypingResult
          total={results.length}
          correct={correctCount}
          totalTimeMs={totalTimeMs}
          errorWords={errorWords}
          onRestartAll={handleRestartAll}
          onRetryErrors={handleRetryErrors}
        />
      )}
    </div>
  );
}
