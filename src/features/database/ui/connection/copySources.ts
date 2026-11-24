// ほかのプロジェクトの接続を写すダイアログの、写す元の一覧（React に依らない）

/** プロジェクトごとの接続（読めなかったら null） */
export interface CopySourceEntry<P, C> {
  project: P;
  connections: C[] | null;
}

/** 接続のあるプロジェクトの組と、接続の一覧を読めなかったプロジェクトの名前（読めなかったものを「接続がない」と見分けられるように） */
export function copySourcesOf<P extends { name: string }, C>(entries: readonly CopySourceEntry<P, C>[]): { groups: { project: P; connections: C[] }[]; failed: string[] } {
  return {
    groups: entries.flatMap((e) => (e.connections && e.connections.length > 0 ? [{ project: e.project, connections: e.connections }] : [])),
    failed: entries.filter((e) => e.connections === null).map((e) => e.project.name),
  };
}
