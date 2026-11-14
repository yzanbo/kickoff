// kickoff-trash が出す印（「Kickoff のゴミ箱に入れました…: <元の場所> [kickoff-trash:<id>]」）の読み方。
// 会話の中のコマンドの出力から、ゴミ箱に入れたものを見つけて「戻す」を出す（画面とスマホで同じ読み方にする）

/** 出力の 1 行から見つけた、ゴミ箱に入れたもの */
export interface TrashMark {
  id: string;
  /** 元の場所（印の行の「: 」から「 [」まで） */
  origin: string;
}

const MARK = /^Kickoff のゴミ箱に入れました[^:]*: (.+) \[kickoff-trash:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]$/;

/** コマンドの出力から、ゴミ箱に入れたもの（出た順。同じ ID は 1 つ） */
export function trashMarksIn(output: string): TrashMark[] {
  const seen = new Set<string>();
  const marks: TrashMark[] = [];
  for (const line of output.split(/\r?\n/)) {
    const m = MARK.exec(line.trim());
    if (!m || seen.has(m[2])) continue;
    seen.add(m[2]);
    marks.push({ id: m[2], origin: m[1] });
  }
  return marks;
}
