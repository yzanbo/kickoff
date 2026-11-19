// コアが起こした子プロセス（メインが覚えて、コアが落ちたときに止める）の決め方（Electron に依らない純粋関数）
import type { ChildProcessNote } from "@/foundation/core/system/childProcesses";
import type { ProcessRow } from "@/foundation/core/platform/types";

/** いま動いている子（pid → グループの頭か） */
export type CoreChildren = Map<number, { group: boolean }>;

/** 知らせを当てる（起こしたら足し、終わったら外す） */
export function applyChildNote(children: CoreChildren, note: ChildProcessNote): void {
  if (note.state === "started") children.set(note.pid, { group: note.group });
  else children.delete(note.pid);
}

/**
 * 止める相手: 覚えた子のうち、いまもあって、親が落ちたコア・DB ワーカー・launchd（引き取られた）のもの
 * （止める前にプロセスの表で確かめ、番号を使い回したほかのプロセスに送らない）。グループの頭はグループごと
 */
export function childrenToStop(children: CoreChildren, table: ReadonlyMap<number, ProcessRow>, parents: readonly number[]): { pid: number; group: boolean }[] {
  const allowed = new Set([1, ...parents]);
  return [...children]
    .filter(([pid]) => {
      const row = table.get(pid);
      return row !== undefined && allowed.has(row.ppid);
    })
    .map(([pid, { group }]) => ({ pid, group }));
}
