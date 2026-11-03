// 書式付きコピー（返答を、ほかのアプリに貼っても見出し・表・コードが崩れないようにコピーする）
import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";

/**
 * Markdown を HTML にする（表・取り消し線・チェックリストなど GitHub の書き方も。チャットの表示と同じ読み方）。
 * 文中の HTML はそのまま通さずに文字として書く（貼った先で動かないように）
 */
export function markdownToHtml(markdown: string): string {
  return micromark(markdown, { extensions: [gfm()], htmlExtensions: [gfmHtml()] });
}

/**
 * Markdown の文を、書式付き（text/html）と Markdown のまま（text/plain）の両方でクリップボードに入れる。
 * 貼る先が書式を受け取れれば見出し・表などのまま、受け取れなければ Markdown の文が入る
 */
export async function copyRich(markdown: string): Promise<void> {
  const html = `<meta charset="utf-8">${markdownToHtml(markdown)}`;
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/plain": new Blob([markdown], { type: "text/plain" }),
      "text/html": new Blob([html], { type: "text/html" }),
    }),
  ]);
}
