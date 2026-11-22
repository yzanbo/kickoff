import type { QueueState } from "@shared/chat/chatLive";
import { QUEUE_ACTION_LABELS, type QueuedMessage } from "@shared/chat/types";
import { queueActionOf } from "@shared/chat/queueActions";
import { relayOf } from "@shared/chat/prompts";

/** 案内の分かれ道に使うもの（busy: 作業中・readyForEdit: 次に送る指示を書き直していて送信の準備ができている・held: 起動したときの確かめで送信待ちを聞いている） */
interface HintInput {
  busy: boolean;
  readyForEdit?: boolean;
  held?: boolean;
}

/**
 * 送信待ちの見出しの短い案内（実行中はいつも 1 件なので数えない。件数は見出しだけに出し、ボタンでくり返さない）。
 * 畳んでいても、どこで止まるか（一時停止の位置）が分かるよう、短い文で出す
 */
export function queuedHint({ paused, stops }: Pick<QueueState, "paused" | "stops">, { busy, collapsed, readyForEdit = false, held = false }: HintInput & { collapsed: boolean }): string {
  const stopIndex = stops[0] ?? -1;
  // 詳しくは上の帯（RestartResumeBanner）に出すので、見出しは短く
  if (held) return "決めるまで送りません";
  if (readyForEdit) return "次の指示の送信準備ができています。書き直しを保存すると送ります";
  if (paused) return collapsed ? "止めています" : busy ? "終わっても送らずに止めておきます" : "止めています。行の「すぐ送る」で 1 件ずつ送れます";
  // 作業が終わり、1 件目の上の一時停止の線で待っている（止めておくにはしない。線を消す・動かすと続きを送る）
  if (!busy && stopIndex === 0) return collapsed ? "一時停止中" : "一時停止の線まで送りました。線を消すと続きを送ります";
  if (!busy) return collapsed ? "自動で送れませんでした" : "自動で送れませんでした。行の「すぐ送る」で送れます";
  if (stopIndex === 0) return collapsed ? "1 件目の前で一時停止" : "終わっても送らずに一時停止します（1 件目の上に一時停止）";
  if (stopIndex > 0) return collapsed ? `${stopIndex} 件目のあとで一時停止` : `終わったら ${stopIndex} 件目まで順に送り、そこで一時停止します`;
  return collapsed ? "" : "終わったら順に送ります";
}

/**
 * 案内が止める位置（作業中）か、線で待っていること（作業が終わって 1 件目の上の線）を伝えているか（queuedHint の印の分かれ道と同じ条件）。
 * 止める印と同じ色・同じアイコンで出す
 */
export function isStopHint({ paused, stops }: Pick<QueueState, "paused" | "stops">, { busy, readyForEdit = false, held = false }: HintInput): boolean {
  const stopIndex = stops[0] ?? -1;
  return !paused && (busy ? stopIndex >= 0 : stopIndex === 0) && !readyForEdit && !held;
}

/** 畳んだ 1 行に出す「次に送る指示」（初めの行。文がなく添付だけなら、その数） */
export function nextQueuedText(message: QueuedMessage | undefined): string {
  if (!message) return "";
  const action = queueActionOf(message);
  if (action) return QUEUE_ACTION_LABELS[action];
  // サブエージェントに「あとで」伝える指示は、前置きを隠して宛先と本文の初めの行
  const relay = relayOf(message.text);
  const line = (relay ? relay.text : message.text).trim().split("\n")[0]?.trim() ?? "";
  if (relay) return `伝える → ${relay.name}: ${line}`;
  if (line) return line;
  return message.attachments.length > 0 ? `添付 ${message.attachments.length} 件` : "";
}
