import DOMPurify from "dompurify";
import { createContext, useContext, useMemo } from "react";
import { GITHUB_DEFAULT_HOST, githubWebOrigin } from "@shared/github/host";
import { cx } from "@/lib/cx";
import { githubImageSource, type GitHubBodyPlace } from "./githubLinks";

/** いま見ている issue・PR のホスト・リポジトリ・プロジェクト（GitHubDetail の DetailBody が中身の URL から決めて渡す。既定は github.com で、画像はそのまま読む） */
export const GitHubBodyContext = createContext<GitHubBodyPlace>({ host: GITHUB_DEFAULT_HOST, repo: null, projectId: null });

/** 相対のリンク・画像を GitHub の URL に直す土台と、画像を読む先（sanitizeGitHubHtml の間だけ、その本文のものにする） */
let relativeOrigin = githubWebOrigin(GITHUB_DEFAULT_HOST);
let imageSource: ((url: string) => string) | null = null;

// リンクは外のブラウザで開く（target=_blank はメインプロセスが既定のブラウザに渡す）。相対のものは GitHub の URL にする
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (!(node instanceof Element)) return;
  for (const attr of ["href", "src"]) {
    const v = node.getAttribute(attr);
    if (v?.startsWith("/") && !v.startsWith("//")) node.setAttribute(attr, relativeOrigin + v);
  }
  const src = node.tagName === "IMG" ? node.getAttribute("src") : null;
  if (src && imageSource) node.setAttribute("src", imageSource(src));
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noreferrer");
  }
  if (node.tagName === "IMG") node.setAttribute("loading", "lazy");
});

/**
 * GitHub が作った本文の HTML を無害にする（スクリプト・フォーム・埋め込み・style は落とす。GitHub の側でも無害にしてあるが、重ねて守る。
 * 相対の URL は place のホストのページに直し、リポジトリの中のファイルの画像はコアの口から読む）
 */
export function sanitizeGitHubHtml(html: string, place: GitHubBodyPlace = { host: GITHUB_DEFAULT_HOST, repo: null, projectId: null }): string {
  relativeOrigin = githubWebOrigin(place.host);
  imageSource = (url) => githubImageSource(place, url);
  try {
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "iframe", "object", "embed"],
      FORBID_ATTR: ["style"],
    });
  } finally {
    relativeOrigin = githubWebOrigin(GITHUB_DEFAULT_HOST);
    imageSource = null;
  }
}

/**
 * GitHub の issue・PR・コメントの本文（GraphQL の bodyHTML。GitHub と同じ Markdown の見た目）。
 * 見た目はチャットの Markdown と同じ .markdown に、GitHub だけの部品（チェックリスト・折りたたみ・メンション）を足す
 */
export function GitHubHtml({ html, className, empty = "説明はありません。" }: { html: string; className?: string; empty?: string }) {
  const place = useContext(GitHubBodyContext);
  const clean = useMemo(() => sanitizeGitHubHtml(html, place), [html, place]);
  if (!clean.trim()) return <p className={cx("github-html-empty muted small", className)}>{empty}</p>;
  return <div className={cx("markdown github-html", className)} dangerouslySetInnerHTML={{ __html: clean }} />;
}
