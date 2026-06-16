import { highlightSegments } from "./fieldTheme";

interface ExampleQuoteProps {
  sentence: string;
  translation: string | null;
  highlight?: string | null;
}

export default function ExampleQuote({
  sentence,
  translation,
  highlight,
}: ExampleQuoteProps) {
  const segments = highlightSegments(sentence, highlight ?? null);
  return (
    <blockquote className="wd-quote">
      <p className="wd-quote-en">
        {segments.map((seg, i) =>
          seg.hit ? (
            <span key={i} className="wd-hit">
              {seg.text}
            </span>
          ) : (
            <span key={i}>{seg.text}</span>
          )
        )}
      </p>
      {translation && <p className="wd-quote-cn">{translation}</p>}
    </blockquote>
  );
}
