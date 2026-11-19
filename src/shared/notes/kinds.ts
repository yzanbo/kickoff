// ノートの種類（Markdown / HTML）。拡張子で決める（中身は見ない）。コアと画面で同じ結果にする

/** ノートの種類（markdown = Markdown のノート。HTML 以外の文字のファイルもこれで開く / html = HTML と CSS で書いたページのノート） */
const NOTE_KINDS = ["markdown", "html"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

/** 種類ごとの、新しく作るときの拡張子 */
export const NOTE_KIND_EXTENSIONS: Record<NoteKind, string> = { markdown: ".md", html: ".html" };

/** ノートとして扱う拡張子（題名では除き、名前を変えても付け直す） */
const NOTE_EXTENSIONS = [".md", ".markdown", ".html", ".htm"] as const;

/** パスのノートの拡張子（小文字。ノートの拡張子でなければ null） */
export function noteExtensionOf(path: string): string | null {
  const lower = path.toLowerCase();
  return NOTE_EXTENSIONS.find((ext) => lower.endsWith(ext) && lower.length > ext.length && !lower.endsWith(`/${ext}`)) ?? null;
}

/** パスのノートの種類（.html・.htm なら html、ほかは markdown） */
export function noteKindOf(path: string): NoteKind {
  const ext = noteExtensionOf(path);
  return ext === ".html" || ext === ".htm" ? "html" : "markdown";
}

/** HTML の文字として安全な形（題名などを HTML に埋め込むとき） */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** 新しい HTML のノートの中身（題名の見出しと、CSS を書く <style> の入ったひな形） */
export function newHtmlNote(title: string): string {
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
