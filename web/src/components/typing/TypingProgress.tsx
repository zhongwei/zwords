interface TypingProgressProps {
  current: number;
  total: number;
}

export default function TypingProgress({ current, total }: TypingProgressProps) {
  const pct = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="tp-progress-wrap">
      <div className="tp-progress-bar">
        <div className="tp-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="tp-progress-label">{current} / {total}</span>
    </div>
  );
}
