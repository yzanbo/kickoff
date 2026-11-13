import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Clock, Search, TriangleAlert, WrapText } from "lucide-react";
import type { DockerCompose } from "@shared/types";
import { useSetting } from "@/hooks/useSetting";
import { cx } from "@/lib/cx";
import { DOCKER_LOG_TIMESTAMPS, DOCKER_LOG_WRAP } from "@/lib/storageKeys";
import { ErrorText } from "@/ui/ErrorText";
import { FindField, findCountText } from "@/ui/FindField";
import { CloseButton, IconButton } from "@/ui/IconButton";
import { registerPageFind } from "@/ui/pageFind";
import { stripAnsi } from "./ansi";
import { DockerLogRow } from "./DockerLogRow";
import { chipOf, containerInfos, logChips, logLevelOf, prettyJson, separatorText, type LogLevel, type LogRow } from "./dockerLogView";
import { useDockerLogFind } from "./useDockerLogFind";
import { useDockerLogMenu } from "./useDockerLogMenu";
import { useDockerLogs } from "./useDockerLogs";

/** いちばん下を見ているとみなす、下端からの距離 */
const FOLLOW_SLACK_PX = 24;
/** サービスの色の数（CSS の .docker-log-c0〜） */
const HUES = 8;

/** 行ごとのエラー・警告と JSON か（行は作り直さないので、行ごとに 1 回だけ見分ける） */
const rowFacts = new WeakMap<LogRow, { level: LogLevel | null; json: boolean }>();
function factsOf(row: LogRow) {
  let facts = rowFacts.get(row);
  if (!facts) {
    facts = row.kind === "line" ? { level: logLevelOf(row.text), json: prettyJson(row.text) !== null } : { level: null, json: false };
    rowFacts.set(row, facts);
  }
  return facts;
}

/** 開いているログの画面（どの compose の、どの札で開いたか。nonce が変わったら札を選び直す） */
export interface DockerLogsRequest {
  compose: string;
  /** 付ける札（null = すべて） */
  chips: string[] | null;
  nonce: number;
}

/**
 * Docker タブのログの画面（一覧の下）: compose 全体のログを時刻の順に並べ、サービスの札で絞り込む。いちばん下にいる間は流れ、上へ戻すと止まって
 * 「最新へ ↓（新しい行 n）」。いちばん上で「さらに前を読む」。⌘F・エラーと警告の印と絞り込み・時刻と折り返しの切り替え（覚える）・JSON の整え・
 * 選んだ行とエラーの行を文脈ごとチャットへ（useDockerLogMenu）
 */
export function DockerLogs({ projectId, compose, request, onClose }: { projectId: number; compose: DockerCompose; request: DockerLogsRequest; onClose: () => void }) {
  const logs = useDockerLogs(projectId, compose.key);
  const [showTime, setShowTime] = useSetting(DOCKER_LOG_TIMESTAMPS);
  const [wrap, setWrap] = useSetting(DOCKER_LOG_WRAP);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [matchesOnly, setMatchesOnly] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const chips = useMemo(() => logChips(compose, logs.sources), [compose, logs.sources]);
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(request.chips && new Set(request.chips));
  useEffect(() => setPicked(request.chips && new Set(request.chips)), [request.nonce, request.chips]);
  const isPicked = useCallback((chip: string) => picked === null || picked.has(chip), [picked]);
  const infos = useMemo(() => containerInfos(compose, logs.sources), [compose, logs.sources]);
  const chipOfContainer = useMemo(() => new Map(logs.sources.map((s) => [s.container, chipOf(s)])), [logs.sources]);
  const labelOf = useCallback((row: LogRow) => infos.get(row.container)?.label ?? row.container.slice(0, 12), [infos]);
  const hueOf = useCallback((row: LogRow) => Math.max(0, chips.indexOf(chipOfContainer.get(row.container) ?? "")) % HUES, [chips, chipOfContainer]);

  // 札・エラーの絞り込みのあとの行
  const base = useMemo(
    () => logs.rows.filter((r) => isPicked(chipOfContainer.get(r.container) ?? "") && (!problemsOnly || r.kind !== "line" || factsOf(r).level !== null)),
    [logs.rows, isPicked, chipOfContainer, problemsOnly],
  );
  const textOf = useCallback((row: LogRow) => (row.kind === "line" ? stripAnsi(row.text) : separatorText(row, labelOf(row))), [labelOf]);
  const find = useDockerLogFind(base, textOf);
  const shown = useMemo(() => (find.open && matchesOnly && find.needle ? base.filter((r) => find.marks.has(r.id)) : base), [base, find.open, find.needle, find.marks, matchesOnly]);
  const containers = useMemo(() => logs.sources.filter((s) => isPicked(chipOf(s))).map((s) => s.container), [logs.sources, isPicked]);
  const multi = new Set(shown.map((r) => r.container)).size > 1 || containers.length > 1;

  // いちばん下にいる間は付いていく。上へ戻したら止めて、それまでに見た行の ID を覚える（新しい行の数）
  const bodyRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const menu = useDockerLogMenu({ projectId, compose, rows: shown, infos, labelOf, body: bodyRef });
  const [following, setFollowing] = useState(true);
  const seen = useRef({ id: 0, ts: "" });
  const onScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_SLACK_PX;
    if (bottom !== following) {
      setFollowing(bottom);
      logs.setHold(!bottom);
      if (!bottom) seen.current = { id: Math.max(0, ...logs.rows.map((r) => r.id)), ts: shown[shown.length - 1]?.ts ?? "" };
    }
    menu.handlers.onScroll();
  };
  useLayoutEffect(() => {
    if (following && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [shown, following, wrap, showTime]);
  // 新しい行 = 止めたあとに届いた、止めたときの最後の行より新しい行（さかのぼって読んだ行は数えない）
  const newCount = following ? 0 : shown.filter((r) => r.id > seen.current.id && r.ts >= seen.current.ts).length;
  const toLatest = () => {
    setFollowing(true);
    logs.setHold(false);
  };

  // ⌘F: ログの画面にピントがある・最後に押したのがログの画面なら、ログの中を探す
  const findInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    return registerPageFind(el, () => {
      find.show();
      requestAnimationFrame(() => findInput.current?.select());
    });
  }, [find.show]);
  useEffect(() => {
    if (find.open) findInput.current?.focus();
  }, [find.open]);
  // ↑↓ で移った一致を真ん中に（新しい行が届いても動かさない）
  const current = find.current;
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const { setHold } = logs;
  useEffect(() => {
    if (!current) return;
    const index = shownRef.current.findIndex((r) => r.id === current.id);
    if (index < 0) return;
    setFollowing(false);
    setHold(true);
    bodyRef.current?.querySelector(`[data-row="${index}"]`)?.scrollIntoView({ block: "center" });
  }, [find.index, current?.id, current?.nth, setHold]);

  const toggleJson = useCallback((id: number) => setExpanded((s) => new Set(s.has(id) ? [...s].filter((x) => x !== id) : [...s, id])), []);
  const canReadBefore = containers.length > 0 && logs.canReadBefore(containers);
  const title = picked === null || picked.size === chips.length ? "すべて" : [...picked].join("・") || "（札なし）";
  // 選んだ札のサービスがどれもまだ起動していない（何も作っていない compose を開いた）なら、起動したら流れ始めると添える
  const emptyText =
    !logs.connected && logs.rows.length === 0
      ? "読み込み中…"
      : containers.length > 0
        ? "ログはまだありません"
        : chips.some(isPicked)
          ? "まだ起動していません。起動したら流れ始めます"
          : "札を選ぶと、そのサービスのログが出ます";

  return (
    <section ref={rootRef} className="docker-logs" aria-label="ログ" tabIndex={-1}>
      <div className="docker-logs-head">
        <span className="docker-logs-title">ログ: {title}</span>
        <span className="docker-log-chips">
          {chips.map((chip, i) => {
            const absent = !logs.sources.some((s) => chipOf(s) === chip);
            return (
              <button
                key={chip}
                type="button"
                className={cx("docker-log-chip", `docker-log-c${i % HUES}`, absent && "is-absent")}
                aria-pressed={isPicked(chip)}
                data-tip={absent ? "まだ起動していません（起動したら流れ始めます）" : "押すと出す・隠す"}
                onClick={() => setPicked(new Set(chips.filter((c) => (c === chip ? !isPicked(c) : isPicked(c)))))}
              >
                {chip}
                {isPicked(chip) && " ✓"}
              </button>
            );
          })}
        </span>
        <span className="docker-logs-tools">
          <IconButton icon={TriangleAlert} label="エラー・警告だけ出す" aria-pressed={problemsOnly} className={cx(problemsOnly && "active")} onClick={() => setProblemsOnly((v) => !v)} />
          <IconButton icon={Clock} label="行の頭に時刻を出す" aria-pressed={showTime} className={cx(showTime && "active")} onClick={() => setShowTime(!showTime)} />
          <IconButton icon={WrapText} label="長い行を折り返す" aria-pressed={wrap} className={cx(wrap && "active")} onClick={() => setWrap(!wrap)} />
          <IconButton icon={Search} label="ログの中を探す" keys="⌘F" aria-pressed={find.open} className={cx(find.open && "active")} onClick={() => (find.open ? find.close() : find.show())} />
          <CloseButton label="ログを閉じる" size={15} onClick={onClose} />
        </span>
      </div>
      {find.open && (
        <div className="docker-logs-find">
          <FindField
            inputRef={findInput}
            value={find.query}
            onChange={find.setQuery}
            placeholder="ログの中を探す"
            invalid={find.invalid}
            options={find.options}
            onToggleOption={find.toggle}
            count={findCountText({ invalid: find.invalid, query: find.needle, total: find.matches.length, current: find.index })}
            canStep={find.matches.length > 0}
            onStep={find.step}
            onClose={() => (find.close(), rootRef.current?.focus())}
          />
          <label className="docker-logs-only small">
            <input type="checkbox" checked={matchesOnly} onChange={(e) => setMatchesOnly(e.target.checked)} /> 一致した行だけ
          </label>
        </div>
      )}
      <ErrorText message={logs.error ?? ""} />
      <div
        ref={bodyRef}
        className={cx("docker-logs-body", wrap ? "is-wrap" : "is-nowrap")}
        onScroll={onScroll}
        onMouseUp={menu.handlers.onMouseUp}
        onContextMenu={menu.handlers.onContextMenu}
        onKeyDown={menu.handlers.onKeyDown}
      >
        {canReadBefore && shown.length > 0 && (
          <button type="button" className="btn btn-sm docker-logs-more" disabled={logs.readingBefore} onClick={() => void logs.readBefore(containers)}>
            {logs.readingBefore ? "読み込み中…" : "さらに前を読む"}
          </button>
        )}
        {shown.length === 0 && <div className="docker-logs-empty muted small">{emptyText}</div>}
        {shown.map((row, index) => (
          <DockerLogRow
            key={row.id}
            row={row}
            index={index}
            label={labelOf(row)}
            hue={hueOf(row)}
            showLabel={multi}
            showTime={showTime}
            level={factsOf(row).level}
            json={factsOf(row).json}
            pretty={expanded.has(row.id) && row.kind === "line" ? prettyJson(row.text) : null}
            marks={find.marks.get(row.id)}
            current={current?.id === row.id ? current.nth : null}
            onToggleJson={toggleJson}
            onAsk={menu.ask}
          />
        ))}
      </div>
      {!following && (
        <button type="button" className="btn btn-sm docker-logs-latest" onClick={toLatest}>
          最新へ <ArrowDown size={12} aria-hidden />
          {newCount > 0 && `（新しい行 ${newCount}）`}
        </button>
      )}
      {menu.element}
    </section>
  );
}
