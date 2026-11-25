import "./GitHubHtml.css";
import DOMPurify from "dompurify";
import { useContext, useMemo, type MouseEvent } from "react";
import { GITHUB_DEFAULT_HOST, githubWebOrigin } from "@shared/foundation/codeHost";
import { linkTargetOf } from "@shared/foundation/linkTarget";
import { MarkdownLinkOpenerContext } from "@/foundation/ui/markdown/markdownLinks";
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
  // 相対の URL は GitHub の URL にする。リンクは行き先の判定を通ったものだけを残し（読み直した形にする）、押したら GitHubHtml が確認を通して開く
  const hook = (node: Node) => {
    if (!(node instanceof Element)) return;
    for (const attr of ["href", "src"]) {
      const v = node.getAttribute(attr);
      if (v?.startsWith("/") && !v.startsWith("//")) node.setAttribute(attr, origin + v);
    }
    const src = node.tagName === "IMG" ? node.getAttribute("src") : null;
    if (src) node.setAttribute("src", githubImageSource(place, src));
    if (node.tagName === "A") {
      const target = linkTargetOf(node.getAttribute("href"));
      if (target === null) node.removeAttribute("href");
      else if (target.kind === "web") node.setAttribute("href", target.url);
      node.removeAttribute("target");
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
  const opener = useContext(MarkdownLinkOpenerContext);
  const clean = useMemo(() => sanitizeGitHubHtml(html, place), [html, place]);
  // 本文のリンクは、押したら（左・中クリック）窓の既定の動きを止め、外のページは Markdown のリンクと同じ口（確認の画面）で開く
  const activate = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.button !== 0 && e.button !== 1) || e.defaultPrevented) return;
    const anchor = e.target instanceof Element ? e.target.closest("a[href]") : null;
    if (!anchor || !e.currentTarget.contains(anchor)) return;
    e.preventDefault();
    const target = linkTargetOf(anchor.getAttribute("href"));
    if (target?.kind === "web") opener?.(e, target.url, anchor.textContent ?? "");
  };
  if (!clean.trim()) return <p className={cx("github-html-empty muted small", className)}>{empty}</p>;
  return <div className={cx("markdown github-html", className)} onClick={activate} onAuxClick={activate} dangerouslySetInnerHTML={{ __html: clean }} />;
}
