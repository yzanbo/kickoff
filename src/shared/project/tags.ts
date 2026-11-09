// プロジェクトのタグ（仕事・プライベート・クライアント A など）。コアと画面で共有する（Node 依存なし）

/** 1 つのタグの長さの上限（文字） */
export const MAX_TAG_LENGTH = 30;

/** 1 つのプロジェクトに付けられるタグの数の上限 */
export const MAX_TAGS = 20;

/** タグの絞り込みで「タグのないプロジェクト」を表す値（タグは空にならないので、ほかのタグと重ならない） */
export const UNTAGGED = "";

/** 前後の空白を除き、空のものと重複を除く（順は最初に出てきた順のまま） */
export function normalizeTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

/** プロジェクトで使っているタグの一覧（重複なし・名前順） */
export function collectTags(projects: readonly { tags: readonly string[] }[]): string[] {
  return [...new Set(projects.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b, "ja"));
}

/**
 * タグの絞り込みに合うか。選んだタグのどれかが付いていれば合う（UNTAGGED を選んでいれば、タグのないものも合う）。
 * 何も選んでいなければ、すべて合う
 */
export function matchesTags(tags: readonly string[], selected: readonly string[]): boolean {
  if (selected.length === 0) return true;
  if (tags.length === 0) return selected.includes(UNTAGGED);
  return tags.some((t) => selected.includes(t));
}

/** 並べた順（order。サイドバーのタグの行をドラッグで並べた順）でタグを並べる。order にないタグは後ろに名前順のまま */
export function orderTags(tags: readonly string[], order: readonly string[]): string[] {
  const rank = new Map(order.map((t, i) => [t, i]));
  const placed = tags.filter((t) => rank.has(t)).sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
  return [...placed, ...tags.filter((t) => !rank.has(t))];
}

/** タグ from の名前を to に変えた一覧（その位置のまま。to がもう付いていれば 1 つにまとめる） */
export const renameTagIn = (tags: readonly string[], from: string, to: string): string[] => normalizeTags(tags.map((t) => (t === from ? to : t)));

/** タグ name を外した一覧 */
export const removeTagFrom = (tags: readonly string[], name: string): string[] => tags.filter((t) => t !== name);
