import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TargetAndTransition } from "motion-dom";
import { useI18n } from "@/lib/i18n";
import { useWord } from "@/hooks/useWords";
import type { Word } from "@/lib/types";
import WordDetailCard from "@/components/word-detail/WordDetailCard";

const VISIBLE = 3; // 中央两侧各渲染 3 张

function offsetTarget(d: number): TargetAndTransition {
  const sign = Math.sign(d);
  const a = Math.abs(d);
  if (a === 0) return { x: 0, z: 0, rotateY: 0, opacity: 1 };
  if (a === 1) return { x: sign * 130, z: -140, rotateY: sign * -50, opacity: 0.6 };
  if (a === 2) return { x: sign * 230, z: -280, rotateY: sign * -58, opacity: 0.35 };
  return { x: sign * 320, z: -420, rotateY: sign * -62, opacity: 0.18 };
}

interface WordCoverFlowProps {
  words: Word[];
  currentId: number;
  onNavigate: (id: number) => void;
}

export default function WordCoverFlow({ words, currentId, onNavigate }: WordCoverFlowProps) {
  const { t } = useI18n();
  const { data, isLoading } = useWord(currentId);
  const currentIndex = useMemo(
    () => words.findIndex((w) => w.id === currentId),
    [words, currentId]
  );

  const visible = useMemo(() => {
    const start = Math.max(0, currentIndex - VISIBLE);
    const end = Math.min(words.length - 1, currentIndex + VISIBLE);
    const arr: { word: Word; d: number }[] = [];
    for (let i = start; i <= end; i++) arr.push({ word: words[i], d: i - currentIndex });
    return arr;
  }, [words, currentIndex]);

  return (
    <div className="wd-cf-stage">
      <AnimatePresence initial={false}>
        {visible.map(({ word, d }) => {
          const target = offsetTarget(d);
          const isCenter = d === 0;
          return (
            <motion.div
              key={word.id}
              className={isCenter ? "wd-cf-card wd-cf-center" : "wd-cf-card wd-cf-side"}
              initial={{ opacity: 0 }}
              animate={target}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              transformTemplate={(_, g) => `translate(-50%, -50%) ${g}`}
              onClick={isCenter ? undefined : () => onNavigate(word.id)}
              style={isCenter ? undefined : { width: "auto", maxWidth: "none" }}
            >
              {isCenter ? (
                isLoading || !data ? (
                  <div className="flex items-center justify-center py-32 text-gray-400">
                    Loading...
                  </div>
                ) : (
                  <div className="relative">
                    <WordDetailCard data={data} />
                    <div className="wd-cf-reflection" aria-hidden>
                      <div className="wd-cf-reflection-word">{data.word.word}</div>
                    </div>
                  </div>
                )
              ) : (
                <div className="wd-cf-side-card">
                  <div className="wd-cf-side-word">{word.word}</div>
                  {word.phonetic && <div className="wd-cf-side-pho">{word.phonetic}</div>}
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>

      <div className="wd-cf-controls">
        {/* Task 7 接入按钮/键盘/触摸/滚轮交互；此处仅占位指示 */}
        <span className="text-sm text-gray-500">
          {t.wordDetail.coverFlow.prev} / {t.wordDetail.coverFlow.next}
        </span>
      </div>
    </div>
  );
}
