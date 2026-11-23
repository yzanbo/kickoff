// HTML の文書（ファイルのプレビュー・HTML のノート）をページとして描くための補助（純粋な関数）

/** HTML の属性の値として安全な形 */
const attr = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/**
 * HTML に <base href> を入れる（相対パスの CSS・画像を文書のフォルダから読むため）。<head> があればその直後、
 * なければ <html> の直後、どちらもなければ <!doctype> の後ろ（前に置くと互換モードになる）か先頭に入れる。
 * 書いた人の <base> より前に置く（最初の <base> が効く）
 */
export function withBaseHref(html: string, href: string): string {
  const tag = `<base href="${attr(href)}">`;
  for (const re of [/<head(\s[^>]*)?>/i, /<html(\s[^>]*)?>/i, /^\s*<!doctype[^>]*>/i]) {
    const m = re.exec(html);
    if (m) {
      const end = m.index + m[0].length;
      return `${html.slice(0, end)}${tag}${html.slice(end)}`;
    }
  }
  return `${tag}${html}`;
}
