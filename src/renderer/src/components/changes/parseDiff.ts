/** 差分の 1 行。hunk は「@@ -1,3 +1,4 @@」の見出し、note は「\ No newline at end of file」 */
export interface DiffLine {
  type: "hunk" | "add" | "del" | "context" | "note";
  text: string;
  /** 変更前の行番号 */
  oldNo?: number;
  /** 変更後の行番号 */
  newNo?: number;
}

/** 左右に並べるときの 1 行（見出しは左右をまたぐ） */
export type SplitRow = { hunk: DiffLine } | { left?: DiffLine; right?: DiffLine };

/** unified 形式の差分を、行番号つきの行に分ける（ファイルの見出しの行は除く） */
export function parseDiff(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldNo = 0;
  let newNo = 0;
  let inHunk = false;
  for (const raw of diff.split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      inHunk = true;
      lines.push({ type: "hunk", text: raw });
    } else if (raw.startsWith("diff --git")) {
      inHunk = false;
    } else if (!inHunk) {
      continue;
    } else if (raw.startsWith("+")) {
      lines.push({ type: "add", text: raw.slice(1), newNo: newNo++ });
    } else if (raw.startsWith("-")) {
      lines.push({ type: "del", text: raw.slice(1), oldNo: oldNo++ });
    } else if (raw.startsWith(" ")) {
      lines.push({ type: "context", text: raw.slice(1), oldNo: oldNo++, newNo: newNo++ });
    } else if (raw.startsWith("\\")) {
      lines.push({ type: "note", text: raw.slice(2) });
    }
  }
  return lines;
}

/** 左右に並べる（VS Code と同じ）。続けて消した行と足した行は、上から順に左右へ組にする */
export function toSplitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (line.type === "hunk") {
      rows.push({ hunk: line });
      i++;
    } else if (line.type === "context" || line.type === "note") {
      rows.push({ left: line, right: line });
      i++;
    } else {
      const dels: DiffLine[] = [];
      const adds: DiffLine[] = [];
      while (lines[i]?.type === "del") dels.push(lines[i++]);
      while (lines[i]?.type === "add") adds.push(lines[i++]);
      for (let k = 0; k < Math.max(dels.length, adds.length); k++) rows.push({ left: dels[k], right: adds[k] });
    }
  }
  return rows;
}
