// 添付の札（AttachmentChip）の 2 行目の文（純粋関数）

/** ファイルの種類の短い名前（拡張子を大文字に。「PDF」「TS」。拡張子がなければ null） */
export function fileKindLabel(name: string): string | null {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toUpperCase() : null;
}

/** ノートの札の 2 行目（「ノート · 開発履歴 · 今日 13:48」。入ったフォルダがあれば添える） */
export function noteSubline(note: string, takenAt: string, clock: (iso: string) => string): string {
  const folder = note.includes("/") ? note.slice(0, note.lastIndexOf("/")) : "";
  return ["ノート", folder, clock(takenAt)].filter(Boolean).join(" · ");
}
