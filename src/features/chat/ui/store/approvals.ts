// 回答待ちの依頼（ツールの承認・AI からの質問・再開の確かめ。すべてのプロジェクト）。
// アプリを開いたときに 1 回読み、届いた・答えたはサーバーの知らせで直す（チャットの状態は app/chatStatesContext.ts がこれから引く）
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

/** 回答待ちの依頼（届くまでは空） */
export const useApprovals = (): Approval[] => useStore(approvalsStore).data ?? NO_APPROVALS;
