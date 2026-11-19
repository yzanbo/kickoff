// ファイルタブのプレビュー（Markdown・HTML のファイルを、書いた形ではなく見た目で出す）の決まり（純粋な関数）

/** プレビューできる文字のファイルの種類（SVG は画像のプレビュー ImagePreview で出すので入れない） */
export type PagePreviewKind = "markdown" | "html";

/** ファイル名からプレビューの種類（.md / .markdown = Markdown、.html / .htm = HTML。ほかは null） */
export function pagePreviewKind(path: string): PagePreviewKind | null {
  const ext = /\.([^./]+)$/.exec(path)?.[1]?.toLowerCase();
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "html" || ext === "htm") return "html";
  return null;
}

/**
 * HTML のファイルの相対パス（CSS・画像）を読む先: そのファイルの入ったフォルダを指す、コアのファイルを返す口
 * （GET /api/projects/:id/file/asset/<作業場所>/<フォルダ>/。作業場所は本体なら "-"、ワークツリーならフォルダを 1 段に符号化したもの。
 * 相対パスで解くとクエリは落ちるので、作業場所もパスに入れる）
 */
export function projectAssetBase(origin: string, projectId: number, worktree: string | undefined, file: string): string {
  const folder = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "";
  const place = worktree ? encodeURIComponent(worktree) : "-";
  const encoded = folder ? `${folder.split("/").map(encodeURIComponent).join("/")}/` : "";
  return `${origin}/api/projects/${projectId}/file/asset/${place}/${encoded}`;
}
