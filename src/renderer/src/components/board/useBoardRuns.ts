import { useEffect, useState } from "react";
import type { Run } from "../../../../core/types";
import { api } from "../../api";
import { errorMessage } from "../../errors";
import { useServerEvent } from "../../events";

/** ボードごとの直前のチャット（プロジェクトを切り替えたときに、すぐ出すため） */
const runsCache = new Map<string, Run[]>();

/**
 * カンバンに出すチャット。projectId がなければ全プロジェクト。
 * 一度開いたボードの内容は覚えておき、切り替えた最初の描画から出す（裏で読み直す。ちらつかないように）
 */
export function useBoardRuns(projectId: number | undefined, showArchived: boolean, onError: (message: string) => void) {
  const cacheKey = `${projectId ?? "all"}${showArchived ? ":archived" : ""}`;
  const fromCache = () => ({ key: cacheKey, runs: runsCache.get(cacheKey) ?? [], loaded: runsCache.has(cacheKey) });
  const [state, setState] = useState(fromCache);
  // 切り替えた直後（まだ前のボードの状態のとき）も、覚えている内容を最初の描画から使う
  const current = state.key === cacheKey ? state : fromCache();

  const setRuns = (update: Run[] | ((prev: Run[]) => Run[])) =>
    setState((prev) => {
      const base = prev.key === cacheKey ? prev.runs : (runsCache.get(cacheKey) ?? []);
      const next = typeof update === "function" ? update(base) : update;
      runsCache.set(cacheKey, next);
      return { key: cacheKey, runs: next, loaded: true };
    });

  useEffect(() => {
    let alive = true;
    setState(fromCache());
    (projectId === undefined ? api.allRuns({ archived: showArchived }) : api.runs(projectId, { archived: showArchived }))
      .then((list) => alive && setRuns(list))
      .catch((e: unknown) => alive && onError(errorMessage(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, showArchived]);

  useServerEvent((e) => {
    if (e.type === "run" && (projectId === undefined || e.run.project_id === projectId)) {
      setRuns((prev) => {
        const rest = prev.filter((r) => r.id !== e.run.id);
        // アーカイブしたチャットは、表示しているときだけ残す
        return e.run.archived_at && !showArchived ? rest : [e.run, ...rest];
      });
    } else if (e.type === "run_deleted") {
      setRuns((prev) => prev.filter((r) => r.id !== e.id));
    }
  });

  return { runs: current.runs, loaded: current.loaded, setRuns };
}
