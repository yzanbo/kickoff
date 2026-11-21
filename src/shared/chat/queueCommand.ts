// 送信待ち・預かりを変える命令（QueueCommand）と、その純粋な当て方 applyQueueCommand。コアが API の操作をこれに通す（画面とスマホも読める）
import { queueActionOf } from "./queueActions";
import { addAction, clearLater, editRow, mergeLater, moveMany, moveOne, removeRows, setPaused, setStopAfter, setStops, type Outbox, type OutboxEnv } from "./outbox";
import { QUEUE_ACTION_LABELS, type Attachment, type QueueAction } from "./types";

/** 送信待ち（later）と預かり（now）を変える命令。行は ID で指す */
export type QueueCommand =
  | { op: "add_action"; action: QueueAction; after: string | null }
  /** now・later のどちらにある ID でもよい（1 つも見つからなければ 404） */
  | { op: "remove"; ids: string[] }
  /** 文と添付を書き換える（attachments を省けば添付はそのまま） */
  | { op: "edit"; id: string; text: string; attachments?: Attachment[] }
  /** index は 1 件を移したあとの位置（見つからなければ 404）。ほかは並びを保ってまとめて移す */
  | { op: "move"; ids: string[]; to: "top" | "bottom" | { before: string | null; below_stop?: boolean } | { index: number } }
  | { op: "merge"; ids: string[] }
  | { op: "set_stops"; stops: number[] }
  | { op: "stop_after"; id: string | null; stop: boolean }
  | { op: "set_paused"; paused: boolean }
  | { op: "clear" };

/** 命令を当てられないとき（状態コードと理由。箱は変えない） */
export type QueueReject = { reject: 400 | 404 | 409; message: string };

/** 送信待ちにない行を指したとき（消した・送ったあと） */
const MISSING: QueueReject = { reject: 404, message: "待ちの指示が見つかりません" };
const invalid = (message: string): QueueReject => ({ reject: 400, message });

export function isQueueReject(result: Outbox | QueueReject): result is QueueReject {
  return "reject" in result;
}

/** 命令を当てた箱（当てられなければ理由。変えるものがなければ同じ箱） */
export function applyQueueCommand(box: Outbox, cmd: QueueCommand, env: OutboxEnv): Outbox | QueueReject {
  switch (cmd.op) {
    case "add_action":
      return addAction(box, cmd.action, cmd.after, env) ?? MISSING;
    case "remove": {
      const next = removeRows(box, cmd.ids);
      return next === box ? MISSING : next;
    }
    case "edit":
      return edit(box, cmd.id, cmd.text, cmd.attachments);
    case "move": {
      const { to } = cmd;
      if (typeof to === "object" && "index" in to) return moveOne(box, cmd.ids[0] ?? "", to.index) ?? MISSING;
      return moveMany(box, cmd.ids, typeof to === "object" ? { before: to.before, belowStop: to.below_stop } : to);
    }
    case "merge": {
      const picked = box.later.filter((m) => cmd.ids.includes(m.id) && !queueActionOf(m));
      return picked.length >= 2 ? mergeLater(box, cmd.ids)!.box : invalid("まとめるには、送信待ちの指示を 2 件以上選んでください");
    }
    case "set_stops":
      return setStops(box, cmd.stops);
    case "stop_after":
      return setStopAfter(box, cmd.id, cmd.stop) ?? MISSING;
    case "set_paused":
      return setPaused(box, cmd.paused);
    case "clear":
      return clearLater(box);
  }
}

/**
 * 行を書き直す（文は前後の空白を除く）。送信待ちの圧縮・消去の行と、預かりの圧縮後指示は書き直せない（400）。文も添付もなくなるなら 400。
 * 送信待ちにも預かりにもなければ 404（預かりの行は、もう伝えた）
 */
function edit(box: Outbox, id: string, text: string, attachments?: Attachment[]): Outbox | QueueReject {
  const later = box.later.find((m) => m.id === id);
  const row = later ?? box.now.find((m) => m.id === id);
  if (!row) return MISSING;
  const action = later ? queueActionOf(later) : null;
  if (action) return invalid(`「${QUEUE_ACTION_LABELS[action]}」の行は書き直せません`);
  if (!later && row.post_compact) return invalid("圧縮後指示は書き直せません（設定の圧縮後指示を直してください）");
  const nextAttachments = attachments ?? row.attachments;
  if (!text.trim() && nextAttachments.length === 0) return invalid("メッセージか添付ファイルが必要です");
  return editRow(box, id, text.trim(), nextAttachments);
}
