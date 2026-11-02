import { useEffect, useState } from "react";
import type { Run } from "../../../core/types";
import { api } from "../api";
import { BUSY_STATUSES } from "../components/RunStatus";
import { useServerEvent } from "../events";
import { useActionError } from "./useActionError";

/**
 * 同じ作業場所（本体・同じワークツリー）で作業中の、ほかのチャットの数。
 * 同じフォルダで同時に作業すると、ファイルがぶつかることがあるので知らせるのに使う
 */
export function useBusyNeighbors(run: Pick<Run, "id" | "project_id" | "worktree_path">): number {
  const [runs, setRuns] = useState<Map<number, Pick<Run, "id" | "status" | "worktree_path">>>(new Map());
  // 取れなくても知らせを出さないだけなので、失敗は記録するにとどめる
  const { guard } = useActionError();
  useEffect(() => {
    let alive = true;
    void guard(async () => {
      const list = await api.runs(run.project_id);
      if (alive) setRuns(new Map(list.map((r) => [r.id, r])));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.project_id]);
  useServerEvent((e) => {
    if (e.type === "run" && e.run.project_id === run.project_id) setRuns((prev) => new Map(prev).set(e.run.id, e.run));
  });
  let count = 0;
  for (const other of runs.values()) {
    if (other.id !== run.id && other.worktree_path === run.worktree_path && BUSY_STATUSES.includes(other.status)) count++;
  }
  return count;
}
