// HTML のノートをページとして描くための補助（純粋な関数）

/**
 * HTML のノートの相対パス（CSS・画像）を読む先: ノートの入ったフォルダを指す、コアのファイルを返す口
 * （GET /api/projects/:id/note/file/<フォルダ>/。段ごとに URL の形にする）
 */
export function noteAssetBase(origin: string, projectId: number, folder: string): string {
  const encoded = folder ? `${folder.split("/").map(encodeURIComponent).join("/")}/` : "";
  return `${origin}/api/projects/${projectId}/note/file/${encoded}`;
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
