// 添付の札（AttachmentChip）の 2 行目の文（純粋関数）

/** ファイルの種類の短い名前（拡張子を大文字に。「PDF」「TS」。拡張子がなければ null） */
export function fileKindLabel(name: string): string | null {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toUpperCase() : null;
}

/** メモの札の 2 行目（「メモ · 開発履歴 · 今日 13:48」。入ったフォルダ・付けた時刻があれば添える） */
export function memoSubline(memo: string, takenAt: string | null | undefined, clock: (iso: string) => string): string {
  const folder = memo.includes("/") ? memo.slice(0, memo.lastIndexOf("/")) : "";
  return ["メモ", folder, takenAt ? clock(takenAt) : ""].filter(Boolean).join(" · ");
}
