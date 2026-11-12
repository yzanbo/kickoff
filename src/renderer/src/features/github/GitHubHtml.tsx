import DOMPurify from "dompurify";
import { useMemo } from "react";
import { cx } from "@/lib/cx";

/** GitHub の外のページに戻す相対のリンク・画像の土台 */
const GITHUB_ORIGIN = "https://github.com";

// リンクは外のブラウザで開く（target=_blank はメインプロセスが既定のブラウザに渡す）。相対のものは GitHub の URL にする
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (!(node instanceof Element)) return;
  for (const attr of ["href", "src"]) {
    const v = node.getAttribute(attr);
    if (v?.startsWith("/") && !v.startsWith("//")) node.setAttribute(attr, GITHUB_ORIGIN + v);
  }
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noreferrer");
  }
  if (node.tagName === "IMG") node.setAttribute("loading", "lazy");
});

/** GitHub が作った本文の HTML を無害にする（スクリプト・フォーム・埋め込み・style は落とす。GitHub の側でも無害にしてあるが、重ねて守る） */
export function sanitizeGitHubHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "iframe", "object", "embed"],
    FORBID_ATTR: ["style"],
  });
}

/**
 * GitHub の issue・PR・コメントの本文（GraphQL の bodyHTML。GitHub と同じ Markdown の見た目）。
 * 見た目はチャットの Markdown と同じ .markdown に、GitHub だけの部品（チェックリスト・折りたたみ・メンション）を足す
 */
export function GitHubHtml({ html, className, empty = "説明はありません。" }: { html: string; className?: string; empty?: string }) {
  const clean = useMemo(() => sanitizeGitHubHtml(html), [html]);
  if (!clean.trim()) return <p className={cx("github-html-empty muted small", className)}>{empty}</p>;
  return <div className={cx("markdown github-html", className)} dangerouslySetInnerHTML={{ __html: clean }} />;
}
