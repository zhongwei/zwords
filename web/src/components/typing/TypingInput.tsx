import { useEffect, useRef, useState, useCallback } from "react";

type CharState = "empty" | "correct" | "wrong";

interface TypingInputProps {
  word: string;
  onComplete: () => void;
  onError: () => void;
}

function findCursor(chars: CharState[]): number {
  return chars.findIndex((s) => s === "empty" || s === "wrong");
}

export default function TypingInput({ word, onComplete, onError }: TypingInputProps) {
  const initialChars = word.split("").map((c) => (/[a-zA-Z]/.test(c) ? "empty" : "correct") as CharState);

  const [chars, setChars] = useState<CharState[]>(initialChars);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setChars(word.split("").map((c) => (/[a-zA-Z]/.test(c) ? "empty" : "correct") as CharState));
    containerRef.current?.focus();
  }, [word]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const key = e.key;
      if (key === "Tab" || key === "Escape") return;
      e.preventDefault();

      if (key === "Backspace") {
        setChars((prev) => {
          const next = [...prev];
          const pc = findCursor(prev);
          let prevIdx = pc - 1;
          while (prevIdx >= 0 && next[prevIdx] !== "empty" && next[prevIdx] !== "wrong") {
            prevIdx--;
          }
          if (prevIdx >= 0 && next[prevIdx] === "wrong") {
            next[prevIdx] = "empty";
          }
          return next;
        });
        return;
      }

      if (!/^[a-zA-Z]$/.test(key)) return;

      setChars((prev) => {
        const next = [...prev];
        const pc = findCursor(prev);
        if (pc < 0 || pc >= word.length) return prev;
        const expected = word[pc];
        if (key.toLowerCase() === expected.toLowerCase()) {
          next[pc] = "correct";
        } else {
          next[pc] = "wrong";
          onError();
        }

        if (next.every((s) => s === "correct")) {
          onComplete();
        }
        return next;
      });
    },
    [word, onComplete, onError]
  );

  const cursor = findCursor(chars);

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
