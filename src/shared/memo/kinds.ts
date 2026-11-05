// メモの種類（Markdown / HTML）。拡張子で決める（中身は見ない）。コアと画面で同じ結果にする

/** メモの種類（markdown = Markdown のメモ。HTML 以外の文字のファイルもこれで開く / html = HTML と CSS で書いたページのメモ） */
export const MEMO_KINDS = ["markdown", "html"] as const;
export type MemoKind = (typeof MEMO_KINDS)[number];

/** 種類ごとの、新しく作るときの拡張子 */
export const MEMO_KIND_EXTENSIONS: Record<MemoKind, string> = { markdown: ".md", html: ".html" };

/** メモとして扱う拡張子（題名では除き、名前を変えても付け直す） */
const MEMO_EXTENSIONS = [".md", ".markdown", ".html", ".htm"] as const;

/** パスのメモの拡張子（小文字。メモの拡張子でなければ null） */
export function memoExtensionOf(path: string): string | null {
  const lower = path.toLowerCase();
  return MEMO_EXTENSIONS.find((ext) => lower.endsWith(ext) && lower.length > ext.length && !lower.endsWith(`/${ext}`)) ?? null;
}

/** パスのメモの種類（.html・.htm なら html、ほかは markdown） */
export function memoKindOf(path: string): MemoKind {
  const ext = memoExtensionOf(path);
  return ext === ".html" || ext === ".htm" ? "html" : "markdown";
}

/** HTML の文字として安全な形（題名などを HTML に埋め込むとき） */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** 新しい HTML のメモの中身（題名の見出しと、CSS を書く <style> の入ったひな形） */
export function newHtmlMemo(title: string): string {
  const t = escapeHtml(title);
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${t}</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif;
    line-height: 1.7;
    max-width: 760px;
    margin: 40px auto;
    padding: 0 24px;
    color: #1f2328;
  }
  h1 { font-size: 1.8em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
</style>
</head>
<body>
<h1>${t}</h1>
<p></p>
</body>
</html>
`;
}
