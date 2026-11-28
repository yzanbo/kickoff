import type { EditorView } from "@codemirror/view";
import { useSizeObserver } from "@/foundation/ui/hooks/useSizeObserver";
import { Markdown } from "@/foundation/ui/markdown/Markdown";

/**
 * HTML のまとまりを、返答の表示と同じ Markdown の部品で描く（たたむ部分の開け閉め・中の Markdown も同じ）。
 * 高さが変わったら（描いた・たたむ部分を開け閉めした）編集の部品に測り直させる
 */
export function HtmlBlock({ source, view }: { source: string; view: EditorView }) {
  const sized = useSizeObserver<HTMLDivElement>(() => view.requestMeasure());
  return (
    <div ref={sized}>
      <Markdown>{source}</Markdown>
    </div>
  );
}
