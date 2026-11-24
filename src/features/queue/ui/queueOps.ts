// 送信待ちの行・選んだもの・別のチャットで聞くの操作（行のボタンと右クリックのメニューで共通。どれも口 c の命令 1 つ）
import type { QueueAction, QueuedMessage } from "@shared/chat/types";
import { isQueueAction } from "@shared/chat/queueActions";
import { confirm } from "@/foundation/ui/kit/ask";
import type { QueueController } from "./queueController";
import type { QueueActions } from "./queueContext";

/** 送信待ちの 1 行への操作 */
export interface QueuedRowActions {
  edit: () => void;
  /** この指示のすぐあとの一時停止を付ける・外す */
  toggleStop: () => void;
  /** この指示のすぐ前の一時停止を付ける・外す */
  toggleStopBefore: () => void;
  /** この指示のすぐあとに挟む行（会話の圧縮・コンテキストの消去）を足す */
  actionAfter: (action: QueueAction) => void;
  move: (to: number) => void;
  sendNow: () => void;
  remove: () => void;
}

/** 選んだもの全体への操作（右クリックのメニュー） */
export interface QueuedGroupActions {
  edit: () => void;
  sendTogether: () => void;
  merge: () => void;
  moveTo: (to: "top" | "bottom") => void;
  remove: () => void;
}

/** 送信待ちの指示を別のチャットで聞く操作（remove なら送信待ちから外す = 移す）。どちらも出せないところでは undefined */
export interface AskHandlers {
  newChat?: (remove: boolean) => void;
  /** inherit: このチャットの会話を引き継ぐ / 新しく始める */
  child?: (remove: boolean, inherit: boolean) => void;
}

/** 行 i（指示 m）への操作。stopBefore・stopAfter はその前・あとに印の線があるか */
export function rowActionsOf(q: QueueActions, m: QueuedMessage, i: number, stopBefore: boolean, stopAfter: boolean): QueuedRowActions {
  const { c, view } = q;
  return {
    edit: () => q.edit.start([m]),
    toggleStop: () => void c.run({ op: "stop_after", id: m.id, stop: !stopAfter }),
    // 指示のすぐ前（位置 i）の印を付け外しする（1 件目の上にも置ける）
    toggleStopBefore: () => void c.run({ op: "set_stops", stops: stopBefore ? view.stops.filter((x) => x !== i) : [...view.stops, i].sort((a, b) => a - b) }),
    actionAfter: (action) => void c.run({ op: "add_action", action, after: m.id }).then((ok) => ok && q.open()),
    move: (to) => void c.run({ op: "move", ids: [m.id], to: { index: to } }),
    sendNow: () => void c.send({ mode: "now", ids: [m.id] }),
    remove: () => void c.run({ op: "remove", ids: [m.id] }),
  };
}

/** 選んだもの全体への操作（済んだら選ぶのをやめる） */
export function groupActionsOf(q: QueueActions): QueuedGroupActions {
  const { c, selection } = q;
  const { selected, clearSelection } = selection;
  const done = (ok: boolean) => void (ok && clearSelection());
  return {
    edit: () => editSelected(q),
    sendTogether: () => void c.send({ mode: "all", ids: selected }).then(done),
    merge: () => void c.run({ op: "merge", ids: selected }).then(done),
    moveTo: (to) => void c.run({ op: "move", ids: selected, to }),
    remove: () => removeSelected(c, selected, clearSelection),
  };
}

/** 選んだ指示の書き直す欄をまとめて開き、選ぶのをやめる */
export function editSelected(q: QueueActions): void {
  q.edit.start(q.view.messages.filter((m) => q.selection.selected.includes(m.id)));
  q.selection.clearSelection();
}

/** 選んだ指示を消す（見出しのボタン・行の右クリックのどちらからも確かめてから。消せたら done） */
export function removeSelected(c: QueueController, selected: string[], done: () => void): void {
  const n = selected.length;
  void confirm({ title: `選んだ ${n} 件を消しますか？`, message: "消した指示は送られません。元に戻せません。", confirmLabel: "消す", danger: true }).then(async (ok) => {
    if (ok && (await c.run({ op: "remove", ids: selected }))) done();
  });
}

/**
 * 行 id から別のチャットで聞く操作（選んでいる行なら選んだものすべて）。挟む行（会話の圧縮・コンテキストの消去）は持っていかない（送信待ちに残す）。
 * どちらも出せないところでは undefined
 */
export function askHandlersOf(q: QueueActions, id: string): AskHandlers | undefined {
  const { newChat, child } = q.ask;
  if (!newChat && !child) return undefined;
  const withAsked = (run: (ids: string[]) => void) => {
    const { selected, clearSelection } = q.selection;
    const ids = selected.includes(id) && selected.length > 1 ? selected : [id];
    const asked = ids.filter((x) => {
      const m = q.view.messages.find((r) => r.id === x);
      return m && !isQueueAction(m);
    });
    if (asked.length > 0) run(asked);
    clearSelection();
  };
  return {
    newChat: newChat && ((remove) => withAsked((ids) => newChat(ids, remove))),
    child: child && ((remove, inherit) => withAsked((ids) => child(ids, remove, inherit))),
  };
}
