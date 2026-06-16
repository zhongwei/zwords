import { useEffect, useRef, useState, useCallback } from "react";

type CharState = "empty" | "correct" | "wrong";

interface TypingInputProps {
  word: string;
  onComplete: () => void;
  onError: () => void;
}

export default function TypingInput({ word, onComplete, onError }: TypingInputProps) {
  const initialChars = word.split("").map((c) => (/[a-zA-Z]/.test(c) ? "empty" : "correct") as CharState);
  const initialCursor = word.split("").findIndex((c) => /[a-zA-Z]/.test(c));

  const [chars, setChars] = useState<CharState[]>(initialChars);
  const [cursor, setCursor] = useState(initialCursor);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setChars(word.split("").map((c) => (/[a-zA-Z]/.test(c) ? "empty" : "correct") as CharState));
    setCursor(word.split("").findIndex((c) => /[a-zA-Z]/.test(c)));
    containerRef.current?.focus();
  }, [word]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Tab" || e.key === "Escape") return;
      e.preventDefault();

      if (e.key === "Backspace") {
        setChars((prev) => {
          const next = [...prev];
          setCursor((pc) => {
            let prevIdx = pc - 1;
            while (prevIdx >= 0 && next[prevIdx] !== "empty" && next[prevIdx] !== "wrong") {
              prevIdx--;
            }
            if (prevIdx >= 0 && next[prevIdx] === "wrong") {
              next[prevIdx] = "empty";
              return prevIdx;
            }
            return pc;
          });
          return next;
        });
        return;
      }

      if (!/^[a-zA-Z]$/.test(e.key)) return;

      setChars((prev) => {
        const next = [...prev];
        setCursor((pc) => {
          if (pc >= word.length) return pc;
          const expected = word[pc];
          if (e.key.toLowerCase() === expected.toLowerCase()) {
            next[pc] = "correct";
          } else {
            next[pc] = "wrong";
            onError();
          }

          let n = pc + 1;
          while (n < word.length && next[n] === "correct" && !/[a-zA-Z]/.test(word[n])) {
            n++;
          }

          if (next.every((s) => s === "correct")) {
            onComplete();
          }
          return n;
        });
        return next;
      });
    },
    [word, onComplete, onError]
  );

  const displayChars = chars.map((state, i) => {
    const c = word[i];
    const isLetter = /[a-zA-Z]/.test(c);
    let cls = "tp-char ";
    if (!isLetter) {
      cls += "tp-char-preset";
    } else if (state === "correct") {
      cls += "tp-char-correct";
    } else if (state === "wrong") {
      cls += "tp-char-wrong";
    } else if (i === cursor) {
      cls += "tp-char-active";
    } else {
      cls += "tp-char-empty";
    }
    return (
      <span key={i} className={cls}>
        {state === "correct" || state === "wrong" ? c : isLetter ? "" : c}
      </span>
    );
  });

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="tp-input-outline"
      onKeyDown={handleKeyDown}
    >
      <div className="tp-input-grid">{displayChars}</div>
    </div>
  );
}
