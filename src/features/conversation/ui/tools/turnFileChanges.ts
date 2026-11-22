// 1 回の作業（ターン）で変えたファイルの数え方（ターンの変更カード。純粋関数）
import type { ChatEventOf } from "@shared/chat/chatEvent";
import { editHunksOf } from "@shared/ai/claudeTools";
import { lineCounts, lineDiff } from "@/foundation/ui/lib/lineDiff";

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
  use: ChatEventOf<"tool_use">;
  result?: ChatEventOf<"tool_result">;
}

const lines = (text: string) => (text === "" ? [] : text.replace(/\n$/, "").split("\n"));

/** 置き換えの前後で、足した行と消した行（同じ行は数えない。最長共通部分列で比べる。lib/lineDiff） */
export function lineDelta(before: string, after: string): { added: number; removed: number } {
  return lineCounts(lineDiff(before, after));
}

/**
 * ターンの編集のツールから、変えたファイルを最初に触った順に並べる（失敗した・結果がまだないものは数えない。
 * サブエージェントが変えたものも含める）
 */
export function changesOf(calls: EditCall[]): FileChange[] {
  const byPath = new Map<string, FileChange>();
  for (const { use, result } of calls) {
    if (!result || result.data.is_error) continue;
    const edit = editHunksOf(use.data.name, (use.data.input ?? {}) as Record<string, unknown>);
    if (!edit) continue;
    const change = byPath.get(edit.path) ?? { path: edit.path, added: 0, removed: 0 };
    byPath.set(edit.path, change);
    if (edit.whole) {
      const created = /created/i.test(result.data.content);
      // 前に Edit したファイルを書き直したら、それまでの数は意味がなくなるので書き直しにする
      change.write = created && !change.write ? "created" : "rewritten";
      change.added = lines(edit.hunks[0]?.new_string ?? "").length;
      change.removed = 0;
    } else
      for (const hunk of edit.hunks) {
        const d = lineDelta(hunk.old_string, hunk.new_string);
        change.added += d.added;
        change.removed += d.removed;
      }
  }
  return [...byPath.values()];
}
