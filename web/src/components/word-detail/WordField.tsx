import type { CSSProperties, ReactNode } from "react";
import { FIELD_THEMES, type FieldThemeKey } from "./fieldTheme";

interface WordFieldProps {
  label: string;
  theme: FieldThemeKey;
  z?: number;
  index?: number;
  children: ReactNode;
}

export default function WordField({
  label,
  theme,
  z = 20,
  index = 0,
  children,
}: WordFieldProps) {
  const c = FIELD_THEMES[theme];
  const fieldStyle: CSSProperties = {
    transform: `translateZ(${z}px)`,
    animationDelay: `${index * 0.05}s`,
    ["--gc" as keyof CSSProperties]: c.glow,
  };
  const pillStyle: CSSProperties = {
    color: c.text,
    background: c.bg,
    borderColor: c.border,
  };
  return (
    <div className="wd-field" style={fieldStyle}>
      <span className="wd-pill" style={pillStyle}>
        {label}
      </span>
      <div className="wd-val">{children}</div>
    </div>
  );
}
