import { useCallback, useEffect, useRef, useState } from "react";
import type { DockerLogEvent, DockerLogLine, DockerLogSource } from "@shared/types";
import { errorMessage } from "@shared/errors";
import { api } from "@/api";
import { fillTs, LOG_ROW_LIMIT, mergeRows, normTs, type LogRow } from "./dockerLogView";

/** さかのぼるとき 1 回に読む行の数（コアの DOCKER_LOG_TAIL と同じ。これより少なければ、もう前はない） */
const BEFORE_LINES = 500;
/** 読み返している（いちばん下にいない）間に、捨てずに持ってよい行の数 */
const HOLD_LIMIT = LOG_ROW_LIMIT * 2;

/**
 * ログの画面の流れ（compose 1 つ。コアの SSE `GET …/docker/logs`）: コンテナ（sources）と、時刻の順に並べた行（区切りの行も）を持つ。
 * 届いた行は 1 フレームの分をまとめて足す。持つのは 1 万行までで、古い行から捨てる（読み返している間 hold は捨てずに 2 万行まで）。
 * つなぎ直したら（コアが作り直した・眠りから戻った）、コアが最新の 500 行から送り直すので、持っている行を捨てる
 */
export function useDockerLogs(projectId: number, composeKey: string) {
  const [sources, setSources] = useState<DockerLogSource[]>([]);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [readingBefore, setReadingBefore] = useState(false);
  const rowsRef = useRef<LogRow[]>([]);
  const pending = useRef<LogRow[]>([]);
  const frame = useRef(0);
  const nextId = useRef(1);
  const hold = useRef(false);
  /** これより前はもうないと分かったコンテナ */
  const exhausted = useRef(new Set<string>());

  const commit = useCallback((added: LogRow[], limit: number) => {
    const merged = mergeRows(rowsRef.current, added, limit);
    for (const r of merged.dropped) exhausted.current.delete(r.container);
    rowsRef.current = merged.rows;
    setRows(merged.rows);
  }, []);

  const flush = useCallback(() => {
    frame.current = 0;
    const added = pending.current;
    pending.current = [];
    commit(added, hold.current ? Math.min(HOLD_LIMIT, Math.max(LOG_ROW_LIMIT, rowsRef.current.length + added.length)) : LOG_ROW_LIMIT);
  }, [commit]);

  const enqueue = useCallback(
    (added: LogRow[]) => {
      pending.current.push(...added);
      frame.current ||= requestAnimationFrame(flush);
    },
    [flush],
  );

  const toRows = useCallback((container: string, lines: DockerLogLine[]): LogRow[] => {
    const before = rowsRef.current.findLast((r) => r.container === container)?.ts ?? "";
    return fillTs(lines, before).map((l) => ({ id: nextId.current++, kind: "line", container, ts: l.ts, text: l.text }));
  }, []);

  useEffect(() => {
    const reset = () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
      pending.current = [];
      rowsRef.current = [];
      exhausted.current.clear();
      setRows([]);
      setError(null);
    };
    reset();
    setSources([]);
    let opens = 0;
    const source = new EventSource(api.dockerLogsUrl(projectId, composeKey));
    source.onopen = () => {
      if (opens++ > 0) reset();
      setConnected(true);
    };
    source.onerror = () => setConnected(false);
    source.onmessage = (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as DockerLogEvent;
      if (event.type === "sources") setSources(event.sources);
      else if (event.type === "lines") enqueue(toRows(event.container, event.lines));
      else if (event.type === "error") setError(event.message);
      else if (event.type === "stopped") enqueue([{ id: nextId.current++, kind: "stopped", container: event.container, ts: normTs(event.at), exit_code: event.exit_code }]);
      else enqueue([{ id: nextId.current++, kind: "started", container: event.container, ts: normTs(event.at) }]);
    };
    return () => {
      source.close();
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [projectId, composeKey, enqueue, toRows]);

  /** さらに前を読めるコンテナ（まだ前がありそうなもの） */
  const canReadBefore = useCallback((containers: string[]) => containers.some((c) => !exhausted.current.has(c)), []);

  /** 「さらに前を読む」: 渡したコンテナごとに、持っているいちばん古い行より前の 500 行 */
  const readBefore = useCallback(
    async (containers: string[]) => {
      setReadingBefore(true);
      try {
        const added: LogRow[] = [];
        await Promise.all(
          containers
            .filter((c) => !exhausted.current.has(c))
            .map(async (container) => {
              const until = rowsRef.current.find((r) => r.container === container && r.kind === "line")?.ts ?? rowsRef.current[0]?.ts;
              if (!until) return exhausted.current.add(container);
              const { lines } = await api.dockerLogsBefore(projectId, composeKey, container, until);
              if (lines.length < BEFORE_LINES) exhausted.current.add(container);
              added.push(...fillTs(lines, until).map((l): LogRow => ({ id: nextId.current++, kind: "line", container, ts: l.ts, text: l.text })));
            }),
        );
        commit(added, Math.min(HOLD_LIMIT, Math.max(LOG_ROW_LIMIT, rowsRef.current.length + added.length)));
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setReadingBefore(false);
      }
    },
    [projectId, composeKey, commit],
  );

  /** 読み返している間（いちばん下にいない）は、古い行を捨てない */
  const setHold = useCallback((value: boolean) => {
    hold.current = value;
  }, []);

  return { sources, rows, error, connected, readingBefore, canReadBefore, readBefore, setHold };
}
