// 埋め込みブラウザのタブの「AI に渡す」で渡すコンソールの中身と、札の名前（純粋関数）
import type { BrowserConsoleEntry } from "@shared/ipc";

/** ページの呼び名（http(s) ならホストとポート、ほかはそのまま。空のページは「空のページ」） */
export function pageHostOf(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") return u.host;
  } catch {
    // URL でなければそのまま
  }
  return url === "about:blank" || url === "" ? "空のページ" : url;
}

/** 札の元を開くリンク（http(s) のページだけ） */
export const pageLinkOf = (url: string): string | null => (/^https?:\/\//.test(url) ? url : null);

/** 画面の札の名前（「ログイン（localhost:5173）・1280 × 800」。題がなければホストだけ。大きさは撮った画像の px） */
export function screenLabelOf(page: { url: string; title: string }, size?: { width: number; height: number }): string {
  const host = pageHostOf(page.url);
  const title = page.title.trim();
  const name = title && title !== page.url ? `${title}（${host}）` : host;
  return size ? `${name}・${size.width} × ${size.height}` : name;
}

/** エラーと警告の数 */
function countsOf(entries: BrowserConsoleEntry[]) {
  const errors = entries.filter((e) => e.level === "error").length;
  return { errors, warnings: entries.length - errors };
}

/** コンソールの札の名前（「localhost:5173・エラー 3・警告 1」） */
export function consoleLabelOf(page: { url: string }, entries: BrowserConsoleEntry[]): string {
  const { errors, warnings } = countsOf(entries);
  const counts = [...(errors > 0 ? [`エラー ${errors}`] : []), ...(warnings > 0 ? [`警告 ${warnings}`] : [])];
  return [pageHostOf(page.url), ...counts].join("・");
}

/**
 * コンソールのエラー・警告の文書（Markdown）。いまのページと数の下に、古い順に 1 件ずつ、
 * 時刻・種類・本文（複数行は字下げ）・出したスクリプトの場所・出たページの URL を書く。clock は時刻の書き方
 */
export function consoleDocument(page: { url: string; title: string }, entries: BrowserConsoleEntry[], clock: (iso: string) => string): string {
  const { errors, warnings } = countsOf(entries);
  const lines = [
    "# ブラウザのコンソールのエラーと警告（Kickoff の埋め込みブラウザ）",
    "",
    `- いまのページ: ${page.title.trim() ? `${page.title.trim()} — ` : ""}${page.url}`,
    `- エラー ${errors} 件・警告 ${warnings} 件（このタブで覚えている出力のうちエラーと警告すべて。読み直し・ページの移動の前の出力も含みます。console.log などは入れていません）`,
    "",
    "## 出力（古い順）",
  ];
  for (const e of entries) {
    const [first, ...rest] = e.message.replace(/\r\n?/g, "\n").split("\n");
    lines.push("", `### [${e.level === "error" ? "エラー" : "警告"}] ${clock(e.at)}`, "", first ?? "");
    for (const line of rest) lines.push(`    ${line}`);
    lines.push("");
    if (e.source) lines.push(`- 場所: ${e.source}:${e.line}`);
    lines.push(`- ページ: ${e.url}`);
  }
  return `${lines.join("\n")}\n`;
}
