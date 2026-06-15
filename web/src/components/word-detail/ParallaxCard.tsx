import { useRef, useState, type CSSProperties, type ReactNode } from "react";

interface ParallaxCardProps {
  children: ReactNode;
  maxTilt?: number;
  className?: string;
}

export default function ParallaxCard({
  children,
  maxTilt = 12,
  className = "",
}: ParallaxCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [transform, setTransform] = useState<string>(
    "rotateY(0deg) rotateX(0deg)"
  );

  const coarse =
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches;

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (coarse) return;
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setTransform(
        `rotateY(${px * maxTilt * 2}deg) rotateX(${-py * maxTilt * 2}deg)`
      );
    });
  };

  const handleLeave = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    setTransform("rotateY(0deg) rotateX(0deg)");
  };

  const cardStyle: CSSProperties = { transform };

  return (
    <div
      className={`wd-scene ${className}`.trim()}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      <div className="wd-card-3d" ref={cardRef} style={cardStyle}>
        {children}
      </div>
    </div>
  );
}
