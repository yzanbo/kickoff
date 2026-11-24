import "./GitHubHtml.css";
import DOMPurify from "dompurify";
import { useMemo } from "react";
import { GITHUB_DEFAULT_HOST, githubWebOrigin } from "@shared/foundation/codeHost";
import { cx } from "@/foundation/ui/lib/cx";
import { useGitHubDetailContext } from "./githubDetailContext";
import { githubImageSource, type GitHubBodyPlace } from "./githubLinks";


/**
 * GitHub が作った本文の HTML を無害にする（スクリプト・フォーム・埋め込み・style は落とす。GitHub の側でも無害にしてあるが、重ねて守る。
 * 相対の URL は place のホストのページに直し、リポジトリの中のファイルの画像はコアの口から読む）。
 * DOMPurify のフックはこの呼び出しの間だけ足す（ほかの所の DOMPurify を巻き込まない）
 */
function sanitizeGitHubHtml(html: string, place: GitHubBodyPlace = { host: GITHUB_DEFAULT_HOST, repo: null, projectId: null }): string {
  const origin = githubWebOrigin(place.host);
  // リンクは外のブラウザで開く（target=_blank はメインプロセスが既定のブラウザに渡す）。相対のものは GitHub の URL にする
  const hook = (node: Node) => {
    if (!(node instanceof Element)) return;
    for (const attr of ["href", "src"]) {
      const v = node.getAttribute(attr);
      if (v?.startsWith("/") && !v.startsWith("//")) node.setAttribute(attr, origin + v);
    }
    const src = node.tagName === "IMG" ? node.getAttribute("src") : null;
    if (src) node.setAttribute("src", githubImageSource(place, src));
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noreferrer");
    }
    if (node.tagName === "IMG") node.setAttribute("loading", "lazy");
  };
  DOMPurify.addHook("afterSanitizeAttributes", hook);
  try {
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "iframe", "object", "embed"],
      FORBID_ATTR: ["style"],
    });
  } finally {
    DOMPurify.removeHook("afterSanitizeAttributes", hook);
  }
}

/**
 * GitHub の issue・PR・コメントの本文（GraphQL の bodyHTML。GitHub と同じ Markdown の見た目）。
 * 見た目はチャットの Markdown と同じ .markdown に、GitHub だけの部品（チェックリスト・折りたたみ・メンション）を足す
 */
export function GitHubHtml({ html, className, empty = "説明はありません。" }: { html: string; className?: string; empty?: string }) {
  const { place } = useGitHubDetailContext();
  const clean = useMemo(() => sanitizeGitHubHtml(html, place), [html, place]);
  if (!clean.trim()) return <p className={cx("github-html-empty muted small", className)}>{empty}</p>;
  return <div className={cx("markdown github-html", className)} dangerouslySetInnerHTML={{ __html: clean }} />;
}
