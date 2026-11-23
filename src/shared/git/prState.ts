// PR の状態の名前を 1 つにする（作業場所の帯の PR の札・PR の知らせの印・GitHub タブの印が同じ名前を読む。帯の札を持つ worktrees が github より下なので、ブランチの PR の型 PullRequestInfo と同じ git に置く。純粋。テストは prState.test.ts）

/** PR の状態（下書きは開いている PR のうちのもの。マージ済み・閉じたものは下書きでも閉じた側） */
export const PR_STATES = ["open", "draft", "merged", "closed"] as const;
export type PrState = (typeof PR_STATES)[number];
export const PR_STATE_LABELS: Record<PrState, string> = { open: "開いている", draft: "下書き", merged: "マージ済み", closed: "閉じた" };

/** gh・GitHub の状態（大文字・小文字どちらでも）と下書きかから、PR の状態を決める */
export function prStateOf(state: string, isDraft: boolean): PrState {
  const s = state.toLowerCase();
  if (s === "merged") return "merged";
  if (s === "closed") return "closed";
  return isDraft ? "draft" : "open";
}
