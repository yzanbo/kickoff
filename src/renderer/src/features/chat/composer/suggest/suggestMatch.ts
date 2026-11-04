import type { SlashCommandOption } from "@shared/types";

/** 候補の種類: / はコマンド（文の先頭だけ）、@ はファイル */
export type SuggestKind = "slash" | "file";

/** 出す候補の数 */
const MAX_ITEMS = 8;

/** カーソルの前の文から、いま打っている / か @ を探す（start は / か @ の位置） */
export function findTrigger(text: string, caret: number): { kind: SuggestKind; start: number; query: string } | null {
  const before = text.slice(0, caret);
  const slash = /^\/(\S*)$/.exec(before);
  if (slash) return { kind: "slash", start: 0, query: slash[1] };
  const at = /(?:^|\s)@(\S*)$/.exec(before);
  if (at) return { kind: "file", start: before.length - at[1].length - 1, query: at[1] };
  return null;
}

/** コマンドを、名前の始まりが合うもの → 名前に含むもの → 説明に含むものの順に */
export function matchCommands(commands: SlashCommandOption[], query: string): SlashCommandOption[] {
  const q = query.toLowerCase();
  const rank = (c: SlashCommandOption) => (c.name.toLowerCase().startsWith(q) ? 0 : c.name.toLowerCase().includes(q) ? 1 : c.description.toLowerCase().includes(q) ? 2 : -1);
  return commands
    .map((c) => ({ c, r: rank(c) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.c.name.localeCompare(b.c.name))
    .slice(0, MAX_ITEMS)
    .map((x) => x.c);
}

/** ファイルを、ファイル名の始まりが合うもの → ファイル名に含むもの → パスに含むものの順に（同じなら短いパスを先に） */
export function matchFiles(files: string[], query: string): string[] {
  const q = query.toLowerCase();
  const rank = (path: string) => {
    const lower = path.toLowerCase();
    const name = lower.slice(lower.lastIndexOf("/") + 1);
    return name.startsWith(q) ? 0 : name.includes(q) ? 1 : lower.includes(q) ? 2 : -1;
  };
  const scored: { path: string; r: number }[] = [];
  for (const path of files) {
    const r = rank(path);
    if (r >= 0) scored.push({ path, r });
  }
  return scored
    .sort((a, b) => a.r - b.r || a.path.length - b.path.length || a.path.localeCompare(b.path))
    .slice(0, MAX_ITEMS)
    .map((x) => x.path);
}
