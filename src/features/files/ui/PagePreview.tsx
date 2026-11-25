import "./PagePreview.css";
import { Markdown } from "@/foundation/ui/markdown/Markdown";
import { HtmlFrame } from "@/foundation/ui/document/HtmlFrame";
import { projectAssetBase, type PagePreviewKind } from "./filePreview";
import { openPageLink } from "@/foundation/ui/external/linkOpen";

/**
 * Markdown・HTML のファイルのプレビュー（ファイルタブの見出しの「プレビュー」。書きかけの中身もそのまま出す）。
 * Markdown は返答と同じ書式（ui/markdown）。HTML は iframe の srcdoc に中身を入れ、相対パスの CSS・画像はそのファイルのフォルダから読む
 * （<base> をコアのファイルの口 projectAssetBase へ向ける）。sandbox は allow-same-origin だけで、中の JavaScript・フォームは動かさない。
 * リンクは中で開かない（ページ内の # は飛び、外のサイトは確認してからブラウザで開く。ほかは何もしない）
 */
export function PagePreview({ projectId, worktree, path, kind, content }: { projectId: number; worktree: string | null; path: string; kind: PagePreviewKind; content: string }) {
  if (kind === "markdown") {
    return (
      <div className="page-preview page-preview-markdown">
        <Markdown>{content}</Markdown>
      </div>
    );
  }
  return (
    <HtmlFrame
      className="page-preview page-preview-html"
      title={`${path} のプレビュー`}
      html={content}
      base={projectAssetBase(location.origin, projectId, worktree, path)}
      onLink={openPageLink}
    />
  );
}
