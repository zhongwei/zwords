import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import ParticleExplosion from "@/components/shared/ParticleExplosion";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { Quiz, QuizResult, GenerateQuizParams } from "@/lib/types";

type Phase = "config" | "playing" | "result";

export default function Quiz() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<Phase>("config");
  const [params, setParams] = useState<GenerateQuizParams>({ count: 20, type: "en2cn" });
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [explosion, setExplosion] = useState(false);
  const [explosionSuccess, setExplosionSuccess] = useState(true);
  const [feedback, setFeedback] = useState<{ correct: boolean; correctAnswer: string } | null>(null);

  const submitQuiz = useCallback(async () => {
    if (!quiz) return;
    try {
      const answerList = Object.entries(answers).map(([wordId, answer]) => ({
        word_id: Number(wordId),
        answer,
      }));
      const r = await api.submitQuiz(quiz.id, answerList);
      setResult(r);
      setPhase("result");
      queryClient.invalidateQueries({ queryKey: ["review-next"] });
    } catch (err) {
      console.error("Failed to submit quiz:", err);
    }
  }, [quiz, answers, queryClient]);

  const selectAnswer = useCallback(
    (option: string) => {
      if (!quiz || feedback) return;
      const question = quiz.questions[currentQ];
      const isCorrect = option === question.options[question.correct_index];

      setAnswers((prev) => ({ ...prev, [question.word_id]: option }));
      setExplosionSuccess(isCorrect);
      setExplosion(true);
      setFeedback({
        correct: isCorrect,
        correctAnswer: question.options[question.correct_index],
      });

      setTimeout(() => {
        setFeedback(null);
        if (currentQ < quiz.questions.length - 1) {
          setCurrentQ(currentQ + 1);
        } else {
          submitQuiz();
        }
      }, 1200);
    },
    [quiz, currentQ, feedback, submitQuiz]
  );

  const startQuiz = useCallback(async () => {
    setLoading(true);
    try {
      const q = await api.generateQuiz(params);
      setQuiz(q);
      setAnswers({});
      setCurrentQ(0);
      setPhase("playing");
    } catch (err) {
      console.error("Failed to generate quiz:", err);
    } finally {
      setLoading(false);
    }
  }, [params]);

  if (phase === "config") {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <h1 className="text-3xl font-bold text-white">{t.quiz.title}</h1>

        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <h2 className="text-lg font-semibold text-white">{t.quiz.config}</h2>

          <div>
            <label className="mb-1 block text-sm text-gray-400">{t.quiz.count}</label>
            <Select
              value={String(params.count)}
              onValueChange={(v) => setParams({ ...params, count: Number(v) })}
            >
              <SelectTrigger className="border-white/10 bg-white/5 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="30">30</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-400">{t.quiz.source}</label>
            <Select
              value={params.source || "all"}
              onValueChange={(v) =>
                setParams({ ...params, source: v === "all" ? undefined : v })
              }
            >
              <SelectTrigger className="border-white/10 bg-white/5 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.words.all}</SelectItem>
                <SelectItem value="GRE">GRE</SelectItem>
                <SelectItem value="TOEFL">TOEFL</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-400">{t.quiz.type}</label>
            <Select
              value={params.type || "en2cn"}
              onValueChange={(v) => setParams({ ...params, type: v })}
            >
              <SelectTrigger className="border-white/10 bg-white/5 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en2cn">{t.quiz.typeEn2Cn}</SelectItem>
                <SelectItem value="cn2en">{t.quiz.typeCn2En}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={startQuiz}
            disabled={loading}
            className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500"
            size="lg"
          >
            {loading ? "..." : t.quiz.start}
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "playing" && quiz) {
    const question = quiz.questions[currentQ];
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">{t.quiz.title}</h1>
          <span className="text-sm text-gray-400">
            {currentQ + 1} / {quiz.questions.length}
          </span>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-sm">
          <p className="text-sm text-gray-400">{t.quiz.type}</p>
          <p className="mt-3 text-2xl font-bold text-white">{question.question}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {question.options.map((option, i) => {
            const selected = answers[question.word_id] === option;
            const isFeedback = feedback !== null;
            const isCorrectOption = i === question.correct_index;

            let cls = "border-white/10 bg-white/5 text-white hover:bg-white/10 hover:border-violet-500/30";
            if (isFeedback && selected && !feedback!.correct) {
              cls = "border-red-500/50 bg-red-500/10 text-red-300";
            }
            if (isFeedback && isCorrectOption) {
              cls = "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
            }
            if (selected && !isFeedback) {
              cls = "border-violet-500/50 bg-violet-500/10 text-violet-200";
            }

            return (
              <button
                key={i}
                onClick={() => !isFeedback && selectAnswer(option)}
                disabled={isFeedback}
                className={`rounded-xl border p-4 text-left text-lg transition-all duration-200 hover:scale-[1.02] disabled:cursor-default ${cls}`}
              >
                {option}
              </button>
            );
          })}
        </div>

        {feedback && (
          <div className={`text-center text-sm ${feedback.correct ? "text-emerald-400" : "text-red-400"}`}>
            {feedback.correct ? "✓ Correct!" : `✗ ${t.quiz.correctAnswer}: ${feedback.correctAnswer}`}
          </div>
        )}

        <ParticleExplosion
          trigger={explosion}
          success={explosionSuccess}
          onDone={() => setExplosion(false)}
        />
      </div>
    );
  }

  if (phase === "result" && result) {
    const scorePercent = Math.round((result.correct / result.total) * 100);
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-3xl font-bold text-white">{t.quiz.result}</h1>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-sm">
          <p className="text-6xl font-bold text-white">{scorePercent}%</p>
          <p className="mt-2 text-gray-400">
            {result.correct} / {result.total} {t.quiz.correct}
          </p>
        </div>

        <div className="space-y-2">
          {result.details.map((d) => (
            <div
              key={d.word_id}
              className={`flex items-center justify-between rounded-xl border p-4 ${
                d.correct
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : "border-red-500/20 bg-red-500/5"
              }`}
            >
              <div className="flex items-center gap-3">
                <Badge variant="outline" className={d.correct ? "border-emerald-500/30 text-emerald-300" : "border-red-500/30 text-red-300"}>
                  {d.correct ? "✓" : "✗"}
                </Badge>
                <span className="font-semibold text-white">{d.word}</span>
              </div>
              <div className="text-right text-sm">
                <p className="text-gray-400">
                  {t.quiz.yourAnswer}: <span className="text-white">{d.user_answer}</span>
                </p>
                {!d.correct && (
                  <p className="text-gray-400">
                    {t.quiz.correctAnswer}: <span className="text-emerald-300">{d.correct_answer}</span>
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-4">
          <Button
            onClick={() => {
              setPhase("config");
              setQuiz(null);
              setResult(null);
              setAnswers({});
              setCurrentQ(0);
            }}
            className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500"
          >
            {t.quiz.restart}
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/")}
            className="border-white/20 text-white hover:bg-white/10"
          >
            {t.quiz.backDashboard}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
