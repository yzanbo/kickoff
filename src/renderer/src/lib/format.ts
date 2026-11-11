// 数・パスの表示

/** パスの最後の名前（"/a/b/c.ts" → "c.ts"。区切りがなければそのまま、末尾が / なら空） */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/**
 * パスを、最後の名前とその親フォルダに分ける（一覧で「名前」と「場所」を分けて見せる）。
 * "src/a/b.ts" → { name: "b.ts", dir: "src/a" }。区切りがなければフォルダは空、ルートの直下ならフォルダは "/"。末尾の / は除いて分ける
 */
export function splitPath(path: string): { name: string; dir: string } {
  const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;
  const i = trimmed.lastIndexOf("/");
  if (i < 0) return { name: trimmed, dir: "" };
  return { name: trimmed.slice(i + 1), dir: i === 0 ? "/" : trimmed.slice(0, i) };
}

/** 246000 → "246k"、1000000 → "1m" */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  const m = n / 1_000_000;
  return `${Number.isInteger(m) ? m : m.toFixed(1)}m`;
}

/** バイト数を読める大きさに（12 B / 3.4 KB / 1.2 MB / 2.0 GB。添付・画像・DB のバイナリのセル・テーブルの大きさ） */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
