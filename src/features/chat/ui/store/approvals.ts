// 回答待ちの依頼（ツールの承認・AI からの質問・再開の確かめ。すべてのプロジェクト）の店。回答待ちはここだけを正にする
// （チャットの中身の店・一覧の印・チャットの見出しもここから引く）。起動したときに startApprovals で 1 回読み、届いた・答えたはサーバーの知らせで直す
import type { Approval } from "@shared/chat/approvalTypes";
import type { ReduceTable } from "@/foundation/ui/store";
import { api } from "@/foundation/ui/api";
import { createStore } from "@/foundation/ui/store/createStore";
import { useStore } from "@/foundation/ui/store/useStore";

const NO_APPROVALS: Approval[] = Object.freeze([]) as unknown as Approval[];

/** 知らせで一覧を直す（同じ依頼は 1 つだけ。関係なければ同じ一覧） */
const reduceApprovals: ReduceTable<Approval[]> = {
  approval: (list, event) => [...list.filter((a) => a.id !== event.approval.id), event.approval],
  approval_resolved: (list, event) => (list.some((a) => a.id === event.id) ? list.filter((a) => a.id !== event.id) : list),
};

const approvalsStore = createStore<Approval[]>({ load: () => api.approvals(), reduce: reduceApprovals });

/** 読み始め、読む部品の有無に関係なく知らせで直し続ける（起動のときに app/renderer/main.tsx が 1 回。別ウィンドウも同じ。返した関数でやめる） */
export const startApprovals = (): (() => void) => approvalsStore.retain();

/** 回答待ちの一覧が変わったら呼ぶ（チャットの店が見せ直すため。返した関数でやめる） */
export const subscribeApprovals = (listener: () => void): (() => void) => approvalsStore.subscribe(listener);

/** 回答待ちの依頼（届くまでは空） */
export const useApprovals = (): Approval[] => useStore(approvalsStore).data ?? NO_APPROVALS;

/** チャットごとに分けた回答待ち（一覧が変わったら作り直す。中身の同じチャットは前の配列のまま） */
let grouped: { list: Approval[]; byChat: Map<number, Approval[]> } | null = null;

/** そのチャットの回答待ち（届いた順。中身が同じなら同じ配列） */
export function approvalsOf(chatId: number): Approval[] {
  const list = approvalsStore.get().data ?? NO_APPROVALS;
  if (grouped?.list !== list) grouped = { list, byChat: groupByChat(list, grouped?.byChat) };
  return grouped.byChat.get(chatId) ?? NO_APPROVALS;
}

/** チャットごとに分ける（前と同じ依頼が同じ順に並ぶチャットは、前の配列を使う） */
export function groupByChat(list: readonly Approval[], prev?: ReadonlyMap<number, Approval[]>): Map<number, Approval[]> {
  const byChat = new Map<number, Approval[]>();
  for (const a of list) byChat.set(a.chat_id, [...(byChat.get(a.chat_id) ?? []), a]);
  for (const [chatId, next] of byChat) {
    const before = prev?.get(chatId);
    if (before && before.length === next.length && before.every((a, i) => a === next[i])) byChat.set(chatId, before);
  }
  return byChat;
}
