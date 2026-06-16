import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useI18n } from "@/lib/i18n";
import type { WordDetail } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Volume2 } from "lucide-react";
import { audioUrl } from "@/lib/audio";
import ParallaxCard from "@/components/word-detail/ParallaxCard";
import WordField from "@/components/word-detail/WordField";
import ExampleQuote from "@/components/word-detail/ExampleQuote";
import { FIELD_THEMES } from "@/components/word-detail/fieldTheme";

const z = (px: number): CSSProperties => ({ transform: `translateZ(${px}px)` });

interface WordDetailCardProps {
  data: WordDetail;
}

export default function WordDetailCard({ data }: WordDetailCardProps) {
  const { t } = useI18n();
  const { word, examples, synonyms } = data;

  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingVariant, setPlayingVariant] = useState<"uk" | "us" | null>(null);
  const queueRef = useRef<("uk" | "us")[] | null>(null);
  const queueIdxRef = useRef(0);

  useEffect(() => {
    const pair: ("uk" | "us")[] = [];
    for (let i = 0; i < 3; i++) {
      if (word.has_audio_uk) pair.push("uk");
      if (word.has_audio_us) pair.push("us");
    }
    if (pair.length === 0 || !audioRef.current) return;
    queueRef.current = pair;
    queueIdxRef.current = 0;
    const el = audioRef.current;
    el.src = audioUrl(word.id, pair[0]);
    el.play().then(() => setPlayingVariant(pair[0])).catch(() => {
      queueRef.current = null;
      setPlayingVariant(null);
    });
  }, [word]);

  const play = (variant: "uk" | "us") => {
    const el = audioRef.current;
    if (!el) return;
    queueRef.current = null;
    if (playingVariant === variant) {
      el.pause();
      setPlayingVariant(null);
      return;
    }
    el.src = audioUrl(word.id, variant);
    el.play().then(() => setPlayingVariant(variant)).catch(() => setPlayingVariant(null));
  };

  const handleEnded = () => {
    const q = queueRef.current;
    if (!q) {
      setPlayingVariant(null);
      return;
    }
    queueIdxRef.current += 1;
    if (queueIdxRef.current < q.length) {
      const next = q[queueIdxRef.current];
      const el = audioRef.current;
      if (el) {
        el.src = audioUrl(word.id, next);
        el.play().then(() => setPlayingVariant(next)).catch(() => {
          queueRef.current = null;
          setPlayingVariant(null);
        });
      }
      return;
    }
    queueRef.current = null;
    setPlayingVariant(null);
  };

  let fieldIndex = 0;
  const nextIndex = () => fieldIndex++;

  const rootText = [word.root, word.association].filter(Boolean).join(" → ");
  const blue = FIELD_THEMES.blue;

  return (
    <div className="mx-auto wd-detail-root">
      <ParallaxCard>
        <div className="wd-card-bg">
          <div className="wd-glow wd-glow-1" />
          <div className="wd-glow wd-glow-2" />
        </div>
        <div className="wd-content">
          <h1 className="wd-word" style={z(55)}>
            {word.word}
          </h1>

          <div className="mt-4 flex items-center justify-start gap-4" style={z(35)}>
            {word.phonetic && <div className="wd-phonetic">{word.phonetic}</div>}
            {word.has_audio_uk && (
              <Button
                variant="ghost"
                aria-label={t.audio.uk}
                onClick={(e) => { e.stopPropagation(); play("uk"); }}
                className={playingVariant === "uk" ? "text-violet-300" : "text-gray-400 hover:text-white"}
              >
                <Volume2 className="h-5 w-5" />
                <span className="ml-1.5 text-sm font-medium">{t.audio.uk}</span>
              </Button>
            )}
            {word.has_audio_us && (
              <Button
                variant="ghost"
                aria-label={t.audio.us}
                onClick={(e) => { e.stopPropagation(); play("us"); }}
                className={playingVariant === "us" ? "text-violet-300" : "text-gray-400 hover:text-white"}
              >
                <Volume2 className="h-5 w-5" />
                <span className="ml-1.5 text-sm font-medium">{t.audio.us}</span>
              </Button>
            )}
            <audio ref={audioRef} onEnded={handleEnded} />
          </div>

          {(word.meaning_cn || word.meaning_en) && (
            <div className="wd-meaning" style={z(45)}>
              {word.meaning_cn && (
                <div className="wd-meaning-cn">
                  {word.pos && <span className="wd-pos">{word.pos}</span>}
                  {word.meaning_cn}
                </div>
              )}
              {word.meaning_en && <div className="wd-val-muted">{word.meaning_en}</div>}
            </div>
          )}

          <hr className="wd-rainbow" style={z(20)} />

          {rootText && (
            <WordField label={t.wordDetail.root} theme="emerald" z={25} index={nextIndex()}>
              {rootText}
            </WordField>
          )}

          {word.collocations && (
            <WordField label={t.wordDetail.collocations} theme="violet" z={25} index={nextIndex()}>
              {word.collocations}
            </WordField>
          )}

          {word.derivatives && (
            <WordField label={t.wordDetail.derivatives} theme="cyan" z={20} index={nextIndex()}>
              {word.derivatives}
            </WordField>
          )}

          {word.references && (
            <WordField label={t.wordDetail.references} theme="violet" z={20} index={nextIndex()}>
              {word.references}
            </WordField>
          )}

          {synonyms.length > 0 && (
            <WordField label={t.wordDetail.synonyms} theme="pink" z={20} index={nextIndex()}>
              <div className="wd-synwrap">
                {synonyms.map((s) => (
                  <span key={s.id} className="wd-syntag">
                    {s.synonym}
                  </span>
                ))}
              </div>
            </WordField>
          )}

          {examples.length > 0 && (
            <div className="wd-ex-label" style={z(15)}>
              <span
                className="wd-pill"
                style={{ color: blue.text, background: blue.bg, borderColor: blue.border }}
              >
                {t.wordDetail.examples}
              </span>
            </div>
          )}
          {examples.map((ex) => (
            <div key={ex.id} style={z(15)}>
              <ExampleQuote
                sentence={ex.sentence}
                translation={ex.translation}
                highlight={word.word}
              />
            </div>
          ))}
        </div>
      </ParallaxCard>
    </div>
  );
}
