import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { audioUrl } from "@/lib/audio";
import { Button } from "@/components/ui/button";
import { Volume2, Eye, EyeOff } from "lucide-react";
import type { Word } from "@/lib/types";
import TypingInput from "@/components/typing/TypingInput";

interface TypingCardProps {
  word: Word;
  showWord: boolean;
  onToggleShowWord: () => void;
  onComplete: () => void;
  onError: () => void;
}

export default function TypingCard({ word, showWord, onToggleShowWord, onComplete, onError }: TypingCardProps) {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingVariant, setPlayingVariant] = useState<"uk" | "us" | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!audioRef.current) return;
    const variant: "uk" | "us" = word.has_audio_uk ? "uk" : "us";
    if (!word.has_audio_uk && !word.has_audio_us) return;
    const el = audioRef.current;
    el.src = audioUrl(word.id, variant);
    el.play().then(() => setPlayingVariant(variant)).catch(() => setPlayingVariant(null));
  }, [word]);

  const play = (variant: "uk" | "us") => {
    const el = audioRef.current;
    if (!el) return;
    if (playingVariant === variant) {
      el.pause();
      setPlayingVariant(null);
      return;
    }
    el.src = audioUrl(word.id, variant);
    el.play().then(() => setPlayingVariant(variant)).catch(() => setPlayingVariant(null));
  };

  const handleComplete = () => {
    setDone(true);
    setTimeout(onComplete, 600);
  };

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          key={word.id}
          initial={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85, y: -20 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="tp-card"
        >
          <div className="tp-card-inner">
            <button
              className="tp-card-toggle"
              onClick={onToggleShowWord}
              title={showWord ? t.typing.hideWord : t.typing.showWord}
            >
              {showWord ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>

            <div className="tp-card-hint">
              {word.pos && <span className="tp-pos">{word.pos}</span>}
              {word.meaning_cn && <span className="tp-meaning">{word.meaning_cn}</span>}
            </div>

            <AnimatePresence>
              {showWord && (
                <motion.div
                  key="word-display"
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: "auto", marginBottom: 24 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="tp-card-word"
                >
                  {word.word}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="tp-card-audio">
              {word.has_audio_uk && (
                <Button
                  variant="ghost"
                  onClick={() => play("uk")}
                  className={playingVariant === "uk" ? "text-violet-300" : "text-gray-400 hover:text-white"}
                >
                  <Volume2 className="h-4 w-4" />
                  <span className="ml-1 text-sm">{t.audio.uk}</span>
                </Button>
              )}
              {word.has_audio_us && (
                <Button
                  variant="ghost"
                  onClick={() => play("us")}
                  className={playingVariant === "us" ? "text-violet-300" : "text-gray-400 hover:text-white"}
                >
                  <Volume2 className="h-4 w-4" />
                  <span className="ml-1 text-sm">{t.audio.us}</span>
                </Button>
              )}
              <audio ref={audioRef} onEnded={() => setPlayingVariant(null)} />
            </div>

            <TypingInput word={word.word} onComplete={handleComplete} onError={onError} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
