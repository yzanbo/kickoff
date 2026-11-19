import type { DiagnosticsOverview, StallDigest } from "@shared/ipc";
import { formatDayTime } from "@/lib/time";

// 設定の「診断」に出す、いつも取っている記録のまとめの文。1〜3 行にする

/** 短い長さ（1 秒未満は ms、それより長ければ小数 1 桁の秒） */
export function formatShortMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}秒`;
}

const stallText = (who: string, s: StallDigest, now: Date) => `${who} ${formatShortMs(s.blockedMs)}${s.task ? ` ${s.task}` : ""}（${formatDayTime(s.at, now)}）`;

/** 詰まりの件数・いちばん長かったもの（メインプロセスとコアのプロセス）・最後の起動の時刻の行 */
export function overviewLines(overview: DiagnosticsOverview, now = new Date()): string[] {
  const { stalls, lastBoot } = overview;
  const lines = [stalls.count > 0 ? `最近 24 時間の詰まり: ${stalls.count} 件` : "最近 24 時間の詰まり: なし"];
  const longest = [
    stalls.longest.main && stallText("メインプロセス", stalls.longest.main, now),
    stalls.longest.core && stallText("コアのプロセス", stalls.longest.core, now),
  ].filter((t): t is string => Boolean(t));
  if (longest.length > 0) lines.push(`いちばん長かったもの: ${longest.join("・")}`);
  if (!lastBoot) {
    lines.push("最後の起動: 記録なし");
  } else {
    const paint = `最初の描画 ${lastBoot.firstPaintMs === null ? "-" : formatShortMs(lastBoot.firstPaintMs)}`;
    const ready = lastBoot.timedOut ? "入力できるまで 10 秒でそろわず" : `入力できるまで ${lastBoot.interactiveMs === null ? "-" : formatShortMs(lastBoot.interactiveMs)}`;
    lines.push(`最後の起動: ${formatDayTime(lastBoot.startedAt, now)}（${paint}・${ready}）`);
  }
  return lines;
}
