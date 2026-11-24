// ログの画面の絞り込み: サービスの札（開いた札を選び直す）・エラーと警告だけ・行の名前と色。絞ったあとの行を返す
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DockerCompose, DockerLogSource } from "@shared/docker/types";
import { chipOf, containerInfos, logChips, logLevelOf, prettyJson, type LogLevel, type LogRow } from "./dockerLogView";

/** サービスの色の数（CSS の .docker-log-c0〜） */
export const HUES = 8;

/** 開いているログの画面（どの compose の、どの札で開いたか。nonce が変わったら札を選び直す） */
export interface DockerLogsRequest {
  compose: string;
  /** 付ける札（null = すべて） */
  chips: string[] | null;
  nonce: number;
}

/** 行ごとのエラー・警告と JSON か（行は作り直さないので、行ごとに 1 回だけ見分ける） */
const rowFacts = new WeakMap<LogRow, { level: LogLevel | null; json: boolean }>();
export function factsOf(row: LogRow) {
  let facts = rowFacts.get(row);
  if (!facts) {
    facts = row.kind === "line" ? { level: logLevelOf(row.text), json: prettyJson(row.text) !== null } : { level: null, json: false };
    rowFacts.set(row, facts);
  }
  return facts;
}

export function useLogFilters(compose: DockerCompose, logs: { sources: DockerLogSource[]; rows: LogRow[] }, request: DockerLogsRequest) {
  const [problemsOnly, setProblemsOnly] = useState(false);
  const chips = useMemo(() => logChips(compose, logs.sources), [compose, logs.sources]);
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(request.chips && new Set(request.chips));
  useEffect(() => setPicked(request.chips && new Set(request.chips)), [request.nonce, request.chips]);
  const isPicked = useCallback((chip: string) => picked === null || picked.has(chip), [picked]);
  const infos = useMemo(() => containerInfos(compose, logs.sources), [compose, logs.sources]);
  const chipOfContainer = useMemo(() => new Map(logs.sources.map((s) => [s.container, chipOf(s)])), [logs.sources]);
  const labelOf = useCallback((row: LogRow) => infos.get(row.container)?.label ?? row.container.slice(0, 12), [infos]);
  const hueOf = useCallback((row: LogRow) => Math.max(0, chips.indexOf(chipOfContainer.get(row.container) ?? "")) % HUES, [chips, chipOfContainer]);
  // 札・エラーの絞り込みのあとの行
  const rows = useMemo(
    () => logs.rows.filter((r) => isPicked(chipOfContainer.get(r.container) ?? "") && (!problemsOnly || r.kind !== "line" || factsOf(r).level !== null)),
    [logs.rows, isPicked, chipOfContainer, problemsOnly],
  );
  // 選んだ札のコンテナ（さかのぼって読む対象）
  const containers = useMemo(() => logs.sources.filter((s) => isPicked(chipOf(s))).map((s) => s.container), [logs.sources, isPicked]);
  /** 札を 1 つ出す・隠す */
  const toggleChip = (chip: string) => setPicked(new Set(chips.filter((c) => (c === chip ? !isPicked(c) : isPicked(c)))));
  const title = picked === null || picked.size === chips.length ? "すべて" : [...picked].join("・") || "（札なし）";
  return { chips, isPicked, toggleChip, title, infos, labelOf, hueOf, rows, containers, problemsOnly, setProblemsOnly };
}
