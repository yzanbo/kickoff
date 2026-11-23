import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { ArrowDown, Clock, Search, TriangleAlert, WrapText } from "lucide-react";
import type { DockerCompose } from "@shared/docker/types";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { cx } from "@/foundation/ui/lib/cx";
import { storage } from "./storage";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { FindField, findCountText } from "@/foundation/ui/kit/FindField";
import { CloseButton, IconButton } from "@/foundation/ui/kit/IconButton";
import { registerPageFind } from "@/foundation/ui/kit/pageFind";
import { stripAnsi } from "@/foundation/ui/ansi/ansi";
import { DockerLogRow } from "./DockerLogRow";
import { chipOf, prettyJson, separatorText, type LogRow } from "./dockerLogView";
import { useDockerLogFind } from "./useDockerLogFind";
import { useDockerLogMenu } from "./useDockerLogMenu";
import { useDockerLogs } from "./useDockerLogs";
import { HUES, factsOf, useLogFilters, type DockerLogsRequest } from "./useLogFilters";
import { useLogFollow } from "./useLogFollow";

/**
 * Docker タブのログの画面（一覧の下）: compose 全体のログを時刻の順に並べ、サービスの札で絞り込む。いちばん下にいる間は流れ、上へ戻すと止まって
 * 「最新へ ↓（新しい行 n）」。いちばん上で「さらに前を読む」。⌘F・エラーと警告の印と絞り込み・時刻と折り返しの切り替え（覚える）・JSON の整え・
 * 選んだ行とエラーの行を文脈ごとチャットへ（useDockerLogMenu）
 */
export function DockerLogs({ projectId, compose, request, onClose }: { projectId: number; compose: DockerCompose; request: DockerLogsRequest; onClose: () => void }) {
  const logs = useDockerLogs(projectId, compose.key);
  const [showTime, setShowTime] = useSetting(storage.settings.logTimestamps);
  const [wrap, setWrap] = useSetting(storage.settings.logWrap);
  const [matchesOnly, setMatchesOnly] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const filters = useLogFilters(compose, logs, request);
  const { chips, isPicked, infos, labelOf, hueOf, containers, problemsOnly } = filters;
  const base = filters.rows;
  const textOf = useCallback((row: LogRow) => (row.kind === "line" ? stripAnsi(row.text) : separatorText(row, labelOf(row))), [labelOf]);
  const find = useDockerLogFind(base, textOf);
  const shown = useMemo(() => (find.open && matchesOnly && find.needle ? base.filter((r) => find.marks.has(r.id)) : base), [base, find.open, find.needle, find.marks, matchesOnly]);
  const multi = new Set(shown.map((r) => r.container)).size > 1 || containers.length > 1;

  const rootRef = useRef<HTMLElement>(null);
  const { bodyRef, following, newCount, toLatest, pause, onScroll: followScroll } = useLogFollow(logs, shown, { wrap, showTime });
  const menu = useDockerLogMenu({ projectId, compose, rows: shown, infos, labelOf, body: bodyRef });
  const onScroll = () => {
    followScroll();
    menu.handlers.onScroll();
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
  const indexOfShown = useEffectEvent((id: number) => shown.findIndex((r) => r.id === id));
  const pauseFollow = useEffectEvent(() => pause());
  useEffect(() => {
    if (!current) return;
    const index = indexOfShown(current.id);
    if (index < 0) return;
    pauseFollow();
    bodyRef.current?.querySelector(`[data-row="${index}"]`)?.scrollIntoView({ block: "center" });
  }, [find.index, current?.id, current?.nth]);

  const toggleJson = useCallback((id: number) => setExpanded((s) => new Set(s.has(id) ? [...s].filter((x) => x !== id) : [...s, id])), []);
  const canReadBefore = containers.length > 0 && logs.canReadBefore(containers);
  const title = filters.title;
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
      <div className="docker-logs-head bar">
        <span className="docker-logs-title">ログ: {title}</span>
        <span className="docker-log-chips">
          {chips.map((chip, i) => {
            const absent = !logs.sources.some((s) => chipOf(s) === chip);
            return (
              <button
                key={chip}
                type="button"
                className={cx("docker-log-chip pill", `docker-log-c${i % HUES}`, absent && "is-absent")}
                aria-pressed={isPicked(chip)}
                data-tip={absent ? "まだ起動していません（起動したら流れ始めます）" : "押すと出す・隠す"}
                onClick={() => filters.toggleChip(chip)}
              >
                {chip}
                {isPicked(chip) && " ✓"}
              </button>
            );
          })}
        </span>
        <span className="docker-logs-tools">
          <IconButton icon={TriangleAlert} label="エラー・警告だけ出す" aria-pressed={problemsOnly} active={problemsOnly} onClick={() => filters.setProblemsOnly((v) => !v)} />
          <IconButton icon={Clock} label="行の頭に時刻を出す" aria-pressed={showTime} active={showTime} onClick={() => setShowTime(!showTime)} />
          <IconButton icon={WrapText} label="長い行を折り返す" aria-pressed={wrap} active={wrap} onClick={() => setWrap(!wrap)} />
          <IconButton icon={Search} label="ログの中を探す" keys="⌘F" aria-pressed={find.open} active={find.open} onClick={() => (find.open ? find.close() : find.show())} />
          <CloseButton label="ログを閉じる" iconSize={15} onClick={onClose} />
        </span>
      </div>
      {find.open && (
        <div className="docker-logs-find bar">
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
          <button type="button" className="btn docker-logs-more" data-size="sm" disabled={logs.readingBefore} onClick={() => void logs.readBefore(containers)}>
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
        <button type="button" className="btn docker-logs-latest" data-size="sm" onClick={toLatest}>
          最新へ <ArrowDown size={12} aria-hidden />
          {newCount > 0 && `（新しい行 ${newCount}）`}
        </button>
      )}
      {menu.element}
    </section>
  );
}
