import type { CSSProperties } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { useWord } from "@/hooks/useWords";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import ParallaxCard from "@/components/word-detail/ParallaxCard";
import WordField from "@/components/word-detail/WordField";
import ExampleQuote from "@/components/word-detail/ExampleQuote";
import { FIELD_THEMES } from "@/components/word-detail/fieldTheme";

const z = (px: number): CSSProperties => ({ transform: `translateZ(${px}px)` });

export default function WordDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { data, isLoading } = useWord(Number(id));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        Loading...
      </div>
    );
  }

  if (!data) {
    return <div className="py-20 text-center text-gray-400">Word not found</div>;
  }

  const { word, examples, synonyms, learning_status } = data;

  const statusLabel = () => {
    if (!learning_status)
      return { text: t.wordDetail.statusNew, cls: "bg-gray-500/20 text-gray-400" };
    switch (learning_status.status) {
      case "mastered":
        return { text: t.wordDetail.statusMastered, cls: "bg-emerald-500/20 text-emerald-300" };
      case "review":
        return { text: t.wordDetail.statusReview, cls: "bg-blue-500/20 text-blue-300" };
      default:
        return { text: t.wordDetail.statusLearning, cls: "bg-amber-500/20 text-amber-300" };
    }
  };
  const sl = statusLabel();

  let fieldIndex = 0;
  const nextIndex = () => fieldIndex++;

  const rootText = [word.root, word.association].filter(Boolean).join(" → ");
  const phoneticLine = [word.phonetic, word.pos].filter(Boolean).join(" · ");
  const blue = FIELD_THEMES.blue;

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        onClick={() => navigate("/words")}
        className="gap-2 text-gray-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        {t.wordDetail.back}
      </Button>

      <div className="flex items-center gap-3">
        <Badge className={sl.cls}>{sl.text}</Badge>
        {word.source && (
          <Badge variant="outline" className="border-white/20 text-gray-400">
            {word.source}
          </Badge>
        )}
      </div>

      <div className="max-w-lg">
        <ParallaxCard>
          <div className="wd-card-bg">
            <div className="wd-glow wd-glow-1" />
            <div className="wd-glow wd-glow-2" />
          </div>
          <div className="wd-content">
            <h1 className="wd-word" style={z(55)}>
              {word.word}
            </h1>

            {phoneticLine && (
              <div className="wd-phonetic" style={z(35)}>
                {phoneticLine}
              </div>
            )}

            <hr className="wd-rainbow" style={z(20)} />

            {(word.meaning_cn || word.meaning_en) && (
              <WordField label={t.wordDetail.meaning} theme="amber" z={30} index={nextIndex()}>
                {word.meaning_cn && <div>{word.meaning_cn}</div>}
                {word.meaning_en && <div className="wd-val-muted">{word.meaning_en}</div>}
              </WordField>
            )}

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
    </div>
  );
}
