import { cx } from "@/lib/cx";
import { formatElapsed, formatFullStamp, formatStamp, formatRunTime, formatStampRange, formatStampRangeWithRunTime } from "@/lib/time";
import { Elapsed } from "@/features/chat/status/Elapsed";
import type { ToolCall } from "@/features/chat/timeline/timelineItems";
import { callDuration, toolSpan } from "./toolTimes";

/** 実行中の印（回る印。時刻の前に置く） */
const RunningMark = () => <span className="spinner small" aria-label="実行中" />;

/**
 * ツールのまとまりの時刻（見出しの要約の後ろ）。実行中は「最初に始めた時刻 – 最後に始めた時刻」と回る印、
 * 終われば「最初に始めた時刻 – 最後に終わった時刻（実行時間 ◯分◯秒）」。今日なら時刻だけ、別の日なら日付も。乗せると年月日とかかった時間
 */
export function GroupTime({ tools, running }: { tools: ToolCall[]; running: boolean }) {
  const { start, latestStart, end } = toolSpan(tools);
  const title = running
    ? `開始 ${formatFullStamp(start)}\n最後に始めた処理 ${formatFullStamp(latestStart)}（実行中）`
    : `開始 ${formatFullStamp(start)}\n終了 ${formatFullStamp(end)}（実行時間 ${formatRunTime(Date.parse(end) - Date.parse(start))}）`;
  return (
    <span className={cx("tool-time", running && "running")} title={title}>
      {running && <RunningMark />}
      {running ? formatStampRange(start, latestStart) : formatStampRangeWithRunTime(start, end)}
    </span>
  );
}

/** ツールの呼び出し 1 件の時刻（行の右）: 始めた時刻 · かかった時間。実行中は回る印と、始めてからの経過時間 */
export function CallTime({ call, running }: { call: ToolCall; running: boolean }) {
  const start = call.use.created_at;
  const duration = callDuration(call);
  const title =
    duration !== undefined
      ? `開始 ${formatFullStamp(start)}\n終了 ${formatFullStamp(call.result!.created_at)}（${formatElapsed(duration)}）`
      : `開始 ${formatFullStamp(start)}${running ? "（実行中）" : "（結果は届いていません）"}`;
  return (
    <span className={cx("tool-time", running && "running")} title={title}>
      {running && <RunningMark />}
      {formatStamp(start)}
      {duration !== undefined && ` · ${formatElapsed(duration)}`}
      {duration === undefined && running && (
        <>
          {" · "}
          <Elapsed since={start} />
        </>
      )}
    </span>
  );
}
