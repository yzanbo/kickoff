import DOMPurify from "dompurify";
import { createContext, useContext, useMemo } from "react";
import { GITHUB_DEFAULT_HOST, githubWebOrigin } from "@shared/github/host";
import { cx } from "@/lib/cx";

/** いま見ている issue・PR の GitHub のホスト（GitHubDetail が中身の URL から決めて渡す。既定は github.com） */
export const GitHubHostContext = createContext(GITHUB_DEFAULT_HOST);

/** 相対のリンク・画像を GitHub の URL に直す土台（sanitizeGitHubHtml の間だけ、そのホストにする） */
let relativeOrigin = githubWebOrigin(GITHUB_DEFAULT_HOST);

// リンクは外のブラウザで開く（target=_blank はメインプロセスが既定のブラウザに渡す）。相対のものは GitHub の URL にする
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (!(node instanceof Element)) return;
  for (const attr of ["href", "src"]) {
    const v = node.getAttribute(attr);
    if (v?.startsWith("/") && !v.startsWith("//")) node.setAttribute(attr, relativeOrigin + v);
  }
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noreferrer");
  }
  if (node.tagName === "IMG") node.setAttribute("loading", "lazy");
});

/** GitHub が作った本文の HTML を無害にする（スクリプト・フォーム・埋め込み・style は落とす。GitHub の側でも無害にしてあるが、重ねて守る。相対の URL は host のページに直す） */
export function sanitizeGitHubHtml(html: string, host: string = GITHUB_DEFAULT_HOST): string {
  relativeOrigin = githubWebOrigin(host);
  try {
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "iframe", "object", "embed"],
      FORBID_ATTR: ["style"],
    });
  } finally {
    relativeOrigin = githubWebOrigin(GITHUB_DEFAULT_HOST);
  }
}

/**
 * GitHub の issue・PR・コメントの本文（GraphQL の bodyHTML。GitHub と同じ Markdown の見た目）。
 * 見た目はチャットの Markdown と同じ .markdown に、GitHub だけの部品（チェックリスト・折りたたみ・メンション）を足す
 */
export function GitHubHtml({ html, className, empty = "説明はありません。" }: { html: string; className?: string; empty?: string }) {
  const host = useContext(GitHubHostContext);
  const clean = useMemo(() => sanitizeGitHubHtml(html, host), [html, host]);
  if (!clean.trim()) return <p className={cx("github-html-empty muted small", className)}>{empty}</p>;
  return <div className={cx("markdown github-html", className)} dangerouslySetInnerHTML={{ __html: clean }} />;
}
