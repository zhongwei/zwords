import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { useNextReview } from "@/hooks/useWords";
import { api } from "@/lib/api";
import { audioUrl } from "@/lib/audio";
import Card3D from "@/components/shared/Card3D";
import ParticleExplosion from "@/components/shared/ParticleExplosion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Volume2 } from "lucide-react";

const qualityLabels = [
  "quality0", "quality1", "quality2", "quality3", "quality4", "quality5",
] as const;

const qualityColors = [
  "bg-red-600 hover:bg-red-500",
  "bg-orange-600 hover:bg-orange-500",
  "bg-amber-600 hover:bg-amber-500",
  "bg-emerald-600 hover:bg-emerald-500",
  "bg-blue-600 hover:bg-blue-500",
  "bg-violet-600 hover:bg-violet-500",
];

export default function Review() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data: words = [], isLoading } = useNextReview(50);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [explosion, setExplosion] = useState(false);
  const [explosionSuccess, setExplosionSuccess] = useState(true);

  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingVariant, setPlayingVariant] = useState<"uk" | "us" | null>(null);

  const current = words[currentIndex];
  const total = words.length;

  const play = useCallback(
    (variant: "uk" | "us") => {
      const el = audioRef.current;
      if (!el || !current) return;
      if (playingVariant === variant) {
        el.pause();
        setPlayingVariant(null);
        return;
      }
      el.src = audioUrl(current.word.id, variant);
      el.play().then(() => setPlayingVariant(variant)).catch(() => setPlayingVariant(null));
    },
    [current, playingVariant]
  );

  const handleAnswer = useCallback(
    async (quality: number) => {
      if (!current) return;
      try {
        await api.submitReview(current.word.id, quality);
        const success = quality >= 3;
        setExplosionSuccess(success);
        setExplosion(true);

        setTimeout(() => {
          if (currentIndex < total - 1) {
            setCurrentIndex(currentIndex + 1);
            setFlipped(false);
            if (audioRef.current) audioRef.current.pause();
            setPlayingVariant(null);
          } else {
            setCurrentIndex(total);
          }
          queryClient.invalidateQueries({ queryKey: ["review-next"] });
        }, 800);
      } catch (err) {
        console.error("Review submit failed:", err);
      }
    },
    [current, currentIndex, total, queryClient]
  );

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-gray-400">Loading...</div>;
  }

  if (!total || currentIndex >= total) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="text-6xl">🎉</div>
        <h2 className="text-2xl font-bold text-white">{t.review.empty}</h2>
      </div>
    );
  }

  const progressPercent = ((currentIndex + 1) / total) * 100;

  return (
    <div className="flex flex-col items-center space-y-8">
      <div className="w-full max-w-2xl space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">{t.review.title}</h1>
          <span className="text-sm text-gray-400">
            {t.review.progress
              .replace("{current}", String(currentIndex + 1))
              .replace("{total}", String(total))}
          </span>
        </div>
        <Progress value={progressPercent} className="h-2 bg-white/10" />
      </div>

      <div className="w-full max-w-lg">
        <p className="mb-3 text-center text-sm text-gray-500">{t.review.clickToFlip}</p>
        <div className="h-80">
          <Card3D
            front={current.word.word}
            back={
              current.word.meaning_cn ||
              current.word.meaning_en ||
              "—"
            }
            subtext={current.word.phonetic || undefined}
            onClick={() => setFlipped(!flipped)}
          />
        </div>
        {(current.word.has_audio_uk || current.word.has_audio_us) && (
          <div className="mt-3 flex items-center justify-center gap-3">
            {current.word.has_audio_uk && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t.audio.uk}
                onClick={() => play("uk")}
                className={playingVariant === "uk" ? "text-violet-300" : "text-gray-400 hover:text-white"}
              >
                <Volume2 className="h-4 w-4" />
                <span className="ml-1 text-xs">{t.audio.uk}</span>
              </Button>
            )}
            {current.word.has_audio_us && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t.audio.us}
                onClick={() => play("us")}
                className={playingVariant === "us" ? "text-violet-300" : "text-gray-400 hover:text-white"}
              >
                <Volume2 className="h-4 w-4" />
                <span className="ml-1 text-xs">{t.audio.us}</span>
              </Button>
            )}
            <audio
              ref={audioRef}
              onEnded={() => setPlayingVariant(null)}
            />
          </div>
        )}
      </div>

      {flipped && (
        <div className="flex flex-wrap justify-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
          {qualityLabels.map((key, i) => (
            <Button
              key={i}
              onClick={() => handleAnswer(i)}
              className={`${qualityColors[i]} min-w-[80px] text-white`}
            >
              {t.review[key]}
            </Button>
          ))}
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
