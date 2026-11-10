import { useMemo, useRef } from "react";
import { Markdown } from "@/ui/markdown/Markdown";
import { withBaseHref } from "@/features/memo/htmlPage";
import { projectAssetBase, type PagePreviewKind } from "./filePreview";

/**
 * Markdown・HTML のファイルのプレビュー（ファイルタブの見出しの「プレビュー」。書きかけの中身もそのまま出す）。
 * Markdown は返答と同じ書式（ui/markdown）。HTML は iframe の srcdoc に中身を入れ、相対パスの CSS・画像はそのファイルのフォルダから読む
 * （<base> をコアのファイルの口 projectAssetBase へ向ける）。sandbox は allow-same-origin だけで、中の JavaScript・フォームは動かさない。
 * リンクは中で開かない（ページ内の # は飛び、外のサイトはブラウザで開く。ほかは何もしない）
 */
export function PagePreview({ projectId, worktree, path, kind, content }: { projectId: number; worktree?: string; path: string; kind: PagePreviewKind; content: string }) {
  if (kind === "markdown") {
    return (
      <div className="page-preview page-preview-markdown">
        <Markdown>{content}</Markdown>
      </div>
    );
  }
  return <HtmlPreview projectId={projectId} worktree={worktree} path={path} html={content} />;
}

function HtmlPreview({ projectId, worktree, path, html }: { projectId: number; worktree?: string; path: string; html: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const scroll = useRef({ x: 0, y: 0 });
  const srcDoc = useMemo(() => withBaseHref(html, projectAssetBase(location.origin, projectId, worktree, path)), [html, projectId, worktree, path]);

  // 読み込むたびに（中身が変わると文書が作り直される）、スクロールの位置を戻し、リンクを中で開かないようにする
  const attach = () => {
    const win = frame.current?.contentWindow;
    const doc = frame.current?.contentDocument;
    if (!win || !doc) return;
    win.scrollTo(scroll.current.x, scroll.current.y);
    win.addEventListener("scroll", () => {
      scroll.current = { x: win.scrollX, y: win.scrollY };
    });
    doc.addEventListener("click", (e) => {
      // iframe の中の要素は別の世界のものなので instanceof で見分けない
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null | undefined;
      if (!anchor) return;
      e.preventDefault();
      const raw = anchor.getAttribute("href") ?? "";
      if (raw.startsWith("#")) doc.getElementById(decodeURIComponent(raw.slice(1)))?.scrollIntoView({ block: "start" });
      else if (/^(https?|mailto):/i.test(anchor.href) && !anchor.href.startsWith(`${location.origin}/`)) window.open(anchor.href, "_blank", "noopener");
    });
  };

  return <iframe ref={frame} className="page-preview page-preview-html" title={`${path} のプレビュー`} sandbox="allow-same-origin" srcDoc={srcDoc} onLoad={attach} />;
}
