// HTML のノートをページとして描くための補助（純粋な関数）

/**
 * HTML のノートの相対パス（CSS・画像）を読む先: ノートの入ったフォルダを指す、コアのファイルを返す口
 * （GET /api/projects/:id/note/file/<フォルダ>/。段ごとに URL の形にする）
 */
export function noteAssetBase(origin: string, projectId: number, folder: string): string {
  const encoded = folder ? `${folder.split("/").map(encodeURIComponent).join("/")}/` : "";
  return `${origin}/api/projects/${projectId}/note/file/${encoded}`;
}

/** HTML の属性の値として安全な形 */
const attr = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/**
 * HTML に <base href> を入れる（相対パスの CSS・画像をノートのフォルダから読むため）。<head> があればその直後、
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
 * HTML のノートのリンク（iframe が <base> で解決した URL）が指す、ノートのフォルダの中のパス（ノートのフォルダからの相対。段ごとに戻す）。
 * root はノートのフォルダの口（noteAssetBase(origin, projectId, "")）。? と # は除く。ノートのフォルダの外・形が壊れたもの・フォルダそのものは null
 */
export function noteLinkPath(url: string, root: string): string | null {
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
