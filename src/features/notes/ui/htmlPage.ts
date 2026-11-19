// HTML のメモをページとして描くための補助（純粋な関数）

/**
 * HTML のメモの相対パス（CSS・画像）を読む先: メモの入ったフォルダを指す、コアのファイルを返す口
 * （GET /api/projects/:id/memo/file/<フォルダ>/。段ごとに URL の形にする）
 */
export function memoAssetBase(origin: string, projectId: number, folder: string): string {
  const encoded = folder ? `${folder.split("/").map(encodeURIComponent).join("/")}/` : "";
  return `${origin}/api/projects/${projectId}/memo/file/${encoded}`;
}

/** HTML の属性の値として安全な形 */
const attr = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/**
 * HTML に <base href> を入れる（相対パスの CSS・画像をメモのフォルダから読むため）。<head> があればその直後、
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

/**
 * HTML のメモのリンク（iframe が <base> で解決した URL）が指す、メモのフォルダの中のパス（メモのフォルダからの相対。段ごとに戻す）。
 * root はメモのフォルダの口（memoAssetBase(origin, projectId, "")）。? と # は除く。メモのフォルダの外・形が壊れたもの・フォルダそのものは null
 */
export function memoLinkPath(url: string, root: string): string | null {
  if (!url.startsWith(root)) return null;
  const rest = url.slice(root.length).replace(/[?#].*$/, "").replace(/\/+$/, "");
  if (!rest) return null;
  try {
    const segments = rest.split("/").map(decodeURIComponent);
    return segments.some((s) => s === "" || s === "." || s === ".." || s.includes("/")) ? null : segments.join("/");
  } catch {
    return null;
  }
}
