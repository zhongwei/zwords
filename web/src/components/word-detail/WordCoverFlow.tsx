import { useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TargetAndTransition } from "motion-dom";
import { useI18n } from "@/lib/i18n";
import { useWord } from "@/hooks/useWords";
import type { Word } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import WordDetailCard from "@/components/word-detail/WordDetailCard";

const VISIBLE = 3;

function offsetTarget(d: number): TargetAndTransition {
  const sign = Math.sign(d);
  const a = Math.abs(d);
  if (a === 0) return { x: 0, z: 0, rotateY: 0, opacity: 1 };
  if (a === 1) return { x: sign * 500, z: -120, rotateY: sign * -50, opacity: 0.6 };
  if (a === 2) return { x: sign * 780, z: -260, rotateY: sign * -56, opacity: 0.35 };
  return { x: sign * 1060, z: -420, rotateY: sign * -60, opacity: 0.18 };
}

interface WordCoverFlowProps {
  words: Word[];
  currentId: number;
  page: number;
  onNavigate: (id: number) => void;
}

export default function WordCoverFlow({ words, currentId, page, onNavigate }: WordCoverFlowProps) {
  const { t } = useI18n();
  const { data, isLoading } = useWord(currentId);
  const currentIndex = useMemo(
    () => words.findIndex((w) => w.id === currentId),
    [words, currentId]
  );

  const sideCards = useMemo(() => {
    const start = Math.max(0, currentIndex - VISIBLE);
    const end = Math.min(words.length - 1, currentIndex + VISIBLE);
    const arr: { word: Word; d: number }[] = [];
    for (let i = start; i <= end; i++) {
      if (i === currentIndex) continue;
      arr.push({ word: words[i], d: i - currentIndex });
    }
    return arr;
  }, [words, currentIndex]);

  const atStart = currentIndex <= 0;
  const atEnd = currentIndex >= words.length - 1;

  const go = (dir: -1 | 1) => {
    const next = words[currentIndex + dir];
    if (next) onNavigate(next.id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const n = words[currentIndex - 1];
        if (n) onNavigate(n.id);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const n = words[currentIndex + 1];
        if (n) onNavigate(n.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentIndex, words, onNavigate]);

  const stageRef = useRef<HTMLDivElement>(null);
  const wheelAccum = useRef(0);
  const wheelLock = useRef(false);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // 在中央卡片上滚动 → 让卡片内容滚动，不翻页
      const target = e.target as Element | null;
      if (target && target.closest && target.closest(".wd-cf-center-wrap")) return;
      e.preventDefault();
      if (wheelLock.current) {
        wheelAccum.current = 0;
        return;
      }
      wheelAccum.current += e.deltaY;
      if (Math.abs(wheelAccum.current) < 30) return;
      wheelLock.current = true;
      const dir: -1 | 1 = wheelAccum.current > 0 ? 1 : -1;
      const n = words[currentIndex + dir];
      if (n) onNavigate(n.id);
      wheelAccum.current = 0;
      window.setTimeout(() => {
        wheelLock.current = false;
      }, 450);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [currentIndex, words, onNavigate]);

  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    touchStartX.current = null;
  };

  const positionLabel = t.wordDetail.coverFlow.position
    .replace("{page}", String(page))
    .replace("{current}", String(currentIndex + 1))
    .replace("{total}", String(words.length));
  const progressPct = words.length > 0 ? ((currentIndex + 1) / words.length) * 100 : 0;

  return (
    <>
      <div
        ref={stageRef}
        className="wd-cf-stage"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <span className="wd-cf-position">{positionLabel}</span>

        {/* 侧面卡片：绝对定位、相对舞台居中 */}
        <AnimatePresence initial={false}>
          {sideCards.map(({ word, d }) => {
            const target = offsetTarget(d);
            return (
              <motion.div
                key={word.id}
                className="wd-cf-card wd-cf-side"
                initial={{ opacity: 0 }}
                animate={target}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                transformTemplate={(_, g) => `translate(-50%, -50%) ${g}`}
                onClick={() => onNavigate(word.id)}
                style={{ width: "auto", maxWidth: "none" }}
              >
                <div className="wd-cf-side-card">
                  <div className="wd-cf-side-word">{word.word}</div>
                  {word.phonetic && <div className="wd-cf-side-pho">{word.phonetic}</div>}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* 中央卡：正常文档流（决定舞台高度，控件不会被遮挡） */}
        <div className="wd-cf-center-wrap">
          {isLoading || !data ? (
            <div className="flex items-center justify-center py-32 text-gray-400">
              Loading...
            </div>
          ) : (
            <div className="relative">
              <WordDetailCard key={currentId} data={data} />
              <div className="wd-cf-reflection" aria-hidden>
                <div className="wd-cf-reflection-word">{data.word.word}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="wd-cf-controls">
        <Button
          variant="outline"
          size="icon"
          aria-label={t.wordDetail.coverFlow.prev}
          disabled={atStart}
          onClick={() => go(-1)}
          className="border-white/10 text-white hover:bg-white/10"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="wd-cf-progress" aria-hidden>
          <div className="wd-cf-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label={t.wordDetail.coverFlow.next}
          disabled={atEnd}
          onClick={() => go(1)}
          className="border-white/10 text-white hover:bg-white/10"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </>
  );
}
