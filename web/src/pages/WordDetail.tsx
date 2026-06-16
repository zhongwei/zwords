import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { useWord, useWords } from "@/hooks/useWords";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Keyboard } from "lucide-react";
import WordDetailCard from "@/components/word-detail/WordDetailCard";
import WordCoverFlow from "@/components/word-detail/WordCoverFlow";
import type { ListWordsParams } from "@/lib/types";

function parseListParams(sp: URLSearchParams): ListWordsParams {
  const params: ListWordsParams = { per_page: 100 };
  const page = sp.get("page");
  if (page) params.page = Number(page);
  const q = sp.get("q");
  if (q) params.q = q;
  const source = sp.get("source");
  if (source) params.source = source;
  const status = sp.get("status");
  if (status) params.status = status;
  return params;
}

export default function WordDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const listParams = parseListParams(searchParams);
  const hasListContext = searchParams.has("page");
  const numericId = Number(id);

  const { data: wordData, isLoading } = useWord(numericId);
  const { data: listData } = useWords(hasListContext ? listParams : undefined);

  const inList = !!listData?.data.some((w) => w.id === numericId);
  const coverFlowMode = hasListContext && inList && !!listData;

  const backTo = () =>
    navigate(`/words${searchParams.toString() ? `?${searchParams.toString()}` : ""}`);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">Loading...</div>
    );
  }
  if (!wordData) {
    return <div className="py-20 text-center text-gray-400">Word not found</div>;
  }

  const { word, learning_status } = wordData;
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

  const goId = (nextId: number) =>
    navigate(`/words/${nextId}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={backTo} className="gap-2 text-gray-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          {t.wordDetail.back}
        </Button>
        {coverFlowMode && (
          <Button
            variant="outline"
            onClick={() => navigate(`/words/${id}/typing${searchParams.toString() ? `?${searchParams.toString()}` : ""}`)}
            className="gap-2 border-violet-500/40 text-violet-300 hover:bg-violet-500/20 hover:text-violet-200"
          >
            <Keyboard className="h-4 w-4" />
            {t.typing.title}
          </Button>
        )}
        <div className="flex items-center gap-2">
          <Badge className={sl.cls}>{sl.text}</Badge>
          {word.source && (
            <Badge variant="outline" className="border-white/20 text-gray-400">
              {word.source}
            </Badge>
          )}
        </div>
      </div>

      {coverFlowMode ? (
        <WordCoverFlow
          words={listData!.data}
          currentId={numericId}
          page={listParams.page ?? 1}
          onNavigate={goId}
        />
      ) : (
        <WordDetailCard data={wordData} />
      )}
    </div>
  );
}
