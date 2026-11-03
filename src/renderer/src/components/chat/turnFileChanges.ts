// 1 回の作業（ターン）で変えたファイルの数え方（ターンの変更カード。純粋関数）
import type { RunEvent } from "../../../../core/types";

/** ターンで変えたファイル 1 つ */
export interface FileChange {
  /** 変えたファイル（ツールに渡された絶対パス） */
  path: string;
  /** 足した行・消した行（Edit / MultiEdit の置き換えから数える） */
  added: number;
  removed: number;
  /** Write で丸ごと書いた（created: 新しく作った / rewritten: 書き直した。書き直しは消した行が分からない） */
  write?: "created" | "rewritten";
}

/** 編集のツールの呼び出しと、その結果 */
export interface EditCall {
  use: RunEvent;
  result?: RunEvent;
}

const lines = (text: string) => (text === "" ? [] : text.replace(/\n$/, "").split("\n"));

/** 行ごとの比べ合わせの上限（これより大きい置き換えは、前後の同じ行を除いた残りを数えるだけにする） */
const MAX_CELLS = 1_000_000;

/** 置き換えの前後で、足した行と消した行（同じ行は数えない。最長共通部分列で比べる） */
export function lineDelta(before: string, after: string): { added: number; removed: number } {
  let a = lines(before);
  let b = lines(after);
  // 前と後ろの同じ行は外す（多くの置き換えはここで小さくなる）
  while (a.length && b.length && a[0] === b[0]) (a = a.slice(1)), (b = b.slice(1));
  while (a.length && b.length && a[a.length - 1] === b[b.length - 1]) (a = a.slice(0, -1)), (b = b.slice(0, -1));
  if (a.length * b.length > MAX_CELLS) return { added: b.length, removed: a.length };
  // 最長共通部分列の長さ（1 行分ずつの表で求める）
  let prev = new Array<number>(b.length + 1).fill(0);
  for (const line of a) {
    const row = new Array<number>(b.length + 1).fill(0);
    for (let j = 0; j < b.length; j++) row[j + 1] = line === b[j] ? prev[j] + 1 : Math.max(prev[j + 1], row[j]);
    prev = row;
  }
  const common = prev[b.length];
  return { added: b.length - common, removed: a.length - common };
}

type EditInput = {
  file_path?: string;
  notebook_path?: string;
  old_string?: string;
  new_string?: string;
  edits?: { old_string?: string; new_string?: string }[];
  content?: string;
  new_source?: string;
};

/**
 * ターンの編集のツールから、変えたファイルを最初に触った順に並べる（失敗した・結果がまだないものは数えない。
 * サブエージェントが変えたものも含める）
 */
export function changesOf(calls: EditCall[]): FileChange[] {
  const byPath = new Map<string, FileChange>();
  for (const { use, result } of calls) {
    if (!result || (result.data as { is_error?: boolean }).is_error) continue;
    const { name, input } = use.data as { name: string; input?: EditInput };
    const path = input?.file_path ?? input?.notebook_path;
    if (!path) continue;
    const change = byPath.get(path) ?? { path, added: 0, removed: 0 };
    byPath.set(path, change);
    const add = (d: { added: number; removed: number }) => {
      change.added += d.added;
      change.removed += d.removed;
    };
    if (name === "Edit") add(lineDelta(input?.old_string ?? "", input?.new_string ?? ""));
    else if (name === "MultiEdit") for (const edit of input?.edits ?? []) add(lineDelta(edit.old_string ?? "", edit.new_string ?? ""));
    else if (name === "NotebookEdit") add({ added: lines(input?.new_source ?? "").length, removed: 0 });
    else if (name === "Write") {
      const created = /created/i.test(String((result.data as { content?: unknown }).content ?? ""));
      // 前に Edit したファイルを書き直したら、それまでの数は意味がなくなるので書き直しにする
      change.write = created && !change.write ? "created" : "rewritten";
      change.added = lines(input?.content ?? "").length;
      change.removed = 0;
    }
  }
  return [...byPath.values()];
}
