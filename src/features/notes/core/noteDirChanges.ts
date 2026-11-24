// プロジェクトのノートのフォルダの場所が変わった（プロジェクトの note_dir・設定のノートの親フォルダ・共通のノートのフォルダ）ら、
// そのプロジェクトの notes（path は null）を知らせる。同じパスのノートが別のファイルになる（か、なくなる）ので、開いている文書は
// 外で書き換えられた・消されたときと同じく読み直す（書きかけがなければ新しい場所の中身・あれば conflict・なければ「見つからない」）
import type { BusEvent } from "@shared/foundation/contract";
import type { Project } from "@shared/projects/types";

/** 場所が変わったプロジェクト（前に知らなかったプロジェクト = 作った・戻した・フォルダを決めたばかりのものは数えない） */
export function changedNoteDirs(previous: ReadonlyMap<number, string>, next: ReadonlyMap<number, string>): number[] {
  return [...next].filter(([id, dir]) => previous.has(id) && previous.get(id) !== dir).map(([id]) => id);
}

/**
 * プロジェクトの行・設定の知らせのたびに、いまのフォルダと前に見たフォルダを比べる（場所はこの 2 つからしか変わらない）。
 * 共通のノートの付け替えは設定の保存のあとに行が変わるので、行の知らせで拾う。やめるときは返り値を呼ぶ
 */
export function followNoteDirChanges(d: {
  subscribe(listener: (event: BusEvent) => void): () => void;
  list(): Project[];
  dirOf(project: Project): string;
  publish(event: { type: "notes"; project_id: number; path: null }): void;
}): () => void {
  // フォルダをまだ決めていないプロジェクトは数えない（ノートがまだなく、名前を変えると決めるはずのフォルダ名も変わるため）
  const snapshot = () => new Map(d.list().filter((p) => p.note_dir || p.note_folder).map((p) => [p.id, d.dirOf(p)]));
  let known = snapshot();
  return d.subscribe((event) => {
    if (event.type !== "project" && event.type !== "settings") return;
    const next = snapshot();
    const changed = changedNoteDirs(known, next);
    known = next;
    for (const id of changed) d.publish({ type: "notes", project_id: id, path: null });
  });
}
