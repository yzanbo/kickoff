import type { QueuedMessage } from "@shared/types";

/**
 * 送信待ちの見出しの短い案内（実行中はいつも 1 件なので数えない。件数は見出しだけに出し、ボタンでくり返さない）。
 * 畳んでいても、どこで止まるか（一時停止の位置）が分かるよう、短い文で出す
 */
export function queuedHint({
  paused,
  busy,
  collapsed,
  stopIndex,
  readyForEdit = false,
}: {
  paused: boolean;
  busy: boolean;
  collapsed: boolean;
  stopIndex: number;
  /** 次に送る指示（1 件目）を書き直していて、作業は終わり、コアが書き直しが終わるのを待っている（送信の準備ができている） */
  readyForEdit?: boolean;
}): string {
  if (readyForEdit) return "次の指示の送信準備ができています。書き直しを保存すると送ります";
  if (paused) return collapsed ? "止めています" : busy ? "終わっても送らずに止めておきます" : "止めています。行の「すぐ送る」で 1 件ずつ送れます";
  if (!busy) return collapsed ? "自動で送れませんでした" : "自動で送れませんでした。行の「すぐ送る」で送れます";
  if (stopIndex === 0) return collapsed ? "1 件目の前で一時停止" : "終わっても送らずに一時停止します（1 件目の上に一時停止）";
  if (stopIndex > 0) return collapsed ? `${stopIndex} 件目のあとで一時停止` : `終わったら ${stopIndex} 件目まで順に送り、そこで一時停止します`;
  return collapsed ? "" : "終わったら順に送ります";
}

/** 畳んだ 1 行に出す「次に送る指示」（初めの行。文がなく添付だけなら、その数） */
export function nextQueuedText(message: QueuedMessage | undefined): string {
  if (!message) return "";
  const line = message.text.trim().split("\n")[0]?.trim() ?? "";
  if (line) return line;
  return message.attachments.length > 0 ? `添付 ${message.attachments.length} 件` : "";
}
