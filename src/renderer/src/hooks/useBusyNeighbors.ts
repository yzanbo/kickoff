import { useEffect, useState } from "react";
import type { Run } from "../../../core/types";
import { api } from "../api";
import { BUSY_STATUSES } from "../components/RunStatus";
import { useServerEvent } from "../events";

/**
 * 同じ作業場所（本体・同じワークツリー）で作業中の、ほかのチャットの数。
 * 同じフォルダで同時に作業すると、ファイルがぶつかることがあるので知らせるのに使う
 */
export function useBusyNeighbors(run: Pick<Run, "id" | "project_id" | "worktree_path">): number {
  const [runs, setRuns] = useState<Map<number, Pick<Run, "id" | "status" | "worktree_path">>>(new Map());
  useEffect(() => {
    let alive = true;
    api.runs(run.project_id).then(
      (list) => alive && setRuns(new Map(list.map((r) => [r.id, r]))),
      () => undefined,
    );
    return () => {
      alive = false;
    };
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
