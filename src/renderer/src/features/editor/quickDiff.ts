// 編集の部品の行番号の横に出す、Git との違いの帯（VS Code のガターの色の帯と同じ）。元の中身（ステージした中身。なければコミットの中身）と、いま書いている中身を行で比べる
import { lineDiff } from "@/lib/lineDiff";

/** 違いの 1 かたまり。start・end は、いまの中身の行（1 から。end を含む）。deleted は消した所の直前の行（先頭を消したら 0） */
export interface QuickDiffHunk {
  kind: "added" | "modified" | "deleted";
  start: number;
  end: number;
}

/** 改行を LF にそろえる（Windows の改行のファイルでも、行の中身だけで比べる） */
const lf = (text: string) => text.replace(/\r\n/g, "\n");

/** 元の中身 base と、いまの中身 current の違いを、いまの中身の行のかたまりで返す（並びは行の順。比べ方は lineDiff） */
export function quickDiff(base: string, current: string): QuickDiffHunk[] {
  if (base === current) return [];
  const hunks: QuickDiffHunk[] = [];
  // 同じ行の間の消した行・足した行の数から、かたまりの種類を決める
  let line = 0; // いまの中身で、ここまでに見た行の数
  let removed = 0;
  let added = 0;
  const flush = () => {
    if (added > 0) hunks.push({ kind: removed > 0 ? "modified" : "added", start: line - added + 1, end: line });
    else if (removed > 0) hunks.push({ kind: "deleted", start: line, end: line });
    removed = 0;
    added = 0;
  };
  for (const d of lineDiff(lf(base), lf(current))) {
    if (d.kind === "same") {
      flush();
      line++;
    } else if (d.kind === "del") removed++;
    else {
      added++;
      line++;
    }
  }
  flush();
  return hunks;
}
