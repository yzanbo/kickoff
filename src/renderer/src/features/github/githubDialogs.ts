// GitHub の書き込みのダイアログ（新しい issue・マージ）を開く頼み。App と別ウィンドウに 1 つずつ置く GitHubDialogHost が描く
// （メモ・チャットの発言の右クリックの「issue にする」のように、GitHub タブの外からも開けるように）
import { useSyncExternalStore } from "react";
import type { GitHubPullDetail } from "@shared/types";

export type GitHubDialogRequest =
  /** 新しい issue（body は初めに入れておく本文。メモ・チャットの「issue にする」は選んだ文か全体） */
  | { kind: "new_issue"; projectId: number; body: string; onCreated?: (number: number) => void }
  /** PR のマージの確認（onMerged はマージできたとき） */
  | { kind: "merge"; projectId: number; detail: GitHubPullDetail; onMerged: () => void };

let current: GitHubDialogRequest | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const set = (next: GitHubDialogRequest | null) => {
  current = next;
  seq++;
  for (const l of listeners) l();
};

export const openNewIssue = (projectId: number, opts: { body?: string; onCreated?: (number: number) => void } = {}) =>
  set({ kind: "new_issue", projectId, body: opts.body ?? "", onCreated: opts.onCreated });
export const openMergeDialog = (projectId: number, detail: GitHubPullDetail, onMerged: () => void) => set({ kind: "merge", projectId, detail, onMerged });
export const closeGitHubDialog = () => set(null);

/** 開いているダイアログ（key は開くたびに変わる。開き直したときに中身を作り直す） */
export function useGitHubDialog(): { request: GitHubDialogRequest | null; key: number } {
  const request = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    () => current,
  );
  return { request, key: seq };
}
