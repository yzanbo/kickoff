import type { QueuedMessage } from "../../../../core/types";

/**
 * 送信待ちの見出しの短い案内（実行中はいつも 1 件なので数えない。件数は見出しだけに出し、ボタンでくり返さない）。
 * 畳んでいても、どこで止まるか（「ここまで送ったら止めます」の印）が分かるよう、短い文で出す
 */
export function queuedHint({ paused, busy, collapsed, stopIndex }: { paused: boolean; busy: boolean; collapsed: boolean; stopIndex: number }): string {
  if (paused) return collapsed ? "止めています" : busy ? "終わっても送らずに止めておきます" : "止めています。行の「すぐ送る」で 1 件ずつ送れます";
  if (!busy) return collapsed ? "自動で送れませんでした" : "自動で送れませんでした。行の「すぐ送る」で送れます";
  if (stopIndex === 0) return collapsed ? "次は送らずに止めます" : "終わっても送らずに止めます（1 件目の上で止める印）";
  if (stopIndex > 0) return collapsed ? `${stopIndex} 件目のあとで止めます` : `終わったら ${stopIndex} 件目まで順に送り、そのあとは止めます`;
  return collapsed ? "" : "終わったら順に送ります";
}

/** 畳んだ 1 行に出す「次に送る指示」（初めの行。文がなく添付だけなら、その数） */
export function nextQueuedText(message: QueuedMessage | undefined): string {
  if (!message) return "";
  const line = message.text.trim().split("\n")[0]?.trim() ?? "";
  if (line) return line;
  return message.attachments.length > 0 ? `添付 ${message.attachments.length} 件` : "";
}
