import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { RotateCcw, Target } from "lucide-react";

export interface TypingErrorWord {
  word_id: number;
  word: string;
  error_count: number;
}

interface TypingResultProps {
  total: number;
  correct: number;
  totalTimeMs: number;
  errorWords: TypingErrorWord[];
  onRestartAll: () => void;
  onRetryErrors: () => void;
}

export default function TypingResult({
  total,
  correct,
  totalTimeMs,
  errorWords,
  onRestartAll,
  onRetryErrors,
}: TypingResultProps) {
  const { t } = useI18n();
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const avgMs = total > 0 ? Math.round(totalTimeMs / total) : 0;

  return (
    <div className="tp-result">
      <h2 className="tp-result-title">{t.typing.result}</h2>

      <div className="tp-result-stats">
        <div className="tp-result-stat">
          <Target className="h-6 w-6 text-violet-400" />
          <div>
            <div className="tp-result-value">{accuracy}%</div>
            <div className="tp-result-label">{t.typing.accuracy}</div>
          </div>
        </div>
        <div className="tp-result-stat">
          <div className="tp-result-value">{(totalTimeMs / 1000).toFixed(1)}{t.typing.seconds}</div>
          <div className="tp-result-label">{t.typing.totalTime}</div>
        </div>
        <div className="tp-result-stat">
          <div className="tp-result-value">{(avgMs / 1000).toFixed(1)}{t.typing.seconds}</div>
          <div className="tp-result-label">{t.typing.avgTime}</div>
        </div>
      </div>

      {errorWords.length > 0 ? (
        <div className="tp-result-errors">
          <h3 className="tp-result-errors-title">{t.typing.errorWords}</h3>
          <div className="tp-result-errors-list">
            {errorWords.map((ew) => (
              <div key={ew.word_id} className="tp-result-error-item">
                <span className="tp-result-error-word">{ew.word}</span>
                <span className="tp-result-error-count">
                  {t.typing.errorCount.replace("{count}", String(ew.error_count))}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="tp-result-perfect">{t.typing.noErrors}</div>
      )}

      <div className="tp-result-actions">
        <Button onClick={onRestartAll} variant="outline" className="gap-2 border-white/20 text-white hover:bg-white/10">
          <RotateCcw className="h-4 w-4" />
          {t.typing.restartAll}
        </Button>
        {errorWords.length > 0 && (
          <Button onClick={onRetryErrors} className="gap-2 bg-violet-600 hover:bg-violet-700">
            <Target className="h-4 w-4" />
            {t.typing.retryErrors}
          </Button>
        )}
      </div>
    </div>
  );
}
