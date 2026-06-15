export type FieldThemeKey = "amber" | "emerald" | "violet" | "cyan" | "pink" | "blue";

export interface FieldTheme {
  text: string;
  bg: string;
  border: string;
  glow: string;
}

export const FIELD_THEMES: Record<FieldThemeKey, FieldTheme> = {
  amber: { text: "#fbbf24", bg: "rgba(245,158,11,0.20)", border: "rgba(245,158,11,0.45)", glow: "rgba(245,158,11,0.55)" },
  emerald: { text: "#34d399", bg: "rgba(16,185,129,0.20)", border: "rgba(16,185,129,0.45)", glow: "rgba(16,185,129,0.55)" },
  violet: { text: "#c4b5fd", bg: "rgba(139,92,246,0.20)", border: "rgba(139,92,246,0.45)", glow: "rgba(139,92,246,0.55)" },
  cyan: { text: "#67e8f9", bg: "rgba(6,182,212,0.20)", border: "rgba(6,182,212,0.45)", glow: "rgba(6,182,212,0.55)" },
  pink: { text: "#f9a8d4", bg: "rgba(236,72,153,0.20)", border: "rgba(236,72,153,0.45)", glow: "rgba(236,72,153,0.55)" },
  blue: { text: "#60a5fa", bg: "rgba(59,130,246,0.20)", border: "rgba(59,130,246,0.45)", glow: "rgba(59,130,246,0.55)" },
};

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface Segment {
  text: string;
  hit: boolean;
}

export function highlightSegments(text: string, word: string | null): Segment[] {
  if (!word || !word.trim()) return [{ text, hit: false }];
  const re = new RegExp(`\\b${escapeRegExp(word)}\\w*`, "gi");
  const out: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), hit: false });
    out.push({ text: m[0], hit: true });
    last = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out;
}
