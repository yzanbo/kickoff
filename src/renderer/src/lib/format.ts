// 数・パスの表示

/** パスの最後の名前（"/a/b/c.ts" → "c.ts"。区切りがなければそのまま、末尾が / なら空） */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** 246000 → "246k"、1000000 → "1m" */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  const m = n / 1_000_000;
  return `${Number.isInteger(m) ? m : m.toFixed(1)}m`;
}
