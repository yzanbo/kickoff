// 「パスを含めてコピー」の文（純粋関数）: 選択部分の前に、どのファイルのどの行かを書く

/** ファイルの場所: フルパスと行番号（`…/DB.md:12-14`。1 行なら 1 つ、行が分からなければパスだけ） */
export function lineLocation(path: string, lines: { from: number; to: number } | null): string {
  if (!lines) return path;
  return lines.from === lines.to ? `${path}:${lines.from}` : `${path}:${lines.from}-${lines.to}`;
}

/** 1 行目に場所（lineLocation）、空行を挟んで選択部分をそのまま（頭を切らない。末尾の改行は詰める） */
export function textWithPath(location: string, text: string): string {
  return `${location}\n\n${text.replace(/\s+$/, "")}`;
}
